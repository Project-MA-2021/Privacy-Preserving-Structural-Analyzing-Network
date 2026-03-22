from __future__ import annotations

import os
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List
from uuid import uuid4

import requests
from flask import Flask, request
from flask_cors import CORS
from phe import paillier

from shared_contract.crypto import (
    build_public_key,
    serialize_encrypted_number,
)
from shared_contract.http import err, ok

SERVER2_URL = os.getenv("SERVER2_URL", "http://127.0.0.1:5002")
DEFAULT_MAX_ITER = 8

app = Flask(__name__)
CORS(app)


@dataclass
class TaskState:
    id: str
    graph: Dict[str, Any]
    max_iter: int = DEFAULT_MAX_ITER
    t: int = 0
    initialized: bool = False
    public_key: Dict[str, str] | None = None
    last_accepted_h: float | None = None
    observed_h_history: List[float] = field(default_factory=list)
    accepted_h_history: List[float] = field(default_factory=list)
    c_history: List[int] = field(default_factory=list)
    timeline: List[Dict[str, Any]] = field(default_factory=list)
    status: str = "ready"


TASKS: Dict[str, TaskState] = {}


def _now_iso() -> str:
    return datetime.utcnow().isoformat() + "Z"


def _get_body() -> Dict[str, Any]:
    return request.get_json(silent=True) or {}


def _log(task: TaskState, step: int, actor: str, message: str, payload: Dict[str, Any] | None = None):
    task.timeline.append(
        {
            "t": task.t,
            "step": step,
            "actor": actor,
            "message": message,
            "payload": payload or {},
            "ts": _now_iso(),
        }
    )


def _default_graph() -> Dict[str, Any]:
    return {
        "nodes": [{"id": "A"}, {"id": "B"}, {"id": "C"}, {"id": "D"}],
        "edges": [
            {"id": "e1", "source": "A", "target": "B", "sign": 1},
            {"id": "e2", "source": "A", "target": "C", "sign": -1},
            {"id": "e3", "source": "B", "target": "C", "sign": 1},
            {"id": "e4", "source": "C", "target": "D", "sign": -1},
        ],
    }


def _keygen_from_server2() -> Dict[str, str]:
    r = requests.post(f"{SERVER2_URL}/api/v1/crypto/keygen", json={"n_length": 512}, timeout=10)
    r.raise_for_status()
    body = r.json()
    if not body.get("ok"):
        raise RuntimeError(f"server2 keygen failed: {body}")
    return body["data"]["public_key"]


def _decrypt_score_on_server2(cipher_payload: Dict[str, Any]) -> float:
    r = requests.post(
        f"{SERVER2_URL}/api/v1/crypto/decrypt-score",
        json={"cipher": cipher_payload},
        timeout=10,
    )
    r.raise_for_status()
    body = r.json()
    if not body.get("ok"):
        raise RuntimeError(f"server2 decrypt failed: {body}")
    return float(body["data"]["score"])


def _compare_on_server2(prev_score: float | None, new_score: float) -> int:
    r = requests.post(
        f"{SERVER2_URL}/api/v1/crypto/compare",
        json={"prev_score": prev_score, "new_score": new_score},
        timeout=10,
    )
    r.raise_for_status()
    body = r.json()
    if not body.get("ok"):
        raise RuntimeError(f"server2 compare failed: {body}")
    return int(body["data"]["c_t"])


def _compute_mock_global_h(task: TaskState) -> float:
    """Generate a deterministic demo score, then run real Paillier encryption/decryption."""
    graph = task.graph
    nodes = graph.get("nodes", [])
    edges = graph.get("edges", [])
    node_count = max(1, len(nodes))

    # Simple deterministic candidate score for the prototype.
    base = max(2, len(edges))
    jitter = ((hash(task.id) + task.t + 1) % 3) - 1
    candidate_h = float(max(0, base - (task.t + 1) + jitter))

    # Paper uses sum(H_ij) / 2, so here we encrypt a doubled score for demonstration.
    doubled_score = int(candidate_h * 2)
    local_scores = [0 for _ in range(node_count)]
    for idx in range(doubled_score):
        local_scores[idx % node_count] += 1

    if task.public_key is None:
        task.public_key = _keygen_from_server2()

    public_key = build_public_key(task.public_key)
    encrypted_items = [public_key.encrypt(value) for value in local_scores]
    encrypted_sum = encrypted_items[0]
    for item in encrypted_items[1:]:
        encrypted_sum += item

    cipher_payload = serialize_encrypted_number(encrypted_sum)
    decrypted_sum = _decrypt_score_on_server2(cipher_payload)
    return decrypted_sum / 2.0


def _to_state(task: TaskState) -> Dict[str, Any]:
    return {
        "id": task.id,
        "status": task.status,
        "t": task.t,
        "max_iter": task.max_iter,
        "initialized": task.initialized,
        "last_accepted_h": task.last_accepted_h,
        "observed_h_history": task.observed_h_history,
        "accepted_h_history": task.accepted_h_history,
        "c_history": task.c_history,
    }


@app.get("/api/v1/health")
def health():
    return ok({"service": "server1", "tasks": len(TASKS)})


@app.post("/api/v1/tasks")
def create_task():
    body = _get_body()
    graph = body.get("graph")
    if graph is None:
        graph = _default_graph()
    max_iter = int(body.get("max_iter", DEFAULT_MAX_ITER))
    if max_iter <= 0:
        return err("INVALID_MAX_ITER", "max_iter must be > 0")

    task_id = uuid4().hex[:12]
    task = TaskState(id=task_id, graph=graph, max_iter=max_iter)
    try:
        task.public_key = _keygen_from_server2()
    except Exception as ex:
        return err("SERVER2_UNAVAILABLE", f"failed to initialize keypair via server2: {ex}", 503)

    TASKS[task_id] = task
    return ok({"task": _to_state(task)})


@app.post("/api/v1/tasks/<task_id>/iterate")
def iterate_task(task_id: str):
    task = TASKS.get(task_id)
    if task is None:
        return err("TASK_NOT_FOUND", f"task '{task_id}' not found", 404)
    if task.status == "done":
        return err("TASK_DONE", "task already finished", 409)

    try:
        if not task.initialized:
            _log(task, 1, "Individuals", "R() anonymization prepared and uploaded to server1")
            task.initialized = True

        _log(task, 2, "Server1", "generated a candidate clustering S_t")
        _log(task, 3, "Individuals", "computed H_t and disturbed to H_hat_t via F()")
        _log(task, 4, "Individuals", "encrypted local values via E() and uploaded ciphertext")

        h_t = _compute_mock_global_h(task)
        _log(task, 5, "Server1", "aggregated encrypted scores by additive homomorphism")
        _log(task, 6, "Server2", "decrypted global score h_t", {"h_t": h_t})

        c_t = _compare_on_server2(task.last_accepted_h, h_t)
        _log(task, 7, "Server2", "returned update decision c_t", {"c_t": c_t})

        task.observed_h_history.append(h_t)
        task.c_history.append(c_t)
        if c_t == 1:
            task.last_accepted_h = h_t
        task.accepted_h_history.append(task.last_accepted_h if task.last_accepted_h is not None else h_t)

        task.t += 1
        if task.t >= task.max_iter:
            task.status = "done"
            _log(task, 8, "Server1", "terminated: reached max_iter")
        else:
            task.status = "running"

    except Exception as ex:
        return err("ITERATE_FAILED", f"iteration failed: {ex}", 500)

    return ok({"task": _to_state(task)})


@app.get("/api/v1/tasks/<task_id>/state")
def get_state(task_id: str):
    task = TASKS.get(task_id)
    if task is None:
        return err("TASK_NOT_FOUND", f"task '{task_id}' not found", 404)
    return ok({"task": _to_state(task)})


@app.get("/api/v1/tasks/<task_id>/timeline")
def get_timeline(task_id: str):
    task = TASKS.get(task_id)
    if task is None:
        return err("TASK_NOT_FOUND", f"task '{task_id}' not found", 404)
    return ok({"task_id": task.id, "timeline": task.timeline})


@app.post("/api/v1/tasks/<task_id>/reset")
def reset_task(task_id: str):
    task = TASKS.get(task_id)
    if task is None:
        return err("TASK_NOT_FOUND", f"task '{task_id}' not found", 404)
    task.t = 0
    task.initialized = False
    task.last_accepted_h = None
    task.observed_h_history = []
    task.accepted_h_history = []
    task.c_history = []
    task.timeline = []
    task.status = "ready"
    return ok({"task": _to_state(task)})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, debug=True)


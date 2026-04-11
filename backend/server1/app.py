from __future__ import annotations

import os
import random
import time
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Tuple
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
DEFAULT_RB = 0.25

app = Flask(__name__)
CORS(app)


@dataclass
class TaskState:
    id: str
    graph: Dict[str, Any]
    max_iter: int = DEFAULT_MAX_ITER
    rb: float = DEFAULT_RB
    t: int = 0
    initialized: bool = False
    public_key: Dict[str, str] | None = None
    anonymized_graph: Dict[str, Any] | None = None
    current_labels: Dict[str, int] = field(default_factory=dict)
    current_h_real: float | None = None
    last_accepted_h: float | None = None
    observed_h_history: List[float] = field(default_factory=list)
    accepted_h_history: List[float] = field(default_factory=list)
    c_history: List[int] = field(default_factory=list)
    round_metrics: List[Dict[str, Any]] = field(default_factory=list)
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


def _edge_key(a: str, b: str) -> str:
    return f"{a}__{b}" if a < b else f"{b}__{a}"


def _normalize_graph(graph: Dict[str, Any]) -> Dict[str, Any]:
    raw_nodes = graph.get("nodes", [])
    raw_edges = graph.get("edges", [])

    node_ids: List[str] = []
    nodes: List[Dict[str, str]] = []
    seen_nodes: set[str] = set()
    for n in raw_nodes:
        nid = str(n.get("id", "")).strip()
        if not nid or nid in seen_nodes:
            continue
        seen_nodes.add(nid)
        node_ids.append(nid)
        nodes.append({"id": nid})

    valid_nodes = set(node_ids)
    edges: List[Dict[str, Any]] = []
    seen_edges: set[str] = set()
    eid = 1
    for e in raw_edges:
        source = str(e.get("source", "")).strip()
        target = str(e.get("target", "")).strip()
        if not source or not target or source == target:
            continue
        if source not in valid_nodes or target not in valid_nodes:
            continue
        key = _edge_key(source, target)
        if key in seen_edges:
            continue
        seen_edges.add(key)
        sign_raw = e.get("sign", 1)
        sign = 1 if int(sign_raw) >= 0 else -1
        edge_id = str(e.get("id", f"e{eid}"))
        eid += 1
        edges.append(
            {
                "id": edge_id,
                "source": source,
                "target": target,
                "sign": sign,
            }
        )
    return {"nodes": nodes, "edges": edges}


def _build_neighbors(graph: Dict[str, Any]) -> Dict[str, set[str]]:
    neighbors: Dict[str, set[str]] = {str(n["id"]): set() for n in graph.get("nodes", [])}
    for e in graph.get("edges", []):
        a = str(e["source"])
        b = str(e["target"])
        neighbors.setdefault(a, set()).add(b)
        neighbors.setdefault(b, set()).add(a)
    return neighbors


def _build_sign_map(graph: Dict[str, Any]) -> Dict[str, int]:
    signs: Dict[str, int] = {}
    for e in graph.get("edges", []):
        key = _edge_key(str(e["source"]), str(e["target"]))
        signs[key] = 1 if int(e.get("sign", 1)) >= 0 else -1
    return signs


def _compute_unbalanced_edges(graph: Dict[str, Any], labels: Dict[str, int]) -> Tuple[int, List[str]]:
    unbalanced_keys: List[str] = []
    for e in graph.get("edges", []):
        a = str(e["source"])
        b = str(e["target"])
        sign = 1 if int(e.get("sign", 1)) >= 0 else -1
        same_cluster = labels.get(a, -1) == labels.get(b, -1)
        is_unbalanced = (sign == 1 and not same_cluster) or (sign == -1 and same_cluster)
        if is_unbalanced:
            unbalanced_keys.append(_edge_key(a, b))
    return len(unbalanced_keys), unbalanced_keys


def _build_initial_labels(graph: Dict[str, Any]) -> Dict[str, int]:
    return {str(n["id"]): idx for idx, n in enumerate(graph.get("nodes", []))}


def _generate_anonymized_graph(real_graph: Dict[str, Any], rb: float, seed: int) -> Dict[str, Any]:
    rng = random.Random(seed)
    nodes = [{"id": str(n["id"])} for n in real_graph.get("nodes", [])]
    node_ids = [str(n["id"]) for n in nodes]
    edges = [dict(e) for e in real_graph.get("edges", [])]
    existing_keys = {_edge_key(str(e["source"]), str(e["target"])) for e in edges}

    total_real = len(edges)
    target_spurious = max(1, int(total_real * rb)) if total_real > 0 else 0
    spurious_count = 0
    guard = 0
    eid = len(edges) + 1
    while spurious_count < target_spurious and guard < target_spurious * 50 + 100:
        guard += 1
        if len(node_ids) < 2:
            break
        a = rng.choice(node_ids)
        b = rng.choice(node_ids)
        if a == b:
            continue
        key = _edge_key(a, b)
        if key in existing_keys:
            continue
        existing_keys.add(key)
        edges.append(
            {
                "id": f"sp_e{eid}",
                "source": a,
                "target": b,
                "sign": 1 if rng.random() < 0.5 else -1,
                "spurious": True,
            }
        )
        eid += 1
        spurious_count += 1
    return {"nodes": nodes, "edges": edges}


def _build_candidate_labels(task: TaskState) -> Dict[str, int]:
    if task.anonymized_graph is None:
        return dict(task.current_labels)

    neighbors = _build_neighbors(task.anonymized_graph)
    labels = dict(task.current_labels)
    nodes = sorted(labels.keys())
    for node in nodes:
        candidate_clusters = {labels[node]}
        for nbr in neighbors.get(node, set()):
            if nbr in labels:
                candidate_clusters.add(labels[nbr])

        best_cluster = labels[node]
        best_h, _ = _compute_unbalanced_edges(task.graph, labels)
        for cluster in sorted(candidate_clusters):
            if cluster == labels[node]:
                continue
            temp = dict(labels)
            temp[node] = cluster
            h_val, _ = _compute_unbalanced_edges(task.graph, temp)
            if h_val < best_h:
                best_h = h_val
                best_cluster = cluster
        labels[node] = best_cluster
    return labels


def _disturb_balance_states(
    task: TaskState, candidate_labels: Dict[str, int]
) -> Tuple[Dict[str, int], Dict[str, int], int]:
    if task.anonymized_graph is None:
        return {}, {}, 0

    real_count, _ = _compute_unbalanced_edges(task.graph, candidate_labels)
    real_sign_map = _build_sign_map(task.graph)
    real_h_map: Dict[str, int] = {}
    for e in task.graph.get("edges", []):
        key = _edge_key(str(e["source"]), str(e["target"]))
        sign = real_sign_map.get(key, 1)
        same = candidate_labels.get(str(e["source"]), -1) == candidate_labels.get(str(e["target"]), -1)
        real_h_map[key] = 1 if (sign == 1 and not same) or (sign == -1 and same) else 0

    anon_edges = task.anonymized_graph.get("edges", [])
    anon_keys = [_edge_key(str(e["source"]), str(e["target"])) for e in anon_edges]
    if not anon_keys:
        return real_h_map, {}, real_count

    disturbed: Dict[str, int] = {k: 0 for k in anon_keys}
    ones = min(real_count, len(anon_keys))
    rng = random.Random((hash(task.id) & 0xFFFFFFFF) ^ (task.t + 1))
    for k in rng.sample(anon_keys, k=ones):
        disturbed[k] = 1

    return real_h_map, disturbed, real_count


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


def _compute_encrypted_global_h(task: TaskState, disturbed_h_map: Dict[str, int]) -> float:
    if task.anonymized_graph is None:
        return 0.0

    node_ids = [str(n["id"]) for n in task.graph.get("nodes", [])]
    node_local_counts = {nid: 0 for nid in node_ids}
    for e in task.anonymized_graph.get("edges", []):
        a = str(e["source"])
        b = str(e["target"])
        key = _edge_key(a, b)
        h_val = disturbed_h_map.get(key, 0)
        if h_val <= 0:
            continue
        if a in node_local_counts:
            node_local_counts[a] += h_val
        if b in node_local_counts:
            node_local_counts[b] += h_val

    local_scores = [node_local_counts[nid] for nid in node_ids]
    if not local_scores:
        local_scores = [0]
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
    node_count = len(task.graph.get("nodes", []))
    real_edge_count = len(task.graph.get("edges", []))
    anon_edge_count = len(task.anonymized_graph.get("edges", [])) if task.anonymized_graph else 0
    return {
        "id": task.id,
        "status": task.status,
        "t": task.t,
        "max_iter": task.max_iter,
        "rb": task.rb,
        "initialized": task.initialized,
        "node_count": node_count,
        "real_edge_count": real_edge_count,
        "anon_edge_count": anon_edge_count,
        "last_accepted_h": task.last_accepted_h,
        "current_h_real": task.current_h_real,
        "current_labels": task.current_labels,
        "observed_h_history": task.observed_h_history,
        "accepted_h_history": task.accepted_h_history,
        "c_history": task.c_history,
        "round_count": len(task.round_metrics),
    }


def _to_export_payload(task: TaskState) -> Dict[str, Any]:
    node_count = len(task.graph.get("nodes", []))
    real_edge_count = len(task.graph.get("edges", []))
    anon_edge_count = len(task.anonymized_graph.get("edges", [])) if task.anonymized_graph else 0
    return {
        "task_id": task.id,
        "summary": {
            "status": task.status,
            "t": task.t,
            "max_iter": task.max_iter,
            "rb": task.rb,
            "node_count": node_count,
            "real_edge_count": real_edge_count,
            "anon_edge_count": anon_edge_count,
            "round_count": len(task.round_metrics),
        },
        "rows": task.round_metrics,
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
    normalized_graph = _normalize_graph(graph)
    if len(normalized_graph.get("nodes", [])) < 2:
        return err("INVALID_GRAPH", "graph must include at least 2 nodes")

    max_iter = int(body.get("max_iter", DEFAULT_MAX_ITER))
    if max_iter <= 0:
        return err("INVALID_MAX_ITER", "max_iter must be > 0")
    rb = float(body.get("rb", DEFAULT_RB))
    if rb < 0 or rb > 1:
        return err("INVALID_RB", "rb must be between 0 and 1")

    task_id = uuid4().hex[:12]
    task = TaskState(
        id=task_id,
        graph=normalized_graph,
        max_iter=max_iter,
        rb=rb,
        current_labels=_build_initial_labels(normalized_graph),
    )
    task.current_h_real = float(_compute_unbalanced_edges(task.graph, task.current_labels)[0])

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
        iter_started = time.perf_counter()
        if not task.initialized:
            seed = (hash(task.id) & 0xFFFFFFFF) ^ 0x9E3779B9
            task.anonymized_graph = _generate_anonymized_graph(task.graph, task.rb, seed)
            _log(
                task,
                1,
                "Individuals",
                "R() anonymization prepared and uploaded to server1",
                {
                    "real_edges": len(task.graph.get("edges", [])),
                    "anon_edges": len(task.anonymized_graph.get("edges", [])),
                },
            )
            task.initialized = True

        candidate_labels = _build_candidate_labels(task)
        cand_h_real, _ = _compute_unbalanced_edges(task.graph, candidate_labels)
        _log(
            task,
            2,
            "Server1",
            "generated a candidate clustering S_t",
            {
                "candidate_h_real": cand_h_real,
                "candidate_labels": candidate_labels,
            },
        )

        real_h_map, disturbed_h_map, real_unbalanced_count = _disturb_balance_states(task, candidate_labels)
        disturbed_unbalanced_count = sum(disturbed_h_map.values())
        _log(
            task,
            3,
            "Individuals",
            "computed H_t and disturbed to H_hat_t via F()",
            {
                "real_unbalanced": real_unbalanced_count,
                "disturbed_unbalanced": disturbed_unbalanced_count,
                "real_h_edges": len(real_h_map),
            },
        )

        _log(task, 4, "Individuals", "encrypted local values via E() and uploaded ciphertext")

        h_t = _compute_encrypted_global_h(task, disturbed_h_map)
        _log(
            task,
            5,
            "Server1",
            "aggregated encrypted scores by additive homomorphism",
            {"encrypted_target_h": h_t},
        )
        _log(task, 6, "Server2", "decrypted global score h_t", {"h_t": h_t})

        c_t = _compare_on_server2(task.last_accepted_h, h_t)

        task.observed_h_history.append(h_t)
        task.c_history.append(c_t)
        if c_t == 1:
            task.last_accepted_h = h_t
            task.current_labels = candidate_labels
            task.current_h_real = float(cand_h_real)
        accepted_h = task.last_accepted_h if task.last_accepted_h is not None else h_t
        task.accepted_h_history.append(accepted_h)
        _log(
            task,
            7,
            "Server2",
            "returned update decision c_t",
            {
                "c_t": c_t,
                "accepted_h": accepted_h,
                "accepted_labels": task.current_labels,
            },
        )

        task.round_metrics.append(
            {
                "round": task.t + 1,
                "t_before_commit": task.t,
                "h_t": float(h_t),
                "c_t": int(c_t),
                "accepted_h": float(accepted_h),
                "candidate_h_real": float(cand_h_real),
                "current_h_real": float(task.current_h_real) if task.current_h_real is not None else None,
                "real_unbalanced": int(real_unbalanced_count),
                "disturbed_unbalanced": int(disturbed_unbalanced_count),
                "node_count": len(task.graph.get("nodes", [])),
                "real_edge_count": len(task.graph.get("edges", [])),
                "anon_edge_count": len(task.anonymized_graph.get("edges", [])) if task.anonymized_graph else 0,
                "iter_ms": round((time.perf_counter() - iter_started) * 1000.0, 3),
                "ts": _now_iso(),
            }
        )

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


@app.get("/api/v1/tasks/<task_id>/export")
def get_export(task_id: str):
    task = TASKS.get(task_id)
    if task is None:
        return err("TASK_NOT_FOUND", f"task '{task_id}' not found", 404)
    return ok(_to_export_payload(task))


@app.post("/api/v1/tasks/<task_id>/reset")
def reset_task(task_id: str):
    task = TASKS.get(task_id)
    if task is None:
        return err("TASK_NOT_FOUND", f"task '{task_id}' not found", 404)
    task.t = 0
    task.initialized = False
    task.last_accepted_h = None
    task.current_h_real = float(_compute_unbalanced_edges(task.graph, task.current_labels)[0])
    task.anonymized_graph = None
    task.observed_h_history = []
    task.accepted_h_history = []
    task.c_history = []
    task.round_metrics = []
    task.timeline = []
    task.status = "ready"
    return ok({"task": _to_state(task)})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, debug=False, use_reloader=False)

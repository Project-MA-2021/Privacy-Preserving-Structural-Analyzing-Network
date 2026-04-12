from __future__ import annotations

import math
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
STRICT_ARGMIN_WITH_SERVER2 = os.getenv("STRICT_ARGMIN_WITH_SERVER2", "1") != "0"

app = Flask(__name__)
CORS(app)


@dataclass
class TaskState:
    id: str
    graph: Dict[str, Any]
    input_graph: Dict[str, Any] | None = None
    max_iter: int = DEFAULT_MAX_ITER
    rb: float = DEFAULT_RB
    outlier_filter_enabled: bool = True
    outlier_filter_report: Dict[str, Any] = field(default_factory=dict)
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


def _build_adj_with_sign(graph: Dict[str, Any]) -> Dict[str, List[Tuple[str, int]]]:
    adj: Dict[str, List[Tuple[str, int]]] = {str(n["id"]): [] for n in graph.get("nodes", [])}
    for e in graph.get("edges", []):
        a = str(e["source"])
        b = str(e["target"])
        sign = 1 if int(e.get("sign", 1)) >= 0 else -1
        adj.setdefault(a, []).append((b, sign))
        adj.setdefault(b, []).append((a, sign))
    return adj


def _filter_graph_outliers(
    graph: Dict[str, Any],
    enabled: bool,
    max_remove_ratio: float = 0.28,
    min_nodes_to_apply: int = 36,
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    nodes = [{"id": str(n["id"])} for n in graph.get("nodes", [])]
    edges = [dict(e) for e in graph.get("edges", [])]
    before_nodes = len(nodes)
    before_edges = len(edges)

    report: Dict[str, Any] = {
        "enabled": bool(enabled),
        "applied": False,
        "before_nodes": before_nodes,
        "before_edges": before_edges,
        "after_nodes": before_nodes,
        "after_edges": before_edges,
        "removed_nodes": 0,
        "removed_edges": 0,
        "max_remove_ratio": float(max_remove_ratio),
        "min_nodes_to_apply": int(min_nodes_to_apply),
        "reason": "",
    }

    if not enabled:
        report["reason"] = "disabled_by_request"
        return {"nodes": nodes, "edges": edges}, report

    if before_nodes < max(2, min_nodes_to_apply):
        report["reason"] = "graph_too_small"
        return {"nodes": nodes, "edges": edges}, report

    adj = _build_adj_with_sign({"nodes": nodes, "edges": edges})
    degree: Dict[str, int] = {nid: len(neis) for nid, neis in adj.items()}
    node_ids = [str(n["id"]) for n in nodes]

    isolated: List[str] = [nid for nid in node_ids if degree.get(nid, 0) == 0]
    leaf_candidates: List[Tuple[float, str]] = []
    for nid in node_ids:
        if degree.get(nid, 0) != 1:
            continue
        nbr, sign = adj.get(nid, [("", 1)])[0]
        nbr_degree = degree.get(nbr, 0)
        # Higher neighbor degree indicates a hub-spoke peripheral point.
        # Slightly prefer removing positive leaf first to preserve conflict structure.
        leaf_score = float(nbr_degree * 10 + (0 if sign < 0 else 1))
        leaf_candidates.append((leaf_score, nid))

    max_remove = max(1, int(before_nodes * max(0.0, min(0.9, max_remove_ratio))))
    selected: set[str] = set()
    for nid in isolated:
        selected.add(nid)
        if len(selected) >= max_remove:
            break

    if len(selected) < max_remove:
        for _, nid in sorted(leaf_candidates, key=lambda x: (-x[0], x[1])):
            if nid in selected:
                continue
            selected.add(nid)
            if len(selected) >= max_remove:
                break

    if not selected:
        report["reason"] = "no_outlier_candidates"
        return {"nodes": nodes, "edges": edges}, report

    # Safety: keep at least 2 nodes and at least ~62% of original nodes.
    min_keep_nodes = max(2, int(math.ceil(before_nodes * 0.62)))
    if before_nodes - len(selected) < min_keep_nodes:
        over = min_keep_nodes - (before_nodes - len(selected))
        # remove less important selected nodes (leaf nodes first)
        ordered_selected = sorted(
            selected,
            key=lambda nid: (
                degree.get(nid, 99),  # keep non-isolated removal lower priority
                -(degree.get(adj.get(nid, [("", 0)])[0][0], 0) if degree.get(nid, 0) == 1 else 0),
                nid,
            ),
        )
        for nid in ordered_selected:
            if over <= 0:
                break
            selected.remove(nid)
            over -= 1

    if before_nodes - len(selected) < 2:
        report["reason"] = "too_aggressive_after_guard"
        return {"nodes": nodes, "edges": edges}, report

    selected_ids = set(selected)
    kept_nodes = [n for n in nodes if str(n["id"]) not in selected_ids]
    kept_node_ids = {str(n["id"]) for n in kept_nodes}
    kept_edges = [
        e
        for e in edges
        if str(e.get("source", "")) in kept_node_ids and str(e.get("target", "")) in kept_node_ids
    ]

    # If all edges are removed, do not apply the filter.
    if before_edges > 0 and not kept_edges:
        report["reason"] = "would_drop_all_edges"
        return {"nodes": nodes, "edges": edges}, report

    report.update(
        {
            "applied": True,
            "after_nodes": len(kept_nodes),
            "after_edges": len(kept_edges),
            "removed_nodes": before_nodes - len(kept_nodes),
            "removed_edges": before_edges - len(kept_edges),
            "isolated_candidates": len(isolated),
            "leaf_candidates": len(leaf_candidates),
            "reason": "applied",
        }
    )
    return {"nodes": kept_nodes, "edges": kept_edges}, report


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


def _is_unbalanced(sign: int, same_cluster: bool) -> bool:
    return (sign >= 0 and not same_cluster) or (sign < 0 and same_cluster)


def _build_signed_adjacency(graph: Dict[str, Any]) -> Dict[str, List[Tuple[str, int]]]:
    adjacency: Dict[str, List[Tuple[str, int]]] = {str(n["id"]): [] for n in graph.get("nodes", [])}
    for e in graph.get("edges", []):
        a = str(e["source"])
        b = str(e["target"])
        sign = 1 if int(e.get("sign", 1)) >= 0 else -1
        adjacency.setdefault(a, []).append((b, sign))
        adjacency.setdefault(b, []).append((a, sign))
    return adjacency


def _node_local_unbalanced_count(
    adjacency: Dict[str, List[Tuple[str, int]]],
    labels: Dict[str, int],
    node: str,
    candidate_cluster: int,
) -> int:
    local_unbalanced = 0
    for neighbor, sign in adjacency.get(node, []):
        neighbor_cluster = labels.get(neighbor, -1)
        same_cluster = candidate_cluster == neighbor_cluster
        if _is_unbalanced(sign, same_cluster):
            local_unbalanced += 1
    return local_unbalanced


def _cluster_boundary_unbalanced_count(
    graph: Dict[str, Any],
    labels: Dict[str, int],
    cluster_nodes: set[str],
    candidate_cluster: int,
) -> int:
    local_unbalanced = 0
    for e in graph.get("edges", []):
        a = str(e["source"])
        b = str(e["target"])
        a_in = a in cluster_nodes
        b_in = b in cluster_nodes

        if a_in == b_in:
            # Both endpoints inside the super node (constant during move), or both outside.
            continue

        sign = 1 if int(e.get("sign", 1)) >= 0 else -1
        ca = candidate_cluster if a_in else labels.get(a, -1)
        cb = candidate_cluster if b_in else labels.get(b, -1)
        same_cluster = ca == cb
        if _is_unbalanced(sign, same_cluster):
            local_unbalanced += 1
    return local_unbalanced


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


def _build_candidate_labels(task: TaskState) -> Tuple[Dict[str, int], Dict[str, Any]]:
    if task.anonymized_graph is None:
        return dict(task.current_labels), {"algorithm": "HM-Louvain (strict)", "note": "anonymized graph missing"}

    labels = dict(task.current_labels)
    if not labels:
        return labels, {"algorithm": "HM-Louvain (strict)", "note": "empty label set"}

    work_graph = task.anonymized_graph
    adjacency = _build_signed_adjacency(work_graph)
    nodes = sorted(labels.keys())
    q = max(2, len(nodes))

    # Algorithm 1 says both inner loops run "until labels are not changed".
    # Keep a safety cap to avoid infinite oscillation on pathological inputs.
    pass_cap = max(8, int(math.ceil(math.log2(q))) + 6)

    clusters_before = len(set(labels.values()))

    node_passes = 0
    node_moves = 0
    node_evaluations = 0
    node_server2_select_calls = 0
    node_server2_select_success = 0
    node_converged = False
    while node_passes < pass_cap:
        node_passes += 1
        changed_this_pass = False

        for node in nodes:
            current_cluster = labels[node]
            neighbor_clusters = {labels[nbr] for nbr, _ in adjacency.get(node, []) if nbr in labels}
            candidate_clusters = [current_cluster] + [x for x in sorted(neighbor_clusters) if x != current_cluster]

            candidate_scores: List[float] = []
            for cluster in candidate_clusters:
                node_evaluations += 1
                local_val = _node_local_unbalanced_count(adjacency, labels, node, cluster)
                candidate_scores.append(float(local_val))

            node_server2_select_calls += 1
            selected_idx, delegated = _select_min_index(candidate_scores)
            if delegated:
                node_server2_select_success += 1
            if selected_idx < 0 or selected_idx >= len(candidate_clusters):
                selected_idx = 0
            best_cluster = candidate_clusters[selected_idx]

            if best_cluster != current_cluster:
                labels[node] = best_cluster
                node_moves += 1
                changed_this_pass = True

        if not changed_this_pass:
            node_converged = True
            break

    cluster_passes = 0
    cluster_moves = 0
    cluster_evaluations = 0
    cluster_server2_select_calls = 0
    cluster_server2_select_success = 0
    cluster_converged = False
    while cluster_passes < pass_cap:
        cluster_passes += 1
        changed_this_pass = False
        cluster_ids = sorted(set(labels.values()))

        for cluster_id in cluster_ids:
            cluster_nodes = {n for n, cid in labels.items() if cid == cluster_id}
            if not cluster_nodes:
                continue

            candidate_targets: set[int] = set()
            for node in cluster_nodes:
                for nbr, _ in adjacency.get(node, []):
                    if nbr in cluster_nodes:
                        continue
                    nbr_cluster = labels.get(nbr)
                    if nbr_cluster is None or nbr_cluster == cluster_id:
                        continue
                    candidate_targets.add(nbr_cluster)

            if not candidate_targets:
                continue

            candidate_clusters = [cluster_id] + [x for x in sorted(candidate_targets) if x != cluster_id]
            candidate_scores: List[float] = []
            for target_cluster in candidate_clusters:
                cluster_evaluations += 1
                local_val = _cluster_boundary_unbalanced_count(work_graph, labels, cluster_nodes, target_cluster)
                candidate_scores.append(float(local_val))

            cluster_server2_select_calls += 1
            selected_idx, delegated = _select_min_index(candidate_scores)
            if delegated:
                cluster_server2_select_success += 1
            if selected_idx < 0 or selected_idx >= len(candidate_clusters):
                selected_idx = 0
            best_cluster = candidate_clusters[selected_idx]

            if best_cluster != cluster_id:
                for node in cluster_nodes:
                    labels[node] = best_cluster
                cluster_moves += len(cluster_nodes)
                changed_this_pass = True

        if not changed_this_pass:
            cluster_converged = True
            break

    clusters_after = len(set(labels.values()))
    candidate_h_anon, _ = _compute_unbalanced_edges(work_graph, labels)
    meta = {
        "algorithm": "HM-Louvain (strict)",
        "pass_cap": pass_cap,
        "clusters_before": clusters_before,
        "clusters_after": clusters_after,
        "candidate_h_anon": int(candidate_h_anon),
        "phase1_node": {
            "passes": node_passes,
            "moves": node_moves,
            "evaluations": node_evaluations,
            "converged": node_converged,
            "server2_select_calls": node_server2_select_calls,
            "server2_select_success": node_server2_select_success,
        },
        "phase2_cluster": {
            "passes": cluster_passes,
            "moves": cluster_moves,
            "evaluations": cluster_evaluations,
            "converged": cluster_converged,
            "server2_select_calls": cluster_server2_select_calls,
            "server2_select_success": cluster_server2_select_success,
        },
    }
    return labels, meta


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


def _select_min_index(scores: List[float]) -> Tuple[int, bool]:
    if not scores:
        return 0, False

    local_idx = min(range(len(scores)), key=lambda i: scores[i])
    if not STRICT_ARGMIN_WITH_SERVER2:
        return local_idx, False

    try:
        r = requests.post(
            f"{SERVER2_URL}/api/v1/crypto/select-min",
            json={"scores": scores},
            timeout=10,
        )
        r.raise_for_status()
        body = r.json()
        if not body.get("ok"):
            return local_idx, False
        idx = int(body.get("data", {}).get("best_index", local_idx))
        if idx < 0 or idx >= len(scores):
            return local_idx, False
        return idx, True
    except Exception:
        return local_idx, False


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
    input_node_count = len(task.input_graph.get("nodes", [])) if task.input_graph else node_count
    input_edge_count = len(task.input_graph.get("edges", [])) if task.input_graph else real_edge_count
    return {
        "id": task.id,
        "status": task.status,
        "t": task.t,
        "max_iter": task.max_iter,
        "rb": task.rb,
        "initialized": task.initialized,
        "input_node_count": input_node_count,
        "input_edge_count": input_edge_count,
        "node_count": node_count,
        "real_edge_count": real_edge_count,
        "anon_edge_count": anon_edge_count,
        "effective_graph": task.graph,
        "outlier_filter_enabled": task.outlier_filter_enabled,
        "outlier_filter_report": task.outlier_filter_report,
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
    input_node_count = len(task.input_graph.get("nodes", [])) if task.input_graph else node_count
    input_edge_count = len(task.input_graph.get("edges", [])) if task.input_graph else real_edge_count
    return {
        "task_id": task.id,
        "summary": {
            "status": task.status,
            "t": task.t,
            "max_iter": task.max_iter,
            "rb": task.rb,
            "input_node_count": input_node_count,
            "input_edge_count": input_edge_count,
            "node_count": node_count,
            "real_edge_count": real_edge_count,
            "anon_edge_count": anon_edge_count,
            "outlier_filter_enabled": task.outlier_filter_enabled,
            "outlier_filter_report": task.outlier_filter_report,
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

    outlier_filter_enabled = bool(body.get("outlier_filter", True))
    outlier_max_remove_ratio = float(body.get("outlier_max_remove_ratio", 0.28))
    if outlier_max_remove_ratio < 0 or outlier_max_remove_ratio > 0.9:
        return err("INVALID_OUTLIER_RATIO", "outlier_max_remove_ratio must be between 0 and 0.9")
    outlier_min_nodes = int(body.get("outlier_min_nodes", 36))
    if outlier_min_nodes < 2:
        return err("INVALID_OUTLIER_MIN_NODES", "outlier_min_nodes must be >= 2")

    filtered_graph, filter_report = _filter_graph_outliers(
        normalized_graph,
        enabled=outlier_filter_enabled,
        max_remove_ratio=outlier_max_remove_ratio,
        min_nodes_to_apply=outlier_min_nodes,
    )
    if len(filtered_graph.get("nodes", [])) < 2:
        filtered_graph = normalized_graph
        filter_report = {
            "enabled": outlier_filter_enabled,
            "applied": False,
            "reason": "filtered_graph_too_small",
            "before_nodes": len(normalized_graph.get("nodes", [])),
            "before_edges": len(normalized_graph.get("edges", [])),
            "after_nodes": len(normalized_graph.get("nodes", [])),
            "after_edges": len(normalized_graph.get("edges", [])),
            "removed_nodes": 0,
            "removed_edges": 0,
        }

    task_id = uuid4().hex[:12]
    task = TaskState(
        id=task_id,
        graph=filtered_graph,
        input_graph=normalized_graph,
        max_iter=max_iter,
        rb=rb,
        outlier_filter_enabled=outlier_filter_enabled,
        outlier_filter_report=filter_report,
        current_labels=_build_initial_labels(filtered_graph),
    )
    task.current_h_real = float(_compute_unbalanced_edges(task.graph, task.current_labels)[0])

    try:
        task.public_key = _keygen_from_server2()
    except Exception as ex:
        return err("SERVER2_UNAVAILABLE", f"failed to initialize keypair via server2: {ex}", 503)

    TASKS[task_id] = task
    _log(
        task,
        1,
        "Server1",
        "input graph prepared with backend outlier filter",
        {
            "input_nodes": len(normalized_graph.get("nodes", [])),
            "input_edges": len(normalized_graph.get("edges", [])),
            "effective_nodes": len(task.graph.get("nodes", [])),
            "effective_edges": len(task.graph.get("edges", [])),
            "outlier_filter": filter_report,
        },
    )
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

        candidate_labels, candidate_meta = _build_candidate_labels(task)
        cand_h_real, _ = _compute_unbalanced_edges(task.graph, candidate_labels)
        _log(
            task,
            2,
            "Server1",
            "generated a candidate clustering S_t",
            {
                "candidate_h_real": cand_h_real,
                "candidate_h_anon": candidate_meta.get("candidate_h_anon"),
                "candidate_labels": candidate_labels,
                "hm_louvain": candidate_meta,
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
                "candidate_h_anon": float(candidate_meta.get("candidate_h_anon", 0)),
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

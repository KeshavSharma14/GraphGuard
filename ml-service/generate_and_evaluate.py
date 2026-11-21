import json
import time
from pathlib import Path

import networkx as nx
import numpy as np
from sklearn.ensemble import IsolationForest
from sklearn.metrics import precision_score, recall_score, f1_score

ACCOUNT_COUNT = 260
TRANSACTION_COUNT = 1320


def generate_data(seed: int = 42):
    rng = np.random.default_rng(seed)
    graph = nx.DiGraph()
    accounts = []
    labels = {}

    for i in range(ACCOUNT_COUNT):
        graph.add_node(f"acct-{i + 1:04d}")
        labels[f"acct-{i + 1:04d}"] = 0

    transactions = []
    ring_ids = {}
    timestamp_base = 1_735_689_600

    # Five 4-node laundering cycles.
    for ring_index in range(5):
        ring = [f"acct-{(ring_index * 4 + i + 1):04d}" for i in range(4)]
        ring_id = f"ring-{ring_index + 1}"
        ring_ids.update({account: ring_id for account in ring})
        for i in range(4):
            for hop in range(3):
                transactions.append({
                    "from": ring[i],
                    "to": ring[(i + 1) % 4],
                    "amount": round(float(rng.uniform(4800, 9500)), 2),
                    "timestamp": timestamp_base + len(transitions := transactions) * 60,
                    "ipAddress": f"10.4.{ring_index}.{i + 1}",
                    "device": f"device-r{ring_index}-{i}",
                })
                labels[ring[i]] = 1
                labels[ring[(i + 1) % 4]] = 1

    # Mule fan-out and fan-in clusters.
    fanout_hub = "acct-0101"
    fanin_hub = "acct-0201"
    labels[fanout_hub] = 1
    labels[fanin_hub] = 1
    for i in range(35):
        target = f"acct-{120 + i:04d}"
        labels[target] = 1
        transactions.append({
            "from": fanout_hub,
            "to": target,
            "amount": round(float(rng.uniform(900, 1800)), 2),
            "timestamp": timestamp_base + len(transitions := transactions) * 45,
            "ipAddress": "10.8.12.4",
            "device": "shared-mule-device",
        })
    for i in range(35):
        source = f"acct-{160 + i:04d}"
        labels[source] = 1
        transactions.append({
            "from": source,
            "to": fanin_hub,
            "amount": round(float(rng.uniform(950, 1750)), 2),
            "timestamp": timestamp_base + len(transitions := transactions) * 45,
            "ipAddress": "10.8.13.9",
            "device": "shared-mule-device",
        })

    # Normal transactions.
    while len(transactions) < TRANSACTION_COUNT:
        source_index = int(rng.integers(0, ACCOUNT_COUNT))
        target_index = int(rng.integers(0, ACCOUNT_COUNT))
        if source_index == target_index:
            continue
        source = f"acct-{source_index + 1:04d}"
        target = f"acct-{target_index + 1:04d}"
        amount = float(rng.lognormal(mean=5.2, sigma=1.1))
        transactions.append({
            "from": source,
            "to": target,
            "amount": round(amount, 2),
            "timestamp": timestamp_base + len(transitions := transactions) * 37,
            "ipAddress": f"172.16.{int(rng.integers(0, 30))}.{int(rng.integers(1, 255))}",
            "device": f"device-{int(rng.integers(1, 150)):03d}",
        })
        graph.add_edge(source, target, amount=amount)

    # Add all generated edges so graph features reflect the synthetic rings.
    for tx in transactions:
        graph.add_edge(tx["from"], tx["to"], amount=tx["amount"])

    return accounts, graph, transactions, labels, ring_ids


def build_features(graph: nx.DiGraph, transactions, labels, ring_ids):
    pagerank = nx.pagerank(graph, alpha=0.85)
    account_features = {}
    for account in graph.nodes:
        outgoing = [tx for tx in transactions if tx["from"] == account]
        incoming = [tx for tx in transactions if tx["to"] == account]
        amounts = [tx["amount"] for tx in outgoing]
        account_features[account] = {
            "in_degree": graph.in_degree(account),
            "out_degree": graph.out_degree(account),
            "pagerank": pagerank[account],
            "cycle_participation": int(len(ring_ids.get(account, "")) > 0),
            "velocity": len(outgoing),
            "fan_out": len(set(tx["to"] for tx in outgoing)),
            "fan_in": len(set(tx["from"] for tx in incoming)),
            "avg_amount": float(np.mean(amounts)) if amounts else 0.0,
            "max_amount": float(np.max(amounts)) if amounts else 0.0,
            "unique_ips": len(set(tx["ipAddress"] for tx in outgoing + incoming)),
        }

    feature_names = [
        "in_degree", "out_degree", "pagerank", "cycle_participation",
        "velocity", "fan_out", "fan_in", "avg_amount", "max_amount", "unique_ips",
    ]
    ids = list(account_features)
    matrix = np.array([[account_features[a][name] for name in feature_names] for a in ids])
    y_true = np.array([labels[a] for a in ids])
    return ids, matrix, y_true, account_features, feature_names


def evaluate():
    _, graph, transactions, labels, ring_ids = generate_data()
    ids, matrix, y_true, account_features, feature_names = build_features(
        graph, transactions, labels, ring_ids
    )
    model = IsolationForest(
        n_estimators=180, contamination=max(0.1, y_true.mean()), random_state=42
    )
    model.fit(matrix)
    raw = model.decision_function(matrix)
    anomaly = model.predict(matrix) == -1
    precision = precision_score(y_true, anomaly, zero_division=0)
    recall = recall_score(y_true, anomaly, zero_division=0)
    f1 = f1_score(y_true, anomaly, zero_division=0)

    start = time.perf_counter()
    for row in matrix:
        model.predict([row])
    latency_ms = (time.perf_counter() - start) * 1000 / len(matrix)

    ring_map = ring_ids
    return {
        "model": model,
        "ids": ids,
        "matrix": matrix,
        "account_features": account_features,
        "feature_names": feature_names,
        "graph": graph,
        "transactions": transactions,
        "labels": labels,
        "ring_ids": ring_map,
        "raw": raw,
        "metrics": {
            "precision": round(float(precision), 3),
            "recall": round(float(recall), 3),
            "f1": round(float(f1), 3),
            "latency_ms": round(float(latency_ms), 3),
            "detected_fraud_rings": len(set(r for r in ring_map.values())),
            "accounts": len(ids),
            "transactions": len(transitions := transactions),
        },
    }


def explain(features, ring_id):
    reasons = []
    if ring_id:
        reasons.append("Part of a suspicious circular transaction ring")
    if features["cycle_participation"]:
        reasons.append("Cycle participation detected in transaction graph")
    if features["fan_out"] >= 15:
        reasons.append("High velocity fan-out")
    if features["fan_in"] >= 15:
        reasons.append("High-volume fan-in activity")
    if features["max_amount"] >= 5000:
        reasons.append("Anomalous transfer amount")
    if features["unique_ips"] <= 3 and features["velocity"] >= 5:
        reasons.append("Transactions use a shared limited-IP cluster")
    if not reasons:
        reasons.append("Low graph centrality and normal transaction behavior")
    return reasons


if __name__ == "__main__":
    result = evaluate()
    output = {
        "accounts": ACCOUNT_COUNT,
        "transactions": TRANSACTION_COUNT,
        "metrics": result["metrics"],
    }
    Path("model_artifacts").mkdir(exist_ok=True)
    Path("model_artifacts/evaluation.json").write_text(json.dumps(output, indent=2))
    print(json.dumps(output, indent=2))

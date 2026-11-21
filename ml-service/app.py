import time
from typing import Optional

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from generate_and_evaluate import evaluate, explain


app = FastAPI(title="GraphGuard ML and Graph Engine")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

result = evaluate()


class PredictionInput(BaseModel):
    account_id: Optional[str] = None
    in_degree: float = 0
    out_degree: float = 0
    pagerank: float = 0
    cycle_participation: float = 0
    velocity: float = 0
    fan_out: float = 0
    fan_in: float = 0
    avg_amount: float = 0
    max_amount: float = 0
    unique_ips: float = 0


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/metrics")
def metrics():
    return result["metrics"]


@app.post("/predict")
def predict(payload: PredictionInput):
    start = time.perf_counter()
    features = payload.model_dump(exclude={"account_id"})
    feature_names = result["feature_names"]
    account_id = payload.account_id

    if account_id and account_id in result["account_features"]:
        features = result["account_features"][account_id]

    row = [[features.get(name, 0) for name in feature_names]]
    decision = float(result["model"].decision_function(row)[0])
    anomaly = result["model"].predict(row)[0] == -1
    normalized = 1 / (1 + pow(2.71828, decision * 4))
    risk = int(max(5, min(99, round(normalized * 100))))
    if anomaly:
        risk = max(risk, 65)

    ring_id = result["ring_ids"].get(account_id) if account_id else None
    reasons = explain(features, ring_id)
    return {
        "risk_score": risk,
        "reasons": reasons,
        "fraud_ring_id": ring_id,
        "inference_latency_ms": round((time.perf_counter() - start) * 1000, 3),
    }


@app.post("/evaluate")
def evaluate_endpoint():
    return result["metrics"]


@app.get("/dataset")
def dataset():
    transactions = []
    for tx in result["transactions"]:
        tx_copy = dict(tx)
        tx_copy["device"] = tx_copy.get("device")
        tx_copy["ipAddress"] = tx_copy.get("ipAddress")
        transactions.append(tx_copy)
    accounts = []
    for account_id in result["ids"]:
        pred = predict(PredictionInput(account_id=account_id))
        accounts.append({
            "id": account_id,
            "label": account_id,
            "risk_score": pred["risk_score"],
            "reasons": pred["reasons"],
            "fraud_ring_id": pred["fraud_ring_id"],
            "metadata": result["account_features"][account_id],
        })
    return {
        "accounts": accounts,
        "transactions": transactions,
        "metrics": result["metrics"],
        "fraud_rings": list(set(r for r in result["ring_ids"].values())),
    }

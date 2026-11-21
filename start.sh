#!/usr/bin/env bash
set -e

docker compose up -d postgres
cd ml-service
python3 -m venv .venv
source .venv/bin/activate
pip install -q -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8000 &
ML_PID=$!
cd ../backend
npm install
npx prisma generate
npx prisma migrate deploy
npm run dev &
BACKEND_PID=$!
cd ../frontend
npm install
npm run dev &
FRONTEND_PID=$!
trap 'kill $ML_PID $BACKEND_PID $FRONTEND_PID 2>/dev/null || true' EXIT
wait

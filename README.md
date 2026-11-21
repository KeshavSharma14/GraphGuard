# GraphGuard

GraphGuard is a runnable full-stack fraud-ring investigation MVP. It combines an interactive account graph, a FastAPI/NetworkX/Scikit-learn anomaly engine, and an Express/Prisma API backed by PostgreSQL.

## Stack

- Next.js 14 App Router, TypeScript, Tailwind CSS, `react-force-graph-2d`
- Express, TypeScript, JWT, bcrypt, Prisma
- PostgreSQL 16
- FastAPI, Scikit-learn Isolation Forest, NetworkX

## One-command Codespaces setup

```bash
chmod +x start.sh
./start.sh
```

Open ports `3000`, `4000`, and `8000`. The demo login is at `http://localhost:3000`; first dashboard load automatically creates a demo analyst and seeds PostgreSQL.

For the container-only startup:

```bash
docker compose up --build
```

The frontend is at `http://localhost:3000`, API at `http://localhost:4000`, and ML docs at `http://localhost:8000/docs`.

## Manual startup

### 1. PostgreSQL

```bash
docker compose up -d postgres
```

Optional local environment:

```bash
cp backend/.env.example backend/.env
```

### 2. ML service

```bash
cd ml-service
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python generate_and_evaluate.py
uvicorn app:app --host 0.0.0.0 --port 8000 --reload
```

The generator creates 260 accounts and 1,320 transactions, injects circular rings, mule fan-in/fan-out clusters, and shared-IP clusters, then reports precision, recall, F1, and average inference latency.

### 3. Backend

```bash
cd backend
npm install
npx prisma generate
npx prisma migrate deploy
npm run dev
```

Set `DATABASE_URL`, `JWT_SECRET`, `ML_SERVICE_URL`, `PORT`, and `CORS_ORIGIN` in `backend/.env`.

### 4. Frontend

```bash
cd frontend
npm install
npm run dev
```

Set `NEXT_PUBLIC_API_URL=http://localhost:4000` to override the API origin.

## Demo credentials

- Email: `demo@graphguard.ai`
- Password: `demo`

The login page also has a one-click **Demo Analyst Login** button.

## API

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | No | Create an analyst |
| POST | `/api/auth/login` | No | JWT login |
| POST | `/api/seed` | JWT | Generate and persist synthetic graph data |
| GET | `/api/graph` | JWT | Accounts, transactions, and detected rings |
| POST | `/api/accounts/:id/flag` | JWT | Flag or clear an account |
| GET | `/api/audit-logs` | JWT | Recent analyst actions |
| GET | `/api/metrics` | JWT | Precision, recall, F1, latency |

ML endpoints include `GET /health`, `GET /metrics`, `GET /dataset`, `POST /predict`, and `POST /evaluate`.

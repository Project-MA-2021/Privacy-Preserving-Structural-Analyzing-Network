# Backend Prototype (Server1 + Server2)

This folder contains the first runnable backend prototype for the PGSBC workflow:

- `server1`: task orchestration, encrypted aggregation, iteration state/timeline
- `server2`: key management, score decryption, `c_t` comparison decision
- `shared_contract`: shared DTO/crypto helpers

## 1. Install

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

## 2. Run

Terminal A:

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
python -m server2.app
```

Terminal B:

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
python -m server1.app
```

Default ports:

- `server1`: `http://127.0.0.1:5001`
- `server2`: `http://127.0.0.1:5002`

## 3. Smoke test

1) Create task:

```powershell
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:5001/api/v1/tasks -ContentType "application/json" -Body "{}"
```

2) Iterate one round:

```powershell
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:5001/api/v1/tasks/<task_id>/iterate -ContentType "application/json" -Body "{}"
```

3) Query timeline:

```powershell
Invoke-RestMethod -Method Get -Uri http://127.0.0.1:5001/api/v1/tasks/<task_id>/timeline
```

4) Export per-round metrics:

```powershell
Invoke-RestMethod -Method Get -Uri http://127.0.0.1:5001/api/v1/tasks/<task_id>/export
```

## Current scope

- Real dual services and real Paillier encryption/decryption are wired.
- The optimizer is still a deterministic prototype score generator (next step: HM-Louvain-lite).
- API paths are versioned under `/api/v1`.

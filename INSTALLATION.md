# Installation

This project now ships as a monorepo with three parts: the GalaxyGen Python package, the Asarto FastAPI backend, and the Asarto Next.js client. The steps below get you running locally.

## Prerequisites
- Python 3.10+
- Node.js 18+

## GalaxyGen (Python package)
```bash
python -m venv .venv
.\.venv\Scripts\activate  # or source .venv/bin/activate on macOS/Linux
pip install -e .
```

## Asarto API (FastAPI)
```bash
cd apps/api
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## Asarto Web (Next.js)
```bash
cd apps/web
npm install
npm run dev
```
Set `NEXT_PUBLIC_API_BASE` if your API is not at `http://localhost:8000`.

See the [README](README.md) for usage details and available endpoints.

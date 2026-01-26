# GalaxyGen / Asarto Monorepo

This repo is organized around three layers for sci-fi worldbuilding:

- **GalaxyGen** – Python package for galaxy generation and rendering.
- **Asarto API** – FastAPI backend exposing GalaxyGen features.
- **Asarto** – Next.js + Pixi.js client for viewing generated galaxies.

A sample galaxy and the supporting data are kept in `data/`.

## Layout
- `galaxygen/` – Core Python module, Typer CLI entrypoint, and rendering utilities.
- `apps/api/` – FastAPI service that wraps GalaxyGen; serves generation and rendering endpoints.
- `apps/web/` – Next.js frontend powered by Pixi.js for rendering the galaxy and calling the API.
- `data/` – Default galaxy, density map, and resource/country definitions used across the stack.

## Quick start
### GalaxyGen CLI
```bash
pip install -e .
galaxygen generate 2000 --distribution data/assets/Distribution.png --output data/galaxies/default/galaxy.json
galaxygen render --galaxy data/galaxies/default/galaxy.json --output-dir data/galaxies/default
```

### Asarto API
```bash
cd apps/api
python -m venv .venv && .\.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```
Endpoints:
- `GET /galaxy` – Fetch the current galaxy.
- `POST /galaxy/generate` – Regenerate from the density map.

### Asarto Web
```bash
cd apps/web
npm install
npm run dev
```
Set `NEXT_PUBLIC_API_BASE` if the API is not on `http://localhost:8000`.

## Data model
- `Galaxy`: width/height, stars, hyperlanes, resource regions.

## Next steps
- Flesh out game objects (fleets, empires, missions) and persist sessions.
- Expand Pixi.js UI with selection/editing tools and travel visualization.
- Add save-slot management and background tick processing.

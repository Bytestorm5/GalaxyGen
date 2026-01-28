# AGENTS

## Purpose
This repo is a monorepo for sci-fi worldbuilding tooling, composed of three connected layers:
- GalaxyGen: a Python library and CLI for generating galaxies, systems, and renders.
- Asarto API: a FastAPI service that wraps GalaxyGen and exposes JSON endpoints.
- Asarto Web: a Next.js + Pixi.js UI for viewing and editing galaxies in the browser.

## Architecture overview
- Primary data lives in JSON under `data/` and is shared by the CLI, API, and web app.
- Generation flow: density map + resource definitions -> `galaxygen.generate_galaxy` -> `data/galaxies/default/galaxy.json`.
- Rendering flow: galaxy JSON + definitions -> `galaxygen.render_galaxy` -> PNG outputs.
- API flow: the web UI fetches and mutates galaxy state via `/galaxy` endpoints; the API persists back to `data/`.
- The web UI renders with Pixi.js, using its own zoom, selection, and edit state; it calls the API for persistence.

## Repo map (what lives where)
Top level
- `galaxygen/`: core Python package.
  - `cli.py`: Typer CLI entrypoint (`galaxygen` command).
  - `generation.py`: density sampling, hyperlane generation, star/system seeding.
  - `system_generation.py`: deterministic system profiles, star classification, planet orbits.
  - `rendering.py`: image output using OpenCV + Voronoi overlays.
  - `models.py`: Pydantic models for Galaxy, Star, Hyperlane, resources, countries.
  - `types.py`: enums for star/planet types.
  - `storage.py`: JSON read/write helpers for galaxy, resources, countries.
  - `config.py`: data paths + rendering defaults.
- `apps/api/`: FastAPI service for GalaxyGen.
  - `app/main.py`: FastAPI app setup, CORS, health check.
  - `app/routes/galaxy.py`: all galaxy endpoints (fetch, generate, render, mutate).
  - `app/schemas/galaxy.py`: request and response models.
  - `app/config.py`: settings (data paths, env prefixes).
  - `app/data_lock.py`: file and in-process lock to serialize data writes.
  - `requirements.txt`: API dependencies; also installs GalaxyGen from git.
  - `Dockerfile`: API container build (copies `galaxygen/` and `data/`).
- `apps/web/`: Next.js UI (TypeScript).
  - `app/page.tsx`: main UI shell, edit panels, API calls.
  - `components/GalaxyViewport.tsx`: Pixi.js render loop, zoom/pan/selection.
  - `components/GalaxyCanvas.tsx`: simple Pixi canvas (fallback usage).
  - `lib/types.ts`: shared TS types that mirror the Python models.
  - `lib/color.ts`: color helpers.
  - `app/globals.css`, `app/layout.tsx`: base styling and font setup.
  - `package.json`: dev scripts (includes `dev` runner for API + web).
  - `Dockerfile`: build and run a standalone Next.js production server.
- `data/`: shared assets and default galaxy state.
  - `assets/Distribution.png`: density map for star placement.
  - `assets/resources.json`: resource definitions.
  - `assets/countries.json`: country definitions (hierarchical).
  - `galaxies/default/galaxy.json`: current galaxy state used by API and web.
- `deploy/`: production container setup.
  - `docker-compose.yml`: API + web + Caddy.
  - `Caddyfile`: routes `/api/*` to API and the rest to the web app.
- `utils/`: standalone helper scripts (run from repo root).
- `js/`, `templates/`, `render.py`: legacy static viewer/editor and old render script.
- `docs/`, `images/`, `build/`: historical assets and artifacts.

Generated or local-only folders you can ignore in source reasoning:
- `apps/web/node_modules/`, `apps/web/.next/`
- `apps/api/api_venv/`, `venv/`
- `galaxygen.egg-info/`, `__pycache__/`

## Shared data model (high level)
- `Galaxy`: width/height, list of `stars`, `hyperlanes`, `resources`, and `countries`.
- `Star`: x/y, name/description, star_type, admin_levels (country -> sector -> province -> cluster), bodies.
- `ResourceDefinition`: name, color, rarity, centricity.
- `CountryDefinition`: name, color, and nested sectors/provinces/clusters.
- Legacy note: some older code paths and sample JSON still refer to `ownership` rather than `countries`. The modern model uses `countries`, but you may see both in older files or in `render.py`.

## Key runtime configuration
- API CORS:
  - `ASARTO_CORS_ORIGINS`: comma separated list of allowed origins (default `*`).
  - `ASARTO_CORS_ALLOW_CREDENTIALS`: `true/false`; forced off if `*` is used.
- Web:
  - `NEXT_PUBLIC_API_BASE`: API base URL; defaults to `http://localhost:8000` in dev.
- GalaxyGen defaults: configured in `galaxygen/config.py` (paths and rendering parameters).

## Primary entry points
- CLI: `galaxygen` (Typer commands in `galaxygen/cli.py`).
- API: `apps/api/app/main.py` (FastAPI app instance).
- Web: `apps/web/app/page.tsx` (primary UI), `components/GalaxyViewport.tsx` (rendering + interaction).

## Common commands
Python (GalaxyGen)
- `pip install -e .`
- `galaxygen generate 2000 --distribution data/assets/Distribution.png --output data/galaxies/default/galaxy.json`
- `galaxygen render --galaxy data/galaxies/default/galaxy.json --output-dir data/galaxies/default`

API (FastAPI)
- `cd apps/api`
- `python -m venv .venv && .\.venv\Scripts\activate`
- `pip install -r requirements.txt`
- `uvicorn app.main:app --reload --port 8000`

Web (Next.js)
- `cd apps/web`
- `npm install`
- `npm run dev`

Deploy
- `cd deploy`
- `docker compose up --build`

## Behavior and integration notes
- The API writes to `data/galaxies/default/galaxy.json` and uses `app/data_lock.py` to serialize access.
- The web UI periodically polls the API, supports star and hyperlane editing, and saves updates via REST.
- Rendering uses OpenCV and Voronoi regions; it can output raw, mask, resource, and final overlays.
- The `apps/api/requirements.txt` uses a git-pinned GalaxyGen dependency; the Docker build copies the local `galaxygen/` package instead.

## Where to look for changes
- Generation algorithms: `galaxygen/generation.py`, `galaxygen/system_generation.py`.
- Rendering and image outputs: `galaxygen/rendering.py`.
- API endpoints and payloads: `apps/api/app/routes/galaxy.py`, `apps/api/app/schemas/galaxy.py`.
- Web interaction logic: `apps/web/app/page.tsx`, `apps/web/components/GalaxyViewport.tsx`.
- Shared data format: `galaxygen/models.py` and `apps/web/lib/types.ts`.

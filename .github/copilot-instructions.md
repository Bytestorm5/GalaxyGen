# GalaxyGen / Asarto Monorepo - AI Coding Guidelines

## Architecture Overview
This monorepo consists of three interconnected layers for sci-fi worldbuilding:
- **GalaxyGen**: Core Python package (`galaxygen/`) for galaxy generation, rendering, and CLI (Typer-based).
- **Asarto API**: FastAPI backend (`apps/api/`) exposing GalaxyGen features via REST endpoints.
- **Asarto Web**: Next.js + TypeScript frontend (`apps/web/`) using Pixi.js for interactive galaxy visualization.

Data flows from Python generation → API endpoints → Web rendering. Galaxy data is stored as JSON in `data/galaxies/default/galaxy.json`.

## Key Patterns & Conventions
- **Data Model**: Galaxy contains stars (with admin_levels as [country_idx, sector_idx, province_idx, cluster_idx]), hyperlanes, and resource regions. Countries are defined in `data/assets/countries.json` with name/color.
- **Admin Levels**: Stars have hierarchical admin divisions (Country/Sector/Province/Cluster). Editing creates new countries on-the-fly with random colors.
- **Rendering**: Use Pixi.js for galaxy viewport; handle star selection, system views, and celestial body editing.
- **API Communication**: Web fetches galaxy/resources/countries from API_BASE (default `http://localhost:8000`). Save operations POST updated galaxy + countries.
- **File Structure**: Core logic in `galaxygen/`, API routes in `apps/api/app/routes/`, Web components in `apps/web/components/`.

## Developer Workflows
- **Setup**: `pip install -e .` (root) for GalaxyGen CLI; `cd apps/api && pip install -r requirements.txt`; `cd apps/web && npm install`.
- **Run API**: `cd apps/api && uvicorn app.main:app --reload --port 8000`.
- **Run Web**: `cd apps/web && npm run dev` (set NEXT_PUBLIC_API_BASE if needed).
- **Generate Galaxy**: `galaxygen generate <count> --distribution data/assets/Distribution.png --output data/galaxies/default/galaxy.json`.
- **Debugging**: Use standard Python debuggers for GalaxyGen/API; browser dev tools for Web. API reloads on changes; Web hot-reloads.

## Integration Points
- **External Deps**: NumPy/SciPy for generation; FastAPI for API; Pixi.js for rendering.
- **Cross-Component**: API loads/saves JSON data via `galaxygen.storage`; Web updates galaxy via POST /galaxy with full payload.
- **Environment**: Use virtualenvs for Python; node_modules for Web. Data files are shared across layers.

## Testing
- When making changes to any web code, test changes with `npm run build` and resolve any errors before finishing.
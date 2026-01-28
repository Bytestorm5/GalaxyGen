from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from galaxygen.generation import generate_galaxy
from galaxygen.random_names import generate_random_word
from galaxygen.rendering import render_galaxy
from galaxygen.storage import (
    add_hyperlane as add_hyperlane_to_store,
    add_star as add_star_to_store,
    delete_hyperlane as delete_hyperlane_from_store,
    delete_star as delete_star_from_store,
    get_star_count,
    load_country_definitions,
    load_galaxy,
    load_resource_definitions,
    save_country_definitions,
    save_galaxy,
    update_star as update_star_in_store,
)
from galaxygen.system_generation import generate_system_profile

from ..dependencies import get_settings
from ..schemas.galaxy import (
    AddStarRequest,
    GalaxyResponse,
    GenerateRequest,
    GenerateSystemRequest,
    HyperlaneRequest,
    RenderRequest,
    SaveGalaxyRequest,
    UpdateCountriesRequest,
    UpdateStarRequest,
)

router = APIRouter(prefix="/galaxy", tags=["galaxy"])


@router.get("", response_model=GalaxyResponse)
def fetch_galaxy(settings=Depends(get_settings)):
    galaxy = load_galaxy()
    resource_defs = load_resource_definitions()
    country_defs = load_country_definitions()
    return {"galaxy": galaxy, "resources": resource_defs, "countries": country_defs}


@router.post("", response_model=GalaxyResponse)
def persist_galaxy(payload: SaveGalaxyRequest, settings=Depends(get_settings)):
    save_galaxy(None, payload.galaxy)
    if payload.countries is not None:
        save_country_definitions(None, payload.countries)
    return {"galaxy": payload.galaxy, "countries": payload.countries}


@router.post("/generate", response_model=GalaxyResponse)
def generate(payload: GenerateRequest, settings=Depends(get_settings)):
    distribution = payload.distribution_path or settings.distribution_map
    if not distribution.exists():
        raise HTTPException(status_code=400, detail=f"Distribution map not found: {distribution}")

    resources = load_resource_definitions() if payload.use_resources else []
    countries = load_country_definitions()
    galaxy = generate_galaxy(distribution, payload.system_count, resources, payload.seed, countries)
    save_galaxy(None, galaxy)
    return {"galaxy": galaxy, "resources": resources, "countries": countries}


@router.post("/generate-system")
def generate_system(payload: GenerateSystemRequest, settings=Depends(get_settings)):
    profile = generate_system_profile(payload.galaxy, payload.star_index, payload.seed or 0)
    if profile is None:
        raise HTTPException(status_code=400, detail=f"Invalid star index {payload.star_index} or coordinates")
    profile["name"] = generate_random_word()
    return profile


@router.post("/render")
def render(payload: RenderRequest, settings=Depends(get_settings)):
    output_dir = payload.output_dir or settings.render_output

    galaxy = load_galaxy()
    resource_defs = load_resource_definitions()
    country_defs = load_country_definitions()
    outputs = render_galaxy(galaxy, resource_defs, country_defs, output_dir, settings.distribution_map)
    return {"outputs": {key: str(val) if val else None for key, val in outputs.items()}}


@router.patch("/star/{star_idx}")
def update_star(star_idx: int, payload: UpdateStarRequest, settings=Depends(get_settings)):
    if star_idx < 0 or not update_star_in_store(star_idx, payload.star):
        raise HTTPException(status_code=404, detail=f"Star {star_idx} not found")
    return {"star": payload.star}


@router.post("/star")
def add_star(payload: AddStarRequest, settings=Depends(get_settings)):
    index = add_star_to_store(payload.star, payload.width, payload.height)
    return {"index": index}


@router.delete("/star/{star_idx}")
def delete_star(star_idx: int, settings=Depends(get_settings)):
    if star_idx < 0 or not delete_star_from_store(star_idx):
        raise HTTPException(status_code=404, detail=f"Star {star_idx} not found")
    return {"ok": True}


@router.post("/hyperlane")
def add_hyperlane(payload: HyperlaneRequest, settings=Depends(get_settings)):
    if payload.a == payload.b:
        raise HTTPException(status_code=400, detail="Hyperlane endpoints must be different")
    star_count = get_star_count()
    if payload.a >= star_count or payload.b >= star_count:
        raise HTTPException(status_code=404, detail="Star index out of range")

    index = add_hyperlane_to_store(payload.a, payload.b)
    return {"index": index}


@router.delete("/hyperlane/{lane_idx}")
def delete_hyperlane(lane_idx: int, settings=Depends(get_settings)):
    if lane_idx < 0 or not delete_hyperlane_from_store(lane_idx):
        raise HTTPException(status_code=404, detail=f"Hyperlane {lane_idx} not found")
    return {"ok": True}


@router.put("/countries")
def update_countries(payload: UpdateCountriesRequest, settings=Depends(get_settings)):
    save_country_definitions(None, payload.countries)
    return {"countries": payload.countries}

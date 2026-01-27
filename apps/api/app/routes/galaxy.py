from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from galaxygen.generation import generate_galaxy
from galaxygen.random_names import generate_random_word
from galaxygen.rendering import render_galaxy
from galaxygen.storage import (
    load_country_definitions,
    load_galaxy,
    load_resource_definitions,
    save_country_definitions,
    save_galaxy,
    save_json,
)
from galaxygen.system_generation import generate_system_profile
from galaxygen.models import Galaxy, Hyperlane

from ..data_lock import data_lock
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


def ensure_data_files(settings) -> None:
    if not settings.galaxy_file.exists():
        empty_galaxy = Galaxy(width=0, height=0, stars=[], hyperlanes=[])
        save_galaxy(settings.galaxy_file, empty_galaxy)
    if not settings.resources_file.exists():
        save_json(settings.resources_file, [])
    if not settings.countries_file.exists():
        save_json(settings.countries_file, [])


def load_current_galaxy(settings) -> Galaxy:
    ensure_data_files(settings)
    return load_galaxy(settings.galaxy_file)


@router.get("", response_model=GalaxyResponse)
def fetch_galaxy(settings=Depends(get_settings)):
    with data_lock(settings.data_dir):
        galaxy = load_current_galaxy(settings)
        resource_defs = load_resource_definitions(settings.resources_file) if settings.resources_file.exists() else []
        country_defs = load_country_definitions(settings.countries_file) if settings.countries_file.exists() else []
        return {"galaxy": galaxy, "resources": resource_defs, "countries": country_defs}


@router.post("", response_model=GalaxyResponse)
def persist_galaxy(payload: SaveGalaxyRequest, settings=Depends(get_settings)):
    with data_lock(settings.data_dir):
        save_galaxy(settings.galaxy_file, payload.galaxy)
        if payload.countries is not None:
            save_country_definitions(settings.countries_file, payload.countries)
        return {"galaxy": payload.galaxy, "countries": payload.countries}


@router.post("/generate", response_model=GalaxyResponse)
def generate(payload: GenerateRequest, settings=Depends(get_settings)):
    with data_lock(settings.data_dir):
        ensure_data_files(settings)
        distribution = payload.distribution_path or settings.distribution_map
        if not distribution.exists():
            raise HTTPException(status_code=400, detail=f"Distribution map not found: {distribution}")

        resources = (
            load_resource_definitions(settings.resources_file)
            if payload.use_resources and settings.resources_file.exists()
            else []
        )
        galaxy = generate_galaxy(distribution, payload.system_count, resources, payload.seed)
        save_galaxy(settings.galaxy_file, galaxy)
        country_defs = load_country_definitions(settings.countries_file) if settings.countries_file.exists() else []
        return {"galaxy": galaxy, "resources": resources, "countries": country_defs}


@router.post("/generate-system")
def generate_system(payload: GenerateSystemRequest, settings=Depends(get_settings)):
    profile = generate_system_profile(payload.galaxy, payload.star_index, payload.seed or 0)
    if profile is None:
        raise HTTPException(status_code=400, detail=f"Invalid star index {payload.star_index} or coordinates")
    profile["name"] = generate_random_word()
    return profile


@router.post("/render")
def render(payload: RenderRequest, settings=Depends(get_settings)):
    with data_lock(settings.data_dir):
        ensure_data_files(settings)
        galaxy_path = payload.galaxy_path or settings.galaxy_file
        output_dir = payload.output_dir or settings.render_output

        galaxy = load_galaxy(galaxy_path)
        resource_defs = load_resource_definitions(settings.resources_file) if settings.resources_file.exists() else []
        country_defs = load_country_definitions(settings.countries_file) if settings.countries_file.exists() else []
        outputs = render_galaxy(galaxy, resource_defs, country_defs, output_dir, settings.distribution_map)
        return {"outputs": {key: str(val) if val else None for key, val in outputs.items()}}


@router.patch("/star/{star_idx}")
def update_star(star_idx: int, payload: UpdateStarRequest, settings=Depends(get_settings)):
    with data_lock(settings.data_dir):
        galaxy = load_current_galaxy(settings)
        if star_idx < 0 or star_idx >= len(galaxy.stars):
            raise HTTPException(status_code=404, detail=f"Star {star_idx} not found")
        galaxy.stars[star_idx] = payload.star
        save_galaxy(settings.galaxy_file, galaxy)
        return {"star": galaxy.stars[star_idx]}


@router.post("/star")
def add_star(payload: AddStarRequest, settings=Depends(get_settings)):
    with data_lock(settings.data_dir):
        galaxy = load_current_galaxy(settings)
        galaxy.width = max(galaxy.width, payload.width)
        galaxy.height = max(galaxy.height, payload.height)
        galaxy.stars.append(payload.star)
        save_galaxy(settings.galaxy_file, galaxy)
        return {"index": len(galaxy.stars) - 1}


@router.delete("/star/{star_idx}")
def delete_star(star_idx: int, settings=Depends(get_settings)):
    with data_lock(settings.data_dir):
        galaxy = load_current_galaxy(settings)
        if star_idx < 0 or star_idx >= len(galaxy.stars):
            raise HTTPException(status_code=404, detail=f"Star {star_idx} not found")

        galaxy.stars = [star for idx, star in enumerate(galaxy.stars) if idx != star_idx]
        updated_lanes = []
        for lane in galaxy.hyperlanes:
            if lane.a == star_idx or lane.b == star_idx:
                continue
            a = lane.a - 1 if lane.a > star_idx else lane.a
            b = lane.b - 1 if lane.b > star_idx else lane.b
            if a != b:
                updated_lanes.append(Hyperlane(a=a, b=b))
        galaxy.hyperlanes = updated_lanes
        for region in galaxy.resources:
            region.systems = [s - 1 if s > star_idx else s for s in region.systems if s != star_idx]

        save_galaxy(settings.galaxy_file, galaxy)
        return {"ok": True}


@router.post("/hyperlane")
def add_hyperlane(payload: HyperlaneRequest, settings=Depends(get_settings)):
    with data_lock(settings.data_dir):
        galaxy = load_current_galaxy(settings)
        if payload.a == payload.b:
            raise HTTPException(status_code=400, detail="Hyperlane endpoints must be different")
        if payload.a >= len(galaxy.stars) or payload.b >= len(galaxy.stars):
            raise HTTPException(status_code=404, detail="Star index out of range")

        for lane in galaxy.hyperlanes:
            if (lane.a == payload.a and lane.b == payload.b) or (lane.a == payload.b and lane.b == payload.a):
                return {"index": galaxy.hyperlanes.index(lane)}

        galaxy.hyperlanes.append(Hyperlane(a=payload.a, b=payload.b))
        save_galaxy(settings.galaxy_file, galaxy)
        return {"index": len(galaxy.hyperlanes) - 1}


@router.delete("/hyperlane/{lane_idx}")
def delete_hyperlane(lane_idx: int, settings=Depends(get_settings)):
    with data_lock(settings.data_dir):
        galaxy = load_current_galaxy(settings)
        if lane_idx < 0 or lane_idx >= len(galaxy.hyperlanes):
            raise HTTPException(status_code=404, detail=f"Hyperlane {lane_idx} not found")
        galaxy.hyperlanes = [lane for idx, lane in enumerate(galaxy.hyperlanes) if idx != lane_idx]
        save_galaxy(settings.galaxy_file, galaxy)
        return {"ok": True}


@router.put("/countries")
def update_countries(payload: UpdateCountriesRequest, settings=Depends(get_settings)):
    with data_lock(settings.data_dir):
        ensure_data_files(settings)
        save_country_definitions(settings.countries_file, payload.countries)
        return {"countries": payload.countries}

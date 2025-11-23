from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from galaxygen.generation import generate_galaxy
from galaxygen.rendering import render_galaxy
from galaxygen.storage import (
    load_country_definitions,
    load_galaxy,
    load_resource_definitions,
    save_galaxy,
)

from ..dependencies import get_settings
from ..schemas.galaxy import GalaxyResponse, GenerateRequest, RenderRequest, SaveGalaxyRequest

router = APIRouter(prefix="/galaxy", tags=["galaxy"])


@router.get("", response_model=GalaxyResponse)
def fetch_galaxy(settings=Depends(get_settings)):
    galaxy = load_galaxy(settings.galaxy_file)
    resource_defs = load_resource_definitions(settings.resources_file) if settings.resources_file.exists() else []
    country_defs = load_country_definitions(settings.countries_file) if settings.countries_file.exists() else []
    return {"galaxy": galaxy, "resources": resource_defs, "countries": country_defs}


@router.post("", response_model=GalaxyResponse)
def persist_galaxy(payload: SaveGalaxyRequest, settings=Depends(get_settings)):
    save_galaxy(settings.galaxy_file, payload.galaxy)
    return {"galaxy": payload.galaxy}


@router.post("/generate", response_model=GalaxyResponse)
def generate(payload: GenerateRequest, settings=Depends(get_settings)):
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


@router.post("/render")
def render(payload: RenderRequest, settings=Depends(get_settings)):
    galaxy_path = payload.galaxy_path or settings.galaxy_file
    output_dir = payload.output_dir or settings.render_output

    galaxy = load_galaxy(galaxy_path)
    resource_defs = load_resource_definitions(settings.resources_file) if settings.resources_file.exists() else []
    country_defs = load_country_definitions(settings.countries_file) if settings.countries_file.exists() else []
    outputs = render_galaxy(galaxy, resource_defs, country_defs, output_dir, settings.distribution_map)
    return {"outputs": {key: str(val) if val else None for key, val in outputs.items()}}

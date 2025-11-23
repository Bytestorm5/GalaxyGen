from __future__ import annotations

from pathlib import Path
from typing import Optional

from pydantic import BaseModel, Field, validator

from galaxygen.models import CountryDefinition, Galaxy, ResourceDefinition


class GenerateRequest(BaseModel):
    system_count: int = Field(..., gt=0)
    seed: Optional[int] = None
    distribution_path: Optional[Path] = None
    use_resources: bool = True


class RenderRequest(BaseModel):
    galaxy_path: Optional[Path] = None
    output_dir: Optional[Path] = None


class SaveGalaxyRequest(BaseModel):
    galaxy: Galaxy


class GalaxyResponse(BaseModel):
    galaxy: Galaxy
    resources: list[ResourceDefinition] | None = None
    countries: list[CountryDefinition] | None = None

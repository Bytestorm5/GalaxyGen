from __future__ import annotations

from pathlib import Path
from typing import Optional

from pydantic import BaseModel, Field

from galaxygen.models import CountryDefinition, Galaxy, ResourceDefinition, Star


class GenerateRequest(BaseModel):
    system_count: int = Field(..., gt=0)
    seed: Optional[int] = None
    distribution_path: Optional[Path] = None
    use_resources: bool = True


class GenerateSystemRequest(BaseModel):
    galaxy: Galaxy
    star_index: int = Field(..., ge=0)
    seed: Optional[int] = None


class RenderRequest(BaseModel):
    galaxy_path: Optional[Path] = None
    output_dir: Optional[Path] = None


class SaveGalaxyRequest(BaseModel):
    galaxy: Galaxy
    countries: list[CountryDefinition] | None = None


class UpdateStarRequest(BaseModel):
    star: Star


class AddStarRequest(BaseModel):
    star: Star
    width: int = Field(..., ge=0)
    height: int = Field(..., ge=0)


class HyperlaneRequest(BaseModel):
    a: int = Field(..., ge=0)
    b: int = Field(..., ge=0)


class UpdateCountriesRequest(BaseModel):
    countries: list[CountryDefinition]


class GalaxyResponse(BaseModel):
    galaxy: Galaxy
    resources: list[ResourceDefinition] | None = None
    countries: list[CountryDefinition] | None = None

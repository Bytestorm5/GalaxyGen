from __future__ import annotations

from math import log1p
from typing import Dict, List, Optional, Sequence, Tuple

from pydantic import BaseModel, Field, validator

from .types import PlanetType, StarType


Coordinate = Tuple[int, int]


class CelestialBody(BaseModel):
    name: str = ""
    type: PlanetType | StarType
    distance_au: float  # distance from star in AU
    angle_deg: float  # angle in degrees
    radius_km: float
    color: Tuple[int, int, int] | None = None


class Star(BaseModel):
    x: int
    y: int
    name: str = ""
    description: str = ""
    star_type: StarType = StarType.G
    admin_levels: List[Optional[int]] = Field(default_factory=lambda: [None, None, None, None])  # country ids for levels 0-3
    bodies: List[CelestialBody] = Field(default_factory=list)

    def as_tuple(self) -> Coordinate:
        return (self.x, self.y)


class Hyperlane(BaseModel):
    a: int
    b: int

    @validator("b")
    def prevent_self_link(cls, v, values):
        if "a" in values and values["a"] == v:
            raise ValueError("hyperlane endpoints must be different")
        return v

    def as_pair(self) -> List[int]:
        return [self.a, self.b]


class ResourceDefinition(BaseModel):
    name: str
    color: Tuple[int, int, int]
    rarity: float = Field(0.5, ge=0.0, le=1.0)
    centricity: float = Field(0.0, ge=-1.0, le=1.0)


class ResourceRegion(BaseModel):
    id: int
    systems: List[int]


class CountryDefinition(BaseModel):
    name: str
    color: Tuple[int, int, int]


class Galaxy(BaseModel):
    width: int
    height: int
    stars: List[Star]
    hyperlanes: List[Hyperlane]
    resources: List[ResourceRegion] = Field(default_factory=list)
    countries: List[CountryDefinition] = Field(default_factory=list)

    class Config:
        validate_assignment = True

    @classmethod
    def from_legacy(cls, data: dict) -> "Galaxy":
        stars = []
        for star_data in data.get("stars", []):
            if isinstance(star_data, list) and len(star_data) == 2:
                # Old format: [x, y]
                stars.append(Star(x=int(star_data[0]), y=int(star_data[1])))
            else:
                # New format: dict
                stars.append(Star(**star_data))
        hyperlanes = [Hyperlane(a=int(pair[0]), b=int(pair[1])) for pair in data.get("hyperlanes", [])]
        resources = [
            ResourceRegion(id=int(entry["id"]), systems=[int(s) for s in entry.get("systems", [])])
            for entry in data.get("resources", [])
        ]
        countries = [
            CountryDefinition(name=entry["name"], color=tuple(entry["color"]))
            for entry in data.get("countries", [])
        ]
        return cls(
            width=int(data.get("width", 0)),
            height=int(data.get("height", 0)),
            stars=stars,
            hyperlanes=hyperlanes,
            resources=resources,
            countries=countries,
        )

    def to_legacy(self) -> dict:
        return {
            "width": self.width,
            "height": self.height,
            "stars": [s.model_dump() for s in self.stars],
            "hyperlanes": [h.as_pair() for h in self.hyperlanes],
            "resources": [r.model_dump() for r in self.resources],
            "countries": [{"name": c.name, "color": list(c.color)} for c in self.countries],
        }

    def remove_star(self, idx: int) -> None:
        if idx < 0 or idx >= len(self.stars):
            return
        self.stars[idx] = Star(x=-1, y=-1)
        self.hyperlanes = [lane for lane in self.hyperlanes if idx not in (lane.a, lane.b)]
        for region in self.resources:
            region.systems = [s for s in region.systems if s != idx]


def infrastructure_speed_multiplier(level: int) -> float:
    level = max(1, level)
    # Diminishing returns: ~1.0 at level 1, ~1.2 at level 3, ~1.35 at level 6
    return 1.0 + 0.25 * log1p(level - 1)

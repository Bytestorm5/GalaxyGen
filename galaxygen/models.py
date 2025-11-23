from __future__ import annotations

from math import log1p
from typing import Dict, List, Optional, Sequence, Tuple

from pydantic import BaseModel, Field, validator


Coordinate = Tuple[int, int]


class Star(BaseModel):
    x: int
    y: int

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


class Ownership(BaseModel):
    id: int
    systems: List[int]


class Galaxy(BaseModel):
    width: int
    height: int
    stars: List[Star]
    hyperlanes: List[Hyperlane]
    resources: List[ResourceRegion] = Field(default_factory=list)
    ownership: List[Ownership] = Field(default_factory=list)
    infrastructures: List[int] = Field(default_factory=list)

    class Config:
        validate_assignment = True

    @classmethod
    def from_legacy(cls, data: dict) -> "Galaxy":
        stars = [Star(x=int(coord[0]), y=int(coord[1])) for coord in data.get("stars", [])]
        hyperlanes = [Hyperlane(a=int(pair[0]), b=int(pair[1])) for pair in data.get("hyperlanes", [])]
        resources = [
            ResourceRegion(id=int(entry["id"]), systems=[int(s) for s in entry.get("systems", [])])
            for entry in data.get("resources", [])
        ]
        ownership = [
            Ownership(id=int(entry["id"]), systems=[int(s) for s in entry.get("systems", [])])
            for entry in data.get("ownership", [])
        ]
        infrastructures = data.get("infrastructures") or [1 for _ in stars]
        return cls(
            width=int(data.get("width", 0)),
            height=int(data.get("height", 0)),
            stars=stars,
            hyperlanes=hyperlanes,
            resources=resources,
            ownership=ownership,
            infrastructures=infrastructures,
        )

    def to_legacy(self) -> dict:
        return {
            "width": self.width,
            "height": self.height,
            "stars": [s.as_tuple() for s in self.stars],
            "hyperlanes": [h.as_pair() for h in self.hyperlanes],
            "resources": [r.model_dump() for r in self.resources],
            "ownership": [o.model_dump() for o in self.ownership],
            "infrastructures": self.infrastructures if self.infrastructures else [1 for _ in self.stars],
        }

    def remove_star(self, idx: int) -> None:
        if idx < 0 or idx >= len(self.stars):
            return
        self.stars[idx] = Star(x=-1, y=-1)
        self.hyperlanes = [lane for lane in self.hyperlanes if idx not in (lane.a, lane.b)]
        for region in self.resources:
            region.systems = [s for s in region.systems if s != idx]
        for region in self.ownership:
            region.systems = [s for s in region.systems if s != idx]


class GameClock(BaseModel):
    tick: int = 0
    paused: bool = True
    tick_length_ms: int = Field(1000, ge=16)

    def advance(self, steps: int = 1) -> None:
        if self.paused:
            return
        self.tick += max(steps, 0)


class TravelOrder(BaseModel):
    fleet_id: str
    origin: int
    destination: int
    progress: float = Field(0.0, ge=0.0, le=1.0)
    distance_ly: float = Field(0.0, ge=0.0)
    remaining_ly: float = Field(0.0, ge=0.0)
    speed_ly_per_tick: float = Field(1.0, gt=0.0)
    lane_id: Optional[int] = None
    hops: int = 0


class GameState(BaseModel):
    galaxy: Galaxy
    clock: GameClock = Field(default_factory=GameClock)
    orders: List[TravelOrder] = Field(default_factory=list)
    hyperlane_traffic: Dict[int, Dict[int, int]] = Field(default_factory=dict)  # lane_id -> owner -> count

    def tick(self, steps: int = 1) -> None:
        self.clock.advance(steps)
        if self.clock.paused:
            return
        for order in self.orders:
            if order.remaining_ly <= 0:
                order.progress = 1.0
                continue
            move = order.speed_ly_per_tick * steps
            order.remaining_ly = max(0.0, order.remaining_ly - move)
            if order.distance_ly > 0:
                order.progress = 1.0 - (order.remaining_ly / order.distance_ly)
            else:
                order.progress = 1.0

    def pause(self) -> None:
        self.clock.paused = True

    def resume(self) -> None:
        self.clock.paused = False


# Simulation constants
SECONDS_PER_TICK = 1
MINUTES_PER_TICK = 6
LIGHTYEARS_PER_TICK_DEFAULT = 1.0
LYM_DEFAULT = LIGHTYEARS_PER_TICK_DEFAULT / MINUTES_PER_TICK  # 0.166...
INTRASYSTEM_AU_PER_TICK = 30.0


def infrastructure_speed_multiplier(level: int) -> float:
    level = max(1, level)
    # Diminishing returns: ~1.0 at level 1, ~1.2 at level 3, ~1.35 at level 6
    return 1.0 + 0.25 * log1p(level - 1)

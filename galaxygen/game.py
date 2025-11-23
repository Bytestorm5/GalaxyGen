from __future__ import annotations

from pathlib import Path
from typing import Dict, Optional

import math
from typing import Optional

from .models import (
    INTRASYSTEM_AU_PER_TICK,
    LIGHTYEARS_PER_TICK_DEFAULT,
    GameState,
    Galaxy,
    TravelOrder,
    infrastructure_speed_multiplier,
)
from .storage import load_galaxy, save_json


class GameSession:
    def __init__(self, galaxy: Galaxy):
        self.state = GameState(galaxy=galaxy)

    @classmethod
    def from_file(cls, path: Path) -> "GameSession":
        galaxy = load_galaxy(path)
        return cls(galaxy)

    def tick(self, steps: int = 1) -> None:
        self.state.tick(steps)

    def pause(self) -> None:
        self.state.pause()

    def resume(self) -> None:
        self.state.resume()

    def queue_travel(
        self,
        fleet_id: str,
        origin: int,
        destination: int,
        lane_id: Optional[int] = None,
        speed_ly_per_tick: float = LIGHTYEARS_PER_TICK_DEFAULT,
        hops: int = 0,
    ) -> None:
        dist = 0.0
        if origin < len(self.state.galaxy.stars) and destination < len(self.state.galaxy.stars):
            a = self.state.galaxy.stars[origin].as_tuple()
            b = self.state.galaxy.stars[destination].as_tuple()
            dist = math.dist(a, b)

        infra_level = 1
        try:
            infra_level = min(
                self.state.galaxy.infrastructures[origin],
                self.state.galaxy.infrastructures[destination],
            )
        except Exception:
            infra_level = 1
        speed = speed_ly_per_tick * infrastructure_speed_multiplier(infra_level)

        order = TravelOrder(
            fleet_id=fleet_id,
            origin=origin,
            destination=destination,
            lane_id=lane_id,
            distance_ly=dist + max(hops - 1, 0),  # pass-through cost 1 ly per extra system
            remaining_ly=dist + max(hops - 1, 0),
            speed_ly_per_tick=speed,
            hops=hops,
        )
        self.state.orders.append(order)

    def to_dict(self) -> Dict:
        return self.state.model_dump()

    def save(self, path: Path) -> None:
        save_json(path, self.to_dict())

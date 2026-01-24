from __future__ import annotations

from pathlib import Path
from typing import Dict, Optional

import math
import random

from .models import (
    INTRASYSTEM_AU_PER_TICK,
    LIGHTYEARS_PER_TICK_DEFAULT,
    Ownership,
    GameState,
    Galaxy,
    TravelOrder,
    infrastructure_speed_multiplier,
)
from .storage import load_galaxy, save_json
from .economy import (
    EmpireEconomy,
    PlanetEconomy,
    BuildingInstance,
    default_building_catalog,
    PopulationPyramid,
)


class GameSession:
    def __init__(self, galaxy: Galaxy):
        self.state = GameState(galaxy=galaxy)
        self.economy = self._bootstrap_economy(galaxy)

    @classmethod
    def from_file(cls, path: Path) -> "GameSession":
        galaxy = load_galaxy(path)
        return cls(galaxy)

    def tick(self, steps: int = 1) -> None:
        self.state.tick(steps)
        for _ in range(steps):
            self.economy.econ_tick()
            if self.state.clock.tick % 52 == 0:
                self.economy.demography_tick()

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

    # --- Helpers ------------------------------------------------------------------

    def _bootstrap_economy(self, galaxy: Galaxy) -> EmpireEconomy:
        candidates = [i for i, s in enumerate(galaxy.stars) if -1 not in s.as_tuple()]
        chosen = random.choice(candidates) if candidates else 0
        total_pop = 10_000_000_000
        base_share = total_pop / len(PopulationPyramid().cohorts)
        pyramid = PopulationPyramid(cohorts=[base_share for _ in range(len(PopulationPyramid().cohorts))])
        cat = default_building_catalog()
        planet = PlanetEconomy(id=f"system-{chosen}")
        planet.population = pyramid
        planet.housing.units = total_pop / 3.0
        planet.buildings = [
            BuildingInstance(archetype=cat["F1"], level=3),
            BuildingInstance(archetype=cat["F2"], level=2),
            BuildingInstance(archetype=cat["M1"], level=2),
            BuildingInstance(archetype=cat["M2"], level=1),
            BuildingInstance(archetype=cat["C1"], level=2),
            BuildingInstance(archetype=cat["C2"], level=2),
            BuildingInstance(archetype=cat["H1"], level=2),
            BuildingInstance(archetype=cat["R1"], level=1),
        ]
        economy = EmpireEconomy(planets=[planet])
        return economy

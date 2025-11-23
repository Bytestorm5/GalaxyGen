from __future__ import annotations

from pathlib import Path
from typing import Dict, Optional

from .models import GameState, Galaxy, TravelOrder
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

    def queue_travel(self, fleet_id: str, origin: int, destination: int) -> None:
        self.state.orders.append(TravelOrder(fleet_id=fleet_id, origin=origin, destination=destination))

    def to_dict(self) -> Dict:
        return self.state.model_dump()

    def save(self, path: Path) -> None:
        save_json(path, self.to_dict())

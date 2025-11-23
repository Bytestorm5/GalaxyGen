from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field

from galaxygen.models import GameState


class GameBootstrap(BaseModel):
    galaxy_path: Optional[str] = None


class TickRequest(BaseModel):
    steps: int = Field(1, ge=1)


class TravelRequest(BaseModel):
    fleet_id: str
    origin: int
    destination: int


class GameStateResponse(BaseModel):
    session_id: str
    state: GameState

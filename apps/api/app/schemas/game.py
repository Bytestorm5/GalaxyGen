from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field

from galaxygen.models import GameState
from galaxygen.economy import EmpireEconomy


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


class EconomyResponse(BaseModel):
    session_id: str
    economy: EmpireEconomy


class BudgetUpdate(BaseModel):
    income_tax_rate: float = Field(0.15, ge=0, le=0.9)
    infrastructure_investment: float = Field(0.0, ge=0)
    rd_grants: float = Field(0.0, ge=0)

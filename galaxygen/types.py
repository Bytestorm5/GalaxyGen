from __future__ import annotations

from enum import Enum


class StarType(str, Enum):
    O = "O"
    B = "B"
    A = "A"
    F = "F"
    G = "G"
    K = "K"
    M = "M"


class PlanetType(str, Enum):
    TERRESTRIAL = "terrestrial"
    GAS_GIANT = "gas_giant"
    ICE_GIANT = "ice_giant"
    ASTEROID_BELT = "asteroid_belt"
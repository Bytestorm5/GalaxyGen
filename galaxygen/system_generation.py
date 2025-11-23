from __future__ import annotations

from enum import Enum
from typing import List, Optional

import numpy as np

from .models import Galaxy

GRAVITATIONAL_CONSTANT = 6.67430e-11


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


def _rng_for_star(star, order: Optional[int] = None):
    # deterministic seed from coordinates and optional orbit order
    base = f"{star[0]}{star[1]}"
    suffix = f"{order}" if order is not None else ""
    seed = int(f"{base}{suffix}"[::-1])
    return np.random.default_rng(seed)


def _classify_star(rng: np.random.Generator) -> StarType:
    picked = rng.choice(
        [t.value for t in (StarType.O, StarType.B, StarType.A, StarType.F, StarType.G, StarType.K, StarType.M)],
        p=[0.0000003, 0.0012, 0.0061, 0.03, 0.076, 0.12, 0.7666997],
    )
    return StarType(picked)


def _star_attributes(star_type: StarType, rng: np.random.Generator):
    if star_type == StarType.O:
        temperature = max(rng.gamma(10, 10), 30) * 1000
        solar_mass = max(rng.gamma(10, 10), 16)
        solar_radius = max(rng.gamma(5.198, 10), 6.6)
    elif star_type == StarType.B:
        temperature = rng.uniform(10, 30) * 1000
        solar_mass = rng.uniform(2.1, 16)
        solar_radius = rng.uniform(1.8, 6.6)
    elif star_type == StarType.A:
        temperature = rng.uniform(7.5, 10) * 1000
        solar_mass = rng.uniform(1.4, 2.1)
        solar_radius = rng.uniform(1.4, 1.8)
    elif star_type == StarType.F:
        temperature = rng.uniform(6, 7.5) * 1000
        solar_mass = rng.uniform(1.04, 1.4)
        solar_radius = rng.uniform(1.15, 1.4)
    elif star_type == StarType.G:
        temperature = rng.uniform(5.2, 6) * 1000
        solar_mass = rng.uniform(0.8, 1.04)
        solar_radius = rng.uniform(0.96, 1.15)
    elif star_type == StarType.K:
        temperature = rng.uniform(3.7, 5.2) * 1000
        solar_mass = rng.uniform(0.45, 0.8)
        solar_radius = rng.uniform(0.7, 0.96)
    else:  # M
        temperature = rng.uniform(2.4, 3.7) * 1000
        solar_mass = rng.uniform(0.08, 0.45)
        solar_radius = rng.uniform(0.4, 0.7)
    return temperature, solar_mass, solar_radius


def _planet_for_star(star_type: StarType, star_idx: int, order: int, galaxy_stars) -> Optional[dict]:
    star = galaxy_stars[star_idx]
    if star[0] < 0 or star[1] < 0:
        return None
    rng = _rng_for_star(star, order)

    dist = (0.5 * order) - np.clip(rng.normal(0.25, 0.225), a_min=0.05, a_max=0.45)
    dist = max(0.04, dist)  # AU

    # Orbital Period (days)
    orbit_period = max(10 ** rng.normal(2.5, 0.5), 10)

    # Temperatures
    temp_from_star = None  # placeholder; filled in star profile

    # Classification probabilities
    is_asteroid_belt = False
    is_terrestrial_candidate = True
    if star_type in (StarType.O, StarType.B):
        prob_terrestrial = 0.1
        prob_asteroid_belt = 0.1
    elif star_type in (StarType.A, StarType.F, StarType.G):
        prob_terrestrial = 0.5
        prob_asteroid_belt = 0.3
    else:
        prob_terrestrial = 0.7
        prob_asteroid_belt = 0.5

    roll = rng.random()
    if roll < prob_terrestrial:
        if star_type in (StarType.O, StarType.B):
            return None
        is_asteroid_belt = False
    elif roll < prob_terrestrial + prob_asteroid_belt:
        is_asteroid_belt = True
    else:
        is_asteroid_belt = False

    if is_asteroid_belt:
        return {"type": PlanetType.ASTEROID_BELT.value, "order": order, "dist_au": dist}

    # Planet attributes
    classification = PlanetType.TERRESTRIAL
    earth_mass = rng.uniform(0.1, 10)
    density = rng.uniform(4, 6)
    albedo = rng.uniform(0.1, 0.35)
    water_content = rng.uniform(0, 1) ** 2
    active_core = rng.random() > 0.05

    if star_type in (StarType.O, StarType.B):
        # fallback: should have returned None earlier
        classification = PlanetType.GAS_GIANT
        earth_mass = rng.uniform(90, 600)
        density = rng.uniform(0.7, 1.2)
        albedo = rng.uniform(0.3, 0.5)
    else:
        # adjust based on temp once known; we keep preliminary values
        pass

    return {
        "type": classification.value,
        "order": order,
        "dist_au": dist,
        "orbit_days": orbit_period,
        "water": water_content,
        "active_core": active_core,
        "earth_mass": earth_mass,
        "density": density,
        "albedo": albedo,
    }


def generate_system_profile(galaxy: Galaxy, star_idx: int) -> Optional[dict]:
    if star_idx < 0 or star_idx >= len(galaxy.stars):
        return None
    star_coord = galaxy.stars[star_idx].as_tuple()
    if star_coord[0] < 0 or star_coord[1] < 0:
        return None

    rng = _rng_for_star(star_coord)
    classification = _classify_star(rng)
    temperature, solar_mass, solar_radius = _star_attributes(classification, rng)

    max_bodies = int(rng.integers(5, 10))
    bodies: List[dict] = []
    for order in range(max_bodies):
        body = _planet_for_star(classification, star_idx, order, [s.as_tuple() for s in galaxy.stars])
        if body:
            bodies.append(body)

    return {
        "star_index": star_idx,
        "classification": classification.value,
        "temperature_k": temperature,
        "solar_mass": solar_mass,
        "solar_radius": solar_radius,
        "bodies": bodies,
    }

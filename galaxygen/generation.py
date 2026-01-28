from __future__ import annotations

import random
from pathlib import Path
from typing import List, Optional

import numpy as np
from PIL import Image
from scipy.spatial import Delaunay

from .models import (
    CelestialBody,
    CountryDefinition,
    Galaxy,
    Hyperlane,
    PlanetType,
    ResourceDefinition,
    Star,
)
from .random_names import generate_random_word
from .resources import assign_resources
from .system_generation import generate_system_profile, StarType


def _find_neighbors(index: int, triangulation: Delaunay) -> List[int]:
    start = triangulation.vertex_neighbor_vertices[0][index]
    end = triangulation.vertex_neighbor_vertices[0][index + 1]
    return triangulation.vertex_neighbor_vertices[1][start:end].tolist()


def _midpoint_density(a: np.ndarray, b: np.ndarray, density: np.ndarray) -> float:
    midpoint = np.add(a, b, dtype=int) // 2
    brightness = np.linalg.norm(density[midpoint[1], midpoint[0]]) ** 2
    return float(brightness)


def sample_stars_from_density(
    distribution: np.ndarray, system_count: int, rng: random.Random
) -> List[Star]:
    points: List[tuple[int, int]] = []
    height, width, _ = distribution.shape
    for y in range(height):
        for x in range(width):
            brightness = np.linalg.norm(distribution[y, x]) ** 2
            if rng.random() < brightness:
                points.append((x, y))

    if not points:
        raise ValueError("No candidate points found in distribution map")

    rng.shuffle(points)

    selected: List[tuple[int, int]] = []
    buckets: dict[tuple[int, int], List[tuple[int, int]]] = {}
    cell_size = 5  # enforce min Euclidean distance >= 2
    min_dist_sq = cell_size ** 2

    def can_place(px: int, py: int) -> bool:
        cx, cy = px // cell_size, py // cell_size
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                bucket = buckets.get((cx + dx, cy + dy), [])
                for bx, by in bucket:
                    if (px - bx) ** 2 + (py - by) ** 2 < min_dist_sq:
                        return False
        return True

    for px, py in points:
        if len(selected) >= system_count:
            break
        if not can_place(px, py):
            continue
        selected.append((px, py))
        cell = (px // cell_size, py // cell_size)
        buckets.setdefault(cell, []).append((px, py))

    if len(selected) < system_count:
        raise ValueError(
            f"Could only place {len(selected)} systems with min spacing 2; "
            f"reduce system_count or use a larger/denser distribution map."
        )

    return [Star(x=int(p[0]), y=int(p[1])) for p in selected]


def generate_hyperlanes(
    stars: List[Star], distribution: np.ndarray, rng: random.Random, min_midpoint_density: float = 0.05
) -> List[Hyperlane]:
    as_array = np.array([s.as_tuple() for s in stars])
    if len(stars) < 3:
        lanes: List[Hyperlane] = []
        for idx in range(len(stars) - 1):
            lanes.append(Hyperlane(a=idx, b=idx + 1))
        return lanes

    triangulation = Delaunay(as_array)
    lanes: List[Hyperlane] = []

    for idx, star in enumerate(stars):
        brightness = np.linalg.norm(distribution[star.y, star.x]) ** 2
        desired_connections = int(((brightness + rng.random()) / 2) * 5) + 1

        neighbors = _find_neighbors(idx, triangulation)
        rng.shuffle(neighbors)

        lane_count = 0
        for neighbor_idx in neighbors:
            if lane_count >= desired_connections:
                break

            midpoint_brightness = _midpoint_density(as_array[idx], as_array[neighbor_idx], distribution)
            if midpoint_brightness < min_midpoint_density:
                continue

            lane = Hyperlane(a=idx, b=int(neighbor_idx))
            if lane not in lanes and Hyperlane(a=lane.b, b=lane.a) not in lanes:
                lanes.append(lane)
                lane_count += 1

        if lane_count == 0:
            try:
                fallback = neighbors[0]
                lanes.append(Hyperlane(a=idx, b=int(fallback)))
            except IndexError:
                distances = np.linalg.norm(as_array - as_array[idx], axis=1)
                ordering = np.argsort(distances)
                for candidate in ordering:
                    if candidate != idx:
                        lanes.append(Hyperlane(a=idx, b=int(candidate)))
                        break

    return lanes


def generate_galaxy(
    distribution_path: Path,
    system_count: int,
    resources: Optional[List[ResourceDefinition]] = None,
    rng_seed: Optional[int] = None,
    countries: Optional[List[CountryDefinition]] = None,
    min_midpoint_density: float = 0.05,
) -> Galaxy:
    rng = random.Random(rng_seed)
    image = Image.open(distribution_path).convert("RGB")
    distribution = np.array(image) / 255

    stars = sample_stars_from_density(distribution, system_count, rng)
    hyperlanes = generate_hyperlanes(stars, distribution, rng, min_midpoint_density)

    galaxy = Galaxy(
        width=image.size[0],
        height=image.size[1],
        stars=stars,
        hyperlanes=hyperlanes,
        resources=[],
        countries=countries or [],
    )

    # Generate star details
    for idx, star in enumerate(galaxy.stars):
        profile = generate_system_profile(galaxy, idx, rng_seed or 0)
        if profile:
            star.star_type = StarType(profile['classification'])
            star.name = generate_random_word()
            star.description = f"A {profile['classification']} type star"
            star.bodies = []
            for body in profile["bodies"]:
                name = body.get("name") or generate_random_word()
                if body["type"] == PlanetType.ASTEROID_BELT.value and not name.endswith(" Belt"):
                    name = f"{name} Belt"
                star.bodies.append(
                    CelestialBody(
                        name=name,
                        type=PlanetType(body["type"]),
                        distance_au=body["dist_au"],
                        angle_deg=0.0,  # placeholder
                        radius_km=1000.0,  # placeholder
                    )
                )

    if resources:
        galaxy.resources = assign_resources(resources, galaxy, rng)

    return galaxy

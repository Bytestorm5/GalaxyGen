from __future__ import annotations

import random
from typing import Iterable, List

import numpy as np

from .models import Galaxy, ResourceDefinition, ResourceRegion


def _knn(idx: int, candidates: List[int], stars: np.ndarray, n: int, rng: random.Random) -> List[int]:
    if n <= 0:
        return []

    start = stars[idx]
    distances = np.linalg.norm(stars - start, axis=1)
    ordering = np.argsort(distances)

    results: List[int] = []
    for candidate in ordering:
        if candidate == idx:
            continue
        if candidate in candidates:
            results.append(int(candidate))
        if len(results) >= n:
            break
    rng.shuffle(results)
    return results[:n]


def _radius(point) -> float:
    return float(np.sqrt(point[0] ** 2 + point[1] ** 2))


def _weight_by_centricity(a: float, r: float, galaxy_radius: float) -> float:
    mr = r / galaxy_radius if galaxy_radius else 1.0
    return ((a * mr + (0.5 * (1 - a))) ** max(6 * abs(a), 1))


def _seed_count(rarity: float) -> int:
    return int((2 * (1 - rarity)) ** 2 + 1) + 3


def _cluster_size(rarity: float) -> int:
    return int(9 * (1 - rarity))


def assign_resources(
    resources: Iterable[ResourceDefinition], galaxy: Galaxy, rng: random.Random
) -> List[ResourceRegion]:
    stars = np.array([s.as_tuple() for s in galaxy.stars])
    indices = list(range(len(stars)))
    galaxy_radius = _radius((galaxy.width, galaxy.height))

    assignments: List[ResourceRegion] = []
    for definition in resources:
        if not indices:
            assignments.append(ResourceRegion(id=len(assignments), systems=[]))
            continue

        candidates = list(indices)
        weights = [
            _weight_by_centricity(definition.centricity, _radius(stars[i]), galaxy_radius) for i in candidates
        ]
        if len(weights) != len(candidates):
            # Fallback guard; should never happen, but keeps generation resilient
            weights = [1.0] * len(candidates)

        seed_total = _seed_count(definition.rarity)
        if seed_total <= 0 or not candidates:
            assignments.append(ResourceRegion(id=len(assignments), systems=[]))
            continue

        seeds = rng.choices(
            candidates,
            weights=weights,
            k=min(seed_total, len(candidates)),
        )

        in_systems = seeds.copy()
        for system in in_systems:
            if system in indices:
                indices.remove(system)

        for system in seeds:
            near = _knn(system, indices, stars, _cluster_size(definition.rarity), rng)
            in_systems += near
            for sys in near:
                if sys in indices:
                    indices.remove(sys)

        assignments.append(ResourceRegion(id=len(assignments), systems=list(dict.fromkeys(in_systems))))

    return assignments

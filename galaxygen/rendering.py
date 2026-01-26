from __future__ import annotations

from pathlib import Path
from typing import Iterable, List, Optional, Sequence

import cv2
import numpy as np
from PIL import Image
from scipy.spatial import Voronoi

from .config import GALAXY_MASK_BLUR, GALAXY_MASK_THRESHOLD, SCALE, STAR_SIZE
from .models import CountryDefinition, Galaxy, ResourceDefinition


def pixel_conversion(coord: Sequence[int], scale: int = SCALE, center: bool = True) -> List[int]:
    return [(i * scale) + (int(0.5 * scale) if center else 0) for i in coord]


def inverse_conversion(coord: Sequence[int], scale: int = SCALE, center: bool = True) -> np.ndarray:
    return np.array([(i - (int(0.5 * scale) if center else 0)) // scale for i in coord])


def get_star_cells(star_list: List[Sequence[int]]) -> List[List[List[float]]]:
    voronoi = Voronoi(star_list)

    def get_star_region(star_idx: int) -> np.ndarray:
        return np.array(voronoi.vertices[voronoi.regions[voronoi.point_region[star_idx]]])

    regions_cache: List[List[List[float]]] = []
    for star in range(len(star_list)):
        regions_cache.append(get_star_region(star).tolist())
    return regions_cache


def _create_blank(size: List[int]) -> np.ndarray:
    img = np.array(Image.new("RGB", tuple(size)))
    return img[:, :, ::-1].copy()


def render_galaxy(
    galaxy: Galaxy,
    resource_defs: Iterable[ResourceDefinition],
    country_defs: Iterable[CountryDefinition],
    output_dir: Path,
    distribution_path: Optional[Path] = None,
    scale: int = SCALE,
    star_size: int = STAR_SIZE,
) -> dict:
    output_dir.mkdir(parents=True, exist_ok=True)
    size = [int(galaxy.width) * scale, int(galaxy.height) * scale]

    output_image = _create_blank(size)
    output_mask = _create_blank(size)

    # Draw hyperlanes
    gray = (104, 104, 104)
    for idx, lane in enumerate(galaxy.hyperlanes):
        if lane.a >= len(galaxy.stars) or lane.b >= len(galaxy.stars):
            continue

        start = pixel_conversion(galaxy.stars[lane.a].as_tuple(), scale)
        end = pixel_conversion(galaxy.stars[lane.b].as_tuple(), scale)

        output_image = cv2.line(output_image, start, end, gray, int(star_size * 0.4), cv2.LINE_AA)
        output_mask = cv2.line(output_mask, start, end, (idx // 255, idx % 255, 127), int(star_size * 0.4))

    # Draw stars
    for idx, star in enumerate(galaxy.stars):
        if -1 in star.as_tuple():
            continue
        center = pixel_conversion(star.as_tuple(), scale)
        output_image = cv2.circle(output_image, center, star_size, (255, 255, 255), -1, cv2.LINE_AA)
        output_mask = cv2.circle(output_mask, center, star_size, (idx // 255, idx % 255, 255), -1)

    output_raw = output_image.copy()
    outputs = {
        "mask": output_dir / "output_mask.png",
        "raw": output_dir / "output_raw.png",
        "resources": None,
        "final": output_dir / "output.png",
    }
    cv2.imwrite(str(output_dir / "output_mask.png"), output_mask)
    cv2.imwrite(str(output_dir / "output_raw.png"), output_raw)

    if galaxy.resources:
        regions_cache = get_star_cells([pixel_conversion((star.x, star.y), scale) for star in galaxy.stars])
        density_mask = None
        if distribution_path and distribution_path.exists():
            density = cv2.resize(
                cv2.cvtColor(cv2.imread(str(distribution_path)), cv2.COLOR_BGR2GRAY),
                tuple(np.array(size)),
            )
            _, density_mask = cv2.threshold(density, GALAXY_MASK_THRESHOLD, 255, cv2.THRESH_BINARY)
            density_mask = cv2.cvtColor(density_mask, cv2.COLOR_GRAY2BGR)
            density_mask = cv2.medianBlur(density_mask, GALAXY_MASK_BLUR)

        def apply_overlay(instances, definitions, filename):
            mask = output_raw.copy()
            for entry in instances:
                if entry.id >= len(definitions):
                    continue
                definition = definitions[int(entry.id)]
                color = definition.color
                for star_idx in entry.systems:
                    region = regions_cache[star_idx]
                    mask = cv2.fillPoly(mask, np.int32([region]), (color[2], color[1], color[0]))
                    mask = cv2.polylines(
                        mask,
                        np.int32([region]),
                        True,
                        (0.45 * color[2], 0.45 * color[1], 0.45 * color[0]),
                        int(star_size * 0.4),
                        cv2.LINE_AA,
                    )
            if density_mask is not None:
                mask = cv2.bitwise_and(mask, density_mask)
            blended = cv2.addWeighted(output_raw, 0.5, mask, 0.5, 0)
            cv2.imwrite(str(output_dir / filename), blended)

        apply_overlay(galaxy.resources, list(resource_defs), "output_resources.png")
        outputs["resources"] = output_dir / "output_resources.png"
        apply_overlay(galaxy.ownership, list(country_defs), "output.png")
    else:
        cv2.imwrite(str(output_dir / "output.png"), output_image)

    return outputs

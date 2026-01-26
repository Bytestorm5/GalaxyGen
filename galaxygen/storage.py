from __future__ import annotations

import json
from pathlib import Path
from typing import Iterable, List

from .models import CountryDefinition, Galaxy, ResourceDefinition


def load_json(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def save_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(data, handle, indent=2, ensure_ascii=False)


def load_galaxy(path: Path) -> Galaxy:
    return Galaxy.from_legacy(load_json(path))


def save_galaxy(path: Path, galaxy: Galaxy) -> None:
    save_json(path, galaxy.to_legacy())


def load_resource_definitions(path: Path) -> List[ResourceDefinition]:
    data = load_json(path)
    return [ResourceDefinition(**entry) for entry in data]


def load_country_definitions(path: Path) -> List[CountryDefinition]:
    data = load_json(path)
    return [CountryDefinition(**entry) for entry in data]


def save_country_definitions(path: Path, countries: Iterable[CountryDefinition]) -> None:
    data = [country.dict() for country in countries]
    save_json(path, data)

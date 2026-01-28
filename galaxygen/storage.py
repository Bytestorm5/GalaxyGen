from __future__ import annotations

from typing import Iterable, List

from pymongo import ReturnDocument

from .db import get_database
from .models import (
    CelestialBody,
    CountryDefinition,
    Galaxy,
    Hyperlane,
    ResourceDefinition,
    ResourceRegion,
    Star,
)

_META_ID = "galaxy"


def _strip_doc(doc: dict, *, remove_idx: bool = True) -> dict:
    data = dict(doc)
    data.pop("_id", None)
    if remove_idx:
        data.pop("idx", None)
    return data


def _ensure_meta(db) -> dict:
    meta = db["galaxy_meta"].find_one({"_id": _META_ID})
    if not meta:
        star_count = db["stars"].count_documents({})
        hyperlane_count = db["hyperlanes"].count_documents({})
        resource_count = db["resources"].count_documents({})
        country_count = db["countries"].count_documents({})
        meta = {
            "_id": _META_ID,
            "width": 0,
            "height": 0,
            "star_count": star_count,
            "hyperlane_count": hyperlane_count,
            "resource_count": resource_count,
            "country_count": country_count,
        }
        db["galaxy_meta"].insert_one(meta)
    return meta


def get_galaxy_meta() -> dict:
    db = get_database()
    return _ensure_meta(db)


def load_galaxy(path=None) -> Galaxy:
    db = get_database()
    meta = _ensure_meta(db)

    stars = [Star(**_strip_doc(doc)) for doc in db["stars"].find().sort("idx", 1)]
    hyperlanes = [
        Hyperlane(**_strip_doc(doc)) for doc in db["hyperlanes"].find().sort("idx", 1)
    ]
    resources = [
        ResourceRegion(**_strip_doc(doc)) for doc in db["resources"].find().sort("id", 1)
    ]
    countries = [
        CountryDefinition(**_strip_doc(doc)) for doc in db["countries"].find().sort("idx", 1)
    ]

    return Galaxy(
        width=int(meta.get("width", 0)),
        height=int(meta.get("height", 0)),
        stars=stars,
        hyperlanes=hyperlanes,
        resources=resources,
        countries=countries,
    )


def save_galaxy(path, galaxy: Galaxy) -> None:
    db = get_database()
    db["galaxy_meta"].update_one(
        {"_id": _META_ID},
        {
            "$set": {
                "width": int(galaxy.width),
                "height": int(galaxy.height),
                "star_count": len(galaxy.stars),
                "hyperlane_count": len(galaxy.hyperlanes),
                "resource_count": len(galaxy.resources),
            }
        },
        upsert=True,
    )

    db["stars"].delete_many({})
    if galaxy.stars:
        db["stars"].insert_many(
            [{**star.model_dump(), "idx": idx} for idx, star in enumerate(galaxy.stars)]
        )

    db["hyperlanes"].delete_many({})
    if galaxy.hyperlanes:
        db["hyperlanes"].insert_many(
            [
                {"idx": idx, **lane.model_dump()}
                for idx, lane in enumerate(galaxy.hyperlanes)
            ]
        )

    db["resources"].delete_many({})
    if galaxy.resources:
        db["resources"].insert_many([res.model_dump() for res in galaxy.resources])

    if galaxy.countries:
        save_country_definitions(None, galaxy.countries)


def load_resource_definitions(path=None) -> List[ResourceDefinition]:
    db = get_database()
    return [
        ResourceDefinition(**_strip_doc(doc))
        for doc in db["resource_definitions"].find().sort("idx", 1)
    ]


def save_resource_definitions(path, resources: Iterable[ResourceDefinition]) -> None:
    db = get_database()
    db["resource_definitions"].delete_many({})
    resource_list = list(resources)
    if resource_list:
        db["resource_definitions"].insert_many(
            [
                {**resource.model_dump(), "idx": idx}
                for idx, resource in enumerate(resource_list)
            ]
        )


def load_country_definitions(path=None) -> List[CountryDefinition]:
    db = get_database()
    return [
        CountryDefinition(**_strip_doc(doc))
        for doc in db["countries"].find().sort("idx", 1)
    ]


def save_country_definitions(path, countries: Iterable[CountryDefinition]) -> None:
    db = get_database()
    country_list = list(countries)
    for idx, country in enumerate(country_list):
        db["countries"].replace_one(
            {"idx": idx},
            {**country.model_dump(), "idx": idx},
            upsert=True,
        )
    db["countries"].delete_many({"idx": {"$gte": len(country_list)}})
    db["galaxy_meta"].update_one(
        {"_id": _META_ID},
        {"$set": {"country_count": len(country_list)}},
        upsert=True,
    )


def get_star_count() -> int:
    db = get_database()
    meta = _ensure_meta(db)
    return int(meta.get("star_count", 0))


def update_star(idx: int, star: Star) -> bool:
    db = get_database()
    result = db["stars"].update_one(
        {"idx": idx},
        {"$set": {**star.model_dump(), "idx": idx}},
    )
    return result.matched_count > 0


def update_star_fields(idx: int, fields: dict) -> bool:
    if not fields:
        return False
    db = get_database()
    result = db["stars"].update_one({"idx": idx}, {"$set": fields})
    return result.matched_count > 0


def get_star(idx: int) -> Star | None:
    db = get_database()
    doc = db["stars"].find_one({"idx": idx})
    if not doc:
        return None
    return Star(**_strip_doc(doc))


def add_body(star_idx: int, body: CelestialBody) -> int | None:
    star = get_star(star_idx)
    if not star:
        return None
    star.bodies.append(body)
    update_star(star_idx, star)
    return len(star.bodies) - 1


def update_body(star_idx: int, body_idx: int, body: CelestialBody) -> bool:
    star = get_star(star_idx)
    if not star or body_idx < 0 or body_idx >= len(star.bodies):
        return False
    star.bodies[body_idx] = body
    return update_star(star_idx, star)


def delete_body(star_idx: int, body_idx: int) -> bool:
    star = get_star(star_idx)
    if not star or body_idx < 0 or body_idx >= len(star.bodies):
        return False
    star.bodies = [b for idx, b in enumerate(star.bodies) if idx != body_idx]
    return update_star(star_idx, star)


def add_star(star: Star, width: int, height: int) -> int:
    db = get_database()
    meta = db["galaxy_meta"].find_one_and_update(
        {"_id": _META_ID},
        {
            "$setOnInsert": {
                "hyperlane_count": 0,
                "resource_count": 0,
                "country_count": 0,
            },
            "$inc": {"star_count": 1},
            "$max": {"width": int(width), "height": int(height)},
        },
        upsert=True,
        return_document=ReturnDocument.BEFORE,
    )
    idx = int(meta.get("star_count", 0)) if meta else 0
    db["stars"].insert_one({**star.model_dump(), "idx": idx})
    return idx


def delete_star(idx: int) -> bool:
    db = get_database()
    deleted = db["stars"].delete_one({"idx": idx})
    if deleted.deleted_count == 0:
        return False

    stars_to_shift = list(db["stars"].find({"idx": {"$gt": idx}}).sort("idx", 1))
    for star in stars_to_shift:
        db["stars"].update_one({"_id": star["_id"]}, {"$set": {"idx": star["idx"] - 1}})

    lanes = list(db["hyperlanes"].find().sort("idx", 1))
    updated_lanes = []
    for lane in lanes:
        a = int(lane["a"])
        b = int(lane["b"])
        if a == idx or b == idx:
            continue
        if a > idx:
            a -= 1
        if b > idx:
            b -= 1
        if a == b:
            continue
        updated_lanes.append({"idx": len(updated_lanes), "a": a, "b": b})

    db["hyperlanes"].delete_many({})
    if updated_lanes:
        db["hyperlanes"].insert_many(updated_lanes)

    resources = list(db["resources"].find().sort("id", 1))
    updated_resources = []
    for region in resources:
        systems = [
            (system - 1 if system > idx else system)
            for system in region.get("systems", [])
            if system != idx
        ]
        updated_resources.append({"id": int(region["id"]), "systems": systems})

    db["resources"].delete_many({})
    if updated_resources:
        db["resources"].insert_many(updated_resources)

    db["galaxy_meta"].update_one(
        {"_id": _META_ID},
        {
            "$inc": {"star_count": -1},
            "$set": {
                "hyperlane_count": len(updated_lanes),
                "resource_count": len(updated_resources),
            },
        },
    )
    return True


def add_hyperlane(a: int, b: int) -> int:
    db = get_database()
    existing = db["hyperlanes"].find_one({"$or": [{"a": a, "b": b}, {"a": b, "b": a}]})
    if existing:
        return int(existing["idx"])

    meta = db["galaxy_meta"].find_one_and_update(
        {"_id": _META_ID},
        {
            "$setOnInsert": {
                "width": 0,
                "height": 0,
                "star_count": 0,
                "resource_count": 0,
                "country_count": 0,
            },
            "$inc": {"hyperlane_count": 1},
        },
        upsert=True,
        return_document=ReturnDocument.BEFORE,
    )
    idx = int(meta.get("hyperlane_count", 0)) if meta else 0
    db["hyperlanes"].insert_one({"idx": idx, "a": a, "b": b})
    return idx


def delete_hyperlane(idx: int) -> bool:
    db = get_database()
    deleted = db["hyperlanes"].delete_one({"idx": idx})
    if deleted.deleted_count == 0:
        return False

    lanes_to_shift = list(db["hyperlanes"].find({"idx": {"$gt": idx}}).sort("idx", 1))
    for lane in lanes_to_shift:
        db["hyperlanes"].update_one({"_id": lane["_id"]}, {"$set": {"idx": lane["idx"] - 1}})

    db["galaxy_meta"].update_one(
        {"_id": _META_ID},
        {"$inc": {"hyperlane_count": -1}},
    )
    return True

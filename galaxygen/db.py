from __future__ import annotations

import os

from pymongo import MongoClient
from pymongo.database import Database

_DEFAULT_DB_NAME = "galaxygen"

_client: MongoClient | None = None
_database: Database | None = None
_indexes_ready = False


def _resolve_db_name() -> str:
    return (
        os.getenv("MONGO_DB_NAME")
        or os.getenv("MONGO_DB")
        or _DEFAULT_DB_NAME
    )


def _ensure_indexes(db: Database) -> None:
    db["stars"].create_index("idx", unique=True)
    db["hyperlanes"].create_index("idx", unique=True)
    db["resource_definitions"].create_index("idx", unique=True)
    db["countries"].create_index("idx", unique=True)
    db["resources"].create_index("id", unique=True)


def get_database() -> Database:
    global _client, _database, _indexes_ready
    if _database is None:
        uri = os.getenv("MONGO_URI")
        if not uri:
            raise RuntimeError("MONGO_URI is required to use MongoDB storage")
        _client = MongoClient(uri)
        _database = _client[_resolve_db_name()]
    if not _indexes_ready:
        _ensure_indexes(_database)
        _indexes_ready = True
    return _database

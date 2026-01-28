import mongomock
from pathlib import Path
import sys

from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.append(str(ROOT))

from apps.api.app.main import app
from galaxygen import db as galaxy_db


def _reset_mock_db():
    galaxy_db._client = None
    galaxy_db._database = None
    galaxy_db._indexes_ready = False


def _client():
    return TestClient(app)


def _setup_mock_mongo(monkeypatch):
    monkeypatch.setenv("MONGO_URI", "mongodb://mock")
    monkeypatch.setenv("MONGO_DB", "test_galaxygen")
    monkeypatch.setattr(galaxy_db, "MongoClient", mongomock.MongoClient)
    _reset_mock_db()


def test_fetch_empty_galaxy(monkeypatch):
    _setup_mock_mongo(monkeypatch)
    client = _client()
    response = client.get("/galaxy")
    assert response.status_code == 200
    payload = response.json()
    assert payload["galaxy"]["width"] == 0
    assert payload["galaxy"]["height"] == 0
    assert payload["galaxy"]["stars"] == []
    assert payload["galaxy"]["hyperlanes"] == []
    assert payload["resources"] == []
    assert payload["countries"] == []


def test_add_star_and_update(monkeypatch):
    _setup_mock_mongo(monkeypatch)
    client = _client()
    star = {"x": 12, "y": 34}
    response = client.post("/galaxy/star", json={"star": star, "width": 100, "height": 100})
    assert response.status_code == 200
    assert response.json()["index"] == 0

    response = client.get("/galaxy")
    payload = response.json()
    assert len(payload["galaxy"]["stars"]) == 1
    assert payload["galaxy"]["stars"][0]["x"] == 12
    assert payload["galaxy"]["stars"][0]["y"] == 34

    updated_star = {**payload["galaxy"]["stars"][0], "name": "Delta"}
    response = client.patch("/galaxy/star/0", json={"star": updated_star})
    assert response.status_code == 200

    response = client.get("/galaxy")
    payload = response.json()
    assert payload["galaxy"]["stars"][0]["name"] == "Delta"


def test_add_and_delete_hyperlane(monkeypatch):
    _setup_mock_mongo(monkeypatch)
    client = _client()
    client.post("/galaxy/star", json={"star": {"x": 1, "y": 2}, "width": 10, "height": 10})
    client.post("/galaxy/star", json={"star": {"x": 3, "y": 4}, "width": 10, "height": 10})

    response = client.post("/galaxy/hyperlane", json={"a": 0, "b": 1})
    assert response.status_code == 200
    assert response.json()["index"] == 0

    response = client.get("/galaxy")
    payload = response.json()
    assert len(payload["galaxy"]["hyperlanes"]) == 1

    response = client.delete("/galaxy/hyperlane/0")
    assert response.status_code == 200

    response = client.get("/galaxy")
    payload = response.json()
    assert payload["galaxy"]["hyperlanes"] == []


def test_update_star_meta_and_body(monkeypatch):
    _setup_mock_mongo(monkeypatch)
    client = _client()
    client.post("/galaxy/star", json={"star": {"x": 5, "y": 6}, "width": 10, "height": 10})

    response = client.patch("/galaxy/star/0/meta", json={"name": "Nova", "description": "Test"})
    assert response.status_code == 200

    response = client.get("/galaxy")
    payload = response.json()
    assert payload["galaxy"]["stars"][0]["name"] == "Nova"
    assert payload["galaxy"]["stars"][0]["description"] == "Test"

    body = {"name": "Body A", "type": "terrestrial", "distance_au": 1.0, "angle_deg": 0, "radius_km": 1000}
    response = client.post("/galaxy/star/0/body", json={"body": body})
    assert response.status_code == 200
    assert response.json()["index"] == 0

    body_update = {**body, "name": "Body B"}
    response = client.patch("/galaxy/star/0/body/0", json={"body": body_update})
    assert response.status_code == 200

    response = client.get("/galaxy")
    payload = response.json()
    assert payload["galaxy"]["stars"][0]["bodies"][0]["name"] == "Body B"

    response = client.delete("/galaxy/star/0/body/0")
    assert response.status_code == 200

    response = client.get("/galaxy")
    payload = response.json()
    assert payload["galaxy"]["stars"][0]["bodies"] == []

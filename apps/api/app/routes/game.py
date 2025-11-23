from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException

from galaxygen.storage import load_galaxy

from ..dependencies import get_game_service, get_settings
from ..schemas.game import GameBootstrap, GameStateResponse, TickRequest, TravelRequest

router = APIRouter(prefix="/sessions", tags=["game"])


@router.post("", response_model=GameStateResponse)
def create_session(
    payload: GameBootstrap, settings=Depends(get_settings), service=Depends(get_game_service)
):
    galaxy_path = Path(payload.galaxy_path) if payload.galaxy_path else settings.galaxy_file
    galaxy = load_galaxy(galaxy_path)
    session_id = service.create(galaxy)
    session = service.get(session_id)
    return {"session_id": session_id, "state": session.state}


@router.post("/{session_id}/tick", response_model=GameStateResponse)
def tick(session_id: str, payload: TickRequest, service=Depends(get_game_service)):
    try:
        session = service.get(session_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Session not found")
    session.tick(payload.steps)
    return {"session_id": session_id, "state": session.state}


@router.post("/{session_id}/pause", response_model=GameStateResponse)
def pause(session_id: str, service=Depends(get_game_service)):
    try:
        session = service.get(session_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Session not found")
    session.pause()
    return {"session_id": session_id, "state": session.state}


@router.post("/{session_id}/resume", response_model=GameStateResponse)
def resume(session_id: str, service=Depends(get_game_service)):
    try:
        session = service.get(session_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Session not found")
    session.resume()
    return {"session_id": session_id, "state": session.state}


@router.post("/{session_id}/orders", response_model=GameStateResponse)
def queue_travel(session_id: str, payload: TravelRequest, service=Depends(get_game_service)):
    try:
        session = service.get(session_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Session not found")
    session.queue_travel(payload.fleet_id, payload.origin, payload.destination)
    return {"session_id": session_id, "state": session.state}

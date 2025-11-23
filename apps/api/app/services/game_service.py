from __future__ import annotations

import uuid
from typing import Dict

from galaxygen.game import GameSession
from galaxygen.models import Galaxy


class GameService:
    def __init__(self):
        self.sessions: Dict[str, GameSession] = {}

    def create(self, galaxy: Galaxy) -> str:
        session_id = uuid.uuid4().hex
        self.sessions[session_id] = GameSession(galaxy)
        return session_id

    def get(self, session_id: str) -> GameSession:
        if session_id not in self.sessions:
            raise KeyError(session_id)
        return self.sessions[session_id]

    def delete(self, session_id: str) -> None:
        if session_id in self.sessions:
            del self.sessions[session_id]

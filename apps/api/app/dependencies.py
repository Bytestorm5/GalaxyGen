from functools import lru_cache

from .config import Settings
from .services.game_service import GameService


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


@lru_cache(maxsize=1)
def get_game_service() -> GameService:
    return GameService()

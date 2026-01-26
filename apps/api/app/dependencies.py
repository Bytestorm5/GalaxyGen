from functools import lru_cache

from .config import Settings


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()

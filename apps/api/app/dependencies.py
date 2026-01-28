from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv

from .config import Settings

_ENV_PATH = Path(__file__).resolve().parents[3] / "deploy" / ".env"
if _ENV_PATH.exists():
    load_dotenv(_ENV_PATH)

@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()

from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings

from galaxygen.config import DEFAULT_DISTRIBUTION


class Settings(BaseSettings):
    mongo_uri: str = Field(..., validation_alias="MONGO_URI")
    mongo_db: str = Field("galaxygen", validation_alias="MONGO_DB")
    distribution_map: Path = DEFAULT_DISTRIBUTION
    render_output: Path = Path(__file__).resolve().parents[3] / "build" / "renders"

    class Config:
        env_prefix = "ASARTO_"
        case_sensitive = False

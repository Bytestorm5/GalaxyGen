from pathlib import Path
from pydantic_settings import BaseSettings

from galaxygen.config import (
    DEFAULT_COUNTRIES,
    DEFAULT_DISTRIBUTION,
    DEFAULT_GALAXY,
    DEFAULT_RESOURCES,
)


class Settings(BaseSettings):
    data_dir: Path = Path(__file__).resolve().parents[3] / "data"
    galaxy_file: Path = DEFAULT_GALAXY
    distribution_map: Path = DEFAULT_DISTRIBUTION
    resources_file: Path = DEFAULT_RESOURCES
    countries_file: Path = DEFAULT_COUNTRIES
    render_output: Path = DEFAULT_GALAXY.parent

    class Config:
        env_prefix = "ASARTO_"
        case_sensitive = False

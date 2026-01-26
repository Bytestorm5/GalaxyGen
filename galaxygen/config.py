from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT_DIR / "data"
DEFAULT_GALAXY = DATA_DIR / "galaxies" / "default" / "galaxy.json"
DEFAULT_DISTRIBUTION = DATA_DIR / "assets" / "Distribution.png"
DEFAULT_RESOURCES = DATA_DIR / "assets" / "resources.json"
DEFAULT_COUNTRIES = DATA_DIR / "assets" / "countries.json"

# Rendering defaults
SCALE = 10
STAR_SIZE = 3
GALAXY_MASK_THRESHOLD = 12
GALAXY_MASK_BLUR = 29

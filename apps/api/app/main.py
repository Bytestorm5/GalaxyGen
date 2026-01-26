from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os

from .dependencies import get_settings
from .routes import galaxy

settings = get_settings()

app = FastAPI(title="Asarto API", version="0.1.0")

raw_origins = os.getenv("ASARTO_CORS_ORIGINS", "*")
cors_origins = [origin.strip() for origin in raw_origins.split(",") if origin.strip()]
allow_credentials = os.getenv("ASARTO_CORS_ALLOW_CREDENTIALS", "false").lower() in (
    "1",
    "true",
    "yes",
)
if allow_credentials and "*" in cors_origins:
    allow_credentials = False

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(galaxy.router)


@app.get("/health")
def health():
    return {"status": "ok", "data_dir": str(settings.data_dir)}

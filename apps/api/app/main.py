from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .dependencies import get_settings
from .routes import galaxy

settings = get_settings()

app = FastAPI(title="Asarto API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(galaxy.router)


@app.get("/health")
def health():
    return {"status": "ok", "data_dir": str(settings.data_dir)}

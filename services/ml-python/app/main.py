from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.routes import health, detection, hindcast, ais, dossier
from app.core.config import settings

app = FastAPI(
    title="Oil Spill ML & Hydrodynamic Hindcast Engine",
    version="0.1.0",
    description="SAR Segmentation, Super Resolution, and GNOME Reverse Drift API"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api/v1/health", tags=["Health"])
app.include_router(detection.router, prefix="/api/v1/detection", tags=["Detection"])
app.include_router(hindcast.router, prefix="/api/v1/hindcast", tags=["Hindcast"])
app.include_router(ais.router, prefix="/api/v1/ais", tags=["AIS"])
app.include_router(dossier.router, prefix="/api/v1/dossier", tags=["Dossier"])

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=settings.PORT, reload=True)

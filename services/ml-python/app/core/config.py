import os
from pydantic import BaseModel


class Settings(BaseModel):
    PORT: int = int(os.getenv("PORT", 8000))
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")
    DEMO_MODE: bool = os.getenv("DEMO_MODE", "true").lower() in ["true", "1", "yes"]
    MODEL_WEIGHTS_DIR: str = os.getenv("MODEL_WEIGHTS_DIR", "ml/model_registry/versions")
    TILE_SIZE: int = int(os.getenv("TILE_SIZE", 512))
    STRIDE: int = int(os.getenv("STRIDE", 448))


settings = Settings()

from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    database_url: str
    secret_key: str
    access_token_expire_minutes: int = 1440
    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.8-flash"
    frontend_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    upload_dir: str = "uploads"
    model_path: str = "models/emergency_health_xgb.joblib"
    hospital_code: str = "HLX-001"
    hospital_name: str = "Helix Central Hospital"
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def origins(self):
        return [x.strip() for x in self.frontend_origins.split(",") if x.strip()]

settings = Settings()
Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)
Path(settings.model_path).parent.mkdir(parents=True, exist_ok=True)

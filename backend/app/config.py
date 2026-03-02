from pydantic import BaseModel


class Settings(BaseModel):
    database_url: str = "sqlite:////tmp/rinklink.db"
    cors_origins: list[str] = ["http://localhost:5173"]


settings = Settings()

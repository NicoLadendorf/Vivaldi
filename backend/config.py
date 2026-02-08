import os
from dataclasses import dataclass
from pathlib import Path

@dataclass(frozen=True)
class Config:
    # Storage
    BASE_DIR: Path = Path(__file__).resolve().parent
    DATA_DIR: Path = BASE_DIR / "data"
    UPLOAD_DIR: Path = DATA_DIR / "uploads"

    # DB
    DATABASE_URL: str = os.getenv("DATABASE_URL", f"sqlite:///{(DATA_DIR / 'app.db').as_posix()}")

    # OMR
    # provider: "musicxml_only" (default) or "audiveris"
    OMR_PROVIDER: str = os.getenv("OMR_PROVIDER", "musicxml_only").lower()
    # For audiveris provider:
    # - If AUDIVERIS_CMD is set, it is executed as a shell command template:
    #   It should contain {input} and {outdir} placeholders.
    #   Example: audiveris -batch -export -output "{outdir}" "{input}"
    # - Else we try to call "audiveris" from PATH with that same pattern.
    AUDIVERIS_CMD: str | None = os.getenv("AUDIVERIS_CMD")

    # Security / limits
    MAX_CONTENT_LENGTH_BYTES: int = int(os.getenv("MAX_CONTENT_LENGTH_BYTES", str(25 * 1024 * 1024)))  # 25 MB

def ensure_dirs(cfg: Config) -> None:
    cfg.DATA_DIR.mkdir(parents=True, exist_ok=True)
    cfg.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

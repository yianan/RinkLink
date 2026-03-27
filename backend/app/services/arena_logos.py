from __future__ import annotations

from pathlib import Path
import uuid

from fastapi import HTTPException, UploadFile
from sqlalchemy.orm import Session

from ..models import Arena
from .media_paths import ensure_upload_media_dir, is_upload_media_path, media_file_path, upload_media_dir

ARENA_LOGO_KIND = "arena-logos"
ALLOWED_ARENA_LOGO_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".svg"}
MAX_ARENA_LOGO_BYTES = 4 * 1024 * 1024


def ensure_arena_logo_dir() -> None:
    ensure_upload_media_dir(ARENA_LOGO_KIND)


def arena_logo_url(logo_path: str | None) -> str | None:
    if not logo_path:
        return None
    return f"/api/arena-logos/{Path(logo_path).name}"


def arena_logo_file_path(logo_path: str) -> Path:
    filename = Path(logo_path).name
    if filename != logo_path:
        raise HTTPException(404, "Logo not found")
    ensure_arena_logo_dir()
    try:
        file_path = media_file_path(ARENA_LOGO_KIND, filename)
    except FileNotFoundError:
        raise HTTPException(404, "Logo not found")
    return file_path


async def save_arena_logo_upload(arena_id: str, file: UploadFile) -> str:
    ensure_arena_logo_dir()
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_ARENA_LOGO_SUFFIXES:
        raise HTTPException(400, "Logo must be a PNG, JPG, WEBP, or SVG file")
    payload = await file.read()
    if not payload:
        raise HTTPException(400, "Uploaded logo is empty")
    if len(payload) > MAX_ARENA_LOGO_BYTES:
        raise HTTPException(400, "Logo must be 4 MB or smaller")
    filename = f"arena-{arena_id}-{uuid.uuid4().hex}{suffix}"
    file_path = upload_media_dir(ARENA_LOGO_KIND) / filename
    file_path.write_bytes(payload)
    return filename


def delete_arena_logo_if_unused(db: Session, logo_path: str | None, *, ignore_arena_id: str | None = None) -> None:
    if not logo_path:
        return
    query = db.query(Arena).filter(Arena.logo_path == logo_path)
    if ignore_arena_id:
        query = query.filter(Arena.id != ignore_arena_id)
    if query.first():
        return
    file_path = upload_media_dir(ARENA_LOGO_KIND) / Path(logo_path).name
    if file_path.exists() and is_upload_media_path(ARENA_LOGO_KIND, file_path):
        file_path.unlink()

from __future__ import annotations

from pathlib import Path
import uuid

from fastapi import HTTPException, UploadFile
from sqlalchemy.orm import Session

from ..models import Association
from .media_paths import ensure_upload_media_dir, is_upload_media_path, media_file_path, upload_media_dir

ASSOCIATION_LOGO_KIND = "association-logos"
ALLOWED_ASSOCIATION_LOGO_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".svg"}
MAX_ASSOCIATION_LOGO_BYTES = 4 * 1024 * 1024


def ensure_association_logo_dir() -> None:
    ensure_upload_media_dir(ASSOCIATION_LOGO_KIND)


def association_logo_url(logo_path: str | None) -> str | None:
    if not logo_path:
        return None
    return f"/api/association-logos/{Path(logo_path).name}"


def association_logo_file_path(logo_path: str) -> Path:
    filename = Path(logo_path).name
    if filename != logo_path:
        raise HTTPException(404, "Logo not found")
    ensure_association_logo_dir()
    try:
        file_path = media_file_path(ASSOCIATION_LOGO_KIND, filename)
    except FileNotFoundError:
        raise HTTPException(404, "Logo not found")
    return file_path


async def save_association_logo_upload(association_id: str, file: UploadFile) -> str:
    ensure_association_logo_dir()
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_ASSOCIATION_LOGO_SUFFIXES:
        raise HTTPException(400, "Logo must be a PNG, JPG, WEBP, or SVG file")
    payload = await file.read()
    if not payload:
        raise HTTPException(400, "Uploaded logo is empty")
    if len(payload) > MAX_ASSOCIATION_LOGO_BYTES:
        raise HTTPException(400, "Logo must be 4 MB or smaller")
    filename = f"association-{association_id}-{uuid.uuid4().hex}{suffix}"
    file_path = upload_media_dir(ASSOCIATION_LOGO_KIND) / filename
    file_path.write_bytes(payload)
    return filename


def delete_association_logo_if_unused(db: Session, logo_path: str | None, *, ignore_association_id: str | None = None) -> None:
    if not logo_path:
        return
    query = db.query(Association).filter(Association.logo_path == logo_path)
    if ignore_association_id:
        query = query.filter(Association.id != ignore_association_id)
    if query.first():
        return
    file_path = upload_media_dir(ASSOCIATION_LOGO_KIND) / Path(logo_path).name
    if file_path.exists() and is_upload_media_path(ASSOCIATION_LOGO_KIND, file_path):
        file_path.unlink()

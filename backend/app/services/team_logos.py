from __future__ import annotations

from pathlib import Path
import uuid

from fastapi import HTTPException, UploadFile
from sqlalchemy.orm import Session

from ..models import Association, Team
from .association_logos import association_logo_url
from .media_paths import ensure_upload_media_dir, is_upload_media_path, media_file_path, upload_media_dir

TEAM_LOGO_KIND = "team-logos"
ALLOWED_TEAM_LOGO_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".svg"}
MAX_TEAM_LOGO_BYTES = 4 * 1024 * 1024


def ensure_team_logo_dir() -> None:
    ensure_upload_media_dir(TEAM_LOGO_KIND)


def team_logo_url(logo_path: str | None) -> str | None:
    if not logo_path:
        return None
    return f"/api/team-logos/{Path(logo_path).name}"


def effective_team_logo_url(team: Team | None, association: Association | None = None) -> str | None:
    if not team:
        return None
    if team.logo_path:
        return team_logo_url(team.logo_path)
    assoc = association if association is not None else getattr(team, "association", None)
    return association_logo_url(assoc.logo_path if assoc else None)


def team_logo_file_path(logo_path: str) -> Path:
    filename = Path(logo_path).name
    if filename != logo_path:
        raise HTTPException(404, "Logo not found")
    ensure_team_logo_dir()
    try:
        file_path = media_file_path(TEAM_LOGO_KIND, filename)
    except FileNotFoundError:
        raise HTTPException(404, "Logo not found")
    return file_path


async def save_team_logo_upload(team_id: str, file: UploadFile) -> str:
    ensure_team_logo_dir()
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_TEAM_LOGO_SUFFIXES:
        raise HTTPException(400, "Logo must be a PNG, JPG, WEBP, or SVG file")
    payload = await file.read()
    if not payload:
        raise HTTPException(400, "Uploaded logo is empty")
    if len(payload) > MAX_TEAM_LOGO_BYTES:
        raise HTTPException(400, "Logo must be 4 MB or smaller")
    filename = f"team-{team_id}-{uuid.uuid4().hex}{suffix}"
    file_path = upload_media_dir(TEAM_LOGO_KIND) / filename
    file_path.write_bytes(payload)
    return filename


def delete_logo_if_unused(db: Session, logo_path: str | None, *, ignore_team_id: str | None = None) -> None:
    if not logo_path:
        return
    query = db.query(Team).filter(Team.logo_path == logo_path)
    if ignore_team_id:
        query = query.filter(Team.id != ignore_team_id)
    if query.first():
        return
    file_path = upload_media_dir(TEAM_LOGO_KIND) / Path(logo_path).name
    if file_path.exists() and is_upload_media_path(TEAM_LOGO_KIND, file_path):
        file_path.unlink()

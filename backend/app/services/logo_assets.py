from __future__ import annotations

import hashlib
import mimetypes
from pathlib import Path

from fastapi import HTTPException, UploadFile
from sqlalchemy.orm import Session
from starlette.responses import Response

from ..models import MediaAsset
from .media_paths import bundled_media_dir, media_file_path

ALLOWED_LOGO_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".svg"}
MAX_LOGO_BYTES = 4 * 1024 * 1024


def _normalized_filename(filename: str | None) -> str:
    name = Path(filename or "").name
    if not name:
        raise HTTPException(400, "Logo filename is required")
    return name


def _content_type_for_filename(filename: str, declared_content_type: str | None = None) -> str:
    if declared_content_type and declared_content_type.strip():
        return declared_content_type.strip()
    guessed, _ = mimetypes.guess_type(filename)
    return guessed or "application/octet-stream"


def _validate_logo_payload(*, filename: str, payload: bytes) -> None:
    suffix = Path(filename).suffix.lower()
    if suffix not in ALLOWED_LOGO_SUFFIXES:
        raise HTTPException(400, "Logo must be a PNG, JPG, WEBP, or SVG file")
    if not payload:
        raise HTTPException(400, "Uploaded logo is empty")
    if len(payload) > MAX_LOGO_BYTES:
        raise HTTPException(400, "Logo must be 4 MB or smaller")


async def read_logo_upload(file: UploadFile) -> tuple[str, bytes, str]:
    filename = _normalized_filename(file.filename)
    payload = await file.read()
    _validate_logo_payload(filename=filename, payload=payload)
    return filename, payload, _content_type_for_filename(filename, file.content_type)


def create_media_asset(
    db: Session,
    *,
    kind: str,
    filename: str,
    payload: bytes,
    content_type: str,
) -> MediaAsset:
    _validate_logo_payload(filename=filename, payload=payload)
    asset = MediaAsset(
        kind=kind,
        filename=filename,
        content_type=content_type,
        size_bytes=len(payload),
        sha256=hashlib.sha256(payload).hexdigest(),
        data=payload,
    )
    db.add(asset)
    db.flush()
    return asset


def create_bundled_media_asset(
    db: Session,
    *,
    kind: str,
    bundled_kind: str,
    filename: str,
) -> MediaAsset:
    file_path = bundled_media_dir(bundled_kind) / Path(filename).name
    if not file_path.is_file():
        raise FileNotFoundError(file_path)
    payload = file_path.read_bytes()
    return create_media_asset(
        db,
        kind=kind,
        filename=file_path.name,
        payload=payload,
        content_type=_content_type_for_filename(file_path.name),
    )


def media_asset_url(route_prefix: str, asset_id: str | None, legacy_logo_path: str | None = None) -> str | None:
    if asset_id:
        return f"/api/{route_prefix}/{asset_id}"
    if legacy_logo_path:
        return f"/api/{route_prefix}/{Path(legacy_logo_path).name}"
    return None


def media_asset_response(db: Session, *, asset_ref: str, kind: str, legacy_kind: str) -> Response:
    asset = db.get(MediaAsset, asset_ref)
    if asset is not None:
        if asset.kind != kind:
            raise HTTPException(404, "Logo not found")
        return Response(asset.data, media_type=asset.content_type)
    return Response(
        content=media_file_path(legacy_kind, asset_ref).read_bytes(),
        media_type=_content_type_for_filename(asset_ref),
    )

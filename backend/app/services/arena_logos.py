from __future__ import annotations

from fastapi import UploadFile
from sqlalchemy.orm import Session
from starlette.responses import Response

from ..models import Arena, MediaAsset
from .logo_assets import create_media_asset, media_asset_response, media_asset_url, read_logo_upload

ARENA_LOGO_KIND = "arena-logo"
ARENA_LOGO_ROUTE = "arena-logos"
LEGACY_ARENA_LOGO_KIND = "arena-logos"


def arena_logo_url(logo_asset_id: str | None, logo_path: str | None = None) -> str | None:
    return media_asset_url(ARENA_LOGO_ROUTE, logo_asset_id, logo_path)


def arena_logo_response(db: Session, asset_ref: str) -> Response:
    return media_asset_response(
        db,
        asset_ref=asset_ref,
        kind=ARENA_LOGO_KIND,
        legacy_kind=LEGACY_ARENA_LOGO_KIND,
    )


async def save_arena_logo_upload(db: Session, arena_id: str, file: UploadFile) -> str:
    filename, payload, content_type = await read_logo_upload(file)
    asset = create_media_asset(
        db,
        kind=ARENA_LOGO_KIND,
        filename=f"arena-{arena_id}-{filename}",
        payload=payload,
        content_type=content_type,
    )
    return asset.id


def delete_arena_logo_if_unused(db: Session, logo_asset_id: str | None, *, ignore_arena_id: str | None = None) -> None:
    if not logo_asset_id:
        return
    query = db.query(Arena).filter(Arena.logo_asset_id == logo_asset_id)
    if ignore_arena_id:
        query = query.filter(Arena.id != ignore_arena_id)
    if query.first():
        return
    asset = db.get(MediaAsset, logo_asset_id)
    if asset is not None:
        db.delete(asset)
        db.commit()

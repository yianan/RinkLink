from __future__ import annotations

from fastapi import UploadFile
from sqlalchemy.orm import Session
from starlette.responses import Response

from ..models import Association, MediaAsset
from .logo_assets import create_media_asset, media_asset_response, media_asset_url, read_logo_upload

ASSOCIATION_LOGO_KIND = "association-logo"
ASSOCIATION_LOGO_ROUTE = "association-logos"
LEGACY_ASSOCIATION_LOGO_KIND = "association-logos"


def association_logo_url(logo_asset_id: str | None, logo_path: str | None = None) -> str | None:
    return media_asset_url(ASSOCIATION_LOGO_ROUTE, logo_asset_id, logo_path)


def association_logo_response(db: Session, asset_ref: str) -> Response:
    return media_asset_response(
        db,
        asset_ref=asset_ref,
        kind=ASSOCIATION_LOGO_KIND,
        legacy_kind=LEGACY_ASSOCIATION_LOGO_KIND,
    )


async def save_association_logo_upload(db: Session, association_id: str, file: UploadFile) -> str:
    filename, payload, content_type = await read_logo_upload(file)
    asset = create_media_asset(
        db,
        kind=ASSOCIATION_LOGO_KIND,
        filename=f"association-{association_id}-{filename}",
        payload=payload,
        content_type=content_type,
    )
    return asset.id


def delete_association_logo_if_unused(db: Session, logo_asset_id: str | None, *, ignore_association_id: str | None = None) -> None:
    if not logo_asset_id:
        return
    query = db.query(Association).filter(Association.logo_asset_id == logo_asset_id)
    if ignore_association_id:
        query = query.filter(Association.id != ignore_association_id)
    if query.first():
        return
    asset = db.get(MediaAsset, logo_asset_id)
    if asset is not None:
        db.delete(asset)
        db.commit()

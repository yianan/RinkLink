from __future__ import annotations

from fastapi import UploadFile
from sqlalchemy.orm import Session
from starlette.responses import Response

from ..models import Association, MediaAsset, Team
from .association_logos import association_logo_url
from .logo_assets import create_media_asset, media_asset_response, media_asset_url, read_logo_upload

TEAM_LOGO_KIND = "team-logo"
TEAM_LOGO_ROUTE = "team-logos"
LEGACY_TEAM_LOGO_KIND = "team-logos"


def team_logo_url(logo_asset_id: str | None, logo_path: str | None = None) -> str | None:
    return media_asset_url(TEAM_LOGO_ROUTE, logo_asset_id, logo_path)


def effective_team_logo_url(team: Team | None, association: Association | None = None) -> str | None:
    if not team:
        return None
    if team.logo_asset_id or team.logo_path:
        return team_logo_url(team.logo_asset_id, team.logo_path)
    assoc = association if association is not None else getattr(team, "association", None)
    if not assoc:
        return None
    return association_logo_url(assoc.logo_asset_id, assoc.logo_path)


def team_logo_response(db: Session, asset_ref: str) -> Response:
    return media_asset_response(
        db,
        asset_ref=asset_ref,
        kind=TEAM_LOGO_KIND,
        legacy_kind=LEGACY_TEAM_LOGO_KIND,
    )


async def save_team_logo_upload(db: Session, team_id: str, file: UploadFile) -> str:
    filename, payload, content_type = await read_logo_upload(file)
    asset = create_media_asset(
        db,
        kind=TEAM_LOGO_KIND,
        filename=f"team-{team_id}-{filename}",
        payload=payload,
        content_type=content_type,
    )
    return asset.id


def delete_logo_if_unused(db: Session, logo_asset_id: str | None, *, ignore_team_id: str | None = None) -> None:
    if not logo_asset_id:
        return
    query = db.query(Team).filter(Team.logo_asset_id == logo_asset_id)
    if ignore_team_id:
        query = query.filter(Team.id != ignore_team_id)
    if query.first():
        return
    asset = db.get(MediaAsset, logo_asset_id)
    if asset is not None:
        db.delete(asset)
        db.commit()

from __future__ import annotations

import pytest
from fastapi import HTTPException

from app.services.logo_assets import create_media_asset, media_asset_response


def test_media_asset_response_returns_db_asset(db):
    asset = create_media_asset(
        db,
        kind="team-logo",
        filename="demo.svg",
        payload=b"<svg />",
        content_type="image/svg+xml",
    )
    db.commit()

    response = media_asset_response(
        db,
        asset_ref=asset.id,
        kind="team-logo",
        legacy_kind="team-logos",
    )

    assert response.body == b"<svg />"
    assert response.media_type == "image/svg+xml"


def test_media_asset_response_returns_404_for_missing_logo_ref(db):
    with pytest.raises(HTTPException) as exc_info:
        media_asset_response(
            db,
            asset_ref="09d33c49-087f-46dd-a327-4cdb8206bb47",
            kind="team-logo",
            legacy_kind="team-logos",
        )

    assert exc_info.value.status_code == 404
    assert exc_info.value.detail == "Logo not found"

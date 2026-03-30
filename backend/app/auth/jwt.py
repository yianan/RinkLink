from __future__ import annotations

from typing import Any

import jwt as pyjwt

from ..config import settings
from .jwks import get_signing_key


def decode_access_token(token: str) -> dict[str, Any]:
    header = pyjwt.get_unverified_header(token)
    key = get_signing_key(header.get("kid"))

    return pyjwt.decode(
        token,
        key=key,
        algorithms=["EdDSA", "RS256"],
        issuer=settings.auth_issuer,
        audience=settings.auth_audience,
        options={"require": ["exp", "iat", "sub"]},
    )

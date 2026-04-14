from app.main import _is_allowed_auth_proxy_path


def test_security_settings_auth_routes_are_allowlisted() -> None:
    assert _is_allowed_auth_proxy_path("list-accounts") is True
    assert _is_allowed_auth_proxy_path("list-sessions") is True
    assert _is_allowed_auth_proxy_path("request-password-reset") is True
    assert _is_allowed_auth_proxy_path("delete-user/callback") is True


def test_unknown_auth_routes_remain_blocked() -> None:
    assert _is_allowed_auth_proxy_path("admin/list-users") is False
    assert _is_allowed_auth_proxy_path("../list-accounts") is False

from __future__ import annotations

from pathlib import Path

from ..config import settings

BUNDLED_MEDIA_ROOT = Path(__file__).resolve().parents[2] / "media"
UPLOAD_MEDIA_ROOT = settings.media_root


def upload_media_dir(kind: str) -> Path:
    return UPLOAD_MEDIA_ROOT / kind


def bundled_media_dir(kind: str) -> Path:
    return BUNDLED_MEDIA_ROOT / kind


def ensure_upload_media_dir(kind: str) -> Path:
    path = upload_media_dir(kind)
    path.mkdir(parents=True, exist_ok=True)
    return path


def media_file_path(kind: str, filename: str) -> Path:
    if Path(filename).name != filename:
        raise FileNotFoundError(filename)
    upload_path = upload_media_dir(kind) / filename
    if upload_path.is_file():
        return upload_path
    bundled_path = bundled_media_dir(kind) / filename
    if bundled_path.is_file():
        return bundled_path
    raise FileNotFoundError(filename)


def is_upload_media_path(kind: str, path: Path) -> bool:
    return path.resolve().parent == upload_media_dir(kind).resolve()

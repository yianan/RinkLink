from __future__ import annotations

from ..database import SessionLocal
from .pinned_admins import repair_pinned_platform_admins


def main() -> int:
    db = SessionLocal()
    try:
        repaired = repair_pinned_platform_admins(db)
    finally:
        db.close()
    print(f"Repaired {repaired} pinned platform admin user(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

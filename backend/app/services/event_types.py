from fastapi import HTTPException


EVENT_TYPES = frozenset({"league", "practice", "showcase", "scrimmage", "exhibition"})


def validate_event_type(event_type: str) -> None:
    if event_type not in EVENT_TYPES:
        raise HTTPException(400, "Unsupported event type")

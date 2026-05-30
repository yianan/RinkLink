import pytest
from fastapi import HTTPException

from app.services.event_types import validate_event_type


@pytest.mark.parametrize("event_type", ["league", "practice", "showcase", "scrimmage", "exhibition"])
def test_supported_event_types_are_accepted(event_type: str) -> None:
    validate_event_type(event_type)


@pytest.mark.parametrize("event_type", ["tournament", "state_tournament", "district", "unknown"])
def test_removed_or_unknown_event_types_are_rejected(event_type: str) -> None:
    with pytest.raises(HTTPException) as exc_info:
        validate_event_type(event_type)

    assert exc_info.value.status_code == 400
    assert exc_info.value.detail == "Unsupported event type"

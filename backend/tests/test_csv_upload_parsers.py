from __future__ import annotations

from app.services.csv_parser import parse_csv
from app.services.ice_slot_csv_parser import parse_ice_slot_csv


def test_availability_csv_warns_for_unsupported_date_formats() -> None:
    preview = parse_csv(
        "\n".join(
            [
                "Date,Time,Home/Away,Notes",
                "31/12/2026,18:30,Home,European format",
                "20261231,18:30,Away,Compact format",
            ]
        )
    )

    assert preview.entries == []
    assert len(preview.warnings) == 2
    assert "Row 2: Unrecognized date format: 31/12/2026" in preview.warnings[0]
    assert "YYYY-MM-DD" in preview.warnings[0]
    assert "Row 3: Unrecognized date format: 20261231" in preview.warnings[1]


def test_availability_csv_warns_for_invalid_time_when_present() -> None:
    preview = parse_csv("Date,Time,Home/Away\n2026-12-31,25:99,Home\n")

    assert preview.entries == []
    assert len(preview.warnings) == 1
    assert "Row 2: Unrecognized time format: 25:99" in preview.warnings[0]
    assert "HH:MM" in preview.warnings[0]


def test_ice_slot_csv_warns_for_unsupported_date_and_time_formats() -> None:
    preview = parse_ice_slot_csv(
        "\n".join(
            [
                "Date,Start Time,End Time,Price",
                "31/12/2026,18:30,19:30,300",
                "2026-12-31,25:99,19:30,300",
            ]
        )
    )

    assert preview.entries == []
    assert len(preview.warnings) == 2
    assert "Row 2: Unrecognized date format: 31/12/2026" in preview.warnings[0]
    assert "Row 3: Unrecognized time format: 25:99" in preview.warnings[1]

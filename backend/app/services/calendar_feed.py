from __future__ import annotations

import base64
import hashlib
import hmac
import json
from datetime import date, datetime, time, timezone
from urllib.parse import urlencode

from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..config import settings
from ..models import AvailabilityWindow, Event, Team
from .event_view import enrich_event


def _secret() -> bytes:
    if not settings.calendar_token_secret:
        raise HTTPException(503, "Calendar feeds are not configured")
    return settings.calendar_token_secret.encode("utf-8")


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def _unb64(data: str) -> bytes:
    return base64.urlsafe_b64decode(data + "=" * (-len(data) % 4))


def create_calendar_token(team_id: str) -> str:
    payload = _b64(json.dumps({"team_id": team_id}, separators=(",", ":")).encode("utf-8"))
    signature = _b64(hmac.new(_secret(), payload.encode("ascii"), hashlib.sha256).digest())
    return f"{payload}.{signature}"


def read_calendar_token(token: str) -> str:
    try:
        payload, signature = token.split(".", 1)
    except ValueError as exc:
        raise HTTPException(401, "Invalid calendar token") from exc
    expected = _b64(hmac.new(_secret(), payload.encode("ascii"), hashlib.sha256).digest())
    if not hmac.compare_digest(signature, expected):
        raise HTTPException(401, "Invalid calendar token")
    try:
        data = json.loads(_unb64(payload))
    except (ValueError, TypeError) as exc:
        raise HTTPException(401, "Invalid calendar token") from exc
    team_id = data.get("team_id")
    if not isinstance(team_id, str) or not team_id:
        raise HTTPException(401, "Invalid calendar token")
    return team_id


def calendar_feed_url(team_id: str) -> str:
    token = create_calendar_token(team_id)
    return f"{settings.frontend_url.rstrip('/')}/api/calendar/teams/{team_id}.ics?{urlencode({'token': token})}"


def _escape(value: str | None) -> str:
    if not value:
        return ""
    return (
        value.replace("\\", "\\\\")
        .replace(";", "\\;")
        .replace(",", "\\,")
        .replace("\r\n", "\\n")
        .replace("\n", "\\n")
    )


def _fold(line: str) -> list[str]:
    if len(line) <= 74:
        return [line]
    folded = [line[:74]]
    rest = line[74:]
    while rest:
        folded.append(f" {rest[:73]}")
        rest = rest[73:]
    return folded


def _format_dt(day: date, value: time | None) -> str:
    value = value or time(0, 0)
    return datetime.combine(day, value).strftime("%Y%m%dT%H%M%S")


def _append(lines: list[str], key: str, value: str | None) -> None:
    if value is None:
        return
    lines.extend(_fold(f"{key}:{_escape(value)}"))


def _event_lines(*, uid: str, summary: str, day: date, start: time | None, end: time | None, location: str | None, description: str | None) -> list[str]:
    lines = ["BEGIN:VEVENT", f"UID:{uid}", f"DTSTAMP:{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}"]
    lines.append(f"DTSTART:{_format_dt(day, start)}")
    if end:
        lines.append(f"DTEND:{_format_dt(day, end)}")
    _append(lines, "SUMMARY", summary)
    _append(lines, "LOCATION", location)
    _append(lines, "DESCRIPTION", description)
    lines.append("END:VEVENT")
    return lines


def build_team_calendar(db: Session, team_id: str) -> str:
    team = db.get(Team, team_id)
    if not team:
        raise HTTPException(404, "Team not found")

    events = (
        db.query(Event)
        .filter(
            ((Event.home_team_id == team_id) | (Event.away_team_id == team_id)),
            Event.status.in_(("scheduled", "confirmed", "final")),
        )
        .order_by(Event.date.asc(), Event.start_time.asc())
        .limit(1000)
        .all()
    )
    windows = (
        db.query(AvailabilityWindow)
        .filter(
            AvailabilityWindow.team_id == team_id,
            AvailabilityWindow.status == "open",
            AvailabilityWindow.blocked == False,  # noqa: E712
        )
        .order_by(AvailabilityWindow.date.asc(), AvailabilityWindow.start_time.asc())
        .limit(1000)
        .all()
    )

    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//RinkLink//Team Calendar//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        f"X-WR-CALNAME:{_escape(team.name)} RinkLink",
    ]
    for event in events:
        enriched = enrich_event(event, db)
        if event.event_type == "practice" or not enriched.away_team_name:
            summary = f"{enriched.home_team_name or team.name} Practice"
        else:
            summary = f"{enriched.home_team_name or 'Home'} vs {enriched.away_team_name}"
        lines.extend(
            _event_lines(
                uid=f"event-{event.id}@rinklink",
                summary=summary,
                day=event.date,
                start=event.start_time,
                end=event.end_time,
                location=enriched.location_label,
                description=event.notes,
            )
        )
    for window in windows:
        lines.extend(
            _event_lines(
                uid=f"availability-{window.id}@rinklink",
                summary=f"{team.name} open {window.availability_type} availability",
                day=window.date,
                start=window.start_time,
                end=window.end_time,
                location=None,
                description=window.notes,
            )
        )
    lines.append("END:VCALENDAR")
    return "\r\n".join(lines) + "\r\n"

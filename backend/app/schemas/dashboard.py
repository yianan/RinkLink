from __future__ import annotations

from pydantic import BaseModel

from .availability_window import AvailabilityWindowOut
from .competition import TeamCompetitionMembershipOut
from .event import EventOut
from .ice_booking_request import IceBookingRequestOut
from .proposal import ProposalOut
from .season import StandingsEntry


class TeamDashboardSummaryOut(BaseModel):
    availability: list[AvailabilityWindowOut] = []
    events: list[EventOut] = []
    proposals: list[ProposalOut] = []
    booking_requests: list[IceBookingRequestOut] = []
    record: StandingsEntry | None = None
    competition_record: StandingsEntry | None = None
    primary_membership: TeamCompetitionMembershipOut | None = None

from __future__ import annotations

from pydantic import BaseModel

from .auth import MeOut
from .dashboard import TeamDashboardSummaryOut
from .season import SeasonOut
from .team import TeamSummaryOut


class AppBootstrapOut(BaseModel):
    me: MeOut
    seasons: list[SeasonOut] = []
    teams: list[TeamSummaryOut] = []
    initial_dashboard_team_id: str | None = None
    initial_dashboard_season_id: str | None = None
    initial_dashboard_date_from: str | None = None
    initial_dashboard: TeamDashboardSummaryOut | None = None

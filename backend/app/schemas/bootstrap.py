from __future__ import annotations

from pydantic import BaseModel

from .auth import MeOut
from .season import SeasonOut
from .team import TeamSummaryOut


class AppBootstrapOut(BaseModel):
    me: MeOut
    seasons: list[SeasonOut] = []
    teams: list[TeamSummaryOut] = []

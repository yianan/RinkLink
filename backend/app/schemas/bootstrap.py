from __future__ import annotations

from pydantic import BaseModel

from .auth import MeOut
from .season import SeasonOut
from .team import TeamOut


class BootstrapOut(BaseModel):
    me: MeOut
    teams: list[TeamOut]
    seasons: list[SeasonOut]

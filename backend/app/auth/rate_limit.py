from __future__ import annotations

import os
import time
from collections import defaultdict, deque
from dataclasses import dataclass
from threading import Lock

from fastapi import HTTPException, Request, status

from ..config import settings


@dataclass(frozen=True, slots=True)
class RateLimitRule:
    limit: int
    window_seconds: int


class InMemoryRateLimiter:
    def __init__(self) -> None:
        self._lock = Lock()
        self._events: dict[str, deque[float]] = defaultdict(deque)

    def check(self, key: str, rule: RateLimitRule) -> None:
        now = time.time()
        floor = now - rule.window_seconds
        with self._lock:
            bucket = self._events[key]
            while bucket and bucket[0] <= floor:
                bucket.popleft()
            if len(bucket) >= rule.limit:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Rate limit exceeded",
                )
            bucket.append(now)


limiter = InMemoryRateLimiter()


def _should_skip_limits() -> bool:
    return settings.app_env in {"test", "testing"} or "PYTEST_CURRENT_TEST" in os.environ


def enforce_rate_limit(request: Request, *, user_id: str, route_key: str, rule: RateLimitRule) -> None:
    if _should_skip_limits():
        return
    limiter.check(f"{user_id}:{route_key}:{request.url.path}", rule)

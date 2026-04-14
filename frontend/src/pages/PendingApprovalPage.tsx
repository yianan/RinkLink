import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Check, ChevronDown, LogOut } from 'lucide-react';

import { api } from '../api/client';
import PageHeader from '../components/PageHeader';
import TeamLogo from '../components/TeamLogo';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Textarea } from '../components/ui/Textarea';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { authClient } from '../lib/auth-client';
import { cn } from '../lib/cn';
import { getGameStatusLabel, getGameStatusVariant } from '../lib/gameStatus';
import { accentActionClass, focusRingClass, listRowButtonClass, toolbarSelectClass } from '../lib/uiClasses';
import type {
  AccessRequest,
  AccessTarget,
  Invite,
  PublicEvent,
  PublicSeason,
  PublicTeam,
  StandingsEntry,
} from '../types';

const REQUEST_TARGET_TYPES = [
  { value: 'team', label: 'Team staff access' },
  { value: 'association', label: 'Association access' },
  { value: 'arena', label: 'Arena staff access' },
  { value: 'guardian_link', label: 'Parent or guardian link' },
  { value: 'player_link', label: 'Player self link' },
] as const;

const PENDING_SCROLL_KEY = 'rinklink.pending.scrollY';

function requestTargetHelp(targetType: string) {
  switch (targetType) {
    case 'association':
      return 'Request access to an association you help manage.';
    case 'arena':
      return 'Request access to an arena you work with.';
    case 'guardian_link':
      return 'Request parent or guardian access for a player.';
    case 'player_link':
      return 'Request player self access for a player account.';
    default:
      return 'Request staff access for a team.';
  }
}

function statusVariant(status: string) {
  switch (status) {
    case 'active':
    case 'approved':
    case 'accepted':
      return 'success' as const;
    case 'pending':
      return 'warning' as const;
    case 'rejected':
    case 'expired':
    case 'cancelled':
      return 'danger' as const;
    default:
      return 'neutral' as const;
  }
}

function formatEventWhen(event: PublicEvent) {
  const dateLabel = new Date(`${event.date}T00:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    weekday: 'short',
  });
  const timeLabel = event.start_time
    ? new Date(`${event.date}T${event.start_time}`).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : 'Time TBD';
  return `${dateLabel} · ${timeLabel}`;
}

export default function PendingApprovalPage() {
  const navigate = useNavigate();
  const { isAuthenticated, me, refreshProfile } = useAuth();
  const pushToast = useToast();
  const browseTeamPickerRef = useRef<HTMLDivElement | null>(null);
  const restoreScrollTimeoutRef = useRef<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [requestTargetType, setRequestTargetType] = useState<(typeof REQUEST_TARGET_TYPES)[number]['value']>('team');
  const [requestableTeams, setRequestableTeams] = useState<AccessTarget[]>([]);
  const [requestOptions, setRequestOptions] = useState<AccessTarget[]>([]);
  const [requestTeamId, setRequestTeamId] = useState('');
  const [requestTargetId, setRequestTargetId] = useState('');
  const [requestTeamQuery, setRequestTeamQuery] = useState('');
  const [requestSearch, setRequestSearch] = useState('');
  const [requestNotes, setRequestNotes] = useState('');
  const [requestOptionsLoading, setRequestOptionsLoading] = useState(false);
  const [requestLookupError, setRequestLookupError] = useState<string | null>(null);
  const [browseSeasons, setBrowseSeasons] = useState<PublicSeason[]>([]);
  const [browseTeams, setBrowseTeams] = useState<PublicTeam[]>([]);
  const [browseEvents, setBrowseEvents] = useState<PublicEvent[]>([]);
  const [browseStandings, setBrowseStandings] = useState<StandingsEntry[]>([]);
  const [browseSeasonId, setBrowseSeasonId] = useState('');
  const [browseTeamId, setBrowseTeamId] = useState('');
  const [browseTeamPickerOpen, setBrowseTeamPickerOpen] = useState(false);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseError, setBrowseError] = useState<string | null>(null);

  const openInvites = useMemo(
    () => invites.filter((invite) => invite.status === 'pending'),
    [invites],
  );
  const hasPendingTeamLookupRequest = useMemo(
    () => requests.some((request) => request.status === 'pending' && request.target.type === 'team' && request.target.id === requestTeamId),
    [requestTeamId, requests],
  );
  const selectedBrowseTeam = useMemo(
    () => browseTeams.find((team) => team.id === browseTeamId) || null,
    [browseTeamId, browseTeams],
  );

  const restorePendingScroll = () => {
    const saved = window.sessionStorage.getItem(PENDING_SCROLL_KEY);
    if (!saved) return;
    const nextScrollY = Number(saved);
    if (Number.isNaN(nextScrollY)) return;
    window.scrollTo({ top: nextScrollY, behavior: 'auto' });
  };

  const loadPendingData = async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const [nextInvites, nextRequests] = await Promise.all([
        api.getInvites({ direction: 'received' }),
        api.getAccessRequests({ scope: 'mine' }),
      ]);
      setInvites(nextInvites);
      setRequests(nextRequests);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    void loadPendingData();
  }, [isAuthenticated]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isAuthenticated || me?.user.status === 'active') return;

    const syncPendingState = async () => {
      await refreshProfile({ silent: true });
      await loadPendingData({ silent: true });
    };

    const intervalId = window.setInterval(() => {
      void syncPendingState();
    }, 30_000);

    const onWindowFocus = () => {
      void syncPendingState();
    };

    window.addEventListener('focus', onWindowFocus);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', onWindowFocus);
    };
  }, [isAuthenticated, me?.user.status, refreshProfile]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const savePendingScroll = () => {
      window.sessionStorage.setItem(PENDING_SCROLL_KEY, String(window.scrollY));
    };

    const restoreAfterFrame = () => {
      restorePendingScroll();
      if (restoreScrollTimeoutRef.current !== null) {
        window.clearTimeout(restoreScrollTimeoutRef.current);
      }
      restoreScrollTimeoutRef.current = window.setTimeout(() => {
        restorePendingScroll();
      }, 120);
    };

    restoreAfterFrame();
    window.addEventListener('scroll', savePendingScroll, { passive: true });

    return () => {
      savePendingScroll();
      window.removeEventListener('scroll', savePendingScroll);
      if (restoreScrollTimeoutRef.current !== null) {
        window.clearTimeout(restoreScrollTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (loading) return;
    const frameId = window.requestAnimationFrame(() => {
      restorePendingScroll();
    });
    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [loading]);

  useEffect(() => {
    if (!browseTeamPickerOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!browseTeamPickerRef.current?.contains(event.target as Node)) {
        setBrowseTeamPickerOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setBrowseTeamPickerOpen(false);
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [browseTeamPickerOpen]);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (requestTeamQuery.trim().length < 2) {
      setRequestableTeams([]);
      setRequestTeamId('');
      setRequestLookupError(null);
      return;
    }
    let cancelled = false;
    api.getAccessTargets({ target_type: 'team', q: requestTeamQuery.trim() })
      .then((targets) => {
        if (cancelled) return;
        setRequestableTeams(targets);
      })
      .catch((nextError) => {
        if (cancelled) return;
        setRequestLookupError(nextError instanceof Error ? nextError.message : String(nextError));
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, requestTeamQuery]);

  useEffect(() => {
    if ((requestTargetType === 'guardian_link' || requestTargetType === 'player_link') && !requestTeamId && requestableTeams.length > 0) {
      setRequestTeamId(requestableTeams[0].id);
    }
  }, [requestTargetType, requestTeamId, requestableTeams]);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (requestSearch.trim().length < 2) {
      setRequestOptions([]);
      setRequestTargetId('');
      setRequestOptionsLoading(false);
      setRequestLookupError(null);
      return;
    }
    let cancelled = false;

    const params: Record<string, string> = { target_type: requestTargetType, q: requestSearch.trim() };
    if (requestTargetType === 'guardian_link' || requestTargetType === 'player_link') {
      if (!requestTeamId) {
        setRequestOptions([]);
        setRequestTargetId('');
        return;
      }
      if (!hasPendingTeamLookupRequest) {
        setRequestOptions([]);
        setRequestTargetId('');
        setRequestOptionsLoading(false);
        setRequestLookupError('Submit a pending team access request for this team before searching for players.');
        return;
      }
      params.team_id = requestTeamId;
    }

    setRequestOptionsLoading(true);
    setRequestLookupError(null);
    api.getAccessTargets(params)
      .then((targets) => {
        if (cancelled) return;
        setRequestOptions(targets);
      })
      .catch((nextError) => {
        if (cancelled) return;
        setRequestOptions([]);
        setRequestLookupError(nextError instanceof Error ? nextError.message : String(nextError));
      })
      .finally(() => {
        if (!cancelled) {
          setRequestOptionsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [hasPendingTeamLookupRequest, isAuthenticated, requestSearch, requestTargetType, requestTeamId]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    setBrowseLoading(true);
    setBrowseError(null);
    api.getBrowseSeasons()
      .then((seasons) => {
        if (cancelled) return;
        setBrowseSeasons(seasons);
        const preferredSeason = seasons.find((season) => season.is_active) || seasons[0];
        if (preferredSeason) {
          setBrowseSeasonId((current) => (current && seasons.some((season) => season.id === current) ? current : preferredSeason.id));
        }
      })
      .catch((nextError) => {
        if (cancelled) return;
        setBrowseError(nextError instanceof Error ? nextError.message : String(nextError));
      })
      .finally(() => {
        if (!cancelled) {
          setBrowseLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || !browseSeasonId) return;
    let cancelled = false;
    setBrowseLoading(true);
    setBrowseError(null);
    api.getBrowseTeams({ season_id: browseSeasonId })
      .then((teams) => {
        if (cancelled) return;
        setBrowseTeams(teams);
        setBrowseTeamId((current) => (current && teams.some((team) => team.id === current) ? current : teams[0]?.id || ''));
      })
      .catch((nextError) => {
        if (cancelled) return;
        setBrowseTeams([]);
        setBrowseTeamId('');
        setBrowseError(nextError instanceof Error ? nextError.message : String(nextError));
      })
      .finally(() => {
        if (!cancelled) {
          setBrowseLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [browseSeasonId, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || !browseSeasonId || !selectedBrowseTeam) return;
    let cancelled = false;
    setBrowseLoading(true);
    setBrowseError(null);
    Promise.all([
      api.getBrowseTeamEvents(selectedBrowseTeam.id, { season_id: browseSeasonId }),
      api.getBrowseStandings(browseSeasonId, {
        association_id: selectedBrowseTeam.association_id,
        age_group: selectedBrowseTeam.age_group,
        level: selectedBrowseTeam.level,
      }),
    ])
      .then(([events, standings]) => {
        if (cancelled) return;
        setBrowseEvents(events);
        setBrowseStandings(standings);
      })
      .catch((nextError) => {
        if (cancelled) return;
        setBrowseEvents([]);
        setBrowseStandings([]);
        setBrowseError(nextError instanceof Error ? nextError.message : String(nextError));
      })
      .finally(() => {
        if (!cancelled) {
          setBrowseLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [browseSeasonId, isAuthenticated, selectedBrowseTeam]);

  useEffect(() => {
    if (requestOptions.length === 0) {
      setRequestTargetId('');
      return;
    }
    if (!requestOptions.some((target) => target.id === requestTargetId)) {
      setRequestTargetId(requestOptions[0].id);
    }
  }, [requestOptions, requestTargetId]);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (me?.user.status === 'active') {
    return <Navigate to="/" replace />;
  }

  const signOut = async () => {
    setSubmitting(true);
    try {
      await authClient.signOut();
      window.location.href = '/login';
    } finally {
      setSubmitting(false);
    }
  };

  const submitAccessRequest = async () => {
    if (!requestTargetId) {
      pushToast({
        title: 'Select a resource first',
        description: 'Choose the team, association, arena, or player you want access to.',
        variant: 'warning',
      });
      return;
    }

    setSubmitting(true);
    try {
      const created = await api.createAccessRequest({
        target_type: requestTargetType,
        target_id: requestTargetId,
        notes: requestNotes.trim() || null,
      });
      setRequests((current) => {
        const withoutDuplicate = current.filter((request) => request.id !== created.id);
        return [created, ...withoutDuplicate];
      });
      setRequestNotes('');
      pushToast({
        title: 'Access request submitted',
        description: created.target.name,
        variant: 'success',
      });
    } catch (nextError) {
      pushToast({
        title: 'Unable to submit access request',
        description: nextError instanceof Error ? nextError.message : String(nextError),
        variant: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        title="Waiting for access"
        subtitle={(
          <>
            You&apos;re signed in as <span className="font-medium text-slate-900 dark:text-slate-100">{me?.user.email || 'Unknown user'}</span>.
            An administrator still needs to approve access to the right team, association, arena, or family link.
          </>
        )}
        actions={(
          <button
            type="button"
            onClick={() => void signOut()}
            disabled={submitting}
            className={cn('inline-flex items-center gap-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60', accentActionClass)}
          >
            <LogOut className="h-4 w-4" />
            {submitting ? 'Signing out…' : 'Sign out'}
          </button>
        )}
      />

      {error ? (
        <Card className="border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
          {error}
        </Card>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(20rem,0.9fr)]">
        <div className="space-y-6">
          {openInvites.length > 0 ? (
            <Card className="p-7 sm:p-8">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">You already have access waiting</h2>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                    If someone already invited this email, accept that invite here. It will activate the correct access immediately.
                  </p>
                </div>
                <Badge variant="outline">{openInvites.length} invite{openInvites.length === 1 ? '' : 's'}</Badge>
              </div>

              <div className="mt-5 space-y-3">
                {openInvites.map((invite) => (
                  <div
                    key={invite.id}
                    className="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-5 py-5 dark:border-slate-800 dark:bg-slate-900/50"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{invite.target.name}</div>
                        {invite.target.context ? (
                          <div className="text-sm text-slate-600 dark:text-slate-300">{invite.target.context}</div>
                        ) : null}
                        <div className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                          {invite.target.type.replace('_', ' ')}
                          {invite.role ? ` · ${invite.role}` : ''}
                        </div>
                      </div>
                      <Badge variant={statusVariant(invite.status)}>{invite.status}</Badge>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                      <span>Invited by {invite.invited_by_email || 'an administrator'}</span>
                      <span>Expires {new Date(invite.expires_at).toLocaleString()}</span>
                    </div>
                    <div className="mt-4">
                      <Button type="button" variant="outline" onClick={() => navigate(`/invite/${invite.token}`)}>
                        Review invite
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}

          <Card className="p-7 sm:p-8">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Request access</h2>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  Choose what you need and send it to the right administrator for approval.
                </p>
              </div>
              <Badge variant={statusVariant(me?.user.status || 'pending')}>{me?.user.status || 'pending'}</Badge>
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                  Access type
                </label>
                <Select value={requestTargetType} onChange={(event) => setRequestTargetType(event.target.value as (typeof REQUEST_TARGET_TYPES)[number]['value'])} className="mt-2">
                  {REQUEST_TARGET_TYPES.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </Select>
                <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  {requestTargetHelp(requestTargetType)}
                </div>
              </div>

              {(requestTargetType === 'guardian_link' || requestTargetType === 'player_link') ? (
                <div>
                  <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                    Search teams
                  </label>
                  <Input
                    className="mt-2"
                    value={requestTeamQuery}
                    onChange={(event) => setRequestTeamQuery(event.target.value)}
                    placeholder="Type at least 2 characters"
                  />
                  <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                    Team
                  </label>
                  <Select value={requestTeamId} onChange={(event) => setRequestTeamId(event.target.value)} className="mt-2" disabled={requestableTeams.length === 0}>
                    {requestableTeams.map((team) => (
                      <option key={team.id} value={team.id}>{team.name}{team.context ? ` · ${team.context}` : ''}</option>
                    ))}
                  </Select>
                  {!hasPendingTeamLookupRequest && requestTeamId ? (
                    <div className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                      Submit a pending team access request for this team first. Player search stays locked until that request exists.
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div>
                <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                  Search
                </label>
                <Input
                  className="mt-2"
                  value={requestSearch}
                  onChange={(event) => setRequestSearch(event.target.value)}
                  placeholder="Type at least 2 characters"
                />
                <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                  Resource
                </label>
                <Select value={requestTargetId} onChange={(event) => setRequestTargetId(event.target.value)} className="mt-2" disabled={requestOptionsLoading || requestOptions.length === 0}>
                  {requestOptions.length === 0 ? (
                    <option value="">{requestOptionsLoading ? 'Loading options…' : 'No requestable targets available'}</option>
                  ) : (
                    requestOptions.map((target) => (
                      <option key={target.id} value={target.id}>{target.name}{target.context ? ` · ${target.context}` : ''}</option>
                    ))
                  )}
                </Select>
                {requestLookupError ? (
                  <div className="mt-2 text-xs text-rose-600 dark:text-rose-300">{requestLookupError}</div>
                ) : null}
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                  Notes
                </label>
                <Textarea
                  className="mt-2"
                  rows={4}
                  value={requestNotes}
                  onChange={(event) => setRequestNotes(event.target.value)}
                  placeholder="Add any context that will help the admin approve your request."
                />
              </div>

              <Button type="button" onClick={() => void submitAccessRequest()} disabled={submitting || requestOptionsLoading || !requestTargetId}>
                {submitting ? 'Submitting…' : 'Submit request'}
              </Button>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-7 sm:p-8">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Your account</h2>
            <div className="mt-4 rounded-2xl border border-slate-200/80 bg-slate-50/90 px-4 py-4 text-sm dark:border-slate-800 dark:bg-slate-900/70">
              <div className="font-medium text-slate-900 dark:text-slate-100">Signed in as</div>
              <div className="mt-1 text-slate-600 dark:text-slate-300">{me?.user.email || 'Unknown user'}</div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Badge variant={statusVariant(me?.user.status || 'pending')}>Status: {me?.user.status || 'pending'}</Badge>
                <Badge variant="outline">Requests: {requests.length}</Badge>
                {openInvites.length > 0 ? <Badge variant="outline">Invites: {openInvites.length}</Badge> : null}
              </div>
            </div>
            <div className="mt-4 text-sm text-slate-600 dark:text-slate-300">
              We&apos;ll pick up approval automatically as soon as your access changes.
            </div>
          </Card>

          <Card className="p-7 sm:p-8">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Your requests</h2>
            <div className="mt-4 space-y-3">
              {loading ? (
                <div className="text-sm text-slate-500 dark:text-slate-400">Loading request history…</div>
              ) : requests.length === 0 ? (
                <div className="text-sm text-slate-500 dark:text-slate-400">
                  You haven&apos;t submitted any access requests yet.
                </div>
              ) : (
                requests.map((request) => (
                  <div
                    key={request.id}
                    className="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-5 py-5 dark:border-slate-800 dark:bg-slate-900/50"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{request.target.name}</div>
                        {request.target.context ? (
                          <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">{request.target.context}</div>
                        ) : null}
                      </div>
                      <Badge variant={statusVariant(request.status)}>{request.status}</Badge>
                    </div>
                    {request.notes ? (
                      <div className="mt-3 text-sm text-slate-600 dark:text-slate-300">{request.notes}</div>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>

      <Card className="p-7 sm:p-9">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              While you wait
            </div>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 dark:text-slate-50">
              Here are a few things you can still do.
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
              You can still look at team schedules and standings while an admin reviews your access. Private roster and admin details will appear after approval.
            </p>
          </div>
          <div className="grid min-w-[16rem] gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                Season
              </label>
              <Select className="mt-2" value={browseSeasonId} onChange={(event) => setBrowseSeasonId(event.target.value)} disabled={browseSeasons.length === 0}>
                {browseSeasons.map((season) => (
                  <option key={season.id} value={season.id}>{season.name}</option>
                ))}
              </Select>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                Team
              </label>
              <div ref={browseTeamPickerRef} className="relative mt-2">
                <button
                  type="button"
                  disabled={browseTeams.length === 0}
                  aria-expanded={browseTeamPickerOpen}
                  aria-haspopup="listbox"
                  onClick={() => setBrowseTeamPickerOpen((current) => !current)}
                  className={cn(
                    `flex min-h-11 w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm text-slate-900 transition sm:min-h-10 dark:text-slate-100 ${focusRingClass}`,
                    toolbarSelectClass,
                    'hover:bg-slate-100/80 dark:hover:bg-slate-800/80 dark:hover:ring-slate-600/80 disabled:cursor-not-allowed disabled:opacity-70',
                  )}
                >
                  <TeamLogo
                    name={selectedBrowseTeam?.name || 'Team'}
                    logoUrl={selectedBrowseTeam?.logo_url || null}
                    className="h-8 w-8 shrink-0 rounded-lg"
                    initialsClassName="text-[11px]"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{selectedBrowseTeam?.name || (browseTeams.length > 0 ? 'Select a team…' : 'No teams available')}</div>
                    {selectedBrowseTeam ? (
                      <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                        {[selectedBrowseTeam.association_name, selectedBrowseTeam.age_group, selectedBrowseTeam.level].filter(Boolean).join(' • ')}
                      </div>
                    ) : null}
                  </div>
                  <ChevronDown className={cn('h-4 w-4 shrink-0 text-slate-500 transition-transform dark:text-slate-400', browseTeamPickerOpen && 'rotate-180')} />
                </button>

                {browseTeamPickerOpen ? (
                  <div
                    role="listbox"
                    aria-label="Browse team"
                    className="absolute left-0 right-0 z-50 mt-2 overflow-hidden rounded-xl border border-[color:var(--app-border-subtle)] bg-[var(--app-surface-strong)] shadow-xl ring-1 ring-slate-200/70 dark:ring-slate-700/60"
                  >
                    <div className="max-h-80 overflow-y-auto p-1.5">
                      {browseTeams.map((team) => {
                        const selected = team.id === browseTeamId;
                        return (
                          <button
                            key={team.id}
                            type="button"
                            role="option"
                            aria-selected={selected}
                            onClick={() => {
                              setBrowseTeamId(team.id);
                              setBrowseTeamPickerOpen(false);
                            }}
                            className={cn(
                              `flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition ${focusRingClass}`,
                              selected
                                ? 'bg-[color:color-mix(in_srgb,var(--app-accent-link)_12%,white)] text-slate-950 dark:bg-[color:color-mix(in_srgb,var(--app-accent-link)_18%,transparent)] dark:text-slate-50'
                                : 'text-slate-800 hover:bg-slate-100/80 hover:text-slate-950 dark:text-slate-200 dark:hover:bg-slate-800/90 dark:hover:text-slate-50',
                            )}
                          >
                            <TeamLogo
                              name={team.name}
                              logoUrl={team.logo_url}
                              className="h-9 w-9 shrink-0 rounded-lg"
                              initialsClassName="text-[11px]"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-medium">{team.name}</div>
                              <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                                {[team.association_name, team.age_group, team.level].filter(Boolean).join(' • ')}
                              </div>
                            </div>
                            {selected ? <Check className="h-4 w-4 shrink-0 text-[color:var(--app-accent-link)]" /> : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        {browseError ? (
          <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
            {browseError}
          </div>
        ) : null}

        {selectedBrowseTeam ? (
          <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.9fr)]">
            <div className="space-y-6">
              <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-6 dark:border-slate-800 dark:bg-slate-900/50">
                <div className="flex flex-wrap items-center gap-4">
                  <TeamLogo
                    name={selectedBrowseTeam.name}
                    logoUrl={selectedBrowseTeam.logo_url}
                    className="h-14 w-14 rounded-xl"
                    initialsClassName="text-sm"
                  />
                  <div>
                    <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">{selectedBrowseTeam.name}</div>
                    <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                      {selectedBrowseTeam.association_name} · {selectedBrowseTeam.age_group} · {selectedBrowseTeam.level}
                    </div>
                    <div className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                      Record {selectedBrowseTeam.wins}-{selectedBrowseTeam.losses}-{selectedBrowseTeam.ties}
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                  Schedule
                </div>
                <Card className="mt-3 overflow-hidden p-0">
                  {browseLoading && browseEvents.length === 0 ? (
                    <div className="px-4 py-6 text-sm text-slate-500 dark:text-slate-400">
                      Loading schedule…
                    </div>
                  ) : browseEvents.length === 0 ? (
                    <div className="px-4 py-6 text-sm text-slate-500 dark:text-slate-400">
                      No schedule is available for this team yet.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-200 dark:divide-slate-800">
                      {browseEvents.map((event) => (
                        <div key={event.id} className={cn(listRowButtonClass, 'cursor-default px-4 py-4')}>
                          <div className="flex items-start gap-3">
                            <div className="flex shrink-0 items-center gap-2">
                              <TeamLogo name={event.home_team_name || 'Home'} logoUrl={event.home_team_logo_url} className="h-10 w-10 rounded-xl" initialsClassName="text-xs" />
                              {event.away_team_name ? (
                                <TeamLogo name={event.away_team_name} logoUrl={event.away_team_logo_url} className="h-10 w-10 rounded-xl" initialsClassName="text-xs" />
                              ) : null}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                                  {event.home_team_name || 'Home'}{event.away_team_name ? ` vs ${event.away_team_name}` : ''}
                                </div>
                                {event.competition_short_name ? <Badge variant="outline">{event.competition_short_name}</Badge> : null}
                                <Badge variant={getGameStatusVariant({ status: event.status, home_weekly_confirmed: false, away_weekly_confirmed: false })}>
                                  {getGameStatusLabel({ status: event.status, home_weekly_confirmed: false, away_weekly_confirmed: false })}
                                </Badge>
                              </div>
                              <div className="mt-2 text-sm text-slate-600 dark:text-slate-400">{formatEventWhen(event)}</div>
                              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                {[event.competition_name, event.division_name, event.location_label || event.arena_name].filter(Boolean).join(' · ')}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </div>
            </div>

            <div>
              <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                Standings
              </div>
              <div className="mt-3">
                {browseLoading && browseStandings.length === 0 ? (
                  <Card className="px-4 py-6 text-sm text-slate-500 dark:text-slate-400">
                    Loading standings…
                  </Card>
                ) : browseStandings.length === 0 ? (
                  <Card className="px-4 py-6 text-sm text-slate-500 dark:text-slate-400">
                    No standings are available for this group yet.
                  </Card>
                ) : (
                  <>
                    <div className="space-y-2 md:hidden">
                      {browseStandings.map((entry, index) => (
                        <Card
                          key={entry.team_id}
                          className={cn('p-4', entry.team_id === selectedBrowseTeam.id && 'ring-1 ring-[color:var(--app-accent-link)]/20')}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <TeamLogo name={entry.team_name} logoUrl={entry.logo_url} className="h-11 w-11 rounded-xl" initialsClassName="text-sm" />
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-lg font-bold text-slate-400 dark:text-slate-500">#{index + 1}</span>
                                  <span className="font-medium text-slate-900 dark:text-slate-100">{entry.team_name}</span>
                                </div>
                                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{entry.association_name || '—'}</div>
                              </div>
                            </div>
                            <Badge variant="info">{entry.points} pts</Badge>
                          </div>
                          <div className="mt-2 flex gap-4 text-sm text-slate-700 dark:text-slate-300">
                            <span>GP: {entry.games_played}</span>
                            <span>W: {entry.wins}</span>
                            <span>L: {entry.losses}</span>
                            <span>T: {entry.ties}</span>
                          </div>
                        </Card>
                      ))}
                    </div>

                    <Card className="hidden overflow-hidden md:block">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600 dark:bg-slate-900/40 dark:text-slate-400">
                            <tr>
                              <th className="w-12 px-4 py-3">#</th>
                              <th className="px-4 py-3">Team</th>
                              <th className="px-4 py-3">Association</th>
                              <th className="px-4 py-3 text-center">GP</th>
                              <th className="px-4 py-3 text-center">W</th>
                              <th className="px-4 py-3 text-center">L</th>
                              <th className="px-4 py-3 text-center">T</th>
                              <th className="px-4 py-3 text-center">Pts</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-950/20">
                            {browseStandings.map((entry, index) => (
                              <tr
                                key={entry.team_id}
                                className={cn(
                                  'align-top hover:bg-slate-50/60 dark:hover:bg-slate-900/40',
                                  entry.team_id === selectedBrowseTeam.id && 'bg-cyan-50/70 dark:bg-cyan-950/20',
                                )}
                              >
                                <td className="px-4 py-3 font-bold text-slate-400 dark:text-slate-500">{index + 1}</td>
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-3">
                                    <TeamLogo name={entry.team_name} logoUrl={entry.logo_url} className="h-10 w-10 rounded-xl" initialsClassName="text-xs" />
                                    <div className="font-medium text-slate-900 dark:text-slate-100">{entry.team_name}</div>
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{entry.association_name || '—'}</td>
                                <td className="px-4 py-3 text-center text-slate-700 dark:text-slate-300">{entry.games_played}</td>
                                <td className="px-4 py-3 text-center text-slate-700 dark:text-slate-300">{entry.wins}</td>
                                <td className="px-4 py-3 text-center text-slate-700 dark:text-slate-300">{entry.losses}</td>
                                <td className="px-4 py-3 text-center text-slate-700 dark:text-slate-300">{entry.ties}</td>
                                <td className="px-4 py-3 text-center font-semibold text-slate-900 dark:text-slate-100">{entry.points}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </Card>
                  </>
                )}
              </div>
            </div>
          </div>
        ) : browseLoading ? (
          <div className="mt-6 rounded-2xl border border-dashed border-slate-300/80 px-4 py-6 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
            Loading teams, schedule, and standings…
          </div>
        ) : (
          <div className="mt-6 rounded-2xl border border-dashed border-slate-300/80 px-4 py-6 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
            No teams are available here yet.
          </div>
        )}
      </Card>
    </div>
  );
}

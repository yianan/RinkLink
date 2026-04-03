import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';

import { api } from '../api/client';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Select } from '../components/ui/Select';
import { Textarea } from '../components/ui/Textarea';
import { authClient } from '../lib/auth-client';
import type { AccessRequest, AccessTarget, Invite, PublicEvent, PublicSeason, PublicTeam, StandingsEntry } from '../types';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

const REQUEST_TARGET_TYPES = [
  { value: 'team', label: 'Team staff access' },
  { value: 'association', label: 'Association access' },
  { value: 'arena', label: 'Arena staff access' },
  { value: 'guardian_link', label: 'Parent or guardian link' },
  { value: 'player_link', label: 'Player self link' },
] as const;

function requestTargetHelp(targetType: string) {
  switch (targetType) {
    case 'association':
      return 'Request association-level administration access.';
    case 'arena':
      return 'Request arena administration or operations access.';
    case 'guardian_link':
      return 'Request parent or guardian access for a rostered player.';
    case 'player_link':
      return 'Request player self access for a rostered player.';
    default:
      return 'Request team staff access for a rostered team.';
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
  const [requestNotes, setRequestNotes] = useState('');
  const [requestOptionsLoading, setRequestOptionsLoading] = useState(false);
  const [requestLookupError, setRequestLookupError] = useState<string | null>(null);
  const [browseSeasons, setBrowseSeasons] = useState<PublicSeason[]>([]);
  const [browseTeams, setBrowseTeams] = useState<PublicTeam[]>([]);
  const [browseEvents, setBrowseEvents] = useState<PublicEvent[]>([]);
  const [browseStandings, setBrowseStandings] = useState<StandingsEntry[]>([]);
  const [browseSeasonId, setBrowseSeasonId] = useState('');
  const [browseTeamId, setBrowseTeamId] = useState('');
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseError, setBrowseError] = useState<string | null>(null);

  const openInvites = useMemo(
    () => invites.filter((invite) => invite.status === 'pending'),
    [invites],
  );
  const selectedBrowseTeam = useMemo(
    () => browseTeams.find((team) => team.id === browseTeamId) || null,
    [browseTeamId, browseTeams],
  );

  const loadPendingData = async () => {
    setLoading(true);
    setError(null);
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
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    void loadPendingData();
  }, [isAuthenticated]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    api.getAccessTargets({ target_type: 'team' })
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
  }, [isAuthenticated]);

  useEffect(() => {
    if ((requestTargetType === 'guardian_link' || requestTargetType === 'player_link') && !requestTeamId && requestableTeams.length > 0) {
      setRequestTeamId(requestableTeams[0].id);
    }
  }, [requestTargetType, requestTeamId, requestableTeams]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;

    const params: Record<string, string> = { target_type: requestTargetType };
    if (requestTargetType === 'guardian_link' || requestTargetType === 'player_link') {
      if (!requestTeamId) {
        setRequestOptions([]);
        setRequestTargetId('');
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
  }, [isAuthenticated, requestTargetType, requestTeamId]);

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

  const refreshAll = async () => {
    setSubmitting(true);
    try {
      await refreshProfile();
      await loadPendingData();
      if (me?.user.status === 'active') {
        navigate('/');
      }
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
    <div className="mx-auto flex min-h-screen w-full max-w-5xl items-center px-4 py-8 sm:px-6">
      <div className="w-full space-y-6">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(20rem,0.8fr)]">
          <Card className="p-8 sm:p-10">
          <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
            Access Pending
          </div>
          <h1 className="mt-5 font-display text-3xl font-bold tracking-tight text-slate-950 dark:text-slate-50">
            Your account is signed in, but app access still needs to be granted.
          </h1>
          <p className="mt-4 text-sm leading-6 text-slate-600 dark:text-slate-300">
            Generic sign-in is handled already, but the team, association, arena, parent, and player access for this app is granted
            through invites or admin approval. If you were invited, you can accept it below.
          </p>

          <div className="mt-6 rounded-2xl border border-slate-200/80 bg-slate-50/90 px-4 py-4 text-sm dark:border-slate-800 dark:bg-slate-900/70">
            <div className="font-medium text-slate-900 dark:text-slate-100">Signed in as</div>
            <div className="mt-1 text-slate-600 dark:text-slate-300">{me?.user.email || 'Unknown user'}</div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge variant={statusVariant(me?.user.status || 'pending')}>Status: {me?.user.status || 'pending'}</Badge>
              <Badge variant="outline">Open invites: {openInvites.length}</Badge>
              <Badge variant="outline">Requests submitted: {requests.length}</Badge>
            </div>
          </div>

          <div className="mt-8 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                  Invitations For This Email
                </h2>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  These are app-specific access grants. Accepting one activates the matching team, arena, parent, or player link.
                </p>
              </div>
            </div>

            {loading ? (
              <div className="rounded-2xl border border-dashed border-slate-300/80 px-4 py-6 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                Loading invites and request history…
              </div>
            ) : error ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-6 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
                {error}
              </div>
            ) : openInvites.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300/80 px-4 py-6 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                No open invites were found for this email yet.
              </div>
            ) : (
              <div className="space-y-3">
                {openInvites.map((invite) => (
                  <div
                    key={invite.id}
                    className="rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-4 dark:border-slate-800 dark:bg-slate-950/40"
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
                        Review Invite
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          </Card>

          <div className="space-y-6">
            <Card className="p-6">
            <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              Request Access
            </h2>
            <div className="mt-4 space-y-4">
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
                    Team
                  </label>
                  <Select value={requestTeamId} onChange={(event) => setRequestTeamId(event.target.value)} className="mt-2">
                    {requestableTeams.map((team) => (
                      <option key={team.id} value={team.id}>{team.name}{team.context ? ` · ${team.context}` : ''}</option>
                    ))}
                  </Select>
                </div>
              ) : null}

              <div>
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
                  Notes for the reviewer
                </label>
                <Textarea
                  className="mt-2"
                  rows={4}
                  value={requestNotes}
                  onChange={(event) => setRequestNotes(event.target.value)}
                  placeholder="Include any context that will help the admin approve the request."
                />
              </div>

              <Button type="button" variant="outline" onClick={() => void submitAccessRequest()} disabled={submitting || requestOptionsLoading || !requestTargetId}>
                {submitting ? 'Submitting…' : 'Submit access request'}
              </Button>
            </div>
            </Card>

            <Card className="p-6">
            <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              Your Access Requests
            </h2>
            <div className="mt-4 space-y-3">
              {loading ? (
                <div className="text-sm text-slate-500 dark:text-slate-400">Loading request history…</div>
              ) : requests.length === 0 ? (
                <div className="text-sm text-slate-500 dark:text-slate-400">
                  No access requests submitted yet. If you expected access, ask the relevant administrator to send an invite.
                </div>
              ) : (
                requests.map((request) => (
                  <div
                    key={request.id}
                    className="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/50"
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

            <Card className="p-6">
            <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              Next Steps
            </h2>
            <div className="mt-4 space-y-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
              <p>Use an invite when possible. It creates the exact team, association, arena, parent, or player link intended for this email.</p>
              <p>If you are waiting on access, you can submit a request here and the appropriate reviewer will see it in the admin access queue.</p>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button type="button" variant="outline" onClick={() => void refreshAll()} disabled={submitting}>
                {submitting ? 'Refreshing…' : 'Refresh status'}
              </Button>
              <Button type="button" variant="ghost" onClick={() => void signOut()} disabled={submitting}>
                {submitting ? 'Signing out…' : 'Sign out'}
              </Button>
            </div>
            <div className="mt-4 text-xs text-slate-500 dark:text-slate-400">
              Need a new invite? Share the signed-in email above with the appropriate administrator.
            </div>
            </Card>
          </div>
        </div>

        <Card className="p-6 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                Published Browse
              </div>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 dark:text-slate-50">
                Teams, schedule, and standings stay available while you wait.
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                This browse mode is limited to published information only. Private roster, locker room, and admin-only details remain hidden until an admin grants access.
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
                <Select className="mt-2" value={browseTeamId} onChange={(event) => setBrowseTeamId(event.target.value)} disabled={browseTeams.length === 0}>
                  {browseTeams.map((team) => (
                    <option key={team.id} value={team.id}>{team.name} · {team.age_group} · {team.level}</option>
                  ))}
                </Select>
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
                <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-5 dark:border-slate-800 dark:bg-slate-900/50">
                  <div className="flex flex-wrap items-center gap-4">
                    {selectedBrowseTeam.logo_url ? (
                      <img src={selectedBrowseTeam.logo_url} alt={`${selectedBrowseTeam.name} logo`} className="h-14 w-14 rounded-xl object-cover ring-1 ring-slate-200/80 dark:ring-slate-700/70" />
                    ) : (
                      <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-slate-200 text-sm font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        {selectedBrowseTeam.name.slice(0, 2).toUpperCase()}
                      </div>
                    )}
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
                    Published Schedule
                  </div>
                  <div className="mt-3 space-y-3">
                    {browseLoading && browseEvents.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-slate-300/80 px-4 py-6 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                        Loading published schedule…
                      </div>
                    ) : browseEvents.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-slate-300/80 px-4 py-6 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                        No published events are available for this team yet.
                      </div>
                    ) : (
                      browseEvents.map((event) => (
                        <div key={event.id} className="rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-4 dark:border-slate-800 dark:bg-slate-950/40">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                {event.home_team_name || 'Home'}{event.away_team_name ? ` vs ${event.away_team_name}` : ''}
                              </div>
                              <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">{formatEventWhen(event)}</div>
                            </div>
                            <Badge variant={statusVariant(event.status)}>{event.status}</Badge>
                          </div>
                          <div className="mt-3 text-sm text-slate-600 dark:text-slate-300">
                            {[event.competition_name, event.division_name, event.location_label || event.arena_name].filter(Boolean).join(' · ')}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              <div>
                <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                  Published Standings
                </div>
                <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-800">
                  {browseLoading && browseStandings.length === 0 ? (
                    <div className="px-4 py-6 text-sm text-slate-500 dark:text-slate-400">
                      Loading standings…
                    </div>
                  ) : browseStandings.length === 0 ? (
                    <div className="px-4 py-6 text-sm text-slate-500 dark:text-slate-400">
                      No published standings are available for this grouping yet.
                    </div>
                  ) : (
                    <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
                      <thead className="bg-slate-50/90 dark:bg-slate-900/70">
                        <tr>
                          <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">Team</th>
                          <th className="px-3 py-3 text-right font-semibold text-slate-600 dark:text-slate-300">Pts</th>
                          <th className="px-3 py-3 text-right font-semibold text-slate-600 dark:text-slate-300">W</th>
                          <th className="px-3 py-3 text-right font-semibold text-slate-600 dark:text-slate-300">L</th>
                          <th className="px-3 py-3 text-right font-semibold text-slate-600 dark:text-slate-300">T</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200/80 bg-white/70 dark:divide-slate-800 dark:bg-slate-950/40">
                        {browseStandings.map((entry) => (
                          <tr key={entry.team_id} className={entry.team_id === selectedBrowseTeam.id ? 'bg-cyan-50/70 dark:bg-cyan-950/20' : ''}>
                            <td className="px-4 py-3 text-slate-900 dark:text-slate-100">{entry.team_name}</td>
                            <td className="px-3 py-3 text-right text-slate-700 dark:text-slate-200">{entry.points}</td>
                            <td className="px-3 py-3 text-right text-slate-700 dark:text-slate-200">{entry.wins}</td>
                            <td className="px-3 py-3 text-right text-slate-700 dark:text-slate-200">{entry.losses}</td>
                            <td className="px-3 py-3 text-right text-slate-700 dark:text-slate-200">{entry.ties}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          ) : browseLoading ? (
            <div className="mt-6 rounded-2xl border border-dashed border-slate-300/80 px-4 py-6 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
              Loading published browse data…
            </div>
          ) : (
            <div className="mt-6 rounded-2xl border border-dashed border-slate-300/80 px-4 py-6 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
              No published teams are available yet.
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

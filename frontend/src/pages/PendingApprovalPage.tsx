import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';

import { api } from '../api/client';
import AgeLevelSelect from '../components/AgeLevelSelect';
import PageHeader from '../components/PageHeader';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Textarea } from '../components/ui/Textarea';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { authClient } from '../lib/auth-client';
import { clearSignupAccessRequestDraft, loadSignupAccessRequestDrafts } from '../lib/access-request-draft';
import { getAccessRoleLabel, getAccessTargetTypeLabel } from '../lib/accessLabels';
import { cn } from '../lib/cn';
import { accentActionClass } from '../lib/uiClasses';
import type {
  AccessRequest,
  AccessTarget,
  Invite,
  } from '../types';

const REQUEST_TARGET_TYPES = [
 { value:'team_setup',label:'Create a New Team' },
 { value:'team',label:'Team Staff Access' },
];

const PENDING_SCROLL_KEY = 'rinklink.pending.scrollY';

function requestTargetHelp(targetType: string) {
  switch (targetType) {
    case 'team_setup':
      return 'Request setup for a new team. A platform admin will review it.';
    case 'association':
      return 'Request access to an association you help manage.';
    case 'arena':
      return 'Request access to an arena you work with.';
    case 'guardian_link':
      return 'Request parent or guardian access for a specific player.';
    case 'player_link':
      return 'Request player access for yourself.';
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


export default function PendingApprovalPage() {
  const navigate = useNavigate();
  const { isAuthenticated, me, refreshProfile } = useAuth();
  const pushToast = useToast();

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
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamAgeGroup, setNewTeamAgeGroup] = useState('');
  const [newTeamLevel, setNewTeamLevel] = useState('');
  const [newTeamLocation, setNewTeamLocation] = useState('');
  const [signupRequestStatus, setSignupRequestStatus] = useState<'idle' | 'submitting' | 'submitted' | 'failed'>('idle');
  const [signupRequestMessage, setSignupRequestMessage] = useState<string | null>(null);
  const [requestOptionsLoading, setRequestOptionsLoading] = useState(false);
  const [requestLookupError, setRequestLookupError] = useState<string | null>(null);










  const openInvites = useMemo(
    () => invites.filter((invite) => invite.status === 'pending'),
    [invites],
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
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || loading || me?.user.status === 'active' || signupRequestStatus !== 'idle') {
      return;
    }
    const drafts = loadSignupAccessRequestDrafts(me?.user.email);
    if (drafts.length === 0) {
      return;
    }

    let cancelled = false;
    setSignupRequestStatus('submitting');
    setSignupRequestMessage(drafts.length === 1 ? `Submitting your request for ${drafts[0].target_name}.` : `Submitting ${drafts.length} access requests.`);
    Promise.all(drafts.map((draft) => api.createAccessRequest({
      target_type: draft.target_type,
      target_id: draft.target_id,
      notes: draft.notes,
      details: draft.details ?? null,
    })))
      .then((createdRequests) => {
        if (cancelled) return;
        clearSignupAccessRequestDraft();
        setRequests((current) => {
          const createdIds = new Set(createdRequests.map((request) => request.id));
          const withoutDuplicates = current.filter((request) => !createdIds.has(request.id));
          return [...createdRequests, ...withoutDuplicates];
        });
        setSignupRequestStatus('submitted');
        setSignupRequestMessage(createdRequests.length === 1
          ? `Your request for ${createdRequests[0].target.name} is waiting for approval.`
          : `${createdRequests.length} requests are waiting for approval.`);
        void refreshProfile({ silent: true });
      })
      .catch((error) => {
        if (cancelled) return;
        setSignupRequestStatus('failed');
        setSignupRequestMessage(error instanceof Error ? error.message : String(error));
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, loading, me?.user.email, me?.user.status, refreshProfile, signupRequestStatus]);

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
  }, [isAuthenticated, me?.user.status, refreshProfile]);

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
    if (requestTargetType === 'team_setup' || requestSearch.trim().length < 2) {
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
  }, [isAuthenticated, requestSearch, requestTargetType, requestTeamId]);







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

  const hasSubmittedRequests = requests.length > 0 || signupRequestStatus === 'submitted';
  const requestCardTitle = hasSubmittedRequests ? 'Request additional access' : 'Request access';
  const requestCardDescription = hasSubmittedRequests
    ? 'Need another team or new team setup? Send another request for approval.'
    : 'Choose the access you need so an administrator can approve your account.';
  const submitRequestLabel = hasSubmittedRequests ? 'Send additional request' : 'Send request';

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
    const isTeamSetup = requestTargetType === 'team_setup';
    const teamName = newTeamName.trim();
    const ageGroup = newTeamAgeGroup.trim();
    const level = newTeamLevel.trim();
    if (isTeamSetup && (!teamName || !ageGroup || !level)) {
      pushToast({
        title: 'Team details required',
        description: 'Add the team name, age group, and level before submitting.',
        variant: 'warning',
      });
      return;
    }
    if (!isTeamSetup && !requestTargetId) {
      pushToast({
        title: 'Select a resource first',
        description: 'Choose the team you want access to.',
        variant: 'warning',
      });
      return;
    }

    setSubmitting(true);
    try {
      const created = await api.createAccessRequest({
        target_type: requestTargetType,
        target_id: isTeamSetup ? 'new-team' : requestTargetId,
        notes: requestNotes.trim() || null,
        details: isTeamSetup ? {
          team_name: teamName,
          age_group: ageGroup,
          level,
          location: newTeamLocation.trim(),
        } : undefined,
      });
      setRequests((current) => {
        const withoutDuplicate = current.filter((request) => request.id !== created.id);
        return [created, ...withoutDuplicate];
      });
      setRequestNotes('');
      if (isTeamSetup) {
        setNewTeamName('');
        setNewTeamAgeGroup('');
        setNewTeamLevel('');
        setNewTeamLocation('');
      }
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
            An administrator still needs to approve access to the right team, association, arena, or player.
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

      {signupRequestMessage ? (
        <Card className={cn(
          'p-4 text-sm',
          signupRequestStatus === 'failed'
            ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200'
            : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200',
        )}>
          {signupRequestMessage}
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
                          {getAccessTargetTypeLabel(invite.target.type)}
                          {invite.role ? ` · ${getAccessRoleLabel(invite.role)}` : ''}
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
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{requestCardTitle}</h2>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  {requestCardDescription}
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
                  <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    Search the team first, then choose the player you need access to.
                  </div>
                </div>
              ) : null}

              {requestTargetType === 'team_setup' ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                      Team name
                    </label>
                    <Input className="mt-2" value={newTeamName} onChange={(event) => setNewTeamName(event.target.value)} placeholder="Example: RinkLink 12U Blue" />
                  </div>
                  <div className="sm:col-span-2">
                    <AgeLevelSelect
                      ageGroup={newTeamAgeGroup}
                      level={newTeamLevel}
                      onAgeGroupChange={setNewTeamAgeGroup}
                      onLevelChange={setNewTeamLevel}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                      Location
                    </label>
                    <Input className="mt-2" value={newTeamLocation} onChange={(event) => setNewTeamLocation(event.target.value)} placeholder="Optional" />
                  </div>
                </div>
              ) : (
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
              )}

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

              <Button type="button" onClick={() => void submitAccessRequest()} disabled={submitting || requestOptionsLoading || (requestTargetType !== 'team_setup' && !requestTargetId)}>
                {submitting ? 'Sending…' : submitRequestLabel}
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


    </div>
  );
}

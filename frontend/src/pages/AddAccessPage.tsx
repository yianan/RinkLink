import { useEffect, useMemo, useState } from 'react';
import { PlusCircle } from 'lucide-react';

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
import { getAccessTargetTypeLabel } from '../lib/accessLabels';
import type { AccessRequest, AccessTarget } from '../types';

type AddAccessType = 'guardian_link' | 'player_link' | 'team' | 'team_setup' | 'association' | 'arena';

const ACCESS_TYPES: { value: AddAccessType; label: string; help: string }[] = [
  { value: 'guardian_link', label: 'My child is on a team', help: 'Request parent or guardian access to a player.' },
  { value: 'player_link', label: 'I am a player', help: 'Request access to your own player profile.' },
  { value: 'team', label: 'I help with an existing team', help: 'Request staff access to a team that already exists in RinkLink.' },
  { value: 'team_setup', label: 'Create a new team', help: 'Request a new team setup. An admin will review it first.' },
  { value: 'association', label: 'I help manage an association', help: 'Request association admin access.' },
  { value: 'arena', label: 'I help manage an arena', help: 'Request arena staff access.' },
];

function statusVariant(status: string) {
  switch (status) {
    case 'approved':
      return 'success' as const;
    case 'pending':
      return 'warning' as const;
    case 'rejected':
      return 'danger' as const;
    default:
      return 'outline' as const;
  }
}

function isPlayerRequest(type: AddAccessType) {
  return type === 'guardian_link' || type === 'player_link';
}

export default function AddAccessPage() {
  const { me } = useAuth();
  const pushToast = useToast();

  const [requestType, setRequestType] = useState<AddAccessType>('guardian_link');
  const [teamQuery, setTeamQuery] = useState('');
  const [teamOptions, setTeamOptions] = useState<AccessTarget[]>([]);
  const [teamId, setTeamId] = useState('');
  const [targetQuery, setTargetQuery] = useState('');
  const [targetOptions, setTargetOptions] = useState<AccessTarget[]>([]);
  const [targetId, setTargetId] = useState('');
  const [teamName, setTeamName] = useState('');
  const [ageGroup, setAgeGroup] = useState('');
  const [level, setLevel] = useState('');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const selectedType = useMemo(() => ACCESS_TYPES.find((option) => option.value === requestType) ?? ACCESS_TYPES[0], [requestType]);
  const selectedTarget = targetOptions.find((target) => target.id === targetId) || null;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.getAccessRequests({ scope: 'mine' })
      .then((nextRequests) => {
        if (!cancelled) setRequests(nextRequests);
      })
      .catch((error) => {
        if (!cancelled) {
          pushToast({
            title: 'Unable to load requests',
            description: error instanceof Error ? error.message : String(error),
            variant: 'error',
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setTargetQuery('');
    setTargetOptions([]);
    setTargetId('');
    setLookupError(null);
    if (!isPlayerRequest(requestType)) {
      setTeamQuery('');
      setTeamOptions([]);
      setTeamId('');
    }
  }, [requestType]);

  useEffect(() => {
    if (!isPlayerRequest(requestType)) return;
    if (teamQuery.trim().length < 2) {
      setTeamOptions([]);
      setTeamId('');
      return;
    }
    let cancelled = false;
    api.getAccessTargets({ target_type: 'team', q: teamQuery.trim() })
      .then((targets) => {
        if (cancelled) return;
        setTeamOptions(targets);
        setTeamId((current) => (current && targets.some((target) => target.id === current) ? current : targets[0]?.id || ''));
      })
      .catch((error) => {
        if (!cancelled) {
          setTeamOptions([]);
          setTeamId('');
          setLookupError(error instanceof Error ? error.message : String(error));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [requestType, teamQuery]);

  useEffect(() => {
    if (requestType === 'team_setup') return;
    if (targetQuery.trim().length < 2) {
      setTargetOptions([]);
      setTargetId('');
      return;
    }
    if (isPlayerRequest(requestType) && !teamId) {
      setTargetOptions([]);
      setTargetId('');
      return;
    }

    let cancelled = false;
    const params: Record<string, string> = { target_type: requestType, q: targetQuery.trim() };
    if (isPlayerRequest(requestType)) {
      params.team_id = teamId;
    }
    setLookupError(null);
    api.getAccessTargets(params)
      .then((targets) => {
        if (cancelled) return;
        setTargetOptions(targets);
        setTargetId((current) => (current && targets.some((target) => target.id === current) ? current : targets[0]?.id || ''));
      })
      .catch((error) => {
        if (!cancelled) {
          setTargetOptions([]);
          setTargetId('');
          setLookupError(error instanceof Error ? error.message : String(error));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [requestType, targetQuery, teamId]);

  const submitRequest = async () => {
    const isTeamSetup = requestType === 'team_setup';
    if (isTeamSetup && (!teamName.trim() || !ageGroup.trim() || !level.trim())) {
      pushToast({ title: 'Team details required', description: 'Add the team name, age group, and level.', variant: 'warning' });
      return;
    }
    if (!isTeamSetup && !selectedTarget) {
      pushToast({ title: 'Choose access first', description: 'Search and choose what you need access to.', variant: 'warning' });
      return;
    }

    setSubmitting(true);
    try {
      const created = await api.createAccessRequest({
        target_type: requestType,
        target_id: isTeamSetup ? 'new-team' : selectedTarget!.id,
        notes: notes.trim() || null,
        details: isTeamSetup
          ? {
              team_name: teamName.trim(),
              age_group: ageGroup.trim(),
              level: level.trim(),
              location: location.trim(),
            }
          : null,
      });
      setRequests((current) => [created, ...current.filter((request) => request.id !== created.id)]);
      setTargetQuery('');
      setTargetOptions([]);
      setTargetId('');
      setTeamName('');
      setAgeGroup('');
      setLevel('');
      setLocation('');
      setNotes('');
      pushToast({ title: 'Request sent', description: created.target.name, variant: 'success' });
    } catch (error) {
      pushToast({
        title: 'Unable to send request',
        description: error instanceof Error ? error.message : String(error),
        variant: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Add Access"
        subtitle="Request access to another player, team, association, arena, or ask us to set up a new team."
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,0.8fr)]">
        <Card className="p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">What do you need?</h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{selectedType.help}</p>
            </div>
            <PlusCircle className="h-5 w-5 text-cyan-700 dark:text-cyan-300" />
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">I need</label>
              <Select value={requestType} onChange={(event) => setRequestType(event.target.value as AddAccessType)}>
                {ACCESS_TYPES.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </Select>
            </div>

            {requestType === 'team_setup' ? (
              <>
                <div className="md:col-span-2">
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Team name</label>
                  <Input value={teamName} onChange={(event) => setTeamName(event.target.value)} placeholder="Example: RinkLink 12U Blue" />
                </div>
                <div className="md:col-span-2">
                  <AgeLevelSelect
                    ageGroup={ageGroup}
                    level={level}
                    onAgeGroupChange={setAgeGroup}
                    onLevelChange={setLevel}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Location</label>
                  <Input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Optional" />
                </div>
              </>
            ) : (
              <>
                {isPlayerRequest(requestType) ? (
                  <>
                    <div>
                      <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Find team</label>
                      <Input value={teamQuery} onChange={(event) => setTeamQuery(event.target.value)} placeholder="Start typing the team name" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Team</label>
                      <Select value={teamId} onChange={(event) => setTeamId(event.target.value)} disabled={teamOptions.length === 0}>
                        {teamOptions.length === 0 ? <option value="">Search for a team</option> : null}
                        {teamOptions.map((team) => (
                          <option key={team.id} value={team.id}>{team.name}{team.context ? ` · ${team.context}` : ''}</option>
                        ))}
                      </Select>
                    </div>
                  </>
                ) : null}

                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Search</label>
                  <Input
                    value={targetQuery}
                    onChange={(event) => setTargetQuery(event.target.value)}
                    placeholder={isPlayerRequest(requestType) ? 'Start typing the player name' : 'Start typing a name'}
                    disabled={isPlayerRequest(requestType) && !teamId}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Choose one</label>
                  <Select value={targetId} onChange={(event) => setTargetId(event.target.value)} disabled={targetOptions.length === 0}>
                    {targetOptions.length === 0 ? <option value="">Search first</option> : null}
                    {targetOptions.map((target) => (
                      <option key={target.id} value={target.id}>{target.name}{target.context ? ` · ${target.context}` : ''}</option>
                    ))}
                  </Select>
                </div>
              </>
            )}

            {lookupError ? <div className="text-sm text-rose-600 dark:text-rose-300 md:col-span-2">{lookupError}</div> : null}

            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Note</label>
              <Textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional" />
            </div>
          </div>

          <div className="mt-5">
            <Button type="button" onClick={() => void submitRequest()} disabled={submitting}>
              {submitting ? 'Sending…' : 'Send request'}
            </Button>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Your requests</h2>
            <Badge variant="outline">{requests.length}</Badge>
          </div>
          <div className="mt-4 space-y-3">
            {loading ? (
              <div className="rounded-xl border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">Loading…</div>
            ) : requests.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">No requests yet.</div>
            ) : (
              requests.map((request) => (
                <div key={request.id} className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{request.target.name}</div>
                      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {getAccessTargetTypeLabel(request.target.type)}{request.target.context ? ` · ${request.target.context}` : ''}
                      </div>
                    </div>
                    <Badge variant={statusVariant(request.status)}>{request.status}</Badge>
                  </div>
                </div>
              ))
            )}
          </div>
          {me?.user.email ? (
            <div className="mt-4 text-xs text-slate-500 dark:text-slate-400">
              Signed in as {me.user.email}
            </div>
          ) : null}
        </Card>
      </div>
    </div>
  );
}

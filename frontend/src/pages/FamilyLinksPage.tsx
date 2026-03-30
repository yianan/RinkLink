import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Copy, MailPlus, XCircle } from 'lucide-react';

import { api } from '../api/client';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import PageHeader from '../components/PageHeader';
import { useAuth } from '../context/AuthContext';
import { useTeam } from '../context/TeamContext';
import { useToast } from '../context/ToastContext';
import type { Invite, Player } from '../types';

type LinkType = 'guardian_link' | 'player_link';

const LINK_TYPE_LABELS: Record<LinkType, string> = {
  guardian_link: 'Parent / Guardian',
  player_link: 'Player (self)',
};

function statusVariant(status: string) {
  switch (status) {
    case 'accepted':
      return 'success' as const;
    case 'pending':
      return 'warning' as const;
    default:
      return 'danger' as const;
  }
}

export default function FamilyLinksPage() {
  const { authEnabled, me } = useAuth();
  const { activeTeam } = useTeam();
  const pushToast = useToast();

  const [players, setPlayers] = useState<Player[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Form state
  const [selectedPlayerId, setSelectedPlayerId] = useState('');
  const [email, setEmail] = useState('');
  const [linkType, setLinkType] = useState<LinkType>('guardian_link');

  const capabilities = me?.capabilities || [];
  const canManage =
    capabilities.includes('platform.manage') ||
    capabilities.includes('association.manage') ||
    capabilities.includes('team.manage_roster');

  const familyInvites = useMemo(
    () => invites.filter((i) => i.target.type === 'guardian_link' || i.target.type === 'player_link'),
    [invites],
  );

  useEffect(() => {
    if (!canManage || !activeTeam) return;

    let cancelled = false;
    setLoading(true);

    Promise.all([
      api.getPlayers(activeTeam.id),
      api.getInvites({ direction: 'managed', status: 'pending' }),
    ])
      .then(([nextPlayers, nextInvites]) => {
        if (cancelled) return;
        setPlayers(nextPlayers);
        setInvites(nextInvites);
        if (nextPlayers.length > 0 && !nextPlayers.some((p) => p.id === selectedPlayerId)) {
          setSelectedPlayerId(nextPlayers[0].id);
        }
      })
      .catch(() => {
        if (!cancelled) {
          pushToast({ title: 'Failed to load roster', variant: 'error' });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [activeTeam?.id, canManage]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!authEnabled) return <Navigate to="/" replace />;
  if (!canManage) return <Navigate to="/" replace />;

  const sendInvite = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      pushToast({ title: 'Enter an email address', variant: 'warning' });
      return;
    }
    if (!selectedPlayerId) {
      pushToast({ title: 'Select a player first', variant: 'warning' });
      return;
    }
    setBusy(true);
    try {
      const created = await api.createInvite({
        email: trimmedEmail,
        target_type: linkType,
        target_id: selectedPlayerId,
        role: null,
      });
      setInvites((current) => [created, ...current]);
      setEmail('');
      const player = players.find((p) => p.id === selectedPlayerId);
      pushToast({
        title: 'Invite sent',
        description: `${LINK_TYPE_LABELS[linkType]} invite for ${player ? `${player.first_name} ${player.last_name}` : 'player'} sent to ${trimmedEmail}`,
        variant: 'success',
      });
    } catch (err) {
      pushToast({
        title: 'Failed to send invite',
        description: err instanceof Error ? err.message : String(err),
        variant: 'error',
      });
    } finally {
      setBusy(false);
    }
  };

  const cancelInvite = async (invite: Invite) => {
    setBusy(true);
    try {
      await api.cancelInvite(invite.id);
      setInvites((current) => current.filter((i) => i.id !== invite.id));
      pushToast({ title: 'Invite cancelled', variant: 'info' });
    } catch (err) {
      pushToast({
        title: 'Failed to cancel invite',
        description: err instanceof Error ? err.message : String(err),
        variant: 'error',
      });
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async (invite: Invite) => {
    const url = `${window.location.origin}/invite/${invite.token}`;
    await navigator.clipboard.writeText(url);
    pushToast({ title: 'Invite link copied', variant: 'success' });
  };

  if (!activeTeam) {
    return (
      <div className="space-y-6">
        <PageHeader title="Family Links" subtitle="Select a team to manage parent and player account links." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Family Links"
        subtitle={`Invite parents or players to link their accounts to players on ${activeTeam.name}.`}
      />

      {/* Send invite form */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Send Invite</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Pick a player from the roster, enter the parent's or player's email, and send them an invite link.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Player
            </label>
            <Select
              value={selectedPlayerId}
              onChange={(e) => setSelectedPlayerId(e.target.value)}
              disabled={loading || players.length === 0}
            >
              {players.length === 0 ? (
                <option value="">{loading ? 'Loading roster…' : 'No players on roster'}</option>
              ) : (
                players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.first_name} {p.last_name}{p.jersey_number != null ? ` #${p.jersey_number}` : ''}
                  </option>
                ))
              )}
            </Select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Link as
            </label>
            <Select value={linkType} onChange={(e) => setLinkType(e.target.value as LinkType)}>
              <option value="guardian_link">{LINK_TYPE_LABELS.guardian_link}</option>
              <option value="player_link">{LINK_TYPE_LABELS.player_link}</option>
            </Select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Email
            </label>
            <Input
              type="email"
              placeholder="parent@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void sendInvite(); }}
            />
          </div>

          <div className="flex items-end">
            <Button
              type="button"
              onClick={() => void sendInvite()}
              disabled={busy || loading || !selectedPlayerId || !email.trim()}
              className="w-full sm:w-auto"
            >
              <MailPlus className="h-4 w-4" />
              Send Invite
            </Button>
          </div>
        </div>
      </Card>

      {/* Pending invites */}
      <Card className="p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Pending Invites</h2>
          <Badge variant="outline">{familyInvites.length}</Badge>
        </div>

        <div className="mt-4 space-y-3">
          {loading ? (
            <p className="rounded-xl border border-dashed border-slate-300 px-4 py-5 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
              Loading…
            </p>
          ) : familyInvites.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 px-4 py-5 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
              No pending family invites.
            </p>
          ) : (
            familyInvites.map((invite) => (
              <div
                key={invite.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60"
              >
                <div className="space-y-0.5">
                  <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {invite.target.name}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {LINK_TYPE_LABELS[(invite.target.type as LinkType)] || invite.target.type}
                    {' · '}
                    {invite.email}
                    {' · expires '}
                    {new Date(invite.expires_at).toLocaleDateString()}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={statusVariant(invite.status)}>{invite.status}</Badge>
                  <Button type="button" variant="outline" size="sm" onClick={() => void copyLink(invite)} disabled={busy}>
                    <Copy className="h-3.5 w-3.5" />
                    Copy link
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => void cancelInvite(invite)} disabled={busy}>
                    <XCircle className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}

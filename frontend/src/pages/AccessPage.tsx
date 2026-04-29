import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Copy, Lock, MailPlus, RefreshCcw, Search, ShieldCheck, ShieldOff, Trash2, Unlock, UserCheck, XCircle } from 'lucide-react';

import { api } from '../api/client';
import EmptyState from '../components/EmptyState';
import SegmentedTabs from '../components/SegmentedTabs';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { Select } from '../components/ui/Select';
import { Textarea } from '../components/ui/Textarea';
import PageHeader from '../components/PageHeader';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { getAccessRoleLabel, getAccessTargetTypeLabel } from '../lib/accessLabels';
import type { AccessRequest, AppUserIdentity, Arena, Association, AccessibleTeam, Invite, Player, UserAccessEntry, UserAccessSummary, UserAuditEntry } from '../types';

const TEAM_ROLES = ['team_admin', 'manager', 'scheduler', 'coach'] as const;
const ARENA_ROLES = ['arena_admin', 'arena_ops'] as const;
const ASSOCIATION_ROLES = ['association_admin'] as const;
type InviteTargetType = 'association' | 'team' | 'arena' | 'guardian_link' | 'player_link';
type UserAccessAction = 'disable-app' | 'restore-app' | 'disable-auth' | 'restore-auth';
type UserDetailTab = 'access' | 'history';

type UserAccessActionDraft = {
  action: UserAccessAction;
  user: AppUserIdentity;
};

type UserAccessRemovalDraft = {
  user: AppUserIdentity;
  entry: UserAccessEntry;
};

function statusVariant(status: string) {
  switch (status) {
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

function canManageAccess(capabilities: string[]) {
  return capabilities.some((capability) => (
    capability === 'platform.manage'
    || capability === 'association.manage'
    || capability === 'team.manage_staff'
    || capability === 'arena.manage'
  ));
}

function roleOptionsForTarget(targetType: string) {
  if (targetType === 'association') return [...ASSOCIATION_ROLES];
  if (targetType === 'team') return [...TEAM_ROLES];
  if (targetType === 'arena') return [...ARENA_ROLES];
  return [] as string[];
}

function getUserAccessActionConfig(action: UserAccessAction, user: AppUserIdentity) {
  switch (action) {
    case 'disable-app':
      return {
        title: 'Disable app access',
        description: `Disable ${user.email} in RinkLink. Their memberships remain in place, but the app will reject access until restored.`,
        confirmLabel: 'Disable app access',
        confirmVariant: 'destructive' as const,
        successTitle: 'App access disabled',
        errorTitle: 'Unable to disable app access',
      };
    case 'restore-app':
      return {
        title: 'Restore app access',
        description: `Restore ${user.email} so they can use RinkLink again without rebuilding memberships or family links.`,
        confirmLabel: 'Restore app access',
        confirmVariant: 'primary' as const,
        successTitle: 'App access restored',
        errorTitle: 'Unable to restore app access',
      };
    case 'disable-auth':
      return {
        title: 'Disable sign-in',
        description: `Disable sign-in for ${user.email}. Existing auth sessions will be revoked and new sign-ins will be blocked until restored.`,
        confirmLabel: 'Disable sign-in',
        confirmVariant: 'destructive' as const,
        successTitle: 'Sign-in disabled',
        errorTitle: 'Unable to disable sign-in',
      };
    case 'restore-auth':
      return {
        title: 'Restore sign-in',
        description: `Restore sign-in for ${user.email}. They will be able to authenticate again immediately.`,
        confirmLabel: 'Restore sign-in',
        confirmVariant: 'primary' as const,
        successTitle: 'Sign-in restored',
        errorTitle: 'Unable to restore sign-in',
      };
  }
}

function getMembershipKindLabel(kind: string) {
  switch (kind) {
    case 'association':
      return 'Association Access';
    case 'team':
      return 'Team Access';
    case 'arena':
      return 'Arena Access';
    case 'guardian':
      return 'Family Link';
    case 'player':
      return 'Player Link';
    default:
      return 'Access';
  }
}

function getAccessEntryLabel(entry: UserAccessEntry) {
  if (entry.role) {
    return getAccessRoleLabel(entry.role);
  }
  if (entry.membership_kind === 'guardian') {
    return 'Parent/Guardian Link';
  }
  if (entry.membership_kind === 'player') {
    return 'Player Link';
  }
  return getAccessTargetTypeLabel(entry.target_type);
}

function getRemoveAccessCopy(entry: UserAccessEntry, user: AppUserIdentity) {
  return {
    title: `Remove ${getMembershipKindLabel(entry.membership_kind).toLowerCase()}?`,
    description: `Remove ${user.email} from ${entry.name}? This only removes this scoped relationship.`,
    confirmLabel: `Remove ${getMembershipKindLabel(entry.membership_kind).toLowerCase()}`,
  };
}

function formatAuditAction(action: string) {
  switch (action) {
    case 'membership.revoked':
      return 'Membership removed';
    case 'guardian_link.revoked':
      return 'Family link removed';
    case 'player_link.revoked':
      return 'Player link removed';
    case 'user.app_access_disabled':
      return 'App access disabled';
    case 'user.app_access_restored':
      return 'App access restored';
    case 'user.auth_disabled':
      return 'Sign-in disabled';
    case 'user.auth_restored':
      return 'Sign-in restored';
    case 'invite.accepted':
      return 'Invite accepted';
    case 'access_request.approved':
      return 'Access request approved';
    case 'access_request.rejected':
      return 'Access request rejected';
    case 'access_request.created':
      return 'Access request created';
    default:
      return action.replaceAll('_', ' ').replaceAll('.', ' ');
  }
}

export default function AccessPage() {
  const location = useLocation();
  const { authEnabled, me } = useAuth();
  const pushToast = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [associations, setAssociations] = useState<Association[]>([]);
  const [arenas, setArenas] = useState<Arena[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [requestRoles, setRequestRoles] = useState<Record<string, string>>({});
  const [userQuery, setUserQuery] = useState('');
  const [userResults, setUserResults] = useState<AppUserIdentity[]>([]);
  const [userSearchLoading, setUserSearchLoading] = useState(false);
  const [userDetailSummary, setUserDetailSummary] = useState<UserAccessSummary | null>(null);
  const [userDetailLoading, setUserDetailLoading] = useState(false);
  const [userDetailTab, setUserDetailTab] = useState<UserDetailTab>('access');
  const [userAccessAction, setUserAccessAction] = useState<UserAccessActionDraft | null>(null);
  const [userAccessReason, setUserAccessReason] = useState('');
  const [userAccessRemoval, setUserAccessRemoval] = useState<UserAccessRemovalDraft | null>(null);
  const [userAccessRemovalReason, setUserAccessRemovalReason] = useState('');

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteTargetType, setInviteTargetType] = useState<InviteTargetType>('team');
  const [inviteTargetId, setInviteTargetId] = useState('');
  const [inviteRole, setInviteRole] = useState<string>('team_admin');
  const [invitePlayerTeamId, setInvitePlayerTeamId] = useState('');

  const familyOnlyMode = location.pathname === '/family-links';
  const teams = useMemo<AccessibleTeam[]>(() => me?.accessible_teams || [], [me?.accessible_teams]);
  const capabilities = useMemo(() => me?.capabilities || [], [me?.capabilities]);
  const manageAccess = useMemo(() => canManageAccess(capabilities), [capabilities]);
  const canManageUsers = !familyOnlyMode && capabilities.includes('platform.manage');
  const canInviteAssociations = capabilities.includes('platform.manage') || capabilities.includes('association.manage');
  const canInviteTeams = canInviteAssociations || capabilities.includes('team.manage_staff');
  const canInviteArenas = capabilities.includes('platform.manage') || capabilities.includes('arena.manage');
  const canInviteFamilyLinks = canInviteAssociations || capabilities.includes('team.manage_roster');
  const pageVisible = familyOnlyMode ? canInviteFamilyLinks : manageAccess;
  const availableTargetTypes = useMemo<InviteTargetType[]>(() => {
    if (familyOnlyMode) {
      return canInviteFamilyLinks ? ['guardian_link', 'player_link'] : [];
    }
    const next: InviteTargetType[] = [];
    if (canInviteAssociations) next.push('association');
    if (canInviteTeams) next.push('team');
    if (canInviteArenas) next.push('arena');
    if (canInviteFamilyLinks) {
      next.push('guardian_link', 'player_link');
    }
    return next;
  }, [canInviteArenas, canInviteAssociations, canInviteFamilyLinks, canInviteTeams, familyOnlyMode]);

  const filteredInvites = useMemo(() => {
    if (!familyOnlyMode) {
      return invites;
    }
    return invites.filter((invite) => invite.target.type === 'guardian_link' || invite.target.type === 'player_link');
  }, [familyOnlyMode, invites]);

  const filteredRequests = useMemo(() => {
    if (!familyOnlyMode) {
      return requests;
    }
    return requests.filter((request) => request.target.type === 'guardian_link' || request.target.type === 'player_link');
  }, [familyOnlyMode, requests]);

  const resourceOptions = useMemo(() => {
    if (inviteTargetType === 'association') {
      return associations.map((association) => ({
        id: association.id,
        label: association.name,
        detail: [association.city, association.state].filter(Boolean).join(', '),
      }));
    }
    if (inviteTargetType === 'team') {
      return teams.map((team) => ({
        id: team.id,
        label: team.name,
        detail: `${team.age_group} · ${team.level}`,
      }));
    }
    if (inviteTargetType === 'arena') {
      return arenas.map((arena) => ({
        id: arena.id,
        label: arena.name,
        detail: [arena.city, arena.state].filter(Boolean).join(', '),
      }));
    }
    return players.map((player) => ({
      id: player.id,
      label: `${player.first_name} ${player.last_name}`,
      detail: player.jersey_number ? `#${player.jersey_number}` : player.position || '',
    }));
  }, [arenas, associations, inviteTargetType, players, teams]);

  const roleOptions = useMemo(() => roleOptionsForTarget(inviteTargetType), [inviteTargetType]);

  const loadQueues = useCallback(async () => {
    const [nextInvites, nextRequests] = await Promise.all([
      api.getInvites({ direction: 'managed', status: 'pending' }),
      api.getAccessRequests({ scope: 'review', status: 'pending' }),
    ]);
    setInvites(nextInvites);
    setRequests(nextRequests);
    setRequestRoles((current) => {
      const next = { ...current };
      for (const request of nextRequests) {
        const options = roleOptionsForTarget(request.target.type);
        if (options.length > 0 && !next[request.id]) {
          next[request.id] = options[0];
        }
      }
      return next;
    });
  }, []);

  const loadResources = useCallback(async () => {
    const [nextAssociations, nextArenas] = await Promise.all([
      canInviteAssociations ? api.getAssociations() : Promise.resolve([]),
      canInviteArenas ? api.getArenas() : Promise.resolve([]),
    ]);
    setAssociations(nextAssociations);
    setArenas(nextArenas);
  }, [canInviteArenas, canInviteAssociations]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([loadQueues(), loadResources()]);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setLoading(false);
    }
  }, [loadQueues, loadResources]);

  useEffect(() => {
    if (!pageVisible) return;
    void load();
  }, [load, pageVisible]);

  useEffect(() => {
    if (!pageVisible) {
      return;
    }

    const syncQueues = () => {
      void loadQueues().catch(() => {});
    };

    const intervalId = window.setInterval(syncQueues, 15_000);
    window.addEventListener('focus', syncQueues);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', syncQueues);
    };
  }, [loadQueues, pageVisible]);

  useEffect(() => {
    if (availableTargetTypes.length === 0) {
      return;
    }
    if (!availableTargetTypes.includes(inviteTargetType)) {
      setInviteTargetType(availableTargetTypes[0]);
    }
  }, [availableTargetTypes, inviteTargetType]);

  useEffect(() => {
    if (roleOptions.length === 0) {
      setInviteRole('');
      return;
    }
    if (!roleOptions.includes(inviteRole)) {
      setInviteRole(roleOptions[0]);
    }
  }, [inviteRole, roleOptions]);

  useEffect(() => {
    if (inviteTargetType !== 'guardian_link' && inviteTargetType !== 'player_link') {
      setPlayers([]);
      setInvitePlayerTeamId('');
      return;
    }
    if (!invitePlayerTeamId && teams.length > 0) {
      setInvitePlayerTeamId(teams[0].id);
    }
  }, [inviteTargetType, invitePlayerTeamId, teams]);

  useEffect(() => {
    if (inviteTargetType !== 'guardian_link' && inviteTargetType !== 'player_link') {
      return;
    }
    if (!invitePlayerTeamId) {
      setPlayers([]);
      return;
    }
    let cancelled = false;
    api.getPlayers(invitePlayerTeamId)
      .then((nextPlayers) => {
        if (!cancelled) {
          setPlayers(nextPlayers);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPlayers([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [invitePlayerTeamId, inviteTargetType]);

  useEffect(() => {
    if (resourceOptions.length === 0) {
      setInviteTargetId('');
      return;
    }
    if (!resourceOptions.some((option) => option.id === inviteTargetId)) {
      setInviteTargetId(resourceOptions[0].id);
    }
  }, [inviteTargetId, resourceOptions]);

  if (!authEnabled) {
    return <Navigate to="/" replace />;
  }

  if (!pageVisible) {
    return <Navigate to="/" replace />;
  }

  const activeUserAccessConfig = userAccessAction
    ? getUserAccessActionConfig(userAccessAction.action, userAccessAction.user)
    : null;
  const activeUserRemovalCopy = userAccessRemoval
    ? getRemoveAccessCopy(userAccessRemoval.entry, userAccessRemoval.user)
    : null;
  const groupedUserAccessEntries = userDetailSummary?.access_entries.reduce<Record<string, UserAccessEntry[]>>((groups, entry) => {
    const key = entry.membership_kind;
    groups[key] = groups[key] ? [...groups[key], entry] : [entry];
    return groups;
  }, {}) ?? {};

  const copyInviteLink = async (invite: Invite) => {
    const url = `${window.location.origin}/invite/${invite.token}`;
    await navigator.clipboard.writeText(url);
    pushToast({ title: 'Invite link copied', description: invite.target.name, variant: 'success' });
  };

  const cancelInvite = async (invite: Invite) => {
    setBusyKey(`invite:${invite.id}`);
    try {
      await api.cancelInvite(invite.id);
      setInvites((current) => current.filter((entry) => entry.id !== invite.id));
      pushToast({ title: 'Invite cancelled', description: invite.target.name, variant: 'info' });
    } catch (nextError) {
      pushToast({
        title: 'Unable to cancel invite',
        description: nextError instanceof Error ? nextError.message : String(nextError),
        variant: 'error',
      });
    } finally {
      setBusyKey(null);
    }
  };

  const createInvite = async () => {
    if (!inviteEmail.trim()) {
      pushToast({ title: 'Invite email required', description: 'Enter the recipient email before creating an invite.', variant: 'warning' });
      return;
    }
    if (!inviteTargetId) {
      pushToast({ title: 'Invite target required', description: 'Select a resource or player for this invite.', variant: 'warning' });
      return;
    }
    setBusyKey('invite:create');
    try {
      const created = await api.createInvite({
        email: inviteEmail.trim(),
        target_type: inviteTargetType,
        target_id: inviteTargetId,
        role: roleOptions.length > 0 ? inviteRole : null,
      });
      setInvites((current) => [created, ...current]);
      setInviteEmail('');
      pushToast({ title: 'Invite created', description: `${created.target.name} · ${created.email}`, variant: 'success' });
    } catch (nextError) {
      pushToast({
        title: 'Unable to create invite',
        description: nextError instanceof Error ? nextError.message : String(nextError),
        variant: 'error',
      });
    } finally {
      setBusyKey(null);
    }
  };

  const approveRequest = async (request: AccessRequest) => {
    const options = roleOptionsForTarget(request.target.type);
    const role = options.length > 0 ? requestRoles[request.id] ?? options[0] : null;
    setBusyKey(`request:approve:${request.id}`);
    try {
      await api.approveAccessRequest(request.id, role);
      setRequests((current) => current.filter((entry) => entry.id !== request.id));
      pushToast({ title: 'Access request approved', description: request.target.name, variant: 'success' });
    } catch (nextError) {
      pushToast({
        title: 'Unable to approve request',
        description: nextError instanceof Error ? nextError.message : String(nextError),
        variant: 'error',
      });
    } finally {
      setBusyKey(null);
    }
  };

  const rejectRequest = async (request: AccessRequest) => {
    setBusyKey(`request:reject:${request.id}`);
    try {
      await api.rejectAccessRequest(request.id);
      setRequests((current) => current.filter((entry) => entry.id !== request.id));
      pushToast({ title: 'Access request rejected', description: request.target.name, variant: 'info' });
    } catch (nextError) {
      pushToast({
        title: 'Unable to reject request',
        description: nextError instanceof Error ? nextError.message : String(nextError),
        variant: 'error',
      });
    } finally {
      setBusyKey(null);
    }
  };

  const searchUsers = async () => {
    setUserSearchLoading(true);
    try {
      const nextUsers = await api.getUsers(userQuery.trim() ? { query: userQuery.trim() } : undefined);
      setUserResults(nextUsers);
    } catch (nextError) {
      pushToast({
        title: 'Unable to load users',
        description: nextError instanceof Error ? nextError.message : String(nextError),
        variant: 'error',
      });
    } finally {
      setUserSearchLoading(false);
    }
  };

  const updateUserInResults = (nextUser: AppUserIdentity) => {
    setUserResults((current) => current.map((entry) => (entry.id === nextUser.id ? nextUser : entry)));
    setUserDetailSummary((current) => (current && current.user.id === nextUser.id ? { ...current, user: nextUser } : current));
  };

  const loadUserAccessSummary = async (userId: string) => {
    setUserDetailLoading(true);
    try {
      const summary = await api.getUserAccessSummary(userId);
      setUserDetailSummary((current) => (current && current.user.id === userId ? summary : current));
    } catch (nextError) {
      setUserDetailSummary((current) => (current && current.user.id === userId ? null : current));
      pushToast({
        title: 'Unable to load user access',
        description: nextError instanceof Error ? nextError.message : String(nextError),
        variant: 'error',
      });
    } finally {
      setUserDetailLoading(false);
    }
  };

  const openUserDetail = async (user: AppUserIdentity) => {
    setUserDetailSummary({ user, access_entries: [], audit_entries: [] });
    setUserDetailTab('access');
    await loadUserAccessSummary(user.id);
  };

  const closeUserDetail = () => {
    setUserDetailSummary(null);
    setUserDetailLoading(false);
    setUserDetailTab('access');
  };

  const openUserAccessAction = (action: UserAccessAction, user: AppUserIdentity) => {
    setUserAccessAction({ action, user });
    setUserAccessReason('');
  };

  const closeUserAccessAction = () => {
    setUserAccessAction(null);
    setUserAccessReason('');
  };

  const openUserAccessRemoval = (user: AppUserIdentity, entry: UserAccessEntry) => {
    setUserAccessRemoval({ user, entry });
    setUserAccessRemovalReason('');
  };

  const closeUserAccessRemoval = () => {
    setUserAccessRemoval(null);
    setUserAccessRemovalReason('');
  };

  const submitUserAccessAction = async () => {
    if (!userAccessAction) {
      return;
    }
    const { action, user } = userAccessAction;
    const config = getUserAccessActionConfig(action, user);
    setBusyKey(`user:${action}:${user.id}`);
    try {
      const reason = userAccessReason.trim() || null;
      const updated = action === 'disable-app'
        ? await api.disableAppAccess(user.id, reason)
        : action === 'restore-app'
          ? await api.restoreAppAccess(user.id, reason)
          : action === 'disable-auth'
            ? await api.disableAuth(user.id, reason)
            : await api.restoreAuth(user.id, reason);
      updateUserInResults(updated);
      pushToast({ title: config.successTitle, description: user.email, variant: 'success' });
      closeUserAccessAction();
      void loadUserAccessSummary(user.id);
    } catch (nextError) {
      pushToast({
        title: config.errorTitle,
        description: nextError instanceof Error ? nextError.message : String(nextError),
        variant: 'error',
      });
    } finally {
      setBusyKey(null);
    }
  };

  const submitUserAccessRemoval = async () => {
    if (!userAccessRemoval) {
      return;
    }
    const { user, entry } = userAccessRemoval;
    setBusyKey(`membership:${entry.membership_kind}:${entry.membership_id}`);
    try {
      await api.revokeMembership(entry.membership_kind, entry.membership_id, userAccessRemovalReason.trim() || null);
      pushToast({ title: 'Scoped access removed', description: `${user.email} · ${entry.name}`, variant: 'success' });
      closeUserAccessRemoval();
      await loadUserAccessSummary(user.id);
    } catch (nextError) {
      pushToast({
        title: 'Unable to remove scoped access',
        description: nextError instanceof Error ? nextError.message : String(nextError),
        variant: 'error',
      });
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={familyOnlyMode ? 'Family Links' : 'Access'}
        subtitle={familyOnlyMode
          ? 'Create invites and review parent, guardian, and player link requests for the teams you administer.'
          : 'Create app-level invites, review pending access requests, and manage the onboarding queue for the resources you administer.'}
        actions={(
          <Button type="button" variant="outline" onClick={() => void load()} disabled={loading || !!busyKey}>
            <RefreshCcw className="h-4 w-4" />
            Refresh
          </Button>
        )}
      />

      {error ? (
        <Card className="border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
          {error}
        </Card>
      ) : null}

      {canManageUsers ? (
        <Card className="p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">User Access</h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                Search existing users, then manage whether they can use RinkLink and whether they can authenticate.
                Memberships and family links stay separate.
              </p>
            </div>
            <span className="inline-flex shrink-0 whitespace-nowrap rounded-full border border-cyan-300 bg-cyan-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-800 shadow-sm dark:border-cyan-800 dark:bg-cyan-950/50 dark:text-cyan-200">
              Platform Admin
            </span>
          </div>

          <div className="mt-5 flex flex-col gap-3 md:flex-row">
            <Input
              type="search"
              placeholder="Search by email or display name"
              value={userQuery}
              onChange={(event) => {
                setUserQuery(event.target.value);
                setUserResults([]);
                closeUserDetail();
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void searchUsers();
                }
              }}
            />
            <Button type="button" variant="outline" onClick={() => void searchUsers()} disabled={userSearchLoading || !!busyKey}>
              <Search className="h-4 w-4" />
              Search users
            </Button>
          </div>

          <div className="mt-5 space-y-4">
            {userSearchLoading ? (
              <div className="rounded-2xl border border-dashed border-slate-300/80 px-4 py-6 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                Loading users…
              </div>
            ) : userResults.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300/80 px-4 py-6 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                Search for an email or display name to manage user access.
              </div>
            ) : (
              userResults.map((user) => {
                const isDisabled = user.access_state === 'disabled';
                const isAuthDisabled = user.auth_state === 'disabled';
                const isCurrentUser = user.id === me?.user.id;
                return (
                  <div
                    key={user.id}
                    className="rounded-2xl border border-slate-200/80 bg-slate-50/90 p-4 dark:border-slate-800 dark:bg-slate-900/60"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {user.display_name || user.email}
                        </div>
                        <div className="text-sm text-slate-600 dark:text-slate-300">{user.email}</div>
                        <div className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                          Status: {user.status} · Can use RinkLink: {user.access_state} · Can authenticate: {user.auth_state}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant={user.status === 'active' ? 'success' : 'warning'}>{user.status}</Badge>
                        <Badge variant={isDisabled ? 'danger' : 'success'}>{user.access_state}</Badge>
                        <Badge variant={isAuthDisabled ? 'danger' : 'success'}>{user.auth_state}</Badge>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-3">
                      <Button type="button" variant="outline" onClick={() => void openUserDetail(user)} disabled={!!busyKey}>
                        <UserCheck className="h-4 w-4" />
                        Manage details
                      </Button>

                      {isDisabled ? (
                        <Button type="button" onClick={() => openUserAccessAction('restore-app', user)} disabled={!!busyKey}>
                          <ShieldCheck className="h-4 w-4" />
                          Restore app access
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          variant="destructive"
                          onClick={() => openUserAccessAction('disable-app', user)}
                          disabled={!!busyKey || isCurrentUser}
                        >
                          <ShieldOff className="h-4 w-4" />
                          Disable app access
                        </Button>
                      )}

                      {isAuthDisabled ? (
                        <Button type="button" variant="outline" onClick={() => openUserAccessAction('restore-auth', user)} disabled={!!busyKey}>
                          <Unlock className="h-4 w-4" />
                          Restore sign-in
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          variant="destructive"
                          onClick={() => openUserAccessAction('disable-auth', user)}
                          disabled={!!busyKey || isCurrentUser}
                        >
                          <Lock className="h-4 w-4" />
                          Disable sign-in
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Card>
      ) : null}

      <Card className="p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Create Invite</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              {familyOnlyMode
                ? 'Use invites for the exact account email you want linked to a parent/guardian relationship or self-managed player account.'
                : 'Use invites for the exact account email you want linked to a team, association, arena, parent/guardian relationship, or player account.'}
            </p>
          </div>
          <Badge variant="outline">Preferred onboarding path</Badge>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(15rem,1fr)_minmax(13rem,0.9fr)_minmax(13rem,0.9fr)]">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              Recipient email
            </label>
            <Input
              type="email"
              placeholder="parent@example.com"
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              Target type
            </label>
            <Select
              value={inviteTargetType}
              onChange={(event) => setInviteTargetType(event.target.value as InviteTargetType)}
              disabled={availableTargetTypes.length === 0}
            >
              {availableTargetTypes.length === 0 ? (
                <option value="">No invite targets available</option>
              ) : availableTargetTypes.map((targetType) => (
                <option key={targetType} value={targetType}>
                  {getAccessTargetTypeLabel(targetType)}
                </option>
              ))}
            </Select>
          </div>

          {roleOptions.length > 0 ? (
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                Role
              </label>
              <Select value={inviteRole} onChange={(event) => setInviteRole(event.target.value)}>
                {roleOptions.map((role) => (
                  <option key={role} value={role}>
                    {getAccessRoleLabel(role)}
                  </option>
                ))}
              </Select>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-300">
              {inviteTargetType === 'guardian_link'
                ? 'Guardian invites create a parent/guardian link to one player.'
                : 'Player invites create the self-managed player attendance/account link.'}
            </div>
          )}
        </div>

        {inviteTargetType === 'guardian_link' || inviteTargetType === 'player_link' ? (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                Team
              </label>
              <Select value={invitePlayerTeamId} onChange={(event) => setInvitePlayerTeamId(event.target.value)}>
                {teams.length === 0 ? <option value="">No accessible teams</option> : null}
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name} · {team.age_group} · {team.level}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                Player
              </label>
              <Select value={inviteTargetId} onChange={(event) => setInviteTargetId(event.target.value)}>
                {players.length === 0 ? <option value="">No players available</option> : null}
                {resourceOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}{option.detail ? ` · ${option.detail}` : ''}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        ) : (
          <div className="mt-4">
            <label className="mb-1 block text-xs font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              Target
            </label>
            <Select value={inviteTargetId} onChange={(event) => setInviteTargetId(event.target.value)}>
              {resourceOptions.length === 0 ? <option value="">No targets available</option> : null}
              {resourceOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}{option.detail ? ` · ${option.detail}` : ''}
                </option>
              ))}
            </Select>
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-3">
          <Button type="button" onClick={() => void createInvite()} disabled={busyKey !== null || loading || availableTargetTypes.length === 0}>
            <MailPlus className="h-4 w-4" />
            Create invite
          </Button>
        </div>
      </Card>

      <div className={`grid gap-6 ${familyOnlyMode ? '' : 'xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]'}`}>
        <Card className="p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {familyOnlyMode ? 'Family Review Queue' : 'Review Queue'}
                </h2>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  {familyOnlyMode
                    ? 'These requests are waiting for approval on parent, guardian, and player links for teams you manage.'
                    : 'These requests are waiting for approval on teams, associations, arenas, or family/player links that you manage.'}
                </p>
              </div>
              <Badge variant="outline">{filteredRequests.length} open</Badge>
            </div>

            <div className="mt-5 space-y-4">
              {loading ? (
                <div className="rounded-2xl border border-dashed border-slate-300/80 px-4 py-6 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  Loading access requests…
                </div>
              ) : filteredRequests.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300/80 px-4 py-6 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  No pending access requests for the resources you manage.
                </div>
              ) : (
                filteredRequests.map((request) => {
                  const requestRoleOptions = roleOptionsForTarget(request.target.type);
                  const selectedRole = requestRoles[request.id] ?? requestRoleOptions[0] ?? '';

                  return (
                    <div
                      key={request.id}
                      className="rounded-2xl border border-slate-200/80 bg-slate-50/90 p-4 dark:border-slate-800 dark:bg-slate-900/60"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{request.target.name}</div>
                          {request.target.context ? (
                            <div className="text-sm text-slate-600 dark:text-slate-300">{request.target.context}</div>
                          ) : null}
                          <div className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                            {getAccessTargetTypeLabel(request.target.type)}
                          </div>
                        </div>
                        <Badge variant={statusVariant(request.status)}>{request.status}</Badge>
                      </div>

                      <div className="mt-4 text-sm text-slate-600 dark:text-slate-300">
                        Requested by <span className="font-medium text-slate-900 dark:text-slate-100">{request.user_email || 'Unknown user'}</span>
                      </div>
                      {request.notes ? (
                        <div className="mt-2 rounded-xl border border-slate-200/80 bg-white/80 px-3 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-300">
                          {request.notes}
                        </div>
                      ) : null}

                      {requestRoleOptions.length > 0 ? (
                        <div className="mt-4">
                          <label className="mb-1 block text-xs font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                            Grant role
                          </label>
                          <Select
                            value={selectedRole}
                            onChange={(event) => setRequestRoles((current) => ({ ...current, [request.id]: event.target.value }))}
                          >
                            {requestRoleOptions.map((role) => (
                              <option key={role} value={role}>
                                {getAccessRoleLabel(role)}
                              </option>
                            ))}
                          </Select>
                        </div>
                      ) : null}

                      <div className="mt-4 flex flex-wrap gap-3">
                        <Button type="button" onClick={() => void approveRequest(request)} disabled={busyKey !== null}>
                          <UserCheck className="h-4 w-4" />
                          Approve
                        </Button>
                        <Button type="button" variant="ghost" onClick={() => void rejectRequest(request)} disabled={busyKey !== null}>
                          <XCircle className="h-4 w-4" />
                          Reject
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {familyOnlyMode ? 'Family Invites' : 'Managed Invites'}
              </h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                {familyOnlyMode
                  ? 'Open parent/guardian and player invites for the teams you can manage. Copy links for testing or cancel stale entries.'
                  : 'Open invites for the resources you can administer. Copy links for testing or cancel stale entries.'}
              </p>
            </div>
            <Badge variant="outline">{filteredInvites.length} open</Badge>
          </div>

          <div className="mt-5 space-y-4">
            {loading ? (
              <div className="rounded-2xl border border-dashed border-slate-300/80 px-4 py-6 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                Loading invites…
              </div>
            ) : filteredInvites.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300/80 px-4 py-6 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                No pending invites on resources you manage yet.
              </div>
            ) : (
              filteredInvites.map((invite) => (
                <div
                  key={invite.id}
                  className="rounded-2xl border border-slate-200/80 bg-slate-50/90 p-4 dark:border-slate-800 dark:bg-slate-900/60"
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

                  <div className="mt-4 text-sm text-slate-600 dark:text-slate-300">
                    <div>{invite.email}</div>
                    <div className="mt-1">Expires {new Date(invite.expires_at).toLocaleString()}</div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-3">
                    <Button type="button" variant="outline" onClick={() => void copyInviteLink(invite)} disabled={busyKey !== null}>
                      <Copy className="h-4 w-4" />
                      Copy link
                    </Button>
                    <Button type="button" variant="ghost" onClick={() => void cancelInvite(invite)} disabled={busyKey !== null}>
                      <ShieldCheck className="h-4 w-4" />
                      Cancel
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      <Modal
        open={!!userDetailSummary}
        onClose={closeUserDetail}
        title={userDetailSummary ? (userDetailSummary.user.display_name || userDetailSummary.user.email) : 'User access'}
        description={userDetailSummary ? `Manage scoped access, RinkLink usage, authentication, and audit history for ${userDetailSummary.user.email}.` : undefined}
        className="max-w-5xl"
        footer={(
          <Button type="button" variant="outline" onClick={closeUserDetail} disabled={!!busyKey}>
            Close
          </Button>
        )}
      >
        {userDetailLoading ? (
          <div className="rounded-2xl border border-dashed border-slate-300/80 px-4 py-10 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
            Loading user access…
          </div>
        ) : userDetailSummary ? (
          <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/50">
              <div className="space-y-1">
                <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {userDetailSummary.user.display_name || userDetailSummary.user.email}
                </div>
                <div className="text-sm text-slate-600 dark:text-slate-300">{userDetailSummary.user.email}</div>
                <div className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                  Status: {userDetailSummary.user.status}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant={userDetailSummary.user.status === 'active' ? 'success' : 'warning'}>
                  {userDetailSummary.user.status}
                </Badge>
                <Badge variant={userDetailSummary.user.access_state === 'disabled' ? 'danger' : 'success'}>
                  Can use RinkLink: {userDetailSummary.user.access_state}
                </Badge>
                <Badge variant={userDetailSummary.user.auth_state === 'disabled' ? 'danger' : 'success'}>
                  Can authenticate: {userDetailSummary.user.auth_state}
                </Badge>
              </div>
            </div>

            <SegmentedTabs
              items={[
                { value: 'access' as const, label: 'Access' },
                { value: 'history' as const, label: 'History' },
              ]}
              value={userDetailTab}
              onChange={setUserDetailTab}
            />

            {userDetailTab === 'access' ? (
              <div className="space-y-6">
                <Card className="p-6">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Access</h3>
                      <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                        Memberships and family links are scoped. Removing one row does not affect other access.
                      </p>
                    </div>
                    <Badge variant="outline">{userDetailSummary.access_entries.length} linked</Badge>
                  </div>

                  <div className="mt-5 space-y-5">
                    {userDetailSummary.access_entries.length === 0 ? (
                      <EmptyState
                        title="No scoped access"
                        description="This user does not currently have team, association, arena, guardian, or player links."
                        className="px-4 py-8"
                      />
                    ) : (
                      ['association', 'team', 'arena', 'guardian', 'player']
                        .filter((kind) => (groupedUserAccessEntries[kind] || []).length > 0)
                        .map((kind) => (
                          <div key={kind} className="space-y-3">
                            <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                              {getMembershipKindLabel(kind)}
                            </div>
                            {(groupedUserAccessEntries[kind] || []).map((entry) => (
                              <div
                                key={entry.membership_id}
                                className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/90 p-4 dark:border-slate-800 dark:bg-slate-900/60"
                              >
                                <div className="space-y-1">
                                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{entry.name}</div>
                                  {entry.context ? (
                                    <div className="text-sm text-slate-600 dark:text-slate-300">{entry.context}</div>
                                  ) : null}
                                  <div className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                                    {getAccessTargetTypeLabel(entry.target_type)}
                                  </div>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <Badge variant="outline">{getAccessEntryLabel(entry)}</Badge>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    onClick={() => openUserAccessRemoval(userDetailSummary.user, entry)}
                                    disabled={!!busyKey}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                    Remove
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        ))
                    )}
                  </div>
                </Card>

                <div className="grid gap-6 xl:grid-cols-2">
                  <Card className="p-6">
                    <div className="space-y-4">
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Can Use RinkLink</h3>
                        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                          Controls app usage after authentication. Disable this when the person should not use RinkLink,
                          but the identity and history should remain intact.
                        </p>
                      </div>
                      <Badge variant={userDetailSummary.user.access_state === 'disabled' ? 'danger' : 'success'}>
                        {userDetailSummary.user.access_state === 'disabled' ? 'Disabled' : 'Active'}
                      </Badge>
                      {userDetailSummary.user.access_state === 'disabled' ? (
                        <Button type="button" onClick={() => openUserAccessAction('restore-app', userDetailSummary.user)} disabled={!!busyKey}>
                          <ShieldCheck className="h-4 w-4" />
                          Restore app access
                        </Button>
                      ) : (
                        <Button type="button" variant="destructive" onClick={() => openUserAccessAction('disable-app', userDetailSummary.user)} disabled={!!busyKey || userDetailSummary.user.id === me?.user.id}>
                          <ShieldOff className="h-4 w-4" />
                          Disable app access
                        </Button>
                      )}
                    </div>
                  </Card>

                  <Card className="p-6">
                    <div className="space-y-4">
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Can Authenticate</h3>
                        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                          Controls whether this identity can sign in at all. Use this for compromised, abusive, or otherwise
                          high-risk accounts.
                        </p>
                      </div>
                      <Badge variant={userDetailSummary.user.auth_state === 'disabled' ? 'danger' : 'success'}>
                        {userDetailSummary.user.auth_state === 'disabled' ? 'Disabled' : 'Active'}
                      </Badge>
                      {userDetailSummary.user.auth_state === 'disabled' ? (
                        <Button type="button" variant="outline" onClick={() => openUserAccessAction('restore-auth', userDetailSummary.user)} disabled={!!busyKey}>
                          <Unlock className="h-4 w-4" />
                          Restore sign-in
                        </Button>
                      ) : (
                        <div className="rounded-2xl border border-amber-200/80 bg-amber-50/90 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
                          Use the danger zone below for sign-in disablement.
                        </div>
                      )}
                    </div>
                  </Card>
                </div>

                {userDetailSummary.user.auth_state !== 'disabled' ? (
                  <Card className="border-rose-200/80 bg-rose-50/70 p-6 dark:border-rose-900/60 dark:bg-rose-950/20">
                    <div className="space-y-4">
                      <div>
                        <h3 className="text-lg font-semibold text-rose-900 dark:text-rose-100">Danger Zone</h3>
                        <p className="mt-1 text-sm text-rose-800/90 dark:text-rose-200">
                          Disable sign-in only when the identity itself must be blocked. Existing auth sessions will be revoked.
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="destructive"
                        onClick={() => openUserAccessAction('disable-auth', userDetailSummary.user)}
                        disabled={!!busyKey || userDetailSummary.user.id === me?.user.id}
                      >
                        <Lock className="h-4 w-4" />
                        Disable sign-in
                      </Button>
                    </div>
                  </Card>
                ) : null}
              </div>
            ) : (
              <Card className="p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Recent History</h3>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                      Recent admin and access lifecycle events related to this user.
                    </p>
                  </div>
                  <Badge variant="outline">{userDetailSummary.audit_entries.length} events</Badge>
                </div>

                <div className="mt-5 space-y-4">
                  {userDetailSummary.audit_entries.length === 0 ? (
                    <EmptyState
                      title="No audit history yet"
                      description="Recent access-control actions for this user will appear here."
                      className="px-4 py-8"
                    />
                  ) : userDetailSummary.audit_entries.map((entry: UserAuditEntry) => {
                    const details = entry.details && !Array.isArray(entry.details) ? entry.details : null;
                    const reason = typeof details?.reason === 'string' && details.reason.trim() ? details.reason : null;
                    return (
                      <div
                        key={entry.id}
                        className="rounded-2xl border border-slate-200/80 bg-slate-50/90 p-4 dark:border-slate-800 dark:bg-slate-900/60"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="space-y-1">
                            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                              {formatAuditAction(entry.action)}
                            </div>
                            <div className="text-sm text-slate-600 dark:text-slate-300">
                              {entry.actor_email || 'System'} · {new Date(entry.created_at).toLocaleString()}
                            </div>
                          </div>
                          <Badge variant="outline">{entry.action}</Badge>
                        </div>
                        {reason ? (
                          <div className="mt-3 rounded-xl border border-slate-200/80 bg-white/80 px-3 py-3 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-200">
                            {reason}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}
          </div>
        ) : null}
      </Modal>

      <Modal
        open={!!userAccessAction && !!activeUserAccessConfig}
        onClose={closeUserAccessAction}
        title={activeUserAccessConfig?.title || 'Manage access'}
        description={activeUserAccessConfig?.description}
        footer={(
          <>
            <Button type="button" variant="outline" onClick={closeUserAccessAction} disabled={!!busyKey}>
              Cancel
            </Button>
            <Button
              type="button"
              variant={activeUserAccessConfig?.confirmVariant === 'destructive' ? 'destructive' : 'primary'}
              onClick={() => void submitUserAccessAction()}
              disabled={!!busyKey || !userAccessAction}
            >
              {activeUserAccessConfig?.confirmLabel || 'Save'}
            </Button>
          </>
        )}
      >
        <div className="space-y-3">
          <label className="block text-xs font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400" htmlFor="user-access-reason">
            Reason (optional)
          </label>
          <Textarea
            id="user-access-reason"
            value={userAccessReason}
            onChange={(event) => setUserAccessReason(event.target.value)}
            rows={4}
            placeholder="Explain why this admin action is being taken. This will be stored in the audit log."
          />
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Memberships and family links are unchanged unless you revoke them separately.
          </p>
        </div>
      </Modal>

      <Modal
        open={!!userAccessRemoval && !!activeUserRemovalCopy}
        onClose={closeUserAccessRemoval}
        title={activeUserRemovalCopy?.title || 'Remove access'}
        description={activeUserRemovalCopy?.description}
        footer={(
          <>
            <Button type="button" variant="outline" onClick={closeUserAccessRemoval} disabled={!!busyKey}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={() => void submitUserAccessRemoval()} disabled={!!busyKey || !userAccessRemoval}>
              {activeUserRemovalCopy?.confirmLabel || 'Remove access'}
            </Button>
          </>
        )}
      >
        <div className="space-y-3">
          <label className="block text-xs font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400" htmlFor="user-access-removal-reason">
            Reason (optional)
          </label>
          <Textarea
            id="user-access-removal-reason"
            value={userAccessRemovalReason}
            onChange={(event) => setUserAccessRemovalReason(event.target.value)}
            rows={4}
            placeholder="Explain why this scoped access is being removed. This will be stored in the audit log."
          />
        </div>
      </Modal>
    </div>
  );
}

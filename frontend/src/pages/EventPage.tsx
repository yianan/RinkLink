import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, MapPin, Navigation, Pencil, Plus, Save, ShieldCheck, Trash2, UtensilsCrossed, X, XCircle } from 'lucide-react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import {
  AttendanceStatus,
  Event,
  EventAttendancePlayer,
  EventAttendanceSummary,
  EventGoalieStatUpsert,
  EventPenalty,
  EventPlayerStatUpsert,
  EventScoresheet,
  LockerRoom,
  Player,
} from '../types';
import { useAuth } from '../context/AuthContext';
import { useTeam } from '../context/TeamContext';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { Select } from '../components/ui/Select';
import TeamLogo from '../components/TeamLogo';
import { Textarea } from '../components/ui/Textarea';
import PageHeader from '../components/PageHeader';
import { getCompetitionBadgeVariant, getCompetitionLabel } from '../lib/competition';
import { getGameStatusLabel, getGameStatusVariant } from '../lib/gameStatus';
import { formatShortDate, formatTimeHHMM, toLocalDateString } from '../lib/time';
import { useConfirmDialog } from '../context/ConfirmDialogContext';
import { useToast } from '../context/ToastContext';
import { accentSelectorPillActiveClass, chromeIconButtonClass, destructiveIconButtonClass, selectorPillClass, selectorPillIdleClass, tableActionButtonClass } from '../lib/uiClasses';

const PENALTY_OPTIONS = [
  'Tripping',
  'Hooking',
  'Slashing',
  'Holding',
  'Interference',
  'Roughing',
  'Cross-checking',
  'Boarding',
  'Checking from behind',
  'Charging',
  'High-sticking',
  'Too many players',
  'Unsportsmanlike conduct',
  'Delay of game',
  'Other',
];

function digitsOnly(value: string) {
  return value.replace(/\D+/g, '');
}

function formatDateLabel(d: string) {
  return new Date(`${d}T00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
}

function formatLocalDateISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function mapsQueryUrl(query: string) {
  const url = new URL('https://www.google.com/maps/search/');
  url.searchParams.set('api', '1');
  url.searchParams.set('query', query);
  return url.toString();
}

function blockNonIntegerNumberKeys(event: React.KeyboardEvent<HTMLInputElement>) {
  if (['e', 'E', '+', '-', '.'].includes(event.key)) {
    event.preventDefault();
  }
}

function eventHasStarted(eventDate: string, startTime: string | null, todayStr: string) {
  if (eventDate < todayStr) return true;
  if (eventDate > todayStr) return false;
  if (!startTime) return false;
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const [hours, minutes] = startTime.split(':').map(Number);
  return currentMinutes >= (hours * 60 + minutes);
}

type PenaltyForm = {
  team_id: string;
  player_id: string;
  penalty_type: string;
  custom_penalty_type: string;
  minutes: string;
};

const emptyPenaltyForm: PenaltyForm = {
  team_id: '',
  player_id: '',
  penalty_type: '',
  custom_penalty_type: '',
  minutes: '',
};

const emptyLockerRoomForm = {
  home_locker_room_id: '',
  away_locker_room_id: '',
  response_message: '',
};

function buildAttendanceSummary(players: EventAttendancePlayer[]): EventAttendanceSummary {
  const attending_count = players.filter((player) => player.status === 'attending').length;
  const tentative_count = players.filter((player) => player.status === 'tentative').length;
  const absent_count = players.filter((player) => player.status === 'absent').length;
  return {
    attending_count,
    tentative_count,
    absent_count,
    unknown_count: players.length - attending_count - tentative_count - absent_count,
    total_players: players.length,
  };
}

function attendanceStatusLabel(status: AttendanceStatus) {
  if (status === 'absent') return 'Out';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function attendanceStatusClasses(status: AttendanceStatus, active: boolean) {
  const palette: Record<AttendanceStatus, string> = {
    attending: active
      ? 'border-emerald-300 bg-emerald-100 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-100'
      : 'border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-950/25 dark:text-slate-300',
    tentative: active
      ? 'border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-100'
      : 'border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-950/25 dark:text-slate-300',
    absent: active
      ? 'border-rose-300 bg-rose-100 text-rose-900 dark:border-rose-700 dark:bg-rose-950/60 dark:text-rose-100'
      : 'border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-950/25 dark:text-slate-300',
    unknown: active
      ? 'border-slate-300 bg-slate-200 text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100'
      : 'border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-950/25 dark:text-slate-300',
  };
  return palette[status];
}

function buildPlayerStatSnapshot(
  players: Player[],
  teamId: string,
  statDraft: Record<string, { goals: number; assists: number; shots: number; team_id: string }>,
) {
  return players.map((player) => {
    const stat = statDraft[player.id] || { goals: 0, assists: 0, shots: 0, team_id: teamId };
    return `${player.id}:${stat.goals}:${stat.assists}:${stat.shots}`;
  }).join('|');
}

export default function EventPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { eventId = '' } = useParams();
  const { activeTeam } = useTeam();
  const { me } = useAuth();
  const confirm = useConfirmDialog();
  const pushToast = useToast();

  const [event, setEvent] = useState<Event | null>(null);
  const [scoresheet, setScoresheet] = useState<EventScoresheet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [homePlayers, setHomePlayers] = useState<Player[]>([]);
  const [awayPlayers, setAwayPlayers] = useState<Player[]>([]);
  const [attendancePlayers, setAttendancePlayers] = useState<EventAttendancePlayer[]>([]);
  const [attendanceDraft, setAttendanceDraft] = useState<Record<string, AttendanceStatus>>({});
  const [attendanceFilter, setAttendanceFilter] = useState<'all' | AttendanceStatus>('all');
  const [scoreDraft, setScoreDraft] = useState({ home: '', away: '' });
  const [statDraft, setStatDraft] = useState<Record<string, { goals: number; assists: number; shots: number; team_id: string }>>({});
  const [penaltyForm, setPenaltyForm] = useState<PenaltyForm>(emptyPenaltyForm);
  const [goalieDraft, setGoalieDraft] = useState<Record<string, { player_id: string; saves: string; shootout_shots: string; shootout_saves: string }>>({});
  const [signatureDraft, setSignatureDraft] = useState<Record<string, string>>({});
  const [lockerRooms, setLockerRooms] = useState<LockerRoom[]>([]);
  const [lockerRoomModalOpen, setLockerRoomModalOpen] = useState(false);
  const [lockerRoomForm, setLockerRoomForm] = useState(emptyLockerRoomForm);
  const backTo = (location.state as { backTo?: string; backLabel?: string } | null)?.backTo || '/schedule';
  const backLabel = (location.state as { backTo?: string; backLabel?: string } | null)?.backLabel
    || ((window.history.state?.idx ?? 0) > 0 ? 'Back' : 'Back to Schedule');
  const handleBack = () => {
    const state = location.state as { backTo?: string } | null;
    if (state?.backTo) {
      navigate(state.backTo);
      return;
    }
    if ((window.history.state?.idx ?? 0) > 0) {
      navigate(-1);
      return;
    }
    navigate('/schedule');
  };

  const todayStr = toLocalDateString(new Date());
  const activeTeamLinkedPlayers = useMemo(
    () => (me?.linked_players || []).filter((player) => player.team_id === activeTeam?.id),
    [activeTeam?.id, me?.linked_players],
  );

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const eventData = await api.getEvent(eventId);
      const canViewPrivateRoster =
        !!me?.capabilities.includes('team.view_private')
        && !!activeTeam
        && (activeTeam.id === eventData.home_team_id || activeTeam.id === eventData.away_team_id);
      const canViewAttendance =
        (!!activeTeam && (activeTeam.id === eventData.home_team_id || activeTeam.id === eventData.away_team_id))
        && (canViewPrivateRoster || activeTeamLinkedPlayers.length > 0);

      const scoresheetData = canViewPrivateRoster
        ? await api.getEventScoresheet(eventId)
        : { event: eventData, player_stats: [], penalties: [], goalie_stats: [], signatures: [] };

      const playerParams = eventData.season_id ? { season_id: eventData.season_id } : undefined;
      const [homeRoster, awayRoster, attendanceData] = await Promise.all([
        canViewPrivateRoster ? api.getPlayers(eventData.home_team_id, playerParams) : Promise.resolve([]),
        canViewPrivateRoster && eventData.away_team_id ? api.getPlayers(eventData.away_team_id, playerParams) : Promise.resolve([]),
        canViewAttendance
          ? api.getEventAttendance(activeTeam.id, eventId)
          : Promise.resolve([]),
      ]);

      setEvent(eventData);
      setScoresheet(scoresheetData);
      setHomePlayers(homeRoster);
      setAwayPlayers(awayRoster);
      setAttendancePlayers(attendanceData);
      setAttendanceDraft(Object.fromEntries(attendanceData.map((player) => [player.player_id, player.status])));
      setScoreDraft({
        home: eventData.home_score != null ? String(eventData.home_score) : '',
        away: eventData.away_score != null ? String(eventData.away_score) : '',
      });

      const nextStatDraft: Record<string, { goals: number; assists: number; shots: number; team_id: string }> = {};
      scoresheetData.player_stats.forEach((stat) => {
        nextStatDraft[stat.player_id] = {
          goals: stat.goals,
          assists: stat.assists,
          shots: stat.shots_on_goal,
          team_id: stat.team_id,
        };
      });
      setStatDraft(nextStatDraft);

      const nextGoalieDraft: Record<string, { player_id: string; saves: string; shootout_shots: string; shootout_saves: string }> = {};
      scoresheetData.goalie_stats.forEach((stat) => {
        nextGoalieDraft[stat.team_id] = {
          player_id: stat.player_id,
          saves: String(stat.saves),
          shootout_shots: String(stat.shootout_shots),
          shootout_saves: String(stat.shootout_saves),
        };
      });
      setGoalieDraft(nextGoalieDraft);
      setPenaltyForm(emptyPenaltyForm);
      api.getLockerRooms(eventData.arena_rink_id).then((rooms) => {
        setLockerRooms(rooms);
        setLockerRoomForm({
          home_locker_room_id: eventData.home_locker_room_id || '',
          away_locker_room_id: eventData.away_locker_room_id || '',
          response_message: '',
        });
      });
    } catch (loadError) {
      setEvent(null);
      setScoresheet(null);
      setAttendancePlayers([]);
      setAttendanceDraft({});
      setLockerRooms([]);
      setError(loadError instanceof Error ? loadError.message.replace(/^\d+:\s*/, '') : 'Unable to load event');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!eventId) return;
    load();
  }, [eventId, activeTeam?.id, me?.capabilities, activeTeamLinkedPlayers.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const teamRole = useMemo(() => {
    if (!event || !activeTeam) return null;
    if (event.home_team_id === activeTeam.id) return 'home';
    if (event.away_team_id === activeTeam.id) return 'away';
    return null;
  }, [event, activeTeam]);
  const canManageAttendance = !!me?.capabilities.includes('team.manage_attendance') && !!teamRole;
  const canManageScoresheet = !!me?.capabilities.includes('team.manage_scoresheet') && !!teamRole;
  const canManageSchedule = !!me?.capabilities.includes('team.manage_schedule') && !!teamRole;
  const hasLinkedFamilyAttendance = !!teamRole && activeTeamLinkedPlayers.length > 0;
  const canViewPrivateRoster = !!me?.capabilities.includes('team.view_private') && !!teamRole;

  const playerMap = useMemo(
    () => Object.fromEntries([...homePlayers, ...awayPlayers].map((player) => [player.id, player])),
    [homePlayers, awayPlayers],
  );

  const signatureRoles = useMemo(() => {
    if (!event?.away_team_id) return [];
    return [
      { role: 'home_manager', label: `${event.home_team_name || 'Home'} Manager/Coach`, team_id: event.home_team_id },
      { role: 'away_manager', label: `${event.away_team_name || 'Away'} Manager/Coach`, team_id: event.away_team_id },
      { role: 'referee_1', label: 'Referee 1', team_id: null },
      { role: 'referee_2', label: 'Referee 2', team_id: null },
    ];
  }, [event]);

  if (loading) {
    return <Alert variant="info">Loading event…</Alert>;
  }

  if (error) {
    return (
      <div className="space-y-4">
        <Alert variant="error">{error}</Alert>
        <Button type="button" variant="ghost" onClick={handleBack}>
          {backLabel}
        </Button>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="space-y-4">
        <Alert variant="error">Event not found.</Alert>
        <Button type="button" variant="ghost" onClick={handleBack}>
          {backLabel}
        </Button>
      </div>
    );
  }

  const effectiveScoresheet = scoresheet ?? {
    event,
    player_stats: [],
    penalties: [],
    goalie_stats: [],
    signatures: [],
  };

  const canScore = canManageScoresheet && !!event.away_team_id && event.status !== 'cancelled' && event.date <= todayStr;
  const canConfirm = canManageSchedule && !!activeTeam && !!teamRole && !!event.away_team_id && event.status !== 'cancelled' && event.status !== 'final';
  const canEditAttendance = !!activeTeam && !!teamRole && event.status !== 'cancelled' && event.date >= todayStr && (canManageAttendance || hasLinkedFamilyAttendance);
  const canEditLockerRooms = canManageSchedule && event.status !== 'cancelled' && !eventHasStarted(event.date, event.start_time, todayStr);
  const alreadyConfirmed = teamRole === 'home' ? event.home_weekly_confirmed : event.away_weekly_confirmed;
  const persistedAttendanceMap = Object.fromEntries(attendancePlayers.map((player) => [player.player_id, player.status]));
  const effectiveAttendancePlayers = attendancePlayers.map((player) => ({
    ...player,
    status: attendanceDraft[player.player_id] ?? player.status,
  }));
  const filteredAttendancePlayers = effectiveAttendancePlayers.filter((player) => (
    attendanceFilter === 'all' ? true : player.status === attendanceFilter
  ));
  const attendanceSummary = buildAttendanceSummary(effectiveAttendancePlayers);
  const attendanceDirty = effectiveAttendancePlayers.some((player) => player.status !== persistedAttendanceMap[player.player_id]);
  const hasSavedScore = event.home_score != null || event.away_score != null;
  const effectiveScoreDraft = {
    home: scoreDraft.home !== '' ? scoreDraft.home : (event.home_score != null ? String(event.home_score) : '0'),
    away: scoreDraft.away !== '' ? scoreDraft.away : (event.away_score != null ? String(event.away_score) : '0'),
  };
  const hasCompleteScoreDraft = effectiveScoreDraft.home !== '' && effectiveScoreDraft.away !== '';
  const persistedHomeScore = event.home_score != null ? String(event.home_score) : '0';
  const persistedAwayScore = event.away_score != null ? String(event.away_score) : '0';
  const scoreDirty = effectiveScoreDraft.home !== persistedHomeScore || effectiveScoreDraft.away !== persistedAwayScore;
  const playerStatsDirty = (
    buildPlayerStatSnapshot(homePlayers, event.home_team_id, statDraft) !== homePlayers.map((player) => {
      const stat = effectiveScoresheet.player_stats.find((entry) => entry.player_id === player.id);
      return `${player.id}:${stat?.goals ?? 0}:${stat?.assists ?? 0}:${stat?.shots_on_goal ?? 0}`;
    }).join('|')
    || buildPlayerStatSnapshot(awayPlayers, event.away_team_id || '', statDraft) !== awayPlayers.map((player) => {
      const stat = effectiveScoresheet.player_stats.find((entry) => entry.player_id === player.id);
      return `${player.id}:${stat?.goals ?? 0}:${stat?.assists ?? 0}:${stat?.shots_on_goal ?? 0}`;
    }).join('|')
  );
  const goalieStatsDirty = [event.home_team_id, event.away_team_id].filter(Boolean).some((teamId) => {
    const latest = [...effectiveScoresheet.goalie_stats].reverse().find((entry) => entry.team_id === teamId);
    const draft = goalieDraft[teamId!] || { player_id: '', saves: '0', shootout_shots: '0', shootout_saves: '0' };
    return (
      draft.player_id !== (latest?.player_id ?? '')
      || draft.saves !== String(latest?.saves ?? 0)
      || draft.shootout_shots !== String(latest?.shootout_shots ?? 0)
      || draft.shootout_saves !== String(latest?.shootout_saves ?? 0)
    );
  });
  const dirtySections = [
    attendanceDirty ? 'attendance' : null,
    canViewPrivateRoster && scoreDirty ? 'score' : null,
    canViewPrivateRoster && playerStatsDirty ? 'player stats' : null,
    canViewPrivateRoster && goalieStatsDirty ? 'goalie stats' : null,
  ].filter(Boolean) as string[];
  const hasUnsavedChanges = dirtySections.length > 0;
  const rinkLabel = event.location_label || [event.arena_name, event.arena_rink_name].filter(Boolean).join(', ');
  const directionsUrl = rinkLabel ? mapsQueryUrl(rinkLabel) : null;
  const restaurantsUrl = rinkLabel ? mapsQueryUrl(`restaurants near ${rinkLabel}`) : null;
  const thingsUrl = rinkLabel ? mapsQueryUrl(`things to do near ${rinkLabel}`) : null;
  const thisWeekStart = (() => {
    const d = new Date();
    const day = d.getDay();
    const diff = (day + 6) % 7;
    const monday = new Date(d);
    monday.setDate(d.getDate() - diff);
    monday.setHours(0, 0, 0, 0);
    return monday;
  })();
  const thisWeekEnd = (() => {
    const sunday = new Date(thisWeekStart);
    sunday.setDate(thisWeekStart.getDate() + 6);
    return sunday;
  })();
  const isThisWeek = event.date >= formatLocalDateISO(thisWeekStart) && event.date <= formatLocalDateISO(thisWeekEnd);

  const playerName = (id: string | null) => {
    if (!id) return 'Unknown / Not on roster';
    const player = playerMap[id];
    return player ? `${player.first_name} ${player.last_name}` : 'Unknown / Not on roster';
  };

  const saveScore = async () => {
    const updated = await api.updateEvent(event.id, {
      home_score: Number(effectiveScoreDraft.home),
      away_score: Number(effectiveScoreDraft.away),
    });
    setEvent(updated);
    setScoreDraft({ home: String(updated.home_score ?? ''), away: String(updated.away_score ?? '') });
    setScoresheet((current) => (current ? { ...current, event: updated } : current));
    pushToast({ variant: 'success', title: hasSavedScore ? 'Score updated' : 'Score saved' });
  };

  const saveAttendance = async () => {
    if (!activeTeam) return;
    const updates = effectiveAttendancePlayers
      .filter((player) => player.status !== persistedAttendanceMap[player.player_id])
      .map((player) => ({ player_id: player.player_id, status: player.status }));
    if (updates.length === 0) return;
    const updated = await api.updateEventAttendance(activeTeam.id, event.id, updates);
    setAttendancePlayers(updated);
    setAttendanceDraft(Object.fromEntries(updated.map((player) => [player.player_id, player.status])));
    pushToast({ variant: 'success', title: 'Attendance saved' });
  };

  const toggleConfirm = async (confirmed: boolean) => {
    if (!activeTeam) return;
    const updated = await api.confirmEvent(event.id, activeTeam.id, confirmed);
    setEvent(updated);
    setScoresheet((current) => (current ? { ...current, event: updated } : current));
    pushToast({ variant: 'success', title: confirmed ? 'Game confirmed' : 'Confirmation removed' });
  };

  const cancelEvent = async () => {
    const confirmed = await confirm({
      title: 'Cancel event?',
      description: 'This releases any booked slot and marks the event as cancelled.',
      confirmLabel: 'Cancel event',
      confirmVariant: 'destructive',
    });
    if (!confirmed) return;
    const updated = await api.cancelEvent(event.id);
    setEvent(updated);
    setScoresheet((current) => (current ? { ...current, event: updated } : current));
    pushToast({ variant: 'success', title: 'Event cancelled' });
  };

  const saveLockerRooms = async () => {
    const updated = await api.updateEventLockerRooms(event.id, {
      home_locker_room_id: lockerRoomForm.home_locker_room_id || null,
      away_locker_room_id: event.away_team_id ? (lockerRoomForm.away_locker_room_id || null) : null,
      response_message: lockerRoomForm.response_message || null,
    });
    setEvent(updated);
    setScoresheet((current) => (current ? { ...current, event: updated } : current));
    setLockerRoomForm({
      home_locker_room_id: updated.home_locker_room_id || '',
      away_locker_room_id: updated.away_locker_room_id || '',
      response_message: '',
    });
    setLockerRoomModalOpen(false);
    pushToast({ variant: 'success', title: 'Locker rooms updated' });
  };

  const savePlayerStats = async () => {
    const stats: EventPlayerStatUpsert[] = [];
    const teamGroups = [
      { teamId: event.home_team_id, players: homePlayers },
      { teamId: event.away_team_id, players: awayPlayers },
    ].filter((group): group is { teamId: string; players: Player[] } => !!group.teamId);

    teamGroups.forEach(({ teamId, players }) => {
      players.forEach((player) => {
        const draft = statDraft[player.id] || { goals: 0, assists: 0, shots: 0, team_id: teamId };
        stats.push({
          team_id: teamId,
          player_id: player.id,
          goals: draft.goals,
          assists: draft.assists,
          shots_on_goal: draft.shots,
        });
      });
    });

    const updated = await api.upsertPlayerStats(event.id, stats);
    setScoresheet((current) => (current ? { ...current, player_stats: updated } : current));
    pushToast({ variant: 'success', title: 'Player stats saved' });
  };

  const addPenalty = async () => {
    const penaltyType = penaltyForm.penalty_type === 'Other' ? penaltyForm.custom_penalty_type.trim() : penaltyForm.penalty_type.trim();
    if (!penaltyForm.team_id || !penaltyType || !penaltyForm.minutes) return;
    const created = await api.createPenalty(event.id, {
      team_id: penaltyForm.team_id,
      player_id: penaltyForm.player_id || null,
      penalty_type: penaltyType,
      minutes: Number(penaltyForm.minutes),
    });
    setScoresheet((current) => (current ? { ...current, penalties: [...current.penalties, created] } : current));
    setPenaltyForm(emptyPenaltyForm);
    pushToast({ variant: 'success', title: 'Penalty added' });
  };

  const deletePenalty = async (penalty: EventPenalty) => {
    await api.deletePenalty(penalty.id);
    setScoresheet((current) => (current ? { ...current, penalties: current.penalties.filter((item) => item.id !== penalty.id) } : current));
    pushToast({ variant: 'success', title: 'Penalty removed' });
  };

  const saveGoalieStats = async () => {
    const stats: EventGoalieStatUpsert[] = [];
    [event.home_team_id, event.away_team_id].forEach((teamId) => {
      if (!teamId) return;
      const draft = goalieDraft[teamId];
      if (!draft?.player_id) return;
      stats.push({
        team_id: teamId,
        player_id: draft.player_id,
        saves: Number(draft.saves || '0'),
        shootout_shots: Number(draft.shootout_shots || '0'),
        shootout_saves: Number(draft.shootout_saves || '0'),
      });
    });
    const updated = await api.upsertGoalieStats(event.id, stats);
    setScoresheet((current) => (current ? { ...current, goalie_stats: updated } : current));
    pushToast({ variant: 'success', title: 'Goalie stats saved' });
  };

  const signEvent = async (role: string, teamId: string | null) => {
    const signerName = (signatureDraft[role] || '').trim();
    if (!signerName) return;
    const signed = await api.signEvent(event.id, {
      role,
      signer_name: signerName,
      team_id: teamId || null,
    });
    setScoresheet((current) => {
      if (!current) return current;
      const signatures = current.signatures.filter((signature) => signature.role !== role);
      return { ...current, signatures: [...signatures, signed].sort((left, right) => left.role.localeCompare(right.role)) };
    });
    setSignatureDraft((current) => ({ ...current, [role]: '' }));
    pushToast({ variant: 'success', title: 'Signature saved' });
  };

  const handleSaveAll = async () => {
    if (attendanceDirty) {
      await saveAttendance();
    }
    if (scoreDirty) {
      await saveScore();
    }
    if (playerStatsDirty) {
      await savePlayerStats();
    }
    if (goalieStatsDirty) {
      await saveGoalieStats();
    }
    pushToast({
      variant: 'success',
      title: dirtySections.length === 1 ? '1 section saved' : `${dirtySections.length} sections saved`,
    });
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title={event.away_team_name ? `${event.home_team_name} vs ${event.away_team_name}` : `${event.home_team_name} ${getCompetitionLabel(event.event_type)}`}
        subtitle={`${formatShortDate(event.date)}${event.start_time ? ` • ${formatTimeHHMM(event.start_time) || event.start_time}` : ''}`}
        actions={(
          <>
            <Button type="button" variant="ghost" onClick={handleBack}>
              <ArrowLeft className="h-4 w-4" />
              {backLabel}
            </Button>
            {canConfirm ? (
              <Button type="button" variant="outline" onClick={() => toggleConfirm(!alreadyConfirmed)}>
                {alreadyConfirmed ? <X className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
                {alreadyConfirmed ? 'Rescind Confirmation' : 'Confirm Game'}
              </Button>
            ) : null}
            {event.status !== 'cancelled' ? (
              <Button type="button" variant="destructive" onClick={cancelEvent}>
                <XCircle className="h-4 w-4" />
                Cancel Event
              </Button>
            ) : null}
          </>
        )}
      />

      <Card className="overflow-hidden border-cyan-200/40 bg-gradient-to-br from-white via-cyan-50/50 to-violet-50/40 p-4 dark:border-cyan-900/30 dark:from-slate-950 dark:via-cyan-950/15 dark:to-violet-950/20">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Event Details</div>
            <div className="flex items-center gap-3">
              <div className="flex shrink-0 items-center gap-2">
                <TeamLogo name={event.home_team_name || 'Home'} logoUrl={event.home_team_logo_url} className="h-12 w-12 rounded-2xl" initialsClassName="text-sm" />
                {event.away_team_name ? (
                  <TeamLogo name={event.away_team_name} logoUrl={event.away_team_logo_url} className="h-12 w-12 rounded-2xl" initialsClassName="text-sm" />
                ) : null}
              </div>
              <div className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                <span>{event.home_team_name}</span>
                {event.away_team_name ? <span className="mx-2 text-slate-400 dark:text-slate-500">vs</span> : null}
                {event.away_team_name ? <span>{event.away_team_name}</span> : null}
              </div>
            </div>
            <div className="text-sm text-slate-700 dark:text-slate-300">
              {formatDateLabel(event.date)} {event.start_time ? `${formatTimeHHMM(event.start_time) || event.start_time}` : ''}
              {isThisWeek ? <span className="ml-2 text-xs font-medium text-cyan-700 dark:text-cyan-300">This week</span> : null}
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {event.away_team_id ? (
                <>
                  <Badge variant={event.home_weekly_confirmed ? 'success' : 'outline'}>
                    {event.home_weekly_confirmed
                      ? `${event.home_team_name} confirmed`
                      : `${event.home_team_name} awaiting confirmation`}
                  </Badge>
                  <Badge variant={event.away_weekly_confirmed ? 'success' : 'outline'}>
                    {event.away_weekly_confirmed
                      ? `${event.away_team_name} confirmed`
                      : `${event.away_team_name} awaiting confirmation`}
                  </Badge>
                </>
              ) : (
                <Badge variant="outline">{getGameStatusLabel(event)}</Badge>
              )}
            </div>
            {rinkLabel ? (
              <div className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
                <MapPin className="mt-0.5 h-4 w-4 text-slate-500 dark:text-slate-400" />
                <div className="min-w-0">{rinkLabel}</div>
              </div>
            ) : null}
          </div>

          {directionsUrl ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="ghost" size="icon" className={chromeIconButtonClass} onClick={() => window.open(directionsUrl, '_blank', 'noopener,noreferrer')} aria-label="Open directions" title="Directions">
                <Navigation className="h-4 w-4" />
              </Button>
              {restaurantsUrl ? (
                <Button type="button" variant="ghost" size="icon" className={chromeIconButtonClass} onClick={() => window.open(restaurantsUrl, '_blank', 'noopener,noreferrer')} aria-label="Open restaurants nearby" title="Restaurants Nearby">
                  <UtensilsCrossed className="h-4 w-4" />
                </Button>
              ) : null}
              {thingsUrl ? (
                <Button type="button" variant="ghost" size="icon" className={chromeIconButtonClass} onClick={() => window.open(thingsUrl, '_blank', 'noopener,noreferrer')} aria-label="Open things to do nearby" title="Things To Do Nearby">
                  <MapPin className="h-4 w-4" />
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
        {event.response_message && event.response_source === 'arena' ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/85 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/35 dark:text-amber-100">
            <div className="font-semibold">Arena note</div>
            <div className="mt-1 whitespace-pre-line">{event.response_message}</div>
          </div>
        ) : null}
      </Card>

      <div className="flex flex-wrap gap-2">
        <Badge variant={getCompetitionBadgeVariant(event.event_type)}>{getCompetitionLabel(event.event_type)}</Badge>
        <Badge variant={getGameStatusVariant(event)}>{getGameStatusLabel(event)}</Badge>
        {event.competition_short_name ? (
          <Badge variant="outline">{event.competition_short_name}{event.division_name ? ` • ${event.division_name}` : ''}</Badge>
        ) : null}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_0.95fr]">
        <Card className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Venue Logistics</div>
              <div className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                {canEditLockerRooms ? 'Locker rooms can be updated until event start.' : 'Locker rooms are read-only once the event starts.'}
              </div>
            </div>
            {canEditLockerRooms ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setLockerRoomForm({
                    home_locker_room_id: event.home_locker_room_id || '',
                    away_locker_room_id: event.away_locker_room_id || '',
                    response_message: '',
                  });
                  setLockerRoomModalOpen(true);
                }}
              >
                <Pencil className="h-4 w-4" />
                Edit Locker Rooms
              </Button>
            ) : null}
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-3 dark:border-slate-800 dark:bg-slate-900/35 sm:col-span-2">
              <TeamLogo name={event.arena_name || 'Arena'} logoUrl={event.arena_logo_url} className="h-12 w-12 rounded-xl" initialsClassName="text-xs" />
              <div className="min-w-0">
                <div className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Arena</div>
                <div className="mt-1 text-sm text-slate-900 dark:text-slate-100">{event.arena_name || '—'}</div>
              </div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Rink</div>
              <div className="mt-1 text-sm text-slate-900 dark:text-slate-100">{event.arena_rink_name || '—'}</div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Location</div>
              <div className="mt-1 text-sm text-slate-900 dark:text-slate-100">{rinkLabel || '—'}</div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Home Locker Room</div>
              <div className="mt-1 text-sm text-slate-900 dark:text-slate-100">{event.home_locker_room_name || '—'}</div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Away Locker Room</div>
              <div className="mt-1 text-sm text-slate-900 dark:text-slate-100">{event.away_locker_room_name || '—'}</div>
            </div>
          </div>
          {event.notes ? (
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900/35 dark:text-slate-300">
              {event.notes}
            </div>
          ) : null}
        </Card>

        <Card className="p-4">
          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Matchup</div>
          <div className="mt-4 space-y-3">
            <div className="rounded-xl border border-slate-200 px-3 py-3 dark:border-slate-800">
              <div className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Home</div>
              <div className="mt-2 flex items-center gap-3">
                <TeamLogo name={event.home_team_name || 'Home'} logoUrl={event.home_team_logo_url} className="h-11 w-11 rounded-xl" initialsClassName="text-sm" />
                <div>
                  <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{event.home_team_name || '—'}</div>
                  <div className="text-sm text-slate-600 dark:text-slate-400">{event.home_association_name || '—'}</div>
                </div>
              </div>
            </div>
            {event.away_team_id ? (
              <div className="rounded-xl border border-slate-200 px-3 py-3 dark:border-slate-800">
                <div className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Away</div>
                <div className="mt-2 flex items-center gap-3">
                  <TeamLogo name={event.away_team_name || 'Away'} logoUrl={event.away_team_logo_url} className="h-11 w-11 rounded-xl" initialsClassName="text-sm" />
                  <div>
                    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{event.away_team_name || '—'}</div>
                    <div className="text-sm text-slate-600 dark:text-slate-400">{event.away_association_name || '—'}</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200 px-3 py-3 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-400">
                Single-team {getCompetitionLabel(event.event_type).toLowerCase()}. Opponent-specific scoresheet work does not apply.
              </div>
            )}
          </div>
        </Card>
      </div>

      <Modal
        open={lockerRoomModalOpen}
        onClose={() => setLockerRoomModalOpen(false)}
        title="Edit Locker Rooms"
        footer={(
          <>
            <Button type="button" onClick={saveLockerRooms}>
              <Save className="h-4 w-4" />
              Save
            </Button>
            <Button type="button" variant="outline" onClick={() => setLockerRoomModalOpen(false)}>
              <X className="h-4 w-4" />
              Cancel
            </Button>
          </>
        )}
      >
        <div className="grid grid-cols-1 gap-3">
          <Select
            value={lockerRoomForm.home_locker_room_id}
            onChange={(event) => setLockerRoomForm((current) => ({ ...current, home_locker_room_id: event.target.value }))}
          >
            <option value="">Home locker room</option>
            {lockerRooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}
          </Select>
          {event.away_team_id ? (
            <Select
              value={lockerRoomForm.away_locker_room_id}
              onChange={(event) => setLockerRoomForm((current) => ({ ...current, away_locker_room_id: event.target.value }))}
            >
              <option value="">Away locker room</option>
              {lockerRooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}
            </Select>
          ) : null}
          <Textarea
            value={lockerRoomForm.response_message}
            onChange={(event) => setLockerRoomForm((current) => ({ ...current, response_message: event.target.value }))}
            placeholder="Note to organizer and opponent"
            rows={3}
          />
        </div>
      </Modal>

      {activeTeam && teamRole ? (
        <Card className="p-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                <span>Attendance</span>
                {attendanceDirty ? <Badge variant="warning">Unsaved</Badge> : null}
              </div>
              <div className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                {canManageAttendance && canEditAttendance
                  ? 'Record attendance for the active team roster.'
                  : hasLinkedFamilyAttendance && canEditAttendance
                    ? activeTeamLinkedPlayers.some((player) => player.link_type === 'player')
                      ? 'Update attendance for your own player account.'
                      : 'Update attendance for your linked child players.'
                  : event.status === 'cancelled'
                    ? 'Attendance is read-only for cancelled events.'
                    : 'Attendance is read-only for past events.'}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {attendanceSummary.attending_count > 0 ? <Badge variant="success">{attendanceSummary.attending_count} Attending</Badge> : null}
              {attendanceSummary.tentative_count > 0 ? <Badge variant="warning">{attendanceSummary.tentative_count} Tentative</Badge> : null}
              {attendanceSummary.absent_count > 0 ? <Badge variant="danger">{attendanceSummary.absent_count} Out</Badge> : null}
              {attendanceSummary.unknown_count > 0 ? <Badge variant="outline">{attendanceSummary.unknown_count} Unknown</Badge> : null}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {(['all', 'attending', 'tentative', 'absent', 'unknown'] as const).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setAttendanceFilter(status)}
                className={`${selectorPillClass} px-3 py-1 text-xs ${
                  attendanceFilter === status
                    ? accentSelectorPillActiveClass
                    : selectorPillIdleClass
                }`}
              >
                {status === 'all' ? 'All' : attendanceStatusLabel(status)}
              </button>
            ))}
          </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
            <div className="grid grid-cols-[minmax(0,1fr)_10rem] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:border-slate-800 dark:bg-slate-900/35 dark:text-slate-400">
              <div>{canManageAttendance ? `${activeTeam.name} Roster` : 'Linked Players'}</div>
              <div>Status</div>
            </div>
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {filteredAttendancePlayers.length === 0 ? (
                <div className="px-4 py-6 text-sm text-slate-600 dark:text-slate-400">No roster players found for this event.</div>
              ) : filteredAttendancePlayers.map((player) => (
                <div key={player.player_id} className="grid grid-cols-[minmax(0,1fr)_10rem] items-center gap-3 px-4 py-2.5 hover:bg-slate-50/70 dark:hover:bg-slate-900/20">
                  <div className="min-w-0 text-sm text-slate-900 dark:text-slate-100">
                    <span className="font-medium">
                      {player.jersey_number != null ? `#${player.jersey_number} ` : ''}{player.first_name} {player.last_name}
                    </span>
                    <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">
                      {player.position || 'Skater'}
                    </span>
                  </div>
                  <Select
                    value={player.status}
                    disabled={!canEditAttendance}
                    onChange={(inputEvent) =>
                      setAttendanceDraft((current) => ({
                        ...current,
                        [player.player_id]: inputEvent.target.value as AttendanceStatus,
                      }))
                    }
                    className={`h-9 min-h-9 text-xs font-medium ${attendanceStatusClasses(player.status, true)} ${canEditAttendance ? 'cursor-pointer' : ''}`}
                  >
                    <option value="unknown">Unknown</option>
                    <option value="attending">Attending</option>
                    <option value="tentative">Tentative</option>
                    <option value="absent">Out</option>
                  </Select>
                </div>
              ))}
            </div>
          </div>
        </Card>
      ) : null}

      {canScore ? (
        <>
          <Card className="p-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                  <span>Score</span>
                  {scoreDirty ? <Badge variant="warning">Unsaved</Badge> : null}
                </div>
                <div className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  Update the score as the game progresses. Final scores stay editable for corrections.
                </div>
              </div>
              <Button type="button" size="icon" onClick={saveScore} disabled={!hasCompleteScoreDraft} aria-label={hasSavedScore ? 'Update score' : 'Save score'} title={hasSavedScore ? 'Update score' : 'Save score'}>
                <Save className="h-4 w-4" />
              </Button>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950/20">
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{event.home_team_name || 'Home'}</div>
                <div className="mt-2">
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    value={effectiveScoreDraft.home}
                    onKeyDown={blockNonIntegerNumberKeys}
                    onChange={(inputEvent) => setScoreDraft((current) => ({ ...current, home: digitsOnly(inputEvent.target.value) }))}
                    placeholder="0"
                    className="max-w-xs"
                  />
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950/20">
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{event.away_team_name || 'Away'}</div>
                <div className="mt-2">
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    value={effectiveScoreDraft.away}
                    onKeyDown={blockNonIntegerNumberKeys}
                    onChange={(inputEvent) => setScoreDraft((current) => ({ ...current, away: digitsOnly(inputEvent.target.value) }))}
                    placeholder="0"
                    className="max-w-xs"
                  />
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                  <span>Player Stats</span>
                  {playerStatsDirty ? <Badge variant="warning">Unsaved</Badge> : null}
                </div>
                <div className="mt-1 text-sm text-slate-600 dark:text-slate-400">Goals, assists, and shots on goal by player.</div>
              </div>
              <Button type="button" size="icon" onClick={savePlayerStats} aria-label="Save player stats" title="Save player stats">
                <Save className="h-4 w-4" />
              </Button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
              {[
                { teamId: event.home_team_id, title: event.home_team_name || 'Home', players: homePlayers },
                { teamId: event.away_team_id!, title: event.away_team_name || 'Away', players: awayPlayers },
              ].map((group) => (
                <Card key={group.teamId} className="overflow-hidden border-slate-200 dark:border-slate-800">
                  <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/40">
                    <div className="text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-100">{group.title}</div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-white text-xs uppercase tracking-wide text-slate-600 dark:bg-slate-950/20 dark:text-slate-400">
                        <tr>
                          <th className="px-4 py-2">#</th>
                          <th className="px-4 py-2">Player</th>
                          <th className="px-4 py-2">G</th>
                          <th className="px-4 py-2">A</th>
                          <th className="px-4 py-2">SOG</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-950/20">
                        {group.players.map((player) => {
                          const draft = statDraft[player.id] || { goals: 0, assists: 0, shots: 0, team_id: group.teamId };
                          return (
                            <tr key={player.id}>
                              <td className="px-4 py-2 font-medium text-slate-900 dark:text-slate-100">{player.jersey_number ?? '-'}</td>
                              <td className="px-4 py-2 text-slate-700 dark:text-slate-300">
                                {player.first_name} {player.last_name}
                                {player.position ? <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">{player.position}</span> : null}
                              </td>
                              <td className="px-4 py-2">
                                <Input
                                  type="number"
                                  min="0"
                                  step="1"
                                  value={String(draft.goals)}
                                  inputMode="numeric"
                                  onKeyDown={blockNonIntegerNumberKeys}
                                  onChange={(inputEvent) => setStatDraft((current) => ({
                                    ...current,
                                    [player.id]: { ...draft, team_id: group.teamId, goals: Number(digitsOnly(inputEvent.target.value) || '0') },
                                  }))}
                                  className="h-9 w-16"
                                />
                              </td>
                              <td className="px-4 py-2">
                                <Input
                                  type="number"
                                  min="0"
                                  step="1"
                                  value={String(draft.assists)}
                                  inputMode="numeric"
                                  onKeyDown={blockNonIntegerNumberKeys}
                                  onChange={(inputEvent) => setStatDraft((current) => ({
                                    ...current,
                                    [player.id]: { ...draft, team_id: group.teamId, assists: Number(digitsOnly(inputEvent.target.value) || '0') },
                                  }))}
                                  className="h-9 w-16"
                                />
                              </td>
                              <td className="px-4 py-2">
                                <Input
                                  type="number"
                                  min="0"
                                  step="1"
                                  value={String(draft.shots)}
                                  inputMode="numeric"
                                  onKeyDown={blockNonIntegerNumberKeys}
                                  onChange={(inputEvent) => setStatDraft((current) => ({
                                    ...current,
                                    [player.id]: { ...draft, team_id: group.teamId, shots: Number(digitsOnly(inputEvent.target.value) || '0') },
                                  }))}
                                  className="h-9 w-16"
                                />
                              </td>
                            </tr>
                          );
                        })}
                        {group.players.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-600 dark:text-slate-400">
                              No roster for this team yet.
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </Card>
              ))}
            </div>
          </Card>

          <Card className="p-4">
            <div className="text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-100">Penalties</div>
            <div className="mt-1 text-sm text-slate-600 dark:text-slate-400">Record team, player, type, and minutes.</div>

            <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-12 lg:items-end">
              <div className="lg:col-span-3">
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Team</label>
                <Select value={penaltyForm.team_id} onChange={(inputEvent) => setPenaltyForm((current) => ({ ...current, team_id: inputEvent.target.value, player_id: '' }))}>
                  <option value="">Select…</option>
                  <option value={event.home_team_id}>{event.home_team_name || 'Home'}</option>
                  <option value={event.away_team_id || ''}>{event.away_team_name || 'Away'}</option>
                </Select>
              </div>
              <div className="lg:col-span-3">
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Player</label>
                <Select
                  value={penaltyForm.player_id}
                  onChange={(inputEvent) => setPenaltyForm((current) => ({ ...current, player_id: inputEvent.target.value }))}
                  disabled={!penaltyForm.team_id}
                >
                  <option value="">Unknown / Not on roster</option>
                  {(penaltyForm.team_id === event.home_team_id ? homePlayers : awayPlayers).map((player) => (
                    <option key={player.id} value={player.id}>
                      {player.jersey_number != null ? `#${player.jersey_number} ` : ''}{player.first_name} {player.last_name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="lg:col-span-4">
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Penalty Type</label>
                <div className="space-y-2">
                  <Select
                    value={penaltyForm.penalty_type}
                    onChange={(inputEvent) => setPenaltyForm((current) => ({
                      ...current,
                      penalty_type: inputEvent.target.value,
                      custom_penalty_type: inputEvent.target.value === 'Other' ? current.custom_penalty_type : '',
                    }))}
                  >
                    <option value="">Select…</option>
                    {PENALTY_OPTIONS.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </Select>
                  {penaltyForm.penalty_type === 'Other' ? (
                    <Textarea
                      value={penaltyForm.custom_penalty_type}
                      onChange={(inputEvent) => setPenaltyForm((current) => ({ ...current, custom_penalty_type: inputEvent.target.value }))}
                      rows={1}
                      placeholder="Enter custom penalty"
                    />
                  ) : null}
                </div>
              </div>
              <div className="lg:col-span-1">
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Min</label>
                <Input
                  value={penaltyForm.minutes}
                  inputMode="numeric"
                  onChange={(inputEvent) => setPenaltyForm((current) => ({ ...current, minutes: digitsOnly(inputEvent.target.value) }))}
                />
              </div>
              <div className="lg:col-span-1">
                <Button
                  type="button"
                  size="icon"
                  onClick={addPenalty}
                  disabled={
                    !penaltyForm.team_id
                    || !(penaltyForm.penalty_type && (penaltyForm.penalty_type !== 'Other' || penaltyForm.custom_penalty_type.trim()))
                    || !penaltyForm.minutes
                    || Number(penaltyForm.minutes) < 1
                  }
                  aria-label="Add penalty"
                  title="Add penalty"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950/20">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600 dark:bg-slate-900/40 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Team</th>
                    <th className="px-4 py-3">Player</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Min</th>
                    <th className="px-4 py-3 text-right"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-950/20">
                  {effectiveScoresheet.penalties.map((penalty) => (
                    <tr key={penalty.id}>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{penalty.team_id === event.home_team_id ? event.home_team_name : event.away_team_name}</td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{playerName(penalty.player_id)}</td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{penalty.penalty_type}</td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{penalty.minutes}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end">
                          <Button type="button" variant="ghost" size="icon" className={`${tableActionButtonClass} ${destructiveIconButtonClass}`} onClick={() => deletePenalty(penalty)} aria-label="Delete penalty">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {effectiveScoresheet.penalties.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-600 dark:text-slate-400">
                        No penalties recorded.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                  <span>Goaltender Stats</span>
                  {goalieStatsDirty ? <Badge variant="warning">Unsaved</Badge> : null}
                </div>
                <div className="mt-1 text-sm text-slate-600 dark:text-slate-400">Saves and shootout totals.</div>
              </div>
              <Button type="button" size="icon" onClick={saveGoalieStats} aria-label="Save goalie stats" title="Save goalie stats">
                <Save className="h-4 w-4" />
              </Button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
              {[
                { teamId: event.home_team_id, title: event.home_team_name || 'Home', players: homePlayers },
                { teamId: event.away_team_id!, title: event.away_team_name || 'Away', players: awayPlayers },
              ].map((group) => {
                const draft = goalieDraft[group.teamId] || { player_id: '', saves: '0', shootout_shots: '0', shootout_saves: '0' };
                return (
                  <Card key={group.teamId} className="border-slate-200 p-4 dark:border-slate-800">
                    <div className="text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-100">{group.title}</div>
                    <div className="mt-3 grid grid-cols-1 gap-3">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Goalie</label>
                        <Select
                          value={draft.player_id}
                          onChange={(inputEvent) => setGoalieDraft((current) => ({ ...current, [group.teamId]: { ...draft, player_id: inputEvent.target.value } }))}
                          disabled={group.players.length === 0}
                        >
                          <option value="">Select…</option>
                          {group.players.map((player) => (
                            <option key={player.id} value={player.id}>
                              {player.jersey_number != null ? `#${player.jersey_number} ` : ''}{player.first_name} {player.last_name}
                            </option>
                          ))}
                        </Select>
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <div>
                          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Saves</label>
                          <Input
                            type="number"
                            min="0"
                            step="1"
                            value={draft.saves}
                            inputMode="numeric"
                            onKeyDown={blockNonIntegerNumberKeys}
                            onChange={(inputEvent) => setGoalieDraft((current) => ({ ...current, [group.teamId]: { ...draft, saves: digitsOnly(inputEvent.target.value) } }))}
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">SO Shots</label>
                          <Input
                            type="number"
                            min="0"
                            step="1"
                            value={draft.shootout_shots}
                            inputMode="numeric"
                            onKeyDown={blockNonIntegerNumberKeys}
                            onChange={(inputEvent) => setGoalieDraft((current) => ({ ...current, [group.teamId]: { ...draft, shootout_shots: digitsOnly(inputEvent.target.value) } }))}
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">SO Saves</label>
                          <Input
                            type="number"
                            min="0"
                            step="1"
                            value={draft.shootout_saves}
                            inputMode="numeric"
                            onKeyDown={blockNonIntegerNumberKeys}
                            onChange={(inputEvent) => setGoalieDraft((current) => ({ ...current, [group.teamId]: { ...draft, shootout_saves: digitsOnly(inputEvent.target.value) } }))}
                          />
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </Card>

          <Card className="p-4">
            <div className="text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-100">Verification Signatures</div>
            <div className="mt-1 text-sm text-slate-600 dark:text-slate-400">Digital signatures from team staff and referees.</div>

            <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
              {signatureRoles.map((signatureRole) => {
                const existing = effectiveScoresheet.signatures.find((signature) => signature.role === signatureRole.role) || null;
                return (
                  <Card key={signatureRole.role} className="border-slate-200 p-4 dark:border-slate-800">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-100">{signatureRole.label}</div>
                        {existing ? (
                          <div className="mt-1 text-sm text-slate-700 dark:text-slate-300">
                            Signed by <span className="font-medium text-slate-900 dark:text-slate-100">{existing.signer_name}</span>{' '}
                            <span className="text-slate-500 dark:text-slate-400">({new Date(existing.signed_at).toLocaleString()})</span>
                          </div>
                        ) : (
                          <div className="mt-1 text-sm text-slate-600 dark:text-slate-400">Not signed yet.</div>
                        )}
                      </div>
                      {existing ? <ShieldCheck className="h-5 w-5 text-emerald-600" /> : <div className="h-5 w-5" />}
                    </div>

                    <div className="mt-3 flex items-center gap-2">
                      <Input
                        value={signatureDraft[signatureRole.role] || ''}
                        onChange={(inputEvent) => setSignatureDraft((current) => ({ ...current, [signatureRole.role]: inputEvent.target.value }))}
                        placeholder="Type full name"
                        className="min-w-0 flex-1"
                      />
                      <Button
                        type="button"
                        size="icon"
                        onClick={() => signEvent(signatureRole.role, signatureRole.team_id)}
                        disabled={!(signatureDraft[signatureRole.role] || '').trim()}
                        aria-label={`Sign as ${signatureRole.label}`}
                        title={`Sign as ${signatureRole.label}`}
                      >
                        <ShieldCheck className="h-4 w-4" />
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          </Card>
        </>
      ) : (canViewPrivateRoster || canManageScoresheet) && event.away_team_id ? (
        <Card className="p-4">
          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Score and Scoresheet</div>
          <div className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            Score, stats, penalties, and signatures open on the event day.
          </div>
        </Card>
      ) : null}

      {(canEditAttendance || canScore) ? (
        <div className="sticky bottom-4 z-20 flex justify-end">
          <Card className="max-w-lg border-cyan-200/70 bg-white/95 p-3 shadow-xl backdrop-blur dark:border-cyan-900/40 dark:bg-slate-950/92" role="status" aria-live="polite">
            <div className="flex flex-wrap items-center justify-end gap-3">
              <Button type="button" onClick={handleSaveAll} aria-label="Save all event changes" disabled={!hasUnsavedChanges}>
                <Save className="h-4 w-4" />
                Save All Changes
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

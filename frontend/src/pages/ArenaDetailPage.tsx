import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '../api/client';
import { Arena, ArenaRink, IceSlot, LockerRoom, Team, TeamSeasonVenueAssignment } from '../types';
import { useSeason } from '../context/SeasonContext';
import PageHeader from '../components/PageHeader';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { Select } from '../components/ui/Select';
import { useConfirmDialog } from '../context/ConfirmDialogContext';
import { useToast } from '../context/ToastContext';
import { formatShortDate, formatTimeHHMM } from '../lib/time';
import { tableActionButtonClass } from '../lib/uiClasses';
import TeamLogo from '../components/TeamLogo';

const emptyRinkForm = { name: '', notes: '' };
const emptyLockerForm = { name: '', notes: '' };
const emptySlotForm = { date: '', start_time: '', end_time: '', notes: '' };

export default function ArenaDetailPage() {
  const navigate = useNavigate();
  const { arenaId = '', arenaRinkId } = useParams();
  const { activeSeason, seasons } = useSeason();
  const effectiveSeason = activeSeason ?? seasons.find((season) => season.is_active) ?? seasons[0] ?? null;
  const confirm = useConfirmDialog();
  const pushToast = useToast();

  const [arena, setArena] = useState<Arena | null>(null);
  const [rinks, setRinks] = useState<ArenaRink[]>([]);
  const [selectedRinkId, setSelectedRinkId] = useState('');
  const [lockerRooms, setLockerRooms] = useState<LockerRoom[]>([]);
  const [iceSlots, setIceSlots] = useState<IceSlot[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [assignments, setAssignments] = useState<TeamSeasonVenueAssignment[]>([]);
  const [assignmentLockerRooms, setAssignmentLockerRooms] = useState<LockerRoom[]>([]);

  const [arenaEditOpen, setArenaEditOpen] = useState(false);
  const [arenaForm, setArenaForm] = useState({
    name: '',
    address: '',
    city: '',
    state: '',
    zip_code: '',
    phone: '',
    contact_email: '',
    website: '',
    notes: '',
  });

  const [rinkModalOpen, setRinkModalOpen] = useState(false);
  const [editRink, setEditRink] = useState<ArenaRink | null>(null);
  const [rinkForm, setRinkForm] = useState(emptyRinkForm);

  const [lockerModalOpen, setLockerModalOpen] = useState(false);
  const [lockerForm, setLockerForm] = useState(emptyLockerForm);

  const [slotModalOpen, setSlotModalOpen] = useState(false);
  const [slotForm, setSlotForm] = useState(emptySlotForm);

  const [assignmentModalOpen, setAssignmentModalOpen] = useState(false);
  const [assignmentTeamId, setAssignmentTeamId] = useState('');
  const [assignmentRinkId, setAssignmentRinkId] = useState('');
  const [assignmentLockerRoomId, setAssignmentLockerRoomId] = useState('');
  const initialRinkSyncDone = useRef(false);

  const selectedRink = rinks.find((rink) => rink.id === selectedRinkId) ?? null;
  const assignmentByTeamId = useMemo(
    () => Object.fromEntries(assignments.map((assignment) => [assignment.team_id, assignment])),
    [assignments],
  );

  const loadArena = () => {
    api.getArena(arenaId).then((data) => {
      setArena(data);
      setArenaForm({
        name: data.name || '',
        address: data.address || '',
        city: data.city || '',
        state: data.state || '',
        zip_code: data.zip_code || '',
        phone: data.phone || '',
        contact_email: data.contact_email || '',
        website: data.website || '',
        notes: data.notes || '',
      });
    });
  };

  const loadRinks = () => {
    api.getArenaRinks(arenaId).then((data) => {
      setRinks(data);
      setSelectedRinkId((current) => (current && data.some((rink) => rink.id === current) ? current : data[0]?.id || ''));
    });
  };

  const loadAssignments = () => {
    if (!effectiveSeason) {
      setAssignments([]);
      return;
    }
    api.getArenaVenueAssignments(arenaId, { season_id: effectiveSeason.id }).then(setAssignments);
  };

  useEffect(() => {
    if (!arenaId) return;
    initialRinkSyncDone.current = false;
    loadArena();
    loadRinks();
    loadAssignments();
    api.getTeams(effectiveSeason ? { season_id: effectiveSeason.id } : undefined).then(setTeams);
  }, [arenaId, effectiveSeason?.id]);

  useEffect(() => {
    if (rinks.length === 0 || initialRinkSyncDone.current) {
      return;
    }
    const preferredRinkId = arenaRinkId && rinks.some((rink) => rink.id === arenaRinkId)
      ? arenaRinkId
      : rinks[0]?.id || '';
    initialRinkSyncDone.current = true;
    if (preferredRinkId) {
      setSelectedRinkId(preferredRinkId);
    }
  }, [arenaRinkId, rinks]);

  useEffect(() => {
    if (!selectedRinkId || !arenaId) return;
    const nextUrl = `/arenas/${arenaId}/rinks/${selectedRinkId}`;
    if (window.location.pathname !== nextUrl) {
      window.history.replaceState(window.history.state, '', nextUrl);
    }
  }, [arenaId, selectedRinkId]);

  useEffect(() => {
    if (!selectedRinkId) {
      setLockerRooms([]);
      setIceSlots([]);
      return;
    }
    Promise.all([api.getLockerRooms(selectedRinkId), api.getIceSlots(selectedRinkId)])
      .then(([rooms, slots]) => {
        setLockerRooms(rooms);
        setIceSlots(slots);
      });
  }, [selectedRinkId]);

  useEffect(() => {
    if (!assignmentRinkId) {
      setAssignmentLockerRooms([]);
      return;
    }
    api.getLockerRooms(assignmentRinkId).then(setAssignmentLockerRooms);
  }, [assignmentRinkId]);

  const selectRink = (rinkId: string) => {
    if (rinkId === selectedRinkId) return;
    setSelectedRinkId(rinkId);
  };

  const saveArena = async () => {
    if (!arena) return;
    await api.updateArena(arena.id, {
      ...arenaForm,
      website: arenaForm.website || null,
      notes: arenaForm.notes || null,
    });
    setArenaEditOpen(false);
    pushToast({ variant: 'success', title: 'Arena updated' });
    loadArena();
  };

  const openCreateRink = () => {
    setEditRink(null);
    setRinkForm(emptyRinkForm);
    setRinkModalOpen(true);
  };

  const openEditRink = (rink: ArenaRink) => {
    setEditRink(rink);
    setRinkForm({
      name: rink.name,
      notes: rink.notes || '',
    });
    setRinkModalOpen(true);
  };

  const saveRink = async () => {
    const payload = {
      name: rinkForm.name,
      notes: rinkForm.notes || null,
    };
    if (editRink) {
      await api.updateArenaRink(editRink.id, payload);
      pushToast({ variant: 'success', title: 'Rink updated' });
    } else {
      await api.createArenaRink(arenaId, payload);
      pushToast({ variant: 'success', title: 'Rink added' });
    }
    setRinkModalOpen(false);
    setEditRink(null);
    setRinkForm(emptyRinkForm);
    loadRinks();
    loadArena();
  };

  const deleteRink = async (rink: ArenaRink) => {
    const confirmed = await confirm({
      title: 'Delete rink?',
      description: 'This removes the rink, its locker rooms, and all related ice slots.',
      confirmLabel: 'Delete rink',
      confirmVariant: 'destructive',
    });
    if (!confirmed) return;
    await api.deleteArenaRink(rink.id);
    pushToast({ variant: 'success', title: 'Rink deleted' });
    loadRinks();
    loadArena();
  };

  const saveLockerRoom = async () => {
    if (!selectedRinkId) return;
    await api.createLockerRoom(selectedRinkId, {
      name: lockerForm.name,
      notes: lockerForm.notes || null,
    });
    setLockerModalOpen(false);
    setLockerForm(emptyLockerForm);
    pushToast({ variant: 'success', title: 'Locker room added' });
    api.getLockerRooms(selectedRinkId).then(setLockerRooms);
    loadRinks();
  };

  const deleteLockerRoom = async (lockerRoom: LockerRoom) => {
    const confirmed = await confirm({
      title: 'Delete locker room?',
      description: 'This removes the locker room from the selected arena rink.',
      confirmLabel: 'Delete locker room',
      confirmVariant: 'destructive',
    });
    if (!confirmed) return;
    await api.deleteLockerRoom(lockerRoom.id);
    pushToast({ variant: 'success', title: 'Locker room deleted' });
    api.getLockerRooms(selectedRinkId).then(setLockerRooms);
    loadRinks();
  };

  const saveIceSlot = async () => {
    if (!selectedRinkId) return;
    await api.createIceSlot(selectedRinkId, {
      date: slotForm.date,
      start_time: slotForm.start_time,
      end_time: slotForm.end_time || null,
      notes: slotForm.notes || null,
    });
    setSlotModalOpen(false);
    setSlotForm(emptySlotForm);
    pushToast({ variant: 'success', title: 'Ice slot added' });
    api.getIceSlots(selectedRinkId).then(setIceSlots);
    loadRinks();
  };

  const deleteIceSlot = async (slot: IceSlot) => {
    const confirmed = await confirm({
      title: 'Delete ice slot?',
      description: 'This removes the selected ice slot from the rink schedule.',
      confirmLabel: 'Delete slot',
      confirmVariant: 'destructive',
    });
    if (!confirmed) return;
    await api.deleteIceSlot(slot.id);
    pushToast({ variant: 'success', title: 'Ice slot deleted' });
    api.getIceSlots(selectedRinkId).then(setIceSlots);
    loadRinks();
  };

  const openAssignmentModal = (team?: Team) => {
    const currentAssignment = team ? assignmentByTeamId[team.id] : undefined;
    setAssignmentTeamId(team?.id || '');
    setAssignmentRinkId(currentAssignment?.arena_rink_id || selectedRinkId || rinks[0]?.id || '');
    setAssignmentLockerRoomId(currentAssignment?.default_locker_room_id || '');
    setAssignmentModalOpen(true);
  };

  const saveAssignment = async () => {
    if (!effectiveSeason || !assignmentTeamId || !assignmentRinkId) return;
    await api.createTeamVenueAssignment(assignmentTeamId, {
      season_id: effectiveSeason.id,
      arena_id: arenaId,
      arena_rink_id: assignmentRinkId,
      default_locker_room_id: assignmentLockerRoomId || null,
    });
    setAssignmentModalOpen(false);
    setAssignmentTeamId('');
    setAssignmentRinkId('');
    setAssignmentLockerRoomId('');
    pushToast({ variant: 'success', title: 'Venue assignment saved' });
    loadAssignments();
  };

  if (!arena) {
    return <Alert variant="info">Loading arena…</Alert>;
  }

  const bookedSlotLabel = (slot: IceSlot) => {
    if (!slot.booked_event_home_team_name && !slot.booked_by_team_name) return null;
    if (slot.booked_event_home_team_name) {
      return slot.booked_event_away_team_name
        ? `${slot.booked_event_home_team_name} vs ${slot.booked_event_away_team_name}`
        : `${slot.booked_event_home_team_name} Practice`;
    }
    return slot.booked_by_team_name;
  };

  const formatSlotStatus = (status: IceSlot['status']) => status.charAt(0).toUpperCase() + status.slice(1);

  return (
    <div className="space-y-4">
      <PageHeader
        title={arena.name}
        subtitle={`${arena.address} • ${[arena.city, arena.state, arena.zip_code].filter(Boolean).join(', ')}`}
        actions={(
          <>
            <Button type="button" variant="ghost" onClick={() => navigate('/arenas')}>
              <ChevronLeft className="h-4 w-4" />
              Back to Arenas
            </Button>
            <Button type="button" variant="outline" onClick={() => setArenaEditOpen(true)}>
              <Pencil className="h-4 w-4" />
              Edit Arena
            </Button>
            <Button type="button" onClick={openCreateRink}>
              <Plus className="h-4 w-4" />
              Add Rink
            </Button>
          </>
        )}
      />

      <Card className="p-4">
        <div className="flex items-start gap-4">
          <TeamLogo name={arena.name} logoUrl={arena.logo_url} className="h-16 w-16 rounded-2xl" initialsClassName="text-lg" />
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{arena.name}</div>
            <div className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              {[arena.address, [arena.city, arena.state, arena.zip_code].filter(Boolean).join(', ')].filter(Boolean).join(' • ')}
            </div>
            {arena.contact_email ? (
              <div className="mt-1 text-sm text-slate-600 dark:text-slate-400">{arena.contact_email}</div>
            ) : null}
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex flex-wrap gap-2">
          {rinks.map((rink) => (
            <button
              key={rink.id}
              type="button"
              onClick={() => selectRink(rink.id)}
              className={`cursor-pointer rounded-xl border px-4 py-2 text-sm font-medium transition ${selectedRinkId === rink.id ? 'border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-100' : 'border-slate-200 bg-white text-slate-700 hover:border-sky-300 hover:text-sky-800 dark:border-slate-800 dark:bg-slate-950/20 dark:text-slate-300 dark:hover:border-sky-800 dark:hover:text-sky-200'}`}
            >
              {rink.name}
            </button>
          ))}
        </div>
        {selectedRink ? (
          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-slate-600 dark:text-slate-400">
            <span>{selectedRink.locker_room_count} locker rooms</span>
            <span>{selectedRink.ice_slot_count} ice slots</span>
            <Button type="button" variant="outline" size="sm" onClick={() => openEditRink(selectedRink)}>
              <Pencil className="h-3.5 w-3.5" />
              Edit Rink
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={tableActionButtonClass}
              onClick={() => deleteRink(selectedRink)}
              aria-label="Delete rink"
              title="Delete rink"
            >
              <Trash2 className="h-4 w-4 text-rose-600" />
            </Button>
          </div>
        ) : (
          <div className="mt-4 text-sm text-slate-600 dark:text-slate-400">Add a rink to manage locker rooms and ice slots.</div>
        )}
      </Card>

      {selectedRink ? (
        <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <Card className="p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Ice Slots</div>
              </div>
              <Button type="button" size="sm" onClick={() => setSlotModalOpen(true)}>
                <Plus className="h-3.5 w-3.5" />
                Add Ice Slot
              </Button>
            </div>
            <div className="mt-4 space-y-2">
              {iceSlots.map((slot) => (
                <div key={slot.id} className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-3 text-sm dark:border-slate-800">
                  <div>
                    <div className="font-medium text-slate-900 dark:text-slate-100">
                      {formatShortDate(slot.date)} • {formatTimeHHMM(slot.start_time) || slot.start_time}
                      {slot.end_time ? `-${formatTimeHHMM(slot.end_time) || slot.end_time}` : ''}
                    </div>
                    <div className="text-slate-600 dark:text-slate-400">
                      {formatSlotStatus(slot.status)}
                      {bookedSlotLabel(slot) ? ` • ${bookedSlotLabel(slot)}` : ''}
                      {slot.notes ? ` • ${slot.notes}` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {slot.booked_event_id ? (
                      <Button type="button" size="sm" variant="outline" onClick={() => navigate(`/schedule/${slot.booked_event_id}`)}>
                        View Event
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className={tableActionButtonClass}
                      onClick={() => deleteIceSlot(slot)}
                      aria-label="Delete ice slot"
                      title="Delete ice slot"
                    >
                      <Trash2 className="h-4 w-4 text-rose-600" />
                    </Button>
                  </div>
                </div>
              ))}
              {iceSlots.length === 0 ? (
                <div className="text-sm text-slate-600 dark:text-slate-400">No ice slots configured for this rink.</div>
              ) : null}
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Locker Rooms</div>
              </div>
              <Button type="button" size="sm" onClick={() => setLockerModalOpen(true)}>
                <Plus className="h-3.5 w-3.5" />
                Add Locker Room
              </Button>
            </div>
            <div className="mt-4 space-y-2">
              {lockerRooms.map((lockerRoom) => (
                <div key={lockerRoom.id} className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-3 text-sm dark:border-slate-800">
                  <div>
                    <div className="font-medium text-slate-900 dark:text-slate-100">{lockerRoom.name}</div>
                    {lockerRoom.notes ? <div className="text-slate-600 dark:text-slate-400">{lockerRoom.notes}</div> : null}
                  </div>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className={tableActionButtonClass}
                    onClick={() => deleteLockerRoom(lockerRoom)}
                    aria-label="Delete locker room"
                    title="Delete locker room"
                  >
                    <Trash2 className="h-4 w-4 text-rose-600" />
                  </Button>
                </div>
              ))}
              {lockerRooms.length === 0 ? (
                <div className="text-sm text-slate-600 dark:text-slate-400">No locker rooms configured for this rink.</div>
              ) : null}
            </div>
          </Card>
        </div>
      ) : null}

      <Card className="p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Team Venue Assignments</div>
            <div className="text-sm text-slate-600 dark:text-slate-400">
              {effectiveSeason ? `Defaults for ${effectiveSeason.name}.` : 'Select a season to manage team defaults.'}
            </div>
          </div>
          {effectiveSeason ? (
            <Button type="button" size="sm" onClick={() => openAssignmentModal()}>
              <Plus className="h-3.5 w-3.5" />
              Assign Team
            </Button>
          ) : null}
        </div>
        <div className="mt-4 space-y-2">
          {teams.map((team) => {
            const assignment = assignmentByTeamId[team.id];
            return (
              <div key={team.id} className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-3 text-sm dark:border-slate-800">
                <div>
                  <div className="font-medium text-slate-900 dark:text-slate-100">{team.name}</div>
                  <div className="text-slate-600 dark:text-slate-400">
                    {assignment
                      ? `${assignment.arena_rink_name}${assignment.default_locker_room_name ? ` • ${assignment.default_locker_room_name}` : ''}`
                      : 'No venue assignment'}
                  </div>
                </div>
                {effectiveSeason ? (
                  <Button type="button" size="sm" variant="outline" onClick={() => openAssignmentModal(team)}>
                    {assignment ? 'Edit Venue' : 'Assign Venue'}
                  </Button>
                ) : null}
              </div>
            );
          })}
        </div>
      </Card>

      <Modal
        open={arenaEditOpen}
        onClose={() => setArenaEditOpen(false)}
        title="Edit Arena"
        footer={(
          <>
            <Button type="button" onClick={saveArena}>Save</Button>
            <Button type="button" variant="outline" onClick={() => setArenaEditOpen(false)}>Cancel</Button>
          </>
        )}
      >
        <div className="grid grid-cols-1 gap-3">
          <Input value={arenaForm.name} onChange={(event) => setArenaForm((current) => ({ ...current, name: event.target.value }))} placeholder="Arena name" />
          <Input value={arenaForm.address} onChange={(event) => setArenaForm((current) => ({ ...current, address: event.target.value }))} placeholder="Address" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Input value={arenaForm.city} onChange={(event) => setArenaForm((current) => ({ ...current, city: event.target.value }))} placeholder="City" />
            <Input value={arenaForm.state} onChange={(event) => setArenaForm((current) => ({ ...current, state: event.target.value }))} placeholder="State" />
            <Input value={arenaForm.zip_code} onChange={(event) => setArenaForm((current) => ({ ...current, zip_code: event.target.value }))} placeholder="Zip" />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input value={arenaForm.phone} onChange={(event) => setArenaForm((current) => ({ ...current, phone: event.target.value }))} placeholder="Phone" />
            <Input value={arenaForm.contact_email} onChange={(event) => setArenaForm((current) => ({ ...current, contact_email: event.target.value }))} placeholder="Contact email" />
          </div>
          <Input value={arenaForm.website} onChange={(event) => setArenaForm((current) => ({ ...current, website: event.target.value }))} placeholder="Website" />
          <Input value={arenaForm.notes} onChange={(event) => setArenaForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Notes" />
        </div>
      </Modal>

      <Modal
        open={rinkModalOpen}
        onClose={() => setRinkModalOpen(false)}
        title={editRink ? 'Edit Arena Rink' : 'Add Arena Rink'}
        footer={(
          <>
            <Button type="button" onClick={saveRink} disabled={!rinkForm.name}>Save</Button>
            <Button type="button" variant="outline" onClick={() => setRinkModalOpen(false)}>Cancel</Button>
          </>
        )}
      >
        <div className="grid grid-cols-1 gap-3">
          <Input value={rinkForm.name} onChange={(event) => setRinkForm((current) => ({ ...current, name: event.target.value }))} placeholder="Rink name" />
          <Input value={rinkForm.notes} onChange={(event) => setRinkForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Notes" />
        </div>
      </Modal>

      <Modal
        open={lockerModalOpen}
        onClose={() => setLockerModalOpen(false)}
        title="Add Locker Room"
        footer={(
          <>
            <Button type="button" onClick={saveLockerRoom} disabled={!lockerForm.name}>Save</Button>
            <Button type="button" variant="outline" onClick={() => setLockerModalOpen(false)}>Cancel</Button>
          </>
        )}
      >
        <div className="grid grid-cols-1 gap-3">
          <Input value={lockerForm.name} onChange={(event) => setLockerForm((current) => ({ ...current, name: event.target.value }))} placeholder="Locker room name" />
          <Input value={lockerForm.notes} onChange={(event) => setLockerForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Notes" />
        </div>
      </Modal>

      <Modal
        open={slotModalOpen}
        onClose={() => setSlotModalOpen(false)}
        title="Add Ice Slot"
        footer={(
          <>
            <Button type="button" onClick={saveIceSlot} disabled={!slotForm.date || !slotForm.start_time}>Save</Button>
            <Button type="button" variant="outline" onClick={() => setSlotModalOpen(false)}>Cancel</Button>
          </>
        )}
      >
        <div className="grid grid-cols-1 gap-3">
          <Input type="date" value={slotForm.date} onChange={(event) => setSlotForm((current) => ({ ...current, date: event.target.value }))} />
          <div className="grid grid-cols-2 gap-3">
            <Input type="time" value={slotForm.start_time} onChange={(event) => setSlotForm((current) => ({ ...current, start_time: event.target.value }))} />
            <Input type="time" value={slotForm.end_time} onChange={(event) => setSlotForm((current) => ({ ...current, end_time: event.target.value }))} />
          </div>
          <Input value={slotForm.notes} onChange={(event) => setSlotForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Notes" />
        </div>
      </Modal>

      <Modal
        open={assignmentModalOpen}
        onClose={() => setAssignmentModalOpen(false)}
        title="Team Venue Assignment"
        footer={(
          <>
            <Button type="button" onClick={saveAssignment} disabled={!assignmentTeamId || !assignmentRinkId || !effectiveSeason}>Save</Button>
            <Button type="button" variant="outline" onClick={() => setAssignmentModalOpen(false)}>Cancel</Button>
          </>
        )}
      >
        {!effectiveSeason ? (
          <Alert variant="info">Select a season to create venue assignments.</Alert>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Team</label>
              <Select value={assignmentTeamId} onChange={(event) => setAssignmentTeamId(event.target.value)}>
                <option value="">Select team…</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>{team.name}</option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Arena Rink</label>
              <Select value={assignmentRinkId} onChange={(event) => setAssignmentRinkId(event.target.value)}>
                <option value="">Select rink…</option>
                {rinks.map((rink) => (
                  <option key={rink.id} value={rink.id}>{rink.name}</option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Default Locker Room</label>
              <Select value={assignmentLockerRoomId} onChange={(event) => setAssignmentLockerRoomId(event.target.value)}>
                <option value="">No default locker room</option>
                {assignmentLockerRooms.map((lockerRoom) => (
                  <option key={lockerRoom.id} value={lockerRoom.id}>{lockerRoom.name}</option>
                ))}
              </Select>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

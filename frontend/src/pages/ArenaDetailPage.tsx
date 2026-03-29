import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Eye, Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '../api/client';
import { Arena, ArenaRink, IceBookingRequest, IceSlot, LockerRoom } from '../types';
import PageHeader from '../components/PageHeader';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { Select } from '../components/ui/Select';
import { Textarea } from '../components/ui/Textarea';
import SegmentedTabs from '../components/SegmentedTabs';
import { useConfirmDialog } from '../context/ConfirmDialogContext';
import { useToast } from '../context/ToastContext';
import { formatShortDate, formatTimeHHMM } from '../lib/time';
import { tableActionButtonClass } from '../lib/uiClasses';
import TeamLogo from '../components/TeamLogo';
import { getCompetitionLabel } from '../lib/competition';

const emptyRinkForm = { name: '', notes: '' };
const emptyLockerForm = { name: '', notes: '' };
const emptySlotForm = { date: '', start_time: '', end_time: '', pricing_mode: 'fixed_price', price: '', currency: 'USD', notes: '' };
const emptyAcceptForm = { home_locker_room_id: '', away_locker_room_id: '', response_message: '' };
const emptyActionForm = { response_message: '' };
const emptyLockerAssignForm = { home_locker_room_id: '', away_locker_room_id: '', response_message: '' };
const CURRENCIES = ['USD', 'CAD'] as const;

function formatPriceLabel(pricingMode: string, priceAmountCents: number | null, currency = 'USD') {
  if (pricingMode === 'call_for_pricing') {
    return 'Call for pricing';
  }
  if (priceAmountCents == null) {
    return 'Pricing TBD';
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'USD',
    maximumFractionDigits: 0,
  }).format(priceAmountCents / 100);
}

function dollarsToCents(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed * 100);
}

function centsToDollars(value: number | null) {
  if (value == null) return '';
  return (value / 100).toFixed(0);
}

function isRequestActive(request: IceBookingRequest, todayIso: string) {
  if (request.status === 'requested') return true;
  if (request.status !== 'accepted') return false;
  if (!request.ice_slot_date) return true;
  if (request.event_status === 'cancelled') return false;
  return request.ice_slot_date >= todayIso;
}

export default function ArenaDetailPage() {
  const navigate = useNavigate();
  const { arenaId = '', arenaRinkId } = useParams();
  const confirm = useConfirmDialog();
  const pushToast = useToast();

  const [arena, setArena] = useState<Arena | null>(null);
  const [rinks, setRinks] = useState<ArenaRink[]>([]);
  const [selectedRinkId, setSelectedRinkId] = useState('');
  const [lockerRooms, setLockerRooms] = useState<LockerRoom[]>([]);
  const [iceSlots, setIceSlots] = useState<IceSlot[]>([]);
  const [bookingRequests, setBookingRequests] = useState<IceBookingRequest[]>([]);
  const [requestTab, setRequestTab] = useState<'active' | 'pending' | 'history'>('active');

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
  const [editSlot, setEditSlot] = useState<IceSlot | null>(null);
  const [acceptRequest, setAcceptRequest] = useState<IceBookingRequest | null>(null);
  const [acceptForm, setAcceptForm] = useState(emptyAcceptForm);
  const [acceptLockerRooms, setAcceptLockerRooms] = useState<LockerRoom[]>([]);
  const [editLockerRequest, setEditLockerRequest] = useState<IceBookingRequest | null>(null);
  const [editLockerRooms, setEditLockerRooms] = useState<LockerRoom[]>([]);
  const [lockerAssignForm, setLockerAssignForm] = useState(emptyLockerAssignForm);
  const [actionRequest, setActionRequest] = useState<IceBookingRequest | null>(null);
  const [actionMode, setActionMode] = useState<'reject' | 'cancel' | null>(null);
  const [actionForm, setActionForm] = useState(emptyActionForm);
  const initialRinkSyncDone = useRef(false);
  const iceSlotsSectionRef = useRef<HTMLDivElement | null>(null);
  const bookingRequestsSectionRef = useRef<HTMLDivElement | null>(null);

  const selectedRink = rinks.find((rink) => rink.id === selectedRinkId) ?? null;
  const todayIso = new Date().toISOString().slice(0, 10);
  const pendingRequests = bookingRequests.filter((request) => request.status === 'requested');
  const activeRequests = bookingRequests.filter((request) => isRequestActive(request, todayIso));
  const activeAcceptedRequests = activeRequests.filter((request) => request.status === 'accepted');
  const historyRequests = bookingRequests.filter((request) => !isRequestActive(request, todayIso));

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

  const loadBookingRequests = () => {
    api.getArenaIceBookingRequests(arenaId).then(setBookingRequests);
  };

  useEffect(() => {
    if (!arenaId) return;
    initialRinkSyncDone.current = false;
    loadArena();
    loadRinks();
    loadBookingRequests();
  }, [arenaId]);

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
    if (!acceptRequest) {
      setAcceptLockerRooms([]);
      return;
    }
    api.getLockerRooms(acceptRequest.arena_rink_id).then(setAcceptLockerRooms);
    setAcceptForm({
      home_locker_room_id: '',
      away_locker_room_id: '',
      response_message: '',
    });
  }, [acceptRequest]);

  useEffect(() => {
    if (!editLockerRequest) {
      setEditLockerRooms([]);
      setLockerAssignForm(emptyLockerAssignForm);
      return;
    }
    api.getLockerRooms(editLockerRequest.arena_rink_id).then(setEditLockerRooms);
    setLockerAssignForm({
      home_locker_room_id: editLockerRequest.home_locker_room_id || '',
      away_locker_room_id: editLockerRequest.away_locker_room_id || '',
      response_message: '',
    });
  }, [editLockerRequest]);

  useEffect(() => {
    if (!actionRequest || !actionMode) {
      setActionForm(emptyActionForm);
    }
  }, [actionMode, actionRequest]);

  useEffect(() => {
    if (requestTab === 'active' && activeRequests.length === 0) {
      if (pendingRequests.length > 0) {
        setRequestTab('pending');
      } else if (historyRequests.length > 0) {
        setRequestTab('history');
      }
      return;
    }
    if (requestTab === 'pending' && pendingRequests.length === 0) {
      if (activeRequests.length > 0) {
        setRequestTab('active');
      } else if (historyRequests.length > 0) {
        setRequestTab('history');
      }
      return;
    }
    if (requestTab === 'history' && historyRequests.length === 0) {
      if (activeRequests.length > 0) {
        setRequestTab('active');
      } else if (pendingRequests.length > 0) {
        setRequestTab('pending');
      }
    }
  }, [activeRequests.length, historyRequests.length, pendingRequests.length, requestTab]);

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
    const payload = {
      date: slotForm.date,
      start_time: slotForm.start_time,
      end_time: slotForm.end_time || null,
      pricing_mode: slotForm.pricing_mode,
      price_amount_cents: slotForm.pricing_mode === 'fixed_price' ? dollarsToCents(slotForm.price) : null,
      currency: slotForm.currency || 'USD',
      notes: slotForm.notes || null,
    };
    if (slotForm.pricing_mode === 'fixed_price' && payload.price_amount_cents == null) {
      pushToast({ variant: 'error', title: 'Enter a slot price' });
      return;
    }
    if (editSlot) {
      await api.updateIceSlot(editSlot.id, payload);
      pushToast({ variant: 'success', title: 'Ice slot updated' });
    } else {
      await api.createIceSlot(selectedRinkId, payload);
      pushToast({ variant: 'success', title: 'Ice slot added' });
    }
    setSlotModalOpen(false);
    setEditSlot(null);
    setSlotForm(emptySlotForm);
    api.getIceSlots(selectedRinkId).then(setIceSlots);
    loadRinks();
  };

  const openEditSlot = (slot: IceSlot) => {
    if (slot.status !== 'available') {
      pushToast({ variant: 'error', title: 'Only open ice slots can be edited' });
      return;
    }
    setEditSlot(slot);
    setSlotForm({
      date: slot.date,
      start_time: slot.start_time,
      end_time: slot.end_time || '',
      pricing_mode: slot.pricing_mode,
      price: centsToDollars(slot.price_amount_cents),
      currency: slot.currency || 'USD',
      notes: slot.notes || '',
    });
    setSlotModalOpen(true);
  };

  const deleteIceSlot = async (slot: IceSlot) => {
    if (slot.status !== 'available') {
      pushToast({ variant: 'error', title: 'Only open ice slots can be deleted' });
      return;
    }
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

  const acceptBookingRequest = async () => {
    if (!acceptRequest) return;
    await api.acceptArenaIceBookingRequest(arenaId, acceptRequest.id, {
      home_locker_room_id: acceptForm.home_locker_room_id || null,
      away_locker_room_id: acceptRequest.event_type === 'practice' || acceptRequest.event_type === 'scrimmage' ? null : (acceptForm.away_locker_room_id || null),
      response_message: acceptForm.response_message || null,
    });
    setAcceptRequest(null);
    setRequestTab('active');
    loadBookingRequests();
    if (selectedRinkId) {
      api.getIceSlots(selectedRinkId).then(setIceSlots);
    }
    pushToast({ variant: 'success', title: 'Booking request accepted' });
  };

  const rejectBookingRequest = async (request: IceBookingRequest) => {
    await api.rejectArenaIceBookingRequest(arenaId, request.id, actionForm.response_message || undefined);
    loadBookingRequests();
    setActionRequest(null);
    setActionMode(null);
    setActionForm(emptyActionForm);
    if (selectedRinkId) {
      api.getIceSlots(selectedRinkId).then(setIceSlots);
    }
    pushToast({ variant: 'success', title: 'Booking request rejected' });
  };

  const cancelBookingRequest = async (request: IceBookingRequest) => {
    await api.cancelArenaIceBookingRequest(arenaId, request.id, actionForm.response_message || undefined);
    loadBookingRequests();
    setActionRequest(null);
    setActionMode(null);
    setActionForm(emptyActionForm);
    if (selectedRinkId) {
      api.getIceSlots(selectedRinkId).then(setIceSlots);
    }
    pushToast({ variant: 'success', title: 'Booking request cancelled' });
  };

  const saveEditedLockerRooms = async () => {
    if (!editLockerRequest?.event_id) return;
    await api.updateEventLockerRooms(editLockerRequest.event_id, {
      home_locker_room_id: lockerAssignForm.home_locker_room_id || null,
      away_locker_room_id: editLockerRequest.away_team_id ? (lockerAssignForm.away_locker_room_id || null) : null,
      response_message: lockerAssignForm.response_message || null,
    });
    setEditLockerRequest(null);
    loadBookingRequests();
    pushToast({ variant: 'success', title: 'Locker rooms updated' });
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
  const openSlotCount = iceSlots.filter((slot) => slot.status === 'available').length;
  const visibleRequests = requestTab === 'active' ? activeRequests : requestTab === 'pending' ? pendingRequests : historyRequests;

  const focusIceSlots = () => {
    iceSlotsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const focusRequests = (nextTab: 'active' | 'pending' | 'history') => {
    setRequestTab(nextTab);
    window.requestAnimationFrame(() => {
      bookingRequestsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

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

      <div className="grid gap-3 sm:grid-cols-3">
        <Card
          role="button"
          tabIndex={0}
          onClick={() => pendingRequests.length > 0 && focusRequests('pending')}
          onKeyDown={(event) => {
            if ((event.key === 'Enter' || event.key === ' ') && pendingRequests.length > 0) {
              event.preventDefault();
              focusRequests('pending');
            }
          }}
          className={`p-4 transition ${pendingRequests.length > 0 ? 'cursor-pointer hover:border-cyan-300/60 hover:shadow-md' : 'cursor-not-allowed opacity-70'}`}
        >
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Pending Requests</div>
          <div className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">{pendingRequests.length}</div>
        </Card>
        <Card
          role="button"
          tabIndex={0}
          onClick={focusIceSlots}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              focusIceSlots();
            }
          }}
          className="cursor-pointer p-4 transition hover:border-cyan-300/60 hover:shadow-md"
        >
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Open Slots (Selected Rink)</div>
          <div className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">{openSlotCount}</div>
        </Card>
        <Card
          role="button"
          tabIndex={0}
          onClick={() => activeRequests.length > 0 && focusRequests('active')}
          onKeyDown={(event) => {
            if ((event.key === 'Enter' || event.key === ' ') && activeRequests.length > 0) {
              event.preventDefault();
              focusRequests('active');
            }
          }}
          className={`p-4 transition ${activeRequests.length > 0 ? 'cursor-pointer hover:border-cyan-300/60 hover:shadow-md' : 'cursor-not-allowed opacity-70'}`}
        >
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Upcoming Bookings</div>
          <div className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">{activeAcceptedRequests.length}</div>
        </Card>
      </div>

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
          <div ref={iceSlotsSectionRef}>
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
                <div key={slot.id} className="grid grid-cols-[minmax(0,1fr)_5.5rem_4.75rem] items-start gap-3 rounded-xl border border-slate-200 px-3 py-3 text-sm dark:border-slate-800">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-slate-900 dark:text-slate-100">
                        {formatShortDate(slot.date)} • {formatTimeHHMM(slot.start_time) || slot.start_time}
                        {slot.end_time ? `-${formatTimeHHMM(slot.end_time) || slot.end_time}` : ''}
                    </div>
                    <div className="mt-1 text-slate-600 dark:text-slate-400">{formatSlotStatus(slot.status)}</div>
                    {bookedSlotLabel(slot) ? (
                      <div className="mt-1 whitespace-nowrap text-slate-600 dark:text-slate-400">{bookedSlotLabel(slot)}</div>
                    ) : null}
                    {slot.notes ? (
                      <div className="mt-1 text-slate-500 dark:text-slate-400">{slot.notes}</div>
                    ) : null}
                    {slot.active_booking_request_team_name && slot.status === 'held' ? (
                      <div className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-300">
                        Requested by {slot.active_booking_request_team_name}
                      </div>
                    ) : null}
                  </div>
                  <Badge
                    variant={slot.pricing_mode === 'call_for_pricing' ? 'warning' : 'outline'}
                    className="mt-0.5 inline-flex h-7 w-[5.5rem] shrink-0 items-center justify-center self-start whitespace-nowrap"
                  >
                    {formatPriceLabel(slot.pricing_mode, slot.price_amount_cents, slot.currency)}
                  </Badge>
                  <div className="flex w-[4.75rem] items-center justify-end gap-1 self-start">
                    {slot.booked_event_id ? (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className={tableActionButtonClass}
                        onClick={() => navigate(`/schedule/${slot.booked_event_id}`, {
                          state: {
                            backTo: `/arenas/${arenaId}/rinks/${selectedRinkId}`,
                            backLabel: 'Back to Arena',
                          },
                        })}
                        aria-label="View event"
                        title="View event"
                      >
                        <Eye className="h-4 w-4 text-sky-600" />
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className={tableActionButtonClass}
                      onClick={() => openEditSlot(slot)}
                      aria-label="Edit ice slot"
                      title="Edit ice slot"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
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
          </div>

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

      <div ref={bookingRequestsSectionRef}>
      <Card className="p-4">
        <div className="space-y-3">
          <div>
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Booking Requests</div>
            <div className="mt-1 text-sm text-slate-600 dark:text-slate-400">Manage current bookings and respond to new slot requests for this arena.</div>
          </div>
          <SegmentedTabs
            value={requestTab}
            onChange={(nextTab) => {
              if (nextTab === 'active' && activeRequests.length === 0) return;
              if (nextTab === 'pending' && pendingRequests.length === 0) return;
              if (nextTab === 'history' && historyRequests.length === 0) return;
              setRequestTab(nextTab);
            }}
            items={[
              {
                label: <span className={activeRequests.length === 0 ? 'opacity-45' : ''}>Upcoming</span>,
                value: 'active' as const,
              },
              {
                label: <span className={pendingRequests.length === 0 ? 'opacity-45' : ''}>Pending</span>,
                value: 'pending' as const,
              },
              {
                label: <span className={historyRequests.length === 0 ? 'opacity-45' : ''}>History</span>,
                value: 'history' as const,
              },
            ]}
          />
        </div>
        <div className="mt-4 space-y-3">
          {visibleRequests.length === 0 ? (
            <div className="text-sm text-slate-600 dark:text-slate-400">
              {requestTab === 'active'
                ? 'No upcoming bookings.'
                : requestTab === 'pending'
                  ? 'No pending booking requests.'
                  : 'No booking request history yet.'}
            </div>
          ) : visibleRequests.map((request) => (
            <div key={request.id} className="rounded-xl border border-slate-200 px-4 py-4 dark:border-slate-800">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-start gap-3">
                    <div className="flex shrink-0 items-center gap-2">
                      <TeamLogo name={request.requester_team_name || 'Team'} logoUrl={request.requester_team_logo_url} className="h-10 w-10 rounded-xl" initialsClassName="text-xs" />
                      {request.away_team_name ? (
                        <TeamLogo name={request.away_team_name} logoUrl={request.away_team_logo_url} className="h-10 w-10 rounded-xl" initialsClassName="text-xs" />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {request.event_id ? (
                          <button
                            type="button"
                            onClick={() => navigate(`/schedule/${request.event_id}`, {
                              state: {
                                backTo: `/arenas/${arenaId}/rinks/${selectedRinkId}`,
                                backLabel: 'Back to Arena',
                              },
                            })}
                            className="truncate text-left text-sm font-semibold text-sky-700 underline decoration-sky-300 underline-offset-2 transition-colors hover:text-sky-800 dark:text-sky-300 dark:decoration-sky-700 dark:hover:text-sky-200"
                            title="Open event"
                          >
                            {request.away_team_name ? `${request.requester_team_name} vs ${request.away_team_name}` : `${request.requester_team_name} ${getCompetitionLabel(request.event_type as any)}`}
                          </button>
                        ) : (
                          <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {request.away_team_name ? `${request.requester_team_name} vs ${request.away_team_name}` : `${request.requester_team_name} ${getCompetitionLabel(request.event_type as any)}`}
                          </div>
                        )}
                        <Badge variant={request.final_price_amount_cents != null || request.pricing_mode === 'fixed_price' ? 'outline' : 'warning'}>
                          {formatPriceLabel(request.final_price_amount_cents != null ? 'fixed_price' : request.pricing_mode, request.final_price_amount_cents ?? request.price_amount_cents, request.final_currency || request.currency)}
                        </Badge>
                        <Badge variant={request.status === 'accepted' ? 'success' : request.status === 'requested' ? 'warning' : request.status === 'rejected' ? 'danger' : 'neutral'}>
                          {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                        </Badge>
                      </div>
                      <div className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                        {[request.arena_rink_name, request.ice_slot_date ? formatShortDate(request.ice_slot_date) : null, request.ice_slot_start_time ? formatTimeHHMM(request.ice_slot_start_time) || request.ice_slot_start_time : null].filter(Boolean).join(' • ')}
                      </div>
                      <div className="mt-1 text-xs font-medium text-slate-600 dark:text-slate-400">
                        {request.home_locker_room_name || request.away_locker_room_name ? `Locker rooms: ${[request.home_locker_room_name, request.away_locker_room_name].filter(Boolean).join(' / ')}` : 'Locker rooms TBD'}
                      </div>
                      {request.message ? (
                        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
                          <span className="font-semibold">Booker note:</span> {request.message}
                        </div>
                      ) : null}
                      {request.response_message ? (
                        <div className="mt-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-100">
                          <span className="font-semibold">Arena note:</span> {request.response_message}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                  {request.status === 'requested' ? (
                    <>
                      <Button type="button" size="sm" onClick={() => setAcceptRequest(request)}>
                        Accept
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => { setActionRequest(request); setActionMode('reject'); }}>
                        Reject
                      </Button>
                    </>
                  ) : null}
                  {request.status === 'accepted' ? (
                    <>
                      {request.event_id && request.ice_slot_date && request.ice_slot_date >= todayIso ? (
                        <Button type="button" size="sm" variant="outline" onClick={() => setEditLockerRequest(request)}>
                          Edit Locker Rooms
                        </Button>
                      ) : null}
                      <Button type="button" size="sm" variant="outline" onClick={() => { setActionRequest(request); setActionMode('cancel'); }}>
                        Cancel Booking
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>
      </div>

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
        onClose={() => { setSlotModalOpen(false); setEditSlot(null); setSlotForm(emptySlotForm); }}
        title={editSlot ? 'Edit Ice Slot' : 'Add Ice Slot'}
        footer={(
          <>
            <Button type="button" onClick={saveIceSlot} disabled={!slotForm.date || !slotForm.start_time || (slotForm.pricing_mode === 'fixed_price' && !slotForm.price)}>
              Save
            </Button>
            <Button type="button" variant="outline" onClick={() => { setSlotModalOpen(false); setEditSlot(null); setSlotForm(emptySlotForm); }}>Cancel</Button>
          </>
        )}
      >
        <div className="grid grid-cols-1 gap-3">
          <Input type="date" value={slotForm.date} onChange={(event) => setSlotForm((current) => ({ ...current, date: event.target.value }))} />
          <div className="grid grid-cols-2 gap-3">
            <Input type="time" value={slotForm.start_time} onChange={(event) => setSlotForm((current) => ({ ...current, start_time: event.target.value }))} />
            <Input type="time" value={slotForm.end_time} onChange={(event) => setSlotForm((current) => ({ ...current, end_time: event.target.value }))} />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[0.9fr_1.1fr_0.7fr]">
            <Select value={slotForm.pricing_mode} onChange={(event) => setSlotForm((current) => ({ ...current, pricing_mode: event.target.value }))}>
              <option value="fixed_price">Fixed Price</option>
              <option value="call_for_pricing">Call for Pricing</option>
            </Select>
            <Input
              type="number"
              min="0"
              step="1"
              placeholder={slotForm.pricing_mode === 'fixed_price' ? 'Price in dollars' : 'No price required'}
              disabled={slotForm.pricing_mode !== 'fixed_price'}
              value={slotForm.price}
              onChange={(event) => setSlotForm((current) => ({ ...current, price: event.target.value }))}
            />
            <Select value={slotForm.currency} onChange={(event) => setSlotForm((current) => ({ ...current, currency: event.target.value }))}>
              {CURRENCIES.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
            </Select>
          </div>
          <Input value={slotForm.notes} onChange={(event) => setSlotForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Notes" />
        </div>
      </Modal>

      <Modal
        open={!!acceptRequest}
        onClose={() => setAcceptRequest(null)}
        title="Accept Booking Request"
        footer={(
          <>
            <Button type="button" onClick={acceptBookingRequest}>Accept Request</Button>
            <Button type="button" variant="outline" onClick={() => setAcceptRequest(null)}>Cancel</Button>
          </>
        )}
      >
        <div className="grid grid-cols-1 gap-3">
          <div className="rounded-xl border border-slate-200 px-3 py-3 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-400">
                  {acceptRequest ? (
              <>
                <div className="font-medium text-slate-900 dark:text-slate-100">
                  {acceptRequest.away_team_name ? `${acceptRequest.requester_team_name} vs ${acceptRequest.away_team_name}` : `${acceptRequest.requester_team_name} ${getCompetitionLabel(acceptRequest.event_type as any)}`}
                </div>
                <div className="mt-1">
                  {[acceptRequest.arena_rink_name, acceptRequest.ice_slot_date ? formatShortDate(acceptRequest.ice_slot_date) : null, acceptRequest.ice_slot_start_time ? formatTimeHHMM(acceptRequest.ice_slot_start_time) || acceptRequest.ice_slot_start_time : null].filter(Boolean).join(' • ')}
                </div>
              </>
            ) : null}
          </div>
          <div className={`grid grid-cols-1 gap-3 ${(acceptRequest?.event_type !== 'practice' && acceptRequest?.event_type !== 'scrimmage') ? 'sm:grid-cols-2' : ''}`}>
            <Select value={acceptForm.home_locker_room_id} onChange={(event) => setAcceptForm((current) => ({ ...current, home_locker_room_id: event.target.value }))}>
              <option value="">Home locker room</option>
              {acceptLockerRooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}
            </Select>
            {acceptRequest?.event_type !== 'practice' && acceptRequest?.event_type !== 'scrimmage' ? (
              <Select value={acceptForm.away_locker_room_id} onChange={(event) => setAcceptForm((current) => ({ ...current, away_locker_room_id: event.target.value }))}>
                <option value="">Away locker room</option>
                {acceptLockerRooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}
              </Select>
            ) : null}
          </div>
          <div className="rounded-xl border border-slate-200 px-3 py-3 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-400">
            <div className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Slot Price</div>
            <div className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">
              {acceptRequest
                ? `${formatPriceLabel(acceptRequest.pricing_mode, acceptRequest.price_amount_cents, acceptRequest.currency)}${acceptRequest.currency ? ` ${acceptRequest.currency}` : ''}`
                : '—'}
            </div>
          </div>
          <Textarea value={acceptForm.response_message} onChange={(event) => setAcceptForm((current) => ({ ...current, response_message: event.target.value }))} placeholder="Note to requester" rows={3} />
        </div>
      </Modal>

      <Modal
        open={!!editLockerRequest}
        onClose={() => setEditLockerRequest(null)}
        title="Edit Locker Rooms"
        footer={(
          <>
            <Button type="button" onClick={saveEditedLockerRooms}>Save</Button>
            <Button type="button" variant="outline" onClick={() => setEditLockerRequest(null)}>Cancel</Button>
          </>
        )}
      >
        <div className="grid grid-cols-1 gap-3">
          <Select value={lockerAssignForm.home_locker_room_id} onChange={(event) => setLockerAssignForm((current) => ({ ...current, home_locker_room_id: event.target.value }))}>
            <option value="">Home locker room</option>
            {editLockerRooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}
          </Select>
          {editLockerRequest?.away_team_id ? (
            <Select value={lockerAssignForm.away_locker_room_id} onChange={(event) => setLockerAssignForm((current) => ({ ...current, away_locker_room_id: event.target.value }))}>
              <option value="">Away locker room</option>
              {editLockerRooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}
            </Select>
          ) : null}
          <Textarea
            value={lockerAssignForm.response_message}
            onChange={(event) => setLockerAssignForm((current) => ({ ...current, response_message: event.target.value }))}
            placeholder="Note to organizer and opponent"
            rows={3}
          />
        </div>
      </Modal>

      <Modal
        open={!!actionRequest && !!actionMode}
        onClose={() => { setActionRequest(null); setActionMode(null); setActionForm(emptyActionForm); }}
        title={actionMode === 'reject' ? 'Reject Booking Request' : 'Cancel Booking'}
        footer={(
          <>
            <Button
              type="button"
              variant={actionMode === 'reject' ? 'outline' : 'destructive'}
              onClick={() => {
                if (!actionRequest || !actionMode) return;
                if (actionMode === 'reject') {
                  void rejectBookingRequest(actionRequest);
                } else {
                  void cancelBookingRequest(actionRequest);
                }
              }}
            >
              {actionMode === 'reject' ? 'Reject Request' : 'Cancel Booking'}
            </Button>
            <Button type="button" variant="outline" onClick={() => { setActionRequest(null); setActionMode(null); setActionForm(emptyActionForm); }}>
              Close
            </Button>
          </>
        )}
      >
        <div className="grid grid-cols-1 gap-3">
          <div className="rounded-xl border border-slate-200 px-3 py-3 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-400">
            {actionRequest ? (
              <>
                <div className="font-medium text-slate-900 dark:text-slate-100">
                  {actionRequest.away_team_name ? `${actionRequest.requester_team_name} vs ${actionRequest.away_team_name}` : `${actionRequest.requester_team_name} ${getCompetitionLabel(actionRequest.event_type as any)}`}
                </div>
                <div className="mt-1">
                  {[actionRequest.arena_rink_name, actionRequest.ice_slot_date ? formatShortDate(actionRequest.ice_slot_date) : null, actionRequest.ice_slot_start_time ? formatTimeHHMM(actionRequest.ice_slot_start_time) || actionRequest.ice_slot_start_time : null].filter(Boolean).join(' • ')}
                </div>
              </>
            ) : null}
          </div>
          <Textarea
            value={actionForm.response_message}
            onChange={(event) => setActionForm({ response_message: event.target.value })}
            placeholder={actionMode === 'reject' ? 'Note to requester' : 'Cancellation note to requester'}
            rows={3}
          />
        </div>
      </Modal>

    </div>
  );
}

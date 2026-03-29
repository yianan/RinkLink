import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CalendarPlus2, Check, ChevronLeft, DoorOpen, FileUp, Pencil, Plus, Save, Trash2, X, XCircle } from 'lucide-react';
import { api } from '../api/client';
import { Arena, ArenaRink, Event, IceBookingRequest, IceSlot, LockerRoom } from '../types';
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
import IceSlotCsvUploader from '../components/IceSlotCsvUploader';
import { useConfirmDialog } from '../context/ConfirmDialogContext';
import { useToast } from '../context/ToastContext';
import { formatShortDate, formatTimeHHMM, hasInvalidTimeRange } from '../lib/time';
import { cn } from '../lib/cn';
import { accentSelectorPillActiveClass, destructiveIconButtonClass, selectorPillClass, selectorPillIdleClass, tableActionButtonClass } from '../lib/uiClasses';
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
  if (request.status !== 'accepted') return false;
  if (!request.ice_slot_date) return true;
  if (request.event_status === 'cancelled') return false;
  return request.ice_slot_date >= todayIso;
}

function requestDateTimeKey(request: IceBookingRequest) {
  return `${request.ice_slot_date || '9999-12-31'}:${request.ice_slot_start_time || '99:99:99'}`;
}

function eventDateTimeKey(event: Event) {
  return `${event.date}:${event.start_time || '99:99:99'}`;
}

function slotDateTimeKey(slot: IceSlot) {
  return `${slot.date}:${slot.start_time || '99:99:99'}`;
}

function getErrorDescription(error: unknown) {
  if (error instanceof Error) {
    const [, ...rest] = error.message.split(': ');
    const rawMessage = (rest.length > 0 ? rest.join(': ') : error.message).trim();
    if (!rawMessage) return 'Something went wrong.';
    try {
      const parsed = JSON.parse(rawMessage) as { detail?: string };
      if (typeof parsed.detail === 'string' && parsed.detail.trim()) {
        return parsed.detail;
      }
    } catch {
      // Fall back to the raw message when the backend response is plain text.
    }
    return rawMessage;
  }
  return 'Something went wrong.';
}

type BookedSlotActionTarget = {
  ice_slot_id: string;
  arena_rink_id: string;
  title: string;
  arena_rink_name: string | null;
  date: string | null;
  start_time: string | null;
  event_type: Event['event_type'];
  away_team_id: string | null;
  home_locker_room_id: string;
  away_locker_room_id: string;
};

type CancelSlotTarget = {
  ice_slot_id: string;
  title: string;
  arena_rink_name: string | null;
  date: string | null;
  start_time: string | null;
  description: string;
};

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
  const [arenaIceSlots, setArenaIceSlots] = useState<IceSlot[]>([]);
  const [arenaEvents, setArenaEvents] = useState<Event[]>([]);
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

  const [lockerManagerOpen, setLockerManagerOpen] = useState(false);
  const [lockerModalOpen, setLockerModalOpen] = useState(false);
  const [lockerForm, setLockerForm] = useState(emptyLockerForm);

  const [slotModalOpen, setSlotModalOpen] = useState(false);
  const [slotUploadOpen, setSlotUploadOpen] = useState(false);
  const [slotForm, setSlotForm] = useState(emptySlotForm);
  const [editSlot, setEditSlot] = useState<IceSlot | null>(null);
  const [bookedSlotTarget, setBookedSlotTarget] = useState<BookedSlotActionTarget | null>(null);
  const [cancelSlotTarget, setCancelSlotTarget] = useState<CancelSlotTarget | null>(null);
  const [cancelSlotForm, setCancelSlotForm] = useState(emptyActionForm);
  const [acceptRequest, setAcceptRequest] = useState<IceBookingRequest | null>(null);
  const [acceptForm, setAcceptForm] = useState(emptyAcceptForm);
  const [acceptLockerRooms, setAcceptLockerRooms] = useState<LockerRoom[]>([]);
  const [editLockerRooms, setEditLockerRooms] = useState<LockerRoom[]>([]);
  const [lockerAssignForm, setLockerAssignForm] = useState(emptyLockerAssignForm);
  const [actionRequest, setActionRequest] = useState<IceBookingRequest | null>(null);
  const [actionMode, setActionMode] = useState<'reject' | null>(null);
  const [actionForm, setActionForm] = useState(emptyActionForm);
  const [highlightedRequestId, setHighlightedRequestId] = useState<string | null>(null);
  const initialRinkSyncDone = useRef(false);
  const iceSlotsSectionRef = useRef<HTMLDivElement | null>(null);
  const bookingRequestsSectionRef = useRef<HTMLDivElement | null>(null);

  const selectedRink = rinks.find((rink) => rink.id === selectedRinkId) ?? null;
  const todayIso = new Date().toISOString().slice(0, 10);
  const pendingRequests = [...bookingRequests.filter((request) => request.status === 'requested')]
    .sort((left, right) => requestDateTimeKey(left).localeCompare(requestDateTimeKey(right)));
  const activeRequests = [...bookingRequests.filter((request) => isRequestActive(request, todayIso))]
    .sort((left, right) => requestDateTimeKey(left).localeCompare(requestDateTimeKey(right)));
  const activeAcceptedRequests = activeRequests.filter((request) => request.status === 'accepted');
  const historyRequests = [...bookingRequests.filter((request) => request.status !== 'requested' && !isRequestActive(request, todayIso))]
    .sort((left, right) => requestDateTimeKey(right).localeCompare(requestDateTimeKey(left)));
  const bookingRequestsById = new Map(bookingRequests.map((request) => [request.id, request]));
  const arenaEventsById = new Map(arenaEvents.map((event) => [event.id, event]));
  const requestEventIds = new Set(bookingRequests.map((request) => request.event_id).filter(Boolean));
  const activeRequestSlotIds = new Set(activeAcceptedRequests.map((request) => request.ice_slot_id).filter(Boolean));
  const directUpcomingEvents = [...arenaEvents.filter((event) => (
    event.status !== 'cancelled'
    && event.date >= todayIso
    && !requestEventIds.has(event.id)
  ))].sort((left, right) => eventDateTimeKey(left).localeCompare(eventDateTimeKey(right)));
  const directUpcomingEventIds = new Set(directUpcomingEvents.map((event) => event.id));
  const slotTimeError = hasInvalidTimeRange(slotForm.start_time, slotForm.end_time)
    ? 'Slot end time must be the same as or later than slot start time.'
    : '';
  const orphanBookedSlots = [...arenaIceSlots.filter((slot) => (
    slot.status === 'booked'
    && slot.date >= todayIso
    && !slot.active_booking_request_id
    && !activeRequestSlotIds.has(slot.id)
    && (!slot.booked_event_id || !directUpcomingEventIds.has(slot.booked_event_id))
  ))].sort((left, right) => slotDateTimeKey(left).localeCompare(slotDateTimeKey(right)));
  const upcomingItems = [
    ...activeAcceptedRequests.map((request) => ({ kind: 'request' as const, sortKey: requestDateTimeKey(request), request })),
    ...directUpcomingEvents.map((event) => ({ kind: 'event' as const, sortKey: eventDateTimeKey(event), event })),
    ...orphanBookedSlots.map((slot) => ({ kind: 'slot' as const, sortKey: slotDateTimeKey(slot), slot })),
  ].sort((left, right) => left.sortKey.localeCompare(right.sortKey));

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

  const loadArenaEvents = () => {
    api.getArenaEvents(arenaId, { date_from: todayIso }).then(setArenaEvents);
  };

  const loadArenaIceSlots = () => {
    api.getArenaIceSlots(arenaId, { date_from: todayIso }).then(setArenaIceSlots);
  };

  const refreshIceSlots = () => {
    if (!selectedRinkId) return;
    api.getIceSlots(selectedRinkId).then(setIceSlots);
    loadArenaIceSlots();
    loadRinks();
  };

  useEffect(() => {
    if (!arenaId) return;
    initialRinkSyncDone.current = false;
    loadArena();
    loadRinks();
    loadBookingRequests();
    loadArenaEvents();
    loadArenaIceSlots();
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
      setSlotUploadOpen(false);
      return;
    }
    Promise.all([api.getLockerRooms(selectedRinkId), api.getIceSlots(selectedRinkId)])
      .then(([rooms, slots]) => {
        setLockerRooms(rooms);
        setIceSlots(slots);
      });
  }, [selectedRinkId]);

  useEffect(() => {
    if (!arenaId) return;

    const refreshArenaDetail = () => {
      if (document.visibilityState === 'hidden') return;
      loadArena();
      loadRinks();
      loadBookingRequests();
      loadArenaEvents();
      loadArenaIceSlots();
      if (selectedRinkId) {
        Promise.all([api.getLockerRooms(selectedRinkId), api.getIceSlots(selectedRinkId)])
          .then(([rooms, slots]) => {
            setLockerRooms(rooms);
            setIceSlots(slots);
          });
      }
    };

    window.addEventListener('focus', refreshArenaDetail);
    document.addEventListener('visibilitychange', refreshArenaDetail);
    return () => {
      window.removeEventListener('focus', refreshArenaDetail);
      document.removeEventListener('visibilitychange', refreshArenaDetail);
    };
  }, [arenaId, selectedRinkId]);

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
    if (!bookedSlotTarget) {
      setEditLockerRooms([]);
      setLockerAssignForm(emptyLockerAssignForm);
      return;
    }
    api.getLockerRooms(bookedSlotTarget.arena_rink_id).then(setEditLockerRooms);
    setLockerAssignForm({
      home_locker_room_id: bookedSlotTarget.home_locker_room_id || '',
      away_locker_room_id: bookedSlotTarget.away_locker_room_id || '',
      response_message: '',
    });
  }, [bookedSlotTarget]);

  useEffect(() => {
    if (!actionRequest || !actionMode) {
      setActionForm(emptyActionForm);
    }
  }, [actionMode, actionRequest]);

  useEffect(() => {
    if (!cancelSlotTarget) {
      setCancelSlotForm(emptyActionForm);
    }
  }, [cancelSlotTarget]);

  useEffect(() => {
    if (requestTab === 'active' && upcomingItems.length === 0) {
      if (pendingRequests.length > 0) {
        setRequestTab('pending');
      } else if (historyRequests.length > 0) {
        setRequestTab('history');
      }
      return;
    }
    if (requestTab === 'pending' && pendingRequests.length === 0) {
      if (upcomingItems.length > 0) {
        setRequestTab('active');
      } else if (historyRequests.length > 0) {
        setRequestTab('history');
      }
      return;
    }
    if (requestTab === 'history' && historyRequests.length === 0) {
      if (upcomingItems.length > 0) {
        setRequestTab('active');
      } else if (pendingRequests.length > 0) {
        setRequestTab('pending');
      }
    }
  }, [historyRequests.length, pendingRequests.length, requestTab, upcomingItems.length]);

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
    if (slotTimeError) {
      pushToast({ variant: 'error', title: 'Check the slot time range', description: slotTimeError });
      return;
    }
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
    try {
      if (editSlot) {
        await api.updateIceSlot(editSlot.id, payload);
        pushToast({ variant: 'success', title: 'Ice slot updated' });
      } else {
        await api.createIceSlot(selectedRinkId, payload);
        pushToast({ variant: 'success', title: 'Ice slot added' });
      }
    } catch (error) {
      pushToast({
        variant: 'error',
        title: editSlot ? 'Unable to update ice slot' : 'Unable to add ice slot',
        description: getErrorDescription(error),
      });
      return;
    }
    setSlotModalOpen(false);
    setEditSlot(null);
    setSlotForm(emptySlotForm);
    refreshIceSlots();
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
    try {
      await api.deleteIceSlot(slot.id);
      pushToast({ variant: 'success', title: 'Ice slot deleted' });
      refreshIceSlots();
    } catch (error) {
      pushToast({
        variant: 'error',
        title: 'Unable to delete ice slot',
        description: getErrorDescription(error),
      });
    }
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
    loadArenaEvents();
    loadArenaIceSlots();
    refreshIceSlots();
    pushToast({ variant: 'success', title: 'Booking request accepted' });
  };

  const rejectBookingRequest = async (request: IceBookingRequest) => {
    await api.rejectArenaIceBookingRequest(arenaId, request.id, actionForm.response_message || undefined);
    loadBookingRequests();
    loadArenaEvents();
    loadArenaIceSlots();
    setActionRequest(null);
    setActionMode(null);
    setActionForm(emptyActionForm);
    refreshIceSlots();
    pushToast({ variant: 'success', title: 'Booking request rejected' });
  };

  const saveEditedLockerRooms = async () => {
    if (!bookedSlotTarget) return;
    try {
      await api.updateArenaIceSlotLockerRooms(arenaId, bookedSlotTarget.ice_slot_id, {
        home_locker_room_id: lockerAssignForm.home_locker_room_id || null,
        away_locker_room_id: bookedSlotTarget.away_team_id ? (lockerAssignForm.away_locker_room_id || null) : null,
        response_message: lockerAssignForm.response_message || null,
      });
      setBookedSlotTarget(null);
      loadBookingRequests();
      loadArenaEvents();
      loadArenaIceSlots();
      refreshIceSlots();
      pushToast({ variant: 'success', title: 'Locker rooms updated' });
    } catch (error) {
      pushToast({
        variant: 'error',
        title: 'Unable to update locker rooms',
        description: getErrorDescription(error),
      });
    }
  };

  const cancelSlot = async () => {
    if (!cancelSlotTarget) return;
    try {
      await api.cancelArenaIceSlot(arenaId, cancelSlotTarget.ice_slot_id, cancelSlotForm.response_message || undefined);
      setCancelSlotTarget(null);
      setCancelSlotForm(emptyActionForm);
      loadBookingRequests();
      loadArenaEvents();
      loadArenaIceSlots();
      refreshIceSlots();
      pushToast({ variant: 'success', title: 'Slot cancelled' });
    } catch (error) {
      pushToast({
        variant: 'error',
        title: 'Unable to cancel slot',
        description: getErrorDescription(error),
      });
    }
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

  const formatSlotStatus = (status: IceSlot['status']) => {
    if (status === 'available') return 'Open';
    if (status === 'held') return 'Pending';
    if (status === 'cancelled') return 'Cancelled';
    return 'Booked';
  };
  const slotStatusVariant = (status: IceSlot['status']): 'success' | 'warning' | 'info' | 'neutral' => {
    if (status === 'available') return 'success';
    if (status === 'held') return 'warning';
    if (status === 'cancelled') return 'neutral';
    return 'info';
  };
  const getHeldSlotLabel = (slot: IceSlot) => {
    if (slot.active_booking_request_id) return 'Pending request';
    if (slot.active_proposal_id) return 'Pending proposal';
    return 'Pending';
  };
  const openSlotCount = iceSlots.filter((slot) => slot.status === 'available').length;
  const visibleRequests = requestTab === 'pending' ? pendingRequests : historyRequests;

  const focusIceSlots = () => {
    iceSlotsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const focusRequests = (nextTab: 'active' | 'pending' | 'history') => {
    setRequestTab(nextTab);
    window.requestAnimationFrame(() => {
      bookingRequestsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const focusSlotManagement = (slot: IceSlot) => {
    const requestId = slot.active_booking_request_id;
    if (!requestId) return;
    const nextTab = pendingRequests.some((request) => request.id === requestId)
      ? 'pending'
      : activeRequests.some((request) => request.id === requestId)
        ? 'active'
        : 'history';
    setHighlightedRequestId(requestId);
    focusRequests(nextTab);
    window.setTimeout(() => {
      setHighlightedRequestId((current) => (current === requestId ? null : current));
    }, 2400);
  };

  const openBookedSlotLockerRooms = (target: BookedSlotActionTarget) => {
    setBookedSlotTarget(target);
  };

  const openCancelSlot = (target: CancelSlotTarget) => {
    setCancelSlotTarget(target);
  };

  const bookedSlotTitleFromRequest = (request: IceBookingRequest) => (
    request.away_team_name
      ? `${request.requester_team_name} vs ${request.away_team_name}`
      : `${request.requester_team_name} ${getCompetitionLabel(request.event_type as Event['event_type'])}`
  );

  const bookedSlotTitleFromEvent = (event: Event) => (
    event.away_team_name
      ? `${event.home_team_name} vs ${event.away_team_name}`
      : `${event.home_team_name} ${getCompetitionLabel(event.event_type)}`
  );

  const renderOrphanSlotCard = (slot: IceSlot) => (
    <div key={slot.id} className="rounded-xl border border-slate-200 px-4 py-4 transition dark:border-slate-800">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {slot.booked_event_away_team_name
                    ? `${slot.booked_event_home_team_name} vs ${slot.booked_event_away_team_name}`
                    : `${slot.booked_event_home_team_name || 'Booked Slot'} Practice`}
                </div>
                <Badge variant={slot.pricing_mode === 'call_for_pricing' ? 'warning' : 'outline'}>
                  {formatPriceLabel(slot.pricing_mode, slot.price_amount_cents, slot.currency)}
                </Badge>
                <Badge variant="success">Booked</Badge>
              </div>
              <div className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                {[slot.arena_rink_name, formatShortDate(slot.date), formatTimeHHMM(slot.start_time) || slot.start_time].filter(Boolean).join(' • ')}
              </div>
              {slot.notes ? (
                <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-200">
                  <span className="font-semibold">Slot note:</span> {slot.notes}
                </div>
              ) : null}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <Button
            type="button"
            size="sm"
            variant="destructive"
            onClick={() => openCancelSlot({
              ice_slot_id: slot.id,
              title: slot.booked_event_away_team_name
                ? `${slot.booked_event_home_team_name} vs ${slot.booked_event_away_team_name}`
                : `${slot.booked_event_home_team_name || 'Booked Slot'} Practice`,
              arena_rink_name: slot.arena_rink_name,
              date: slot.date,
              start_time: slot.start_time,
              description: 'This cancels the booked slot and removes it from the live rink schedule.',
            })}
          >
            <XCircle className="h-4 w-4" />
            Cancel Slot
          </Button>
        </div>
      </div>
    </div>
  );

  const renderRequestCard = (request: IceBookingRequest) => (
    <div
      key={request.id}
      className={cn(
        'rounded-xl border border-slate-200 px-4 py-4 transition dark:border-slate-800',
        highlightedRequestId === request.id && 'border-cyan-300 ring-2 ring-cyan-200/80 dark:border-cyan-500/60 dark:ring-cyan-500/30',
      )}
    >
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
                <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {bookedSlotTitleFromRequest(request)}
                </div>
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
                <Check className="h-4 w-4" />
                Accept
              </Button>
              <Button type="button" size="sm" variant="destructive" onClick={() => { setActionRequest(request); setActionMode('reject'); }}>
                <XCircle className="h-4 w-4" />
                Reject
              </Button>
            </>
          ) : null}
          {request.status === 'accepted' && request.ice_slot_date && request.ice_slot_date >= todayIso ? (
            <>
              {request.event_id ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => openBookedSlotLockerRooms({
                    ice_slot_id: request.ice_slot_id,
                    arena_rink_id: request.arena_rink_id,
                    title: bookedSlotTitleFromRequest(request),
                    arena_rink_name: request.arena_rink_name,
                    date: request.ice_slot_date,
                    start_time: request.ice_slot_start_time,
                    event_type: request.event_type as Event['event_type'],
                    away_team_id: request.away_team_id,
                    home_locker_room_id: request.home_locker_room_id || '',
                    away_locker_room_id: request.away_locker_room_id || '',
                  })}
                >
                  <Pencil className="h-4 w-4" />
                  Edit Locker Rooms
                </Button>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant="destructive"
                onClick={() => openCancelSlot({
                  ice_slot_id: request.ice_slot_id,
                  title: bookedSlotTitleFromRequest(request),
                  arena_rink_name: request.arena_rink_name,
                  date: request.ice_slot_date,
                  start_time: request.ice_slot_start_time,
                  description: 'This cancels the booked slot and moves the booking into history for the team.',
                })}
              >
                <XCircle className="h-4 w-4" />
                Cancel Slot
              </Button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );

  const renderDirectEventCard = (event: Event) => (
    <div key={event.id} className="rounded-xl border border-slate-200 px-4 py-4 transition dark:border-slate-800">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-3">
            <div className="flex shrink-0 items-center gap-2">
              <TeamLogo name={event.home_team_name || 'Team'} logoUrl={event.home_team_logo_url} className="h-10 w-10 rounded-xl" initialsClassName="text-xs" />
              {event.away_team_name ? (
                <TeamLogo name={event.away_team_name} logoUrl={event.away_team_logo_url} className="h-10 w-10 rounded-xl" initialsClassName="text-xs" />
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {bookedSlotTitleFromEvent(event)}
                </div>
                <Badge variant="outline">{event.competition_short_name || event.competition_name || 'Direct booking'}</Badge>
                <Badge variant="success">Booked</Badge>
              </div>
              <div className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                {[event.arena_rink_name, formatShortDate(event.date), event.start_time ? formatTimeHHMM(event.start_time) || event.start_time : null].filter(Boolean).join(' • ')}
              </div>
              <div className="mt-1 text-xs font-medium text-slate-600 dark:text-slate-400">
                {event.home_locker_room_name || event.away_locker_room_name ? `Locker rooms: ${[event.home_locker_room_name, event.away_locker_room_name].filter(Boolean).join(' / ')}` : 'Locker rooms TBD'}
              </div>
              {event.notes ? (
                <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-200">
                  <span className="font-semibold">Event note:</span> {event.notes}
                </div>
              ) : null}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          {event.date >= todayIso ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => openBookedSlotLockerRooms({
                ice_slot_id: event.ice_slot_id || '',
                arena_rink_id: event.arena_rink_id,
                title: bookedSlotTitleFromEvent(event),
                arena_rink_name: event.arena_rink_name,
                date: event.date,
                start_time: event.start_time,
                event_type: event.event_type,
                away_team_id: event.away_team_id,
                home_locker_room_id: event.home_locker_room_id || '',
                away_locker_room_id: event.away_locker_room_id || '',
              })}
              disabled={!event.ice_slot_id}
            >
              <Pencil className="h-4 w-4" />
              Edit Locker Rooms
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="destructive"
            onClick={() => openCancelSlot({
              ice_slot_id: event.ice_slot_id || '',
              title: bookedSlotTitleFromEvent(event),
              arena_rink_name: event.arena_rink_name,
              date: event.date,
              start_time: event.start_time,
              description: 'This cancels the booked slot and updates the linked team booking records.',
            })}
            disabled={!event.ice_slot_id}
          >
            <XCircle className="h-4 w-4" />
            Cancel Slot
          </Button>
        </div>
      </div>
    </div>
  );

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
          onClick={() => upcomingItems.length > 0 && focusRequests('active')}
          onKeyDown={(event) => {
            if ((event.key === 'Enter' || event.key === ' ') && upcomingItems.length > 0) {
              event.preventDefault();
              focusRequests('active');
            }
          }}
          className={`p-4 transition ${upcomingItems.length > 0 ? 'cursor-pointer hover:border-cyan-300/60 hover:shadow-md' : 'cursor-not-allowed opacity-70'}`}
        >
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Upcoming Bookings</div>
          <div className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">{upcomingItems.length}</div>
        </Card>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap gap-2">
          {rinks.map((rink) => (
            <button
              key={rink.id}
              type="button"
              onClick={() => selectRink(rink.id)}
              className={`${selectorPillClass} px-4 py-2 ${selectedRinkId === rink.id ? accentSelectorPillActiveClass : selectorPillIdleClass}`}
            >
              {rink.name}
            </button>
          ))}
        </div>
        {selectedRink ? (
          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-slate-600 dark:text-slate-400">
            <span>{selectedRink.locker_room_count} locker rooms</span>
            <span>{selectedRink.ice_slot_count} ice slots</span>
            <Button type="button" variant="outline" size="sm" onClick={() => setLockerManagerOpen(true)}>
              <DoorOpen className="h-3.5 w-3.5" />
              Manage Locker Rooms
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => openEditRink(selectedRink)}>
              <Pencil className="h-3.5 w-3.5" />
              Edit Rink
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={`${tableActionButtonClass} ${destructiveIconButtonClass}`}
              onClick={() => deleteRink(selectedRink)}
              aria-label="Delete rink"
              title="Delete rink"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="mt-4 text-sm text-slate-600 dark:text-slate-400">Add a rink to manage locker rooms and ice slots.</div>
        )}
      </Card>

      {selectedRink ? (
        <div ref={iceSlotsSectionRef}>
          <Card className="p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Ice Slots</div>
                <div className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  Manage the live slot inventory for {selectedRink.name}.
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => setSlotUploadOpen((current) => !current)}>
                  <FileUp className="h-3.5 w-3.5" />
                  {slotUploadOpen ? 'Hide Upload' : 'Upload CSV'}
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setSlotModalOpen(true)}>
                  <CalendarPlus2 className="h-3.5 w-3.5" />
                  Add Ice Slot
                </Button>
              </div>
            </div>
            {slotUploadOpen ? (
              <div className="mt-4 rounded-2xl border border-[color:var(--app-border-subtle)] bg-[var(--app-surface)] p-4">
                <div className="mb-3 text-sm text-slate-600 dark:text-slate-400">
                  Upload slot date, time, pricing, and notes in bulk for this rink.
                </div>
                <IceSlotCsvUploader
                  arenaRinkId={selectedRinkId}
                  onConfirmed={() => {
                    setSlotUploadOpen(false);
                    refreshIceSlots();
                  }}
                />
              </div>
            ) : null}
            <div className="mt-4 space-y-2">
              {iceSlots.map((slot) => {
                const slotRequest = slot.active_booking_request_id ? bookingRequestsById.get(slot.active_booking_request_id) : undefined;
                const slotEvent = slot.booked_event_id ? arenaEventsById.get(slot.booked_event_id) : undefined;
                return (
                <div
                  key={slot.id}
                  className="grid gap-3 rounded-xl border border-slate-200 px-3 py-3 text-sm dark:border-slate-800 md:grid-cols-[minmax(0,1fr)_7.75rem_8.5rem] md:items-start lg:grid-cols-[minmax(0,1fr)_7.75rem_8.5rem_19rem]"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium text-slate-900 dark:text-slate-100">
                      {formatShortDate(slot.date)} • {formatTimeHHMM(slot.start_time) || slot.start_time}
                      {slot.end_time ? `-${formatTimeHHMM(slot.end_time) || slot.end_time}` : ''}
                    </div>
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
                    {slot.active_proposal_id && slot.status === 'held' ? (
                      <div className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-300">
                        Reserved for proposal: {slot.active_proposal_away_team_name
                          ? `${slot.active_proposal_home_team_name} vs ${slot.active_proposal_away_team_name}`
                          : slot.active_proposal_home_team_name}
                      </div>
                    ) : null}
                  </div>
                  <Badge
                    variant={slotStatusVariant(slot.status)}
                    className="inline-flex h-7 items-center justify-center whitespace-nowrap md:w-[7.75rem]"
                  >
                    {slot.status === 'held' ? getHeldSlotLabel(slot) : formatSlotStatus(slot.status)}
                  </Badge>
                  <Badge
                    variant={slot.pricing_mode === 'call_for_pricing' ? 'warning' : 'outline'}
                    className="inline-flex h-7 items-center justify-center whitespace-nowrap md:w-[8.5rem]"
                  >
                    {formatPriceLabel(slot.pricing_mode, slot.price_amount_cents, slot.currency)}
                  </Badge>
                  {slot.status === 'available' ? (
                    <div className="flex items-center justify-start gap-2 md:col-span-3 lg:col-span-1 lg:justify-end">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="whitespace-nowrap"
                        onClick={() => openEditSlot(slot)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        className="whitespace-nowrap"
                        onClick={() => deleteIceSlot(slot)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </Button>
                    </div>
                  ) : slot.active_proposal_id && slot.status === 'held' ? (
                    <div className="flex items-center justify-start md:col-span-3 lg:col-span-1 lg:justify-end">
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        className="whitespace-nowrap"
                        onClick={() => openCancelSlot({
                          ice_slot_id: slot.id,
                          title: slot.active_proposal_away_team_name
                            ? `${slot.active_proposal_home_team_name} vs ${slot.active_proposal_away_team_name}`
                            : slot.active_proposal_home_team_name || 'Reserved proposal',
                          arena_rink_name: slot.arena_rink_name,
                          date: slot.date,
                          start_time: slot.start_time,
                          description: 'This cancels the reserved proposal slot and removes it from the live rink schedule.',
                        })}
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        Cancel Slot
                      </Button>
                    </div>
                  ) : slot.active_booking_request_id && slot.status === 'held' ? (
                    <div className="flex items-center justify-start md:col-span-3 lg:col-span-1 lg:justify-end">
                      <Button type="button" size="sm" variant="ghost" className="whitespace-nowrap" onClick={() => focusSlotManagement(slot)}>
                        Review
                      </Button>
                    </div>
                  ) : slot.status === 'booked' && slot.date >= todayIso ? (
                    <div className="flex items-center justify-start gap-2 md:col-span-3 lg:col-span-1 lg:justify-end">
                      {slotRequest ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="whitespace-nowrap"
                          onClick={() => openBookedSlotLockerRooms({
                            ice_slot_id: slot.id,
                            arena_rink_id: slot.arena_rink_id,
                            title: bookedSlotTitleFromRequest(slotRequest),
                            arena_rink_name: slot.arena_rink_name,
                            date: slot.date,
                            start_time: slot.start_time,
                            event_type: slotRequest.event_type as Event['event_type'],
                            away_team_id: slotRequest.away_team_id,
                            home_locker_room_id: slotRequest.home_locker_room_id || '',
                            away_locker_room_id: slotRequest.away_locker_room_id || '',
                          })}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Edit Locker Rooms
                        </Button>
                      ) : slotEvent ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="whitespace-nowrap"
                          onClick={() => openBookedSlotLockerRooms({
                            ice_slot_id: slot.id,
                            arena_rink_id: slot.arena_rink_id,
                            title: bookedSlotTitleFromEvent(slotEvent),
                            arena_rink_name: slot.arena_rink_name,
                            date: slot.date,
                            start_time: slot.start_time,
                            event_type: slotEvent.event_type,
                            away_team_id: slotEvent.away_team_id,
                            home_locker_room_id: slotEvent.home_locker_room_id || '',
                            away_locker_room_id: slotEvent.away_locker_room_id || '',
                          })}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Edit Locker Rooms
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        className="whitespace-nowrap"
                        onClick={() => openCancelSlot({
                          ice_slot_id: slot.id,
                          title: bookedSlotLabel(slot) || 'Booked slot',
                          arena_rink_name: slot.arena_rink_name,
                          date: slot.date,
                          start_time: slot.start_time,
                          description: 'This cancels the booked slot and updates the linked team booking records.',
                        })}
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        Cancel Slot
                      </Button>
                    </div>
                  ) : (
                    <div className="hidden lg:block" />
                  )}
                </div>
              )})}
              {iceSlots.length === 0 ? (
                <div className="text-sm text-slate-600 dark:text-slate-400">No ice slots configured for this rink.</div>
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
              if (nextTab === 'active' && upcomingItems.length === 0) return;
              if (nextTab === 'pending' && pendingRequests.length === 0) return;
              if (nextTab === 'history' && historyRequests.length === 0) return;
              setRequestTab(nextTab);
            }}
            items={[
              {
                label: <span className={upcomingItems.length === 0 ? 'opacity-45' : ''}>Upcoming</span>,
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
          {requestTab === 'active' ? (
            upcomingItems.length === 0 ? (
              <div className="text-sm text-slate-600 dark:text-slate-400">No upcoming bookings.</div>
            ) : (
              upcomingItems.map((item) => (
                item.kind === 'request'
                  ? renderRequestCard(item.request)
                  : item.kind === 'event'
                    ? renderDirectEventCard(item.event)
                    : renderOrphanSlotCard(item.slot)
              ))
            )
          ) : visibleRequests.length === 0 ? (
            <div className="text-sm text-slate-600 dark:text-slate-400">
              {requestTab === 'pending' ? 'No pending booking requests.' : 'No booking request history yet.'}
            </div>
          ) : (
            visibleRequests.map(renderRequestCard)
          )}
        </div>
      </Card>
      </div>

      <Modal
        open={arenaEditOpen}
        onClose={() => setArenaEditOpen(false)}
        title="Edit Arena"
        footer={(
          <>
            <Button type="button" onClick={saveArena}>
              <Save className="h-4 w-4" />
              Save
            </Button>
            <Button type="button" variant="outline" onClick={() => setArenaEditOpen(false)}>
              <X className="h-4 w-4" />
              Cancel
            </Button>
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
            <Button type="button" onClick={saveRink} disabled={!rinkForm.name}>
              <Save className="h-4 w-4" />
              Save
            </Button>
            <Button type="button" variant="outline" onClick={() => setRinkModalOpen(false)}>
              <X className="h-4 w-4" />
              Cancel
            </Button>
          </>
        )}
      >
        <div className="grid grid-cols-1 gap-3">
          <Input value={rinkForm.name} onChange={(event) => setRinkForm((current) => ({ ...current, name: event.target.value }))} placeholder="Rink name" />
          <Input value={rinkForm.notes} onChange={(event) => setRinkForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Notes" />
        </div>
      </Modal>

      <Modal
        open={lockerManagerOpen}
        onClose={() => setLockerManagerOpen(false)}
        title="Manage Locker Rooms"
        footer={(
          <Button type="button" variant="outline" onClick={() => setLockerManagerOpen(false)}>
            <Check className="h-4 w-4" />
            Done
          </Button>
        )}
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-3 dark:border-slate-800 dark:bg-slate-900/35">
            <div>
              <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                {selectedRink ? selectedRink.name : 'Selected rink'}
              </div>
              <div className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                {lockerRooms.length === 0
                  ? 'No locker rooms configured yet.'
                  : `${lockerRooms.length} locker room${lockerRooms.length === 1 ? '' : 's'} configured for assignments.`}
              </div>
            </div>
            <Button
              type="button"
              onClick={() => {
                setLockerForm(emptyLockerForm);
                setLockerModalOpen(true);
              }}
            >
              <DoorOpen className="h-4 w-4" />
              Add Locker Room
            </Button>
          </div>

          <div className="space-y-2">
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
                  className={`${tableActionButtonClass} ${destructiveIconButtonClass}`}
                  onClick={() => deleteLockerRoom(lockerRoom)}
                  aria-label="Delete locker room"
                  title="Delete locker room"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            {lockerRooms.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 px-4 py-4 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-400">
                Add locker rooms here when a rink needs assigned spaces for teams and officials.
              </div>
            ) : null}
          </div>
        </div>
      </Modal>

      <Modal
        open={lockerModalOpen}
        onClose={() => {
          setLockerModalOpen(false);
          setLockerForm(emptyLockerForm);
        }}
        title="Add Locker Room"
        footer={(
          <>
            <Button type="button" onClick={saveLockerRoom} disabled={!lockerForm.name}>
              <Save className="h-4 w-4" />
              Save
            </Button>
            <Button type="button" variant="outline" onClick={() => { setLockerModalOpen(false); setLockerForm(emptyLockerForm); }}>
              <X className="h-4 w-4" />
              Cancel
            </Button>
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
            <Button
              type="button"
              onClick={saveIceSlot}
              disabled={!slotForm.date || !slotForm.start_time || !!slotTimeError || (slotForm.pricing_mode === 'fixed_price' && !slotForm.price)}
            >
              <Save className="h-4 w-4" />
              Save
            </Button>
            <Button type="button" variant="outline" onClick={() => { setSlotModalOpen(false); setEditSlot(null); setSlotForm(emptySlotForm); }}>
              <X className="h-4 w-4" />
              Cancel
            </Button>
          </>
        )}
      >
        <div className="grid grid-cols-1 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Slot Date</label>
            <Input type="date" value={slotForm.date} onChange={(event) => setSlotForm((current) => ({ ...current, date: event.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Slot Starts</label>
              <Input type="time" value={slotForm.start_time} onChange={(event) => setSlotForm((current) => ({ ...current, start_time: event.target.value }))} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Slot Ends</label>
              <Input type="time" min={slotForm.start_time || undefined} value={slotForm.end_time} onChange={(event) => setSlotForm((current) => ({ ...current, end_time: event.target.value }))} />
            </div>
          </div>
          {slotTimeError ? (
            <div className="text-xs font-medium text-rose-600 dark:text-rose-300">{slotTimeError}</div>
          ) : null}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[0.9fr_1.1fr_0.7fr]">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Pricing Mode</label>
              <Select value={slotForm.pricing_mode} onChange={(event) => setSlotForm((current) => ({ ...current, pricing_mode: event.target.value }))}>
                <option value="fixed_price">Fixed Price</option>
                <option value="call_for_pricing">Call for Pricing</option>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Price</label>
              <Input
                type="number"
                min="0"
                step="1"
                placeholder={slotForm.pricing_mode === 'fixed_price' ? 'Price in dollars' : 'No price required'}
                disabled={slotForm.pricing_mode !== 'fixed_price'}
                value={slotForm.price}
                onChange={(event) => setSlotForm((current) => ({ ...current, price: event.target.value }))}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Currency</label>
              <Select value={slotForm.currency} onChange={(event) => setSlotForm((current) => ({ ...current, currency: event.target.value }))}>
                {CURRENCIES.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
              </Select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Notes</label>
            <Input value={slotForm.notes} onChange={(event) => setSlotForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Notes" />
          </div>
        </div>
      </Modal>

      <Modal
        open={!!cancelSlotTarget}
        onClose={() => { setCancelSlotTarget(null); setCancelSlotForm(emptyActionForm); }}
        title="Cancel Slot"
        footer={(
          <>
            <Button type="button" variant="destructive" onClick={cancelSlot}>
              <XCircle className="h-4 w-4" />
              Cancel Slot
            </Button>
            <Button type="button" variant="outline" onClick={() => { setCancelSlotTarget(null); setCancelSlotForm(emptyActionForm); }}>
              <X className="h-4 w-4" />
              Keep Slot
            </Button>
          </>
        )}
      >
        <div className="grid grid-cols-1 gap-3">
          <div className="rounded-xl border border-slate-200 px-3 py-3 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-400">
            {cancelSlotTarget ? (
              <>
                <div className="font-medium text-slate-900 dark:text-slate-100">
                  {cancelSlotTarget.date ? formatShortDate(cancelSlotTarget.date) : 'Date TBD'} • {formatTimeHHMM(cancelSlotTarget.start_time) || cancelSlotTarget.start_time || 'Time TBD'}
                </div>
                <div className="mt-1">
                  {[cancelSlotTarget.arena_rink_name, cancelSlotTarget.title].filter(Boolean).join(' • ')}
                </div>
              </>
            ) : null}
          </div>
          <div className="text-sm text-slate-600 dark:text-slate-400">
            {cancelSlotTarget?.description}
          </div>
          <Textarea
            value={cancelSlotForm.response_message}
            onChange={(event) => setCancelSlotForm({ response_message: event.target.value })}
            placeholder="Arena note to both teams"
            rows={3}
          />
        </div>
      </Modal>

      <Modal
        open={!!acceptRequest}
        onClose={() => setAcceptRequest(null)}
        title="Accept Booking Request"
        footer={(
          <>
            <Button type="button" onClick={acceptBookingRequest}>
              <Check className="h-4 w-4" />
              Accept Request
            </Button>
            <Button type="button" variant="outline" onClick={() => setAcceptRequest(null)}>
              <X className="h-4 w-4" />
              Cancel
            </Button>
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
        open={!!bookedSlotTarget}
        onClose={() => setBookedSlotTarget(null)}
        title="Edit Locker Rooms"
        footer={(
          <>
            <Button type="button" onClick={saveEditedLockerRooms}>
              <Save className="h-4 w-4" />
              Save
            </Button>
            <Button type="button" variant="outline" onClick={() => setBookedSlotTarget(null)}>
              <X className="h-4 w-4" />
              Cancel
            </Button>
          </>
        )}
      >
        <div className="grid grid-cols-1 gap-3">
          <div className="rounded-xl border border-slate-200 px-3 py-3 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-400">
            {bookedSlotTarget ? (
              <>
                <div className="font-medium text-slate-900 dark:text-slate-100">{bookedSlotTarget.title}</div>
                <div className="mt-1">
                  {[bookedSlotTarget.arena_rink_name, bookedSlotTarget.date ? formatShortDate(bookedSlotTarget.date) : null, bookedSlotTarget.start_time ? formatTimeHHMM(bookedSlotTarget.start_time) || bookedSlotTarget.start_time : null].filter(Boolean).join(' • ')}
                </div>
              </>
            ) : null}
          </div>
          <Select value={lockerAssignForm.home_locker_room_id} onChange={(event) => setLockerAssignForm((current) => ({ ...current, home_locker_room_id: event.target.value }))}>
            <option value="">Home locker room</option>
            {editLockerRooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}
          </Select>
          {bookedSlotTarget?.away_team_id ? (
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
        title="Reject Booking Request"
        footer={(
          <>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                if (!actionRequest || !actionMode) return;
                void rejectBookingRequest(actionRequest);
              }}
            >
              <XCircle className="h-4 w-4" />
              Reject Request
            </Button>
            <Button type="button" variant="outline" onClick={() => { setActionRequest(null); setActionMode(null); setActionForm(emptyActionForm); }}>
              <X className="h-4 w-4" />
              Cancel
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
            placeholder="Note to requester"
            rows={3}
          />
        </div>
      </Modal>

    </div>
  );
}

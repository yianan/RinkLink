import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, Navigation, Pencil, Save, Trash2, UtensilsCrossed, Warehouse, X } from 'lucide-react';
import { api } from '../api/client';
import { Arena } from '../types';
import { useAuth } from '../context/AuthContext';
import PageHeader from '../components/PageHeader';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { useConfirmDialog } from '../context/ConfirmDialogContext';
import { useToast } from '../context/ToastContext';
import { mapsQueryUrl } from '../lib/maps';
import { canManageArena, canViewArenas } from '../lib/permissions';
import { accentLinkClass, destructiveIconButtonClass, focusRingClass, interactiveTitleClass, tableActionButtonClass } from '../lib/uiClasses';
import TeamLogo from '../components/TeamLogo';

const emptyForm = {
  name: '',
  address: '',
  city: '',
  state: '',
  zip_code: '',
  phone: '',
  contact_email: '',
  website: '',
  notes: '',
};

export default function ArenaListPage() {
  const navigate = useNavigate();
  const { authEnabled, me } = useAuth();
  const confirm = useConfirmDialog();
  const pushToast = useToast();
  const [arenas, setArenas] = useState<Arena[]>([]);
  const [open, setOpen] = useState(false);
  const [editArena, setEditArena] = useState<Arena | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [arenaLogoFile, setArenaLogoFile] = useState<File | null>(null);
  const [removeArenaLogo, setRemoveArenaLogo] = useState(false);
  const arenaVisible = !authEnabled || canViewArenas(me);
  const arenaEditable = !authEnabled || canManageArena(me);
  const arenaLogoPreviewUrl = useMemo(() => {
    if (!arenaLogoFile) {
      return removeArenaLogo ? null : (editArena?.logo_url ?? null);
    }
    return URL.createObjectURL(arenaLogoFile);
  }, [arenaLogoFile, editArena?.logo_url, removeArenaLogo]);

  const load = () => {
    api.getArenas().then(setArenas);
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!arenaLogoFile || !arenaLogoPreviewUrl) return;
    return () => URL.revokeObjectURL(arenaLogoPreviewUrl);
  }, [arenaLogoFile, arenaLogoPreviewUrl]);

  if (!arenaVisible) {
    return <Card className="p-6 text-sm text-slate-600 dark:text-slate-400">You do not have access to the arena directory.</Card>;
  }

  const setField = (key: keyof typeof emptyForm, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const openCreate = () => {
    setEditArena(null);
    setForm(emptyForm);
    setArenaLogoFile(null);
    setRemoveArenaLogo(false);
    setOpen(true);
  };

  const openEdit = (arena: Arena) => {
    setEditArena(arena);
    setForm({
      name: arena.name || '',
      address: arena.address || '',
      city: arena.city || '',
      state: arena.state || '',
      zip_code: arena.zip_code || '',
      phone: arena.phone || '',
      contact_email: arena.contact_email || '',
      website: arena.website || '',
      notes: arena.notes || '',
    });
    setArenaLogoFile(null);
    setRemoveArenaLogo(false);
    setOpen(true);
  };

  const saveArena = async () => {
    const payload = {
      ...form,
      website: form.website || null,
      notes: form.notes || null,
    };
    let savedArena: Arena;
    if (editArena) {
      savedArena = await api.updateArena(editArena.id, payload);
      if (removeArenaLogo && editArena.logo_url) {
        savedArena = await api.deleteArenaLogo(editArena.id);
      }
      pushToast({ variant: 'success', title: 'Arena updated' });
    } else {
      savedArena = await api.createArena(payload);
      pushToast({ variant: 'success', title: 'Arena created' });
    }
    if (arenaLogoFile) {
      await api.uploadArenaLogo(savedArena.id, arenaLogoFile);
    }
    setOpen(false);
    setEditArena(null);
    setForm(emptyForm);
    setArenaLogoFile(null);
    setRemoveArenaLogo(false);
    load();
  };

  const deleteArena = async (arena: Arena) => {
    const confirmed = await confirm({
      title: 'Delete arena?',
      description: 'This removes the arena, its rinks, locker rooms, and ice slots.',
      confirmLabel: 'Delete arena',
      confirmVariant: 'destructive',
    });
    if (!confirmed) return;
    try {
      await api.deleteArena(arena.id);
      pushToast({ variant: 'success', title: 'Arena deleted' });
      load();
    } catch (error) {
      pushToast({
        variant: 'error',
        title: 'Arena cannot be deleted',
        description: error instanceof Error ? error.message.replace(/^\d+:\s*/, '') : 'Reassign related events or proposals first.',
      });
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Arenas"
        subtitle="Manage arena records, then drill into each rink for locker rooms and ice slots."
        actions={arenaEditable ? (
          <Button type="button" onClick={openCreate}>
            <Warehouse className="h-4 w-4" />
            Add Arena
          </Button>
        ) : undefined}
      />

      <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
        {arenas.map((arena) => {
          const cityStateZip = [arena.city, arena.state, arena.zip_code].filter(Boolean).join(' ');
          const locationLabel = [arena.name, arena.address, cityStateZip].filter(Boolean).join(', ');
          const directionsUrl = locationLabel ? mapsQueryUrl(locationLabel) : null;
          const restaurantsUrl = locationLabel ? mapsQueryUrl(`restaurants near ${locationLabel}`) : null;
          const thingsUrl = locationLabel ? mapsQueryUrl(`things to do near ${locationLabel}`) : null;

          return (
            <Card key={arena.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <TeamLogo name={arena.name} logoUrl={arena.logo_url} className="h-12 w-12 rounded-2xl" initialsClassName="text-sm" />
                  <button
                    type="button"
                    className={`group min-w-0 flex-1 rounded-lg text-left ${focusRingClass}`}
                    onClick={() => navigate(`/arenas/${arena.id}`)}
                  >
                    <div className={`text-base font-semibold text-slate-900 dark:text-slate-100 ${interactiveTitleClass}`}>
                      {arena.name}
                    </div>
                    <div className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                      {[arena.city, arena.state].filter(Boolean).join(', ')}
                    </div>
                  </button>
                </div>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                  {directionsUrl ? (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className={tableActionButtonClass}
                      onClick={() => window.open(directionsUrl, '_blank', 'noopener,noreferrer')}
                      aria-label="Open directions"
                      title="Directions"
                    >
                      <Navigation className="h-4 w-4 text-slate-600 dark:text-slate-300" />
                    </Button>
                  ) : null}
                  {restaurantsUrl ? (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className={tableActionButtonClass}
                      onClick={() => window.open(restaurantsUrl, '_blank', 'noopener,noreferrer')}
                      aria-label="Open restaurants nearby"
                      title="Restaurants Nearby"
                    >
                      <UtensilsCrossed className="h-4 w-4 text-slate-600 dark:text-slate-300" />
                    </Button>
                  ) : null}
                  {thingsUrl ? (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className={tableActionButtonClass}
                      onClick={() => window.open(thingsUrl, '_blank', 'noopener,noreferrer')}
                      aria-label="Open things to do nearby"
                      title="Things To Do Nearby"
                    >
                      <MapPin className="h-4 w-4 text-slate-600 dark:text-slate-300" />
                    </Button>
                  ) : null}
                  {arenaEditable ? (
                    <>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className={tableActionButtonClass}
                        onClick={() => openEdit(arena)}
                        aria-label="Edit arena"
                        title="Edit arena"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className={`${tableActionButtonClass} ${destructiveIconButtonClass}`}
                        onClick={() => deleteArena(arena)}
                        aria-label="Delete arena"
                        title="Delete arena"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>
              <div className="mt-3 space-y-1.5 text-sm text-slate-600 dark:text-slate-400">
                <div className="line-clamp-2">{arena.address}</div>
                <div>{arena.rink_count} rink{arena.rink_count === 1 ? '' : 's'}</div>
                {arena.phone ? <div>{arena.phone}</div> : null}
                {arena.contact_email ? (
                  <div className="truncate">
                    <a
                      href={`mailto:${arena.contact_email}`}
                      className={accentLinkClass}
                    >
                      {arena.contact_email}
                    </a>
                  </div>
                ) : null}
              </div>
            </Card>
          );
        })}

        {arenas.length === 0 ? (
          <Card className="p-6 text-sm text-slate-600 dark:text-slate-400">
            No arenas yet. Create the first arena to start adding rinks, locker rooms, and slots.
          </Card>
        ) : null}
      </div>

      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          setArenaLogoFile(null);
          setRemoveArenaLogo(false);
        }}
        title={editArena ? 'Edit Arena' : 'Add Arena'}
        footer={(
          <>
            <Button type="button" onClick={saveArena} disabled={!form.name || !form.city || !form.state || !form.zip_code}>
              <Save className="h-4 w-4" />
              Save
            </Button>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              <X className="h-4 w-4" />
              Cancel
            </Button>
          </>
        )}
      >
        <div className="grid grid-cols-1 gap-3">
          <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-slate-950/35">
            <TeamLogo
              name={form.name || editArena?.name || ''}
              logoUrl={arenaLogoPreviewUrl}
              className="h-16 w-16 rounded-2xl"
              initialsClassName="text-lg"
            />
            <div className="min-w-0 flex-1">
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Arena Logo</label>
              <input
                type="file"
                accept=".png,.jpg,.jpeg,.webp,.svg"
                className="block w-full text-sm text-slate-700 file:mr-3 file:rounded-full file:border-0 file:bg-sky-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-sky-800 hover:file:bg-sky-200 dark:text-slate-300 dark:file:bg-sky-950/40 dark:file:text-sky-100 dark:hover:file:bg-sky-950/60"
                onChange={(event) => {
                  const nextFile = event.target.files?.[0] ?? null;
                  setArenaLogoFile(nextFile);
                  setRemoveArenaLogo(false);
                }}
              />
              {editArena?.logo_url || arenaLogoFile ? (
                <div className="mt-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setArenaLogoFile(null);
                      setRemoveArenaLogo(true);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                    Remove Logo
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Arena Name</label>
            <Input value={form.name} onChange={(event) => setField('name', event.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Address</label>
            <Input value={form.address} onChange={(event) => setField('address', event.target.value)} />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">City</label>
              <Input value={form.city} onChange={(event) => setField('city', event.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">State</label>
              <Input value={form.state} onChange={(event) => setField('state', event.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Zip</label>
              <Input value={form.zip_code} onChange={(event) => setField('zip_code', event.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Phone</label>
              <Input value={form.phone} onChange={(event) => setField('phone', event.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Contact Email</label>
              <Input value={form.contact_email} onChange={(event) => setField('contact_email', event.target.value)} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Website</label>
            <Input value={form.website} onChange={(event) => setField('website', event.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Notes</label>
            <Input value={form.notes} onChange={(event) => setField('notes', event.target.value)} />
          </div>
        </div>
      </Modal>
    </div>
  );
}

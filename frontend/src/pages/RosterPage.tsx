import { useEffect, useState } from 'react';
import { FileUp, Pencil, Plus, Trash2, Users } from 'lucide-react';
import { useTeam } from '../context/TeamContext';
import { useSeason } from '../context/SeasonContext';
import { api } from '../api/client';
import { Player } from '../types';
import RosterCsvUploader from '../components/RosterCsvUploader';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { Select } from '../components/ui/Select';
import PageHeader from '../components/PageHeader';
import SegmentedTabs from '../components/SegmentedTabs';
import EmptyState from '../components/EmptyState';
import { useConfirmDialog } from '../context/ConfirmDialogContext';
import { useToast } from '../context/ToastContext';
import { tableActionButtonClass } from '../lib/uiClasses';

const emptyForm = {
  first_name: '',
  last_name: '',
  jersey_number: '',
  position: '',
};

function positionBadgeVariant(position: string | null | undefined): 'info' | 'success' | 'warning' | 'neutral' {
  if (position === 'G') return 'info';
  if (position === 'D') return 'warning';
  if (position === 'F') return 'success';
  return 'neutral';
}

export default function RosterPage() {
  const { activeTeam } = useTeam();
  const { activeSeason, seasons } = useSeason();
  const effectiveSeason = activeSeason ?? seasons.find((season) => season.is_active) ?? seasons[0] ?? null;
  const [tab, setTab] = useState(0);
  const [players, setPlayers] = useState<Player[]>([]);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const confirm = useConfirmDialog();
  const pushToast = useToast();

  const load = () => {
    if (!activeTeam || !effectiveSeason) return;
    api.getPlayers(activeTeam.id, { season_id: effectiveSeason.id }).then(setPlayers);
  };

  useEffect(() => {
    load();
  }, [activeTeam, effectiveSeason]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleEdit = (p: Player) => {
    setEditId(p.id);
    setForm({
      first_name: p.first_name,
      last_name: p.last_name,
      jersey_number: p.jersey_number != null ? String(p.jersey_number) : '',
      position: p.position || '',
    });
    setOpen(true);
  };

  const handleSave = async () => {
    if (!activeTeam || !effectiveSeason) return;
    const payload = {
      season_id: effectiveSeason.id,
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      jersey_number: form.jersey_number ? Number(form.jersey_number) : null,
      position: form.position.trim() || null,
    };
    if (editId) {
      await api.updatePlayer(editId, payload);
    } else {
      await api.createPlayer(activeTeam.id, payload);
    }
    setOpen(false);
    setEditId(null);
    setForm({ ...emptyForm });
    load();
  };

  const handleDelete = async (id: string) => {
    const confirmed = await confirm({
      title: 'Delete player?',
      description: 'This removes the player from the current season roster.',
      confirmLabel: 'Delete player',
      confirmVariant: 'destructive',
    });
    if (!confirmed) return;
    await api.deletePlayer(id);
    load();
    pushToast({ variant: 'success', title: 'Player removed from roster' });
  };

  if (!activeTeam) {
    return <Alert variant="info">Select a team to manage the roster.</Alert>;
  }
  if (!effectiveSeason) {
    return <Alert variant="info">No season is available yet.</Alert>;
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Roster"
        subtitle={`Manage the ${effectiveSeason.name} Season roster and use it for stats tracking.`}
        actions={(
          <Button type="button" onClick={() => { setEditId(null); setForm({ ...emptyForm }); setOpen(true); }}>
            Add Player
          </Button>
        )}
      />

      <SegmentedTabs
        items={[
          { label: `Players (${players.length})`, value: 0 },
          { label: 'Upload CSV', value: 1 },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 0 && (
        <Card className="overflow-hidden">
          <div className="divide-y divide-slate-200 bg-white md:hidden dark:divide-slate-800 dark:bg-slate-950/20">
            {players.map((p) => (
              <div key={p.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-sm font-semibold text-slate-900 ring-1 ring-slate-200/80 dark:bg-slate-900/70 dark:text-slate-100 dark:ring-slate-800/80">
                        {p.jersey_number ?? '—'}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {p.first_name} {p.last_name}
                        </div>
                        <div className="mt-1">
                          <Badge variant={positionBadgeVariant(p.position)}>
                            {p.position === 'G' ? 'Goalie' : p.position === 'D' ? 'Defense' : p.position === 'F' ? 'Forward' : 'Unassigned'}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button type="button" variant="ghost" size="icon" onClick={() => handleEdit(p)} aria-label="Edit" className={tableActionButtonClass}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" onClick={() => handleDelete(p.id)} aria-label="Delete" className={tableActionButtonClass}>
                      <Trash2 className="h-4 w-4 text-rose-600" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}

              {players.length === 0 && (
                <div className="p-4">
                  <EmptyState
                    icon={<Users className="h-5 w-5" />}
                    title="No players yet"
                    description="Add players manually or upload a roster CSV."
                    actions={(
                      <>
                        <Button type="button" size="sm" onClick={() => { setEditId(null); setForm({ ...emptyForm }); setOpen(true); }}>
                          <Plus className="h-4 w-4" />
                          Add Player
                        </Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => setTab(1)}>
                          <FileUp className="h-4 w-4" />
                          Upload CSV
                        </Button>
                      </>
                    )}
                    className="border-0 shadow-none"
                  />
                </div>
              )}
          </div>

          <div className="hidden md:block">
            <table className="w-full table-fixed text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600 dark:bg-slate-900/40 dark:text-slate-300">
                <tr>
                  <th scope="col" className="w-20 px-4 py-3">#</th>
                  <th scope="col" className="w-[38%] px-4 py-3">Player</th>
                  <th scope="col" className="w-32 px-4 py-3">Position</th>
                  <th scope="col" className="w-28 px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-950/20">
                {players.map((p) => (
                  <tr key={p.id} className="align-top hover:bg-slate-50/60 dark:hover:bg-slate-900/40">
                    <td className="px-4 py-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-sm font-semibold text-slate-900 ring-1 ring-slate-200/80 dark:bg-slate-900/70 dark:text-slate-100 dark:ring-slate-800/80">
                        {p.jersey_number ?? '—'}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                      <div className="font-medium text-slate-900 dark:text-slate-100">
                        {p.first_name} {p.last_name}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                      <Badge variant={positionBadgeVariant(p.position)}>
                        {p.position === 'G' ? 'Goalie' : p.position === 'D' ? 'Defense' : p.position === 'F' ? 'Forward' : 'Unassigned'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Button type="button" variant="ghost" size="icon" onClick={() => handleEdit(p)} aria-label="Edit" className={tableActionButtonClass}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button type="button" variant="ghost" size="icon" onClick={() => handleDelete(p.id)} aria-label="Delete" className={tableActionButtonClass}>
                          <Trash2 className="h-4 w-4 text-rose-600" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}

                  {players.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-6">
                        <EmptyState
                          icon={<Users className="h-5 w-5" />}
                          title="No players yet"
                          description="Add players manually or upload a roster CSV."
                          actions={(
                            <>
                              <Button type="button" size="sm" onClick={() => { setEditId(null); setForm({ ...emptyForm }); setOpen(true); }}>
                                <Plus className="h-4 w-4" />
                                Add Player
                              </Button>
                              <Button type="button" size="sm" variant="outline" onClick={() => setTab(1)}>
                                <FileUp className="h-4 w-4" />
                                Upload CSV
                              </Button>
                            </>
                          )}
                          className="border-0 shadow-none"
                        />
                      </td>
                    </tr>
                  )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === 1 && (
        <RosterCsvUploader
          teamId={activeTeam.id}
          seasonId={effectiveSeason.id}
          seasonName={effectiveSeason.name}
          onConfirmed={() => { load(); setTab(0); }}
        />
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`${editId ? 'Edit' : 'Add'} Player`}
        footer={
          <>
            <Button type="button" onClick={handleSave} disabled={!form.first_name || !form.last_name}>
              Save
            </Button>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-3">
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-300">
            <Users className="h-4 w-4 text-slate-500 dark:text-slate-400" />
            <div className="truncate">
              Team: <span className="font-medium text-slate-900 dark:text-slate-100">{activeTeam.name}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">First Name</label>
              <Input value={form.first_name} onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Last Name</label>
              <Input value={form.last_name} onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Jersey #</label>
              <Input
                inputMode="numeric"
                value={form.jersey_number}
                onChange={(e) => setForm((f) => ({ ...f, jersey_number: e.target.value }))}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Position</label>
              <Select value={form.position} onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))}>
                <option value="">—</option>
                <option value="F">Forward (F)</option>
                <option value="D">Defense (D)</option>
                <option value="G">Goalie (G)</option>
              </Select>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}

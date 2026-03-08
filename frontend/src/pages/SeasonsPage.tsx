import { useState, useEffect } from 'react';
import { Pencil, Star, StarOff, Trash2 } from 'lucide-react';
import { useSeason } from '../context/SeasonContext';
import { api } from '../api/client';
import { Association, Season } from '../types';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { Select } from '../components/ui/Select';
import { useTeam } from '../context/TeamContext';
import PageHeader from '../components/PageHeader';

export default function SeasonsPage() {
  const { activeTeam } = useTeam();
  const { refreshSeasons: refreshGlobalSeasons } = useSeason();
  const [associations, setAssociations] = useState<Association[]>([]);
  const [selectedAssocId, setSelectedAssocId] = useState('');
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [editSeason, setEditSeason] = useState<Season | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: '', start_date: '', end_date: '' });
  const [error, setError] = useState('');

  // Load associations once
  useEffect(() => {
    api.getAssociations().then((data) => {
      setAssociations(data);
      // Default to active team's association if available
      if (activeTeam) {
        setSelectedAssocId(activeTeam.association_id);
      } else if (data.length > 0) {
        setSelectedAssocId(data[0].id);
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch seasons when association changes
  const loadSeasons = async () => {
    if (!selectedAssocId) {
      setSeasons([]);
      return;
    }
    const data = await api.getSeasons({ association_id: selectedAssocId });
    setSeasons(data);
  };

  useEffect(() => {
    loadSeasons();
  }, [selectedAssocId]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedAssocName = associations.find((a) => a.id === selectedAssocId)?.name || '';

  const openCreate = () => {
    setForm({ name: '', start_date: '', end_date: '' });
    setError('');
    setCreateOpen(true);
  };

  const openEdit = (s: Season) => {
    setForm({ name: s.name, start_date: s.start_date, end_date: s.end_date });
    setError('');
    setEditSeason(s);
  };

  const handleSave = async () => {
    setError('');
    try {
      if (editSeason) {
        await api.updateSeason(editSeason.id, form);
        setEditSeason(null);
      } else {
        await api.createSeason({ ...form, association_id: selectedAssocId, is_active: false });
        setCreateOpen(false);
      }
      await loadSeasons();
      await refreshGlobalSeasons();
    } catch (e) {
      setError(String(e));
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this season?')) return;
    try {
      await api.deleteSeason(id);
      await loadSeasons();
      await refreshGlobalSeasons();
    } catch (e) {
      setError(String(e));
    }
  };

  const handleToggleActive = async (s: Season) => {
    try {
      await api.updateSeason(s.id, { is_active: !s.is_active });
      await loadSeasons();
      await refreshGlobalSeasons();
    } catch (e) {
      setError(String(e));
    }
  };

  const modalOpen = createOpen || !!editSeason;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Seasons"
        subtitle={`Manage seasons${selectedAssocName ? ` for ${selectedAssocName}` : ''}.`}
        actions={<Button type="button" onClick={openCreate} disabled={!selectedAssocId}>Create Season</Button>}
      />

      <div className="flex items-center gap-2">
        <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Association</label>
        <div className="w-full max-w-xs">
          <Select
            value={selectedAssocId}
            onChange={(e) => setSelectedAssocId(e.target.value)}
          >
            <option value="" disabled>Select association…</option>
            {associations.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </Select>
        </div>
      </div>

      {error && <Alert variant="error">{error}</Alert>}

      {!selectedAssocId ? (
        <Alert variant="info">Select an association to view its seasons.</Alert>
      ) : (
        <Card className="overflow-hidden">
          <div className="divide-y divide-slate-200 bg-white md:hidden dark:divide-slate-800 dark:bg-slate-950/20">
            {seasons.map((s) => (
              <div key={s.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{s.name}</div>
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {s.start_date} — {s.end_date}
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      {s.is_active ? <Badge variant="success">Active</Badge> : <Badge variant="neutral">Inactive</Badge>}
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {s.game_count} {s.game_count === 1 ? 'game' : 'games'}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleToggleActive(s)}
                      aria-label={s.is_active ? 'Deactivate' : 'Set Active'}
                    >
                      {s.is_active
                        ? <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                        : <StarOff className="h-4 w-4 text-slate-400" />}
                    </Button>
                    <Button type="button" variant="ghost" size="icon" onClick={() => openEdit(s)} aria-label="Edit">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(s.id)}
                      disabled={s.game_count > 0}
                      aria-label="Delete"
                      title={s.game_count > 0 ? `Cannot delete: ${s.game_count} game(s) exist` : 'Delete season'}
                    >
                      <Trash2 className="h-4 w-4 text-rose-600" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
            {seasons.length === 0 && (
              <div className="px-4 py-10 text-center text-sm text-slate-600 dark:text-slate-400">
                No seasons yet. Create one to get started.
              </div>
            )}
          </div>

          <div className="hidden md:block">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600 dark:bg-slate-900/40 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Start Date</th>
                  <th className="px-4 py-3">End Date</th>
                  <th className="px-4 py-3 text-center">Games</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-950/20">
                {seasons.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-900/40">
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{s.name}</td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{s.start_date}</td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{s.end_date}</td>
                    <td className="px-4 py-3 text-center text-slate-700 dark:text-slate-300">{s.game_count}</td>
                    <td className="px-4 py-3">
                      {s.is_active ? <Badge variant="success">Active</Badge> : <Badge variant="neutral">Inactive</Badge>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleToggleActive(s)}
                          aria-label={s.is_active ? 'Deactivate' : 'Set Active'}
                        >
                          {s.is_active
                            ? <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                            : <StarOff className="h-4 w-4 text-slate-400" />}
                        </Button>
                        <Button type="button" variant="ghost" size="icon" onClick={() => openEdit(s)} aria-label="Edit">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(s.id)}
                          disabled={s.game_count > 0}
                          aria-label="Delete"
                          title={s.game_count > 0 ? `Cannot delete: ${s.game_count} game(s) exist` : 'Delete season'}
                        >
                          <Trash2 className="h-4 w-4 text-rose-600" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {seasons.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-600 dark:text-slate-400">
                      No seasons yet. Create one to get started.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal
        open={modalOpen}
        onClose={() => { setCreateOpen(false); setEditSeason(null); }}
        title={editSeason ? 'Edit Season' : 'Create Season'}
        footer={
          <>
            <Button type="button" onClick={handleSave} disabled={!form.name || !form.start_date || !form.end_date}>
              {editSeason ? 'Save' : 'Create'}
            </Button>
            <Button type="button" variant="outline" onClick={() => { setCreateOpen(false); setEditSeason(null); }}>
              Cancel
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Name</label>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g., 2025-2026 Winter"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Start Date</label>
              <Input
                type="date"
                value={form.start_date}
                onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">End Date</label>
              <Input
                type="date"
                value={form.end_date}
                onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
              />
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}

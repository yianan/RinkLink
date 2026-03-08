import { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pencil, Trash2 } from 'lucide-react';
import { api } from '../api/client';
import { Association, Team } from '../types';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { useTeam } from '../context/TeamContext';

const emptyForm = { name: '', home_rink_address: '', city: '', state: '', zip_code: '' };

export default function AssociationListPage() {
  const navigate = useNavigate();
  const { setActiveTeam } = useTeam();
  const [associations, setAssociations] = useState<Association[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const load = async () => {
    const [a, t] = await Promise.all([api.getAssociations(), api.getTeams()]);
    setAssociations(a);
    setTeams(t);
  };
  useEffect(() => { load(); }, []);

  const teamsByAssociation = useMemo(() => {
    const by: Record<string, Team[]> = {};
    for (const t of teams) {
      (by[t.association_id] ||= []).push(t);
    }
    for (const ts of Object.values(by)) {
      ts.sort((a, b) => a.name.localeCompare(b.name));
    }
    return by;
  }, [teams]);

  const handleSave = async () => {
    if (editId) {
      await api.updateAssociation(editId, form);
    } else {
      await api.createAssociation(form);
    }
    setOpen(false);
    setEditId(null);
    setForm(emptyForm);
    load();
  };

  const handleEdit = (a: Association) => {
    setEditId(a.id);
    setForm({ name: a.name, home_rink_address: a.home_rink_address, city: a.city, state: a.state, zip_code: a.zip_code });
    setOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Delete this association and all its teams?')) {
      await api.deleteAssociation(id);
      load();
    }
  };

  const setField = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const openTeamDashboard = (team: Team) => {
    setActiveTeam(team);
    navigate('/');
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="page-title">Associations</div>
          <div className="page-subtitle">Organizations that manage teams.</div>
        </div>
        <Button type="button" onClick={() => { setEditId(null); setForm(emptyForm); setOpen(true); }}>
          Add Association
        </Button>
      </div>

      <Card className="overflow-hidden">
        <div className="divide-y divide-slate-200 bg-white md:hidden dark:divide-slate-800 dark:bg-slate-950/20">
          {associations.map((a) => {
            const assocTeams = teamsByAssociation[a.id] || [];
            const extraTeams = Math.max(0, assocTeams.length - 3);

            return (
              <div key={a.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{a.name}</div>
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {a.city}, {a.state} {a.zip_code}
                    </div>
                    <div className="mt-2 text-xs text-slate-600 dark:text-slate-400">Teams: {assocTeams.length}</div>
                    {assocTeams.length ? (
                      <div className="mt-1 space-y-1">
                        {assocTeams.slice(0, 3).map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => openTeamDashboard(t)}
                            className="block cursor-pointer truncate text-left text-xs font-medium text-brand-700 hover:text-brand-800 dark:text-cyan-300 dark:hover:text-cyan-200"
                          >
                            {t.name}
                          </button>
                        ))}
                        {extraTeams ? (
                          <div className="text-xs text-slate-500 dark:text-slate-400">+ {extraTeams} more</div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-1">
                    <Button type="button" variant="ghost" size="icon" onClick={() => handleEdit(a)} aria-label="Edit">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" onClick={() => handleDelete(a.id)} aria-label="Delete">
                      <Trash2 className="h-4 w-4 text-rose-600" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}

          {associations.length === 0 && (
            <div className="px-4 py-10 text-center text-sm text-slate-600 dark:text-slate-400">
              No associations yet. Add one or seed demo data.
            </div>
          )}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600 dark:bg-slate-900/40 dark:text-slate-300">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">City</th>
                <th className="px-4 py-3">State</th>
                <th className="px-4 py-3">Zip</th>
                <th className="px-4 py-3">Teams</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-950/20">
              {associations.map((a) => (
                <tr key={a.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-900/40">
                  <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{a.name}</td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{a.city}</td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{a.state}</td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{a.zip_code}</td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                    {teamsByAssociation[a.id]?.length ? (
                      <div className="space-y-1">
                        {teamsByAssociation[a.id].map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => openTeamDashboard(t)}
                            className="block cursor-pointer truncate text-left font-medium text-brand-700 hover:text-brand-800 dark:text-cyan-300 dark:hover:text-cyan-200"
                          >
                            {t.name}
                          </button>
                        ))}
                      </div>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button type="button" variant="ghost" size="icon" onClick={() => handleEdit(a)} aria-label="Edit">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" onClick={() => handleDelete(a.id)} aria-label="Delete">
                        <Trash2 className="h-4 w-4 text-rose-600" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}

              {associations.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-600 dark:text-slate-400">
                    No associations yet. Add one or seed demo data.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`${editId ? 'Edit' : 'Add'} Association`}
        footer={
          <>
            <Button type="button" onClick={handleSave} disabled={!form.name}>
              Save
            </Button>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Name</label>
            <Input value={form.name} onChange={(e) => setField('name', e.target.value)} required />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Home Rink Address</label>
            <Input value={form.home_rink_address} onChange={(e) => setField('home_rink_address', e.target.value)} />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="sm:col-span-1">
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">City</label>
              <Input value={form.city} onChange={(e) => setField('city', e.target.value)} />
            </div>
            <div className="sm:col-span-1">
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">State</label>
              <Input value={form.state} onChange={(e) => setField('state', e.target.value)} />
            </div>
            <div className="sm:col-span-1">
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Zip</label>
              <Input value={form.zip_code} onChange={(e) => setField('zip_code', e.target.value)} />
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}

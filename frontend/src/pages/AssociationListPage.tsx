import { useMemo, useState, useEffect } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { api } from '../api/client';
import { Association, Team } from '../types';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';

const emptyForm = { name: '', home_rink_address: '', city: '', state: '', zip_code: '', league_affiliation: '' };

export default function AssociationListPage() {
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
    setForm({ name: a.name, home_rink_address: a.home_rink_address, city: a.city, state: a.state, zip_code: a.zip_code, league_affiliation: a.league_affiliation || '' });
    setOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Delete this association and all its teams?')) {
      await api.deleteAssociation(id);
      load();
    }
  };

  const setField = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

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
        <div className="overflow-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">City</th>
                <th className="px-4 py-3">State</th>
                <th className="px-4 py-3">Zip</th>
                <th className="px-4 py-3">League</th>
                <th className="px-4 py-3">Teams</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {associations.map((a) => (
                <tr key={a.id} className="hover:bg-slate-50/60">
                  <td className="px-4 py-3 font-medium text-slate-900">{a.name}</td>
                  <td className="px-4 py-3 text-slate-700">{a.city}</td>
                  <td className="px-4 py-3 text-slate-700">{a.state}</td>
                  <td className="px-4 py-3 text-slate-700">{a.zip_code}</td>
                  <td className="px-4 py-3 text-slate-700">{a.league_affiliation || '-'}</td>
                  <td className="px-4 py-3 text-slate-700">
                    {teamsByAssociation[a.id]?.length ? (
                      <div className="space-y-1">
                        {teamsByAssociation[a.id].map((t) => (
                          <div key={t.id} className="truncate">
                            {t.name}{' '}
                            <span className="text-xs text-slate-500">
                              ({t.age_group} {t.level})
                            </span>
                          </div>
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
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-600">
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
            <label className="mb-1 block text-xs font-medium text-slate-600">Name</label>
            <Input value={form.name} onChange={(e) => setField('name', e.target.value)} required />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Home Rink Address</label>
            <Input value={form.home_rink_address} onChange={(e) => setField('home_rink_address', e.target.value)} />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="sm:col-span-1">
              <label className="mb-1 block text-xs font-medium text-slate-600">City</label>
              <Input value={form.city} onChange={(e) => setField('city', e.target.value)} />
            </div>
            <div className="sm:col-span-1">
              <label className="mb-1 block text-xs font-medium text-slate-600">State</label>
              <Input value={form.state} onChange={(e) => setField('state', e.target.value)} />
            </div>
            <div className="sm:col-span-1">
              <label className="mb-1 block text-xs font-medium text-slate-600">Zip</label>
              <Input value={form.zip_code} onChange={(e) => setField('zip_code', e.target.value)} />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">League Affiliation</label>
            <Input value={form.league_affiliation} onChange={(e) => setField('league_affiliation', e.target.value)} />
          </div>
        </div>
      </Modal>
    </div>
  );
}

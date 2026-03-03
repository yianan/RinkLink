import { useState, useEffect } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { api } from '../api/client';
import { Team, Association } from '../types';
import { useTeam } from '../context/TeamContext';
import AgeLevelSelect from '../components/AgeLevelSelect';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { Select } from '../components/ui/Select';

const emptyForm = {
  association_id: '', name: '', age_group: '', level: '',
  manager_name: '', manager_email: '', manager_phone: '',
  rink_city: '', rink_state: '', rink_zip: '',
  myhockey_ranking: '' as string,
};

export default function TeamListPage() {
  const { refreshTeams } = useTeam();
  const [teams, setTeams] = useState<Team[]>([]);
  const [associations, setAssociations] = useState<Association[]>([]);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const load = () => {
    api.getTeams().then(setTeams);
    api.getAssociations().then(setAssociations);
  };
  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    const data = {
      ...form,
      myhockey_ranking: form.myhockey_ranking ? parseInt(form.myhockey_ranking) : null,
    };
    if (editId) {
      await api.updateTeam(editId, data);
    } else {
      await api.createTeam(data);
    }
    setOpen(false);
    setEditId(null);
    setForm(emptyForm);
    load();
    refreshTeams();
  };

  const handleEdit = (t: Team) => {
    setEditId(t.id);
    setForm({
      association_id: t.association_id, name: t.name, age_group: t.age_group, level: t.level,
      manager_name: t.manager_name, manager_email: t.manager_email, manager_phone: t.manager_phone,
      rink_city: t.rink_city, rink_state: t.rink_state, rink_zip: t.rink_zip,
      myhockey_ranking: t.myhockey_ranking?.toString() || '',
    });
    setOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Delete this team?')) {
      await api.deleteTeam(id);
      load();
      refreshTeams();
    }
  };

  const setField = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="page-title">Teams</div>
          <div className="page-subtitle">Create teams and manage contact details.</div>
        </div>
        <Button type="button" onClick={() => { setEditId(null); setForm(emptyForm); setOpen(true); }}>
          Add Team
        </Button>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Association</th>
                <th className="px-4 py-3">Age</th>
                <th className="px-4 py-3">Level</th>
                <th className="px-4 py-3">Ranking</th>
                <th className="px-4 py-3">Manager</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {teams.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50/60">
                  <td className="px-4 py-3 font-medium text-slate-900">{t.name}</td>
                  <td className="px-4 py-3 text-slate-700">{t.association_name}</td>
                  <td className="px-4 py-3 text-slate-700">{t.age_group}</td>
                  <td className="px-4 py-3 text-slate-700">{t.level}</td>
                  <td className="px-4 py-3 text-slate-700">{t.myhockey_ranking ?? '-'}</td>
                  <td className="px-4 py-3 text-slate-700">{t.manager_name}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button type="button" variant="ghost" size="icon" onClick={() => handleEdit(t)} aria-label="Edit">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" onClick={() => handleDelete(t.id)} aria-label="Delete">
                        <Trash2 className="h-4 w-4 text-rose-600" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}

              {teams.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-600">
                    No teams yet. Add one or seed demo data.
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
        title={`${editId ? 'Edit' : 'Add'} Team`}
        footer={
          <>
            <Button
              type="button"
              onClick={handleSave}
              disabled={!form.name || !form.association_id || !form.age_group || !form.level}
            >
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
            <label className="mb-1 block text-xs font-medium text-slate-600">Association</label>
            <Select
              value={form.association_id}
              onChange={(e) => setField('association_id', e.target.value)}
              required
              disabled={!!editId}
            >
              <option value="" disabled>
                Select association…
              </option>
              {associations.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Team Name</label>
            <Input value={form.name} onChange={(e) => setField('name', e.target.value)} required />
          </div>

          <AgeLevelSelect
            ageGroup={form.age_group}
            level={form.level}
            onAgeGroupChange={(v) => setField('age_group', v)}
            onLevelChange={(v) => setField('level', v)}
          />

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Manager Name</label>
            <Input value={form.manager_name} onChange={(e) => setField('manager_name', e.target.value)} />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Email</label>
              <Input value={form.manager_email} onChange={(e) => setField('manager_email', e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Phone</label>
              <Input value={form.manager_phone} onChange={(e) => setField('manager_phone', e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="sm:col-span-1">
              <label className="mb-1 block text-xs font-medium text-slate-600">Rink City</label>
              <Input value={form.rink_city} onChange={(e) => setField('rink_city', e.target.value)} />
            </div>
            <div className="sm:col-span-1">
              <label className="mb-1 block text-xs font-medium text-slate-600">State</label>
              <Input value={form.rink_state} onChange={(e) => setField('rink_state', e.target.value)} />
            </div>
            <div className="sm:col-span-1">
              <label className="mb-1 block text-xs font-medium text-slate-600">Zip</label>
              <Input value={form.rink_zip} onChange={(e) => setField('rink_zip', e.target.value)} />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">MyHockey Ranking</label>
            <Input
              type="number"
              inputMode="numeric"
              value={form.myhockey_ranking}
              onChange={(e) => setField('myhockey_ranking', e.target.value)}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}

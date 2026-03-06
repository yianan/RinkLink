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
  wins: '' as string,
  losses: '' as string,
  ties: '' as string,
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
      wins: form.wins ? parseInt(form.wins) : 0,
      losses: form.losses ? parseInt(form.losses) : 0,
      ties: form.ties ? parseInt(form.ties) : 0,
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
      wins: t.wins?.toString() || '0',
      losses: t.losses?.toString() || '0',
      ties: t.ties?.toString() || '0',
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
        <div className="divide-y divide-slate-200 bg-white md:hidden dark:divide-slate-800 dark:bg-slate-950/20">
          {teams.map((t) => (
            <div key={t.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{t.name}</div>
                  <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{t.association_name || '—'}</div>

                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
                    <span className="whitespace-nowrap">
                      {t.age_group} {t.level}
                    </span>
                    <span className="whitespace-nowrap">Ranking: {t.myhockey_ranking ?? '—'}</span>
                    <span className="whitespace-nowrap font-medium text-slate-700 dark:text-slate-300">
                      {t.wins}-{t.losses}-{t.ties}
                    </span>
                  </div>

                  {(t.manager_name || t.manager_email) && (
                    <div className="mt-2 text-sm text-slate-700 dark:text-slate-300">
                      {t.manager_email ? (
                        <a
                          href={`mailto:${t.manager_email}`}
                          className="text-brand-700 hover:underline dark:text-cyan-300 dark:hover:text-cyan-200"
                        >
                          {t.manager_name || 'Email'}
                        </a>
                      ) : (
                        <span className="text-slate-900 dark:text-slate-100">{t.manager_name}</span>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  <Button type="button" variant="ghost" size="icon" onClick={() => handleEdit(t)} aria-label="Edit">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" onClick={() => handleDelete(t.id)} aria-label="Delete">
                    <Trash2 className="h-4 w-4 text-rose-600" />
                  </Button>
                </div>
              </div>
            </div>
          ))}

          {teams.length === 0 && (
            <div className="px-4 py-10 text-center text-sm text-slate-600 dark:text-slate-400">
              No teams yet. Add one or seed demo data.
            </div>
          )}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600 dark:bg-slate-900/40 dark:text-slate-300">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Association</th>
                <th className="px-4 py-3">Age</th>
                <th className="px-4 py-3">Level</th>
                <th className="px-4 py-3">Ranking</th>
                <th className="px-4 py-3">Record</th>
                <th className="px-4 py-3">Manager</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-950/20">
              {teams.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-900/40">
                  <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{t.name}</td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{t.association_name}</td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{t.age_group}</td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{t.level}</td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{t.myhockey_ranking ?? '-'}</td>
                  <td className="px-4 py-3 font-medium text-slate-700 dark:text-slate-300">{t.wins}-{t.losses}-{t.ties}</td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                    {t.manager_name ? (
                      t.manager_email ? (
                        <a
                          href={`mailto:${t.manager_email}`}
                          className="text-slate-900 underline underline-offset-2 hover:text-slate-950 dark:text-slate-100 dark:hover:text-white"
                        >
                          {t.manager_name}
                        </a>
                      ) : (
                        <span className="text-slate-900 dark:text-slate-100">{t.manager_name}</span>
                      )
                    ) : t.manager_email ? (
                      <a
                        href={`mailto:${t.manager_email}`}
                        className="text-slate-900 underline underline-offset-2 hover:text-slate-950 dark:text-slate-100 dark:hover:text-white"
                      >
                        Email
                      </a>
                    ) : (
                      '-'
                    )}
                  </td>
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
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-600 dark:text-slate-400">
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
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Association</label>
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
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Team Name</label>
            <Input value={form.name} onChange={(e) => setField('name', e.target.value)} required />
          </div>

          <AgeLevelSelect
            ageGroup={form.age_group}
            level={form.level}
            onAgeGroupChange={(v) => setField('age_group', v)}
            onLevelChange={(v) => setField('level', v)}
          />

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Manager Name</label>
            <Input value={form.manager_name} onChange={(e) => setField('manager_name', e.target.value)} />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Email</label>
              <Input value={form.manager_email} onChange={(e) => setField('manager_email', e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Phone</label>
              <Input value={form.manager_phone} onChange={(e) => setField('manager_phone', e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="sm:col-span-1">
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Rink City</label>
              <Input value={form.rink_city} onChange={(e) => setField('rink_city', e.target.value)} />
            </div>
            <div className="sm:col-span-1">
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">State</label>
              <Input value={form.rink_state} onChange={(e) => setField('rink_state', e.target.value)} />
            </div>
            <div className="sm:col-span-1">
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Zip</label>
              <Input value={form.rink_zip} onChange={(e) => setField('rink_zip', e.target.value)} />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">MyHockey Ranking</label>
            <Input
              type="number"
              inputMode="numeric"
              value={form.myhockey_ranking}
              onChange={(e) => setField('myhockey_ranking', e.target.value)}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Record (W-L-T)</label>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  value={form.wins}
                  onChange={(e) => setField('wins', e.target.value)}
                  placeholder="W"
                />
              </div>
              <div>
                <Input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  value={form.losses}
                  onChange={(e) => setField('losses', e.target.value)}
                  placeholder="L"
                />
              </div>
              <div>
                <Input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  value={form.ties}
                  onChange={(e) => setField('ties', e.target.value)}
                  placeholder="T"
                />
              </div>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}

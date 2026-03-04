import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ExternalLink, Map, Pencil, Trash2, Utensils } from 'lucide-react';
import { api } from '../api/client';
import { Rink } from '../types';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';

const emptyForm = { name: '', address: '', city: '', state: '', zip_code: '', phone: '', contact_email: '', website: '' };

function mapsQueryUrl(query: string) {
  const url = new URL('https://www.google.com/maps/search/');
  url.searchParams.set('api', '1');
  url.searchParams.set('query', query);
  return url.toString();
}

export default function RinkListPage() {
  const navigate = useNavigate();
  const [rinks, setRinks] = useState<Rink[]>([]);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const load = () => api.getRinks().then(setRinks);
  useEffect(() => { load(); }, []);

  const setField = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    const payload = { ...form, website: form.website || null };
    if (editId) {
      await api.updateRink(editId, payload);
    } else {
      await api.createRink(payload);
    }
    setOpen(false);
    load();
  };

  const handleEdit = (r: Rink) => {
    setEditId(r.id);
    setForm({
      name: r.name, address: r.address, city: r.city, state: r.state,
      zip_code: r.zip_code, phone: r.phone, contact_email: r.contact_email,
      website: r.website ?? '',
    });
    setOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Delete this rink and all its ice slots?')) {
      await api.deleteRink(id);
      load();
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="page-title">Rinks</div>
          <div className="page-subtitle">Manage rinks and their ice slots.</div>
        </div>
        <Button type="button" onClick={() => { setEditId(null); setForm(emptyForm); setOpen(true); }}>
          Add Rink
        </Button>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-max min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Address</th>
                <th className="px-4 py-3 whitespace-nowrap">Phone</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {rinks.map((r) => (
                <tr
                  key={r.id}
                  className="cursor-pointer hover:bg-slate-50/60"
                  onClick={() => navigate(`/rinks/${r.id}/slots`)}
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{r.name}</div>
                    {r.website && (
                      <a
                        href={r.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-0.5 inline-flex items-center gap-1 text-xs text-brand-600 hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ExternalLink className="h-3 w-3" />
                        {r.website.replace(/^https?:\/\//, '')}
                      </a>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    <div>{r.address}</div>
                    <div className="text-xs text-slate-500">{r.city}, {r.state} {r.zip_code}</div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-slate-700">{r.phone}</td>
                  <td className="px-4 py-3 text-slate-700">{r.contact_email}</td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          const label = [r.name, r.address, `${r.city}, ${r.state} ${r.zip_code}`].filter(Boolean).join(', ');
                          window.open(mapsQueryUrl(`restaurants near ${label}`), '_blank', 'noopener,noreferrer');
                        }}
                        aria-label="Restaurants nearby"
                      >
                        <Utensils className="h-4 w-4 text-slate-600" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          const label = [r.name, r.address, `${r.city}, ${r.state} ${r.zip_code}`].filter(Boolean).join(', ');
                          window.open(mapsQueryUrl(`things to do near ${label}`), '_blank', 'noopener,noreferrer');
                        }}
                        aria-label="Things to do nearby"
                      >
                        <Map className="h-4 w-4 text-slate-600" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" onClick={() => handleEdit(r)} aria-label="Edit">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" onClick={() => handleDelete(r.id)} aria-label="Delete">
                        <Trash2 className="h-4 w-4 text-rose-600" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}

              {rinks.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-600">
                    No rinks yet. Add one or seed demo data.
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
        title={`${editId ? 'Edit' : 'Add'} Rink`}
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
            <label className="mb-1 block text-xs font-medium text-slate-600">Address</label>
            <Input value={form.address} onChange={(e) => setField('address', e.target.value)} />
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Phone</label>
              <Input value={form.phone} onChange={(e) => setField('phone', e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Contact Email</label>
              <Input value={form.contact_email} onChange={(e) => setField('contact_email', e.target.value)} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Website</label>
            <Input
              value={form.website}
              onChange={(e) => setField('website', e.target.value)}
              placeholder="https://..."
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}

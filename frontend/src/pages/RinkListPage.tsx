import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Map, Pencil, Trash2, Utensils } from 'lucide-react';
import { api } from '../api/client';
import { Rink } from '../types';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import FilterPillGroup, { type FilterOption } from '../components/FilterPillGroup';
import { FilterPanel, FilterPanelTrigger } from '../components/FilterPanel';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import PageHeader from '../components/PageHeader';
import { CardListSkeleton, TableSkeleton } from '../components/ui/TableSkeleton';
import { cn } from '../lib/cn';
import { accentLinkClass, tableActionButtonClass } from '../lib/uiClasses';
import { useConfirmDialog } from '../context/ConfirmDialogContext';
import { useToast } from '../context/ToastContext';

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
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [selectedCities, setSelectedCities] = useState<string[]>([]);
  const [selectedStates, setSelectedStates] = useState<string[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const confirm = useConfirmDialog();
  const pushToast = useToast();

  const load = () => {
    let cancelled = false;
    setLoading(true);
    api.getRinks()
      .then((data) => {
        if (!cancelled) setRinks(data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  };
  useEffect(() => load(), []);

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
    const confirmed = await confirm({
      title: 'Delete rink?',
      description: 'This removes the rink and all related ice slots.',
      confirmLabel: 'Delete rink',
      confirmVariant: 'destructive',
    });
    if (!confirmed) return;
    await api.deleteRink(id);
    load();
    pushToast({ variant: 'success', title: 'Rink deleted' });
  };

  const cityOptions = useMemo<FilterOption[]>(
    () =>
      Array.from(new Set(rinks.map((rink) => rink.city).filter(Boolean)))
        .sort((left, right) => left.localeCompare(right))
        .map((city) => ({ value: city, label: city })),
    [rinks],
  );

  const stateOptions = useMemo<FilterOption[]>(
    () =>
      Array.from(new Set(rinks.map((rink) => rink.state).filter(Boolean)))
        .sort((left, right) => left.localeCompare(right))
        .map((state) => ({ value: state, label: state })),
    [rinks],
  );

  const filteredRinks = useMemo(
    () =>
      rinks.filter(
        (rink) =>
          (selectedCities.length === 0 || selectedCities.includes(rink.city)) &&
          (selectedStates.length === 0 || selectedStates.includes(rink.state)),
      ),
    [rinks, selectedCities, selectedStates],
  );

  const activeFilterBadges = useMemo(() => {
    const labelsFor = (options: FilterOption[], selectedValues: string[]) =>
      options.filter((option) => selectedValues.includes(option.value)).map((option) => option.label);
    return [
      ...labelsFor(cityOptions, selectedCities),
      ...labelsFor(stateOptions, selectedStates),
    ];
  }, [cityOptions, selectedCities, stateOptions, selectedStates]);

  const hasActiveFilters = activeFilterBadges.length > 0;

  const clearFilters = () => {
    setSelectedCities([]);
    setSelectedStates([]);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Rinks"
        subtitle="Manage rinks and their ice slots."
        actions={(
          <>
            <FilterPanelTrigger count={activeFilterBadges.length} onClick={() => setFiltersOpen((open) => !open)} />
            <Button type="button" onClick={() => { setEditId(null); setForm(emptyForm); setOpen(true); }}>
              Add Rink
            </Button>
          </>
        )}
      />

      <FilterPanel
        title="Filter rinks"
        description="Narrow the list by city and state."
        open={filtersOpen}
        badges={activeFilterBadges}
        onClear={clearFilters}
      >
        {cityOptions.length > 0 ? (
          <FilterPillGroup
            label="City"
            options={cityOptions}
            values={selectedCities}
            onChange={setSelectedCities}
            tone="sky"
          />
        ) : null}
        {stateOptions.length > 0 ? (
          <FilterPillGroup
            label="State"
            options={stateOptions}
            values={selectedStates}
            onChange={setSelectedStates}
            tone="violet"
          />
        ) : null}
      </FilterPanel>

      <Card>
        <div className="divide-y divide-slate-200 overflow-hidden rounded-2xl bg-white md:hidden dark:divide-slate-800 dark:bg-slate-950/20">
          {filteredRinks.map((r) => (
            <div
              key={r.id}
              role="button"
              tabIndex={0}
              className="p-4 transition-colors hover:bg-slate-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50 dark:hover:bg-slate-900/40 dark:focus-visible:ring-offset-slate-950"
              onClick={() => navigate(`/rinks/${r.id}/slots`)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') navigate(`/rinks/${r.id}/slots`);
                if (e.key === ' ') {
                  e.preventDefault();
                  navigate(`/rinks/${r.id}/slots`);
                }
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium text-slate-900 dark:text-slate-100">
                    {r.website ? (
                      <a
                        href={r.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={accentLinkClass}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {r.name}
                      </a>
                    ) : (
                      r.name
                    )}
                  </div>
                  <div className="mt-1 text-sm text-slate-700 dark:text-slate-300">{r.address}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {r.city}, {r.state} {r.zip_code}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
                    {r.phone ? <span className="whitespace-nowrap">{r.phone}</span> : null}
                    {r.contact_email ? (
                      <a
                        href={`mailto:${r.contact_email}`}
                        className={cn('break-all', accentLinkClass)}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {r.contact_email}
                      </a>
                    ) : null}
                  </div>
                </div>

                <div className="flex flex-wrap justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      const label = [r.name, r.address, `${r.city}, ${r.state} ${r.zip_code}`].filter(Boolean).join(', ');
                      window.open(mapsQueryUrl(`restaurants near ${label}`), '_blank', 'noopener,noreferrer');
                    }}
                    aria-label="Restaurants nearby"
                    className={tableActionButtonClass}
                  >
                    <Utensils className="h-4 w-4 text-slate-600 dark:text-slate-300" />
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
                    className={tableActionButtonClass}
                  >
                    <Map className="h-4 w-4 text-slate-600 dark:text-slate-300" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" onClick={() => handleEdit(r)} aria-label="Edit" className={tableActionButtonClass}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" onClick={() => handleDelete(r.id)} aria-label="Delete" className={tableActionButtonClass}>
                    <Trash2 className="h-4 w-4 text-rose-600" />
                  </Button>
                </div>
              </div>
            </div>
          ))}

          {loading && (
            <CardListSkeleton count={3} />
          )}
          {!loading && rinks.length === 0 && (
            <div className="px-4 py-10 text-center text-sm text-slate-600 dark:text-slate-400">
              No rinks yet. Add one or seed demo data.
            </div>
          )}
          {!loading && rinks.length > 0 && filteredRinks.length === 0 && (
            <div className="px-4 py-10 text-center text-sm text-slate-600 dark:text-slate-400">
              No rinks match the current filters.
            </div>
          )}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600 dark:bg-slate-900/40 dark:text-slate-400">
              <tr>
                <th scope="col" className="px-4 py-3">Name</th>
                <th scope="col" className="px-4 py-3">Address</th>
                <th scope="col" className="px-4 py-3 whitespace-nowrap">Phone</th>
                <th scope="col" className="px-4 py-3">Email</th>
                <th scope="col" className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-950/20">
              {filteredRinks.map((r) => (
                <tr
                  key={r.id}
                  className="cursor-pointer align-top hover:bg-slate-50/60 dark:hover:bg-slate-900/40"
                  onClick={() => navigate(`/rinks/${r.id}/slots`)}
                >
                  <td className="px-4 py-3 font-medium">
                    {r.website ? (
                      <a
                        href={r.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={accentLinkClass}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {r.name}
                      </a>
                    ) : (
                      <span className="text-slate-900 dark:text-slate-100">{r.name}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                    <div>{r.address}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">{r.city}, {r.state} {r.zip_code}</div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-slate-700 dark:text-slate-300">{r.phone}</td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                    {r.contact_email ? (
                      <a
                        href={`mailto:${r.contact_email}`}
                        className={accentLinkClass}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {r.contact_email}
                      </a>
                    ) : (
                      '—'
                    )}
                  </td>
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
                        className={tableActionButtonClass}
                      >
                        <Utensils className="h-4 w-4 text-slate-600 dark:text-slate-300" />
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
                        className={tableActionButtonClass}
                      >
                        <Map className="h-4 w-4 text-slate-600 dark:text-slate-300" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" onClick={() => handleEdit(r)} aria-label="Edit" className={tableActionButtonClass}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" onClick={() => handleDelete(r.id)} aria-label="Delete" className={tableActionButtonClass}>
                        <Trash2 className="h-4 w-4 text-rose-600" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}

              {loading && (
                <tr>
                  <td colSpan={5} className="p-0">
                    <TableSkeleton columns={5} rows={4} compact />
                  </td>
                </tr>
              )}
              {!loading && rinks.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-600 dark:text-slate-400">
                    No rinks yet. Add one or seed demo data.
                  </td>
                </tr>
              )}
              {!loading && rinks.length > 0 && filteredRinks.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-600 dark:text-slate-400">
                    No rinks match the current filters.
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
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Name</label>
            <Input value={form.name} onChange={(e) => setField('name', e.target.value)} required />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Address</label>
            <Input value={form.address} onChange={(e) => setField('address', e.target.value)} />
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Phone</label>
              <Input value={form.phone} onChange={(e) => setField('phone', e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Contact Email</label>
              <Input value={form.contact_email} onChange={(e) => setField('contact_email', e.target.value)} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Website</label>
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

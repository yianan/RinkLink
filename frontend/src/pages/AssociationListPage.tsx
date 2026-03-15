import { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pencil, SlidersHorizontal, Trash2 } from 'lucide-react';
import { api } from '../api/client';
import { Association, Team } from '../types';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import FilterPillGroup, { type FilterOption } from '../components/FilterPillGroup';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { useTeam } from '../context/TeamContext';
import PageHeader from '../components/PageHeader';
import { CardListSkeleton, TableSkeleton } from '../components/ui/TableSkeleton';
import { cn } from '../lib/cn';
import { accentLinkClass, filterButtonClass, tableActionButtonClass } from '../lib/uiClasses';
import { useConfirmDialog } from '../context/ConfirmDialogContext';
import { useToast } from '../context/ToastContext';

const emptyForm = { name: '', home_rink_address: '', city: '', state: '', zip_code: '' };

function toggleFilterValue(values: string[], nextValue: string) {
  return values.includes(nextValue)
    ? values.filter((value) => value !== nextValue)
    : [...values, nextValue];
}

function ageGroupSortValue(value: string) {
  const match = value.match(/(\d+)/);
  if (!match) return Number.NEGATIVE_INFINITY;
  return Number(match[1]);
}

export default function AssociationListPage() {
  const navigate = useNavigate();
  const { setActiveTeam } = useTeam();
  const [associations, setAssociations] = useState<Association[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [selectedCities, setSelectedCities] = useState<string[]>([]);
  const [selectedStates, setSelectedStates] = useState<string[]>([]);
  const [selectedAgeGroups, setSelectedAgeGroups] = useState<string[]>([]);
  const [selectedCompetitionNames, setSelectedCompetitionNames] = useState<string[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const confirm = useConfirmDialog();
  const pushToast = useToast();

  const load = () => {
    let cancelled = false;
    setLoading(true);
    Promise.all([api.getAssociations(), api.getTeams()])
      .then(([a, t]) => {
        if (cancelled) return;
        setAssociations(a);
        setTeams(t);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  };
  useEffect(() => load(), []);

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

  const cityOptions = useMemo<FilterOption[]>(
    () =>
      Array.from(new Set(associations.map((association) => association.city).filter(Boolean)))
        .sort((left, right) => left.localeCompare(right))
        .map((city) => ({ value: city, label: city })),
    [associations],
  );

  const stateOptions = useMemo<FilterOption[]>(
    () =>
      Array.from(new Set(associations.map((association) => association.state).filter(Boolean)))
        .sort((left, right) => left.localeCompare(right))
        .map((state) => ({ value: state, label: state })),
    [associations],
  );

  const ageGroupOptions = useMemo<FilterOption[]>(
    () =>
      Array.from(new Set(teams.map((team) => team.age_group).filter(Boolean)))
        .sort((left, right) => ageGroupSortValue(right) - ageGroupSortValue(left) || left.localeCompare(right))
        .map((ageGroup) => ({ value: ageGroup, label: ageGroup })),
    [teams],
  );

  const competitionOptions = useMemo<FilterOption[]>(
    () =>
      Array.from(
        new Set(
          teams
            .flatMap((team) => team.memberships)
            .map((membership) => membership.competition_short_name || membership.competition_name || '')
            .filter(Boolean),
        ),
      )
        .sort((left, right) => left.localeCompare(right))
        .map((competitionName) => ({ value: competitionName, label: competitionName })),
    [teams],
  );

  const filteredAssociations = useMemo(
    () =>
      associations.filter((association) => {
        const assocTeams = teamsByAssociation[association.id] || [];
        const competitionNames = assocTeams
          .flatMap((team) => team.memberships)
          .map((membership) => membership.competition_short_name || membership.competition_name || '')
          .filter(Boolean);
        return (selectedCities.length === 0 || selectedCities.includes(association.city)) &&
          (selectedStates.length === 0 || selectedStates.includes(association.state)) &&
          (selectedAgeGroups.length === 0 || assocTeams.some((team) => selectedAgeGroups.includes(team.age_group))) &&
          (selectedCompetitionNames.length === 0 || competitionNames.some((competitionName) => selectedCompetitionNames.includes(competitionName)));
      }),
    [associations, selectedAgeGroups, selectedCities, selectedCompetitionNames, selectedStates, teamsByAssociation],
  );

  const activeFilterBadges = useMemo(() => {
    const labelsFor = (options: FilterOption[], selectedValues: string[]) =>
      options.filter((option) => selectedValues.includes(option.value)).map((option) => option.label);
    return [
      ...labelsFor(cityOptions, selectedCities),
      ...labelsFor(stateOptions, selectedStates),
      ...labelsFor(ageGroupOptions, selectedAgeGroups),
      ...labelsFor(competitionOptions, selectedCompetitionNames),
    ];
  }, [ageGroupOptions, cityOptions, competitionOptions, selectedAgeGroups, selectedCities, selectedCompetitionNames, selectedStates, stateOptions]);

  const hasActiveFilters = activeFilterBadges.length > 0;

  const clearFilters = () => {
    setSelectedCities([]);
    setSelectedStates([]);
    setSelectedAgeGroups([]);
    setSelectedCompetitionNames([]);
  };

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
    const confirmed = await confirm({
      title: 'Delete association?',
      description: 'This removes the association and all teams assigned to it.',
      confirmLabel: 'Delete association',
      confirmVariant: 'destructive',
    });
    if (!confirmed) return;
    await api.deleteAssociation(id);
    load();
    pushToast({ variant: 'success', title: 'Association deleted' });
  };

  const setField = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const openTeamDashboard = (team: Team) => {
    setActiveTeam(team);
    navigate('/');
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Associations"
        subtitle="Organizations that manage teams."
        actions={(
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setFiltersOpen((openState) => !openState)}
              className={filterButtonClass}
            >
              <SlidersHorizontal className="h-4 w-4" />
              Filters
              {hasActiveFilters ? ` (${activeFilterBadges.length})` : ''}
            </Button>
            <Button type="button" onClick={() => { setEditId(null); setForm(emptyForm); setOpen(true); }}>
              Add Association
            </Button>
          </>
        )}
      />

      {hasActiveFilters && !filtersOpen ? (
        <div className="flex flex-wrap items-center gap-2">
          {activeFilterBadges.map((label, index) => (
            <Badge key={`${label}:${index}`} variant="outline" className="bg-white/80 dark:bg-slate-950/35">
              {label}
            </Badge>
          ))}
          <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
            Clear all
          </Button>
        </div>
      ) : null}

      {filtersOpen ? (
        <Card className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Filter associations</div>
              <div className="text-sm text-slate-600 dark:text-slate-400">
                Narrow the list by location, age groups, and competition presence.
              </div>
            </div>
            {hasActiveFilters ? (
              <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
                Clear all
              </Button>
            ) : null}
          </div>

          {hasActiveFilters ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {activeFilterBadges.map((label, index) => (
                <Badge key={`${label}:${index}`} variant="outline" className="bg-white/80 dark:bg-slate-950/35">
                  {label}
                </Badge>
              ))}
            </div>
          ) : null}

          <div className="mt-4 grid gap-4 border-t border-[color:var(--app-border-subtle)] pt-4 xl:grid-cols-2">
            {cityOptions.length > 0 ? (
              <FilterPillGroup
                label="City"
                options={cityOptions}
                values={selectedCities}
                onToggle={(value) => setSelectedCities((current) => toggleFilterValue(current, value))}
                tone="sky"
              />
            ) : null}
            {stateOptions.length > 0 ? (
              <FilterPillGroup
                label="State"
                options={stateOptions}
                values={selectedStates}
                onToggle={(value) => setSelectedStates((current) => toggleFilterValue(current, value))}
                tone="violet"
              />
            ) : null}
            {ageGroupOptions.length > 0 ? (
              <FilterPillGroup
                label="Age Group"
                options={ageGroupOptions}
                values={selectedAgeGroups}
                onToggle={(value) => setSelectedAgeGroups((current) => toggleFilterValue(current, value))}
                tone="emerald"
              />
            ) : null}
            {competitionOptions.length > 0 ? (
              <FilterPillGroup
                label="Competition"
                options={competitionOptions}
                values={selectedCompetitionNames}
                onToggle={(value) => setSelectedCompetitionNames((current) => toggleFilterValue(current, value))}
                tone="amber"
              />
            ) : null}
          </div>
        </Card>
      ) : null}

      <Card className="overflow-hidden">
        <div className="divide-y divide-slate-200 bg-white md:hidden dark:divide-slate-800 dark:bg-slate-950/20">
          {filteredAssociations.map((a) => {
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
                            className={cn('block cursor-pointer truncate text-left text-xs font-medium', accentLinkClass)}
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
                    <Button type="button" variant="ghost" size="icon" onClick={() => handleEdit(a)} aria-label="Edit" className={tableActionButtonClass}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" onClick={() => handleDelete(a.id)} aria-label="Delete" className={tableActionButtonClass}>
                      <Trash2 className="h-4 w-4 text-rose-600" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}

          {loading && (
            <CardListSkeleton count={3} />
          )}
          {!loading && associations.length === 0 && (
            <div className="px-4 py-10 text-center text-sm text-slate-600 dark:text-slate-400">
              No associations yet. Add one or seed demo data.
            </div>
          )}
          {!loading && associations.length > 0 && filteredAssociations.length === 0 && (
            <div className="px-4 py-10 text-center text-sm text-slate-600 dark:text-slate-400">
              No associations match the current filters.
            </div>
          )}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600 dark:bg-slate-900/40 dark:text-slate-300">
              <tr>
                <th scope="col" className="px-4 py-3">Name</th>
                <th scope="col" className="px-4 py-3">City</th>
                <th scope="col" className="px-4 py-3">State</th>
                <th scope="col" className="px-4 py-3">Zip</th>
                <th scope="col" className="px-4 py-3">Teams</th>
                <th scope="col" className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-950/20">
              {filteredAssociations.map((a) => (
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
                            className={cn('block cursor-pointer truncate text-left font-medium', accentLinkClass)}
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
                      <Button type="button" variant="ghost" size="icon" onClick={() => handleEdit(a)} aria-label="Edit" className={tableActionButtonClass}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" onClick={() => handleDelete(a.id)} aria-label="Delete" className={tableActionButtonClass}>
                        <Trash2 className="h-4 w-4 text-rose-600" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}

              {loading && (
                <tr>
                  <td colSpan={6} className="p-0">
                    <TableSkeleton columns={6} rows={4} compact />
                  </td>
                </tr>
              )}
              {!loading && associations.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-600 dark:text-slate-400">
                    No associations yet. Add one or seed demo data.
                  </td>
                </tr>
              )}
              {!loading && associations.length > 0 && filteredAssociations.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-600 dark:text-slate-400">
                    No associations match the current filters.
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

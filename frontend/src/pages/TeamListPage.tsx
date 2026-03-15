import { useState, useEffect, useMemo } from 'react';
import { Pencil, SlidersHorizontal, Trash2 } from 'lucide-react';
import { api } from '../api/client';
import { Team, Association } from '../types';
import { useTeam } from '../context/TeamContext';
import { useSeason } from '../context/SeasonContext';
import AgeLevelSelect from '../components/AgeLevelSelect';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { Select } from '../components/ui/Select';
import FilterPillGroup, { type FilterOption } from '../components/FilterPillGroup';
import PageHeader from '../components/PageHeader';
import { CardListSkeleton, TableSkeleton } from '../components/ui/TableSkeleton';
import { accentLinkClass, filterButtonClass, tableActionButtonClass } from '../lib/uiClasses';
import { Badge } from '../components/ui/Badge';
import { getCompetitionBadgeVariant, getCompetitionLabel } from '../lib/competition';
import { useConfirmDialog } from '../context/ConfirmDialogContext';
import { useToast } from '../context/ToastContext';

const emptyForm = {
  association_id: '', name: '', age_group: '', level: '',
  manager_name: '', manager_email: '', manager_phone: '',
  rink_city: '', rink_state: '', rink_zip: '',
  myhockey_ranking: '' as string,
};

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

export default function TeamListPage() {
  const { refreshTeams } = useTeam();
  const { activeSeason, seasons } = useSeason();
  const [teams, setTeams] = useState<Team[]>([]);
  const [associations, setAssociations] = useState<Association[]>([]);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [selectedAssociationIds, setSelectedAssociationIds] = useState<string[]>([]);
  const [selectedCompetitionNames, setSelectedCompetitionNames] = useState<string[]>([]);
  const [selectedAgeGroups, setSelectedAgeGroups] = useState<string[]>([]);
  const [selectedLevels, setSelectedLevels] = useState<string[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const confirm = useConfirmDialog();
  const pushToast = useToast();

  const displaySeason = activeSeason ?? seasons.find((season) => season.is_active) ?? seasons[0] ?? null;

  const load = () => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api.getTeams(displaySeason ? { season_id: displaySeason.id } : undefined),
      api.getAssociations(),
    ]).then(([teamData, associationData]) => {
      if (cancelled) return;
      setTeams(teamData);
      setAssociations(associationData);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  };
  useEffect(() => load(), [displaySeason?.id]);

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
    const confirmed = await confirm({
      title: 'Delete team?',
      description: 'This removes the team and its related local data.',
      confirmLabel: 'Delete team',
      confirmVariant: 'destructive',
    });
    if (!confirmed) return;
    await api.deleteTeam(id);
    load();
    refreshTeams();
    pushToast({ variant: 'success', title: 'Team deleted' });
  };

  const setField = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const associationOptions = useMemo<FilterOption[]>(
    () => associations
      .slice()
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((association) => ({ value: association.id, label: association.name })),
    [associations],
  );

  const competitionOptions = useMemo<FilterOption[]>(() => {
    const names = Array.from(
      new Set(
        teams
          .flatMap((team) => team.memberships)
          .map((membership) => membership.competition_short_name || membership.competition_name || '')
          .filter(Boolean),
      ),
    );
    return names
      .sort((left, right) => left.localeCompare(right))
      .map((name) => ({ value: name, label: name }));
  }, [teams]);

  const ageGroupOptions = useMemo<FilterOption[]>(() => {
    const values = Array.from(new Set(teams.map((team) => team.age_group).filter(Boolean)));
    return values
      .sort((left, right) => ageGroupSortValue(right) - ageGroupSortValue(left) || left.localeCompare(right))
      .map((value) => ({ value, label: value }));
  }, [teams]);

  const levelOptions = useMemo<FilterOption[]>(() => {
    const values = Array.from(new Set(teams.map((team) => team.level).filter(Boolean)));
    return values.sort((left, right) => left.localeCompare(right)).map((value) => ({ value, label: value }));
  }, [teams]);

  const filteredTeams = useMemo(() => teams.filter((team) => {
    const competitionNames = team.memberships
      .map((membership) => membership.competition_short_name || membership.competition_name || '')
      .filter(Boolean);
    return (selectedAssociationIds.length === 0 || selectedAssociationIds.includes(team.association_id))
      && (selectedCompetitionNames.length === 0 || competitionNames.some((name) => selectedCompetitionNames.includes(name)))
      && (selectedAgeGroups.length === 0 || selectedAgeGroups.includes(team.age_group))
      && (selectedLevels.length === 0 || selectedLevels.includes(team.level));
  }), [selectedAgeGroups, selectedAssociationIds, selectedCompetitionNames, selectedLevels, teams]);

  const activeFilterBadges = useMemo(() => {
    const labelsFor = (options: FilterOption[], selectedValues: string[]) =>
      options.filter((option) => selectedValues.includes(option.value)).map((option) => option.label);
    return [
      ...labelsFor(associationOptions, selectedAssociationIds),
      ...labelsFor(competitionOptions, selectedCompetitionNames),
      ...labelsFor(ageGroupOptions, selectedAgeGroups),
      ...labelsFor(levelOptions, selectedLevels),
    ];
  }, [
    ageGroupOptions,
    associationOptions,
    competitionOptions,
    levelOptions,
    selectedAgeGroups,
    selectedAssociationIds,
    selectedCompetitionNames,
    selectedLevels,
  ]);

  const hasActiveFilters = activeFilterBadges.length > 0;

  const clearFilters = () => {
    setSelectedAssociationIds([]);
    setSelectedCompetitionNames([]);
    setSelectedAgeGroups([]);
    setSelectedLevels([]);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Teams"
        subtitle={
          activeSeason
            ? `Create teams and manage contact details for the ${activeSeason.name} Season.`
            : displaySeason
              ? `Create teams and manage contact details. Competition assignments shown for ${displaySeason.name} Season.`
              : 'Create teams and manage contact details.'
        }
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
              Add Team
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
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Filter teams</div>
              <div className="text-sm text-slate-600 dark:text-slate-400">
                Narrow the list by association, competition, age group, and level.
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
            <FilterPillGroup
              label="Association"
              options={associationOptions}
              values={selectedAssociationIds}
              onToggle={(value) => setSelectedAssociationIds((current) => toggleFilterValue(current, value))}
              tone="sky"
            />
            <FilterPillGroup
              label="Competition"
              options={competitionOptions}
              values={selectedCompetitionNames}
              onToggle={(value) => setSelectedCompetitionNames((current) => toggleFilterValue(current, value))}
              tone="violet"
            />
            <FilterPillGroup
              label="Age Group"
              options={ageGroupOptions}
              values={selectedAgeGroups}
              onToggle={(value) => setSelectedAgeGroups((current) => toggleFilterValue(current, value))}
              tone="emerald"
            />
            <FilterPillGroup
              label="Level"
              options={levelOptions}
              values={selectedLevels}
              onToggle={(value) => setSelectedLevels((current) => toggleFilterValue(current, value))}
              tone="amber"
            />
          </div>
        </Card>
      ) : null}

      <Card className="overflow-hidden">
        <div className="divide-y divide-slate-200 bg-white lg:hidden dark:divide-slate-800 dark:bg-slate-950/20">
          {filteredTeams.map((t) => (
            <div key={t.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{t.name}</div>
                  <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{t.association_name || '—'}</div>

                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
                    <span className="whitespace-nowrap">Ranking: {t.myhockey_ranking ?? '—'}</span>
                    <span className="whitespace-nowrap font-medium text-slate-700 dark:text-slate-300">
                      {t.wins}-{t.losses}-{t.ties}
                    </span>
                  </div>

                  {t.primary_membership && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Badge variant={getCompetitionBadgeVariant(t.primary_membership.competition_type)}>
                        {t.primary_membership.competition_short_name} • {t.primary_membership.division_name}
                      </Badge>
                      {t.memberships.filter((membership) => !membership.is_primary).map((membership) => (
                        <Badge key={membership.id} variant="outline">
                          {getCompetitionLabel(membership.competition_type)}: {membership.competition_short_name}
                        </Badge>
                      ))}
                    </div>
                  )}

                  {(t.manager_name || t.manager_email) && (
                    <div className="mt-2 text-sm text-slate-700 dark:text-slate-300">
                      {t.manager_email ? (
                        <a
                          href={`mailto:${t.manager_email}`}
                          className={accentLinkClass}
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
                  <Button type="button" variant="ghost" size="icon" onClick={() => handleEdit(t)} aria-label="Edit" className={tableActionButtonClass}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" onClick={() => handleDelete(t.id)} aria-label="Delete" className={tableActionButtonClass}>
                    <Trash2 className="h-4 w-4 text-rose-600" />
                  </Button>
                </div>
              </div>
            </div>
          ))}

          {loading && (
            <CardListSkeleton count={3} />
          )}
          {!loading && teams.length === 0 && (
            <div className="px-4 py-10 text-center text-sm text-slate-600 dark:text-slate-400">
              No teams yet. Add one or seed demo data.
            </div>
          )}
          {!loading && teams.length > 0 && filteredTeams.length === 0 && (
            <div className="px-4 py-10 text-center text-sm text-slate-600 dark:text-slate-400">
              No teams match the current filters.
            </div>
          )}
        </div>

        <div className="hidden lg:block">
          <table className="w-full table-fixed text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600 dark:bg-slate-900/40 dark:text-slate-300">
              <tr>
                <th scope="col" className="w-[21%] px-3 py-3">Name</th>
                <th scope="col" className="w-[15%] px-3 py-3">Association</th>
                <th scope="col" className="w-[16%] px-3 py-3">Primary Competition</th>
                <th scope="col" className="w-[13%] px-3 py-3 leading-tight">Other Comps</th>
                <th scope="col" className="w-[7%] px-3 py-3 text-center">Rank</th>
                <th scope="col" className="w-[8%] px-3 py-3">Record</th>
                <th scope="col" className="w-[13%] px-3 py-3">Manager</th>
                <th scope="col" className="w-[8%] px-3 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-950/20">
              {filteredTeams.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-900/40">
                  <td className="px-3 py-3 font-medium text-slate-900 dark:text-slate-100">{t.name}</td>
                  <td className="px-3 py-3 text-slate-700 dark:text-slate-300">{t.association_name}</td>
                  <td className="px-3 py-3 text-slate-700 dark:text-slate-300">
                    {t.primary_membership ? (
                      <div className="min-w-0 space-y-1">
                        <div className="font-medium text-slate-900 dark:text-slate-100">
                          {t.primary_membership.competition_short_name}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {t.primary_membership.division_name}
                        </div>
                      </div>
                    ) : '—'}
                  </td>
                  <td className="px-3 py-3 text-slate-700 dark:text-slate-300">
                    {t.memberships.filter((membership) => !membership.is_primary).length ? (
                      <div className="min-w-0 flex flex-wrap gap-1.5">
                        {t.memberships.filter((membership) => !membership.is_primary).map((membership) => (
                          <Badge key={membership.id} variant="outline" className="max-w-full px-2 py-0.5 whitespace-normal break-words text-center leading-tight">
                            {membership.competition_short_name}
                          </Badge>
                        ))}
                      </div>
                    ) : '—'}
                  </td>
                  <td className="px-3 py-3 text-center text-slate-700 dark:text-slate-300">{t.myhockey_ranking ?? '-'}</td>
                  <td className="px-3 py-3 font-medium text-slate-700 dark:text-slate-300">{t.wins}-{t.losses}-{t.ties}</td>
                  <td className="px-3 py-3 text-slate-700 dark:text-slate-300">
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
                  <td className="px-3 py-3">
                    <div className="flex justify-end gap-0.5">
                      <Button type="button" variant="ghost" size="icon" onClick={() => handleEdit(t)} aria-label="Edit" className={tableActionButtonClass}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" onClick={() => handleDelete(t.id)} aria-label="Delete" className={tableActionButtonClass}>
                        <Trash2 className="h-4 w-4 text-rose-600" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}

              {loading && (
                <tr>
                  <td colSpan={8} className="p-0">
                    <TableSkeleton columns={8} rows={4} compact />
                  </td>
                </tr>
              )}
              {!loading && teams.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-600 dark:text-slate-400">
                    No teams yet. Add one or seed demo data.
                  </td>
                </tr>
              )}
              {!loading && teams.length > 0 && filteredTeams.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-600 dark:text-slate-400">
                    No teams match the current filters.
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
        </div>
      </Modal>
    </div>
  );
}

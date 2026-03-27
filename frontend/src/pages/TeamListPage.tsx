import { useEffect, useMemo, useState } from 'react';
import { Pencil, Phone, Trash2 } from 'lucide-react';
import { api } from '../api/client';
import { Association, Team } from '../types';
import { useSeason } from '../context/SeasonContext';
import { useTeam } from '../context/TeamContext';
import AgeLevelSelect from '../components/AgeLevelSelect';
import FilterPillGroup, { type FilterOption } from '../components/FilterPillGroup';
import { FilterPanel, FilterPanelTrigger } from '../components/FilterPanel';
import PageHeader from '../components/PageHeader';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { Select } from '../components/ui/Select';
import { Badge } from '../components/ui/Badge';
import { useConfirmDialog } from '../context/ConfirmDialogContext';
import { useToast } from '../context/ToastContext';
import { getCompetitionBadgeVariant, getCompetitionLabel } from '../lib/competition';
import { accentLinkClass, tableActionButtonClass } from '../lib/uiClasses';
import TeamLogo from '../components/TeamLogo';

const emptyTeamForm = {
  association_id: '',
  name: '',
  age_group: '',
  level: '',
  manager_name: '',
  manager_email: '',
  manager_phone: '',
  myhockey_ranking: '',
};

function ageGroupSortValue(value: string) {
  const match = value.match(/(\d+)/);
  if (!match) return Number.NEGATIVE_INFINITY;
  return Number(match[1]);
}

export default function TeamListPage() {
  const { refreshTeams } = useTeam();
  const { activeSeason, seasons } = useSeason();
  const effectiveSeason = activeSeason ?? seasons.find((season) => season.is_active) ?? seasons[0] ?? null;
  const confirm = useConfirmDialog();
  const pushToast = useToast();

  const [teams, setTeams] = useState<Team[]>([]);
  const [associations, setAssociations] = useState<Association[]>([]);

  const [teamModalOpen, setTeamModalOpen] = useState(false);
  const [editTeam, setEditTeam] = useState<Team | null>(null);
  const [teamForm, setTeamForm] = useState(emptyTeamForm);
  const [teamLogoFile, setTeamLogoFile] = useState<File | null>(null);
  const [removeTeamLogo, setRemoveTeamLogo] = useState(false);

  const [selectedAssociationIds, setSelectedAssociationIds] = useState<string[]>([]);
  const [selectedCompetitionNames, setSelectedCompetitionNames] = useState<string[]>([]);
  const [selectedAgeGroups, setSelectedAgeGroups] = useState<string[]>([]);
  const [selectedLevels, setSelectedLevels] = useState<string[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const load = async () => {
    const [teamData, associationData] = await Promise.all([
      api.getTeams(effectiveSeason ? { season_id: effectiveSeason.id } : undefined),
      api.getAssociations(),
    ]);
    setTeams(teamData);
    setAssociations(associationData);
  };

  useEffect(() => {
    load();
  }, [effectiveSeason?.id]);

  const setTeamField = (key: keyof typeof emptyTeamForm, value: string) => {
    setTeamForm((current) => ({ ...current, [key]: value }));
  };

  const [teamLogoPreviewUrl, setTeamLogoPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!teamLogoFile) {
      setTeamLogoPreviewUrl(removeTeamLogo ? null : (editTeam?.logo_url ?? null));
      return;
    }
    const objectUrl = URL.createObjectURL(teamLogoFile);
    setTeamLogoPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [editTeam?.logo_url, removeTeamLogo, teamLogoFile]);

  const openCreateTeam = () => {
    setEditTeam(null);
    setTeamForm(emptyTeamForm);
    setTeamLogoFile(null);
    setRemoveTeamLogo(false);
    setTeamModalOpen(true);
  };

  const openEditTeam = (team: Team) => {
    setEditTeam(team);
    setTeamForm({
      association_id: team.association_id,
      name: team.name,
      age_group: team.age_group,
      level: team.level,
      manager_name: team.manager_name || '',
      manager_email: team.manager_email || '',
      manager_phone: team.manager_phone || '',
      myhockey_ranking: team.myhockey_ranking != null ? String(team.myhockey_ranking) : '',
    });
    setTeamLogoFile(null);
    setRemoveTeamLogo(false);
    setTeamModalOpen(true);
  };

  const saveTeam = async () => {
    const payload = {
      ...teamForm,
      myhockey_ranking: teamForm.myhockey_ranking ? Number(teamForm.myhockey_ranking) : null,
    };
    let savedTeam: Team;
    if (editTeam) {
      savedTeam = await api.updateTeam(editTeam.id, payload);
      if (removeTeamLogo && editTeam.logo_url) {
        savedTeam = await api.deleteTeamLogo(editTeam.id);
      }
      pushToast({ variant: 'success', title: 'Team updated' });
    } else {
      savedTeam = await api.createTeam(payload);
      pushToast({ variant: 'success', title: 'Team created' });
    }
    if (teamLogoFile) {
      savedTeam = await api.uploadTeamLogo(savedTeam.id, teamLogoFile);
    }
    setTeamModalOpen(false);
    setEditTeam(null);
    setTeamForm(emptyTeamForm);
    setTeamLogoFile(null);
    setRemoveTeamLogo(false);
    await load();
    await refreshTeams();
  };

  const deleteTeam = async (team: Team) => {
    const confirmed = await confirm({
      title: 'Delete team?',
      description: 'This removes the team and its local records.',
      confirmLabel: 'Delete team',
      confirmVariant: 'destructive',
    });
    if (!confirmed) return;
    await api.deleteTeam(team.id);
    pushToast({ variant: 'success', title: 'Team deleted' });
    await load();
    await refreshTeams();
  };

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
          .map((team) => team.primary_membership?.competition_short_name || team.primary_membership?.competition_name || '')
          .filter(Boolean),
      ),
    );
    return names.sort((left, right) => left.localeCompare(right)).map((name) => ({ value: name, label: name }));
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

  const filteredTeams = useMemo(
    () => teams.filter((team) => {
      const primaryCompetitionName = team.primary_membership?.competition_short_name || team.primary_membership?.competition_name || '';
      return (selectedAssociationIds.length === 0 || selectedAssociationIds.includes(team.association_id))
        && (selectedCompetitionNames.length === 0 || (primaryCompetitionName && selectedCompetitionNames.includes(primaryCompetitionName)))
        && (selectedAgeGroups.length === 0 || selectedAgeGroups.includes(team.age_group))
        && (selectedLevels.length === 0 || selectedLevels.includes(team.level));
    }),
    [selectedAgeGroups, selectedAssociationIds, selectedCompetitionNames, selectedLevels, teams],
  );

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
          effectiveSeason
            ? `Manage team records, competition context, and managers for ${effectiveSeason.name}.`
            : 'Manage team records, competition context, and managers.'
        }
        actions={(
          <>
            <FilterPanelTrigger count={activeFilterBadges.length} open={filtersOpen} onClick={() => setFiltersOpen((open) => !open)} />
            <Button type="button" onClick={openCreateTeam}>Add Team</Button>
          </>
        )}
      />

      <FilterPanel
        title="Filter teams"
        description="Narrow the list by association, primary league, age group, and level."
        open={filtersOpen}
        badges={activeFilterBadges}
        onClear={clearFilters}
      >
        <FilterPillGroup label="Association" options={associationOptions} values={selectedAssociationIds} onChange={setSelectedAssociationIds} tone="sky" />
        <FilterPillGroup label="Competition" options={competitionOptions} values={selectedCompetitionNames} onChange={setSelectedCompetitionNames} tone="violet" />
        <FilterPillGroup label="Age Group" options={ageGroupOptions} values={selectedAgeGroups} onChange={setSelectedAgeGroups} tone="emerald" />
        <FilterPillGroup label="Level" options={levelOptions} values={selectedLevels} onChange={setSelectedLevels} tone="amber" />
      </FilterPanel>

      <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
        {filteredTeams.map((team) => {
          return (
            <Card key={team.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <TeamLogo
                    name={team.name}
                    logoUrl={team.logo_url}
                    className="h-12 w-12 rounded-2xl"
                    initialsClassName="text-sm"
                  />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{team.name}</div>
                      <Badge variant="outline">{team.age_group} {team.level}</Badge>
                    </div>
                    <div className="mt-1 text-sm text-slate-600 dark:text-slate-400">{team.association_name || 'No association'}</div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className={tableActionButtonClass}
                    onClick={() => openEditTeam(team)}
                    aria-label="Edit team"
                    title="Edit team"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className={tableActionButtonClass}
                    onClick={() => deleteTeam(team)}
                    aria-label="Delete team"
                    title="Delete team"
                  >
                    <Trash2 className="h-4 w-4 text-rose-600" />
                  </Button>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {team.primary_membership ? (
                  <Badge variant={getCompetitionBadgeVariant(team.primary_membership.competition_type)}>
                    {team.primary_membership.competition_short_name} • {team.primary_membership.division_name}
                  </Badge>
                ) : (
                  <Badge variant="outline">No primary competition</Badge>
                )}
                <div className="inline-flex min-h-8 items-center gap-2 rounded-full border border-slate-200 bg-slate-50/90 px-3 py-1.5 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-200">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Manager</span>
                  <span className="font-medium text-slate-900 dark:text-slate-100">
                    {team.manager_email ? (
                      <a href={`mailto:${team.manager_email}`} className={accentLinkClass}>
                        {team.manager_name || team.manager_email}
                      </a>
                    ) : (
                      team.manager_name || '—'
                    )}
                  </span>
                  {team.manager_phone ? (
                    <a href={`tel:${team.manager_phone}`} className={accentLinkClass} aria-label={`Call ${team.manager_name || team.name} manager`}>
                      <Phone className="h-3.5 w-3.5" />
                    </a>
                  ) : null}
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 dark:border-slate-800 dark:bg-slate-950/35">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Rank</div>
                  <div className="mt-1 font-semibold text-slate-900 dark:text-slate-100">{team.myhockey_ranking ?? '—'}</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 dark:border-slate-800 dark:bg-slate-950/35">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Record</div>
                  <div className="mt-1 font-semibold text-slate-900 dark:text-slate-100">{team.wins}-{team.losses}-{team.ties}</div>
                </div>
              </div>
            </Card>
          );
        })}

        {filteredTeams.length === 0 ? (
          <Card className="p-6 text-sm text-slate-600 dark:text-slate-400">
            {teams.length === 0 ? 'No teams yet. Add one to start managing seasons.' : 'No teams match the current filters.'}
          </Card>
        ) : null}
      </div>

      <Modal
        open={teamModalOpen}
        onClose={() => {
          setTeamModalOpen(false);
          setTeamLogoFile(null);
          setRemoveTeamLogo(false);
        }}
        title={editTeam ? 'Edit Team' : 'Add Team'}
        footer={(
          <>
            <Button type="button" onClick={saveTeam} disabled={!teamForm.name || !teamForm.association_id || !teamForm.age_group || !teamForm.level}>
              Save
            </Button>
            <Button type="button" variant="outline" onClick={() => setTeamModalOpen(false)}>
              Cancel
            </Button>
          </>
        )}
      >
        <div className="grid grid-cols-1 gap-3">
          <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-slate-950/35">
            <TeamLogo
              name={teamForm.name || editTeam?.name || ''}
              logoUrl={teamLogoPreviewUrl}
              className="h-16 w-16 rounded-2xl"
              initialsClassName="text-lg"
            />
            <div className="min-w-0 flex-1">
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Team Logo</label>
              <input
                type="file"
                accept=".png,.jpg,.jpeg,.webp,.svg"
                className="block w-full text-sm text-slate-700 file:mr-3 file:rounded-full file:border-0 file:bg-sky-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-sky-800 hover:file:bg-sky-200 dark:text-slate-300 dark:file:bg-sky-950/40 dark:file:text-sky-100 dark:hover:file:bg-sky-950/60"
                onChange={(event) => {
                  const nextFile = event.target.files?.[0] ?? null;
                  setTeamLogoFile(nextFile);
                  setRemoveTeamLogo(false);
                }}
              />
              {editTeam?.logo_url || teamLogoFile ? (
                <div className="mt-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setTeamLogoFile(null);
                      setRemoveTeamLogo(true);
                    }}
                  >
                    Remove Logo
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Association</label>
            <Select value={teamForm.association_id} onChange={(event) => setTeamField('association_id', event.target.value)}>
              <option value="">Select association…</option>
              {associations.map((association) => (
                <option key={association.id} value={association.id}>{association.name}</option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Team Name</label>
            <Input value={teamForm.name} onChange={(event) => setTeamField('name', event.target.value)} />
          </div>
          <AgeLevelSelect
            ageGroup={teamForm.age_group}
            level={teamForm.level}
            onAgeGroupChange={(value) => setTeamField('age_group', value)}
            onLevelChange={(value) => setTeamField('level', value)}
          />
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Manager Name</label>
            <Input value={teamForm.manager_name} onChange={(event) => setTeamField('manager_name', event.target.value)} />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input value={teamForm.manager_email} onChange={(event) => setTeamField('manager_email', event.target.value)} placeholder="Manager email" />
            <Input value={teamForm.manager_phone} onChange={(event) => setTeamField('manager_phone', event.target.value)} placeholder="Manager phone" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">MYHockey Ranking</label>
            <Input type="number" value={teamForm.myhockey_ranking} onChange={(event) => setTeamField('myhockey_ranking', event.target.value)} />
          </div>
        </div>
      </Modal>

    </div>
  );
}

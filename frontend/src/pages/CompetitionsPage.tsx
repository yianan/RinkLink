import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ExternalLink, Trophy } from 'lucide-react';
import { api } from '../api/client';
import { Competition, StandingsEntry, Team } from '../types';
import { useSeason } from '../context/SeasonContext';
import { useTeam } from '../context/TeamContext';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import FilterPillGroup, { type FilterOption } from '../components/FilterPillGroup';
import { FilterPanel, FilterPanelTrigger } from '../components/FilterPanel';
import PageHeader from '../components/PageHeader';
import TeamLogo from '../components/TeamLogo';
import { CardListSkeleton } from '../components/ui/TableSkeleton';
import { cn } from '../lib/cn';
import { accentLinkClass, filterButtonClass } from '../lib/uiClasses';
import {
  getCompetitionBadgeVariant,
  getCompetitionHeaderClass,
  getCompetitionLabelClass,
  getCompetitionLabel,
  getCompetitionShellClass,
  getCompetitionTitleClass,
  getDivisionHeaderClass,
  getDivisionShellClass,
  getDivisionTitleClass,
} from '../lib/competition';

function normalizedToken(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function divisionMeta(division: Competition['divisions'][number]) {
  const normalizedName = normalizedToken(division.name);
  const ageGroup = division.age_group?.trim();
  const level = division.level?.trim();
  const showAgeGroup = ageGroup ? !normalizedName.includes(normalizedToken(ageGroup)) : false;
  const showLevel = level ? !normalizedName.includes(normalizedToken(level)) : false;
  const parts = [showAgeGroup ? ageGroup : null, showLevel ? level : null].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

function standingsByTeamId(entries: StandingsEntry[]) {
  return new Map(entries.map((entry) => [entry.team_id, entry] as const));
}

function ageGroupSortValue(value: string) {
  const match = value.match(/(\d+)/);
  if (!match) return Number.NEGATIVE_INFINITY;
  return Number(match[1]);
}

export default function CompetitionsPage() {
  const navigate = useNavigate();
  const { setActiveTeam } = useTeam();
  const { activeSeason, seasons } = useSeason();
  const effectiveSeason = activeSeason ?? seasons.find((season) => season.is_active) ?? seasons[0] ?? null;
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [standingsByDivision, setStandingsByDivision] = useState<Record<string, StandingsEntry[]>>({});
  const [loading, setLoading] = useState(true);
  const [selectedCompetitionTypes, setSelectedCompetitionTypes] = useState<string[]>([]);
  const [selectedCompetitionIds, setSelectedCompetitionIds] = useState<string[]>([]);
  const [selectedAgeGroups, setSelectedAgeGroups] = useState<string[]>([]);
  const [selectedLevels, setSelectedLevels] = useState<string[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    if (!effectiveSeason) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api.getCompetitions({ season_id: effectiveSeason.id }),
      api.getTeams({ season_id: effectiveSeason.id }),
    ]).then(([competitionData, teamData]) => {
      if (cancelled) return;
      setCompetitions(competitionData);
      setTeams(teamData);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [effectiveSeason?.id]);

  useEffect(() => {
    const standingsDivisionIds = competitions
      .flatMap((competition) => competition.divisions)
      .filter((division) => division.standings_enabled)
      .map((division) => division.id);

    if (standingsDivisionIds.length === 0) {
      setStandingsByDivision({});
      return;
    }

    let cancelled = false;
    Promise.all(
      standingsDivisionIds.map(async (divisionId) => [divisionId, await api.getCompetitionDivisionStandings(divisionId)] as const),
    ).then((results) => {
      if (cancelled) return;
      setStandingsByDivision(Object.fromEntries(results));
    }).catch(() => {
      if (!cancelled) setStandingsByDivision({});
    });

    return () => {
      cancelled = true;
    };
  }, [competitions]);

  const membershipsByDivision = useMemo(() => {
    const grouped: Record<string, { team: Team; role: string }[]> = {};
    for (const team of teams) {
      for (const membership of team.memberships) {
        (grouped[membership.competition_division_id] ||= []).push({ team, role: membership.membership_role });
      }
    }
    for (const list of Object.values(grouped)) {
      list.sort((left, right) => left.team.name.localeCompare(right.team.name));
    }
    return grouped;
  }, [teams]);

  const competitionTypeOptions = useMemo<FilterOption[]>(() => {
    const values = Array.from(new Set(competitions.map((competition) => competition.competition_type)));
    return values.map((value) => ({
      value,
      label: getCompetitionLabel(value),
    }));
  }, [competitions]);

  const competitionOptions = useMemo<FilterOption[]>(() =>
    competitions
      .slice()
      .sort((left, right) => left.short_name.localeCompare(right.short_name))
      .map((competition) => ({
        value: competition.id,
        label: competition.short_name,
      })),
  [competitions]);

  const ageGroupOptions = useMemo<FilterOption[]>(() => {
    const values = Array.from(
      new Set(
        competitions.flatMap((competition) => competition.divisions.map((division) => division.age_group).filter(Boolean)),
      ),
    );
    return values
      .sort((left, right) => ageGroupSortValue(right) - ageGroupSortValue(left) || left.localeCompare(right))
      .map((value) => ({ value, label: value }));
  }, [competitions]);

  const levelOptions = useMemo<FilterOption[]>(() => {
    const values = Array.from(
      new Set(
        competitions.flatMap((competition) => competition.divisions.map((division) => division.level).filter(Boolean)),
      ),
    );
    return values.sort((left, right) => left.localeCompare(right)).map((value) => ({ value, label: value }));
  }, [competitions]);

  const competitionSections = useMemo(() => {
    const filteredCompetitions = competitions
      .filter((competition) => selectedCompetitionTypes.length === 0 || selectedCompetitionTypes.includes(competition.competition_type))
      .filter((competition) => selectedCompetitionIds.length === 0 || selectedCompetitionIds.includes(competition.id))
      .map((competition) => ({
        ...competition,
        divisions: competition.divisions.filter(
          (division) =>
            (selectedAgeGroups.length === 0 || selectedAgeGroups.includes(division.age_group))
            && (selectedLevels.length === 0 || selectedLevels.includes(division.level)),
        ),
      }))
      .filter((competition) => competition.divisions.length > 0);

    const regularSeason = filteredCompetitions.filter((competition) => competition.competition_type === 'league');
    const otherCompetitions = filteredCompetitions.filter((competition) => competition.competition_type !== 'league');
    return [
      {
        key: 'regular',
        title: 'Regular-Season Leagues',
        description: 'Primary league alignments and divisions.',
        competitions: regularSeason,
      },
      {
        key: 'other',
        title: 'Other Competitions',
        description: 'Postseason, district, showcase, and developmental assignments.',
        competitions: otherCompetitions,
      },
    ].filter((section) => section.competitions.length > 0);
  }, [competitions, selectedAgeGroups, selectedCompetitionIds, selectedCompetitionTypes, selectedLevels]);

  const activeFilterBadges = useMemo(() => {
    const labelsFor = (options: FilterOption[], selectedValues: string[]) =>
      options.filter((option) => selectedValues.includes(option.value)).map((option) => option.label);
    return [
      ...labelsFor(competitionTypeOptions, selectedCompetitionTypes),
      ...labelsFor(competitionOptions, selectedCompetitionIds),
      ...labelsFor(ageGroupOptions, selectedAgeGroups),
      ...labelsFor(levelOptions, selectedLevels),
    ];
  }, [
    ageGroupOptions,
    competitionOptions,
    competitionTypeOptions,
    levelOptions,
    selectedAgeGroups,
    selectedCompetitionIds,
    selectedCompetitionTypes,
    selectedLevels,
  ]);

  const hasActiveFilters = activeFilterBadges.length > 0;

  if (!effectiveSeason) {
    return <Alert variant="info">No season is available yet.</Alert>;
  }

  const openTeamDashboard = (team: Team) => {
    setActiveTeam(team);
    navigate('/');
  };

  const openDivisionStandings = (divisionId: string) => {
    navigate(`/standings?division=${divisionId}`);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Competitions"
        subtitle={`Leagues and other assigned competitions for the ${effectiveSeason.name} Season.`}
        actions={(
          <div className="shrink-0">
            <FilterPanelTrigger count={activeFilterBadges.length} open={filtersOpen} onClick={() => setFiltersOpen((open) => !open)} />
          </div>
        )}
      />

      {loading ? (
        <CardListSkeleton count={3} />
      ) : competitions.length === 0 ? (
        <Alert variant="info">No competitions have been configured for this season yet.</Alert>
      ) : (
        <div className="space-y-6">
          <FilterPanel
            title="Filter competitions"
            description="Combine filters to narrow the page by type, competition, age group, and level."
            open={filtersOpen}
            badges={activeFilterBadges}
            onClear={() => {
              setSelectedCompetitionTypes([]);
              setSelectedCompetitionIds([]);
              setSelectedAgeGroups([]);
              setSelectedLevels([]);
            }}
          >
            <FilterPillGroup
              label="Type"
              options={competitionTypeOptions}
              values={selectedCompetitionTypes}
              onChange={setSelectedCompetitionTypes}
              tone="sky"
            />
            <FilterPillGroup
              label="Competition"
              options={competitionOptions}
              values={selectedCompetitionIds}
              onChange={setSelectedCompetitionIds}
              tone="violet"
            />
            <FilterPillGroup
              label="Age Group"
              options={ageGroupOptions}
              values={selectedAgeGroups}
              onChange={setSelectedAgeGroups}
              tone="emerald"
            />
            <FilterPillGroup
              label="Level"
              options={levelOptions}
              values={selectedLevels}
              onChange={setSelectedLevels}
              tone="amber"
            />
          </FilterPanel>

          {competitionSections.length === 0 ? (
            <Alert variant="info">No competitions match the current filters.</Alert>
          ) : null}

          {competitionSections.map((section) => (
            <section key={section.key} className="space-y-3">
              <div className="rounded-2xl border border-[color:var(--app-border-subtle)] bg-white/70 px-4 py-3 shadow-sm dark:bg-slate-950/30">
                <div className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-700 dark:text-slate-200">
                  {section.title}
                </div>
                <div className="mt-1 text-xs text-slate-600 dark:text-slate-400 sm:text-sm">{section.description}</div>
              </div>

              <div className="space-y-4">
                {section.competitions.map((competition) => (
                  <Card key={competition.id} className={cn('overflow-hidden p-4', getCompetitionShellClass(competition.competition_type))}>
                    <div className={cn('rounded-2xl border px-4 py-4 shadow-sm', getCompetitionHeaderClass(competition.competition_type))}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            {competition.website ? (
                              <a
                                href={competition.website}
                                target="_blank"
                                rel="noreferrer"
                                className={cn(
                                  'inline-flex items-center gap-1 text-lg font-semibold tracking-tight transition-colors hover:text-[color:var(--app-accent-link-hover)]',
                                  getCompetitionTitleClass(competition.competition_type),
                                  accentLinkClass,
                                )}
                              >
                                {competition.name}
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            ) : (
                              <div className={cn('text-lg font-semibold tracking-tight', getCompetitionTitleClass(competition.competition_type))}>
                                {competition.name}
                              </div>
                            )}
                            <span className={cn('text-[11px] font-semibold uppercase tracking-[0.16em]', getCompetitionLabelClass(competition.competition_type))}>
                              {competition.competition_type === 'league' ? 'League' : 'Competition'}
                            </span>
                            {competition.competition_type !== 'league' ? (
                              <Badge variant={getCompetitionBadgeVariant(competition.competition_type)}>
                                {getCompetitionLabel(competition.competition_type)}
                              </Badge>
                            ) : null}
                          </div>
                          {competition.notes ? (
                            <div className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300 sm:text-sm">{competition.notes}</div>
                          ) : null}
                        </div>

                        <div className="flex shrink-0 items-center">
                          <Badge variant="outline" className="bg-white/80 dark:bg-slate-950/35">
                            {competition.short_name}
                          </Badge>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      {competition.divisions.map((division) => {
                        const teamsInDivision = membershipsByDivision[division.id] || [];
                        const divisionStandings = standingsByDivision[division.id] || [];
                        const standingsLookup = standingsByTeamId(divisionStandings);
                        const meta = divisionMeta(division);
                        const displayTeams = division.standings_enabled && divisionStandings.length > 0
                          ? divisionStandings
                              .map((entry) => {
                                const membership = teamsInDivision.find(({ team }) => team.id === entry.team_id);
                                return membership ? { team: membership.team, role: membership.role, standings: entry } : null;
                              })
                              .filter((row): row is { team: Team; role: string; standings: StandingsEntry } => row !== null)
                          : teamsInDivision.map(({ team, role }) => ({
                              team,
                              role,
                              standings: standingsLookup.get(team.id) ?? null,
                            }));
                        return (
                          <div
                            key={division.id}
                            className={cn(
                              'overflow-hidden rounded-2xl border shadow-sm',
                              getDivisionShellClass(competition.competition_type),
                            )}
                          >
                            <div
                              className={cn(
                                'border-b px-4 py-3',
                                getDivisionHeaderClass(competition.competition_type),
                              )}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className={cn(
                                    'inline-flex items-center rounded-full border border-white/70 bg-white/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] dark:border-white/10 dark:bg-slate-950/40',
                                    getCompetitionLabelClass(competition.competition_type),
                                  )}>
                                    Division
                                  </div>
                                  <div className={cn('mt-2 text-sm font-semibold sm:text-[15px]', getDivisionTitleClass(competition.competition_type))}>
                                    {division.name}
                                  </div>
                                  {meta ? (
                                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                      {meta}
                                    </div>
                                  ) : null}
                                </div>
                                <div className="flex shrink-0 items-center gap-2">
                                  {division.standings_enabled ? (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() => openDivisionStandings(division.id)}
                                      className={filterButtonClass}
                                    >
                                      <Trophy className="h-3.5 w-3.5" />
                                      Standings
                                    </Button>
                                  ) : null}
                                </div>
                              </div>
                            </div>

                            <div className="space-y-2 p-3 sm:p-4">
                              {displayTeams.length === 0 ? (
                                <div className="text-sm text-slate-500 dark:text-slate-400">No teams assigned.</div>
                              ) : (
                                displayTeams.map(({ team, standings }) => (
                                  <div
                                    key={`${division.id}:${team.id}`}
                                    className="rounded-xl border border-white/70 bg-white/80 px-3 py-2.5 dark:border-white/5 dark:bg-slate-950/35"
                                  >
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="flex min-w-0 items-center gap-3">
                                        <TeamLogo name={team.name} logoUrl={team.logo_url} className="h-10 w-10 rounded-xl" initialsClassName="text-xs" />
                                        <div className="min-w-0">
                                          <button
                                            type="button"
                                            onClick={() => openTeamDashboard(team)}
                                            className={`block max-w-full cursor-pointer truncate text-left text-sm font-medium text-slate-900 transition-colors hover:text-[color:var(--app-accent-link-hover)] dark:text-slate-100 ${accentLinkClass}`}
                                          >
                                            {team.name}
                                          </button>
                                          <div className="truncate text-xs text-slate-500 dark:text-slate-400">{team.association_name}</div>
                                        </div>
                                      </div>
                                      {division.standings_enabled && standings ? (
                                        <Badge variant="info" className="shrink-0">{standings.points} pts</Badge>
                                      ) : null}
                                    </div>
                                    {division.standings_enabled && standings ? (
                                      <div className="mt-2 grid grid-cols-4 gap-2 rounded-lg bg-slate-50/70 px-2.5 py-2 text-center dark:bg-slate-950/30">
                                        {[
                                          ['GP', standings.games_played],
                                          ['W', standings.wins],
                                          ['L', standings.losses],
                                          ['T', standings.ties],
                                        ].map(([label, value]) => (
                                          <div key={label}>
                                            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                              {label}
                                            </div>
                                            <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                                              {value}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    ) : null}
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

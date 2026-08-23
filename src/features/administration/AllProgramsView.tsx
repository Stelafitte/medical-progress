/**
 * « Tous les programmes » — vue en blocs des programmes réellement administrés
 * par la personne connectée. Elle ne donne aucun accès supplémentaire :
 * seuls les programmes où un rôle d'administrateur existe sont affichés.
 *
 * Un bandeau de filtres reste toujours visible : filière (initiale/continue),
 * état dérivé des cohortes, et fenêtre de dates.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SectionHeading } from "@/components/section-heading";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, MockBadge, PanelCard, ScopeNotice } from "@/features/professional/mock-ui";
import { useDataAccess, useSession } from "@/application/session";
import { canAccessProgramAdministration } from "@/domain/access";
import {
  COHORT_PHASE_LABELS_FR,
  buildAdministeredProgramCards,
  formatFrDate,
} from "@/features/administration/adminProgramViewModel";
import {
  EMPTY_ALL_PROGRAMS_FILTERS,
  PROGRAM_CATEGORIES_BY_TRACK,
  PROGRAM_CATEGORY_LABELS_FR,
  PROGRAM_LIFECYCLE_LABELS_FR,
  PROGRAM_TRACK_LABELS_FR,


  countByLifecycle,
  filterProgramCards,
  hasActiveFilters,
  programCategory,
  programLifecycle,
  programTrack,
  toggleFilterValue,
  type AllProgramsFilterState,
  type ProgramLifecycle,
  type ProgramTrack,
} from "@/features/administration/allProgramsFilters";

const TRACKS: readonly ProgramTrack[] = ["initial", "continuing"];
const LIFECYCLES: readonly ProgramLifecycle[] = [
  "construction",
  "launching",
  "running",
  "closed",
  "archived",
];

export function AllProgramsView() {
  const data = useDataAccess();
  const session = useSession();
  const navigate = useNavigate();
  const [filters, setFilters] = useState<AllProgramsFilterState>(EMPTY_ALL_PROGRAMS_FILTERS);

  const { data: cohorts, isPending } = useQuery({
    queryKey: ["all-programs-cohorts"],
    queryFn: () => data.programs.listCohorts(),
  });

  const cards = useMemo(
    () =>
      cohorts
        ? buildAdministeredProgramCards(session.programs, cohorts, (programId) =>
            canAccessProgramAdministration(session.roles, programId),
          )
        : [],
    [cohorts, session.programs, session.roles],
  );
  const counts = useMemo(() => countByLifecycle(cards), [cards]);
  const visible = useMemo(() => filterProgramCards(cards, filters), [cards, filters]);

  return (
    <div className="space-y-6">
      <SectionHeading
        title="Tous les programmes"
        level={1}
        action={<MockBadge />}
        description="Vue d'ensemble des programmes que vous administrez, avec leur classe active et leur prochaine échéance."
      />

      <ScopeNotice>
        Cette vue n'ouvre aucun droit supplémentaire : elle liste uniquement les programmes où vous
        possédez un rôle d'administrateur. Sélectionner un programme replace tout l'espace sur ce
        périmètre.
      </ScopeNotice>

      {/* Bandeau de filtres — toujours visible, y compris au défilement. */}
      <section
        aria-label="Filtres des programmes"
        className="sticky top-16 z-30 space-y-3 rounded-lg border border-border bg-card/95 p-4 backdrop-blur"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium">Filtres</p>
          <p className="text-xs text-muted-foreground">
            {visible.length} programme(s) affiché(s) sur {cards.length}
          </p>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Type de formation</p>
          <div className="flex flex-wrap items-center gap-2">
            {TRACKS.map((track) => {
              const active = filters.tracks.includes(track);
              return (
                <Button
                  key={track}
                  type="button"
                  size="sm"
                  variant={active ? "default" : "outline"}
                  aria-pressed={active}
                  className="min-h-11"
                  onClick={() =>
                    setFilters((prev) => ({
                      ...prev,
                      tracks: toggleFilterValue(prev.tracks, track),
                    }))
                  }
                >
                  {PROGRAM_TRACK_LABELS_FR[track]}
                </Button>
              );
            })}

            {/* Catégories : sous-niveau de la filière, groupées FMI puis FMC. */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  variant={filters.categories.length > 0 ? "default" : "outline"}
                  className="min-h-11"
                >
                  Catégories
                  {filters.categories.length > 0 ? (
                    <Badge variant="secondary" className="ml-2 font-normal">
                      {filters.categories.length}
                    </Badge>
                  ) : null}
                  <ChevronDown className="ml-1 h-4 w-4" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-60">
                {TRACKS.map((track, index) => (
                  <div key={track}>
                    {index > 0 ? <DropdownMenuSeparator /> : null}
                    <DropdownMenuLabel>{PROGRAM_TRACK_LABELS_FR[track]}</DropdownMenuLabel>
                    {PROGRAM_CATEGORIES_BY_TRACK[track].map((category) => (
                      <DropdownMenuCheckboxItem
                        key={category}
                        checked={filters.categories.includes(category)}
                        onCheckedChange={() =>
                          setFilters((prev) => ({
                            ...prev,
                            categories: toggleFilterValue(prev.categories, category),
                          }))
                        }
                      >
                        {PROGRAM_CATEGORY_LABELS_FR[category]}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </div>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {filters.categories.length > 0 ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="min-h-11"
                onClick={() => setFilters((prev) => ({ ...prev, categories: [] }))}
              >
                Effacer les catégories
              </Button>
            ) : null}
          </div>
        </div>


        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">État du programme</p>
          <div className="flex flex-wrap gap-2">
            {LIFECYCLES.map((lifecycle) => {
              const active = filters.lifecycles.includes(lifecycle);
              return (
                <Button
                  key={lifecycle}
                  type="button"
                  size="sm"
                  variant={active ? "default" : "outline"}
                  aria-pressed={active}
                  className="min-h-11"
                  onClick={() =>
                    setFilters((prev) => ({
                      ...prev,
                      lifecycles: toggleFilterValue(prev.lifecycles, lifecycle),
                    }))
                  }
                >
                  {PROGRAM_LIFECYCLE_LABELS_FR[lifecycle]}
                  <Badge variant="secondary" className="ml-2 font-normal">
                    {counts[lifecycle]}
                  </Badge>
                </Button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="filtre-date-debut" className="text-xs text-muted-foreground">
              Période : du
            </Label>
            <Input
              id="filtre-date-debut"
              type="date"
              className="min-h-11 w-44"
              value={filters.from}
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, from: event.target.value }))
              }
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="filtre-date-fin" className="text-xs text-muted-foreground">
              au
            </Label>
            <Input
              id="filtre-date-fin"
              type="date"
              className="min-h-11 w-44"
              value={filters.to}
              onChange={(event) => setFilters((prev) => ({ ...prev, to: event.target.value }))}
            />
          </div>
          {hasActiveFilters(filters) ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="min-h-11"
              onClick={() => setFilters(EMPTY_ALL_PROGRAMS_FILTERS)}
            >
              Réinitialiser les filtres
            </Button>
          ) : null}
        </div>
      </section>

      {isPending || !cohorts ? (
        <Skeleton className="h-64 w-full" />
      ) : cards.length === 0 ? (
        <EmptyState>Vous n'administrez aucun programme.</EmptyState>
      ) : visible.length === 0 ? (
        <EmptyState>Aucun programme ne correspond aux filtres sélectionnés.</EmptyState>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((card) => (
            <PanelCard
              key={card.program.id}
              title={card.program.name}
              description={`${card.program.institution} · ${card.program.code}`}
            >
              <div className="space-y-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="font-normal">
                    {PROGRAM_TRACK_LABELS_FR[programTrack(card.program.kind)]} ·{" "}
                    {PROGRAM_CATEGORY_LABELS_FR[programCategory(card.program)]}
                  </Badge>

                  <Badge variant="secondary" className="font-normal">
                    {PROGRAM_LIFECYCLE_LABELS_FR[programLifecycle(card)]}
                  </Badge>
                  <Badge variant="outline" className="font-normal">
                    {card.cohortCount} classe(s)
                  </Badge>
                  <Badge variant="outline" className="font-normal">
                    {card.learnerCount} apprenants
                  </Badge>
                  {card.phase ? (
                    <Badge variant="outline" className="font-normal">
                      Classe active {COHORT_PHASE_LABELS_FR[card.phase]}
                    </Badge>
                  ) : null}
                </div>

                {card.activeCohort ? (
                  <div className="space-y-1">
                    <p className="font-medium">{card.activeCohort.label}</p>
                    <Progress value={card.progressPercent} />
                    <p className="text-muted-foreground text-xs">
                      Avancement calendaire {card.progressPercent} %
                    </p>
                  </div>
                ) : (
                  <p className="text-muted-foreground">Aucune classe programmée.</p>
                )}

                {card.nextDeadline ? (
                  <p className="text-muted-foreground text-xs">
                    Prochaine échéance : {card.nextDeadline.label} le{" "}
                    {formatFrDate(card.nextDeadline.date)}
                  </p>
                ) : null}

                <Button
                  size="sm"
                  variant="outline"
                  className="min-h-11 w-full"
                  onClick={() => {
                    session.setActiveProgramId(card.program.id);
                    void navigate({ to: "/espace/administration" });
                  }}
                >
                  Ouvrir ce programme
                </Button>
              </div>
            </PanelCard>
          ))}
        </div>
      )}
    </div>
  );
}

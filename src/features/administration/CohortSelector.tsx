/**
 * Sélecteur de cohorte du pilotage.
 * Un programme est rejoué par plusieurs cohortes (parallèle ou séquence) :
 * aucun écran de pilotage ne suppose une cohorte unique.
 */
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Cohort } from "@/domain/types";
import { useCohortFocus } from "@/application/cohortFocusStore";
import {
  COHORT_PHASE_LABELS_FR,
  cohortPhase,
  cohortProgressRatio,
  daysUntil,
  formatFrDate,
  sortCohortsForPilot,
} from "@/features/administration/adminProgramViewModel";

export function CohortSelector({
  cohorts,
  value,
  onChange,
  label = "Cohorte pilotée",
  details = true,
}: {
  cohorts: readonly Cohort[];
  value: string | undefined;
  onChange: (cohortId: string) => void;
  label?: string;
  /** Dates et avancement sous le menu ; inutile quand l'écran les affiche déjà. */
  details?: boolean;
}) {
  const ordered = sortCohortsForPilot(cohorts);
  const selected = ordered.find((c) => c.id === value);
  /* 21/09 : une promotion choisie dans l'en-tête s'impose ; le menu interne
     ne revient qu'avec « Toutes les promotions ». Deux sélecteurs qui se
     contredisent seraient pires qu'un seul. */
  const focus = useCohortFocus();
  const imposee = focus !== null && focus === value && selected !== undefined;

  return (
    <section aria-label={label} className="border-border bg-card space-y-4 rounded-lg border p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 flex-1 space-y-1">
          <label htmlFor="cohort-selector" className="text-sm font-medium">
            {label}
          </label>
          {imposee ? (
            <p className="text-sm">
              <span className="inline-flex items-center rounded-full bg-sky-100 px-2.5 py-0.5 font-semibold text-sky-900 dark:bg-sky-950/50 dark:text-sky-100">
                {selected.label}
              </span>{" "}
              <span className="text-muted-foreground">
                choisie dans le menu « Promotion » en haut à droite.
              </span>
            </p>
          ) : (
            <Select value={value ?? ""} onValueChange={onChange}>
              <SelectTrigger id="cohort-selector" className="min-h-11 w-full sm:max-w-md">
                <SelectValue placeholder="Choisir une cohorte" />
              </SelectTrigger>
              <SelectContent>
                {ordered.map((cohort) => (
                  <SelectItem key={cohort.id} value={cohort.id}>
                    {cohort.label} · {COHORT_PHASE_LABELS_FR[cohortPhase(cohort)]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <p className="text-muted-foreground text-xs sm:max-w-xs">
          {ordered.length} cohorte(s) rattachée(s) à ce programme. Le pilotage se fait cohorte par
          cohorte.
        </p>
      </div>

      {selected && details ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="outline" className="bg-background font-normal">
              {COHORT_PHASE_LABELS_FR[cohortPhase(selected)]}
            </Badge>
            <span className="text-muted-foreground">
              {formatFrDate(selected.startsOn)} → {formatFrDate(selected.endsOn)}
            </span>
            <span className="text-muted-foreground">·</span>
            <span>{selected.learnerCount} apprenants</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">{selected.academicYear}</span>
          </div>
          <div className="space-y-1">
            <Progress value={Math.round(cohortProgressRatio(selected) * 100)} />
            <p className="text-muted-foreground text-xs">
              Avancement calendaire {Math.round(cohortProgressRatio(selected) * 100)} %
              {daysUntil(selected.endsOn) >= 0
                ? ` · clôture dans ${daysUntil(selected.endsOn)} jours`
                : " · cohorte terminée"}
            </p>
          </div>
        </div>
      ) : null}
    </section>
  );
}

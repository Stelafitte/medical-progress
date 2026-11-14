/**
 * Sélecteur de cohorte du pilotage.
 * Un programme est rejoué par plusieurs cohortes (parallèle ou séquence) :
 * aucun écran de pilotage ne suppose une cohorte unique.
 */
import { useState } from "react";
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
  isCohortClosed,
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
  /* 14/11 : les promotions clôturées ne sont plus proposées d'office — celle
     qui a fini son stage ne doit pas se mêler à celle qui est en cours. Une
     case les ramène pour les consulter ; et la promotion déjà choisie reste
     toujours dans le menu, sinon la valeur affichée serait vide. */
  const [voirClotures, setVoirClotures] = useState(false);
  const nbClotures = ordered.filter(isCohortClosed).length;
  const proposees = ordered.filter((c) => voirClotures || !isCohortClosed(c) || c.id === value);
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
                {proposees.map((cohort) => (
                  <SelectItem key={cohort.id} value={cohort.id}>
                    {cohort.label} ·{" "}
                    {isCohortClosed(cohort)
                      ? "clôturée"
                      : COHORT_PHASE_LABELS_FR[cohortPhase(cohort)]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {nbClotures > 0 ? (
            <label className="text-muted-foreground flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={voirClotures}
                onChange={(e) => setVoirClotures(e.target.checked)}
              />
              Afficher les promotions clôturées ({nbClotures})
            </label>
          ) : null}
        </div>
        <p className="text-muted-foreground text-xs sm:max-w-xs">
          {ordered.length - nbClotures} promotion(s) en cours ou à venir
          {nbClotures > 0 ? `, ${nbClotures} clôturée(s)` : ""}. Le pilotage se fait promotion par
          promotion.
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
              {isCohortClosed(selected) ? " · clôturée par l'administrateur" : ""}
            </p>
          </div>
        </div>
      ) : null}
    </section>
  );
}

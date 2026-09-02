/**
 * Le sceau, à l'étape 4 du Concepteur : ouvrir la promotion.
 *
 * CE QUE CETTE ÉTAPE ÉTAIT. Un lien. Son bouton « Piloter le programme »
 * s'allumait quand les étapes 1 à 3 étaient réglées, et n'écrivait rien —
 * `associated` était même un état local de React, perdu au rechargement.
 * Stef, le 02/09 : « pour valider mon programme tout juste conçu ». Il n'y
 * avait rien à valider parce qu'il n'y avait rien à écrire.
 *
 * POURQUOI CE PANNEAU LIT LES JALONS. Il pourrait se contenter d'appeler
 * `open_cohort` et d'afficher son refus. Mais un bouton qui ne s'éteint qu'APRÈS
 * le clic fait travailler pour rien : on relit donc le rétroplanning de la
 * promotion et on dit, avant, ce qui manque. Le serveur reste l'autorité —
 * il refait exactement les mêmes contrôles, et c'est lui qui écrit.
 */
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useDataAccess } from "@/application/session";
import { learningWeeks, type PlanMilestone } from "@/domain/acquisitionPlan";
import {
  COHORT_OPENING_ISSUE_LABELS_FR,
  canRevertToDraft,
  cohortOpeningIssues,
  describeOpeningReport,
  type CohortOpeningReport,
} from "@/domain/cohortOpening";
import { COHORT_STATUS_LABELS_FR, type Cohort } from "@/domain/types";

export function CohortSealPanel({
  cohort,
  onChanged,
}: {
  /** La promotion associée à l'étape 2. Absente = rien à sceller. */
  cohort: Cohort | undefined;
  onChanged: () => void;
}) {
  const dataAccess = useDataAccess();
  const [milestones, setMilestones] = useState<readonly PlanMilestone[] | null>(null);
  const [report, setReport] = useState<CohortOpeningReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const cohortId = cohort?.id;

  const load = useCallback(async () => {
    if (cohortId === undefined) return;
    try {
      setMilestones(await dataAccess.plan.listMilestones(cohortId));
    } catch {
      // Le rétroplanning illisible ne doit pas éteindre l'étape : le serveur
      // tranchera. On perd l'explication anticipée, pas le geste.
      setMilestones(null);
    }
  }, [cohortId, dataAccess]);

  useEffect(() => {
    setReport(null);
    setDone(null);
    setError(null);
    void load();
  }, [load]);

  if (cohort === undefined) {
    return (
      <p className="text-muted-foreground text-sm">
        Associez d'abord une promotion (étape 2) : c'est elle qu'on ouvre, pas le programme.
      </p>
    );
  }

  const weeks = learningWeeks(cohort.startsOn, cohort.endsOn);
  const outcomeCount = (milestones ?? []).reduce((sum, m) => sum + m.outcomeIds.length, 0);
  const lastWeek = (milestones ?? []).reduce<number | undefined>((last, m) => {
    const end = m.weekOffsetEnd ?? m.weekOffset;
    return last === undefined || end > last ? end : last;
  }, undefined);

  const issues = cohortOpeningIssues({
    status: cohort.status,
    milestoneCount: milestones?.length ?? 0,
    outcomeCount,
    ...(lastWeek === undefined ? {} : { lastMilestoneWeek: lastWeek }),
    promotionLastWeek: weeks.lastWeek,
  });
  /* Rétroplanning illisible : on n'invente pas de refus, le serveur décidera. */
  const blocked = milestones === null ? cohort.status !== "draft" : issues.length > 0;
  const opened = cohort.status !== "draft";

  async function run(dryRun: boolean) {
    if (cohort === undefined) return;
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const result = await dataAccess.programs.openCohort(cohort.id, { dryRun });
      if (dryRun) setReport(result);
      else {
        setReport(null);
        setDone(describeOpeningReport(result));
        onChanged();
      }
    } catch (reason) {
      setReport(null);
      setError(reason instanceof Error ? reason.message : "Ouverture impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function revert() {
    if (cohort === undefined) return;
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      await dataAccess.programs.revertCohortToDraft(cohort.id);
      setDone(`${cohort.label} est revenue en conception.`);
      onChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Retour en conception impossible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm">
        {cohort.label}
        <Badge variant={opened ? "default" : "outline"} className="ms-2 font-normal">
          {COHORT_STATUS_LABELS_FR[cohort.status]}
        </Badge>
      </p>

      {opened ? null : (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={busy || blocked}
            onClick={() => void run(true)}
          >
            Vérifier avant d'ouvrir
          </Button>
          <Button
            type="button"
            className="min-h-11"
            disabled={busy || blocked}
            onClick={() => void run(false)}
          >
            Ouvrir la promotion
          </Button>
        </div>
      )}

      {opened && canRevertToDraft(cohort.status) ? (
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          disabled={busy}
          onClick={() => void revert()}
        >
          Revenir en conception
        </Button>
      ) : null}

      {issues.length > 0 ? (
        <ul className="text-muted-foreground space-y-1 text-xs">
          {issues.map((issue) => (
            <li key={issue}>{COHORT_OPENING_ISSUE_LABELS_FR[issue]}</li>
          ))}
        </ul>
      ) : null}

      {report ? (
        <p className="text-sm">
          <Badge variant="outline" className="me-2 font-normal">
            Vérification
          </Badge>
          {describeOpeningReport(report, { dryRun: true })}
        </p>
      ) : null}

      {done ? <p className="text-sm">{done}</p> : null}
      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      <p className="text-muted-foreground text-xs">
        Ouvrir ne ferme aucun écran de conception : le référentiel et les jalons restent modifiables
        à tout moment, et le sceau se retire. Ce qui change, c'est que la promotion cesse d'être un
        brouillon pour le reste du produit, et que le nom et les objectifs de son modèle se figent.
      </p>
    </div>
  );
}

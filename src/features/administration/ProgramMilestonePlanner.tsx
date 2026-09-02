/**
 * Le rétroplanning d'une promotion, chapitre par chapitre.
 *
 * CE QUE CET ÉCRAN REMPLACE. Le Concepteur affichait « Échéances des éléments
 * du programme » : deux lignes génériques par type de ressource (« Ouverture
 * des QCM de connaissance », « Attendus des compétences »), programmables à la
 * date près… et enregistrées nulle part, sinon dans le brouillon JSON de
 * conception. Pendant ce temps la table `plan_milestones` existait, complète,
 * sans qu'aucune ligne de code ne l'appelle. Stef a testé et a dit : « je ne
 * vois pas comment rentrer ces données ». Il n'y avait effectivement nulle part
 * où elles allaient.
 *
 * TROIS RÈGLES QUI EXPLIQUENT LA FORME DE CET ÉCRAN.
 *
 * 1. **Une ligne par CHAPITRE, pas par acquis.** « Valvulopathies », pas
 *    « Rétrécissement aortique ». Le chapitre est le regroupement qui existe
 *    déjà, et la table est faite pour ça : un jalon porte un paquet d'acquis,
 *    qui héritent de sa date. 22 lignes plutôt que 327.
 * 2. **Des semaines, pas des dates.** On saisit « semaine 4 », et l'écran
 *    affiche la date que cela donne pour CETTE promotion. Rejouer le même
 *    rétroplanning l'année suivante ne demandera que de changer la date de la
 *    classe — c'est la raison d'être du modèle, et la saisir en dates la
 *    perdrait.
 * 3. **Une promotion à la fois.** Un jalon appartient à une cohorte : « semaine
 *    4 » n'a de sens que pour un stage donné, et le même programme peut porter
 *    un rétroplanning différent d'une promo à l'autre.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/features/professional/mock-ui";
import { useDataAccess } from "@/application/session";
import {
  PLAN_MILESTONE_ISSUE_LABELS_FR,
  PLAN_MILESTONE_MAX_WEEK,
  chronologicalThemeOrder,
  milestoneDateFor,
  planMilestoneIntent,
  validatePlanMilestone,
  type MilestoneTiming,
  type PlanMilestone,
  type PlanMilestoneId,
} from "@/domain/acquisitionPlan";
import { formatFrDate } from "@/features/administration/adminProgramViewModel";
import { ProgramMilestoneGantt } from "@/features/administration/ProgramMilestoneGantt";
import type { Cohort, CohortId, Outcome, OutcomeTheme } from "@/domain/types";

const TIMING_LABELS: Record<MilestoneTiming["kind"], string> = {
  week: "Semaine unique",
  period: "Période",
  undated: "Non daté",
};

const EMPTY: MilestoneTiming = { kind: "undated" };

/** Le jalon enregistré, ramené à la forme éditée à l'écran. */
function timingFromMilestone(milestone: PlanMilestone): MilestoneTiming {
  if (milestone.weekOffsetEnd === undefined) {
    return { kind: "week", from: String(milestone.weekOffset) };
  }
  return {
    kind: "period",
    from: String(milestone.weekOffset),
    to: String(milestone.weekOffsetEnd),
  };
}

function weekNumber(value: string): number | undefined {
  if (value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
}

export function ProgramMilestonePlanner({
  cohorts,
  themes,
  outcomes,
  defaultCohortId,
}: {
  cohorts: readonly Cohort[];
  themes: readonly OutcomeTheme[];
  outcomes: readonly Outcome[];
  defaultCohortId?: CohortId;
}) {
  const dataAccess = useDataAccess();
  const [cohortId, setCohortId] = useState<string>(defaultCohortId ?? cohorts[0]?.id ?? "");
  const [timings, setTimings] = useState<Record<string, MilestoneTiming>>({});
  const [existing, setExisting] = useState<readonly PlanMilestone[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const cohort = cohorts.find((c) => c.id === cohortId);

  /**
   * Les acquis RETENUS de chaque chapitre.
   *
   * Retenus seulement : un acquis hors parcours n'apparaît pas dans le
   * passeport de l'étudiant, le dater n'aurait donc aucun effet visible.
   */
  const outcomesByTheme = useMemo(() => {
    const map = new Map<string, Outcome[]>();
    for (const outcome of outcomes) {
      if (outcome.themeId === undefined || outcome.retainedAt === null) continue;
      const list = map.get(outcome.themeId) ?? [];
      list.push(outcome);
      map.set(outcome.themeId, list);
    }
    return map;
  }, [outcomes]);

  const ordered = useMemo(() => [...themes].sort((a, b) => a.position - b.position), [themes]);

  /**
   * L'ordre d'AFFICHAGE, chronologique — distinct de `ordered`, qui reste
   * l'ordre du référentiel.
   *
   * Les deux ne peuvent pas être confondus : `ordered` alimente
   * `planMilestoneIntent` et la `position` écrite en base, qui doit rester
   * celle du référentiel. Trier la liste ne doit pas renuméroter les jalons.
   */
  const displayed = useMemo(
    () => chronologicalThemeOrder(ordered, existing ?? []),
    [ordered, existing],
  );

  const load = useCallback(async () => {
    if (cohortId === "") return;
    setError(null);
    try {
      const found = await dataAccess.plan.listMilestones(cohortId as CohortId);
      setExisting(found);
      /*
       * On rapproche un jalon de son chapitre par l'INTITULÉ. C'est ce qui
       * permet de rouvrir l'écran et de retrouver ce qu'on avait posé, sans
       * ajouter une colonne `theme_id` à la table pour un rapprochement que le
       * libellé suffit à porter. Renommer un chapitre détache son jalon : le
       * bloc « Jalons sans chapitre » ci-dessous le rend visible plutôt que de
       * le laisser disparaître.
       */
      const next: Record<string, MilestoneTiming> = {};
      for (const theme of themes) {
        const match = found.find((m) => m.label === theme.label);
        if (match) next[theme.id] = timingFromMilestone(match);
      }
      setTimings(next);
    } catch (reason) {
      setExisting([]);
      setError(reason instanceof Error ? reason.message : "Lecture du rétroplanning impossible.");
    }
  }, [cohortId, dataAccess, themes]);

  useEffect(() => {
    void load();
  }, [load]);

  const patch = (themeId: string, next: MilestoneTiming) => {
    setTimings((prev) => ({ ...prev, [themeId]: next }));
    setDone(null);
  };

  /**
   * Ce qu'un clic sur « Enregistrer » va faire — calculé par le domaine, pas
   * ici. Les suppressions sont la raison de ce détour : elles se testent.
   */
  const intent = planMilestoneIntent(ordered, timings, existing ?? []);

  const issuesFor = (themeId: string) => {
    const timing = timings[themeId] ?? EMPTY;
    if (timing.kind === "undated") return [];
    const from = weekNumber(timing.from);
    if (from === undefined) return [];
    const to = timing.kind === "period" ? weekNumber(timing.to) : undefined;
    const theme = ordered.find((t) => t.id === themeId);
    return validatePlanMilestone({
      label: theme?.label ?? "",
      weekOffset: from,
      ...(to === undefined ? {} : { weekOffsetEnd: to }),
    });
  };

  const blocked = ordered.some((theme) => issuesFor(theme.id).length > 0);

  /** Chapitres dont le jalon enregistré va disparaître. */
  const doomed = new Set(
    intent.toDelete.flatMap((milestone) => {
      const theme = ordered.find((t) => t.label === milestone.label);
      return theme ? [theme.id] : [];
    }),
  );
  const nothingToDo = intent.toWrite.length === 0 && intent.toDelete.length === 0;

  async function save() {
    if (cohortId === "" || blocked) return;
    setSaving(true);
    setError(null);
    setDone(null);
    try {
      for (const [index, entry] of intent.toWrite.entries()) {
        const milestone = entry.milestoneId
          ? await dataAccess.plan.updateMilestone({
              milestoneId: entry.milestoneId,
              weekOffset: entry.weekOffset,
              position: index,
              // Repasser d'une période à une semaine unique DOIT effacer la
              // fin : sans ce drapeau, `undefined` voudrait dire « inchangé »
              // et le jalon resterait étalé sans que rien ne l'explique.
              ...(entry.weekOffsetEnd === undefined
                ? { clearWeekOffsetEnd: true }
                : { weekOffsetEnd: entry.weekOffsetEnd }),
            })
          : await dataAccess.plan.createMilestone({
              cohortId: cohortId as CohortId,
              label: entry.label,
              weekOffset: entry.weekOffset,
              position: index,
              ...(entry.weekOffsetEnd === undefined ? {} : { weekOffsetEnd: entry.weekOffsetEnd }),
            });
        await dataAccess.plan.setMilestoneOutcomes(
          milestone.id,
          (outcomesByTheme.get(entry.themeId) ?? []).map((outcome) => outcome.id),
        );
      }
      /*
       * Les suppressions APRÈS les écritures. Si quelque chose casse en cours
       * de route, on aura trop de jalons plutôt que trop peu — un jalon en
       * trop se voit et se retire, un jalon disparu ne se réclame pas.
       */
      for (const milestone of intent.toDelete) {
        await dataAccess.plan.deleteMilestone(milestone.id);
      }
      await load();
      const parts = [`${intent.toWrite.length} jalon(s) enregistré(s)`];
      if (intent.toDelete.length > 0) parts.push(`${intent.toDelete.length} supprimé(s)`);
      setDone(`${parts.join(", ")} pour ${cohort?.label ?? "cette promotion"}.`);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Enregistrement du rétroplanning impossible.",
      );
    } finally {
      setSaving(false);
    }
  }

  /**
   * Suppression d'un jalon orphelin, à l'unité.
   *
   * Séparée de l'enregistrement à dessein : un orphelin n'appartient plus à
   * aucun chapitre, donc aucune case de cet écran ne le représente, donc
   * l'emporter dans un enregistrement global serait le supprimer sans que
   * personne ne l'ait demandé.
   */
  async function removeOrphan(milestoneId: PlanMilestoneId) {
    setError(null);
    setDone(null);
    setDeleting(milestoneId);
    try {
      await dataAccess.plan.deleteMilestone(milestoneId);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Suppression du jalon impossible.");
    } finally {
      setDeleting(null);
    }
  }

  if (cohorts.length === 0) {
    return (
      <EmptyState>
        Aucune promotion sur ce programme : un jalon appartient à une classe, créez-en une d'abord.
      </EmptyState>
    );
  }

  if (themes.length === 0) {
    return (
      <EmptyState>
        Ce programme n'a pas de chapitre. Le rétroplanning se pose chapitre par chapitre : importez
        d'abord un référentiel rangé par thèmes.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="milestone-cohort">Promotion</Label>
          <select
            id="milestone-cohort"
            className="border-border bg-background min-h-11 max-w-xs rounded-md border px-2 text-sm"
            value={cohortId}
            onChange={(event) => {
              setCohortId(event.target.value);
              setExisting(null);
              setDone(null);
            }}
          >
            {cohorts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        {cohort ? (
          <p className="text-muted-foreground pb-2 text-sm">
            Semaine 0 = {formatFrDate(cohort.startsOn)}. Les semaines se comptent depuis cette date
            : changer la date de la classe décale tout le rétroplanning.
          </p>
        ) : null}
      </div>

      <ul className="space-y-2">
        {displayed.map((theme) => {
          const timing = timings[theme.id] ?? EMPTY;
          const issues = issuesFor(theme.id);
          const retained = outcomesByTheme.get(theme.id)?.length ?? 0;
          const from = timing.kind === "undated" ? undefined : weekNumber(timing.from);
          return (
            <li key={theme.id} className="border-border rounded-md border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <CalendarDays className="text-muted-foreground size-4" aria-hidden />
                <span className="text-sm font-medium">{theme.label}</span>
                <Badge variant="outline" className="font-normal">
                  {retained} acquis retenu(s)
                </Badge>
                {/*
                  La date réelle, affichée à côté de la semaine saisie. C'est ce
                  qui rend « semaine 4 » vérifiable sans compter sur ses doigts,
                  tout en gardant la semaine comme donnée enregistrée.
                */}
                {doomed.has(theme.id) ? (
                  <span className="text-destructive text-xs">
                    son jalon sera supprimé à l'enregistrement
                  </span>
                ) : null}
                {cohort && from !== undefined ? (
                  <span className="text-muted-foreground text-xs">
                    → {formatFrDate(milestoneDateFor(cohort.startsOn, from))}
                    {timing.kind === "period" && weekNumber(timing.to) !== undefined
                      ? ` au ${formatFrDate(milestoneDateFor(cohort.startsOn, weekNumber(timing.to)!))}`
                      : ""}
                  </span>
                ) : null}
              </div>

              <div
                role="group"
                aria-label={`Programmation — ${theme.label}`}
                className="mt-2 flex flex-wrap items-end gap-2"
              >
                {(Object.keys(TIMING_LABELS) as MilestoneTiming["kind"][]).map((kind) => (
                  <Button
                    key={kind}
                    type="button"
                    size="sm"
                    className="min-h-11"
                    variant={timing.kind === kind ? "default" : "outline"}
                    aria-pressed={timing.kind === kind}
                    onClick={() =>
                      patch(
                        theme.id,
                        kind === "undated"
                          ? { kind: "undated" }
                          : kind === "week"
                            ? { kind: "week", from: timing.kind === "undated" ? "" : timing.from }
                            : {
                                kind: "period",
                                from: timing.kind === "undated" ? "" : timing.from,
                                to: timing.kind === "period" ? timing.to : "",
                              },
                      )
                    }
                  >
                    {TIMING_LABELS[kind]}
                  </Button>
                ))}

                {timing.kind !== "undated" ? (
                  <div className="space-y-1">
                    <Label
                      htmlFor={`ms-${theme.id}-from`}
                      className="text-muted-foreground text-xs"
                    >
                      {timing.kind === "period" ? "Semaine de début" : "Semaine"}
                    </Label>
                    <Input
                      id={`ms-${theme.id}-from`}
                      type="number"
                      min={0}
                      max={PLAN_MILESTONE_MAX_WEEK}
                      value={timing.from}
                      className="min-h-11 w-24"
                      onChange={(event) => patch(theme.id, { ...timing, from: event.target.value })}
                    />
                  </div>
                ) : null}

                {timing.kind === "period" ? (
                  <div className="space-y-1">
                    <Label htmlFor={`ms-${theme.id}-to`} className="text-muted-foreground text-xs">
                      Semaine de fin
                    </Label>
                    <Input
                      id={`ms-${theme.id}-to`}
                      type="number"
                      min={0}
                      max={PLAN_MILESTONE_MAX_WEEK}
                      value={timing.to}
                      className="min-h-11 w-24"
                      onChange={(event) => patch(theme.id, { ...timing, to: event.target.value })}
                    />
                  </div>
                ) : null}
              </div>

              {issues.length > 0 ? (
                <ul className="text-destructive mt-2 space-y-1 text-xs">
                  {issues.map((issue) => (
                    <li key={issue}>{PLAN_MILESTONE_ISSUE_LABELS_FR[issue]}</li>
                  ))}
                </ul>
              ) : null}

              {/*
                Le contenu du jalon, dépliable pour VÉRIFIER — sans cases.
                Décision de Stef : on veut voir ce que le jalon emporte, pas
                trier acquis par acquis. Un jalon prend TOUS les acquis retenus
                de son chapitre, et cette liste est le seul moyen de s'en
                assurer autrement que sur parole.

                Replié par défaut : le but du rangement par chapitre est de
                montrer 29 titres plutôt que 390 lignes, et un dépliant ouvert
                d'office le défait.
              */}
              {retained > 0 ? (
                <details className="mt-2">
                  <summary className="text-muted-foreground cursor-pointer text-xs">
                    Voir les {retained} acquis que ce jalon emporte
                  </summary>
                  <ul className="mt-2 space-y-1 ps-4">
                    {(outcomesByTheme.get(theme.id) ?? []).map((outcome) => (
                      <li key={outcome.id} className="flex flex-wrap items-center gap-2 text-xs">
                        {outcome.knowledgeRank ? (
                          <Badge variant="outline" className="font-mono text-[10px] font-normal">
                            {outcome.knowledgeRank}
                          </Badge>
                        ) : null}
                        <span className="text-muted-foreground">
                          {outcome.code} — {outcome.label}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : (
                <p className="text-muted-foreground mt-2 text-xs">
                  Aucun acquis retenu dans ce chapitre : le dater ne changerait rien au passeport de
                  l'étudiant.
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {intent.orphans.length > 0 ? (
        <div className="border-border rounded-md border border-dashed p-3">
          <p className="text-sm font-medium">Jalons sans chapitre</p>
          <p className="text-muted-foreground text-xs">
            Enregistrés pour cette promotion, mais plus rattachés à aucun chapitre — un chapitre
            renommé, en général. L'enregistrement ne les touche pas : ils se suppriment ici, un par
            un, parce qu'aucune case de cet écran ne les représente.
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            {intent.orphans.map((milestone) => (
              <li key={milestone.id} className="flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground">
                  {milestone.label} — semaine {milestone.weekOffset}
                  {milestone.weekOffsetEnd === undefined ? "" : ` à ${milestone.weekOffsetEnd}`}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="min-h-11"
                  disabled={deleting === milestone.id || saving}
                  onClick={() => void removeOrphan(milestone.id)}
                >
                  {deleting === milestone.id ? "Suppression…" : "Supprimer ce jalon"}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          className="min-h-11"
          disabled={saving || blocked || nothingToDo}
          onClick={() => void save()}
        >
          {saving
            ? "Enregistrement…"
            : intent.toDelete.length > 0
              ? `Enregistrer le rétroplanning (${intent.toWrite.length} jalon(s), ${intent.toDelete.length} suppression(s))`
              : `Enregistrer le rétroplanning (${intent.toWrite.length})`}
        </Button>
        {done ? <span className="text-muted-foreground text-sm">{done}</span> : null}
      </div>

      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      {cohort && existing ? (
        <ProgramMilestoneGantt milestones={existing} cohortStartsOn={cohort.startsOn} />
      ) : null}

      <p className="text-muted-foreground text-xs">
        Repasser un chapitre en « non daté », ou vider sa semaine, SUPPRIME son jalon à
        l'enregistrement : sinon « non daté » mentirait, et l'échéance resterait dans le passeport
        de l'étudiant. La ligne concernée le dit avant que vous n'enregistriez, et le bouton compte
        les suppressions. Un chapitre qui n'avait pas de jalon ne fait rien de plus.
      </p>
    </div>
  );
}

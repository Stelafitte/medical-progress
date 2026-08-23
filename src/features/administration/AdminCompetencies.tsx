/**
 * « Compétences » — savoir-faire à acquérir en stage ou en simulation.
 * Une seule page déroulante, sans onglets : le référentiel, puis la création
 * (import en masse d'abord, saisie manuelle ensuite), puis — tout en bas — le
 * suivi d'acquisition rattaché à une classe et à ses apprenants.
 * Les états affichés sont une maquette déterministe (aucune donnée réelle).
 */
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  EmptyState,
  MockBadge,
  PanelCard,
  ScopeNotice,
  StatCard,
} from "@/features/professional/mock-ui";
import { CohortSelector } from "@/features/administration/CohortSelector";
import { personNameFor, useProgramAdmin } from "@/features/administration/useProgramAdmin";
import { defaultPilotCohortId } from "@/features/administration/adminProgramViewModel";
import {
  REFERENTIAL_DIFF_LABELS_FR,
  buildCompetenceCoverage,
  buildLearnerCompetenceRows,
  competenceOutcomes,
  diffReferentialRows,
  parseReferentialText,
} from "@/features/administration/competenceTrackingViewModel";
import { NATURE_LABELS_FR } from "@/domain/mastery";
import { CompetenceCreationForm } from "@/features/administration/CompetenceCreationForm";
import { createLocalCompetence, useLocalCompetences } from "@/application/competenceDraftStore";
import {
  COMPETENCE_MASTERY_LABELS_FR,
  EMPTY_NEW_COMPETENCE_INPUT,
  mergeOutcomes,
  type CompetenceNature,
} from "@/domain/competenceDraft";
import type { CurriculumVersionId, ProgramId } from "@/domain/types";

export function AdminCompetencies() {
  const { data, isPending } = useProgramAdmin();
  const [cohortId, setCohortId] = useState<string | null>(null);
  const [importText, setImportText] = useState("");
  const [imported, setImported] = useState<number | null>(null);
  const localCompetences = useLocalCompetences(data?.program?.id);

  const cohorts = data?.cohorts ?? [];
  const selectedId = cohortId ?? defaultPilotCohortId(cohorts);
  const enrollments = (data?.enrollments ?? []).filter((e) => e.cohortId === selectedId);
  /** Liste UNIQUE : compétences du dépôt et compétences créées dans la session. */
  const outcomes = useMemo(
    () => mergeOutcomes(data?.outcomes ?? [], localCompetences),
    [data?.outcomes, localCompetences],
  );
  const programId = (data?.program?.id ?? "program-unknown") as ProgramId;
  const curriculumVersionId = (data?.versions[0]?.id ?? "cv-unknown") as CurriculumVersionId;

  const learnerRows = useMemo(
    () => buildLearnerCompetenceRows(enrollments, outcomes),
    [enrollments, outcomes],
  );
  const coverage = useMemo(
    () => buildCompetenceCoverage(enrollments, outcomes),
    [enrollments, outcomes],
  );
  const parsed = useMemo(() => parseReferentialText(importText), [importText]);
  /** Prévisualisation des conflits : nouvelles, déjà présentes, inchangées, ignorées. */
  const diff = useMemo(() => diffReferentialRows(parsed, outcomes), [parsed, outcomes]);

  if (isPending || !data) return <Skeleton className="h-80 w-full" />;

  const scoped = competenceOutcomes(outcomes);
  const simulated = scoped.filter((o) => o.nature === "simulated_competence");
  const real = scoped.filter((o) => o.nature === "real_competence");
  const averagePercent =
    learnerRows.length === 0
      ? 0
      : Math.round(learnerRows.reduce((n, r) => n + r.percent, 0) / learnerRows.length);
  const selectedCohort = cohorts.find((cohort) => cohort.id === selectedId) ?? null;

  return (
    <div className="space-y-6">
      <SectionHeading
        title="Compétences"
        level={1}
        action={<MockBadge />}
        description="Savoir-faire à acquérir en stage ou en simulation : référentiel, création par import ou à la main, puis suivi d'acquisition par classe."
      />

      <ScopeNotice>
        Une compétence en situation réelle ne peut jamais être déclarée acquise par l'apprenant
        seul : la validation par un tiers habilité est obligatoire. Les états affichés ici sont
        simulés de façon déterministe.
      </ScopeNotice>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={NATURE_LABELS_FR.simulated_competence} value={simulated.length} />
        <StatCard label={NATURE_LABELS_FR.real_competence} value={real.length} />
        <StatCard label="Apprenants suivis" value={enrollments.length} />
        <StatCard label="Acquisition moyenne" value={`${averagePercent} %`} />
      </div>

      {/* 1. Le référentiel en place */}
      <SectionHeading title="Référentiel de compétences" level={2} />
      <div className="grid gap-4 md:grid-cols-2">
        {(["simulated_competence", "real_competence"] as const).map((nature) => {
          const list = scoped.filter((o) => o.nature === nature);
          return (
            <PanelCard
              key={nature}
              title={NATURE_LABELS_FR[nature]}
              description={`${list.length} compétence(s) configurée(s)`}
            >
              <ul className="space-y-1 text-sm">
                {list.map((outcome) => (
                  <li key={outcome.id} className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="font-mono text-[10px]">
                      {outcome.code}
                    </Badge>
                    <span>{outcome.label}</span>
                    <span className="text-muted-foreground text-xs">
                      cible {COMPETENCE_MASTERY_LABELS_FR[outcome.targetMastery]}
                    </span>
                    {localCompetences.some((local) => local.id === outcome.id) ? (
                      <Badge variant="outline" className="font-normal">
                        créée dans cette session
                      </Badge>
                    ) : null}
                  </li>
                ))}
                {list.length === 0 ? (
                  <li className="text-muted-foreground">Aucune compétence.</li>
                ) : null}
              </ul>
            </PanelCard>
          );
        })}
      </div>

      {/* 2. Création : l'import passe AVANT la saisie manuelle, dans le même bloc. */}
      <SectionHeading
        title="Ajouter des compétences"
        level={2}
        description="Deux voies pour alimenter la même liste : coller un référentiel existant, ou saisir une compétence à la main."
      />

      <PanelCard
        title="Voie rapide — coller un référentiel"
        description="Un tableau CSV/TSV : code, intitulé, nature (connaissance, simulation, réelle). Analyse locale uniquement, rien n'est envoyé."
        action={<MockBadge />}
      >
        <Textarea
          value={importText}
          onChange={(event) => setImportText(event.target.value)}
          rows={6}
          placeholder={"C-12;Coupe parasternale grand axe;simulation\nC-13;Mesure du VTI;réelle"}
          aria-label="Référentiel à importer"
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{parsed.length} ligne(s) reconnue(s)</Badge>
          <Badge variant="outline">{diff.newCount} nouvelle(s)</Badge>
          <Badge variant="outline">{diff.changedCount} déjà présente(s)</Badge>
          <Badge variant="outline">{diff.unchangedCount} inchangée(s)</Badge>
          <Badge variant="outline">{diff.ignoredCount} ignorée(s)</Badge>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            className="min-h-11"
            disabled={diff.newCount === 0}
            onClick={() => {
              let added = 0;
              for (const row of diff.rows) {
                if (row.kind !== "new") continue;
                const outcome = createLocalCompetence({
                  input: {
                    ...EMPTY_NEW_COMPETENCE_INPUT,
                    code: row.code,
                    label: row.label,
                    nature: row.nature as CompetenceNature,
                  },
                  programId,
                  curriculumVersionId,
                });
                if (outcome) added += 1;
              }
              setImported(added);
              setImportText("");
            }}
          >
            Ajouter les {diff.newCount} nouvelle(s) compétence(s)
          </Button>
          <Button size="sm" variant="ghost" className="min-h-11" onClick={() => setImportText("")}>
            Effacer
          </Button>
          {imported !== null ? (
            <span className="text-muted-foreground text-sm">
              {imported} compétence(s) ajoutée(s) au référentiel de cette session.
            </span>
          ) : null}
        </div>
        <p className="text-muted-foreground mt-2 text-xs">
          Seules les lignes nouvelles sont ajoutées : un code déjà présent n'écrase jamais le
          référentiel en place, et les lignes de nature « connaissance » ou non précisée relèvent de
          l'onglet « Base de connaissances ». Rattachement à la version active (
          {curriculumVersionId}).
        </p>
        {diff.rows.length > 0 ? (
          <ul className="mt-4 space-y-1 text-sm">
            {diff.rows.slice(0, 20).map((row, index) => (
              <li key={`${row.code}-${index}`} className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="font-mono text-[10px]">
                  {row.code}
                </Badge>
                <span>{row.label}</span>
                <span className="text-muted-foreground text-xs">
                  {row.nature === "unknown" ? "nature à préciser" : NATURE_LABELS_FR[row.nature]}
                </span>
                <Badge
                  variant={row.kind === "new" ? "secondary" : "outline"}
                  className="font-normal"
                >
                  {REFERENTIAL_DIFF_LABELS_FR[row.kind]}
                </Badge>
                {row.kind === "changed" && row.existingLabel ? (
                  <span className="text-muted-foreground text-xs">
                    actuellement « {row.existingLabel} »
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </PanelCard>

      <PanelCard
        title="Voie manuelle — créer une compétence"
        description="Le même outil de création est disponible ici et dans le « Concepteur de programme » : la liste est unique."
        action={<MockBadge />}
      >
        <CompetenceCreationForm
          programId={programId}
          curriculumVersionId={curriculumVersionId}
          idPrefix="competences-tab"
          submitLabel="Créer la compétence"
          hint="La compétence rejoint la liste unique : elle est aussitôt proposée dans le « Concepteur de programme »."
        />
      </PanelCard>

      <PanelCard
        title="Là où ces compétences se travaillent et se prouvent"
        description="Une compétence se prouve en stage, en simulation ou lors d'une évaluation : les modalités se règlent dans les onglets dédiés."
      >
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" className="min-h-11">
            <Link to="/espace/administration/stages">
              Terrains de stage et validation
              <ArrowRight className="ms-1 size-4" aria-hidden />
            </Link>
          </Button>
          <Button asChild variant="outline" className="min-h-11">
            <Link to="/espace/administration/evaluations">
              Évaluations et ECOS
              <ArrowRight className="ms-1 size-4" aria-hidden />
            </Link>
          </Button>
        </div>
      </PanelCard>

      {/* 3. Tout en bas : le suivi, rattaché à une classe et à ses apprenants. */}
      <SectionHeading
        title="Suivi d'acquisition"
        level={2}
        description="Le suivi n'appartient pas à la conception : il se lit toujours pour une classe donnée et ses apprenants."
      />

      <CohortSelector cohorts={cohorts} value={selectedId} onChange={setCohortId} />

      <PanelCard
        title={
          selectedCohort
            ? `Apprenants de la classe « ${selectedCohort.label} »`
            : "Apprenants de la classe"
        }
        description="Vue de lecture. Les décisions d'exploitation (relances, validations, affectations) se prennent dans le Pilotage."
      >
        {learnerRows.length === 0 ? (
          <EmptyState>Aucun apprenant inscrit sur cette classe.</EmptyState>
        ) : (
          <ul className="space-y-2 text-sm">
            {learnerRows.map((row) => (
              <li key={row.enrollmentId} className="border-border space-y-2 rounded-md border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{personNameFor(data, row.enrollmentId)}</span>
                  <Badge variant="secondary" className="font-normal">
                    {row.validated} validée(s)
                  </Badge>
                  <Badge variant="outline" className="font-normal">
                    {row.declared} en attente de validation
                  </Badge>
                  <Badge variant="outline" className="font-normal">
                    {row.notStarted} non commencée(s)
                  </Badge>
                </div>
                <Progress value={row.percent} />
                <p className="text-muted-foreground text-xs">
                  {row.percent} % des {row.total} compétence(s) du référentiel
                </p>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button asChild variant="outline" className="min-h-11">
            <Link to="/espace/administration/pilotage">
              Agir sur cette promotion dans Pilotage
              <ArrowRight className="ms-1 size-4" aria-hidden />
            </Link>
          </Button>
          <Button asChild variant="outline" className="min-h-11">
            <Link to="/espace/administration/classes">
              Composition des classes
              <ArrowRight className="ms-1 size-4" aria-hidden />
            </Link>
          </Button>
        </div>
      </PanelCard>

      <PanelCard
        title="Couverture par compétence"
        description="Repérer les savoir-faire que la classe n'acquiert pas."
      >
        {coverage.length === 0 ? (
          <EmptyState>Aucune compétence à suivre.</EmptyState>
        ) : (
          <ul className="space-y-2 text-sm">
            {[...coverage]
              .sort((a, b) => a.percent - b.percent)
              .map((row) => (
                <li key={row.outcomeId} className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {row.code}
                    </Badge>
                    <span>{row.label}</span>
                    <span className="text-muted-foreground text-xs">
                      {row.validatedLearners} validées · {row.declaredLearners} en attente
                    </span>
                  </div>
                  <Progress value={row.percent} />
                </li>
              ))}
          </ul>
        )}
      </PanelCard>
    </div>
  );
}

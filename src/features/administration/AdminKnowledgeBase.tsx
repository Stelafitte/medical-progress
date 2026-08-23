/**
 * « Base de connaissances » — tout le savoir théorique du programme.
 *
 * Même grammaire que l'onglet « Compétences » : une seule page déroulante,
 * sans onglets. D'abord le référentiel des connaissances visées, puis l'ajout
 * (import rapide avant saisie manuelle), puis les supports et leur exploitation
 * IA, et tout en bas le suivi d'acquisition rattaché à une classe.
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
import { MediaLibrarySection } from "@/features/administration/MediaLibrarySection";
import { ContentAiSection } from "@/features/administration/ContentAiSection";
import { CohortSelector } from "@/features/administration/CohortSelector";
import { KnowledgeCreationForm } from "@/features/administration/KnowledgeCreationForm";
import { useProgramAdmin } from "@/features/administration/useProgramAdmin";
import { defaultPilotCohortId } from "@/features/administration/adminProgramViewModel";
import { parseReferentialText } from "@/features/administration/competenceTrackingViewModel";
import {
  buildLearnerTrackingRows,
  summarizeLearnerTracking,
} from "@/features/administration/learnerTrackingViewModel";
import { assessmentFixturesFor } from "@/infrastructure/mock/assessmentFixtures";
import { NATURE_LABELS_FR } from "@/domain/mastery";
import { COMPETENCE_MASTERY_LABELS_FR, mergeOutcomes } from "@/domain/competenceDraft";
import { EMPTY_NEW_KNOWLEDGE_INPUT } from "@/domain/knowledgeDraft";
import { createLocalKnowledge, useLocalKnowledge } from "@/application/knowledgeDraftStore";
import type { CurriculumVersionId, ProgramId } from "@/domain/types";

export function AdminKnowledgeBase() {
  const { data, isPending } = useProgramAdmin();
  const [cohortId, setCohortId] = useState<string | null>(null);
  const [importText, setImportText] = useState("");
  const [imported, setImported] = useState<number | null>(null);
  const localKnowledge = useLocalKnowledge(data?.program?.id);

  const cohorts = data?.cohorts ?? [];
  const selectedId = cohortId ?? defaultPilotCohortId(cohorts);
  /** Liste UNIQUE : objectifs du dépôt et connaissances créées dans la session. */
  const outcomes = useMemo(
    () => mergeOutcomes(data?.outcomes ?? [], localKnowledge),
    [data?.outcomes, localKnowledge],
  );

  /** Import : ici seules les lignes de nature « connaissance » (ou non précisée) comptent. */
  const candidates = useMemo(() => {
    const existing = new Set(outcomes.map((o) => o.code.toUpperCase()));
    return parseReferentialText(importText)
      .filter((row) => row.nature === "knowledge" || row.nature === "unknown")
      .map((row) => ({ ...row, isNew: !existing.has(row.code.toUpperCase()) }));
  }, [importText, outcomes]);
  const newCount = candidates.filter((row) => row.isNew).length;

  if (isPending || !data) return <Skeleton className="h-80 w-full" />;

  const knowledge = outcomes.filter((o) => o.nature === "knowledge");
  const published = data.media.filter((m) => m.status === "published").length;
  const narrated = data.media.filter((m) => m.kind === "slides_audio").length;
  const programId = (data.program?.id ?? "program-unknown") as ProgramId;
  const curriculumVersionId = (data.versions[0]?.id ?? "cv-unknown") as CurriculumVersionId;

  const enrollments = data.enrollments.filter((e) => e.cohortId === selectedId);
  const trackingRows = buildLearnerTrackingRows({
    enrollments,
    people: data.people,
    outcomes,
    logs: data.logsReceived,
    assessments: data.program
      ? assessmentFixturesFor(programId, data.program.code.toUpperCase().startsWith("DFASM"))
      : [],
    expectedLogsPerLearner: data.templates.length,
  });
  const summary = summarizeLearnerTracking(trackingRows);
  const selectedCohort = cohorts.find((cohort) => cohort.id === selectedId) ?? null;

  return (
    <div className="space-y-6">
      <SectionHeading
        title="Base de connaissances"
        level={1}
        action={<MockBadge />}
        description="Connaissances visées, supports théoriques et conversion HTML5 des diaporamas sonorisés, puis suivi d'acquisition par classe."
      />

      <ScopeNotice>
        Les connaissances et les supports appartiennent au programme, jamais à une cohorte : une
        promotion ultérieure réutilise la même base. Les états d'acquisition affichés en bas de page
        sont simulés de façon déterministe.
      </ScopeNotice>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={NATURE_LABELS_FR.knowledge} value={knowledge.length} />
        <StatCard label="Supports du programme" value={data.media.length} />
        <StatCard label="Supports publiés" value={published} />
        <StatCard label="Diaporamas sonorisés" value={narrated} />
      </div>

      {/* 1. Le référentiel en place */}
      <SectionHeading
        title="Connaissances visées par le programme"
        level={2}
        description="Chaque support peut être rattaché à une ou plusieurs connaissances."
      />

      <PanelCard
        title="Référentiel de connaissances"
        description="Liste unique : connaissances du dépôt et connaissances créées dans cette session."
      >
        {knowledge.length === 0 ? (
          <EmptyState>Aucune connaissance définie.</EmptyState>
        ) : (
          <ul className="space-y-1 text-sm">
            {knowledge.map((outcome) => (
              <li key={outcome.id} className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="font-mono text-[10px]">
                  {outcome.code}
                </Badge>
                <span>{outcome.label}</span>
                <span className="text-muted-foreground text-xs">
                  cible {COMPETENCE_MASTERY_LABELS_FR[outcome.targetMastery]}
                </span>
                <span className="text-muted-foreground text-xs">
                  {data.media.filter((m) => m.outcomeIds.includes(outcome.id)).length} support(s)
                </span>
                {localKnowledge.some((local) => local.id === outcome.id) ? (
                  <Badge variant="outline" className="font-normal">
                    créée dans cette session
                  </Badge>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </PanelCard>

      {/* 2. Ajout : import rapide avant la saisie manuelle, comme pour les compétences. */}
      <SectionHeading
        title="Ajouter des connaissances"
        level={2}
        description="Deux voies pour alimenter la même liste : coller un plan de cours existant, ou saisir une connaissance à la main."
      />

      <PanelCard
        title="Voie rapide — coller un référentiel"
        description="Un tableau CSV/TSV : code, intitulé, nature (connaissance). Analyse locale uniquement, rien n'est envoyé."
        action={<MockBadge />}
      >
        <Textarea
          value={importText}
          onChange={(event) => setImportText(event.target.value)}
          rows={6}
          placeholder={
            "K-08;Physique des ultrasons;connaissance\nK-09;Hémodynamique valvulaire;connaissance"
          }
          aria-label="Connaissances à importer"
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{candidates.length} ligne(s) reconnue(s)</Badge>
          <Badge variant="outline">{newCount} nouvelle(s)</Badge>
          <Badge variant="outline">{candidates.length - newCount} déjà présente(s)</Badge>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            className="min-h-11"
            disabled={newCount === 0}
            onClick={() => {
              let added = 0;
              for (const row of candidates) {
                if (!row.isNew) continue;
                const outcome = createLocalKnowledge({
                  input: {
                    ...EMPTY_NEW_KNOWLEDGE_INPUT,
                    code: row.code,
                    label: row.label,
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
            Ajouter les {newCount} nouvelle(s) connaissance(s)
          </Button>
          <Button size="sm" variant="ghost" className="min-h-11" onClick={() => setImportText("")}>
            Effacer
          </Button>
          {imported !== null ? (
            <span className="text-muted-foreground text-sm">
              {imported} connaissance(s) ajoutée(s) au référentiel de cette session.
            </span>
          ) : null}
        </div>
        <p className="text-muted-foreground mt-2 text-xs">
          Un code déjà présent n'écrase jamais le référentiel en place. Les lignes de nature
          « simulation » ou « réelle » relèvent de l'onglet « Compétences ». Rattachement à la
          version active ({curriculumVersionId}).
        </p>
        {candidates.length > 0 ? (
          <ul className="mt-4 space-y-1 text-sm">
            {candidates.slice(0, 20).map((row, index) => (
              <li key={`${row.code}-${index}`} className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="font-mono text-[10px]">
                  {row.code}
                </Badge>
                <span>{row.label}</span>
                <Badge variant={row.isNew ? "secondary" : "outline"} className="font-normal">
                  {row.isNew ? "nouvelle" : "code déjà présent"}
                </Badge>
              </li>
            ))}
          </ul>
        ) : null}
      </PanelCard>

      <PanelCard
        title="Voie manuelle — créer une connaissance"
        description="Le même outil de création est disponible ici et dans le « Concepteur de programme » : la liste est unique."
        action={<MockBadge />}
      >
        <KnowledgeCreationForm
          programId={programId}
          curriculumVersionId={curriculumVersionId}
          idPrefix="connaissances-tab"
          submitLabel="Créer la connaissance"
          hint="La connaissance rejoint la liste unique des objectifs : elle est aussitôt disponible pour rattacher un support."
        />
      </PanelCard>

      {/* 3. Les supports qui portent ces connaissances */}
      <SectionHeading
        title="Supports pédagogiques — Dépôt et catalogue"
        level={2}
        description="Dépôt et catalogue des supports, conversion HTML5 des diaporamas sonorisés, puis Exploitation IA des contenus publiés."
      />


      <MediaLibrarySection
        programName={data.program?.name ?? "ce programme"}
        media={data.media}
        outcomes={outcomes}
        people={data.people}
      />

      <ContentAiSection
        programName={data.program?.name ?? "Programme"}
        media={data.media}
        profiles={data.aiProfiles}
        policy={data.aiPolicy}
      />

      <PanelCard
        title="Là où ces connaissances se vérifient"
        description="Une connaissance se vérifie par une évaluation ; sa mise en pratique relève des compétences."
      >
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" className="min-h-11">
            <Link to="/espace/administration/evaluations">
              Évaluations et ECOS
              <ArrowRight className="ms-1 size-4" aria-hidden />
            </Link>
          </Button>
          <Button asChild variant="outline" className="min-h-11">
            <Link to="/espace/administration/competences">
              Référentiel de compétences
              <ArrowRight className="ms-1 size-4" aria-hidden />
            </Link>
          </Button>
        </div>
      </PanelCard>

      {/* 4. Tout en bas : le suivi, rattaché à une classe et à ses apprenants. */}
      <SectionHeading
        title="Suivi d'acquisition théorique"
        level={2}
        description="Le suivi n'appartient pas à la conception : il se lit toujours pour une classe donnée et ses apprenants. Mêmes chiffres que dans « Classes d'apprenants » et « Pilotage de programme »."
      />

      <CohortSelector cohorts={cohorts} value={selectedId} onChange={setCohortId} label="Classe suivie" />

      <PanelCard
        title={
          selectedCohort
            ? `Apprenants de la classe « ${selectedCohort.label} »`
            : "Apprenants de la classe"
        }
        description="Vue de lecture : acquisition des bases théoriques. Les relances et validations se traitent dans le Pilotage."
        action={<MockBadge />}
      >
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Apprenants suivis" value={summary.learners} />
          <StatCard label="Théorie (moy.)" value={`${summary.theoryPercent} %`} />
          <StatCard label="Connaissances visées" value={knowledge.length} />
          <StatCard label="Avancement global (moy.)" value={`${summary.globalPercent} %`} />
        </div>

        {trackingRows.length === 0 ? (
          <EmptyState>Aucun apprenant inscrit sur cette classe.</EmptyState>
        ) : (
          <ul className="mt-4 space-y-2 text-sm">
            {trackingRows.map((row) => (
              <li key={row.enrollmentId} className="border-border space-y-2 rounded-md border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{row.personName}</span>
                  <Badge variant="secondary" className="font-normal">
                    {row.theory.done} acquise(s)
                  </Badge>
                  <Badge variant="outline" className="font-normal">
                    {row.theory.total - row.theory.done} restante(s)
                  </Badge>
                </div>
                <Progress value={row.theory.percent} />
                <p className="text-muted-foreground text-xs">
                  {row.theory.percent} % des {row.theory.total} connaissance(s) du référentiel ·
                  avancement global {row.globalPercent} %
                </p>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline" className="min-h-11">
            <Link
              to="/espace/administration/pilotage"
              search={selectedId ? { promotion: selectedId } : {}}
            >
              Ouvrir le pilotage de cette classe
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline" className="min-h-11">
            <Link to="/espace/administration/classes">Composition des classes</Link>
          </Button>
        </div>
      </PanelCard>
    </div>
  );
}

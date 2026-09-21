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
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, PanelCard, ScopeNotice, StatCard } from "@/features/professional/mock-ui";
import { CorpusImport } from "@/features/administration/CorpusImport";
import { MediaLibrarySection } from "@/features/administration/MediaLibrarySection";
import { ContentAiSection } from "@/features/administration/ContentAiSection";
import { CohortSelector } from "@/features/administration/CohortSelector";
import { ZoneProgramme } from "@/features/administration/ZoneProgramme";
import { KnowledgeCreationForm } from "@/features/administration/KnowledgeCreationForm";
import { useProgramAdmin } from "@/features/administration/useProgramAdmin";
import { AdminChargement } from "@/features/administration/AdminChargement";
import { defaultPilotCohortId } from "@/features/administration/adminProgramViewModel";
import { parseReferentialText } from "@/features/administration/competenceTrackingViewModel";
import {
  buildLearnerTrackingRows,
  summarizeLearnerTracking,
} from "@/features/administration/learnerTrackingViewModel";
import { NATURE_LABELS_FR } from "@/domain/mastery";
import { COMPETENCE_MASTERY_LABELS_FR } from "@/domain/competenceDraft";
import { useDataAccess } from "@/application/session";
import { setCohortFocus, useCohortFocus } from "@/application/cohortFocusStore";
import { ProgramAssociationList } from "@/features/administration/ProgramAssociationList";
import { outcomeAssociationItems } from "@/domain/outcomeAssociation";
import type { OutcomeId, ProgramId } from "@/domain/types";

export function AdminKnowledgeBase() {
  const { data, isPending, error, refetch } = useProgramAdmin();
  const dataAccess = useDataAccess();
  /*
   * LA PROMOTION EST CHOISIE UNE FOIS, PAS UNE FOIS PAR ONGLET (17/09).
   * Chaque écran gardait son propre `useState` : on choisissait une promotion
   * dans Évaluations, et le Pilotage l'ignorait. Sept écrans, sept vérités.
   */
  const cohortId = useCohortFocus();
  const [importText, setImportText] = useState("");
  const [imported, setImported] = useState<number | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  /** Acquis en cours d'archivage : leurs cases sont figées le temps de l'appel. */
  const [archivingIds, setArchivingIds] = useState<ReadonlySet<string>>(new Set());

  const cohorts = data?.cohorts ?? [];
  const selectedId = cohortId ?? defaultPilotCohortId(cohorts);
  const outcomes = useMemo(() => data?.outcomes ?? [], [data?.outcomes]);

  /** Import : ici seules les lignes de nature « connaissance » (ou non précisée) comptent. */
  const candidates = useMemo(() => {
    const existing = new Set(outcomes.map((o) => o.code.toUpperCase()));
    return parseReferentialText(importText)
      .filter((row) => row.nature === "knowledge" || row.nature === "unknown")
      .map((row) => ({ ...row, isNew: !existing.has(row.code.toUpperCase()) }));
  }, [importText, outcomes]);
  const newCount = candidates.filter((row) => row.isNew).length;

  if (isPending || !data) return <AdminChargement error={error} />;

  const knowledge = outcomes.filter((o) => o.nature === "knowledge");
  const published = data.media.filter((m) => m.status === "published").length;
  const narrated = data.media.filter((m) => m.kind === "slides_audio").length;
  const programId = (data.program?.id ?? "program-unknown") as ProgramId;
  const realCurriculumVersionId = data.versions[0]?.id;

  const enrollments = data.enrollments.filter((e) => e.cohortId === selectedId);
  const trackingRows = buildLearnerTrackingRows({
    enrollments,
    people: data.people,
    outcomes,
    logs: data.logsReceived,
    expectedLogsPerLearner: data.templates.length,
    declarations: data.declarations,
    lastSignInByPerson: data.lastSignInByPerson,
  });
  const summary = summarizeLearnerTracking(trackingRows);
  const selectedCohort = cohorts.find((cohort) => cohort.id === selectedId) ?? null;

  return (
    <div className="space-y-6">
      <SectionHeading
        eyebrow={data.program?.name ?? "Programme"}
        title="Base de connaissances"
        level={1}
        description="Connaissances visées, supports théoriques et conversion HTML5 des diaporamas sonorisés, puis suivi d'acquisition par classe."
      />

      <ScopeNotice>
        Les connaissances et les supports appartiennent au programme, jamais à une cohorte : une
        promotion ultérieure réutilise la même base. Le suivi d'acquisition en bas de page repose
        sur les déclarations réelles des apprenants.
      </ScopeNotice>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={NATURE_LABELS_FR.knowledge} value={knowledge.length} />
        <StatCard label="Supports du programme" value={data.media.length} />
        <StatCard label="Supports publiés" value={published} />
        <StatCard label="Diaporamas sonorisés" value={narrated} />
      </div>

      <ZoneProgramme programName={data.program?.name ?? "ce programme"} cohorts={cohorts}>
        {/* 1. Le référentiel en place */}
        <SectionHeading
          title="Connaissances visées par le programme"
          level={2}
          description="Chaque support peut être rattaché à une ou plusieurs connaissances."
        />

        <PanelCard
          collapsible
          title="Référentiel de connaissances"
          description="Liste unique : connaissances du dépôt et connaissances créées dans cette session."
        >
          {knowledge.length === 0 ? (
            <EmptyState>Aucune connaissance définie.</EmptyState>
          ) : (
            /*
            Même composant que dans le Concepteur : cocher ici décide de ce que
            le programme EXIGE, donc de ce que l'étudiant verra dans son
            passeport. Deux écrans, un seul mécanisme — sans quoi on pourrait
            cocher dans l'un ce qu'on ne peut pas décocher dans l'autre.
          */
            <ProgramAssociationList
              title="Connaissances de ce programme"
              items={outcomeAssociationItems(knowledge, data.outcomeThemes)}
              busyIds={archivingIds}
              removeLabel="Retirer du programme"
              onRemove={(ids) => {
                setArchivingIds(new Set(ids));
                void (async () => {
                  try {
                    for (const id of ids) {
                      await dataAccess.outcomes.archiveOutcome(id as OutcomeId);
                    }
                    await refetch();
                  } finally {
                    setArchivingIds(new Set());
                  }
                })();
              }}
              onSetRetained={async (ids, retained) => {
                await dataAccess.outcomes.setOutcomesRetained(
                  ids as readonly OutcomeId[],
                  retained,
                );
                await refetch();
              }}
            />
          )}
        </PanelCard>

        {/* 2. Ajout : import rapide avant la saisie manuelle, comme pour les compétences. */}
        <SectionHeading
          title="Ajouter des connaissances"
          level={2}
          description="Deux voies pour alimenter la même liste : coller un plan de cours existant, ou saisir une connaissance à la main."
        />

        {realCurriculumVersionId ? (
          <>
            <PanelCard
              collapsible
              title="Voie rapide — coller un référentiel"
              description="Un tableau CSV/TSV : code, intitulé, nature (connaissance). Seules les lignes nouvelles sont créées, une par une, dans le référentiel réel du programme."
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
                  disabled={newCount === 0 || isImporting}
                  onClick={() => {
                    const curriculumVersionId = realCurriculumVersionId;
                    void (async () => {
                      setImportError(null);
                      setIsImporting(true);
                      let added = 0;
                      try {
                        for (const row of candidates) {
                          if (!row.isNew) continue;
                          await dataAccess.outcomes.createOutcome({
                            programId,
                            curriculumVersionId,
                            code: row.code,
                            label: row.label,
                            description: "",
                            nature: "knowledge",
                            domain: "Non classé",
                            targetMastery: "proficient",
                          });
                          added += 1;
                        }
                        setImported(added);
                        setImportText("");
                        await refetch();
                      } catch (reason) {
                        setImportError(
                          reason instanceof Error
                            ? reason.message
                            : "Import du référentiel impossible.",
                        );
                      } finally {
                        setIsImporting(false);
                      }
                    })();
                  }}
                >
                  {isImporting
                    ? "Import en cours…"
                    : `Ajouter les ${newCount} nouvelle(s) connaissance(s)`}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="min-h-11"
                  onClick={() => setImportText("")}
                >
                  Effacer
                </Button>
                {imported !== null ? (
                  <span className="text-muted-foreground text-sm">
                    {imported} connaissance(s) ajoutée(s) au référentiel.
                  </span>
                ) : null}
              </div>
              {importError ? <p className="text-destructive mt-2 text-sm">{importError}</p> : null}
              <p className="text-muted-foreground mt-2 text-xs">
                Un code déjà présent n'écrase jamais le référentiel en place. Les lignes de nature «
                simulation » ou « réelle » relèvent de l'onglet « Compétences ». Rattachement à la
                version active ({realCurriculumVersionId}).
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
              collapsible
              title="Voie automatique — importer un corpus de documents"
              description="Un document ou une archive ZIP : chaque fichier lisible est déposé dans la médiathèque ci-dessous, et les connaissances que l'IA en tire restent rattachées au document dont elles viennent. Rien n'est créé sans votre validation."
            >
              <CorpusImport
                target="knowledge"
                programId={programId}
                curriculumVersionId={realCurriculumVersionId}
                existingOutcomeCodes={outcomes.map((o) => o.code)}
                onCreated={() => void refetch()}
              />
            </PanelCard>

            <PanelCard
              collapsible
              title="Voie manuelle — créer une connaissance"
              description="Le même outil de création est disponible ici et dans le « Concepteur de programme » : la liste est unique."
            >
              <KnowledgeCreationForm
                programId={programId}
                curriculumVersionId={realCurriculumVersionId}
                idPrefix="connaissances-tab"
                submitLabel="Créer la connaissance"
                hint="La connaissance rejoint la liste unique des objectifs : elle est aussitôt disponible pour rattacher un support."
                onCreated={() => void refetch()}
              />
            </PanelCard>
          </>
        ) : (
          <EmptyState>
            Aucune version de curriculum pour ce programme : le référentiel de connaissances ne peut
            pas encore être alimenté.
          </EmptyState>
        )}

        {/* 3. Les supports qui portent ces connaissances */}
        <SectionHeading
          title="Supports pédagogiques — Dépôt et catalogue"
          level={2}
          description="Dépôt et catalogue des supports, conversion HTML5 des diaporamas sonorisés, puis Exploitation IA des contenus publiés."
        />

        <MediaLibrarySection
          programName={data.program?.name ?? "ce programme"}
          programId={programId}
          curriculumVersionId={realCurriculumVersionId}
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
          collapsible
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
      </ZoneProgramme>

      {/* 4. Tout en bas : le suivi, rattaché à une classe et à ses apprenants. */}
      <SectionHeading
        title="Suivi d'acquisition théorique"
        level={2}
        description="Le suivi n'appartient pas à la conception : il se lit toujours pour une classe donnée et ses apprenants. Mêmes chiffres que dans « Classes d'apprenants » et « Pilotage de programme »."
      />

      <CohortSelector
        cohorts={cohorts}
        value={selectedId}
        onChange={setCohortFocus}
        label="Classe suivie"
      />

      <PanelCard
        collapsible
        title={
          selectedCohort
            ? `Apprenants de la classe « ${selectedCohort.label} »`
            : "Apprenants de la classe"
        }
        description="Vue de lecture : acquisition des bases théoriques. Les relances et validations se traitent dans le Pilotage."
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
              <li key={row.enrollmentId} className="border-border space-y-2 rounded-lg border p-4">
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

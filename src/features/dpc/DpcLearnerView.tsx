/**
 * Espace participant du module DPC : chronologie du parcours, deux tours
 * d'audit, formation, pré/post-test, comparaison individuelle et attestation.
 * Maquette : aucune écriture serveur, aucun appel IA, aucune donnée patient.
 */
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, CircleDashed, Clock, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useDataAccess, useSession } from "@/application/session";
import { EmptyState, MockBadge, PanelCard, ScopeNotice, StatCard } from "@/features/professional/mock-ui";
import {
  DPC_ENTRY_STATUS_LABELS_FR,
  DPC_NO_PATIENT_DATA_NOTICE_FR,
  DPC_PAPER_FALLBACK_NOTICE_FR,
  DPC_ROUND_LABELS_FR,
  DPC_VERDICT_LABELS_FR,
  compareRounds,
  compareTests,
  dpcJourney,
  entryConformity,
  entryProgress,
  persistentGaps,
  scoreQuiz,
  sectionConformity,
} from "@/domain/dpc";

export function DpcLearnerView() {
  const data = useDataAccess();
  const { activeProgram, activeEnrollment } = useSession();
  const enrollmentId = activeEnrollment.id;

  const { data: scope, isPending } = useQuery({
    queryKey: ["dpc-learner", activeProgram.id, enrollmentId],
    queryFn: async () => {
      const [grids, setup, rounds, entries, sequences, questions, attempts, attendance] =
        await Promise.all([
          data.dpc.listGrids(activeProgram.id),
          data.dpc.getSetup(activeProgram.id),
          data.dpc.listRounds(activeProgram.id),
          data.dpc.listEntriesForEnrollment(enrollmentId),
          data.dpc.listSequences(activeProgram.id),
          data.dpc.listQuestions(activeProgram.id),
          data.dpc.listTestAttempts(activeProgram.id),
          data.dpc.listAttendance(activeProgram.id),
        ]);
      return { grids, setup, rounds, entries, sequences, questions, attempts, attendance };
    },
  });

  const header = (
    <header className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Mon parcours DPC</h1>
        <Badge variant="outline">Simulé</Badge>
      </div>
      <p className="text-muted-foreground text-sm">{activeProgram.name}</p>
    </header>
  );

  if (isPending || !scope)
    return (
      <div className="space-y-4">
        {header}
        <Skeleton className="h-64 w-full" />
      </div>
    );

  const grid = scope.grids.find((g) => g.status === "published");
  if (!grid || !scope.setup)
    return (
      <div className="space-y-4">
        {header}
        <EmptyState>Aucun programme DPC publié pour ce programme.</EmptyState>
      </div>
    );

  const roundOf = (phase: "t0" | "t1") => scope.rounds.find((r) => r.phase === phase);
  const entryOf = (phase: "t0" | "t1") => {
    const round = roundOf(phase);
    return round ? scope.entries.find((e) => e.roundId === round.id) : undefined;
  };
  const t0 = entryOf("t0");
  const t1 = entryOf("t1");

  const comparison = compareRounds(grid, t0, t1);
  const tests = compareTests(scope.questions, scope.attempts, enrollmentId);
  const attended = scope.attendance.some((a) => a.enrollmentId === enrollmentId && a.present);
  const journey = dpcJourney({
    grid,
    setup: scope.setup,
    ...(t0 ? { t0 } : {}),
    ...(t1 ? { t1 } : {}),
    preTestPercent: tests.prePercent,
    postTestPercent: tests.postPercent,
    attendedTraining: attended,
    comparison,
  });
  const gaps = persistentGaps(grid, t0, t1).slice(0, 5);
  const sections = sectionConformity(grid, t1 ? [t1] : t0 ? [t0] : []);

  return (
    <div className="space-y-6">
      {header}
      <ScopeNotice>
        {DPC_NO_PATIENT_DATA_NOTICE_FR} {DPC_PAPER_FALLBACK_NOTICE_FR}
      </ScopeNotice>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Avancement du parcours"
          value={`${journey.percentComplete} %`}
          hint={`${journey.completedSteps}/${journey.totalSteps} étapes`}
        />
        <StatCard
          label="Conformité audit 1 → audit 2"
          value={`${comparison.t0Percent ?? "—"} % → ${comparison.t1Percent ?? "en cours"}`}
          hint={DPC_VERDICT_LABELS_FR[comparison.verdict]}
        />
        <StatCard
          label="Connaissances (pré/post)"
          value={`${tests.prePercent ?? "—"} % → ${tests.postPercent ?? "—"} %`}
          hint={tests.deltaPoints !== null ? `${tests.deltaPoints > 0 ? "+" : ""}${tests.deltaPoints} points` : "en attente"}
        />
        <StatCard
          label="Attestation"
          value={journey.attestationEligible ? "Disponible" : "En attente"}
          hint={journey.attestationEligible ? "Participation et progression tracées" : `${journey.attestationBlockers.length} condition(s) restante(s)`}
        />
      </div>

      <Tabs defaultValue="parcours" className="space-y-4">
        <TabsList className="flex w-full flex-wrap justify-start gap-1">
          {[
            ["parcours", "Parcours"],
            ["audits", "Mes audits"],
            ["formation", "Formation"],
            ["tests", "Pré/post-test"],
            ["progression", "Ma progression"],
          ].map(([value, label]) => (
            <TabsTrigger key={value} value={value} className="min-h-11 flex-none text-xs sm:text-sm">
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="parcours" className="space-y-4">
          <PanelCard
            title="Chronologie du programme intégré"
            description="Calendrier relatif : J-30 à J0, jour J, puis J+90."
            action={<MockBadge />}
          >
            <ol className="space-y-3">
              {journey.steps.map((step) => (
                <li key={step.key} className="flex gap-3 rounded-md border border-border p-3">
                  <span className="mt-0.5">
                    {step.state === "done" ? (
                      <CheckCircle2 className="size-5 text-primary" aria-hidden />
                    ) : step.state === "in_progress" ? (
                      <Clock className="size-5 text-primary" aria-hidden />
                    ) : (
                      <CircleDashed className="text-muted-foreground size-5" aria-hidden />
                    )}
                  </span>
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{step.label}</span>
                      <Badge variant="secondary">{step.window}</Badge>
                    </div>
                    <p className="text-muted-foreground text-sm">{step.description}</p>
                    <p className="text-xs">
                      {step.detail} · <span className="text-muted-foreground">{step.requirement}</span>
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </PanelCard>

          <PanelCard title="Mon attestation" description="Participation et progression mesurée — jamais une compétence en situation réelle accordée automatiquement.">
            {journey.attestationEligible ? (
              <div className="space-y-2">
                <p>Parcours complet : l'attestation de participation peut être éditée.</p>
                <Button variant="outline" size="sm" className="min-h-11" disabled>
                  <FileText className="mr-2 size-4" /> Télécharger l'attestation (simulé)
                </Button>
              </div>
            ) : (
              <ul className="list-inside list-disc space-y-1">
                {journey.attestationBlockers.map((blocker) => (
                  <li key={blocker}>{blocker}</li>
                ))}
              </ul>
            )}
          </PanelCard>
        </TabsContent>

        <TabsContent value="audits" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {(["t0", "t1"] as const).map((phase) => {
              const round = roundOf(phase);
              const entry = entryOf(phase);
              const progress = entryProgress(grid, entry?.records ?? []);
              const conformity = entryConformity(grid, entry);
              return (
                <Card key={phase}>
                  <CardHeader>
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle className="text-base">{DPC_ROUND_LABELS_FR[phase]}</CardTitle>
                      <Badge variant="secondary">
                        {DPC_ENTRY_STATUS_LABELS_FR[entry?.status ?? "not_started"]}
                      </Badge>
                    </div>
                    <CardDescription>
                      {round
                        ? `${round.window} — jusqu'au ${new Date(round.closesOn).toLocaleDateString("fr-FR")}`
                        : "Tour non planifié"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <Progress value={progress.percentComplete} className="h-2" />
                    <p className="text-muted-foreground">
                      {progress.recordsComplete}/{progress.recordsExpected} dossiers complets ·{" "}
                      {progress.answered}/{progress.expected} réponses
                    </p>
                    {entry?.status === "submitted" ? (
                      <p>
                        Conformité mesurée : <strong>{conformity.conformityPercent} %</strong> (cible{" "}
                        {grid.targetConformityPercent} %) · {conformity.notApplicable} réponses N/A exclues
                      </p>
                    ) : null}
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-h-11 w-full sm:w-auto"
                      disabled={round?.status !== "open"}
                    >
                      {round?.status === "open"
                        ? progress.nextRecordIndex !== null
                          ? `Reprendre au dossier D${progress.nextRecordIndex + 1} (simulé)`
                          : "Vérifier puis transmettre (simulé)"
                        : "Tour clos"}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="formation" className="space-y-4">
          {scope.sequences.map((sequence) => (
            <PanelCard
              key={sequence.id}
              title={`Séquence ${sequence.order} — ${sequence.title}`}
              description={`${sequence.durationMinutes} min · ${sequence.summary}`}
            >
              <p className="font-medium">Objectifs</p>
              <ul className="list-inside list-disc space-y-1">
                {sequence.objectives.map((objective) => (
                  <li key={objective}>{objective}</li>
                ))}
              </ul>
              <p className="font-medium">Cas clinique</p>
              <p className="text-muted-foreground">{sequence.clinicalCase}</p>
              <ul className="list-inside list-disc space-y-1">
                {sequence.caseQuestions.map((question) => (
                  <li key={question}>{question}</li>
                ))}
              </ul>
            </PanelCard>
          ))}
          <PanelCard title="Bibliographie de la formation" description="Références identifiées, exigence HAS d'indépendance des supports.">
            <ol className="space-y-1">
              {scope.setup.references.map((reference) => (
                <li key={reference.order}>
                  {reference.order}. {reference.citation}
                  {reference.pmid ? ` PMID: ${reference.pmid}.` : ""}
                </li>
              ))}
            </ol>
          </PanelCard>
        </TabsContent>

        <TabsContent value="tests" className="space-y-4">
          {scope.questions.length === 0 ? (
            <EmptyState>Aucun test configuré.</EmptyState>
          ) : (
            scope.questions.map((question) => {
              const preAnswer = scope.attempts.find(
                (a) => a.enrollmentId === enrollmentId && a.phase === "pre",
              )?.answers[question.id];
              const postAnswer = scope.attempts.find(
                (a) => a.enrollmentId === enrollmentId && a.phase === "post",
              )?.answers[question.id];
              return (
                <PanelCard
                  key={question.id}
                  title={`QCM ${question.number} — ${question.theme}`}
                  description={question.prompt}
                >
                  <ul className="space-y-1">
                    {question.options.map((option) => (
                      <li
                        key={option.key}
                        className={
                          option.key === question.correctKey ? "font-medium" : "text-muted-foreground"
                        }
                      >
                        {option.key}. {option.label}
                        {option.key === question.correctKey ? " — bonne réponse" : ""}
                      </li>
                    ))}
                  </ul>
                  <p className="text-muted-foreground">{question.explanation}</p>
                  <p className="text-xs">
                    Ma réponse au pré-test : <strong>{preAnswer ?? "—"}</strong> · au post-test :{" "}
                    <strong>{postAnswer ?? "—"}</strong>
                  </p>
                </PanelCard>
              );
            })
          )}
          <PanelCard title="Scores" description="Même série aux deux passages : la comparaison est valide.">
            <p>
              Pré-test {tests.prePercent ?? "—"} % → post-test {tests.postPercent ?? "—"} %
              {tests.deltaPoints !== null ? ` (${tests.deltaPoints > 0 ? "+" : ""}${tests.deltaPoints} points)` : ""}
            </p>
            <p className="text-muted-foreground text-xs">
              {scope.questions.length} questions ·{" "}
              {scoreQuiz(
                scope.questions,
                scope.attempts.find((a) => a.enrollmentId === enrollmentId && a.phase === "post")
                  ?.answers ?? {},
              ).correct}{" "}
              bonnes réponses au post-test
            </p>
          </PanelCard>
        </TabsContent>

        <TabsContent value="progression" className="space-y-4">
          <PanelCard title="Conclusion individuelle" description="Calcul déterministe, sans IA.">
            <p>{comparison.conclusion}</p>
            <p className="text-muted-foreground text-xs">
              Une compétence en situation réelle reste validée par un tiers : l'audit et l'attestation
              ne l'accordent jamais seuls.
            </p>
          </PanelCard>
          <PanelCard title="Conformité par partie de la grille">
            <ul className="space-y-2">
              {sections.map((row) => (
                <li key={row.section.id} className="space-y-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>{row.section.label}</span>
                    <span className="text-muted-foreground text-xs">
                      {row.conformity.conformityPercent} %
                    </span>
                  </div>
                  <Progress value={row.conformity.conformityPercent} className="h-2" />
                </li>
              ))}
            </ul>
          </PanelCard>
          <PanelCard title="Écarts à travailler en priorité" description="Critères encore sous la cible.">
            {gaps.length === 0 ? (
              <EmptyState>Aucun écart au-dessous de la cible.</EmptyState>
            ) : (
              <ul className="space-y-2">
                {gaps.map((gap) => (
                  <li key={gap.criterion.id} className="rounded-md border border-border p-3">
                    <p className="font-medium">
                      Critère {gap.criterion.number} — {gap.criterion.label}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      Audit 1 {gap.t0Percent} % → audit 2 {gap.t1Percent} % (
                      {gap.deltaPoints > 0 ? "+" : ""}
                      {gap.deltaPoints} points)
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </PanelCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}

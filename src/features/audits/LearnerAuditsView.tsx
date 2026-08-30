/**
 * Espace apprenant — module OPTIONNEL « Audits de pratique » (DPC).
 * Maquette : aucune saisie n'est enregistrée, aucun appel réseau.
 */
import { useQuery } from "@tanstack/react-query";
import { ClipboardCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useDataAccess, useSession } from "@/application/session";
import {
  AUDIT_PHASE_LABELS_FR,
  AUDIT_SUBMISSION_LABELS_FR,
  SESSION_MODALITY_LABELS_FR,
  comparePrePost,
  scoreSubmission,
  testProgress,
} from "@/domain/clinicalAudit";

export function LearnerAuditsView() {
  const data = useDataAccess();
  const { activeProgram, activeEnrollment } = useSession();
  const enrollmentId = activeEnrollment?.id;

  const { data: scope, isPending } = useQuery({
    queryKey: ["clinical-audits-learner", activeProgram.id, enrollmentId ?? "none"],
    enabled: Boolean(enrollmentId),
    queryFn: async () => {
      if (!enrollmentId) throw new Error("Aucune inscription active pour ce programme.");
      const [templates, campaigns, submissions, tests, results, sessions] = await Promise.all([
        data.clinicalAudits.listTemplates(activeProgram.id),
        data.clinicalAudits.listCampaigns(activeProgram.id),
        data.clinicalAudits.listSubmissionsForEnrollment(enrollmentId),
        data.clinicalAudits.listTests(activeProgram.id),
        data.clinicalAudits.listTestResults(activeProgram.id),
        data.clinicalAudits.listSessions(activeProgram.id),
      ]);
      return { templates, campaigns, submissions, tests, results, sessions };
    },
  });

  const header = (
    <header className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Mes audits de pratique</h1>
        <Badge variant="outline">Simulé</Badge>
      </div>
      <p className="text-muted-foreground text-sm">
        Mesure de ma pratique avant puis après la formation, sur mes propres dossiers désignés par
        une référence anonyme.
      </p>
    </header>
  );

  if (!enrollmentId) return <div className="space-y-4">{header}<p>Aucune inscription active.</p></div>;

  if (isPending || !scope)
    return (
      <div className="space-y-4">
        {header}
        <Skeleton className="h-64 w-full" />
      </div>
    );

  const template = scope.templates.find((t) => t.status === "published");
  const campaignFor = (phase: "pre" | "post") => scope.campaigns.find((c) => c.phase === phase);
  const submissionFor = (phase: "pre" | "post") => {
    const campaign = campaignFor(phase);
    return campaign ? scope.submissions.find((s) => s.campaignId === campaign.id) : undefined;
  };

  const comparison = template
    ? comparePrePost(template, submissionFor("pre"), submissionFor("post"))
    : null;
  const knowledge = testProgress(scope.results, enrollmentId);

  return (
    <div className="space-y-6">
      {header}

      {!template ? (
        <Card>
          <CardContent className="text-muted-foreground pt-6 text-sm">
            Aucune grille d'audit n'est ouverte pour ce programme.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            {(["pre", "post"] as const).map((phase) => {
              const campaign = campaignFor(phase);
              const submission = submissionFor(phase);
              const score = submission ? scoreSubmission(template, submission) : null;
              return (
                <Card key={phase}>
                  <CardHeader>
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle className="text-base">{AUDIT_PHASE_LABELS_FR[phase]}</CardTitle>
                      <Badge variant="secondary">
                        {AUDIT_SUBMISSION_LABELS_FR[submission?.status ?? "not_started"]}
                      </Badge>
                    </div>
                    <CardDescription>
                      {campaign
                        ? `${campaign.label} — jusqu'au ${new Date(campaign.closesOn).toLocaleDateString("fr-FR")}`
                        : "Campagne non planifiée"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <p className="text-muted-foreground">
                      {submission?.records.length ?? 0} dossier(s) saisi(s) sur{" "}
                      {template.recordsPerParticipant} attendus.
                    </p>
                    <Progress
                      value={
                        ((submission?.records.length ?? 0) / template.recordsPerParticipant) * 100
                      }
                      className="h-2"
                    />
                    {score ? (
                      <p>
                        Conformité mesurée : <strong>{score.conformityPercent} %</strong> (cible{" "}
                        {template.targetConformityPercent} %)
                      </p>
                    ) : null}
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-h-11 w-full sm:w-auto"
                      disabled={campaign?.status !== "open"}
                    >
                      <ClipboardCheck className="mr-2 size-4" />
                      {campaign?.status === "open"
                        ? "Remplir un dossier (simulé)"
                        : "Campagne close"}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Ma progression</CardTitle>
              <CardDescription>
                Comparaison déterministe avant / après. Une compétence en situation réelle reste
                validée par un tiers : un audit ne l'accorde jamais seul.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 text-sm sm:grid-cols-2">
              <div className="rounded-md border border-border p-3">
                <p className="text-muted-foreground text-xs uppercase">Conformité des pratiques</p>
                <p className="text-lg font-semibold">
                  {comparison?.prePercent ?? "—"} % → {comparison?.postPercent ?? "en cours"}
                  {comparison?.postPercent !== null && comparison?.postPercent !== undefined
                    ? " %"
                    : ""}
                </p>
                {comparison?.deltaPoints !== null && comparison?.deltaPoints !== undefined ? (
                  <p className="text-muted-foreground text-xs">
                    {comparison.deltaPoints > 0 ? "+" : ""}
                    {comparison.deltaPoints} points
                  </p>
                ) : null}
              </div>
              <div className="rounded-md border border-border p-3">
                <p className="text-muted-foreground text-xs uppercase">Connaissances (pré/post)</p>
                <p className="text-lg font-semibold">
                  {knowledge?.prePercent ?? "—"} % → {knowledge?.postPercent ?? "—"} %
                </p>
                {knowledge?.deltaPoints !== null && knowledge?.deltaPoints !== undefined ? (
                  <p className="text-muted-foreground text-xs">
                    {knowledge.deltaPoints > 0 ? "+" : ""}
                    {knowledge.deltaPoints} points
                  </p>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Mes séances</CardTitle>
          <CardDescription>En ligne, visioconférence ou présentiel.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {scope.sessions.length === 0 ? (
            <p className="text-muted-foreground">Aucune séance planifiée.</p>
          ) : (
            <ul className="space-y-2">
              {scope.sessions.map((session) => (
                <li key={session.id} className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{session.title}</span>
                  <Badge variant="outline" className="font-normal">
                    {SESSION_MODALITY_LABELS_FR[session.modality]}
                  </Badge>
                  <span className="text-muted-foreground text-xs">
                    {new Date(session.startsAt).toLocaleDateString("fr-FR")} ·{" "}
                    {session.durationMinutes} min
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

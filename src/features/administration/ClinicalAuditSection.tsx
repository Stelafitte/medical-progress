/**
 * Administration du module OPTIONNEL « Audits de pratique » (typiquement DPC).
 * Maquette : aucune écriture, aucun fichier, aucun appel IA.
 */
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useDataAccess, useSession } from "@/application/session";
import { EmptyState, MockBadge, PanelCard, ScopeNotice, StatCard } from "@/features/professional/mock-ui";
import {
  AUDIT_PHASE_LABELS_FR,
  SESSION_MODALITY_LABELS_FR,
  aggregateCampaign,
  attendanceRate,
  itemConformity,
} from "@/domain/clinicalAudit";

export function ClinicalAuditSection() {
  const data = useDataAccess();
  const { activeProgram } = useSession();

  const { data: scope, isPending } = useQuery({
    queryKey: ["clinical-audits-admin", activeProgram.id],
    queryFn: async () => {
      const [templates, campaigns, submissions, tests, results, sessions, cohorts] =
        await Promise.all([
          data.clinicalAudits.listTemplates(activeProgram.id),
          data.clinicalAudits.listCampaigns(activeProgram.id),
          data.clinicalAudits.listSubmissions(activeProgram.id),
          data.clinicalAudits.listTests(activeProgram.id),
          data.clinicalAudits.listTestResults(activeProgram.id),
          data.clinicalAudits.listSessions(activeProgram.id),
          data.administration.listAllEnrollments(activeProgram.id),
        ]);
      return { templates, campaigns, submissions, tests, results, sessions, participants: cohorts.length };
    },
  });

  if (isPending || !scope) return <Skeleton className="h-72 w-full" />;

  if (!activeProgram.config.auditsEnabled) {
    return (
      <PanelCard
        title="Audits de pratique"
        description="Module optionnel"
        action={<MockBadge label="Désactivé" />}
      >
        <EmptyState>
          Ce module n'est pas activé pour <strong>{activeProgram.name}</strong>. Il s'active par
          programme dans la configuration, sans dupliquer l'application.
        </EmptyState>
      </PanelCard>
    );
  }

  const published = scope.templates.find((t) => t.status === "published");

  const aggregates = published
    ? scope.campaigns.map((campaign) =>
        aggregateCampaign(published, campaign, scope.submissions, scope.participants),
      )
    : [];
  const pre = aggregates.find((a) => a.phase === "pre");
  const post = aggregates.find((a) => a.phase === "post");

  const items = published ? itemConformity(published, scope.submissions) : [];

  const meanTestScore = (phase: "pre" | "post") => {
    const rows = scope.results.filter((r) => r.phase === phase);
    if (rows.length === 0) return null;
    return Math.round(rows.reduce((s, r) => s + r.scorePercent, 0) / rows.length);
  };

  return (
    <div className="space-y-6">
      <ScopeNotice>
        Module <strong>optionnel</strong> activé pour ce programme. Les dossiers audités sont
        désignés par une <strong>référence anonyme</strong> : aucune donnée patient n'est
        enregistrée. Aucun audit ne valide seul une compétence réelle.
      </ScopeNotice>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Conformité — audit initial"
          value={pre ? `${pre.meanConformityPercent} %` : "—"}
          hint={pre ? `${pre.submitted}/${pre.expectedParticipants} participants` : "en attente"}
        />
        <StatCard
          label="Conformité — audit de suivi"
          value={post ? `${post.meanConformityPercent} %` : "—"}
          hint={post ? `${post.submitted}/${post.expectedParticipants} participants` : "en attente"}
        />
        <StatCard
          label="Progression moyenne"
          value={
            pre && post && post.submitted > 0
              ? `${post.meanConformityPercent - pre.meanConformityPercent > 0 ? "+" : ""}${
                  post.meanConformityPercent - pre.meanConformityPercent
                } pts`
              : "en cours"
          }
          hint="Calcul déterministe, sans IA"
        />
        <StatCard
          label="Pré-test / post-test"
          value={`${meanTestScore("pre") ?? "—"} % → ${meanTestScore("post") ?? "—"} %`}
          hint="Moyennes de promotion"
        />
      </div>

      <PanelCard
        title="Grilles d'audit configurées"
        description="Une grille publiée est immuable pour les campagnes ouvertes."
        action={<MockBadge />}
      >
        {scope.templates.length === 0 ? (
          <EmptyState>Aucune grille configurée.</EmptyState>
        ) : (
          <ul className="space-y-3">
            {scope.templates.map((template) => (
              <li key={template.id} className="rounded-md border border-border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{template.title}</span>
                  <Badge variant={template.status === "published" ? "default" : "outline"}>
                    {template.status === "published" ? "publiée" : template.status}
                  </Badge>
                  <span className="text-muted-foreground text-xs">
                    {template.items.length} critère(s) · {template.recordsPerParticipant} dossiers ·
                    cible {template.targetConformityPercent} %
                  </span>
                </div>
                <p className="text-muted-foreground mt-1 text-sm">{template.description}</p>
              </li>
            ))}
          </ul>
        )}
      </PanelCard>

      <PanelCard
        title="Campagnes avant / après"
        description="Deux temps de mesure sur la même grille : c'est ce qui rend la progression comparable."
      >
        {scope.campaigns.length === 0 ? (
          <EmptyState>Aucune campagne planifiée.</EmptyState>
        ) : (
          <ul className="space-y-3">
            {scope.campaigns.map((campaign) => {
              const agg = aggregates.find((a) => a.campaignId === campaign.id);
              return (
                <li key={campaign.id} className="space-y-2 rounded-md border border-border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{campaign.label}</span>
                    <Badge variant="secondary">{AUDIT_PHASE_LABELS_FR[campaign.phase]}</Badge>
                    <Badge variant="outline">{campaign.status}</Badge>
                    <span className="text-muted-foreground text-xs">
                      du {new Date(campaign.opensOn).toLocaleDateString("fr-FR")} au{" "}
                      {new Date(campaign.closesOn).toLocaleDateString("fr-FR")}
                    </span>
                  </div>
                  {agg ? (
                    <>
                      <Progress value={agg.participationPercent} className="h-2" />
                      <p className="text-muted-foreground text-xs">
                        Participation {agg.participationPercent} % · {agg.submitted} transmis ·{" "}
                        {agg.inProgress} en cours · conformité moyenne {agg.meanConformityPercent} %
                      </p>
                    </>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </PanelCard>

      <PanelCard
        title="Conformité critère par critère"
        description="Cible les messages pédagogiques sur les écarts réellement observés."
      >
        {items.length === 0 ? (
          <EmptyState>Aucune réponse enregistrée.</EmptyState>
        ) : (
          <ul className="space-y-3">
            {items.map((row) => (
              <li key={row.item.id} className="space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <Badge variant="secondary" className="font-mono text-[10px]">
                      {row.item.code}
                    </Badge>
                    {row.item.label}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {row.conformityPercent} % sur {row.recordCount} dossiers
                  </span>
                </div>
                <Progress value={row.conformityPercent} className="h-2" />
              </li>
            ))}
          </ul>
        )}
      </PanelCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <PanelCard
          title="Séances (en ligne, visio, présentiel)"
          description="Émargement simulé : la traçabilité de participation est prévue côté serveur."
        >
          {scope.sessions.length === 0 ? (
            <EmptyState>Aucune séance planifiée.</EmptyState>
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
                    {session.durationMinutes} min · présence {attendanceRate(session)} %
                  </span>
                </li>
              ))}
            </ul>
          )}
        </PanelCard>

        <PanelCard
          title="Pré-tests et post-tests"
          description="Deux passages du même contenu, comparables individuellement et par promotion."
        >
          {scope.tests.length === 0 ? (
            <EmptyState>Aucun test configuré.</EmptyState>
          ) : (
            <ul className="space-y-2">
              {scope.tests.map((test) => (
                <li key={test.id} className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{test.title}</span>
                  <Badge variant="secondary">{AUDIT_PHASE_LABELS_FR[test.phase]}</Badge>
                  <span className="text-muted-foreground text-xs">
                    {test.questionCount} questions ·{" "}
                    {scope.results.filter((r) => r.testId === test.id).length} résultat(s)
                  </span>
                </li>
              ))}
            </ul>
          )}
        </PanelCard>
      </div>
    </div>
  );
}

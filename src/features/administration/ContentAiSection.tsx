/**
 * Exploitation IA des contenus (MAQUETTE).
 *
 * Aucune extraction, aucun index, aucun appel IA : tous les statuts, files et
 * actions sont simulés et journalisés à l'écran. La règle affichée est le
 * contrat universel : tout support publié doit disposer d'un profil IA prêt,
 * avec références contrôlées, avant d'être exploitable par les apprenants.
 */
import { useMemo, useState } from "react";
import { Bot, Quote, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState, PanelCard, ScopeNotice, StatCard } from "@/features/professional/mock-ui";
import {
  AI_GROUNDING_NOTICE_FR,
  AI_MOCK_NOTICE_FR,
  AI_TIER_LABELS_FR,
  CITATION_KIND_LABELS_FR,
  CONTENT_AI_ACTION_LABELS_FR,
  CONTENT_AI_MODE_LABELS_FR,
  CONTENT_AI_QUEUE_LABELS_FR,
  CONTENT_AI_STATUS_LABELS_FR,
  EXTRACTION_FACET_LABELS_FR,
  LINK_TRANSFORM_DECISION_LABELS_FR,
  PUBLICATION_BLOCKED_NOTICE_FR,
  availableContentAiActions,
  computeContentAiCoverage,
  coversExpectedFacets,
  evaluatePublicationGate,
  groupByQueue,
  plannedTierForMode,
  type ContentAiProfile,
  type ContentAiQueue,
  type ProgramAiPolicy,
} from "@/domain/contentAi";
import { MEDIA_KIND_LABELS_FR, type MediaResource } from "@/domain/mediaLibrary";
import { WEB_CHANGE_NOTICE_FR, WEB_SNAPSHOT_NOTICE_FR } from "@/domain/webPage";

const QUEUES: readonly ContentAiQueue[] = ["to_process", "to_review", "ready", "outdated"];

const statusVariant = (profile: ContentAiProfile) =>
  profile.status === "ready" ? "secondary" : "outline";

export function ContentAiSection({
  programName,
  media,
  profiles,
  policy,
}: {
  programName: string;
  media: readonly MediaResource[];
  profiles: readonly ContentAiProfile[];
  policy: ProgramAiPolicy | undefined;
}) {
  const [lastAction, setLastAction] = useState<string | null>(null);
  const coverage = useMemo(() => computeContentAiCoverage(media, profiles), [media, profiles]);
  const queues = useMemo(() => groupByQueue(profiles), [profiles]);
  const resourceOf = (mediaId: string) => media.find((m) => m.id === mediaId);

  const percent = Math.round(coverage.readyRatio * 100);

  return (
    <div className="space-y-6">
      <ScopeNotice>
        Exploitation IA des contenus de <strong>{programName}</strong>. {AI_MOCK_NOTICE_FR}.{" "}
        {AI_GROUNDING_NOTICE_FR}.
      </ScopeNotice>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Supports publiés" value={coverage.publishedCount} />
        <StatCard label="Avec profil IA" value={coverage.withProfile} />
        <StatCard label="Prêts pour l'IA" value={coverage.ready} />
        <StatCard label="Couverture IA" value={`${percent} %`} hint="Publiés et prêts" />
      </div>

      <PanelCard
        title="Couverture IA des contenus publiés"
        description="Objectif de conception : 100 % des supports publiés disposent d'un profil prêt, quel que soit le format."
      >
        <div className="space-y-3">
          <Progress value={percent} aria-label="Couverture IA des contenus publiés" />
          <ul className="grid gap-2 sm:grid-cols-2">
            {coverage.byKind.map((row) => (
              <li
                key={row.kind}
                className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
              >
                <span>{MEDIA_KIND_LABELS_FR[row.kind]}</span>
                <Badge variant={row.ready === row.published ? "secondary" : "outline"}>
                  {row.ready}/{row.published} prêts
                </Badge>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">{PUBLICATION_BLOCKED_NOTICE_FR}.</p>
        </div>
      </PanelCard>

      <PanelCard
        title="Files de traitement"
        description="À traiter, à relire, prêts, obsolètes : chaque support publié doit finir dans « Prêts »."
      >
        <Tabs defaultValue="to_process" className="space-y-4">
          <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
            {QUEUES.map((queue) => (
              <TabsTrigger
                key={queue}
                value={queue}
                className="min-h-11 flex-none text-xs sm:text-sm"
              >
                {CONTENT_AI_QUEUE_LABELS_FR[queue]} ({queues[queue].length})
              </TabsTrigger>
            ))}
          </TabsList>

          {QUEUES.map((queue) => (
            <TabsContent key={queue} value={queue} className="space-y-3">
              {queues[queue].length === 0 ? (
                <EmptyState>Aucun support dans cette file.</EmptyState>
              ) : (
                <>
                  {/* Mobile : cartes empilées dès 360 px. */}
                  <ul className="space-y-3 md:hidden">
                    {queues[queue].map((profile) => {
                      const resource = resourceOf(profile.mediaId);
                      return (
                        <li
                          key={profile.mediaId}
                          className="space-y-2 rounded-md border border-border p-3"
                        >
                          <p className="text-sm font-medium">
                            {resource?.title ?? profile.mediaId}
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            <Badge variant="outline">
                              {MEDIA_KIND_LABELS_FR[profile.mediaKind]}
                            </Badge>
                            <Badge variant={statusVariant(profile)}>
                              {CONTENT_AI_STATUS_LABELS_FR[profile.status]}
                            </Badge>
                            <Badge variant="outline">{profile.sourceVersion}</Badge>
                          </div>
                          <ProfileDetail
                            profile={profile}
                            resource={resource}
                            policy={policy}
                            onAction={setLastAction}
                          />
                        </li>
                      );
                    })}
                  </ul>

                  <div className="hidden md:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Support</TableHead>
                          <TableHead>Format</TableHead>
                          <TableHead>Statut IA</TableHead>
                          <TableHead>Version exploitée</TableHead>
                          <TableHead>Segments</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {queues[queue].map((profile) => {
                          const resource = resourceOf(profile.mediaId);
                          return (
                            <TableRow key={profile.mediaId}>
                              <TableCell className="max-w-[22rem]">
                                <p className="font-medium">{resource?.title ?? profile.mediaId}</p>
                                <ProfileDetail
                                  profile={profile}
                                  resource={resource}
                                  policy={policy}
                                  onAction={setLastAction}
                                  compact
                                />
                              </TableCell>
                              <TableCell>{MEDIA_KIND_LABELS_FR[profile.mediaKind]}</TableCell>
                              <TableCell>
                                <Badge variant={statusVariant(profile)}>
                                  {CONTENT_AI_STATUS_LABELS_FR[profile.status]}
                                </Badge>
                              </TableCell>
                              <TableCell className="font-mono text-xs">
                                {profile.sourceVersion}
                              </TableCell>
                              <TableCell>{profile.segmentCount}</TableCell>
                              <TableCell>
                                <ActionButtons profile={profile} onAction={setLastAction} />
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </PanelCard>

      <PanelCard
        title="Modes d'usage et coûts prévus"
        description="Escalade documentée : contenu validé seul, modèle léger, modèle avancé, vocal temps réel. Aucune requête n'est émise."
      >
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {policy?.note ?? "Politique IA non définie pour ce programme."}
          </p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {(policy?.allowedModes ?? []).map((mode) => (
              <li
                key={mode}
                className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
              >
                <span>{CONTENT_AI_MODE_LABELS_FR[mode]}</span>
                <Badge variant="outline">{AI_TIER_LABELS_FR[plannedTierForMode(mode)]}</Badge>
              </li>
            ))}
          </ul>
          {policy ? (
            <p className="text-xs text-muted-foreground">
              Vocal : {policy.voiceEnabled ? "activé" : "désactivé"} —{" "}
              {policy.voicePromoted
                ? "mis en avant auprès des apprenants"
                : "jamais lancé par défaut (maîtrise des coûts)"}
              . Réglage modifiable par l'administrateur.
            </p>
          ) : null}
        </div>
      </PanelCard>

      {lastAction ? (
        <p role="status" className="rounded-md border border-dashed border-border p-3 text-sm">
          Action simulée : {lastAction}
        </p>
      ) : null}
    </div>
  );
}

function ActionButtons({
  profile,
  onAction,
}: {
  profile: ContentAiProfile;
  onAction: (message: string) => void;
}) {
  const actions = availableContentAiActions(profile);
  if (actions.length === 0)
    return <span className="text-xs text-muted-foreground">Aucune action</span>;
  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((action) => (
        <Button
          key={action}
          type="button"
          size="sm"
          variant="outline"
          className="min-h-11"
          onClick={() =>
            onAction(
              `${CONTENT_AI_ACTION_LABELS_FR[action]} — ${profile.mediaId} (aucun traitement réel)`,
            )
          }
        >
          {CONTENT_AI_ACTION_LABELS_FR[action]}
        </Button>
      ))}
    </div>
  );
}

function ProfileDetail({
  profile,
  resource,
  policy,
  onAction,
  compact = false,
}: {
  profile: ContentAiProfile;
  resource: MediaResource | undefined;
  policy: ProgramAiPolicy | undefined;
  onAction: (message: string) => void;
  compact?: boolean;
}) {
  const gate = resource ? evaluatePublicationGate(resource, profile) : undefined;
  return (
    <div className="space-y-2 pt-1 text-xs text-muted-foreground">
      <p className="flex items-start gap-1.5">
        <Bot className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        Contenu extrait :{" "}
        {profile.extractedFacets.map((f) => EXTRACTION_FACET_LABELS_FR[f]).join(" · ")}
        {coversExpectedFacets(profile) ? " — complet pour ce format" : " — incomplet"}
      </p>
      {profile.citations.length > 0 ? (
        <p className="flex items-start gap-1.5">
          <Quote className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Références : {CITATION_KIND_LABELS_FR[profile.citations[0]!.kind]} —{" "}
          {profile.citations.map((c) => c.locator).join(" · ")}{" "}
          {profile.citations.every((c) => c.verified) ? "(contrôlées)" : "(à contrôler)"}
        </p>
      ) : null}
      {resource?.webPage ? (
        <p>
          {WEB_SNAPSHOT_NOTICE_FR}. {resource.webPage.refreshToReview ? WEB_CHANGE_NOTICE_FR : ""}
        </p>
      ) : null}
      {profile.linkDecision ? (
        <p>Décision requise : {LINK_TRANSFORM_DECISION_LABELS_FR[profile.linkDecision]}.</p>
      ) : null}
      {profile.alerts.map((alert) => (
        <p key={alert} className="text-foreground">
          {alert}
        </p>
      ))}
      {gate && !gate.allowed ? (
        <p className="flex items-start gap-1.5">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {PUBLICATION_BLOCKED_NOTICE_FR} : {gate.reasons.join(" ")}
        </p>
      ) : null}
      {policy ? null : <p>Politique IA du programme non chargée.</p>}
      {compact ? null : <ActionButtons profile={profile} onAction={onAction} />}
    </div>
  );
}

/**
 * « Plan de communication proposé » — interface coordinateur.
 *
 * Chaque ligne est une PROPOSITION simulée : modifiable, désactivable,
 * supprimable et soumise à validation humaine explicite. Aucun envoi, aucune
 * tâche planifiée réelle, aucune persistance : rien n'est expédié et
 * l'historique local disparaît au rechargement.
 *
 * Transversal : DFASM, DIU, DPC ou tout autre programme. Le DPC HVG–Amylose
 * n'est qu'un démonstrateur.
 */
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MockBadge, PanelCard, ScopeNotice, StatCard } from "@/features/professional/mock-ui";
import {
  PLAN_AUDIENCE_LABELS_FR,
  PLAN_DIFF_LABELS_FR,
  PLAN_PROPOSAL_STATE_LABELS_FR,
  COMMUNICATION_PLAN_NO_SEND_FR,
  COMMUNICATION_PLAN_STATUS_LABELS_FR,
  activatePlan,
  addManualProposal,
  approveProposals,
  approvedProposals,
  editProposal,
  generateCommunicationPlan,
  reconcileCommunicationPlan,
  removeProposal,
  setProposalState,
  validatePlan,
  type CommunicationPlan,
  type PlanAudienceKind,
  type PlanCalendar,
  type PlanDiffEntry,
  type PlanReconciliation,
} from "@/domain/communicationPlan";
import { MESSAGE_CATEGORY_LABELS_FR } from "@/domain/communication";
import {
  PLAN_DEFAULT_CHANNEL,
  toAudienceDefinition,
  toScheduleTrigger,
} from "@/application/communicationPlanSource";
import { addPreparedCampaign } from "@/application/communicationStore";
import type { PersonId, ProgramId } from "@/domain/types";

const TOUCH = "min-h-11";

const AUDIENCE_OPTIONS: readonly PlanAudienceKind[] = [
  "all_participants",
  "incomplete_participants",
  "submitted_participants",
  "facilitators",
];

function formatAt(value: string | undefined, timeZone: string): string {
  if (!value) return "date non calculable";
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(new Date(value));
}

function isoToLocalInput(value?: string): string {
  return value ? value.slice(0, 16) : "";
}

export interface CommunicationPlanSectionProps {
  readonly calendar: PlanCalendar;
  readonly actorPersonId: PersonId;
  /** Horodatage de génération fourni par l'appelant (le domaine reste pur). */
  readonly generatedAt?: string;
}

export function CommunicationPlanSection({
  calendar,
  actorPersonId,
  generatedAt,
}: CommunicationPlanSectionProps) {
  const initial = useMemo(
    () =>
      generateCommunicationPlan(calendar, {
        generatedAt: generatedAt ?? "2026-01-01T00:00:00.000Z",
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [calendar.implementationId, calendar.calendarVersion],
  );
  const [plan, setPlan] = useState<CommunicationPlan>(initial);
  const [reconciliation, setReconciliation] = useState<PlanReconciliation | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [manualSubject, setManualSubject] = useState("");
  const [manualBody, setManualBody] = useState("");

  const currentPlan = plan.calendarVersion === calendar.calendarVersion ? plan : initial;
  const validation = validatePlan(currentPlan);
  const timeline = currentPlan.proposals;

  const recalculate = () => {
    setReconciliation(
      reconcileCommunicationPlan(currentPlan, calendar, {
        generatedAt: generatedAt ?? "2026-01-01T00:00:00.000Z",
      }),
    );
  };

  const applyRecalculation = () => {
    if (!reconciliation) return;
    setPlan(reconciliation.nextPlan);
    setReconciliation(null);
    setNotice("Recalcul appliqué : les modifications manuelles ont été préservées.");
  };

  const finalise = () => {
    const activated = activatePlan(currentPlan);
    if (activated.status !== "activated") {
      setNotice("Plan non validé : validez au moins une proposition (validation humaine).");
      return;
    }
    for (const proposal of approvedProposals(activated)) {
      addPreparedCampaign({
        campaign: {
          id: `${activated.implementationId}-${proposal.id}` as never,
          programId: activated.programId as ProgramId,
          implementationId: activated.implementationId as never,
          channel: PLAN_DEFAULT_CHANNEL,
          audience: toAudienceDefinition(proposal.audience, proposal.milestoneRef),
          subject: proposal.subject,
          body: proposal.body,
          status: "scheduled",
          createdBy: actorPersonId,
          approvedBy: actorPersonId,
          maxRecipients: 500,
          requiresCollectiveConfirmation: true,
          collectiveConfirmationAt: activated.generatedAt,
        },
        trigger: toScheduleTrigger(proposal.scheduledAt, activated.timeZone),
        triggerLabel: `${formatAt(proposal.scheduledAt, activated.timeZone)} (${activated.timeZone})`,
        audienceLabel: PLAN_AUDIENCE_LABELS_FR[proposal.audience],
        recipientCount: 0,
        preparedAt: activated.generatedAt,
        dispatchStatus: "pending",
        isSimulated: true,
      });
    }
    setPlan(activated);
    setNotice(
      "Plan de communication validé en simulation : les propositions validées apparaissent dans l'historique local de l'écran Communications, sans aucun envoi.",
    );
  };

  return (
    <section className="space-y-4">
      <ScopeNotice>
        <strong>Plan de communication proposé</strong> — généré automatiquement depuis le calendrier
        de l'implémentation. {COMMUNICATION_PLAN_NO_SEND_FR} Aucune tâche planifiée réelle, aucun
        fournisseur d'e-mail, aucune relance réellement déclenchée. Mécanisme identique pour DFASM,
        DIU, DPC et tout autre programme.
      </ScopeNotice>

      <PanelCard
        title="Plan proposé (simulation)"
        description={`Calendrier ${calendar.calendarVersion} — fuseau ${calendar.timeZone} — règles ${currentPlan.generatedByRuleVersion}`}
        action={<MockBadge label="Simulé — aucun envoi" />}
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label="Propositions" value={timeline.length} />
          <StatCard label="Validées" value={validation.approvedCount} />
          <StatCard label="En attente de validation" value={validation.pendingCount} />
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">
            {COMMUNICATION_PLAN_STATUS_LABELS_FR[currentPlan.status]}
          </Badge>
          <Button
            type="button"
            variant="outline"
            className={`${TOUCH} w-full sm:w-auto`}
            onClick={recalculate}
          >
            Recalculer depuis le calendrier
          </Button>
          <Button
            type="button"
            variant="outline"
            className={`${TOUCH} w-full sm:w-auto`}
            onClick={() =>
              setPlan(
                approveProposals(
                  currentPlan,
                  timeline.filter((p) => p.state === "enabled" || p.state === "edited").map((p) => p.id),
                ),
              )
            }
          >
            Valider par lot les propositions actives
          </Button>
        </div>

        {reconciliation ? (
          <div className="space-y-2 rounded-md border border-border p-3" aria-live="polite">
            <h4 className="text-sm font-medium">
              Différences avant application ({reconciliation.differences.length})
            </h4>
            <ul className="space-y-1 text-sm text-muted-foreground">
              {reconciliation.differences.map((entry: PlanDiffEntry) => (
                <li key={`${entry.kind}-${entry.proposalId}`}>
                  <span className="text-foreground font-medium">
                    {PLAN_DIFF_LABELS_FR[entry.kind]}
                  </span>{" "}
                  — {entry.label} : {entry.detail}
                  {entry.previousAt || entry.nextAt
                    ? ` (${formatAt(entry.previousAt, currentPlan.timeZone)} → ${formatAt(entry.nextAt, currentPlan.timeZone)})`
                    : ""}
                </li>
              ))}
            </ul>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="button" className={`${TOUCH} w-full sm:w-auto`} onClick={applyRecalculation}>
                Appliquer le recalcul
              </Button>
              <Button
                type="button"
                variant="ghost"
                className={`${TOUCH} w-full sm:w-auto`}
                onClick={() => setReconciliation(null)}
              >
                Abandonner le recalcul
              </Button>
            </div>
          </div>
        ) : null}

        <ol className="space-y-3">
          {timeline.map((proposal) => (
            <li key={proposal.id} className="space-y-2 rounded-md border border-border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">
                  {formatAt(proposal.scheduledAt, proposal.timeZone)}
                </span>
                <Badge variant="outline" className="font-normal">
                  {proposal.timeZone}
                </Badge>
                <Badge variant="secondary">{PLAN_PROPOSAL_STATE_LABELS_FR[proposal.state]}</Badge>
                <Badge variant="outline" className="font-normal">
                  {proposal.origin === "automatic_rule" ? "Automatique" : "Manuelle"}
                </Badge>
                <Badge variant="outline" className="font-normal">
                  Canal simulé : e-mail
                </Badge>
              </div>
              <p className="text-sm font-medium">{proposal.subject}</p>
              <p className="text-muted-foreground text-xs">
                Destinataires : {PLAN_AUDIENCE_LABELS_FR[proposal.audience]} · Motif :{" "}
                {proposal.rationale} · Catégorie : {MESSAGE_CATEGORY_LABELS_FR[proposal.category]}
              </p>

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className={`${TOUCH} w-full sm:w-auto`}
                  onClick={() =>
                    setPlan(
                      setProposalState(
                        currentPlan,
                        proposal.id,
                        proposal.state === "disabled" ? "enabled" : "disabled",
                      ),
                    )
                  }
                >
                  {proposal.state === "disabled" ? "Activer" : "Désactiver"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className={`${TOUCH} w-full sm:w-auto`}
                  onClick={() => setOpenId(openId === proposal.id ? null : proposal.id)}
                >
                  Modifier
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className={`${TOUCH} w-full sm:w-auto`}
                  onClick={() => setPreviewId(previewId === proposal.id ? null : proposal.id)}
                >
                  Prévisualiser
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className={`${TOUCH} w-full sm:w-auto`}
                  onClick={() => setPlan(approveProposals(currentPlan, [proposal.id]))}
                >
                  Valider cette proposition
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className={`${TOUCH} w-full sm:w-auto`}
                  onClick={() => setPlan(removeProposal(currentPlan, proposal.id))}
                >
                  Supprimer
                </Button>
              </div>

              {previewId === proposal.id ? (
                <pre className="bg-muted overflow-x-auto rounded-md p-3 text-xs whitespace-pre-wrap">
                  {proposal.body}
                </pre>
              ) : null}

              {openId === proposal.id ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor={`date-${proposal.id}`}>Date et heure ({proposal.timeZone})</Label>
                    <Input
                      id={`date-${proposal.id}`}
                      type="datetime-local"
                      className={TOUCH}
                      value={isoToLocalInput(proposal.scheduledAt)}
                      onChange={(event) =>
                        setPlan(
                          editProposal(currentPlan, proposal.id, {
                            scheduledAt: new Date(event.target.value).toISOString(),
                          }),
                        )
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`audience-${proposal.id}`}>Destinataires (périmètre du programme)</Label>
                    <Select
                      value={proposal.audience}
                      onValueChange={(value) =>
                        setPlan(
                          editProposal(currentPlan, proposal.id, {
                            audience: value as PlanAudienceKind,
                          }),
                        )
                      }
                    >
                      <SelectTrigger id={`audience-${proposal.id}`} className={TOUCH}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {AUDIENCE_OPTIONS.map((kind) => (
                          <SelectItem key={kind} value={kind}>
                            {PLAN_AUDIENCE_LABELS_FR[kind]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <Label htmlFor={`subject-${proposal.id}`}>Sujet</Label>
                    <Input
                      id={`subject-${proposal.id}`}
                      className={TOUCH}
                      value={proposal.subject}
                      onChange={(event) =>
                        setPlan(
                          editProposal(currentPlan, proposal.id, { subject: event.target.value }),
                        )
                      }
                    />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <Label htmlFor={`body-${proposal.id}`}>Message</Label>
                    <Textarea
                      id={`body-${proposal.id}`}
                      rows={5}
                      value={proposal.body}
                      onChange={(event) =>
                        setPlan(editProposal(currentPlan, proposal.id, { body: event.target.value }))
                      }
                    />
                  </div>
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      </PanelCard>

      <PanelCard
        title="Ajouter un message libre"
        description="Message ponctuel rattaché au plan, d'origine manuelle : il n'est jamais écrasé par un recalcul."
        action={<MockBadge label="Simulé" />}
      >
        <div className="grid gap-3">
          <div className="space-y-1">
            <Label htmlFor="manual-subject">Sujet du message libre</Label>
            <Input
              id="manual-subject"
              className={TOUCH}
              value={manualSubject}
              onChange={(event) => setManualSubject(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="manual-body">Contenu du message libre</Label>
            <Textarea
              id="manual-body"
              rows={4}
              value={manualBody}
              onChange={(event) => setManualBody(event.target.value)}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            className={`${TOUCH} w-full sm:w-auto`}
            disabled={manualSubject.trim() === ""}
            onClick={() => {
              setPlan(
                addManualProposal(currentPlan, {
                  id: `manual-${currentPlan.proposals.length + 1}`,
                  milestoneRef: calendar.steps[0]?.id ?? "libre",
                  milestoneLabel: calendar.steps[0]?.label ?? "Message libre",
                  subject: manualSubject,
                  body: manualBody,
                  audience: "all_participants",
                  ...(calendar.steps[0]?.startsAt
                    ? { scheduledAt: calendar.steps[0]!.startsAt! }
                    : {}),
                }),
              );
              setManualSubject("");
              setManualBody("");
            }}
          >
            Ajouter au plan (simulation)
          </Button>
        </div>
      </PanelCard>

      {validation.blockingReasons.length ? (
        <ul role="alert" className="space-y-1 text-sm">
          {validation.blockingReasons.map((reason) => (
            <li key={reason}>Bloquant : {reason}</li>
          ))}
        </ul>
      ) : null}

      {notice ? (
        <p aria-live="polite" className="text-sm">
          {notice}
        </p>
      ) : null}

      <Button
        type="button"
        className={`${TOUCH} w-full sm:w-auto`}
        disabled={!validation.canActivate}
        onClick={finalise}
      >
        Valider le plan de communication (simulation)
      </Button>
      <p className="text-muted-foreground text-xs">
        Validation humaine obligatoire. Aucun bouton d'envoi immédiat n'existe dans ce parcours :
        les propositions validées sont transmises à l'écran Communications comme campagnes simulées
        programmées, contrôlables, modifiables et annulables. Historique local perdu au
        rechargement.
      </p>
    </section>
  );
}

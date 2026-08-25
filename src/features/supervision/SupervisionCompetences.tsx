import { useState } from "react";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, MockBadge, PanelCard, ScopeNotice } from "@/features/professional/mock-ui";
import { learnerName, useSupervision } from "@/features/supervision/useSupervision";
import { CONFIRMATION_DECISION_LABELS_FR, canConfirmRealCompetence } from "@/domain/supervision";
import { MASTERY_LABELS_FR } from "@/domain/mastery";
import { MASTERY_ORDER, type MasteryLevel } from "@/domain/types";
import { useSession } from "@/application/session";
import { useCompetenceJournal } from "@/application/competenceJournalStore";
import { tutorNotifications } from "@/domain/competenceListView";

export function SupervisionCompetences() {
  const { rolesInActiveProgram } = useSession();
  const { data, isPending } = useSupervision();
  const journal = useCompetenceJournal();
  const [levels, setLevels] = useState<Record<string, MasteryLevel>>({});
  const [feedback, setFeedback] = useState<string | null>(null);

  if (isPending || !data) return <Skeleton className="h-72 w-full" />;

  const canConfirm = canConfirmRealCompetence(rolesInActiveProgram);
  /** Remontée des auto-déclarations et questions saisies par les apprenants. */
  const notifications = tutorNotifications(journal, data.outcomes);


  return (
    <div className="space-y-6">
      <SectionHeading
        title="Compétences à confirmer"
        level={1}
        action={<MockBadge />}
        description="Toute compétence réelle exige une validation humaine : l'apprenant ne peut jamais l'auto-déclarer acquise."
      />

      <PanelCard
        title="Déclarations d'apprenants reçues"
        description="Auto-déclarations et questions remontées depuis « Mes compétences ». Aucune n'entraîne d'acquisition."
        action={<MockBadge label="Simulé" />}
      >
        {notifications.length === 0 ? (
          <EmptyState>Aucune déclaration ni question en attente.</EmptyState>
        ) : (
          <ul className="space-y-3">
            {notifications.map((notification) => (
              <li
                key={`${notification.outcomeId}-${notification.kind}-${notification.at}`}
                className="space-y-1 border-b border-border pb-2 last:border-0"
              >
                <p className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium">
                    {notification.code} — {notification.label}
                  </span>
                  <Badge variant="outline" className="font-normal">
                    {notification.kind === "declaration"
                      ? "Auto-déclaration à examiner"
                      : "Question de l'apprenant"}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {new Date(notification.at).toLocaleString("fr-FR")}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">{notification.body}</p>
              </li>
            ))}
          </ul>
        )}
      </PanelCard>

      <ScopeNotice>

        Vous statuez uniquement sur les activités des étudiants que vous encadrez. Le niveau
        d'autonomie proposé reste modifiable avant décision.
      </ScopeNotice>

      {data.confirmations.length === 0 ? (
        <EmptyState>Aucune compétence en attente sur votre périmètre.</EmptyState>
      ) : (
        <div className="grid gap-4">
          {data.confirmations.map((confirmation) => {
            const outcome = data.outcomes.find((o) => o.id === confirmation.outcomeId);
            const level = levels[confirmation.id] ?? confirmation.proposedAutonomy;
            return (
              <PanelCard
                key={confirmation.id}
                title={outcome?.label ?? "Compétence"}
                description={`${learnerName(data, confirmation.enrollmentId)} · ${confirmation.evidenceTitle}`}
                action={
                  <Badge variant="outline" className="font-normal">
                    {CONFIRMATION_DECISION_LABELS_FR[confirmation.decision]}
                  </Badge>
                }
              >
                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <label
                      htmlFor={`autonomie-${confirmation.id}`}
                      className="mb-1 block text-sm font-medium"
                    >
                      Niveau d'autonomie constaté
                    </label>
                    <Select
                      value={level}
                      onValueChange={(v) =>
                        setLevels((prev) => ({ ...prev, [confirmation.id]: v as MasteryLevel }))
                      }
                    >
                      <SelectTrigger id={`autonomie-${confirmation.id}`} className="w-[16rem]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MASTERY_ORDER.map((m) => (
                          <SelectItem key={m} value={m}>
                            {MASTERY_LABELS_FR[m]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      disabled={!canConfirm}
                      onClick={() =>
                        setFeedback(
                          `Démonstration : compétence confirmée au niveau « ${MASTERY_LABELS_FR[level]} » — aucune écriture réelle.`,
                        )
                      }
                    >
                      Confirmer
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!canConfirm}
                      onClick={() => setFeedback("Démonstration : compétence refusée avec motif.")}
                    >
                      Refuser
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!canConfirm}
                      onClick={() =>
                        setFeedback("Démonstration : complément d'activité demandé à l'étudiant.")
                      }
                    >
                      Demander un complément
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Aucune acquisition n'est dérivée automatiquement d'une photo ou d'un QCM pour une
                  compétence réelle.
                </p>
              </PanelCard>
            );
          })}
        </div>
      )}

      {feedback ? <p className="text-sm text-muted-foreground">{feedback}</p> : null}
    </div>
  );
}

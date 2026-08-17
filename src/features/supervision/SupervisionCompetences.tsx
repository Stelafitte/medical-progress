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

export function SupervisionCompetences() {
  const { rolesInActiveProgram } = useSession();
  const { data, isPending } = useSupervision();
  const [levels, setLevels] = useState<Record<string, MasteryLevel>>({});
  const [feedback, setFeedback] = useState<string | null>(null);

  if (isPending || !data) return <Skeleton className="h-72 w-full" />;

  const canConfirm = canConfirmRealCompetence(rolesInActiveProgram);

  return (
    <div className="space-y-6">
      <SectionHeading
        title="Compétences à confirmer"
        level={1}
        action={<MockBadge />}
        description="Toute compétence réelle exige une validation humaine : l'apprenant ne peut jamais l'auto-déclarer acquise."
      />

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

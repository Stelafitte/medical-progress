import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  APPROVAL_RULE_LABELS_FR,
  IMPACT_LABELS_FR,
  approvalRuleForImpact,
  createPlanChangeRequest,
  validatePlanChangeDraft,
  type AcquisitionPlanItem,
  type PlanChangeImpact,
  type PlanChangeRequest,
} from "@/domain/acquisitionPlan";

const IMPACTS: readonly PlanChangeImpact[] = [
  "personal_pace",
  "official_deadline",
  "clinical_competence",
];

/**
 * Formulaire de démonstration : la demande reste en état React local, elle
 * n'est ni enregistrée ni transmise.
 */
export function PlanChangeRequestDialog({
  item,
  onClose,
  onCreate,
}: {
  item: AcquisitionPlanItem | null;
  onClose: () => void;
  onCreate: (request: PlanChangeRequest) => void;
}) {
  const [requestedDate, setRequestedDate] = useState("");
  const [requestedPace, setRequestedPace] = useState("");
  const [justification, setJustification] = useState("");
  const [impact, setImpact] = useState<PlanChangeImpact>("personal_pace");
  const [errors, setErrors] = useState<readonly string[]>([]);

  if (!item) return null;

  const submit = () => {
    const draft = {
      itemId: item.id,
      ...(requestedDate ? { requestedDate } : {}),
      ...(requestedPace ? { requestedPace } : {}),
      justification,
      impact,
    };
    const found = validatePlanChangeDraft(draft);
    if (found.length > 0) {
      setErrors(found.map((e) => e.message));
      return;
    }
    onCreate(
      createPlanChangeRequest(draft, new Date().toISOString(), `req-${item.id}-${Date.now()}`),
    );
    setRequestedDate("");
    setRequestedPace("");
    setJustification("");
    setImpact("personal_pace");
    setErrors([]);
    onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Proposer une modification</DialogTitle>
          <DialogDescription>
            {item.code} — {item.milestoneLabel}. Prototype : la demande reste locale, elle n'est ni
            enregistrée ni envoyée.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="demande-date">Nouvelle date souhaitée</Label>
            <Input
              id="demande-date"
              type="date"
              value={requestedDate}
              onChange={(e) => setRequestedDate(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="demande-rythme">Nouvel ordre ou rythme</Label>
            <Input
              id="demande-rythme"
              value={requestedPace}
              onChange={(e) => setRequestedPace(e.target.value)}
              placeholder="Ex. décaler après le stage, deux séances par semaine"
            />
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Impact proposé</legend>
            <RadioGroup
              value={impact}
              onValueChange={(value) => setImpact(value as PlanChangeImpact)}
            >
              {IMPACTS.map((value) => (
                <div key={value} className="flex items-start gap-2">
                  <RadioGroupItem value={value} id={`impact-${value}`} className="mt-1" />
                  <Label htmlFor={`impact-${value}`} className="font-normal leading-snug">
                    {IMPACT_LABELS_FR[value]}
                    <span className="block text-xs text-muted-foreground">
                      {APPROVAL_RULE_LABELS_FR[approvalRuleForImpact(value)]}
                    </span>
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </fieldset>
          <div className="space-y-1">
            <Label htmlFor="demande-justification">
              Justification <span aria-hidden>*</span>
            </Label>
            <Textarea
              id="demande-justification"
              required
              aria-describedby="demande-justification-aide"
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
            />
            <p id="demande-justification-aide" className="text-xs text-muted-foreground">
              Obligatoire : expliquez le motif du décalage demandé.
            </p>
          </div>

          {errors.length > 0 ? (
            <ul
              role="alert"
              className="space-y-1 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm"
            >
              {errors.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          ) : null}
        </div>

        <DialogFooter className="flex-wrap items-center gap-2">
          <Badge variant="outline">Demande simulée</Badge>
          <Button type="button" variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button type="button" onClick={submit}>
            Créer la demande simulée
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

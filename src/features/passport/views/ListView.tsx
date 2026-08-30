import { MasteryBadge, NatureBadge } from "@/components/mastery-badge";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldAlert } from "lucide-react";
import { MASTERY_LABELS_FR } from "@/domain/mastery";
import type { OutcomeProgress } from "@/domain/mastery";
import type { AcquisitionPlanItem } from "@/domain/acquisitionPlan";
import { STAGE_LABELS_FR } from "@/domain/acquisitionPlan";
import type { Evidence, EvidenceKind, OutcomeNature } from "@/domain/types";

const EVIDENCE_LABELS: Record<EvidenceKind, string> = {
  quiz: "QCM",
  real_activity: "Activité réelle",
  simulation: "Simulation (dont ECOS)",
  placement: "Stage",
  human_validation: "Validation humaine",
};

/** Les trois catégories visibles du passeport, alignées sur outcome.nature. */
const CATEGORIES: ReadonlyArray<{
  nature: OutcomeNature;
  id: string;
  title: string;
  description: string;
}> = [
  {
    nature: "knowledge",
    id: "categorie-connaissances",
    title: "Connaissances",
    description: "Ce que je sais.",
  },
  {
    nature: "simulated_competence",
    id: "categorie-simulees",
    title: "Compétences simulées",
    description:
      "Ce que je sais faire en situation simulée (simulation, ECOS et autres modalités).",
  },
  {
    nature: "real_competence",
    id: "categorie-reelles",
    title: "Compétences réelles",
    description: "Ce que je réalise en situation clinique, toujours validé par un encadrant.",
  },
];

function OutcomeCard({
  item,
  planItem,
  evidence,
  onProposeChange,
}: {
  item: OutcomeProgress;
  planItem?: AcquisitionPlanItem | undefined;
  evidence: readonly Evidence[];
  onProposeChange: (planItem: AcquisitionPlanItem) => void;
}) {
  const related = evidence.filter((e) => e.outcomeId === item.outcome.id);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="font-mono text-xs">
            {item.outcome.code}
          </Badge>
          <NatureBadge nature={item.outcome.nature} />
          <MasteryBadge level={item.mastery} className="ms-auto" />
        </div>
        <CardTitle className="text-base">{item.outcome.label}</CardTitle>
        <CardDescription>
          {item.outcome.description} · Cible : {MASTERY_LABELS_FR[item.outcome.targetMastery]}
          {planItem
            ? ` · ${STAGE_LABELS_FR[planItem.stage]} · échéance ${new Date(
                planItem.dueOn,
              ).toLocaleDateString("fr-FR")}`
            : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {item.blockedBySelfDeclaration ? (
          <p className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-foreground">
            <ShieldAlert className="mt-0.5 size-4 text-warning" aria-hidden />
            Compétence réelle : l'auto-déclaration ne suffit pas. Une validation par un encadrant de
            stage est requise.
          </p>
        ) : null}

        {related.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune preuve enregistrée.</p>
        ) : (
          <ul className="divide-y divide-border">
            {related.map((ev) => (
              <li key={ev.id} className="flex flex-wrap items-center gap-2 py-2">
                <Badge variant="outline" className="font-normal">
                  {EVIDENCE_LABELS[ev.kind]}
                </Badge>
                <span className="text-sm text-foreground">{ev.title}</span>
                <span className="text-xs text-muted-foreground">
                  {new Date(ev.occurredAt).toLocaleDateString("fr-FR")}
                </span>
                <span className="ms-auto flex items-center gap-2 text-xs">
                  {ev.selfDeclared ? <span className="text-warning">auto-déclarée</span> : null}
                  <Badge
                    className={
                      ev.status === "validated"
                        ? "border-transparent bg-success text-success-foreground"
                        : "border-transparent bg-muted text-muted-foreground"
                    }
                  >
                    {ev.status === "validated" ? "validée" : ev.status}
                  </Badge>
                </span>
                {ev.validations.length > 0 ? (
                  <p className="w-full text-xs text-muted-foreground">
                    Validée par un encadrant : {ev.validations[0]?.comment ?? "sans commentaire"}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {planItem ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onProposeChange(planItem)}
          >
            Proposer une modification
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function ListView({
  progress,
  planItems,
  evidence,
  onProposeChange,
}: {
  progress: readonly OutcomeProgress[];
  planItems: readonly AcquisitionPlanItem[];
  evidence: readonly Evidence[];
  onProposeChange: (planItem: AcquisitionPlanItem) => void;
}) {
  const visibleIds = new Set(planItems.map((i) => i.id));
  const items = progress.filter((p) => visibleIds.has(p.outcome.id));

  return (
    <div className="space-y-10">
      {CATEGORIES.map((category) => {
        const categoryItems = items.filter((p) => p.outcome.nature === category.nature);
        if (categoryItems.length === 0) return null;
        return (
          <section key={category.nature} aria-labelledby={category.id}>
            <SectionHeading
              id={category.id}
              title={category.title}
              description={category.description}
              action={
                <Badge variant="outline" className="font-normal">
                  {categoryItems.filter((i) => i.meetsTarget).length} / {categoryItems.length} au
                  niveau cible
                </Badge>
              }
            />
            <ul className="space-y-4">
              {categoryItems.map((p) => (
                <li key={p.outcome.id}>
                  <OutcomeCard
                    item={p}
                    planItem={planItems.find((i) => i.id === p.outcome.id)}
                    evidence={evidence}
                    onProposeChange={onProposeChange}
                  />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Aucun acquis ne correspond aux filtres sélectionnés.
        </p>
      ) : null}
    </div>
  );
}

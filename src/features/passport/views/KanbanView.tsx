import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { NatureBadge } from "@/components/mastery-badge";
import { PLAN_STAGES, STAGE_LABELS_FR, type AcquisitionPlanItem } from "@/domain/acquisitionPlan";

export function KanbanView({
  items,
  onProposeChange,
}: {
  items: readonly AcquisitionPlanItem[];
  onProposeChange: (item: AcquisitionPlanItem) => void;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {PLAN_STAGES.map((stage) => {
        const columnItems = items.filter((i) => i.stage === stage);
        const headingId = `kanban-${stage}`;
        return (
          <section
            key={stage}
            aria-labelledby={headingId}
            className="rounded-lg border border-border bg-card p-3"
          >
            <h3 id={headingId} className="mb-3 flex items-center gap-2 text-sm font-semibold">
              {STAGE_LABELS_FR[stage]}
              <Badge variant="secondary">{columnItems.length}</Badge>
            </h3>
            {columnItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun élément.</p>
            ) : (
              <ul className="space-y-3">
                {columnItems.map((item) => (
                  <li key={item.id}>
                    <Card>
                      <CardHeader className="gap-2 pb-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline" className="font-mono text-xs">
                            {item.code}
                          </Badge>
                          <NatureBadge nature={item.nature} />
                        </div>
                        <CardTitle className="text-sm leading-snug">{item.label}</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2 pb-4">
                        <Progress
                          value={item.progressPercent}
                          aria-label={`Avancement de ${item.code} : ${item.progressPercent} % du niveau cible`}
                        />
                        <p className="text-xs text-muted-foreground">
                          Échéance {new Date(item.dueOn).toLocaleDateString("fr-FR")}
                          {item.officialDeadline ? " · échéance officielle" : ""}
                        </p>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => onProposeChange(item)}
                        >
                          Proposer une modification
                        </Button>
                      </CardContent>
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

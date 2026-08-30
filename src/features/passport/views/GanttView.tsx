import { Badge } from "@/components/ui/badge";
import type { AcquisitionPlanItem } from "@/domain/acquisitionPlan";
import { STAGE_LABELS_FR } from "@/domain/acquisitionPlan";

const NATURE_BAR: Record<AcquisitionPlanItem["nature"], string> = {
  knowledge: "bg-primary/70",
  simulated_competence: "bg-accent",
  real_competence: "bg-success",
};

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}

/**
 * Gantt léger : aucune dépendance externe, positions calculées en pourcentage
 * de la plage du plan. Sur petit écran, la zone défile horizontalement et une
 * alternative textuelle reste disponible.
 */
export function GanttView({
  items,
  range,
}: {
  items: readonly AcquisitionPlanItem[];
  range: { start: string; end: string };
}) {
  const start = new Date(range.start).getTime();
  const end = new Date(range.end).getTime();
  const span = Math.max(end - start, 1);
  const pct = (iso: string) => ((new Date(iso).getTime() - start) / span) * 100;

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucun élément planifié à afficher.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-lg border border-border bg-card p-4">
        <div className="min-w-[42rem] space-y-3">
          <p className="flex justify-between text-xs text-muted-foreground">
            <span>{fmt(range.start)}</span>
            <span>{fmt(range.end)}</span>
          </p>
          <ul className="space-y-3">
            {items.map((item) => {
              const left = Math.max(pct(item.startsOn), 0);
              const width = Math.max(pct(item.dueOn) - left, 2);
              return (
                <li key={item.id} className="grid grid-cols-[10rem_1fr] items-center gap-3">
                  <span className="truncate text-xs font-medium" title={item.label}>
                    <span className="font-mono">{item.code}</span> {item.label}
                  </span>
                  <span className="relative block h-6 rounded bg-muted">
                    <span
                      className={`absolute inset-y-0 rounded ${NATURE_BAR[item.nature]}`}
                      style={{ left: `${left}%`, width: `${width}%` }}
                      role="img"
                      aria-label={`${item.code} : du ${fmt(item.startsOn)} au ${fmt(item.dueOn)}, ${STAGE_LABELS_FR[item.stage]}`}
                    />
                    <span
                      aria-hidden
                      className="absolute top-0 h-6 w-0.5 bg-foreground"
                      style={{ left: `${Math.min(pct(item.dueOn), 99.5)}%` }}
                    />
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <details className="rounded-lg border border-border bg-card p-4">
        <summary className="cursor-pointer text-sm font-medium">
          Alternative textuelle du diagramme (périodes, jalons et dépendances)
        </summary>
        <ul className="mt-3 space-y-2 text-sm">
          {items.map((item) => {
            const deps = item.dependsOn
              .map((id) => items.find((i) => i.id === id)?.code ?? id)
              .join(", ");
            return (
              <li key={item.id}>
                <span className="font-mono text-xs">{item.code}</span> {item.label} — du{" "}
                {fmt(item.startsOn)} au {fmt(item.dueOn)} · {item.milestoneLabel} ·{" "}
                {STAGE_LABELS_FR[item.stage]}
                {item.officialDeadline ? (
                  <Badge variant="outline" className="ms-2">
                    Échéance officielle
                  </Badge>
                ) : null}
                {deps ? (
                  <span className="block text-xs text-muted-foreground">Prérequis : {deps}</span>
                ) : null}
              </li>
            );
          })}
        </ul>
      </details>
    </div>
  );
}

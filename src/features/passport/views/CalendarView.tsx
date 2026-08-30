import { Badge } from "@/components/ui/badge";
import type { PlanCalendarEvent } from "@/application/acquisitionPlan";

const KIND_LABELS: Record<PlanCalendarEvent["kind"], string> = {
  milestone: "Jalon",
  evidence: "Évaluation / preuve",
  validation: "Validation",
  placement: "Stage",
};

function monthKey(iso: string) {
  return iso.slice(0, 7);
}

function monthLabel(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}

/** Agenda mensuel léger : échéances, stages, évaluations, validations et jalons. */
export function CalendarView({ events }: { events: readonly PlanCalendarEvent[] }) {
  if (events.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Aucune échéance ne correspond aux filtres sélectionnés.
      </p>
    );
  }

  const months = [...new Set(events.map((e) => monthKey(e.date)))];

  return (
    <div className="space-y-6">
      {months.map((month) => {
        const monthEvents = events.filter((e) => monthKey(e.date) === month);
        const headingId = `agenda-${month}`;
        return (
          <section key={month} aria-labelledby={headingId}>
            <h3 id={headingId} className="mb-2 text-sm font-semibold capitalize">
              {monthLabel(`${month}-01T00:00:00Z`)}
            </h3>
            <ul className="divide-y divide-border rounded-lg border border-border bg-card">
              {monthEvents.map((event) => (
                <li key={event.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <span className="w-16 shrink-0 text-sm font-medium tabular-nums">
                    {new Date(event.date).toLocaleDateString("fr-FR", {
                      day: "2-digit",
                      month: "2-digit",
                    })}
                  </span>
                  <span className="text-sm">{event.label}</span>
                  <Badge variant="outline" className="ms-auto font-normal">
                    {KIND_LABELS[event.kind]}
                  </Badge>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

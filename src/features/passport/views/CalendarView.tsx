import { Badge } from "@/components/ui/badge";
import type { PlanCalendarEvent } from "@/application/acquisitionPlan";
import type { AcquisitionPlanItem } from "@/domain/acquisitionPlan";
import { OutcomeDeclarationSwitch } from "@/features/passport/OutcomeDeclarationSwitch";

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

/**
 * Agenda mensuel léger : échéances, stages, évaluations, validations et jalons.
 *
 * UNE LIGNE PAR JALON, PAS PAR ACQUIS (corrigé le 03/09). Le presenter poussait
 * un événement par acquis, étiqueté du libellé du jalon : les 29 jalons de la
 * promotion s'affichaient en 366 lignes, la même répétée jusqu'à douze fois. Le
 * regroupement se fait maintenant en amont ; ici on se contente de déplier ce que
 * le jalon porte, sur demande.
 */
export function CalendarView({
  events,
  items,
}: {
  events: readonly PlanCalendarEvent[];
  items: readonly AcquisitionPlanItem[];
}) {
  if (events.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Aucune échéance ne correspond aux filtres sélectionnés.
      </p>
    );
  }

  const parId = new Map(items.map((item) => [item.id, item] as const));
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
              {monthEvents.map((event) => {
                const portes = event.itemIds
                  .map((id) => parId.get(id))
                  .filter((item): item is AcquisitionPlanItem => Boolean(item));
                return (
                  <li key={event.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="w-16 shrink-0 text-sm font-medium tabular-nums">
                        {new Date(event.date).toLocaleDateString("fr-FR", {
                          day: "2-digit",
                          month: "2-digit",
                        })}
                      </span>
                      <span className="text-sm font-medium">{event.label}</span>
                      {portes.length > 0 ? (
                        <Badge variant="secondary" className="font-normal">
                          {portes.length} acquis
                        </Badge>
                      ) : null}
                      <Badge variant="outline" className="ms-auto font-normal">
                        {KIND_LABELS[event.kind]}
                      </Badge>
                    </div>
                    {portes.length > 0 ? (
                      <details className="mt-2 ps-16">
                        <summary className="cursor-pointer text-xs text-muted-foreground">
                          Voir les acquis de ce jalon
                        </summary>
                        {/*
                          « C'est dans cette section que l'apprenant doit
                          pouvoir cliquer pour valider chaque acquis » (Stef,
                          03/09). Le meme interrupteur que dans « Mes ressources »
                          et « Mes competences » : un seul geste, une seule
                          ecriture, quel que soit l'ecran d'ou on le fait.
                        */}
                        <ul className="mt-2 space-y-2">
                          {portes.map((item) => (
                            <li key={item.id} className="flex items-start gap-3 text-sm">
                              <OutcomeDeclarationSwitch
                                outcomeId={item.id}
                                label={item.label}
                                nature={item.nature}
                                targetMastery={item.targetMastery}
                                {...(item.declaredLevel === undefined
                                  ? {}
                                  : { declaredLevel: item.declaredLevel })}
                              />
                              <span className="min-w-0 flex-1">
                                <span className="font-mono text-xs">{item.code}</span> {item.label}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </details>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

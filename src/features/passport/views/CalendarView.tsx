import { EYEBROW, MilestoneHeading, TABULAIRE } from "@/components/milestone-heading";
import type { PlanCalendarEvent } from "@/application/acquisitionPlan";
import type { AcquisitionPlanItem } from "@/domain/acquisitionPlan";
import { PlanOutcomeRow } from "@/features/passport/PlanOutcomeRow";

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
  couleurDe,
}: {
  events: readonly PlanCalendarEvent[];
  items: readonly AcquisitionPlanItem[];
  /** Fourni par le Passeport, pour que les quatre vues colorent a l'identique. */
  couleurDe: (themeId: string | undefined) => string;
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
            <h3
              id={headingId}
              className="mb-2 font-display text-[15px] font-medium capitalize tracking-[-0.01em]"
            >
              {monthLabel(`${month}-01T00:00:00Z`)}
            </h3>
            <ul className="divide-y divide-border overflow-hidden rounded-xl border bg-card shadow-[var(--shadow-card)]">
              {monthEvents.map((event) => {
                const portes = event.itemIds
                  .map((id) => parId.get(id))
                  .filter((item): item is AcquisitionPlanItem => Boolean(item));
                /*
                 * LA COULEUR DU JALON EST CELLE DE SON DOMAINE DOMINANT, comme
                 * partout ailleurs. Un jalon de connaissances n'a pas de
                 * domaine : `couleurDe(undefined)` le rend en marine.
                 */
                const comptes = new Map<string, number>();
                for (const item of portes) {
                  if (item.themeId === undefined) continue;
                  comptes.set(item.themeId, (comptes.get(item.themeId) ?? 0) + 1);
                }
                const dominant = [...comptes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
                const acquis = portes.filter((item) => item.stage === "acquired").length;
                const aValider = portes.filter((item) => item.stage === "to_validate").length;
                const jour = new Date(event.date).toLocaleDateString("fr-FR", {
                  day: "2-digit",
                  month: "2-digit",
                });
                const mention = (
                  <span
                    className={`${EYEBROW} shrink-0 self-center text-muted-foreground`}
                    style={TABULAIRE}
                  >
                    {event.kind === "milestone" ? jour : `${jour} · ${KIND_LABELS[event.kind]}`}
                  </span>
                );
                /*
                 * UN EVENEMENT SANS ACQUIS N'A PAS DE TUILE : un « 0 » dans un
                 * aplat de couleur annoncerait un volume qui n'existe pas.
                 */
                if (portes.length === 0) {
                  return (
                    <li key={event.id} className="flex items-center gap-3 px-4 py-3">
                      <span className="min-w-0 flex-1 font-display text-[16.5px] leading-tight tracking-[-0.01em]">
                        {event.label}
                      </span>
                      {mention}
                    </li>
                  );
                }
                return (
                  <li key={event.id} className="px-4 py-2.5">
                    <details className="group">
                      {/* `list-none` retire le triangle natif : l'en-tete du
                        jalon est deja l'affordance, et le chevron du navigateur
                        cassait l'alignement de la tuile. */}
                      <summary className="flex cursor-pointer list-none items-stretch [&::-webkit-details-marker]:hidden">
                        <MilestoneHeading
                          count={portes.length}
                          color={couleurDe(dominant)}
                          label={event.label}
                          done={acquis}
                          pending={aValider}
                          total={portes.length}
                          trailing={mention}
                        />
                      </summary>
                      {/*
                          « C'est dans cette section que l'apprenant doit
                          pouvoir cliquer pour valider chaque acquis » (Stef,
                          03/09). Le meme interrupteur que dans « Mes ressources »
                          et « Mes competences » : un seul geste, une seule
                          ecriture, quel que soit l'ecran d'ou on le fait.
                        */}
                      <ul className="mt-2 ps-14">
                        {portes.map((item) => (
                          <PlanOutcomeRow key={item.id} item={item} />
                        ))}
                      </ul>
                    </details>
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

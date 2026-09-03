import { SectionHeading } from "@/components/section-heading";
import type { AcquisitionPlanPresentation } from "@/application/acquisitionPlan";
import { CalendarView } from "@/features/passport/views/CalendarView";

/**
 * La CHRONOLOGIE DE L'ONGLET, sous sa liste.
 *
 * Stef, 03/09 : « initialement, sous la liste il y avait le calendrier. C'était
 * une bonne idée. À remettre dans chaque onglet. » Le bloc d'origine avait été
 * retiré le matin même, pour tenir l'objectif 1 — toute la chronologie dans le
 * Passeport. La doctrine s'affine donc, et c'est cohérent : **le Passeport porte
 * la chronologie COMPLÈTE ; chaque onglet en porte l'extrait qui le concerne.**
 * Un étudiant qui révise ses connaissances veut voir quand elles tombent, sans
 * changer d'écran ni trier les compétences au passage.
 *
 * C'EST LE MÊME COMPOSANT QUE DANS LE PASSEPORT, pas une deuxième
 * implémentation : mêmes regroupements par jalon, même repli sur les acquis,
 * même interrupteur de déclaration. Le filtre est la seule différence, et il
 * porte sur la NATURE — exactement l'axe qui sépare les deux onglets.
 */
export function OutcomeScheduleSection({
  plan,
  garder,
  title,
  description,
}: {
  readonly plan: AcquisitionPlanPresentation;
  /** Vrai pour les natures que cet onglet porte. */
  readonly garder: (nature: AcquisitionPlanPresentation["items"][number]["nature"]) => boolean;
  readonly title: string;
  readonly description: string;
}) {
  const events = plan.events.filter((event) => event.natures.some(garder));
  const items = plan.items.filter((item) => garder(item.nature));

  if (events.length === 0) return null;

  return (
    <section className="space-y-3">
      <SectionHeading title={title} level={2} description={description} />
      <CalendarView events={events} items={items} />
    </section>
  );
}

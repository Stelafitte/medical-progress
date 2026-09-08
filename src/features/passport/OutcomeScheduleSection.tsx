import { ChevronDown } from "lucide-react";
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
  couleurDe,
  collapsible = false,
}: {
  readonly plan: AcquisitionPlanPresentation;
  /** Vrai pour les natures que cet onglet porte. */
  readonly garder: (nature: AcquisitionPlanPresentation["items"][number]["nature"]) => boolean;
  readonly title: string;
  readonly description: string;
  /**
   * La couleur d'un jalon, resolue par l'onglet appelant. Elle ne se recalcule
   * pas ici : deux appels a `buildDomainColors` sur des ensembles differents
   * donneraient deux couleurs pour le meme domaine — le defaut corrige le
   * 08/09 sur la vue d'ensemble.
   */
  readonly couleurDe: (themeId: string | undefined) => string;
  /**
   * Replie par defaut. Cette chronologie REPETE ce que l'apprenant a deja vu
   * sur `/espace` et dans le Passeport ; sur les onglets ou elle n'est qu'un
   * rappel, elle ne doit pas occuper la moitie de l'ecran. Defaut `false` :
   * les ecrans qui l'affichaient deplie ne changent pas.
   */
  readonly collapsible?: boolean;
}) {
  const events = plan.events.filter((event) => event.natures.some(garder));
  const items = plan.items.filter((item) => garder(item.nature));

  if (events.length === 0) return null;

  if (collapsible) {
    return (
      <details className="group rounded-xl border bg-card shadow-[var(--shadow-card)]">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span className="font-display text-[19px] font-medium tracking-[-0.015em]">{title}</span>
          <ChevronDown
            className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
            aria-hidden
          />
        </summary>
        <div className="px-4 pb-4">
          <CalendarView events={events} items={items} couleurDe={couleurDe} />
        </div>
      </details>
    );
  }

  return (
    <section className="space-y-3">
      <SectionHeading title={title} level={2} description={description} />
      <CalendarView events={events} items={items} couleurDe={couleurDe} />
    </section>
  );
}

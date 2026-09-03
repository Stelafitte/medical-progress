import type { ReactNode } from "react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import type { MasteryLevel, Outcome } from "@/domain/types";
import { OutcomeDeclarationSwitch } from "@/features/passport/OutcomeDeclarationSwitch";

/**
 * LA LIGNE D'UN ACQUIS, identique dans « Mes ressources » et « Mes compétences ».
 *
 * Stef a validé cette mise en page sur les connaissances le 03/09 et demandé la
 * même sur les compétences. La partager plutôt que la recopier n'est pas une
 * coquetterie : c'est la règle du dépôt — une entité, deux portes d'entrée, la
 * même projection. Deux copies auraient divergé au premier ajustement.
 *
 * TROIS ÉLÉMENTS, TOUJOURS DANS CET ORDRE : l'interrupteur de déclaration à
 * gauche, hors du bouton d'accordéon ; l'intitulé, qui EST le bouton — on appuie
 * dessus et le contenu s'ouvre ; le contenu, chargé seulement à l'ouverture.
 *
 * L'interrupteur est en dehors du bouton parce qu'un contrôle imbriqué dans un
 * bouton n'est pas activable au clavier, et parce qu'on doit pouvoir cocher une
 * ligne sans déplier ce qu'elle contient.
 */
export function OutcomeRow({
  outcome,
  declaredLevel,
  badges,
  children,
}: {
  readonly outcome: Outcome;
  readonly declaredLevel?: MasteryLevel;
  /** Étiquettes affichées à la suite de l'intitulé, sur la ligne fermée. */
  readonly badges?: ReactNode;
  /** Ce que l'ouverture révèle : contenus, échéances, journal. */
  readonly children: ReactNode;
}) {
  return (
    <li className="border-b border-border last:border-0">
      <div className="flex items-start gap-3 py-1">
        <div className="flex shrink-0 items-center pt-3">
          <OutcomeDeclarationSwitch
            outcomeId={outcome.id}
            label={outcome.label}
            nature={outcome.nature}
            targetMastery={outcome.targetMastery}
            {...(declaredLevel === undefined ? {} : { declaredLevel })}
          />
        </div>
        <Accordion type="single" collapsible className="min-w-0 flex-1">
          <AccordionItem value="contenu" className="border-b-0">
            <AccordionTrigger className="py-2 text-left">
              <span className="min-w-0 flex-1 pr-2 text-sm">
                <span className="font-mono text-xs">{outcome.code}</span> {outcome.label}
                {badges}
              </span>
            </AccordionTrigger>
            <AccordionContent>{children}</AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </li>
  );
}

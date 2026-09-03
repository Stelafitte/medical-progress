import { useId } from "react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { MASTERY_LABELS_FR } from "@/domain/mastery";
import type { Outcome } from "@/domain/types";
import { useDeclareOutcome } from "@/features/passport/useDeclareOutcome";
import { ResourceTextPanel } from "@/features/resources/ResourceTextPanel";
import type { LearningResourceId } from "@/domain/types";

export interface CoveringSupport {
  readonly id: LearningResourceId;
  readonly title: string;
}

/**
 * UNE connaissance du programme : ce qu'il faut savoir, de quoi l'apprendre, et
 * la déclaration de l'apprenant. Les trois objectifs du passeport tiennent sur
 * cette ligne.
 *
 * ON APPUIE SUR L'INTITULÉ ET LE CONTENU S'OUVRE. C'est la forme demandée le
 * 03/09. Le texte du support n'est chargé qu'à ce moment-là : les 22 chapitres
 * pèsent 1,16 M caractères, on ne les fait jamais payer d'avance.
 *
 * UN SEUL CONTRÔLE POUR LES DEUX GESTES. Stef a demandé « validation par
 * sliding sur le tel ou case à cocher sur ordi ». Un interrupteur EST les deux :
 * il se glisse au doigt, il se coche au clic, et il n'a qu'un seul état à
 * lire. Deux contrôles distincts auraient fini par diverger.
 *
 * IL EST HORS DU BOUTON D'ACCORDÉON, pas dedans : un contrôle imbriqué dans un
 * bouton n'est pas activable au clavier, et déplier son contenu chaque fois
 * qu'on veut cocher une ligne rendrait la saisie au doigt pénible.
 */
export function KnowledgeRow({
  outcome,
  supports,
  declaredLevel,
}: {
  readonly outcome: Outcome;
  readonly supports: readonly CoveringSupport[];
  readonly declaredLevel?: string;
}) {
  const declare = useDeclareOutcome();
  const switchId = useId();
  const acquis = declaredLevel !== undefined && declaredLevel !== "not_started";

  return (
    <li className="border-b border-border last:border-0">
      <div className="flex items-start gap-3 py-1">
        <div className="flex shrink-0 items-center gap-2 pt-3">
          <Switch
            id={switchId}
            checked={acquis}
            disabled={declare.isPending}
            onCheckedChange={(coche) =>
              declare.mutate({
                outcomeId: outcome.id,
                level: coche ? outcome.targetMastery : "not_started",
              })
            }
            aria-label={`Marquer « ${outcome.label} » comme acquise`}
          />
        </div>
        <Accordion type="single" collapsible className="min-w-0 flex-1">
          <AccordionItem value="contenu" className="border-b-0">
            <AccordionTrigger className="py-2 text-left">
              <span className="min-w-0 flex-1 pr-2 text-sm">
                <span className="font-mono text-xs">{outcome.code}</span> {outcome.label}
                {outcome.knowledgeRank ? (
                  <Badge variant="outline" className="ml-2 font-normal">
                    rang {outcome.knowledgeRank}
                  </Badge>
                ) : null}
                {acquis ? (
                  <Badge variant="secondary" className="ml-2 font-normal">
                    {MASTERY_LABELS_FR[outcome.targetMastery]} — déclaré
                  </Badge>
                ) : null}
              </span>
            </AccordionTrigger>
            <AccordionContent>
              {supports.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Aucun support ne traite encore cette connaissance.
                </p>
              ) : (
                <div className="space-y-4">
                  {supports.map((support) => (
                    <section key={support.id}>
                      <p className="mb-1 text-xs font-medium text-muted-foreground">
                        {support.title}
                      </p>
                      <ResourceTextPanel resourceId={support.id} />
                    </section>
                  ))}
                </div>
              )}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
      {declare.isError ? (
        <p role="alert" className="pb-2 ps-14 text-xs text-destructive">
          Déclaration non enregistrée :{" "}
          {declare.error instanceof Error ? declare.error.message : "erreur inconnue"}
        </p>
      ) : null}
    </li>
  );
}

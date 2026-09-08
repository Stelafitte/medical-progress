import { useId } from "react";

import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { MASTERY_LABELS_FR } from "@/domain/mastery";
import type { MasteryLevel, OutcomeId, OutcomeNature } from "@/domain/types";
import { useDeclareOutcome } from "@/features/passport/useDeclareOutcome";

/**
 * LE GESTE DE DÉCLARATION, en un seul endroit.
 *
 * Objectif 3 du passeport (Stef, 03/09) : « pouvoir cocher / enregistrer les
 * acquis au fur et à mesure, par déclaration libre de l'apprenant » — et,
 * précisé le soir même, « cette validation doit se reporter dans mon passeport
 * éducatif », le geste devant être disponible AUSSI depuis la chronologie.
 *
 * UN SEUL COMPOSANT POUR TOUS LES ÉCRANS. Le même contrôle sert dans « Mes
 * ressources », dans la Liste du Passeport et sous un jalon du Calendrier. Trois
 * copies auraient fini par déclarer trois niveaux différents pour le même geste.
 *
 * UN INTERRUPTEUR EST À LA FOIS LA CASE ET LE GLISSEMENT demandés : il se coche
 * au clic et se glisse au doigt, et il n'a qu'un état à lire.
 *
 * COCHER DÉCLARE LE NIVEAU CIBLE DE L'ACQUIS, pas un niveau maximal : c'est ce
 * que le Concepteur attend de l'étudiant sur cet acquis-là. Décocher déclare
 * `not_started` plutôt que d'effacer la ligne — la base garde ainsi la trace
 * que l'étudiant s'est prononcé, et `unique (enrollment_id, outcome_id)` fait
 * de la déclaration une valeur révisable, jamais un historique qui s'accumule.
 *
 * SUR UNE COMPÉTENCE RÉELLE, on prévient au lieu d'interdire. La déclaration
 * est enregistrée mais ne fait pas monter le niveau tant qu'un encadrant n'a
 * pas contresigné (invariant du socle, tenu dans `computeOutcomeProgress` et en
 * base). Griser l'interrupteur priverait l'étudiant du seul moyen de signaler
 * qu'il s'estime prêt.
 */
export function OutcomeDeclarationSwitch({
  outcomeId,
  code,
  label,
  nature,
  targetMastery,
  declaredLevel,
  showBadge = true,
}: {
  readonly outcomeId: OutcomeId;
  /** Le code lu a l'ecran (« ECN-231-01 »), repris dans la confirmation. */
  readonly code?: string;
  readonly label: string;
  readonly nature: OutcomeNature;
  readonly targetMastery: MasteryLevel;
  readonly declaredLevel?: MasteryLevel;
  /**
   * FAUX quand l'écran affiche lui-même l'état de déclaration ailleurs dans sa
   * grille. La pastille était INSÉRÉE DANS LE FLUX, à droite de l'interrupteur :
   * une ligne déclarée poussait donc son énoncé plus loin que les autres, et
   * rien ne s'alignait sur une même verticale. Un écran qui réserve la place de
   * l'indicateur ailleurs met ceci à faux.
   */
  readonly showBadge?: boolean;
}) {
  const declare = useDeclareOutcome();
  const switchId = useId();
  const declare_ = declaredLevel !== undefined && declaredLevel !== "not_started";

  return (
    <span className="inline-flex items-center gap-2">
      <Switch
        id={switchId}
        checked={declare_}
        disabled={declare.isPending}
        onCheckedChange={(coche) =>
          declare.mutate({
            outcomeId,
            level: coche ? targetMastery : "not_started",
            nature,
            ...(code === undefined ? {} : { code }),
          })
        }
        aria-label={`Déclarer « ${label} » acquis au niveau ${MASTERY_LABELS_FR[targetMastery]}`}
      />
      {/*
        LA PASTILLE EST COMPACTE (07/09). « Intermédiaire — déclaré · à faire
        valider » etalait la colonne de gauche sur la moitie de la carte et
        ecrasait l'intitule. Le detail reste lu par les lecteurs d'ecran et au
        survol ; l'ecran, lui, n'a besoin que du fait.
      */}
      {declare_ && showBadge ? (
        <Badge
          variant="secondary"
          className="shrink-0 font-normal"
          title={`${MASTERY_LABELS_FR[targetMastery]} — déclaré${
            nature === "real_competence" ? " · à faire valider" : ""
          }`}
        >
          Déclaré
          <span className="sr-only">
            {" "}
            au niveau {MASTERY_LABELS_FR[targetMastery]}
            {nature === "real_competence" ? ", à faire valider par un encadrant" : ""}
          </span>
        </Badge>
      ) : null}
      {declare.isError ? (
        <span role="alert" className="text-xs text-destructive">
          Non enregistré
        </span>
      ) : null}
    </span>
  );
}

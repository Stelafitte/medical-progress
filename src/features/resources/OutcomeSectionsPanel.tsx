import { useQuery } from "@tanstack/react-query";

import { useDataAccess } from "@/application/session";
import { Skeleton } from "@/components/ui/skeleton";
import { CourseSectionsText } from "@/features/resources/CourseSectionsText";
import { sectionsPropres } from "@/domain/courseSections";
import type { OutcomeId } from "@/domain/types";

/**
 * LE TEXTE DU COURS QUI TRAITE DE CETTE CONNAISSANCE — affiche directement,
 * sans bouton (demande de Stef, 09/09).
 *
 * POURQUOI C'EST POSSIBLE MAINTENANT, ET NE L'ETAIT PAS LE 07/09. A l'epoque,
 * RIEN dans le schema n'etait rattache a un acquis : ni le texte, ni les
 * figures. Tout pendait au SUPPORT, et proposer le texte sous chaque savoir
 * revenait a offrir quinze fois le meme chapitre integral dans une meme liste.
 * Le decoupage 2026 a change cela : `read_outcome_sections` rend les sections
 * qui traitent de CET acquis, par rattachement arbitre ou par rubrique CNEC.
 *
 * MESURE DU 09/09 sur les 331 savoirs de DFASM-CARDIO : 269 ont un texte propre
 * (median 8 442 caracteres, soit trois pages), 58 n'en ont pas et retombent sur
 * le chapitre entier, 4 n'ont aucune section.
 *
 * LE REPLI CHAPITRE NE S'AFFICHE PAS ICI, et c'est `sectionsPropres` qui le
 * decide — une regle de domaine, pas un choix de mise en page. Ces 58 savoirs
 * ont un texte median de 31 903 caracteres et jusqu'a 123 512 : les derouler
 * sous la ligne remettrait dix a quarante pages sous un sous-item, et le MEME
 * texte que le bouton « Lire le texte integral » situe quelques centimetres
 * plus haut, repete autant de fois que le chapitre compte de savoirs.
 *
 * ON DIT QUAND IL N'Y A PAS DE TEXTE PROPRE, et c'est une correction du 09/09.
 * J'avais d'abord choisi de ne RIEN afficher, en jugeant qu'une phrase sous 62
 * lignes sur 331 serait du bruit. Stef a vu le resultat a l'ecran : « des
 * manques dans les sous-items jusqu'a une absence totale, par exemple sur le
 * 223 ». Il avait raison — l'ecran semblait marcher par endroits et se vider
 * ailleurs, sans que rien n'explique pourquoi.
 *
 * UN VIDE CREDIBLE EST PIRE QU'UNE PHRASE. C'est la lecon deja ecrite le 04/09
 * a propos du mock : le mode de panne n'est pas la fausse donnee, c'est le vide
 * qui ressemble a une reponse. La ligne ne duplique rien — elle dit ou est le
 * texte, qui se trouve quelques centimetres plus haut sur la meme page.
 */
export function OutcomeSectionsPanel({ outcomeId }: { readonly outcomeId: OutcomeId }) {
  const data = useDataAccess();
  const { data: texte, isPending } = useQuery({
    queryKey: ["outcome-sections", outcomeId],
    queryFn: () => data.resources.readOutcomeSections(outcomeId),
  });

  if (isPending) return <Skeleton className="h-16 w-full" />;
  if (!texte) return null;

  const sections = sectionsPropres(texte);
  if (sections.length === 0) {
    /*
     * DEUX CAS, UNE SEULE PHRASE. Le repli chapitre (58 savoirs) et l'absence
     * totale de section (4 savoirs, les modules de stage) se disent pareil pour
     * l'etudiant : ce qu'il cherche est dans le texte integral. Distinguer les
     * deux serait exact et inutile — la difference regarde le referentiel, pas
     * celui qui revise.
     */
    return (
      <p className="text-muted-foreground text-xs">
        Ce point est traité dans le texte intégral du chapitre.
      </p>
    );
  }

  return (
    <div className="border-primary/30 space-y-2 border-s-2 ps-3">
      <p className="text-muted-foreground text-xs">
        {texte.origin === "manuel"
          ? "Passage du cours retenu pour cette connaissance."
          : "Passage du cours correspondant à la rubrique de cette connaissance."}
      </p>
      <CourseSectionsText sections={sections} compact />
    </div>
  );
}

import { RankBadge } from "@/components/rank-badge";
import type { LearningResourceId, MasteryLevel, Outcome } from "@/domain/types";
import { AiCompanionInline } from "@/features/ai/AiCompanionInline";
import { OutcomeRow } from "@/features/passport/OutcomeRow";

export interface CoveringSupport {
  readonly id: LearningResourceId;
  readonly title: string;
  readonly format: string;
}

export interface CoveringDeck {
  readonly mediaId: string;
  readonly title: string;
  readonly slideCount: number;
}

/**
 * UNE connaissance du programme : de quoi la travailler, et la declaration de
 * l'apprenant.
 *
 * IL N'Y A PLUS QUE L'ASSISTANT ICI, et c'est une consequence de la donnee, pas
 * un choix d'ecran. RIEN, dans le schema, n'est rattache a un acquis : ni le
 * texte (`learning_resource_texts.resource_id`), ni les figures, ni les videos.
 * Tout pend au SUPPORT. Afficher le texte sous chaque savoir revenait donc a
 * proposer QUINZE FOIS le meme chapitre integral dans une meme liste — et
 * autant de fois les memes figures avant qu'elles ne remontent au chapitre.
 *
 * LE TEXTE ET LES MEDIAS SONT DONC AU NIVEAU DU CHAPITRE. C'est ce que fait le
 * livre imprime : un chapitre, un texte, et des connaissances qui le decoupent
 * intellectuellement sans le decouper materiellement.
 *
 * CE QUI RENDRAIT LE TEXTE A L'ACQUIS, ET QUI N'EST PAS FAIT ICI : le texte des
 * chapitres EST structure — sections en chiffres romains, sous-sections A/B,
 * et 1 017 marqueurs `[Rang A|B|C]` poses apres les titres. Le decoupage par
 * section, puis la liaison section <-> acquis par RUBRIQUE (Definition,
 * Epidemiologie, Diagnostic positif...), est un chantier de DONNEES tenu par la
 * session « referentiel ». On ne construit pas ici un second decoupage
 * concurrent : deux correspondances pour la meme chose seraient pires
 * qu'aucune.
 *
 * CE QU'ON N'A PAS FAIT NON PLUS, ET DELIBEREMENT : classer les segments par
 * proximite lexicale avec l'enonce. Mesure du 07/09 sur le cas le plus facile
 * (196 legendes de figures, chapitre par chapitre) : SIX SUR NEUF sans aucun
 * recouvrement lexical, et le seul score confiant etait faux. La cause est
 * structurelle — l'enonce decrit ce qu'il faut SAVOIR, le texte decrit le
 * SUJET. Sur des segments de 4 000 caracteres ce serait pire : il y a toujours
 * assez de vocabulaire pour matcher n'importe quel enonce du chapitre, avec un
 * score plausible et une erreur invisible en relecture.
 */
export function KnowledgeRow({
  outcome,
  supports,
  declaredLevel,
  spotlight = false,
  open,
  onOpenChange,
}: {
  readonly outcome: Outcome;
  readonly supports: readonly CoveringSupport[];
  readonly declaredLevel?: MasteryLevel;
  /** Arrivée d'un lien profond : la ligne s'ouvre et l'écran défile jusqu'à elle. */
  readonly spotlight?: boolean;
  /** Pilotage externe : un seul acquis ouvert à la fois dans la liste. */
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
}) {
  return (
    <OutcomeRow
      outcome={outcome}
      spotlight={spotlight}
      {...(open === undefined ? {} : { open })}
      {...(onOpenChange === undefined ? {} : { onOpenChange })}
      {...(declaredLevel === undefined ? {} : { declaredLevel })}
      supportCount={supports.length}
      supportKind="text"
      badges={
        outcome.knowledgeRank ? <RankBadge rank={outcome.knowledgeRank} className="ms-2" /> : null
      }
    >
      {supports.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Aucun support ne traite encore cette connaissance — l'assistant n'aurait rien à lire.
        </p>
      ) : (
        <AiCompanionInline
          sujet={`${outcome.code} — ${outcome.label}`}
          scope="knowledge"
          outcomeId={outcome.id}
        />
      )}
    </OutcomeRow>
  );
}

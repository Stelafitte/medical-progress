import { RankBadge } from "@/components/rank-badge";
import type { LearningResourceId, MasteryLevel, Outcome } from "@/domain/types";
import { AiCompanionInline } from "@/features/ai/AiCompanionInline";
import { OutcomeRow } from "@/features/passport/OutcomeRow";
import { OutcomeSectionsPanel } from "@/features/resources/OutcomeSectionsPanel";
import { useProgramAiEnabled } from "@/features/resources/useProgramAiEnabled";

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
 * DEUX CHOSES SOUS LA LIGNE DEPLIEE, dans cet ordre (Stef, 09/09) :
 * l'assistant quand il est ouvert, puis LE TEXTE DU COURS qui traite de cette
 * connaissance, affiche directement, sans bouton.
 *
 * CE QUI A CHANGE DEPUIS LE 07/09, ET QUI RENDAIT CE TEXTE IMPOSSIBLE. A
 * l'epoque, RIEN dans le schema n'etait rattache a un acquis : ni le texte
 * (`learning_resource_texts.resource_id`), ni les figures, ni les videos — tout
 * pendait au SUPPORT. Afficher le texte sous chaque savoir revenait donc a
 * proposer QUINZE FOIS le meme chapitre integral dans une meme liste. Le
 * decoupage 2026 (`course_sections`) et les rattachements par rubrique ou
 * arbitrage (`outcome_sections`) ont leve cet obstacle : 269 savoirs sur 331
 * ont desormais un texte PROPRE, de trois pages en median.
 *
 * LE RESTE DE L'ANCIENNE NOTE TIENT TOUJOURS, et il faut le garder en tete :
 * les figures et les videos, elles, pendent encore au chapitre, et le
 * rattachement par proximite lexicale reste INTERDIT — mesure du 07/09 sur le
 * cas le plus facile (196 legendes) : six sur neuf sans aucun recouvrement, et
 * le seul score confiant etait faux. Les legendes decrivent ce que l'image
 * MONTRE, les connaissances ce qu'il faut SAVOIR.
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
  const aiOuverte = useProgramAiEnabled();
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
        <p className="text-muted-foreground text-sm">
          Aucun support ne traite encore cette connaissance.
        </p>
      ) : (
        <div className="space-y-3">
          {/*
            L'ASSISTANT DISPARAIT ENTIEREMENT quand l'IA est fermee sur le
            programme (decision de Stef, 09/09) : on masque, on ne grise pas.
            LE TEXTE, LUI, RESTE — c'est le cours, il ne depend d'aucun reglage.
          */}
          {aiOuverte ? (
            <AiCompanionInline
              sujet={`${outcome.code} — ${outcome.label}`}
              scope="knowledge"
              outcomeId={outcome.id}
            />
          ) : null}
          <OutcomeSectionsPanel outcomeId={outcome.id} />
        </div>
      )}
    </OutcomeRow>
  );
}

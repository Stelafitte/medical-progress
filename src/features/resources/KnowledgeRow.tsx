import { ExternalLink } from "lucide-react";
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
  /** Présent quand le support n'est qu'un lien externe (18/09). */
  readonly externalUrl?: string | undefined;
}

/**
 * UN SUPPORT QUI N'EST QU'UN LIEN s'ouvre dans un nouvel onglet (18/09). Avant,
 * il était compté parmi les supports textuels et renvoyait au texte du
 * chapitre : l'étudiant ne pouvait pas l'ouvrir.
 */
export function ExternalLinkSupport({ support }: { support: CoveringSupport }) {
  if (!support.externalUrl) return null;
  return (
    <a
      href={support.externalUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="flex min-h-11 items-center gap-2 rounded-lg border bg-card px-3 py-2.5 text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ExternalLink className="size-4 shrink-0 text-primary" aria-hidden />
      <span className="min-w-0 flex-1">{support.title}</span>
      <span className="shrink-0 text-xs text-muted-foreground">Ouvrir le lien</span>
    </a>
  );
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
          {supports.map((support) => (
            <ExternalLinkSupport key={support.id} support={support} />
          ))}
        </div>
      )}
    </OutcomeRow>
  );
}

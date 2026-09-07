import type { KnowledgeRank } from "@/domain/types";

/**
 * LE RANG D'UNE CONNAISSANCE — A, B ou C.
 *
 * IL N'EST NI UN DOMAINE NI UN STATUT, donc il n'a droit a AUCUNE teinte.
 * C'est la regle du systeme : la couleur ne dit qu'une chose dans toute
 * l'application, le domaine de competence. Un rang qui prendrait du vert ou de
 * l'orange ferait mentir tous les autres ecrans. On distingue donc les trois
 * rangs par le POIDS et la FORME — aplat marine, contour marine, contour
 * discret — jamais par la teinte.
 *
 * LE RANG C EST NOUVEAU dans les tables de hierarchisation 2026. Le type et
 * l'enum en base l'acceptaient deja (`outcome_knowledge_rank`), mais AUCUN
 * ecran ne distinguait les rangs : ils s'affichaient tous en « rang X » sur le
 * meme contour gris, et aucun filtre n'existait. Ce n'est donc pas le rang C
 * qui manquait, c'est le rang tout court qui n'etait jamais rendu.
 *
 * LE LIBELLE EST EXPLICITE POUR LES LECTEURS D'ECRAN : « rang A » seul ne dit
 * rien de ce que le rang signifie.
 */
const LIBELLE: Record<KnowledgeRank, string> = {
  A: "Rang A — socle, exigible de tout étudiant",
  B: "Rang B — attendu en fin de deuxième cycle",
  C: "Rang C — approfondissement",
};

const STYLE: Record<KnowledgeRank, string> = {
  A: "bg-field text-field-ink border-transparent",
  B: "border-current text-foreground",
  C: "border-current text-muted-foreground",
};

export function RankBadge({ rank, className = "" }: { rank: KnowledgeRank; className?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded border px-1.5 py-px align-middle text-[10.5px] font-semibold uppercase tracking-wide ${STYLE[rank]} ${className}`}
      title={LIBELLE[rank]}
    >
      Rang {rank}
      <span className="sr-only"> — {LIBELLE[rank]}</span>
    </span>
  );
}

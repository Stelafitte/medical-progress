import type { CSSProperties, ReactNode } from "react";

/**
 * L'ANATOMIE D'UNE LIGNE DE JALON, ECRITE UNE SEULE FOIS.
 *
 * POURQUOI CE FICHIER EXISTE. Le meme objet — un jalon, ce qu'il porte, ou il
 * en est — se lit sur cinq ecrans : la vue d'ensemble, la carte de synthese du
 * Passeport, son Calendrier, son Gantt, son Kanban. Recopie cinq fois, il
 * divergeait des la premiere retouche : le 08/09, le Passeport avait recu le
 * bon cadre et gardait des pastilles `Badge` a l'interieur, si bien que le haut
 * de la page et le bas ne se ressemblaient plus.
 *
 * CE QU'ELLE PORTE, ET RIEN D'AUTRE :
 * - UNE TUILE DE COULEUR qui porte le compte. La teinte ne dit qu'une chose
 *   dans toute l'application : le DOMAINE DE COMPETENCE. Un jalon de
 *   connaissances n'en est pas un, il reste en marine (`FOND_CONNAISSANCE`).
 * - L'INTITULE EN SERIF, a la taille des titres de carte.
 * - UNE PISTE DE 3 PX A DEUX SEGMENTS : l'acquis en plein, le declare-en-attente
 *   en demi-teinte. L'etudiant voit son geste sans qu'on lui fasse croire qu'il
 *   est valide — l'invariant du socle tient, la reconnaissance aussi.
 * - UN EMPLACEMENT LIBRE A DROITE (`trailing`) : une date, une mention.
 *
 * ELLE NE REND QUE DES `span`. C'est deliberé : elle doit tenir aussi bien dans
 * un `<li>` que dans un `<summary>` ou dans un `AccordionTrigger`, qui
 * n'acceptent pas n'importe quel contenu.
 *
 * DETTE CONNUE : `DashboardView` porte encore sa propre copie de ce balisage,
 * d'ou ce fichier est extrait a l'identique. Elle doit converger ici.
 */
export const EYEBROW = "text-[11.5px] font-semibold uppercase tracking-[0.14em]";
export const TABULAIRE = { fontVariantNumeric: "tabular-nums" } as const;

/** Le fond d'un jalon qui ne porte aucun domaine de competence. */
export const FOND_CONNAISSANCE = "var(--field)";

export function MilestoneHeading({
  count,
  unit = "ACQUIS",
  color,
  label,
  done = 0,
  pending = 0,
  total,
  trailing,
}: {
  /** Le chiffre de la tuile : ce qu'il reste a faire, ou ce que le jalon porte. */
  readonly count: number;
  readonly unit?: string;
  readonly color: string;
  readonly label: string;
  /** Acquis au niveau cible. */
  readonly done?: number;
  /** Declares, en attente de l'encadrant. */
  readonly pending?: number;
  /** Denominateur de la piste. Sans lui, aucune piste n'est dessinee. */
  readonly total?: number;
  readonly trailing?: ReactNode;
}) {
  return (
    <span
      className="flex min-w-0 flex-1 items-stretch gap-3 text-left"
      style={{ "--c": color } as CSSProperties}
    >
      <span
        className="grid w-11 shrink-0 place-items-center rounded-lg py-2 text-white"
        style={{ backgroundColor: "var(--c)" }}
      >
        <b className="text-[17px] font-bold leading-none" style={TABULAIRE}>
          {count}
        </b>
        <span className="mt-[3px] text-[9px] tracking-wider opacity-85">{unit}</span>
      </span>
      <span className="flex min-w-0 flex-1 flex-col justify-center gap-[5px]">
        <span className="font-display text-[16.5px] font-normal leading-tight tracking-[-0.01em]">
          {label}
        </span>
        {total !== undefined && total > 0 ? (
          <span className="flex h-[3px] overflow-hidden rounded-sm bg-card-sunk" aria-hidden>
            <span
              className="block h-full"
              style={{
                width: `${Math.max((done / total) * 100, done > 0 ? 3 : 0)}%`,
                backgroundColor: "var(--c)",
              }}
            />
            <span
              className="block h-full opacity-40"
              style={{
                width: `${(pending / total) * 100}%`,
                backgroundColor: "var(--c)",
              }}
            />
          </span>
        ) : null}
      </span>
      {trailing}
    </span>
  );
}

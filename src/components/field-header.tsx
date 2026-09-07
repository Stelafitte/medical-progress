import type { ReactNode } from "react";

/**
 * LE BANDEAU MARINE — l'ouverture commune aux huit onglets apprenants.
 *
 * C'est LA regle qui fait lire huit ecrans differents comme un seul produit :
 * chaque page s'ouvre sur ce meme bloc sombre, qui absorbe la barre
 * d'application et porte trois choses, jamais plus — l'identite de la page,
 * ses deux ou trois chiffres cles, et rien d'autre. En dessous, le fond bleu
 * pale et les cartes blanches reprennent.
 *
 * Cela ne coute ni image ni composant nouveau par page : seulement un contenu
 * different dans le meme bloc.
 *
 * LE DEBORD EST ESSENTIEL. `<main>` porte `px-4 py-8 sm:px-6` ; sans les
 * marges negatives le bandeau flotterait comme une carte de plus au lieu de
 * poser l'ecran. Elles doivent suivre le rembourrage de `app-shell.tsx` si
 * celui-ci change.
 *
 * LES CHIFFRES SONT DES FIGURES, pas des phrases : grande serif, chiffres
 * tabulaires, etiquette en petites capitales. Un nombre noye dans une phrase
 * ne se lit pas.
 */
export function FieldHeader({
  eyebrow,
  title,
  figures = [],
  children,
}: {
  /** Contexte au-dessus du titre : programme, promotion, chapitre… */
  eyebrow?: string;
  title: string;
  /** Deux ou trois chiffres cles. Au-dela, ce n'est plus un bandeau. */
  figures?: readonly { value: number | string; label: string }[];
  /** Contenu libre sous les chiffres (barre de semaines, onglets de vue…). */
  children?: ReactNode;
}) {
  return (
    <div className="-mx-4 -mt-8 mb-7 bg-field px-4 pb-6 pt-6 text-field-ink sm:-mx-6 sm:px-6">
      {eyebrow ? (
        <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-field-mute">
          {eyebrow}
        </p>
      ) : null}
      <h1 className="mt-1.5 font-display text-[32px] font-normal leading-[1.05] tracking-[-0.025em]">
        {title}
      </h1>
      {figures.length > 0 ? (
        <dl className="mt-5 flex flex-wrap gap-x-9 gap-y-4">
          {figures.map((figure) => (
            <div key={figure.label}>
              <dd
                className="font-display text-[30px] font-medium leading-none tracking-[-0.03em]"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {figure.value}
              </dd>
              <dt className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-field-mute">
                {figure.label}
              </dt>
            </div>
          ))}
        </dl>
      ) : null}
      {children}
    </div>
  );
}

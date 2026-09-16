import type { ReactNode } from "react";

/**
 * L'EN-TÊTE D'UN ÉCRAN PROFESSIONNEL.
 *
 * POURQUOI CE FICHIER A CHANGÉ (Stef, 16/09 : « le visuel des onglets Admin est
 * très lourd et peu digeste, les blocs ou pavés sont serrés, peu aérés, pas
 * colorés, très difficile dans sa lecture »).
 *
 * Le niveau 1 ouvrait la page par un `text-2xl font-semibold` posé sur le même
 * fond que tout le reste : rien ne distinguait le titre de l'écran du titre
 * d'une section, et la page commençait sans respiration. Il porte désormais le
 * BANDEAU MARINE des écrans apprenants (`FieldHeader`), c'est-à-dire la même
 * anatomie d'un bout à l'autre du produit : surtitre en petites capitales,
 * titre en serif, chiffres clés tabulaires. Le bandeau déborde la gouttière du
 * `<main>` (`-mx-4 -mt-8`, `sm:-mx-6`) : il suppose donc d'être le PREMIER
 * élément de l'écran — ce que fait chacun des écrans qui l'appellent.
 *
 * Le niveau 2 passe en serif 21 px, le même titre de section que la vue
 * apprenante : la hiérarchie se lit à la forme des lettres, pas seulement à
 * deux pixels de corps d'écart.
 *
 * La teinte, elle, ne dit toujours qu'une chose : le domaine de compétence.
 * Le marine n'est pas une teinte de domaine, c'est la structure de la page.
 */
export function SectionHeading({
  title,
  description,
  action,
  id,
  level = 2,
  eyebrow,
  figures = [],
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  id?: string;
  /** 1 pour le titre principal de la page, 2 pour une section. */
  level?: 1 | 2;
  /** Niveau 1 : contexte au-dessus du titre — programme, promotion, périmètre. */
  eyebrow?: string;
  /** Niveau 1 : deux à quatre chiffres clés. Au-delà, ce n'est plus un bandeau. */
  figures?: readonly { readonly value: number | string; readonly label: string }[];
}) {
  if (level === 1) {
    return (
      <div className="-mx-4 -mt-8 mb-1 bg-field px-4 pb-7 pt-7 text-field-ink sm:-mx-6 sm:px-6">
        {eyebrow ? (
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-field-mute">
            {eyebrow}
          </p>
        ) : null}
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <h1
            id={id}
            className="mt-1.5 max-w-3xl text-balance font-display text-[30px] font-normal leading-[1.08] tracking-[-0.025em] sm:text-[34px]"
          >
            {title}
          </h1>
          {action ? <div className="mt-2 shrink-0">{action}</div> : null}
        </div>
        {description ? (
          <p className="mt-3 max-w-2xl text-[13.5px] leading-relaxed text-field-mute">
            {description}
          </p>
        ) : null}
        {figures.length > 0 ? (
          <dl className="mt-6 flex flex-wrap gap-x-9 gap-y-4">
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
      </div>
    );
  }

  return (
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
      <div>
        <h2 id={id} className="font-display text-[21px] font-medium tracking-[-0.015em]">
          {title}
        </h2>
        {description ? (
          <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

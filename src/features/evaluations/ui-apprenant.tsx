/**
 * LE VOCABULAIRE VISUEL DES ÉCRANS APPRENANT, écrit une fois pour l'onglet
 * « Mes évaluations ».
 *
 * POURQUOI CE FICHIER EXISTE (Stef, 16/09 : « Mes évaluations doit être mis au
 * même format visuel que la vue d'ensemble et les autres onglets », vu sur
 * téléphone). Cet onglet, construit vite les 13 et 15/09, empruntait son
 * habillage au kit PROFESSIONNEL — `PanelCard`, `EmptyState`, `StatCard`,
 * `SectionHeading` — celui des écrans d'administration. Bords, titres, vides et
 * en-tête n'y ont pas la même anatomie que les huit onglets apprenants : sur un
 * écran étroit, la page ne ressemblait plus au reste du parcours.
 *
 * Ce que les huit autres onglets font, et que l'on reprend ici :
 *   - le bandeau marine `FieldHeader` en ouverture (posé par chaque écran) ;
 *   - un titre de section en serif, 21 px, au-dessus de la carte ;
 *   - une carte blanche `rounded-xl border bg-card shadow-[var(--shadow-card)]` ;
 *   - un vide qui se lit centré, en 13 px gris, jamais un encadré pointillé ;
 *   - des chiffres en grande serif tabulaire, étiquette en petites capitales.
 */
import type { ReactNode } from "react";

export function Panneau({
  title,
  description,
  action,
  children,
}: {
  readonly title: string;
  readonly description?: string;
  readonly action?: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-[21px] font-medium tracking-[-0.015em]">{title}</h2>
        {action}
      </div>
      {description ? (
        <p className="-mt-2 mb-3 text-[13px] leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : null}
      <div className="overflow-hidden rounded-xl border bg-card p-4 shadow-[var(--shadow-card)]">
        {children}
      </div>
    </section>
  );
}

/** Un vide se dit, il ne s'encadre pas. */
export function Vide({ children }: { readonly children: ReactNode }) {
  return <p className="px-1 py-5 text-center text-[13px] text-muted-foreground">{children}</p>;
}

/** Deux à quatre chiffres, à l'anatomie du bandeau marine. */
export function Chiffres({
  items,
}: {
  readonly items: readonly { readonly value: number | string; readonly label: string }[];
}) {
  return (
    <dl className="flex flex-wrap gap-x-9 gap-y-4">
      {items.map((item) => (
        <div key={item.label}>
          <dd
            className="font-display text-[30px] font-medium leading-none tracking-[-0.03em]"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {item.value}
          </dd>
          <dt className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {item.label}
          </dt>
        </div>
      ))}
    </dl>
  );
}

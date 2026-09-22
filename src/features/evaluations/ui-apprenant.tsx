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
import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/*
 * 22/09 (Stef : « des titres de bloc et des plier/déplier comme partout dans le
 * site, avec des couleurs »). Le panneau peut se replier, et porter une teinte :
 * un liseré à gauche et une pastille de compte, dans la même famille de couleurs
 * que les écrans professionnels.
 */
export type TeintePanneau = "sky" | "violet" | "amber" | "emerald" | "rose" | "slate";

const TEINTES: Record<TeintePanneau, { lisere: string; pastille: string }> = {
  sky: {
    lisere: "border-l-sky-500",
    pastille: "bg-sky-100 text-sky-900 dark:bg-sky-950/60 dark:text-sky-100",
  },
  violet: {
    lisere: "border-l-violet-500",
    pastille: "bg-violet-100 text-violet-900 dark:bg-violet-950/60 dark:text-violet-100",
  },
  amber: {
    lisere: "border-l-amber-500",
    pastille: "bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-100",
  },
  emerald: {
    lisere: "border-l-emerald-500",
    pastille: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-100",
  },
  rose: {
    lisere: "border-l-rose-500",
    pastille: "bg-rose-100 text-rose-900 dark:bg-rose-950/60 dark:text-rose-100",
  },
  slate: {
    lisere: "border-l-slate-400",
    pastille: "bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100",
  },
};

export function Panneau({
  title,
  description,
  action,
  children,
  repliable = false,
  ouvertParDefaut = true,
  teinte,
  compte,
}: {
  readonly title: string;
  readonly description?: string;
  readonly action?: ReactNode;
  readonly children: ReactNode;
  readonly repliable?: boolean;
  readonly ouvertParDefaut?: boolean;
  readonly teinte?: TeintePanneau;
  readonly compte?: number;
}) {
  const [ouvert, setOuvert] = useState(ouvertParDefaut);
  const t = teinte ? TEINTES[teinte] : null;
  const visible = !repliable || ouvert;
  const titre = (
    <span className="flex items-center gap-2">
      <span className="font-display text-[21px] font-medium tracking-[-0.015em]">{title}</span>
      {compte !== undefined ? (
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${t ? t.pastille : "bg-muted"}`}
        >
          {compte}
        </span>
      ) : null}
    </span>
  );
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        {repliable ? (
          <button
            type="button"
            className="flex min-h-11 items-center gap-2 text-left"
            aria-expanded={ouvert}
            onClick={() => setOuvert((v) => !v)}
          >
            <h2>{titre}</h2>
            <ChevronDown
              className={`size-5 text-muted-foreground transition-transform ${ouvert ? "rotate-180" : ""}`}
              aria-hidden
            />
          </button>
        ) : (
          <h2>{titre}</h2>
        )}
        {action}
      </div>
      {description && visible ? (
        <p className="-mt-2 mb-3 text-[13px] leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : null}
      {visible ? (
        <div
          className={`overflow-hidden rounded-xl border bg-card p-4 shadow-[var(--shadow-card)] ${
            t ? `border-l-4 ${t.lisere}` : ""
          }`}
        >
          {children}
        </div>
      ) : null}
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

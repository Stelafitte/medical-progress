/**
 * LE VOCABULAIRE VISUEL DES ÉCRANS PROFESSIONNELS — Admin, Concepteur,
 * Encadrant, Responsable de stage, Plateforme. Écrit une fois, appliqué par les
 * cinquante-trois écrans qui importent ces briques.
 *
 * POURQUOI CE FICHIER A CHANGÉ (Stef, 16/09 : « le visuel des onglets Admin est
 * très lourd et peu digeste… les blocs ou pavés sont serrés, peu aérés, pas
 * colorés… très difficile dans sa lecture »).
 *
 * Ce qui n'allait pas, mesuré sur les écrans :
 *   - un panneau et une carte de chiffres avaient la MÊME anatomie — même
 *     bord, même rayon, même ombre — donc la page était une pile de pavés
 *     indifférenciés, sans hiérarchie ;
 *   - le titre d'un panneau était un `text-base font-semibold`, soit deux
 *     pixels de plus que son contenu : rien ne le signalait comme titre ;
 *   - l'en-tête et le contenu partageaient le même fond sans séparation, donc
 *     l'œil ne trouvait pas où commençait la matière ;
 *   - un vide était un encadré en pointillés, c'est-à-dire un objet de plus à
 *     lire, pour dire qu'il n'y a rien ;
 *   - le bandeau de périmètre était une alerte encadrée, aussi visible que le
 *     contenu qu'il annote.
 *
 * Les six règles appliquées ici :
 *   1. l'en-tête d'un panneau se lit AVANT son contenu — titre en serif 23 px
 *      et filet de séparation. PAS de fond creusé : mesuré le 16/09 au soir,
 *      `--background` vaut 0.99 de clarté et `--card-sunk` 0.975 — un pas de
 *      1,5 %, invisible. L'en-tête prenait donc la couleur du fond de l'onglet
 *      pendant que le corps restait blanc, et se lisait comme un trou dans la
 *      carte, pas comme sa tête (Stef, sur « Terrains de stage » : « son titre
 *      peu visible, petite police, fond du bloc bleu ciel, peu ou pas
 *      différent du fond de l'onglet »). La carte est maintenant UN SEUL objet
 *      blanc pose sur le fond bleute de la page, et la hierarchie est portee
 *      par la typographie — ce que dit deja la regle 2 ;
 *   2. la hiérarchie se lit à la FORME (serif pour un titre, sans-serif pour la
 *      matière), pas à deux pixels de corps ;
 *   3. chaque bloc respire : 20 à 24 px de garde intérieure, jamais 12 ;
 *   4. un chiffre se lit en serif tabulaire, son étiquette en petites
 *      capitales — comme sur le bandeau marine et les écrans apprenants ;
 *   5. LA TEINTE NE DIT QU'UNE CHOSE. Sur ces écrans, aucun domaine de
 *      compétence n'est en jeu : la teinte ne sert donc qu'à porter un ÉTAT
 *      (`tone`), et un panneau sans état reste gris. Les huit teintes de
 *      domaine `--d-1..--d-8` restent réservées au contenu pédagogique ;
 *   6. un vide se dit, il ne s'encadre pas.
 */
import { useId, useState, type ReactNode } from "react";
import { ChevronDown, Info } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * L'ÉTAT que porte un panneau ou un chiffre — jamais un domaine de compétence.
 * `neutral` ne pose aucune teinte : c'est le cas par défaut, et il doit le
 * rester, sans quoi la page redevient illisible à force d'être colorée.
 */
export type PanelTone = "neutral" | "action" | "attention" | "done";

const RAIL: Record<PanelTone, string> = {
  neutral: "bg-border",
  action: "bg-cta",
  attention: "bg-live",
  done: "bg-success",
};

const PASTILLE: Record<PanelTone, string> = {
  neutral: "bg-border text-foreground",
  action: "bg-cta text-primary-foreground",
  attention: "bg-live text-live-ink",
  done: "bg-success text-success-foreground",
};

/**
 * Bandeau de périmètre : rappelle ce que le rôle peut voir et ne peut pas voir.
 * Une annotation, pas une alerte : un filet à gauche, aucun encadré.
 */
export function ScopeNotice({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-stretch overflow-hidden rounded-lg bg-card-sunk">
      <div className="w-[3px] shrink-0 bg-cta" aria-hidden />
      <div className="flex items-start gap-3 px-3.5 py-3">
        <Info className="mt-0.5 size-4 shrink-0 text-cta" aria-hidden />
        <p className="text-[13px] leading-relaxed text-ink-soft">{children}</p>
      </div>
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: PanelTone;
}) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-[var(--shadow-card)]">
      {tone === "neutral" ? null : <div className={cn("h-[3px]", RAIL[tone])} />}
      <div className="px-4 py-4">
        <p className="text-[10.5px] font-semibold uppercase leading-tight tracking-[0.11em] text-muted-foreground">
          {label}
        </p>
        <p
          className="mt-2 font-display text-[30px] font-medium leading-none tracking-[-0.03em]"
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {value}
        </p>
        {hint ? (
          <p className="mt-2 text-[12px] leading-snug text-muted-foreground">{hint}</p>
        ) : null}
      </div>
    </div>
  );
}

/** Un vide se dit, il ne s'encadre pas. */
export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg bg-card-sunk px-4 py-7 text-center text-[13px] leading-relaxed text-muted-foreground">
      {children}
    </p>
  );
}

export function PanelCard({
  id,
  title,
  description,
  action,
  children,
  tone = "neutral",
  step,
  collapsible = false,
  defaultOpen,
}: {
  /**
   * Ancre de navigation, posee seulement par les ecrans dont le sommaire
   * renvoie a leurs propres sections. Le panneau devient alors la cible du
   * defilement, et `tabIndex` fait suivre le focus : sans lui la navigation
   * n'existerait qu'a l'oeil, pas au clavier ni au lecteur d'ecran.
   */
  id?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  /** L'état du panneau — jamais un domaine de compétence. Voir `PanelTone`. */
  tone?: PanelTone;
  /**
   * Numéro d'étape, POSÉ SEULEMENT QUAND LE CONTENU EST VRAIMENT UNE SUITE
   * ORDONNÉE (le Concepteur en quatre temps). Ailleurs, un numéro décorerait
   * sans rien dire.
   */
  step?: number;
  /**
   * PANNEAU REPLIABLE (Stef, 18/09 : « c'est illisible actuellement »). L'en-tête
   * devient le bouton qui ouvre et ferme ; le contenu reste MONTÉ quand il est
   * replié (`hidden`), pour qu'une saisie en cours ne se perde pas.
   */
  collapsible?: boolean;
  /** Ouvert au premier affichage (replié par défaut quand `collapsible`). */
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen ?? !collapsible);
  const bodyId = useId();
  const titre = (
    <div className="flex min-w-0 items-start gap-3">
      {step === undefined ? null : (
        <span
          className={cn(
            "mt-1 grid size-7 shrink-0 place-items-center rounded-full text-[13px] font-semibold",
            PASTILLE[tone === "neutral" ? "action" : tone],
          )}
          style={{ fontVariantNumeric: "tabular-nums" }}
          aria-hidden
        >
          {step}
        </span>
      )}
      <div className="min-w-0">
        <h2 className="font-display text-[23px] font-medium leading-[1.15] tracking-[-0.02em]">
          {title}
        </h2>
        {description ? (
          <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-ink-soft">{description}</p>
        ) : null}
      </div>
    </div>
  );
  return (
    <section
      id={id}
      tabIndex={id === undefined ? undefined : -1}
      // Un sommaire qui mène à un panneau replié doit l'ouvrir : sinon le lien
      // amène à un titre, pas à la matière.
      onFocus={(event) => {
        if (collapsible && event.target === event.currentTarget) setOpen(true);
      }}
      className={cn(
        "overflow-hidden rounded-xl border bg-card shadow-[var(--shadow-card)]",
        id === undefined ? undefined : "scroll-mt-20",
      )}
    >
      {tone === "neutral" ? null : <div className={cn("h-[3px]", RAIL[tone])} />}
      <div className={cn("px-5 pb-4 pt-5 sm:px-6", open ? "border-b border-border" : undefined)}>
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          {collapsible ? (
            <button
              type="button"
              aria-expanded={open}
              aria-controls={bodyId}
              onClick={() => setOpen((v) => !v)}
              className="group flex min-w-0 flex-1 items-start gap-2 rounded-md text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronDown
                className={cn(
                  "mt-1.5 size-5 shrink-0 text-muted-foreground transition-transform group-hover:text-foreground",
                  open ? undefined : "-rotate-90",
                )}
                aria-hidden
              />
              {titre}
            </button>
          ) : (
            titre
          )}
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      </div>
      <div id={bodyId} hidden={!open} className="space-y-4 px-5 py-5 text-sm sm:px-6 sm:py-6">
        {children}
      </div>
    </section>
  );
}

/**
 * UN SOUS-BLOC REPLIABLE, à l'intérieur d'un panneau (18/09). Même geste que le
 * panneau, un cran plus bas dans la hiérarchie : titre sans-serif 15 px, résumé
 * à droite pour savoir ce qu'il y a dedans SANS l'ouvrir, filet de couleur à
 * gauche quand il porte un état.
 */
export function SubBlock({
  title,
  summary,
  children,
  defaultOpen = false,
  tone = "neutral",
}: {
  title: ReactNode;
  /** Ce qu'on voit replié : un compte, un état. */
  summary?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  tone?: PanelTone;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  return (
    <div className="flex overflow-hidden rounded-lg border border-border bg-card">
      <div className={cn("w-[3px] shrink-0", RAIL[tone])} aria-hidden />
      <div className="min-w-0 flex-1">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((v) => !v)}
          className="flex min-h-11 w-full items-center gap-2 px-4 py-2.5 text-start hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          <ChevronDown
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform",
              open ? undefined : "-rotate-90",
            )}
            aria-hidden
          />
          <span className="min-w-0 flex-1 text-[15px] font-medium">{title}</span>
          {summary ? (
            <span className="shrink-0 text-xs text-muted-foreground">{summary}</span>
          ) : null}
        </button>
        <div id={bodyId} hidden={!open} className="space-y-3 border-t border-border px-4 py-4">
          {children}
        </div>
      </div>
    </div>
  );
}

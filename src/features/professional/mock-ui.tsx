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
 *   1. l'en-tête d'un panneau se lit AVANT son contenu — fond creusé
 *      (`card-sunk`), filet de séparation, titre en serif ;
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
import type { ReactNode } from "react";
import { Info } from "lucide-react";
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

export function MockBadge({ label = "Maquette" }: { label?: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-current/30 px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-[0.08em] opacity-75">
      {label}
    </span>
  );
}

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
}) {
  return (
    <section
      id={id}
      tabIndex={id === undefined ? undefined : -1}
      className={cn(
        "overflow-hidden rounded-xl border bg-card shadow-[var(--shadow-card)]",
        id === undefined ? undefined : "scroll-mt-20",
      )}
    >
      {tone === "neutral" ? null : <div className={cn("h-[3px]", RAIL[tone])} />}
      <div className="border-b bg-card-sunk px-5 py-4 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="flex min-w-0 items-start gap-3">
            {step === undefined ? null : (
              <span
                className={cn(
                  "mt-0.5 grid size-7 shrink-0 place-items-center rounded-full text-[13px] font-semibold",
                  PASTILLE[tone === "neutral" ? "action" : tone],
                )}
                style={{ fontVariantNumeric: "tabular-nums" }}
                aria-hidden
              >
                {step}
              </span>
            )}
            <div className="min-w-0">
              <h2 className="font-display text-[19px] font-medium leading-snug tracking-[-0.015em]">
                {title}
              </h2>
              {description ? (
                <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
                  {description}
                </p>
              ) : null}
            </div>
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      </div>
      <div className="space-y-4 px-5 py-5 text-sm sm:px-6 sm:py-6">{children}</div>
    </section>
  );
}

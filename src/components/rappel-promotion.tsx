/**
 * LE RAPPEL DE CONTEXTE, EN TÊTE DE CHAQUE ONGLET D'ADMINISTRATION (21/09).
 *
 * Une ligne, trois couleurs, pour savoir sans chercher à quoi s'appliquent les
 * chiffres affichés :
 * - bleu ciel : l'onglet n'affiche que la promotion choisie ;
 * - ambre : l'onglet porte le référentiel commun à toutes les promotions ;
 * - neutre : l'onglet n'est pas découpé par promotion, ou « Toutes » est choisi.
 */
import { useRouterState } from "@tanstack/react-router";
import { useSession } from "@/application/session";
import { useCohortFocus } from "@/application/cohortFocusStore";
import { usePromotionsDuProgramme } from "@/features/administration/usePromotionsDuProgramme";
import { natureOnglet } from "@/features/administration/perimetrePromotion";

export function RappelPromotion() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { activeProgram, canAccessAdministration } = useSession();
  const focus = useCohortFocus();
  const { data: cohorts } = usePromotionsDuProgramme();
  const nature = natureOnglet(pathname);
  if (!canAccessAdministration || nature === null) return null;

  const promotion = focus ? cohorts?.find((c) => c.id === focus) : undefined;
  const pastille = "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold";

  let ton: string;
  let texte: string;
  if (nature === "programme") {
    ton =
      "border-amber-200 bg-amber-50/70 text-amber-950 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-100";
    texte = promotion
      ? `Référentiel commun à toutes les promotions · le suivi en bas de page concerne « ${promotion.label} »`
      : "Référentiel commun à toutes les promotions";
  } else if (nature === "promotion") {
    ton = promotion
      ? "border-sky-200 bg-sky-50/70 text-sky-950 dark:border-sky-900 dark:bg-sky-950/20 dark:text-sky-100"
      : "border-border bg-muted/40 text-foreground";
    texte = promotion
      ? `Cet onglet n'affiche que la promotion « ${promotion.label} »`
      : "Toutes les promotions : choisissez-en une en haut à droite, ou dans l'onglet";
  } else {
    ton = "border-border bg-muted/40 text-foreground";
    texte = "Cet onglet concerne tout le programme, sans découpage par promotion";
  }

  return (
    <div
      className={`mb-4 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm ${ton}`}
      aria-label="Contexte de l'onglet"
    >
      <span className={`${pastille} bg-background/80`}>{activeProgram.code}</span>
      <span aria-hidden>›</span>
      <span className={`${pastille} bg-background/80`}>
        {nature === "programme"
          ? "Niveau programme"
          : nature === "transversal"
            ? "Tout le programme"
            : (promotion?.label ?? "Toutes les promotions")}
      </span>
      <span className="text-xs sm:text-sm">{texte}</span>
    </div>
  );
}

/**
 * LE SECOND MENU DE L'EN-TÊTE : LA PROMOTION (Stef, 21/09).
 *
 * « Programme » puis « Promotion ». « Toutes les promotions » est l'ouverture
 * par défaut et garde le comportement d'avant : chaque onglet propose alors
 * son propre choix. Une promotion choisie ici s'impose à tous les onglets —
 * c'est le même magasin (`cohortFocusStore`) que celui des sélecteurs internes,
 * il n'y a donc qu'une vérité.
 *
 * Visible seulement dans l'espace d'administration du programme : ni
 * l'apprenant ni l'encadrant n'ont à choisir, leur contexte est déjà unique.
 */
import { useEffect, useRef } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useSession } from "@/application/session";
import { usePromotionsDuProgramme } from "@/features/administration/usePromotionsDuProgramme";
import { setCohortFocus, useCohortFocus } from "@/application/cohortFocusStore";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { sortCohortsForPilot } from "@/features/administration/adminProgramViewModel";
import { promotionValide } from "@/features/administration/perimetrePromotion";
import { COHORT_STATUS_LABELS_FR } from "@/domain/types";

const TOUTES_PROMOTIONS = "__toutes__";

export function CohortSwitcher({ variant = "compact" }: { variant?: "compact" | "full" }) {
  const { activeProgram, canAccessAdministration } = useSession();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const focus = useCohortFocus();
  const { data: cohorts } = usePromotionsDuProgramme();

  /* Changer de programme ramène à « Toutes » : une promotion n'a de sens que
     dans son programme. */
  const programmePrecedent = useRef(activeProgram.id);
  useEffect(() => {
    if (programmePrecedent.current !== activeProgram.id) {
      programmePrecedent.current = activeProgram.id;
      setCohortFocus(null);
    }
  }, [activeProgram.id]);

  /* Promotion mémorisée d'un autre programme, ou archivée depuis : on l'oublie. */
  useEffect(() => {
    if (!cohorts) return;
    if (focus && promotionValide(focus, cohorts) === null) setCohortFocus(null);
  }, [cohorts, focus]);

  if (!canAccessAdministration || !pathname.startsWith("/espace/administration")) return null;

  const ordonnees = sortCohortsForPilot(cohorts ?? []);
  const valeur = focus && ordonnees.some((c) => c.id === focus) ? focus : TOUTES_PROMOTIONS;

  return (
    <div className={variant === "full" ? "w-full" : "flex min-w-0 items-center"}>
      <label htmlFor={`cohort-switcher-${variant}`} className="sr-only">
        Promotion affichée
      </label>
      <Select
        value={valeur}
        onValueChange={(v) => setCohortFocus(v === TOUTES_PROMOTIONS ? null : v)}
      >
        <SelectTrigger
          id={`cohort-switcher-${variant}`}
          className={
            variant === "full"
              ? "min-h-11 w-full bg-card"
              : `min-h-10 w-[7.5rem] min-w-0 sm:w-[13rem] ${
                  valeur === TOUTES_PROMOTIONS
                    ? "bg-card"
                    : "border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100"
                }`
          }
        >
          <SelectValue placeholder="Promotion" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={TOUTES_PROMOTIONS}>Toutes les promotions</SelectItem>
          {ordonnees.length > 0 ? (
            <SelectGroup>
              <SelectLabel className="text-xs text-muted-foreground">Promotions</SelectLabel>
              {ordonnees.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  <span className="flex items-baseline gap-2">
                    <span>{c.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {COHORT_STATUS_LABELS_FR[c.status]}
                    </span>
                  </span>
                </SelectItem>
              ))}
            </SelectGroup>
          ) : null}
        </SelectContent>
      </Select>
    </div>
  );
}

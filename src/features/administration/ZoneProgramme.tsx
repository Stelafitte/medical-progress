/**
 * LA ZONE « NIVEAU PROGRAMME » ET SON VERROU D'ÉDITION (Stef, 21/09).
 *
 * Le référentiel (connaissances, compétences, supports, conception) appartient
 * au programme : le modifier le modifie pour TOUTES les promotions. Sous un
 * menu « Promotion : DFASM 2026-27 », l'administrateur pourrait croire le
 * contraire. D'où :
 *
 * 1. un bandeau permanent qui nomme les promotions concernées ;
 * 2. dès qu'une promotion est ouverte ou en cours, la zone s'ouvre EN LECTURE :
 *    un clic sur un bouton qui agit ouvre une confirmation chiffrée (combien de
 *    promotions, combien d'étudiants) au lieu d'agir ;
 * 3. « Modifier le programme (toutes les promotions) » déverrouille, « Terminer
 *    les modifications » reverrouille. Le verrou revient aussi seul après 15
 *    minutes sans geste, et à chaque changement d'onglet ou de programme (le
 *    composant est alors démonté).
 *
 * CE QUE LE BOUTON DU BAS N'EST PAS : une validation différée. Chaque
 * enregistrement reste immédiat, comme avant ; le dire évite de faire croire
 * qu'on peut « annuler en ne validant pas ».
 *
 * LE MÉCANISME. Plutôt que de modifier chacun des dizaines de boutons de ces
 * écrans (et d'oublier celui qu'on ajoutera demain), la zone écoute les clics
 * en phase de capture et ne retient que ceux qui AGISSENT (`doitIntercepter`) :
 * déplier un bloc, ouvrir une liste, suivre un lien restent libres. Un bouton
 * de pure lecture se marque `data-lecture`.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Lock, LockOpen, Layers } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { COHORT_STATUS_LABELS_FR, type Cohort } from "@/domain/types";
import {
  SELECTEUR_CLIQUABLE,
  doitIntercepter,
  estPromotionVivante,
  promotionsConcernees,
  verrouNecessaire,
} from "@/features/administration/perimetrePromotion";

const DELAI_REVERROUILLAGE_MS = 15 * 60 * 1000;

export function ZoneProgramme({
  programName,
  cohorts,
  children,
}: {
  programName: string;
  cohorts: readonly Cohort[];
  children: ReactNode;
}) {
  const concernees = promotionsConcernees(cohorts);
  const verrouActif = verrouNecessaire(cohorts);
  const [deverrouille, setDeverrouille] = useState(false);
  const [confirmation, setConfirmation] = useState(false);
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);
  const verrouille = verrouActif && !deverrouille;

  const rearmer = useCallback(() => {
    if (minuteur.current) clearTimeout(minuteur.current);
    minuteur.current = setTimeout(() => setDeverrouille(false), DELAI_REVERROUILLAGE_MS);
  }, []);
  useEffect(
    () => () => {
      if (minuteur.current) clearTimeout(minuteur.current);
    },
    [],
  );

  const intercepter = (event: React.SyntheticEvent) => {
    if (!verrouille) {
      if (deverrouille) rearmer();
      return;
    }
    const cible = event.target instanceof Element ? event.target : null;
    const el = cible?.closest(SELECTEUR_CLIQUABLE);
    if (!el) return;
    const agit = doitIntercepter({
      tag: el.tagName,
      type: el.getAttribute("type"),
      role: el.getAttribute("role"),
      ariaExpanded: el.getAttribute("aria-expanded"),
      ariaHaspopup: el.getAttribute("aria-haspopup"),
      lecture: el.closest("[data-lecture]") !== null,
      href: el.getAttribute("href"),
    });
    if (!agit) return;
    event.preventDefault();
    event.stopPropagation();
    setConfirmation(true);
  };

  const apprenants = concernees
    .filter(estPromotionVivante)
    .reduce((n, c) => n + (c.learnerCount ?? 0), 0);
  const vivantes = concernees.filter(estPromotionVivante).length;

  return (
    <div className="space-y-4">
      <div
        className="flex flex-col gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950 sm:flex-row sm:items-center sm:justify-between dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100"
        role="note"
      >
        <div className="flex min-w-0 gap-3">
          <Layers className="mt-0.5 size-5 shrink-0" aria-hidden />
          <div className="min-w-0 space-y-1 text-sm">
            <p className="font-semibold">
              Niveau programme : commun à toutes les promotions de « {programName} »
            </p>
            <p>
              {concernees.length === 0
                ? "Aucune promotion n'est encore rattachée : les modifications préparent les suivantes."
                : `Toute modification s'applique immédiatement à : ${concernees
                    .map((c) => `${c.label} (${COHORT_STATUS_LABELS_FR[c.status].toLowerCase()})`)
                    .join(", ")}.`}
            </p>
          </div>
        </div>
        {verrouActif ? (
          verrouille ? (
            <Button
              type="button"
              className="min-h-11 shrink-0 bg-amber-600 text-white hover:bg-amber-700"
              onClick={() => setConfirmation(true)}
            >
              <Lock className="size-4" aria-hidden />
              Modifier le programme (toutes les promotions)
            </Button>
          ) : (
            <span className="inline-flex shrink-0 items-center gap-2 rounded-full bg-amber-600 px-3 py-1 text-sm font-medium text-white">
              <LockOpen className="size-4" aria-hidden />
              Modification du programme en cours
            </span>
          )
        ) : null}
      </div>

      <div
        onClickCapture={intercepter}
        onSubmitCapture={intercepter}
        className="space-y-6"
        aria-describedby={verrouille ? "zone-programme-verrou" : undefined}
      >
        {verrouille ? (
          <p id="zone-programme-verrou" className="sr-only">
            Zone en lecture : déverrouillez pour modifier le programme.
          </p>
        ) : null}
        {children}
      </div>

      {verrouActif && !verrouille ? (
        <div className="flex flex-col gap-2 rounded-lg border border-amber-300 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-amber-800 dark:bg-amber-950/30">
          <p className="text-sm text-amber-950 dark:text-amber-100">
            Vos modifications sont déjà enregistrées, au fil de chaque action. Terminez pour
            reverrouiller le programme.
          </p>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 shrink-0 border-amber-400"
            onClick={() => setDeverrouille(false)}
          >
            <Lock className="size-4" aria-hidden />
            Terminer les modifications
          </Button>
        </div>
      ) : null}

      <AlertDialog open={confirmation} onOpenChange={setConfirmation}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Modifier le programme pour toutes les promotions ?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <p>
                  Vous allez modifier « {programName} ».{" "}
                  <strong>
                    {vivantes} promotion(s) ouverte(s) ou en cours
                    {apprenants > 0 ? `, ${apprenants} étudiant(s)` : ""}
                  </strong>{" "}
                  verront le changement immédiatement.
                </p>
                <ul className="list-disc space-y-1 ps-5">
                  {concernees.map((c) => (
                    <li key={c.id}>
                      {c.label} : {COHORT_STATUS_LABELS_FR[c.status].toLowerCase()}
                      {c.learnerCount ? `, ${c.learnerCount} étudiant(s)` : ""}
                    </li>
                  ))}
                </ul>
                <p>
                  Chaque enregistrement est immédiat : il n'y a pas de validation différée. Le
                  verrou revient quand vous terminez, changez d'onglet, ou après 15 minutes sans
                  action.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11">Rester en lecture</AlertDialogCancel>
            <AlertDialogAction
              className="min-h-11 bg-amber-600 text-white hover:bg-amber-700"
              onClick={() => {
                setDeverrouille(true);
                rearmer();
              }}
            >
              Oui, modifier le programme
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

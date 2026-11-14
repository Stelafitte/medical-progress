/**
 * Barre d'action sur une SÉLECTION de personnes — la même dans Administration,
 * Classes d'apprenants, Équipe d'encadrement et Communication interne, pour
 * qu'un même geste donne le même résultat partout.
 *
 * Deux gestes distincts, jamais confondus :
 *  - RETIRER : réversible, rien n'est effacé (droits révoqués, inscriptions
 *    « retirées », sortie des groupes) ; RÉINTÉGRER remet ce qui a été retiré ;
 *  - SUPPRIMER : définitif, accordé par la base seulement s'il n'y a aucun
 *    historique. La raison de chaque refus est affichée en français.
 *
 * Chaque action passe par une confirmation chiffrée dans la barre elle-même
 * (pas de fenêtre modale du navigateur).
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useDataAccess } from "@/application/session";
import type { PeopleActionResult } from "@/application/ports/repositories";
import type { ProgramId } from "@/domain/types";

type Geste = "remove" | "reinstate" | "delete";

const RAISONS_FR: Record<string, string> = {
  introuvable: "introuvable",
  "vous-meme": "c'est vous",
  administrateur: "administrateur (jamais retiré en lot)",
  "autre-programme": "présent aussi dans un autre programme",
  historique: "a un historique : retirer plutôt que supprimer",
  "rien-a-reintegrer": "rien à réintégrer",
  "droit-deja-reattribue": "un droit équivalent a déjà été accordé",
};

const LIBELLES: Record<Geste, { verbe: string; passe: string }> = {
  remove: { verbe: "Retirer", passe: "retirée(s)" },
  reinstate: { verbe: "Réintégrer", passe: "réintégrée(s)" },
  delete: { verbe: "Supprimer définitivement", passe: "supprimée(s)" },
};

export function PeopleRemovalBar({
  programId,
  personIds,
  nameOf,
  onDone,
  onClear,
}: {
  readonly programId: ProgramId;
  /** Identifiants de comptes OU de lignes du vivier : la base distingue. */
  readonly personIds: readonly string[];
  readonly nameOf?: ((id: string) => string) | undefined;
  readonly onDone: () => void;
  readonly onClear?: (() => void) | undefined;
}) {
  const dataAccess = useDataAccess();
  const [pending, setPending] = useState<Geste | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (personIds.length === 0 && !message && !error) return null;

  async function run(geste: Geste) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result: PeopleActionResult =
        geste === "delete"
          ? await dataAccess.peopleStaging.deletePeople(programId, personIds)
          : await dataAccess.peopleStaging.removePeople(programId, personIds, geste === "remove");
      const ecartes = result.skipped.map(
        (s) => `${nameOf ? nameOf(s.id) : s.id} (${RAISONS_FR[s.reason] ?? s.reason})`,
      );
      setMessage(
        `${result.done} personne(s) ${LIBELLES[geste].passe}.` +
          (ecartes.length > 0 ? ` Écartée(s) : ${ecartes.join(" ; ")}.` : ""),
      );
      setPending(null);
      onClear?.();
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action impossible.");
    } finally {
      setBusy(false);
    }
  }

  const n = personIds.length;
  return (
    <div
      className="space-y-2 rounded-md border bg-muted/40 p-3 text-sm"
      role="region"
      aria-label="Actions sur la sélection"
    >
      {n > 0 ? (
        pending ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">
              {LIBELLES[pending].verbe} {n} personne(s) ?
            </span>
            {pending === "delete" ? (
              <span className="text-destructive">
                Définitif. Refusé automatiquement pour toute personne ayant un historique.
              </span>
            ) : pending === "remove" ? (
              <span className="text-muted-foreground">
                Réversible : droits révoqués, inscriptions retirées, rien n'est effacé.
              </span>
            ) : null}
            <Button
              size="sm"
              variant={pending === "delete" ? "destructive" : "default"}
              className="min-h-11"
              disabled={busy}
              onClick={() => void run(pending)}
            >
              {busy ? "En cours…" : "Confirmer"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="min-h-11"
              disabled={busy}
              onClick={() => setPending(null)}
            >
              Annuler
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{n} sélectionnée(s)</span>
            <Button
              size="sm"
              variant="outline"
              className="min-h-11"
              onClick={() => setPending("remove")}
            >
              Retirer
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="min-h-11"
              onClick={() => setPending("reinstate")}
            >
              Réintégrer
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="min-h-11 text-destructive"
              onClick={() => setPending("delete")}
            >
              Supprimer…
            </Button>
          </div>
        )
      ) : null}
      {message ? <p role="status">{message}</p> : null}
      {error ? (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

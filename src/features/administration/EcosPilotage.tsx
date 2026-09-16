/**
 * LES STATIONS D'ECOS SIMULÉ OFFERTES À UNE PROMOTION — le bloc que l'atelier
 * déplie, sur le modèle du pilotage QCM.
 *
 * Stef (16/09) : « une fois l'ECOS simulé activé côté Admin, il faut pouvoir
 * [choisir] quels ECOS sont mis à disposition de l'apprenant. Donc il faut
 * lister les 4 ou 5 ECOS disponibles, pouvoir les sélectionner un par un tous
 * avec des cases à cocher, et enregistrer la sélection. »
 *
 * DEUX CHOSES À NE PAS CONFONDRE :
 *   - COCHER LA MODALITÉ dit que cette promotion fait de l'ECOS simulé ;
 *   - COCHER UNE STATION dit laquelle elle joue. Sans aucune station cochée,
 *     l'apprenant ne voit rien — c'est la règle posée par Stef, et l'écran le
 *     dit en clair plutôt que de laisser croire à un oubli.
 *
 * Le catalogue des stations vit dans `src/domain/ecos.ts` (décision du 13/09) ;
 * la base ne garde que des CLÉS. Chaque case s'enregistre AUSSITÔT : un
 * interrupteur qui attend un bouton plus bas trompe.
 */
import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useDataAccess } from "@/application/session";
import { ECOS_EXTERNAL_STATIONS } from "@/domain/ecos";
import type { AssessmentModality, CohortAssessmentLink } from "@/domain/assessmentModality";
import type { Cohort } from "@/domain/types";

export function EcosPilotage({
  cohort,
  modality,
  link,
  editable,
  onChanged,
}: {
  readonly cohort: Cohort;
  readonly modality: AssessmentModality;
  readonly link: CohortAssessmentLink;
  readonly editable: boolean;
  readonly onChanged?: (() => void) | undefined;
}) {
  const dataAccess = useDataAccess();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const offertes = new Set(link.ecosStations ?? []);

  async function enregistrer(cles: readonly string[]) {
    setBusy(true);
    setError(null);
    try {
      await dataAccess.assessments.setCohortAssessmentEcos({
        cohortId: cohort.id,
        assessmentModalityId: modality.id,
        stationKeys: cles,
      });
      onChanged?.();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Enregistrement impossible.");
    } finally {
      setBusy(false);
    }
  }

  function basculer(cle: string, voulue: boolean) {
    const suivantes = ECOS_EXTERNAL_STATIONS.filter((s) =>
      s.key === cle ? voulue : offertes.has(s.key),
    ).map((s) => s.key);
    void enregistrer(suivantes);
  }

  const toutesCochees = offertes.size === ECOS_EXTERNAL_STATIONS.length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium">
          Stations mises à disposition{" "}
          <span className="text-muted-foreground font-normal">— pour cette promotion</span>
        </p>
        {editable ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-9"
            disabled={busy}
            onClick={() =>
              void enregistrer(toutesCochees ? [] : ECOS_EXTERNAL_STATIONS.map((s) => s.key))
            }
          >
            {toutesCochees ? "Tout décocher" : "Tout cocher"}
          </Button>
        ) : null}
      </div>

      <ul className="space-y-2">
        {ECOS_EXTERNAL_STATIONS.map((station) => {
          const id = `ecos-${modality.id}-${station.key}`;
          return (
            <li
              key={station.key}
              className="border-border flex items-start gap-3 rounded-md border p-3"
            >
              <Checkbox
                id={id}
                className="mt-0.5"
                checked={offertes.has(station.key)}
                disabled={!editable || busy}
                onCheckedChange={(v) => basculer(station.key, v === true)}
              />
              <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer space-y-0.5">
                <span className="block text-sm font-medium">
                  {station.label}{" "}
                  <span className="text-muted-foreground font-normal">· {station.patient}</span>
                </span>
                <span className="text-muted-foreground block text-xs">{station.theme}</span>
              </label>
              <Button asChild size="sm" variant="ghost" className="min-h-9 shrink-0 gap-1">
                <a href={station.url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="size-3.5" aria-hidden />
                  Voir
                </a>
              </Button>
            </li>
          );
        })}
      </ul>

      {offertes.size === 0 ? (
        <p className="text-muted-foreground text-xs">
          Aucune station cochée : l'apprenant lit « Pas d'évaluation ou auto-évaluation programmée
          dans votre parcours. » et ne voit aucune station.
        </p>
      ) : (
        <p className="text-muted-foreground text-xs">
          <Badge variant="secondary" className="font-normal">
            {offertes.size} station(s)
          </Badge>{" "}
          offerte(s) à cette promotion. L'apprenant les joue dans ChatGPT et rapporte sa grille.
        </p>
      )}

      {error ? <p className="text-destructive text-xs">{error}</p> : null}
    </div>
  );
}

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
 * la base ne garde que des CLÉS.
 *
 * ⚠️ LA CASE OBÉIT AU DOIGT, PAS AU RÉSEAU (corrigé le 16/09 sur constat de
 * Stef : « la case montre un sens interdit, il faut cliquer plusieurs fois »).
 * Chaque clic enregistrait, et TOUT l'écran d'administration se rechargeait
 * derrière — une trentaine de requêtes — pendant que les cases restaient
 * désactivées : le curseur affichait un sens interdit et les clics de
 * l'intervalle étaient perdus. Désormais l'affichage suit la sélection LOCALE,
 * l'enregistrement part derrière, et si une écriture est déjà en vol la
 * suivante attend son tour — la dernière voulue gagne. Rien n'est jamais
 * désactivé ; en cas d'échec, l'écran revient à ce que dit la base et le dit.
 */
import { useEffect, useRef, useState } from "react";
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
  const [selection, setSelection] = useState<readonly string[]>(link.ecosStations ?? []);
  const [enCours, setEnCours] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enVol = useRef(false);
  const suivante = useRef<readonly string[] | null>(null);

  /*
   * Ce que dit la base reprend la main QUAND PLUS RIEN N'EST EN VOL. Sans cette
   * garde, la relecture déclenchée par un enregistrement écraserait un clic
   * plus récent que la requête en cours.
   */
  const cleServeur = (link.ecosStations ?? []).join("|");
  useEffect(() => {
    if (enVol.current) return;
    setSelection(cleServeur === "" ? [] : cleServeur.split("|"));
  }, [cleServeur]);

  async function envoyer(cles: readonly string[]) {
    if (enVol.current) {
      suivante.current = cles;
      return;
    }
    enVol.current = true;
    setEnCours(true);
    setError(null);
    try {
      let aEnvoyer: readonly string[] | null = cles;
      while (aEnvoyer) {
        await dataAccess.assessments.setCohortAssessmentEcos({
          cohortId: cohort.id,
          assessmentModalityId: modality.id,
          stationKeys: aEnvoyer,
        });
        aEnvoyer = suivante.current;
        suivante.current = null;
      }
      enVol.current = false;
      /* La relecture vient APRÈS la dernière écriture : le badge de la ligne suit. */
      onChanged?.();
    } catch (reason) {
      enVol.current = false;
      suivante.current = null;
      setError(reason instanceof Error ? reason.message : "Enregistrement impossible.");
      setSelection(link.ecosStations ?? []);
    } finally {
      setEnCours(false);
    }
  }

  function basculer(cle: string, voulue: boolean) {
    const cles = ECOS_EXTERNAL_STATIONS.filter((s) =>
      s.key === cle ? voulue : selection.includes(s.key),
    ).map((s) => s.key);
    setSelection(cles);
    void envoyer(cles);
  }

  function toutBasculer() {
    const cles =
      selection.length === ECOS_EXTERNAL_STATIONS.length
        ? []
        : ECOS_EXTERNAL_STATIONS.map((s) => s.key);
    setSelection(cles);
    void envoyer(cles);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium">
          Stations mises à disposition{" "}
          <span className="text-muted-foreground font-normal">— pour cette promotion</span>
        </p>
        <div className="flex items-center gap-2">
          {enCours ? <span className="text-muted-foreground text-xs">Enregistrement…</span> : null}
          {editable ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="min-h-9"
              onClick={toutBasculer}
            >
              {selection.length === ECOS_EXTERNAL_STATIONS.length ? "Tout décocher" : "Tout cocher"}
            </Button>
          ) : null}
        </div>
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
                checked={selection.includes(station.key)}
                disabled={!editable}
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

      {selection.length === 0 ? (
        <p className="text-muted-foreground text-xs">
          Aucune station cochée : l'apprenant lit « Pas d'évaluation ou auto-évaluation programmée
          dans votre parcours. » et ne voit aucune station.
        </p>
      ) : (
        <p className="text-muted-foreground text-xs">
          <Badge variant="secondary" className="font-normal">
            {selection.length} station(s)
          </Badge>{" "}
          offerte(s) à cette promotion. L'apprenant les joue dans ChatGPT et rapporte sa grille.
        </p>
      )}

      {error ? <p className="text-destructive text-xs">{error}</p> : null}
    </div>
  );
}

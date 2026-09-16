/**
 * LES STATIONS D'ECOS SIMULÉ OFFERTES À UNE PROMOTION — le bloc que l'atelier
 * déplie, sous la ligne « ECOS simulé ».
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
 * ⚠️ CE PANNEAU N'ÉCRIT RIEN LUI-MÊME (16/09, deuxième correction de Stef :
 * « dès que je change un état des cases à cocher, il faut pouvoir enregistrer
 * le changement avec le bouton enregistrement »). Une case cochée est une
 * INTENTION, exactement comme les cases des modalités au-dessus ; c'est le
 * bouton « Enregistrer les modifications », en bas du bloc, qui la porte en
 * base. Un seul geste d'enregistrement pour tout l'écran, et « Annuler » rend
 * vraiment ce qu'il promet.
 *
 * C'est aussi ce qui a réglé le sens interdit du premier essai : quand chaque
 * clic écrivait, tout l'écran d'administration se rechargeait derrière — une
 * trentaine de requêtes — et les cases restaient désactivées pendant ce temps.
 */
import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ECOS_EXTERNAL_STATIONS } from "@/domain/ecos";
import type { AssessmentModality, CohortAssessmentLink } from "@/domain/assessmentModality";

/** Deux sélections identiques, quel que soit l'ordre. */
function memeSelection(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const gauche = [...a].sort();
  const droite = [...b].sort();
  return gauche.every((cle, i) => cle === droite[i]);
}

export function EcosPilotage({
  modality,
  link,
  editable,
  selection,
  onSelection,
}: {
  readonly modality: AssessmentModality;
  readonly link: CohortAssessmentLink;
  readonly editable: boolean;
  /** Ce que les cases montrent : l'intention en cours, ou ce que dit la base. */
  readonly selection: readonly string[];
  readonly onSelection: (stationKeys: readonly string[]) => void;
}) {
  const enBase = link.ecosStations ?? [];
  const modifiee = !memeSelection(selection, enBase);
  const toutes = ECOS_EXTERNAL_STATIONS.map((s) => s.key);

  function basculer(cle: string, voulue: boolean) {
    onSelection(
      ECOS_EXTERNAL_STATIONS.filter((s) =>
        s.key === cle ? voulue : selection.includes(s.key),
      ).map((s) => s.key),
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium">
          Stations mises à disposition{" "}
          <span className="text-muted-foreground font-normal">— pour cette promotion</span>
        </p>
        <div className="flex items-center gap-2">
          {modifiee ? (
            <Badge variant="outline" className="text-muted-foreground font-normal">
              à enregistrer
            </Badge>
          ) : null}
          {editable ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="min-h-9"
              onClick={() => onSelection(selection.length === toutes.length ? [] : toutes)}
            >
              {selection.length === toutes.length ? "Tout décocher" : "Tout cocher"}
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
          {modifiee
            ? "seront offertes à cette promotion après enregistrement."
            : "offerte(s) à cette promotion. L'apprenant les joue dans ChatGPT et rapporte sa grille."}
        </p>
      )}
    </div>
  );
}

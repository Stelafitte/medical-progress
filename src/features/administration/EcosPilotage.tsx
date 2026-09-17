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
 * la base ne garde que des CLÉS. C'est ce qui permet, depuis le 17/09, de
 * choisir ses stations AVANT même d'avoir enregistré la modalité : la liste ne
 * dépend d'aucune lecture en base.
 *
 * ⚠️ CE PANNEAU N'ÉCRIT RIEN LUI-MÊME. Une case cochée est une INTENTION,
 * exactement comme les cases des modalités au-dessus ; c'est « Enregistrer les
 * modifications », en bas du bloc, qui la porte en base. Un seul geste
 * d'enregistrement pour tout l'écran, et « Annuler » rend vraiment ce qu'il
 * promet. C'est aussi ce qui a réglé le sens interdit du premier essai : quand
 * chaque clic écrivait, tout l'écran se rechargeait derrière — une trentaine de
 * requêtes — et les cases restaient désactivées pendant ce temps.
 *
 * La mécanique de sélection est partagée depuis le 17/09 :
 * `SelectionEnregistrable`. Cet écran en est un cas, plus l'exception qui la
 * portait.
 */
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ECOS_EXTERNAL_STATIONS } from "@/domain/ecos";
import { SelectionEnregistrable } from "@/features/administration/SelectionEnregistrable";
import type { CohortAssessmentLink } from "@/domain/assessmentModality";

export function EcosPilotage({
  cle,
  link,
  editable,
  selection,
  onSelection,
}: {
  /** Préfixe stable des cases : survit à la création de la modalité. */
  readonly cle: string;
  /** Absent tant que la modalité n'est pas enregistrée pour la promotion. */
  readonly link: CohortAssessmentLink | undefined;
  readonly editable: boolean;
  /** Ce que les cases montrent : l'intention en cours, ou ce que dit la base. */
  readonly selection: readonly string[];
  readonly onSelection: (stationKeys: readonly string[]) => void;
}) {
  return (
    <SelectionEnregistrable
      titre="Stations mises à disposition"
      precision="pour cette promotion"
      cle={`ecos-${cle}`}
      editable={editable}
      selection={selection}
      enBase={link?.ecosStations ?? []}
      onSelection={onSelection}
      vide="Aucune station au catalogue."
      elements={ECOS_EXTERNAL_STATIONS.map((station) => ({
        id: station.key,
        label: `${station.label} · ${station.patient}`,
        detail: station.theme,
        aDroite: (
          <Button asChild size="sm" variant="ghost" className="min-h-9 gap-1">
            <a href={station.url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="size-3.5" aria-hidden />
              Voir
            </a>
          </Button>
        ),
      }))}
    />
  );
}

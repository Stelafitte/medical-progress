/**
 * UNE LISTE QU'ON CHOISIT, PUIS QU'ON ENREGISTRE — la règle générale posée par
 * Stef le 17/09, et le composant qui la tient.
 *
 * « Quand j'active une option, il faut que j'enregistre pour voir apparaître la
 * liste, alors que spontanément la liste devrait apparaître. Et dans la liste,
 * comme toujours, la possibilité de sélectionner un ou plusieurs items ou tous
 * ou aucun puis enregistrer la sélection. Fais-en une règle générale à
 * appliquer partout. »
 *
 * LE DÉPÔT PORTAIT DEUX RÈGLES OPPOSÉES, et c'était la vraie cause du malaise :
 *   - `EcosPilotage` (16/09) : « dès que je change une case, il faut pouvoir
 *     enregistrer avec le bouton » — sélection différée ;
 *   - `QcmPilotage` : « chaque réglage s'enregistre aussitôt — un interrupteur
 *     qui attend un bouton plus bas trompe » — écriture immédiate.
 * Les deux ont raison, mais pas sur le même objet. D'où la règle :
 *   1. COCHER UNE OPTION OUVRE SA LISTE TOUT DE SUITE, sans attendre
 *      l'enregistrement ;
 *   2. UN RÉGLAGE UNIQUE (un interrupteur, un choix de banque) s'enregistre
 *      aussitôt — un interrupteur qui attend trompe ;
 *   3. UNE LISTE D'ITEMS se sélectionne — un, plusieurs, tous, aucun — puis
 *      s'enregistre d'un seul geste. On coche plusieurs cases d'affilée ;
 *      écrire à chaque clic recharge tout l'écran (le sens interdit du 16/09,
 *      une trentaine de requêtes et des cases inertes pendant ce temps).
 *
 * « AUCUN » N'EST PAS « PAS ENCORE TRIÉ ». Le composant rend l'un et l'autre
 * visibles, parce que la base les distingue : une sélection absente sert tout,
 * une sélection vide ne sert rien. Sans cette phrase à l'écran, « Tout
 * décocher » ressemble à une panne.
 */
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

export interface ElementSelectionnable {
  readonly id: string;
  readonly label: string;
  /** Deuxième ligne, en petit : ce qui aide à reconnaître l'item. */
  readonly detail?: string;
  /** Badges ou lien, à droite de la ligne. */
  readonly aDroite?: ReactNode;
}

/** Deux sélections identiques, quel que soit l'ordre. */
function memeSelection(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const gauche = [...a].sort();
  const droite = [...b].sort();
  return gauche.every((cle, i) => cle === droite[i]);
}

export function SelectionEnregistrable({
  titre,
  precision,
  elements,
  selection,
  enBase,
  editable,
  cle,
  onSelection,
  vide,
  toutSiAbsente = false,
}: {
  readonly titre: string;
  /** Ce que la portée veut dire : « pour cette promotion », le plus souvent. */
  readonly precision?: string;
  readonly elements: readonly ElementSelectionnable[];
  /** L'intention en cours : ce que les cases montrent. */
  readonly selection: readonly string[];
  /**
   * Ce que la base porte. `undefined` = aucune sélection enregistrée ; avec
   * `toutSiAbsente`, cela veut dire « tout le lot ».
   */
  readonly enBase: readonly string[] | undefined;
  readonly editable: boolean;
  /** Préfixe des identifiants de cases : unique dans la page. */
  readonly cle: string;
  readonly onSelection: (ids: readonly string[]) => void;
  /** Ce qu'on lit quand la liste est vide. */
  readonly vide: string;
  /** Vrai quand « pas de sélection enregistrée » signifie « tout est servi ». */
  readonly toutSiAbsente?: boolean;
}) {
  const tous = elements.map((e) => e.id);
  const reference = enBase ?? (toutSiAbsente ? tous : []);
  const modifiee = !memeSelection(selection, reference);
  const toutCoche = selection.length === tous.length && tous.length > 0;

  if (elements.length === 0) {
    return <p className="text-muted-foreground mt-3 text-sm">{vide}</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium">
          {titre}
          {precision ? (
            <span className="text-muted-foreground font-normal"> — {precision}</span>
          ) : null}
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
              onClick={() => onSelection(toutCoche ? [] : tous)}
            >
              {toutCoche ? "Tout décocher" : "Tout cocher"}
            </Button>
          ) : null}
        </div>
      </div>

      <ul className="space-y-2">
        {elements.map((element) => {
          const id = `${cle}-${element.id}`;
          return (
            <li
              key={element.id}
              className="border-border flex items-start gap-3 rounded-lg border p-4"
            >
              <Checkbox
                id={id}
                className="mt-0.5"
                checked={selection.includes(element.id)}
                disabled={!editable}
                onCheckedChange={(v) =>
                  onSelection(
                    v === true
                      ? [...selection.filter((x) => x !== element.id), element.id]
                      : selection.filter((x) => x !== element.id),
                  )
                }
              />
              <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer space-y-0.5">
                <span className="block text-sm font-medium">{element.label}</span>
                {element.detail ? (
                  <span className="text-muted-foreground block text-xs">{element.detail}</span>
                ) : null}
              </label>
              {element.aDroite ? <div className="shrink-0">{element.aDroite}</div> : null}
            </li>
          );
        })}
      </ul>

      <p className="text-muted-foreground text-xs">
        {selection.length === 0
          ? "Aucun élément coché : l'apprenant n'en verra aucun. C'est un choix, pas un oubli — et il se conserve."
          : `${selection.length} sur ${tous.length} servi(s) à cette promotion.`}
      </p>
    </div>
  );
}

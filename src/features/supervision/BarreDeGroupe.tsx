/**
 * LA BARRE D'UN GROUPE — ce qu'un étudiant a fait d'un chapitre, en une marque
 * (11/09, proposé et retenu par Stef).
 *
 * POURQUOI ELLE EXISTE. Une case par acquis ne passe pas l'échelle : mesurée,
 * la grille des 331 connaissances faisait 5 257 px, soit quatre écrans. Le
 * motif — c'est lui qu'on regarde — n'y était plus. Une barre par chapitre
 * ramène les 331 colonnes à 23 marques, autour de mille pixels : la promotion
 * tient dans un écran, une ligne par étudiant.
 *
 * CE QU'ELLE MONTRE, ET CE QU'ELLE TAIT. Elle montre la RÉPARTITION des acquis
 * du chapitre entre les niveaux, du plus avancé à gauche au moins avancé à
 * droite, et laisse EN BLANC ce qui n'a pas été déclaré. Un chapitre que
 * personne n'a ouvert reste une piste vide sur toute la ligne — c'est le manque
 * qu'on cherche. Elle tait quel acquis précis manque : c'est le rôle du détail,
 * qu'un clic sur l'en-tête du groupe déplie.
 *
 * ⚠️ LE FILET DE 2 PX ENTRE SEGMENTS N'EST PAS DECORATIF. Les cinq niveaux sont
 * une rampe ordonnée, donc des teintes voisines ; collées, deux segments
 * adjacents se lisent comme un seul. Le filet de surface est l'encodage
 * secondaire qui rend la frontière visible même en vision des couleurs
 * déficiente.
 *
 * ⚠️ LE VIDE A SA PROPRE FORME — piste à bordure pointillée, jamais un segment
 * gris. « Non commencé » est une déclaration ; « rien déclaré » n'en est pas
 * une. Les peindre pareil ferait passer une promotion silencieuse pour une
 * promotion en retard, ce qui n'est pas la même conversation.
 */
import { MASTERY_LABELS_FR } from "@/domain/mastery";
import { MASTERY_ORDER } from "@/domain/types";
import type { MasteryLevel } from "@/domain/types";

const FOND: Record<MasteryLevel, string> = {
  not_started: "bg-muted",
  novice: "bg-amber-200 dark:bg-amber-900",
  intermediate: "bg-amber-500 dark:bg-amber-700",
  proficient: "bg-emerald-400 dark:bg-emerald-700",
  autonomous: "bg-emerald-700 dark:bg-emerald-500",
};

/** Du plus avancé au moins avancé : la barre se remplit par la gauche. */
const ORDRE_AFFICHAGE: readonly MasteryLevel[] = [...MASTERY_ORDER].reverse();

export type RepartitionGroupe = {
  /** Combien d'acquis à chaque niveau déclaré. */
  readonly parNiveau: ReadonlyMap<MasteryLevel, number>;
  /** Combien d'acquis sans aucune déclaration. */
  readonly sansDeclaration: number;
  readonly total: number;
};

export function repartitionDuGroupe(
  acquisIds: readonly string[],
  niveauDe: (outcomeId: string) => MasteryLevel | undefined,
): RepartitionGroupe {
  const parNiveau = new Map<MasteryLevel, number>();
  let sansDeclaration = 0;
  for (const id of acquisIds) {
    const niveau = niveauDe(id);
    if (niveau === undefined) sansDeclaration += 1;
    else parNiveau.set(niveau, (parNiveau.get(niveau) ?? 0) + 1);
  }
  return { parNiveau, sansDeclaration, total: acquisIds.length };
}

/** La phrase du survol : chiffrée, jamais un code. */
export function libelleRepartition(nom: string, groupe: string, r: RepartitionGroupe): string {
  const morceaux = ORDRE_AFFICHAGE.filter((n) => (r.parNiveau.get(n) ?? 0) > 0).map(
    (n) => `${r.parNiveau.get(n)} ${MASTERY_LABELS_FR[n].toLowerCase()}`,
  );
  if (r.sansDeclaration > 0) morceaux.push(`${r.sansDeclaration} sans déclaration`);
  return `${nom} — ${groupe} (${r.total}) : ${morceaux.join(", ")}`;
}

export function BarreDeGroupe({
  repartition,
  titre,
  largeur = 64,
}: {
  repartition: RepartitionGroupe;
  titre: string;
  largeur?: number | undefined;
}) {
  const { parNiveau, total } = repartition;
  return (
    <span
      className="border-border inline-flex h-3.5 items-stretch gap-[2px] overflow-hidden rounded-[3px] border border-dashed p-[1px] align-middle"
      style={{ width: largeur }}
      title={titre}
      aria-label={titre}
      role="img"
    >
      {ORDRE_AFFICHAGE.map((niveau) => {
        const combien = parNiveau.get(niveau) ?? 0;
        if (combien === 0) return null;
        return (
          <span
            key={niveau}
            className={`rounded-[2px] ${FOND[niveau]}`}
            style={{ flexGrow: combien, flexBasis: 0 }}
          />
        );
      })}
      {/* Le reste de la piste demeure vide : c'est ce qui n'a pas été déclaré. */}
      {repartition.sansDeclaration > 0 ? (
        <span style={{ flexGrow: repartition.sansDeclaration, flexBasis: 0 }} />
      ) : null}
      {total === 0 ? <span className="grow" /> : null}
    </span>
  );
}

/**
 * Le score de retard d'un étudiant, pour trier les lignes.
 *
 * UN ACQUIS NON DECLARE VAUT ZERO, et c'est voulu ici — contrairement à la
 * moyenne affichée dans la liste, qui ne porte que sur les déclarants. La
 * question n'est pas « à quel niveau se déclare-t-il » mais « où en est-il du
 * programme » : ne rien déclarer, c'est ne pas avancer.
 */
export function scoreAvancement(
  acquisIds: readonly string[],
  niveauDe: (outcomeId: string) => MasteryLevel | undefined,
): number {
  if (acquisIds.length === 0) return 0;
  let somme = 0;
  for (const id of acquisIds) {
    const niveau = niveauDe(id);
    if (niveau !== undefined) somme += MASTERY_ORDER.indexOf(niveau) + 1;
  }
  return somme / acquisIds.length;
}

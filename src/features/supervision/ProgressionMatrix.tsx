/**
 * LA MATRICE DE PROMOTION — une ligne par étudiant, TOUT le programme sur
 * cette ligne (11/09, refonte demandée par Stef).
 *
 * CE QU'ELLE REMPLACE, ET POURQUOI. La première version posait un tableau PAR
 * CHAPITRE : vingt-trois tableaux de dix colonnes, chacun exact, mais aucun ne
 * montrait la promotion. Or la question d'un encadrant devant vingt étudiants
 * n'est pas « où en est la promotion sur l'item 224 », c'est « qui décroche, et
 * sur quoi ». Cette question se lit sur UNE image, pas sur vingt-trois.
 *
 * D'OU LA FORME : une seule grille, les acquis rangés côte à côte dans l'ordre
 * des groupes, séparés par un filet. Les creux d'une ligne sautent aux yeux ;
 * les colonnes vides dénoncent un acquis que personne n'a travaillé.
 *
 * DEUX LIGNES D'EN-TETE, et elles ne disent pas la même chose. La première
 * porte le NOM DU GROUPE, étalé sur ses colonnes. La seconde porte une case
 * NEUTRE par acquis, dont le survol donne l'intitulé : à cette taille aucun
 * code ne tiendrait, et un code tronqué serait pire qu'une case muette.
 *
 * ⚠️ LA COULEUR NEUTRE DE L'EN-TETE EST UNE REGLE, PAS UN CHOIX GRAPHIQUE.
 * Une case d'en-tête ne décrit l'état de personne. Lui donner une couleur de
 * niveau ferait lire une valeur là où il n'y en a pas — et une valeur fausse en
 * tête de colonne contamine toute la colonne.
 *
 * POURQUOI UN `<table>` NATIF plutôt que le composant du design system : il faut
 * une PREMIERE COLONNE FIGEE au défilement horizontal (`sticky left-0`). Sans
 * elle, atteindre la centième connaissance fait perdre le nom de l'étudiant, et
 * une grille de pastilles sans nom ne veut plus rien dire.
 */
import type { ReactNode } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  ProgressionDot,
  libelleEtat,
  type EtatAcquis,
} from "@/features/supervision/ProgressionDot";
import { MASTERY_LABELS_FR } from "@/domain/mastery";
import { MASTERY_ORDER } from "@/domain/types";
import type { MasteryLevel } from "@/domain/types";

export type AcquisDeMatrice = {
  readonly id: string;
  readonly code: string;
  readonly label: string;
};

export type GroupeDeMatrice = {
  readonly id: string;
  readonly label: string;
  readonly acquis: readonly AcquisDeMatrice[];
};

export type EtudiantDeMatrice = {
  readonly enrollmentId: string;
  readonly nom: string;
};

export type MoyenneCohorte = {
  readonly niveau: MasteryLevel | undefined;
  readonly declarants: number;
  readonly total: number;
};

/**
 * L'AVANCEMENT MOYEN DE LA COHORTE sur un acquis.
 *
 * ⚠️ LA MOYENNE NE PORTE QUE SUR CEUX QUI ONT DECLARE, et le nombre de
 * déclarants est rendu avec elle. Compter un silence comme un zéro écraserait
 * la moyenne d'une promotion qui n'a simplement pas encore rempli son
 * passeport, et ferait lire un retard là où il n'y a qu'une absence de saisie.
 * Les deux informations sont données séparément ; elles ne se résument pas
 * l'une l'autre.
 */
export function moyenneCohorte(
  etudiants: readonly EtudiantDeMatrice[],
  outcomeId: string,
  etat: (enrollmentId: string, outcomeId: string) => EtatAcquis,
): MoyenneCohorte {
  let somme = 0;
  let declarants = 0;
  for (const e of etudiants) {
    const courant = etat(e.enrollmentId, outcomeId);
    if (courant.niveau === undefined) continue;
    somme += MASTERY_ORDER.indexOf(courant.niveau);
    declarants += 1;
  }
  if (declarants === 0) return { niveau: undefined, declarants: 0, total: etudiants.length };
  const index = Math.min(Math.round(somme / declarants), MASTERY_ORDER.length - 1);
  return { niveau: MASTERY_ORDER[index], declarants, total: etudiants.length };
}

export function PromotionHeatmap({
  groupes,
  etudiants,
  etat,
  onCase,
  enCours,
  taille = "sm",
}: {
  groupes: readonly GroupeDeMatrice[];
  etudiants: readonly EtudiantDeMatrice[];
  etat: (enrollmentId: string, outcomeId: string) => EtatAcquis;
  /** Absent = lecture seule (les connaissances ne se confirment pas). */
  onCase?: ((enrollmentId: string, outcomeId: string, etat: EtatAcquis) => void) | undefined;
  enCours?: boolean | undefined;
  taille?: "xs" | "sm" | undefined;
}) {
  const tous = groupes.flatMap((g) => g.acquis);
  if (tous.length === 0 || etudiants.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        {etudiants.length === 0
          ? "Aucun étudiant sur votre périmètre : la matrice apparaîtra dès la première inscription."
          : "Aucun acquis à suivre."}
      </p>
    );
  }

  const ecart = taille === "xs" ? "px-[1px]" : "px-[2px]";

  return (
    <div className="overflow-x-auto">
      <table className="w-max border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            <th scope="col" className="bg-card sticky left-0 z-10 px-2 py-1" />
            {groupes.map((g) => (
              <th
                key={g.id}
                scope="colgroup"
                colSpan={g.acquis.length}
                title={g.label}
                className="text-muted-foreground border-border max-w-[240px] truncate border-s px-1.5 pt-1 pb-0.5 text-start text-[11px] font-medium"
              >
                {g.label}
              </th>
            ))}
          </tr>
          <tr>
            <th
              scope="col"
              className="bg-card border-border sticky left-0 z-10 border-b px-2 pb-1.5 text-start text-[11px] font-medium"
            >
              Étudiant
            </th>
            {groupes.map((g) =>
              g.acquis.map((o, i) => (
                <th
                  key={o.id}
                  scope="col"
                  className={`border-border border-b pb-1.5 text-center ${ecart} ${i === 0 ? "border-s" : ""}`}
                >
                  <ProgressionDot
                    etat={{ confirme: false }}
                    neutre
                    taille={taille}
                    titre={`${o.code} — ${o.label}`}
                  />
                </th>
              )),
            )}
          </tr>
        </thead>
        <tbody>
          {etudiants.map((e) => (
            <tr key={e.enrollmentId}>
              <th
                scope="row"
                className="bg-card border-border sticky left-0 z-10 max-w-[200px] truncate border-b px-2 py-1 text-start text-[13px] font-normal"
                title={e.nom}
              >
                {e.nom}
              </th>
              {groupes.map((g) =>
                g.acquis.map((o, i) => {
                  const courant = etat(e.enrollmentId, o.id);
                  return (
                    <td
                      key={o.id}
                      className={`border-border border-b py-1 text-center ${ecart} ${i === 0 ? "border-s" : ""}`}
                    >
                      <ProgressionDot
                        etat={courant}
                        taille={taille}
                        titre={libelleEtat(courant, e.nom, `${o.code} ${o.label}`)}
                        disabled={enCours}
                        onClick={
                          onCase && courant.niveau !== undefined
                            ? () => onCase(e.enrollmentId, o.id, courant)
                            : undefined
                        }
                      />
                    </td>
                  );
                }),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * La liste en clair d'un groupe, avec l'avancement moyen de la cohorte.
 *
 * LA LISTE DONNE LES MOTS, LA MATRICE DONNE LE MOTIF. Aucune des deux ne
 * remplace l'autre : une grille de pastilles ne dit pas ce qu'est T1-03, et une
 * liste de soixante-quatre intitulés ne montre pas qui décroche.
 */
export function AcquisListe({
  acquis,
  moyenne,
  suffixe,
  contenu,
  badge,
}: {
  acquis: readonly AcquisDeMatrice[];
  /** Absent = pas de colonne d'avancement (aucun étudiant, par exemple). */
  moyenne?: ((id: string) => MoyenneCohorte) | undefined;
  suffixe?: ((id: string) => string | undefined) | undefined;
  /**
   * LE CONTENU SERVI AUX ETUDIANTS, déplié sous la ligne. Absent, la liste
   * reste une liste ; présent, chaque ligne devient dépliable.
   *
   * ⚠️ IL N'EST MONTE QU'A L'OUVERTURE. Radix démonte ce qui est fermé : sans
   * cela, une liste de trois cents acquis lancerait trois cents requêtes de
   * texte et autant de signatures d'URL vidéo.
   */
  contenu?: ((id: string) => ReactNode) | undefined;
  badge?: ((id: string) => ReactNode) | undefined;
}) {
  const ligne = (o: AcquisDeMatrice) => {
    const m = moyenne?.(o.id);
    return (
      <>
        {m ? (
          <span className="flex shrink-0 items-center gap-1.5 pt-0.5">
            <ProgressionDot
              etat={{ niveau: m.niveau, confirme: false }}
              titre={
                m.niveau === undefined
                  ? `${o.code} : aucune déclaration sur ${m.total} étudiant${m.total > 1 ? "s" : ""}`
                  : `${o.code} : niveau moyen ${MASTERY_LABELS_FR[m.niveau].toLowerCase()} sur ${m.declarants} déclarant${m.declarants > 1 ? "s" : ""} (${m.total} étudiant${m.total > 1 ? "s" : ""})`
              }
            />
            <span className="text-muted-foreground w-8 text-[11px] tabular-nums">
              {m.declarants}/{m.total}
            </span>
          </span>
        ) : null}
        <span className="min-w-0 text-start">
          <span className="text-muted-foreground font-mono text-[12px]">{o.code}</span> {o.label}
          {badge?.(o.id) ? <span className="ms-1.5 align-middle">{badge(o.id)}</span> : null}
          {suffixe?.(o.id) ? (
            <span className="text-muted-foreground text-[12px]"> {suffixe(o.id)}</span>
          ) : null}
        </span>
      </>
    );
  };

  if (!contenu) {
    return (
      <ul className="divide-border divide-y">
        {acquis.map((o) => (
          <li key={o.id} className="flex items-start gap-3 py-1.5 text-sm leading-snug">
            {ligne(o)}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <Accordion type="multiple" className="divide-border divide-y">
      {acquis.map((o) => (
        <AccordionItem key={o.id} value={o.id} className="border-0">
          <AccordionTrigger className="gap-3 py-1.5 text-sm leading-snug hover:no-underline">
            <span className="flex min-w-0 flex-1 items-start gap-3">{ligne(o)}</span>
          </AccordionTrigger>
          <AccordionContent className="pb-4">{contenu(o.id)}</AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}

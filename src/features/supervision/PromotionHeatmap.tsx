/**
 * LA MATRICE DE PROMOTION — une ligne par étudiant, deux niveaux de zoom
 * (11/09, refonte proposée et retenue par Stef).
 *
 * CE QU'ELLE REMPLACE, ET POURQUOI DEUX FOIS. La première version posait un
 * tableau PAR CHAPITRE : vingt-trois tableaux exacts, dont aucun ne montrait la
 * promotion. La deuxième mettait tout sur une ligne : mesurée, la grille des
 * 331 connaissances faisait 5 257 px, quatre écrans — le motif, qui est ce
 * qu'on vient chercher, n'y était plus.
 *
 * LA FORME RETENUE : par défaut UNE BARRE PAR CHAPITRE, ce qui ramène 331
 * colonnes à 23 marques, autour de mille pixels. Cliquer le nom d'un chapitre
 * le déplie en acquis individuels, DANS LA MEME GRILLE : on zoome là où il faut
 * sans perdre le reste de vue. Plusieurs chapitres peuvent être dépliés à la
 * fois.
 *
 * LE TRI PAR RETARD EST LE DEFAUT. Vingt lignes dans l'ordre alphabétique
 * noient exactement l'information qu'on est venu prendre. L'ordre alphabétique
 * reste à un clic : il sert quand on cherche UNE personne, pas un problème.
 *
 * ⚠️ LA COULEUR NEUTRE DE L'EN-TETE EST UNE REGLE, PAS UN CHOIX GRAPHIQUE. Une
 * case d'en-tête ne décrit l'état de personne. Lui donner une couleur de niveau
 * ferait lire une valeur là où il n'y en a pas — et une valeur fausse en tête
 * de colonne contamine toute la colonne.
 *
 * POURQUOI UN `<table>` NATIF plutôt que le composant du design system : il faut
 * une PREMIERE COLONNE FIGEE au défilement horizontal (`sticky left-0`). Sans
 * elle, atteindre le vingtième chapitre fait perdre le nom de l'étudiant, et
 * une grille de marques sans nom ne veut plus rien dire.
 */
import { useState } from "react";
import { ArrowDownWideNarrow } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  ProgressionDot,
  libelleEtat,
  type EtatAcquis,
} from "@/features/supervision/ProgressionDot";
import {
  BarreDeGroupe,
  libelleRepartition,
  repartitionDuGroupe,
  scoreAvancement,
} from "@/features/supervision/BarreDeGroupe";
import type { EtudiantDeMatrice, GroupeDeMatrice } from "@/features/supervision/ProgressionMatrix";

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
  const [detailles, setDetailles] = useState<readonly string[]>([]);
  const [triParRetard, setTriParRetard] = useState(true);

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
  const tousIds = tous.map((o) => o.id);

  /*
   * ⚠️ C'EST LE TITRE QUI FIXE LA LARGEUR DES COLONNES, PAS LA BARRE — mesuré
   * le 11/09 : avec des en-têtes à 150 px, les 23 chapitres faisaient encore
   * 3 770 px alors que les barres n'en demandaient que 1 500. Au-delà d'une
   * quinzaine de groupes on serre donc le titre à la largeur de la marque. Les
   * chapitres du DFASM s'appellent « Item 224 — … » : les premiers caractères
   * portent justement l'identifiant, et le survol donne le nom entier.
   */
  const serre = groupes.length > 14;
  const largeurTitre = serre ? "max-w-[74px]" : "max-w-[150px]";
  const largeurBarre = serre ? 60 : 72;

  /*
   * LE TRI PAR RETARD MET EN HAUT CEUX QU'ON CHERCHE. Vingt lignes dans l'ordre
   * alphabétique noient exactement l'information qu'on est venu prendre. Le
   * classement alphabétique reste à un clic : il sert quand on cherche UNE
   * personne, pas quand on cherche un problème.
   */
  const lignes = [...etudiants]
    .map((e) => ({
      ...e,
      score: scoreAvancement(tousIds, (id) => etat(e.enrollmentId, id).niveau),
    }))
    .sort((a, b) =>
      triParRetard
        ? a.score - b.score || a.nom.localeCompare(b.nom, "fr")
        : a.nom.localeCompare(b.nom, "fr"),
    );

  const estDetaille = (id: string) => detailles.includes(id);
  const basculer = (id: string) =>
    setDetailles((avant) => (avant.includes(id) ? avant.filter((x) => x !== id) : [...avant, id]));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-xs">
          Une barre par chapitre : remplie à gauche pour ce qui est acquis, laissée blanche pour ce
          qui n'a pas été déclaré. Cliquez le nom d'un chapitre pour voir ses acquis un par un.
        </p>
        <Button size="sm" variant="ghost" onClick={() => setTriParRetard((v) => !v)}>
          <ArrowDownWideNarrow className="size-4" aria-hidden />
          {triParRetard ? "Trié par retard" : "Trié par nom"}
        </Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-max border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th scope="col" className="bg-card sticky left-0 z-10 px-2 py-1" />
              {groupes.map((g) => (
                <th
                  key={g.id}
                  scope="colgroup"
                  colSpan={estDetaille(g.id) ? g.acquis.length : 1}
                  className="border-border border-s px-1.5 pt-1 pb-0.5 text-start align-bottom"
                >
                  <button
                    type="button"
                    onClick={() => basculer(g.id)}
                    title={`${g.label} — ${g.acquis.length} acquis`}
                    aria-expanded={estDetaille(g.id)}
                    className={`text-muted-foreground hover:text-foreground block truncate text-[11px] font-medium ${
                      estDetaille(g.id) ? "max-w-[220px]" : largeurTitre
                    }`}
                  >
                    {estDetaille(g.id) ? "▾ " : "▸ "}
                    {g.label}
                  </button>
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
                estDetaille(g.id) ? (
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
                  ))
                ) : (
                  <th
                    key={g.id}
                    scope="col"
                    className="text-muted-foreground border-border border-s border-b px-1.5 pb-1.5 text-center text-[10px] font-normal tabular-nums"
                  >
                    {g.acquis.length}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {lignes.map((e) => (
              <tr key={e.enrollmentId}>
                <th
                  scope="row"
                  className="bg-card border-border sticky left-0 z-10 max-w-[200px] truncate border-b px-2 py-1 text-start text-[13px] font-normal"
                  title={e.nom}
                >
                  {e.nom}
                </th>
                {groupes.map((g) =>
                  estDetaille(g.id) ? (
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
                    })
                  ) : (
                    <td
                      key={g.id}
                      className="border-border border-s border-b px-1.5 py-1 text-center"
                    >
                      {(() => {
                        const r = repartitionDuGroupe(
                          g.acquis.map((o) => o.id),
                          (id) => etat(e.enrollmentId, id).niveau,
                        );
                        return (
                          <BarreDeGroupe
                            repartition={r}
                            largeur={largeurBarre}
                            titre={libelleRepartition(e.nom, g.label, r)}
                          />
                        );
                      })()}
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

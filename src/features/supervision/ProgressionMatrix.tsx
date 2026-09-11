/**
 * LA MATRICE D'AVANCEMENT — étudiants en lignes, acquis en colonnes (11/09).
 *
 * CE QU'ELLE REMPLACE. L'écran précédent dépliait un étudiant à la fois et
 * listait sous lui TOUS les acquis du programme, déclarés ou non. Pour savoir
 * qui n'avait rien déclaré sur un geste donné, il fallait ouvrir chaque
 * étudiant et relire la même liste — la comparaison, qui est la seule question
 * que se pose un encadrant devant une promotion, n'était possible qu'en
 * mémoire.
 *
 * POURQUOI UN `<table>` NATIF plutôt que le composant `Table` du design system :
 * il faut une PREMIERE COLONNE FIGEE au défilement horizontal (`sticky left-0`).
 * Sans elle, faire défiler vers la vingtième compétence fait perdre le nom de
 * l'étudiant, et une grille de pastilles sans nom ne veut plus rien dire.
 *
 * LES EN-TETES PORTENT LE CODE, PAS LE LIBELLE. Un libellé de compétence fait
 * trois lignes ; trente libellés côte à côte rendraient la grille illisible. Le
 * libellé complet reste atteignable au survol et au lecteur d'écran, et la
 * liste au-dessus de chaque tableau le donne en clair.
 */
import { Fragment } from "react";
import {
  ProgressionDot,
  libelleEtat,
  type EtatAcquis,
} from "@/features/supervision/ProgressionDot";

export type AcquisDeMatrice = {
  readonly id: string;
  readonly code: string;
  readonly label: string;
};

export type EtudiantDeMatrice = {
  readonly enrollmentId: string;
  readonly nom: string;
};

export function ProgressionMatrix({
  acquis,
  etudiants,
  etat,
  onCase,
  enCours,
}: {
  acquis: readonly AcquisDeMatrice[];
  etudiants: readonly EtudiantDeMatrice[];
  etat: (enrollmentId: string, outcomeId: string) => EtatAcquis;
  /** Absent = matrice de lecture seule (les connaissances ne se confirment pas). */
  onCase?: ((enrollmentId: string, outcomeId: string, etat: EtatAcquis) => void) | undefined;
  enCours?: boolean | undefined;
}) {
  if (acquis.length === 0 || etudiants.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        {etudiants.length === 0
          ? "Aucun étudiant sur votre périmètre."
          : "Aucun acquis dans ce chapitre."}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-max border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            <th
              scope="col"
              className="bg-card sticky left-0 z-10 border-b border-border px-2 py-2 text-start font-medium"
            >
              Étudiant
            </th>
            {acquis.map((o) => (
              <th
                key={o.id}
                scope="col"
                title={o.label}
                className="text-muted-foreground border-b border-border px-1.5 py-2 text-center font-mono text-[11px] font-normal"
              >
                {o.code}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {etudiants.map((e) => (
            <tr key={e.enrollmentId}>
              <th
                scope="row"
                className="bg-card sticky left-0 z-10 max-w-[220px] truncate border-b border-border px-2 py-1.5 text-start font-normal"
                title={e.nom}
              >
                {e.nom}
              </th>
              {acquis.map((o) => {
                const courant = etat(e.enrollmentId, o.id);
                return (
                  <td key={o.id} className="border-b border-border px-1.5 py-1.5 text-center">
                    <ProgressionDot
                      etat={courant}
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
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * La liste en clair qui précède chaque matrice. Le tableau donne la vue
 * d'ensemble, cette liste donne les mots : sans elle, un code de compétence ne
 * se traduit qu'au survol, ce qui n'existe ni au doigt ni à l'impression.
 */
export function AcquisLegende({
  acquis,
  suffixe,
}: {
  acquis: readonly AcquisDeMatrice[];
  suffixe?: ((id: string) => string | undefined) | undefined;
}) {
  return (
    <ul className="grid gap-1.5 sm:grid-cols-2">
      {acquis.map((o) => (
        <li key={o.id} className="text-sm leading-snug">
          <span className="text-muted-foreground font-mono text-[12px]">{o.code}</span> {o.label}
          {suffixe?.(o.id) ? (
            <Fragment>
              {" "}
              <span className="text-muted-foreground text-[12px]">{suffixe(o.id)}</span>
            </Fragment>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

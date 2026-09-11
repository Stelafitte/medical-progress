/**
 * LES BRIQUES PARTAGEES DU SUIVI — les types de la matrice, la moyenne de
 * cohorte, et la liste en clair d'un groupe.
 *
 * La matrice elle-même vit dans `PromotionHeatmap.tsx` : elle porte un état
 * (chapitres dépliés, ordre de tri) et méritait son fichier.
 */
import type { ReactNode } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ProgressionDot, type EtatAcquis } from "@/features/supervision/ProgressionDot";
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

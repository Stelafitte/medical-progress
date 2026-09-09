import type { ReactNode } from "react";

import { RankBadge } from "@/components/rank-badge";
import { ReadAloudButton } from "@/features/resources/ReadAloudButton";
import { ordreDeLecture, type CourseSection } from "@/domain/courseSections";
import type { KnowledgeRank } from "@/domain/types";

/**
 * LE RENDU D'UN ENSEMBLE DE SECTIONS DU TEXTE 2026.
 *
 * UN SEUL ENDROIT POUR DEUX APPELANTS — le texte integral d'un chapitre et le
 * texte propre a un sous-item. Ce sont les memes sections, lues par deux
 * chemins ; leur donner deux rendus les ferait diverger a la premiere retouche,
 * et l'etudiant lirait le meme cours sous deux formes selon l'endroit d'ou il
 * vient.
 *
 * LE TITRE FAIT PARTIE DU TEXTE. L'ancien affichage (`learning_resource_texts`)
 * annoncait « 7 segment(s) — contenu integral du support » puis deroulait des
 * blocs de 4 000 caracteres coupes au milieu des phrases, sans un seul titre :
 * la structure du cours avait ete detruite a l'import de 2022. Les sections
 * 2026 la portent — numero, intitule, niveau — et c'est ce qui rend le texte
 * parcourable plutot que subi.
 */
export function CourseSectionsText({
  sections,
  compact = false,
}: {
  readonly sections: readonly CourseSection[];
  /** Sous un sous-item, le texte est deja un detail : on allege les titres. */
  readonly compact?: boolean;
}) {
  const ordonnees = ordreDeLecture(sections);
  /*
   * CE QU'ON DONNE A LIRE : le titre PUIS le texte de chaque section, dans
   * l'ordre de lecture. Sans les titres, l'auditeur perd la structure — c'est
   * precisement ce que l'ancien affichage 2022 ne pouvait pas offrir, faute de
   * titres. Les blocs sont deja de la bonne taille pour la synthese vocale.
   */
  const aLire = ordonnees.flatMap((section) =>
    section.titre === "" ? [section.contenu] : [section.titre, section.contenu],
  );
  return (
    <div className="space-y-4">
      <ReadAloudButton textes={aLire} />
      {ordonnees.map((section) => (
        <section key={section.sectionId} className="space-y-1.5">
          <TitreDeSection section={section} compact={compact} />
          <p className="whitespace-pre-wrap text-sm leading-relaxed">
            {avecRangs(section.contenu)}
          </p>
        </section>
      ))}
    </div>
  );
}

/**
 * TROIS NATURES DE SECTION SE DISENT DIFFEREMMENT, et c'est le livre qui le
 * demande, pas l'esthetique :
 *
 * - une `annexe` (Points cles, Entrainement) n'a PAS de numero — en afficher un
 *   vide laisserait un tiret orphelin devant l'intitule ;
 * - un `encadre` (« Pour comprendre ») porte dans `numero` la section HOTE et
 *   non la sienne : afficher ce numero ferait croire a une section a part
 *   entiere, alors que le livre l'imprime a l'interieur d'une autre ;
 * - une `section` et un `sous-item` s'annoncent normalement.
 */
function TitreDeSection({
  section,
  compact,
}: {
  readonly section: CourseSection;
  readonly compact: boolean;
}) {
  const avecNumero = section.kind === "section" || section.kind === "sous-item";
  const taille = compact ? "text-sm" : "text-base";
  if (section.titre === "") return null;
  return (
    <h4 className={`font-serif font-medium ${taille}`}>
      {avecNumero && section.numero !== "" ? (
        <span className="text-muted-foreground me-1.5 font-sans text-xs">{section.numero}</span>
      ) : null}
      {section.kind === "encadre" ? (
        <span className="text-muted-foreground me-1.5 font-sans text-xs uppercase">Encadré</span>
      ) : null}
      {section.titre}
    </h4>
  );
}

/**
 * LES MARQUEURS DE RANG, RENDUS EN BADGES.
 *
 * Repris tel quel de l'affichage precedent. **A savoir : le collage 2026 a
 * detruit la plupart des ~1 017 marqueurs `[Rang X]` du corps du cours** — seule
 * l'edition 2022 les portait tous. Le traitement est conserve parce qu'il ne
 * coute rien quand il n'y a rien a trouver, et qu'un marqueur survivant
 * s'afficherait sinon en texte brut, crochets compris, au milieu de la prose.
 *
 * LA REGEX EST VOLONTAIREMENT ETROITE : `[Rang X]` exactement, avec sa
 * majuscule. Elle ne peut donc pas avaler un crochet du cours.
 */
const MARQUEUR_RANG = /\[Rang ([ABC])\]/g;

function avecRangs(contenu: string): ReactNode[] {
  const morceaux: ReactNode[] = [];
  let curseur = 0;
  let trouve: RegExpExecArray | null;
  MARQUEUR_RANG.lastIndex = 0;
  while ((trouve = MARQUEUR_RANG.exec(contenu)) !== null) {
    if (trouve.index > curseur) morceaux.push(contenu.slice(curseur, trouve.index));
    morceaux.push(
      <RankBadge
        key={`${trouve.index}-${trouve[1]}`}
        rank={trouve[1] as KnowledgeRank}
        className="mx-1"
      />,
    );
    curseur = trouve.index + trouve[0].length;
  }
  if (curseur === 0) return [contenu];
  if (curseur < contenu.length) morceaux.push(contenu.slice(curseur));
  return morceaux;
}

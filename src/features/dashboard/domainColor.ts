import type { Outcome, OutcomeTheme, OutcomeThemeId } from "@/domain/types";

/**
 * LA COULEUR D'UN DOMAINE, DEFINIE UNE SEULE FOIS.
 *
 * REGLE : la teinte est derivee de l'IDENTIFIANT du domaine, jamais de son rang
 * dans une liste. Un hachage FNV-1a de l'`id` donne la case de depart ; deux
 * domaines qui tombent sur la meme case sont departages par un sondage
 * lineaire, le parcours se faisant sur les identifiants TRIES — jamais sur
 * l'ordre d'affichage. Reordonner, filtrer ou replier une liste ne change donc
 * aucune couleur.
 *
 * ⚠️ LA REGRESSION DU 08/09, ET SA CAUSE. Trois domaines sur quatre etaient
 * gris ardoise. Le hachage n'etait pas en cause : la fonction recevait les
 * TRENTE themes du programme — 22 chapitres de connaissances PLUS les
 * 8 domaines de competence — pour huit teintes seulement. Les huit premiers
 * identifiants tries prenaient les couleurs, les vingt-deux autres tombaient
 * sur le repli. Les domaines de competence, dont l'identifiant arrivait apres,
 * heritaient du gris. La correspondance se faisait donc bien sur l'identifiant,
 * mais sur le mauvais ENSEMBLE.
 *
 * LE CORRECTIF EST AUSSI LA REGLE DU SYSTEME : la teinte ne dit qu'une chose,
 * le DOMAINE DE COMPETENCE. Un chapitre de connaissances n'a jamais eu droit a
 * une couleur — il est en marine. On ne colore donc que les themes portant au
 * moins une competence. Ils sont huit, il y a huit teintes : plus aucun repli.
 *
 * AU-DELA DE HUIT DOMAINES DE COMPETENCE, la couleur reste neutre plutot que
 * reprise en boucle : deux domaines de la meme teinte mentiraient au lecteur.
 *
 * CE QUE CELA NE REGLE PAS : ajouter un neuvieme domaine peut deplacer une
 * teinte si le nouvel identifiant decale un sondage. Le correctif definitif est
 * de STOCKER l'indice (colonne `color_index` sur `outcome_themes`) — ecriture
 * en base, en attente de decision.
 *
 * La valeur rendue est une reference CSS, jamais un hexadecimal : elle suit le
 * theme sans que ce fichier connaisse le clair ni le sombre.
 */
const TEINTES = 8;

export const DOMAIN_NEUTRAL = "var(--d-neutral)";

/** FNV-1a 32 bits — court, stable, et sans dependance. */
function hacher(texte: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < texte.length; i += 1) {
    h ^= texte.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function buildDomainColors(
  themes: readonly OutcomeTheme[],
  outcomes: readonly Outcome[],
): ReadonlyMap<OutcomeThemeId, string> {
  /*
   * SEULS LES THEMES QUI PORTENT UNE COMPETENCE sont des domaines. Sans ce
   * filtre, les 22 chapitres de connaissances consomment les huit teintes et
   * les vrais domaines finissent en gris — le defaut du 08/09.
   */
  const domaines = new Set<OutcomeThemeId>();
  for (const outcome of outcomes) {
    if (outcome.nature === "knowledge" || outcome.themeId === undefined) continue;
    domaines.add(outcome.themeId);
  }

  const parIdentifiant = [...themes]
    .filter((theme) => domaines.has(theme.id))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const prises = new Set<number>();
  const couleurs = new Map<OutcomeThemeId, string>();
  for (const theme of parIdentifiant) {
    if (prises.size >= TEINTES) {
      couleurs.set(theme.id, DOMAIN_NEUTRAL);
      continue;
    }
    let case_ = hacher(theme.id) % TEINTES;
    while (prises.has(case_)) case_ = (case_ + 1) % TEINTES;
    prises.add(case_);
    couleurs.set(theme.id, `var(--d-${case_ + 1})`);
  }
  return couleurs;
}

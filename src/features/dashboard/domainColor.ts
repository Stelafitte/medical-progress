import type { OutcomeTheme, OutcomeThemeId } from "@/domain/types";

/**
 * LA COULEUR D'UN DOMAINE, DEFINIE UNE SEULE FOIS.
 *
 * REGLE : la teinte est derivee de l'IDENTIFIANT du domaine, jamais de son
 * rang dans une liste. Une premiere version classait les chapitres par
 * `position` et distribuait `--d-1` a `--d-8` dans cet ordre : inserer un
 * domaine en position 3 repeignait tous les suivants, et la meme competence
 * changeait de couleur d'une semaine a l'autre sans que rien ne le signale.
 *
 * COMMENT. Un hachage FNV-1a de l'`id` donne la case de depart. Deux domaines
 * peuvent tomber sur la meme case : on prend alors la case libre suivante. Le
 * parcours se fait sur les identifiants TRIES, jamais sur l'ordre d'affichage
 * — reordonner, filtrer ou replier une liste ne change donc aucune couleur.
 *
 * CE QUE CELA NE REGLE PAS, ET QU'IL FAUT SAVOIR : ajouter un neuvieme domaine
 * peut deplacer une teinte, si le nouvel identifiant s'intercale et deplace un
 * sondage. Le correctif definitif est de STOCKER l'indice de couleur (une
 * colonne `color_index` sur `outcome_themes`), ce qui est une ecriture en base
 * et attend une decision. En attendant, cette fonction tient la regle « meme
 * domaine, meme couleur, quel que soit l'affichage ».
 *
 * AU-DELA DE HUIT DOMAINES, la couleur est neutre plutot que reprise en
 * boucle : deux domaines de la meme teinte mentiraient au lecteur.
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
): ReadonlyMap<OutcomeThemeId, string> {
  const parIdentifiant = [...themes].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
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

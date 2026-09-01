/**
 * Ce qu'il faut savoir d'un document de corpus qui est un CHAPITRE — logique
 * de domaine pure, sans DOM ni réseau.
 *
 * Deux problèmes qui n'ont l'air de rien et qui coûtent le contenu si on les
 * ignore :
 *
 * 1. **Le rang R2C est porté par une IMAGE**, pas par du texte. Extraire le
 *    texte d'une page du référentiel de la SFC sans précaution efface les
 *    A/B/C — 1 017 marques sur les 22 chapitres, dont 649 dans le fil du cours,
 *    paragraphe par paragraphe. Un générateur de QCM ne saurait alors plus
 *    distinguer un passage de 2e cycle d'un passage de 3e.
 * 2. **Un chapitre parle d'un sujet que le programme connaît déjà.** Le
 *    document `chapitre-13-item-232-fibrillation-atriale.html` traite des 15
 *    connaissances rangées sous le thème « Item 232 — Fibrillation atriale ».
 *    Le rattachement est mécanique : il n'a pas à coûter un appel d'IA, et il
 *    n'a surtout pas à recréer des acquis qui existent.
 */

/* ------------------------------------------------------------------ */
/* 1. Conserver le rang porté par une image                            */
/* ------------------------------------------------------------------ */

/**
 * Remplace les images de rang par un marqueur textuel, AVANT toute extraction
 * de texte.
 *
 * On travaille sur la chaîne HTML plutôt que sur le DOM : c'est testable sans
 * navigateur, et le remplacement n'a pas besoin de comprendre la structure.
 *
 * L'attribut `alt` est le seul signal fiable — le nom du fichier varie d'un
 * chapitre à l'autre (`A.jpg`, `A_1.jpg`, `A_9.jpg`, `B_2.jpg`, `C_0.jpg`), et
 * s'appuyer dessus fait perdre des rangs sans prévenir.
 */
export function annotateRankImages(html: string): string {
  return html.replace(/<img\b[^>]*>/gi, (tag) => {
    const alt = /alt\s*=\s*"(?:\s*lettre\s*)([abc])\s*"/i.exec(tag);
    if (alt) return ` [Rang ${alt[1]!.toUpperCase()}] `;
    const src = /src\s*=\s*"[^"]*inline-images\/([ABC])(?:_\d+)?\.(?:jpg|png)"/i.exec(tag);
    if (src) return ` [Rang ${src[1]!.toUpperCase()}] `;
    return tag;
  });
}

/* ------------------------------------------------------------------ */
/* 2. Rattacher un document au thème dont il traite                    */
/* ------------------------------------------------------------------ */

export interface ThemeCandidate {
  readonly id: string;
  readonly label: string;
}

export interface ThemeMatch {
  readonly themeId: string;
  readonly label: string;
  /**
   * Comment le rapprochement a été trouvé. Affiché à l'écran : un rattachement
   * dont on ne peut pas dire POURQUOI il a été proposé ne se vérifie pas.
   */
  readonly via: "numéro d'item" | "libellé";
}

function deburr(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * Les numéros qui suivent le mot « item » dans un chemin.
 *
 * `chapitre-13-item-232-fibrillation-atriale.html` rend `[232]` et NON
 * `[13, 232]` : le 13 est le rang du chapitre dans l'ouvrage, et il ferait
 * matcher « Item 13 » d'un tout autre programme. Prendre tous les nombres d'un
 * nom de fichier est le moyen le plus sûr de se tromper de thème.
 */
export function itemNumbersIn(value: string): readonly number[] {
  const found: number[] = [];
  const re = /item[^0-9a-z]{0,3}(\d{1,4})/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(deburr(value))) !== null) found.push(Number(m[1]));
  return found;
}

const STOP_WORDS = new Set([
  "de",
  "du",
  "des",
  "la",
  "le",
  "les",
  "un",
  "une",
  "et",
  "ou",
  "a",
  "au",
  "aux",
  "chez",
  "sur",
  "dans",
  "chapitre",
  "item",
  "html",
  "htm",
  "page",
  "l",
  "d",
]);

function significantWords(value: string): Set<string> {
  return new Set(
    deburr(value)
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w)),
  );
}

/**
 * Le thème dont ce document traite, ou rien.
 *
 * Le numéro d'item l'emporte sur les mots : « Item 231 » et « Item 237 »
 * partagent « extrasystoles » et « Wolff-Parkinson-White », et un
 * rapprochement par mots seuls les confondrait.
 *
 * Rien n'est écrit sur la foi de cette fonction : l'écran montre le thème
 * proposé, la raison, et laisse corriger. Un rapprochement automatique qu'on
 * ne peut pas voir est un rapprochement qu'on ne peut pas démentir.
 */
export function matchDocumentToTheme(
  path: string,
  themes: readonly ThemeCandidate[],
): ThemeMatch | undefined {
  const numbers = itemNumbersIn(path);
  if (numbers.length > 0) {
    for (const theme of themes) {
      const themeNumbers = itemNumbersIn(theme.label);
      if (themeNumbers.some((n) => numbers.includes(n))) {
        return { themeId: theme.id, label: theme.label, via: "numéro d'item" };
      }
    }
  }

  // Repli par les mots. Exigeant à dessein : deux mots communs au moins, et un
  // écart net avec le deuxième candidat. Mieux vaut ne rien proposer qu'un
  // rattachement plausible et faux, qui serait validé d'un clic.
  const words = significantWords(path);
  const scored = themes
    .map((theme) => {
      const themeWords = significantWords(theme.label);
      let common = 0;
      for (const w of themeWords) if (words.has(w)) common += 1;
      return { theme, common };
    })
    .filter((s) => s.common >= 2)
    .sort((a, b) => b.common - a.common);

  const best = scored[0];
  if (!best) return undefined;
  const second = scored[1];
  if (second && second.common === best.common) return undefined;
  return { themeId: best.theme.id, label: best.theme.label, via: "libellé" };
}

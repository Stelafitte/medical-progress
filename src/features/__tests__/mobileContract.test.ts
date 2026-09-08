/**
 * Contrats de portabilité smartphone vérifiés au niveau source :
 * navigation mobile explicite, absence de largeur fixe bloquante,
 * zones tactiles suffisantes et action de retour au profil par défaut.
 */
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");

const shell = read("src/components/layout/app-shell.tsx");
const programSwitcher = read("src/components/program-switcher.tsx");
const stageLogBook = read("src/features/stage/StageLogBook.tsx");
const mediaSection = read("src/features/administration/MediaLibrarySection.tsx");
const stageLogWeek = read("src/features/stage/StageLogWeek.tsx");

describe("navigation mobile", () => {
  it("expose un menu latéral déclenché par un bouton accessible", () => {
    expect(shell).toContain("Ouvrir le menu de navigation");
    expect(shell).toContain('aria-label="Navigation mobile"');
  });

  it("permet de changer de programme depuis le menu mobile", () => {
    expect(shell).toContain('<ProgramSwitcher variant="full" />');
  });
});

describe("sélecteur de programme", () => {
  it("n'impose plus une largeur fixe incompatible avec 360 px", () => {
    expect(programSwitcher).not.toContain('className="w-[15rem] bg-card"');
    expect(programSwitcher).toContain("min-w-0");
    expect(programSwitcher).toContain("sm:w-[15rem]");
  });
});

describe("zones tactiles", () => {
  it("garantit une hauteur de cible suffisante dans la navigation", () => {
    expect(shell).toContain("min-h-11");
  });

  it("empile les actions du carnet de stage sur mobile", () => {
    expect(stageLogBook).toContain("flex-col gap-2 sm:flex-row");
    expect(stageLogBook).toContain("w-full gap-2 sm:w-auto");
  });

  /**
   * Le carnet de la semaine est l'ecran le plus contraint de la V1 : il est
   * concu pour un telephone, en service. Deux invariants seulement, mais ils
   * decident de son usage.
   */
  it("garde la case a cocher sur la ligne fermee, sans debordement", () => {
    // Un geste par jour : la case est sur la ligne, jamais au fond d'un
    // depliant -- meme regle que la liste du Passeport.
    expect(stageLogWeek).toContain("flex items-start gap-3");
    // Lecon du 04/09 : sans `min-w-0`, un libelle long pousse la ligne et fait
    // deborder la page horizontalement.
    expect(stageLogWeek).toContain("min-w-0");
  });
});

describe("retour au profil de démonstration par défaut", () => {
  it("propose une action explicite de réinitialisation", () => {
    expect(shell).toContain("resetDemoSession");
    expect(shell).toContain("Revenir au profil par défaut");
  });
});

describe("médiathèque responsive", () => {
  it("prévoit une variante non tabulaire pour les petits écrans", () => {
    expect(/md:hidden|sm:hidden|hidden md:|hidden sm:/.test(mediaSection)).toBe(true);
  });
});

/**
 * LES API QUE LE TELEPHONE DE LA V1 NE CONNAIT PAS.
 *
 * MESURE LE 08/09 SUR LE TERRAIN REEL. `crypto.randomUUID()`, ajoute au
 * televersement de la photo de profil, a rendu « crypto.randomUUID is not a
 * function » a la premiere tentative depuis l'iPhone de Stef. Cette API demande
 * Safari 15.4 ou plus recent. Le grep qui a suivi a trouve un second cas du
 * meme millesime — `Array.prototype.at`, arrive dans la MEME version de Safari
 * — sur l'ecran de pilotage, qui plantait donc lui aussi sans que personne ne
 * l'ait remarque.
 *
 * POURQUOI CE TEST BALAIE TOUT `src`, ET NON UNE LISTE DE FICHIERS. Les autres
 * contrats de ce fichier visent des ecrans nommes, parce qu'ils portent sur une
 * mise en page. Celui-ci porte sur une INCOMPATIBILITE DE PLATEFORME : elle peut
 * apparaitre dans n'importe quel fichier, et elle ne se voit ni au typage ni au
 * developpement — seulement sur le telephone, en production, devant un
 * utilisateur. Un contrat qui ne couvrirait que les fichiers deja connus
 * laisserait passer le prochain.
 *
 * CE N'EST PAS UNE LISTE D'INTERDITS ARBITRAIRE : chaque entree a coute une
 * panne constatee. Le jour ou le parc telephone aura bouge, on retirera des
 * lignes — en le mesurant, pas en le supposant.
 */
const INTERDITS: ReadonlyArray<{ readonly motif: string; readonly raison: string }> = [
  { motif: "crypto.randomUUID", raison: "Safari 15.4+ — panne constatee le 08/09" },
  { motif: ".at(-", raison: "Array.prototype.at : Safari 15.4+, meme seuil" },
];

function fichiersSources(dossier: string): readonly string[] {
  const trouves: string[] = [];
  for (const entree of readdirSync(new URL(`../../../${dossier}`, import.meta.url), {
    withFileTypes: true,
  })) {
    const chemin = `${dossier}/${entree.name}`;
    if (entree.isDirectory()) {
      // Les tests eux-memes tournent sous Node, jamais dans le navigateur.
      if (entree.name === "__tests__") continue;
      trouves.push(...fichiersSources(chemin));
    } else if (/\.tsx?$/.test(entree.name) && !entree.name.endsWith(".test.ts")) {
      trouves.push(chemin);
    }
  }
  return trouves;
}

describe("API disponibles sur le telephone de la V1", () => {
  it("n'utilise aucune API absente d'un Safari anterieur a 15.4", () => {
    const fautifs: string[] = [];
    for (const chemin of fichiersSources("src")) {
      const contenu = read(chemin);
      for (const { motif, raison } of INTERDITS) {
        if (contenu.includes(motif)) fautifs.push(`${chemin} : ${motif} (${raison})`);
      }
    }
    expect(fautifs).toEqual([]);
  });
});

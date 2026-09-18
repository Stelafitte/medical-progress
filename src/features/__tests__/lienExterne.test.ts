import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("support réduit à un lien externe, côté étudiant (18/09)", () => {
  it("l'adresse voyage de la base jusqu'au support", () => {
    const access = read("src/infrastructure/supabase/supabaseDataAccess.ts");
    expect(access).toContain("...(row.external_url ? { externalUrl: row.external_url } : {})");
    expect(read("src/features/resources/ResourcesView.tsx")).toContain(
      "externalUrl: resource.externalUrl",
    );
  });

  it("s'ouvre dans un nouvel onglet, sans exposer la page d'origine", () => {
    const row = read("src/features/resources/KnowledgeRow.tsx");
    expect(row).toContain('target="_blank"');
    expect(row).toContain('rel="noopener noreferrer"');
  });

  it("n'est plus compté parmi les textes du chapitre", () => {
    const view = read("src/features/resources/ResourcesView.tsx");
    expect(view).toContain('s.format !== "link" && !s.externalUrl');
    expect(view).toContain("<ExternalLinkSupport key={lien.id} support={lien} />");
  });
});

describe("« Télécharger ce cours » (18/09)", () => {
  const bouton = read("src/features/resources/TelechargerCours.tsx");
  const lecteur = read("public/lecteur-autonome/lecteur/app.js");
  const page = read("public/lecteur-autonome/index.html");

  it("assemble le ZIP dans le navigateur, sans recompresser les médias", () => {
    expect(bouton).toContain('import { zipSync } from "fflate"');
    expect(bouton).toContain("zipSync(fichiers, { level: 0 })");
    expect(bouton).toContain('queryKey: ["narrated-deck-playback", resourceId]');
  });

  it("le lecteur autonome s'ouvre en file:// : ni module, ni fetch", () => {
    expect(page).not.toContain('type="module"');
    expect(page).toContain('<script src="manifest.js"></script>');
    expect(lecteur).not.toMatch(/\bfetch\(/);
    expect(lecteur).not.toMatch(/^import /m);
  });

  it("joue le clip s'il existe, affiche le filigrane nominatif", () => {
    expect(lecteur).toContain("slide.videoUrl");
    expect(lecteur).toContain("Copie personnelle de ");
  });

  it("est proposé sur l'écran de lecture de l'étudiant", () => {
    expect(read("src/features/resources/NarratedReaderView.tsx")).toContain(
      "<TelechargerCours resourceId={deck.mediaId} title={deck.title} />",
    );
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const dir = "src/features/administration/";

describe("écrans professionnels repliables (Stef, 18/09)", () => {
  it("le panneau et le sous-bloc se replient sans perdre une saisie", () => {
    const kit = read("src/features/professional/mock-ui.tsx");
    expect(kit).toContain("export function SubBlock(");
    expect(kit).toContain("hidden={!open}");
    expect(kit).toContain("aria-expanded={open}");
  });

  it("le Concepteur replie ses quatre étapes et leurs sous-blocs", () => {
    const concepteur = read(`${dir}AdminProgramDesigner.tsx`);
    expect(concepteur.match(/\bcollapsible\b/g)?.length).toBeGreaterThanOrEqual(4);
    expect(concepteur.match(/<SubBlock/g)?.length).toBeGreaterThanOrEqual(7);
    expect(concepteur).not.toContain("<fieldset");
  });

  it("Connaissances et Compétences replient tout ; Compétences sur une colonne", () => {
    for (const f of ["AdminKnowledgeBase.tsx", "AdminCompetencies.tsx"]) {
      const src = read(`${dir}${f}`);
      expect(src.match(/<PanelCard\s*\n?\s*collapsible|<PanelCard collapsible/g)?.length).toBe(
        src.match(/<PanelCard\b/g)?.length,
      );
    }
    expect(read(`${dir}AdminCompetencies.tsx`)).not.toContain("md:grid-cols-2");
  });

  it("les signaux du pilotage restent, repliés, avec leur compte", () => {
    const pilote = read(`${dir}AdminProgramPilot.tsx`);
    expect(pilote).toContain('title="Signaux à traiter"');
    expect(pilote).toContain("{cohortAlerts.length} signal(aux)");
  });

  it("la communication sépare et colore les trois populations", () => {
    const com = read(`${dir}CommunicationDirectorySection.tsx`);
    for (const teinte of ["bg-sky-500", "bg-emerald-500", "bg-amber-500"]) {
      expect(com).toContain(teinte);
    }
  });
});

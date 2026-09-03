/**
 * Contrats UI vérifiés au niveau source (pas de rendu DOM dans cette
 * itération) : terminologie, ordre de navigation et absence de fausse
 * opération de sécurité.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { learnerNavFor } from "@/components/layout/navigation";

const read = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");

const passportView = read("src/features/passport/PassportView.tsx");
const passportRoute = read("src/routes/espace.passeport.tsx");
const resourcesRoute = read("src/routes/espace.ressources.tsx");
const profileView = read("src/features/profile/ProfileView.tsx");
const security = read("src/features/profile/AccountSecuritySection.tsx");
const visibility = read("src/features/profile/PassportVisibilitySection.tsx");
const shell = read("src/components/layout/app-shell.tsx");

describe("terminologie", () => {
  const rootRoute = read("src/routes/__root.tsx");
  const homeRoute = read("src/routes/index.tsx");

  it("n'utilise plus l'ancien nom « Passeport Éducatif Médical »", () => {
    for (const file of [passportView, passportRoute, profileView, shell, rootRoute, homeRoute]) {
      expect(file).not.toContain("Passeport Éducatif Médical");
    }
  });

  it("nomme la fonctionnalité « Mon Passeport Éducatif » (nom officiel)", () => {
    expect(passportView).toContain('title="Mon Passeport Éducatif"');
    expect(passportRoute).toContain('{ title: "Mon Passeport Éducatif — Campus Santé Augmenté" }');
  });

  it("réserve le nom global « Campus Santé Augmenté » au shell et à la racine", () => {
    for (const file of [shell, rootRoute, homeRoute]) {
      expect(file).toContain("Campus Santé Augmenté");
    }
  });

  it("conserve le nom global de la plateforme dans le shell et les métadonnées", () => {
    expect(shell).toContain("Campus Santé Augmenté");
    expect(rootRoute).toContain(
      '{ title: "Campus Santé Augmenté — Formation, compétences et développement professionnel" }',
    );
    expect(rootRoute).toContain("Formation, compétences et développement professionnel");
    expect(shell).toContain("Formation, compétences et développement professionnel");
  });

  it("définit les métadonnées de la route Mes ressources théoriques", () => {
    expect(resourcesRoute).toContain(
      '{ title: "Mes ressources théoriques — Campus Santé Augmenté" }',
    );
    expect(resourcesRoute).toContain('{ name: "robots", content: "noindex" }');
  });
});

describe("navigation", () => {
  const navigation = read("src/components/layout/navigation.ts");

  it("expose les repères apprenant dans l'ordre validé", () => {
    const order = [
      ...navigation.matchAll(
        /label: "(Mon Passeport Éducatif|Mes ressources|Mes compétences|Mon carnet de stage|Mes statistiques|Mes messages|Mon profil)"/g,
      ),
    ].map((m) => m[1]);
    expect(order.slice(0, 7)).toEqual([
      "Mon Passeport Éducatif",
      "Mes ressources",
      "Mes compétences",
      "Mon carnet de stage",
      "Mes statistiques",
      "Mes messages",
      "Mon profil",
    ]);
  });

  it("garde « Mes compétences » toujours visible et conditionne le carnet de stage", () => {
    const withoutPlacements = learnerNavFor({ placementsEnabled: false });
    expect(withoutPlacements.some((e) => e.to === "/espace/competences")).toBe(true);
    expect(withoutPlacements.some((e) => e.to === "/espace/stage")).toBe(false);
    const withPlacements = learnerNavFor({ placementsEnabled: true });
    expect(withPlacements.some((e) => e.to === "/espace/stage")).toBe(true);
  });

  it("expose le profil et les messages dans le bandeau apprenant", () => {
    const nav = learnerNavFor({ placementsEnabled: true });
    for (const to of ["/espace/profil", "/espace/messages", "/espace/progression"]) {
      expect(nav.some((e) => e.to === to)).toBe(true);
    }
  });

  it("regroupe le passeport en connaissances théoriques et compétences", () => {
    expect(passportView).toContain('{ value: "knowledge", label: "Connaissances théoriques" }');
    expect(passportView).toContain('{ value: "competence", label: "Compétences" }');
    expect(passportView).not.toContain('label: "Compétences — simulées"');
    expect(passportView).not.toContain('label: "Compétences — réelles"');
  });

  it("dérive les espaces visibles des rôles contextualisés", () => {
    for (const helper of [
      "canAccessLearnerSpace",
      "canAccessSupervision",
      "canAccessProgramAdministration",
      "canAccessPlatformAdministration",
    ]) {
      expect(navigation).toContain(helper);
    }
    expect(shell).toContain("navSpacesFor");
  });
});

describe("profil — sécurité non active", () => {
  it("n'expose aucune saisie ni stockage de mot de passe", () => {
    expect(security).not.toContain('type="password"');
    expect(security).not.toContain("localStorage");
    expect(security).not.toContain("sessionStorage");
  });

  it("désactive chaque action et affiche l'état explicite", () => {
    expect(security).toContain("disabled");
    expect(security).toContain("Disponible après activation du compte");
    for (const label of [
      "Authentification à deux facteurs",
      "Changement de mot de passe",
      "Mot de passe oublié et récupération",
      "Sessions actives et révocation",
    ]) {
      expect(security).toContain(label);
    }
  });
});

describe("profil — présentation du passeport", () => {
  it("limite les préférences au partage et à l'export personnels", () => {
    expect(visibility).toContain("Partage et export personnels");
    expect(visibility).toContain("dossier institutionnel");
    expect(visibility).toContain("Démonstration — non enregistré");
    expect(visibility).not.toContain("localStorage");
  });

  it("propose les huit contrôles de partage demandés", () => {
    for (const label of [
      "Connaissances",
      "Compétences simulées",
      "Compétences réelles",
      "Preuves",
      "Validations",
      "Expériences de stage",
      "Historique",
      "Prochains jalons",
    ]) {
      expect(visibility).toContain(label);
    }
  });
});

describe("passeport — trois vues", () => {
  /**
   * CONTRAT MIS A JOUR LE 03/09, sur decision de Stef : **Calendrier, puis
   * Gantt, puis Kanban** — du plus proche du temps vecu au plus proche de
   * l'etat d'avancement — et **la Liste retiree**. Elle rendait les 368 acquis
   * a plat, la ou les trois autres vues disent la meme chose en les regroupant
   * (par jalon pour le Calendrier et le Gantt, par chapitre pour le Kanban).
   *
   * CE TEST VERIFIE L'ORDRE, pas seulement la presence : l'ordre EST la
   * decision. Une version qui proposerait les trois vues dans le desordre
   * passerait un test de simple presence sans respecter ce qui a ete demande.
   */
  it("propose Calendrier, Gantt et Kanban, dans cet ordre, et plus la Liste", () => {
    const positions = ["Calendrier", "Gantt", "Kanban"].map((label) =>
      passportView.indexOf(`label: "${label}"`),
    );
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(passportView).not.toContain(`label: "Liste"`);
  });
});

/**
 * Contrats UI vérifiés au niveau source (pas de rendu DOM dans cette
 * itération) : terminologie, ordre de navigation et absence de fausse
 * opération de sécurité.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");

const passportView = read("src/features/passport/PassportView.tsx");
const passportRoute = read("src/routes/espace.passeport.tsx");
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

  it("utilise « Mon Passeport Éducatif » dans la page et ses métadonnées", () => {
    expect(passportView).toContain('title="Mon Passeport Éducatif"');
    expect(passportRoute).toContain('{ title: "Mon Passeport Éducatif" }');
  });

  it("conserve le nom global de la plateforme dans le shell et les métadonnées", () => {
    expect(shell).toContain("Mon Passeport Éducatif");
    expect(rootRoute).toContain('{ title: "Mon Passeport Éducatif" }');
    expect(rootRoute).toContain('{ property: "og:title", content: "Mon Passeport Éducatif" }');
  });
});

describe("navigation", () => {
  const navigation = read("src/components/layout/navigation.ts");

  it("place Ressources immédiatement avant Stage dans l'espace apprenant", () => {
    const order = [
      ...navigation.matchAll(
        /label: "(Tableau de bord|Passeport|Ressources|Stage)"/g,
      ),
    ].map((m) => m[1]);
    expect(order).toEqual(["Tableau de bord", "Passeport", "Ressources", "Stage"]);
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

describe("passeport — quatre vues", () => {
  it("propose Liste, Kanban, Gantt et Calendrier", () => {
    for (const label of ["Liste", "Kanban", "Gantt", "Calendrier"]) {
      expect(passportView).toContain(`label: "${label}"`);
    }
  });
});

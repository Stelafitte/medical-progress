/**
 * Contrats UI de l'écran Communications, vérifiés au niveau source :
 * assistant en 5 étapes, transversalité des programmes, blocages, contrôle des
 * données sensibles, gouvernance, absence totale d'envoi réel, exigences
 * mobiles et accessibilité de base.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");

const ui = read("src/features/administration/AdminCommunications.tsx");
const route = read("src/routes/espace.administration.communications.tsx");
const store = read("src/application/communicationStore.ts");
const snapshot = read("src/application/communicationSnapshot.ts");
const fixtures = read("src/infrastructure/mock/communicationFixtures.ts");

describe("accès et périmètre", () => {
  it("réserve l'écran à l'administration du programme", () => {
    expect(route).toContain("session.canAccessProgramAdministration");
    expect(route).toContain("<AccessRestricted");
    expect(route).toContain('{ name: "robots", content: "noindex" }');
  });

  it("dérive le périmètre depuis la session et l'annuaire, sans programme codé en dur", () => {
    expect(ui).toContain("buildActorScope");
    expect(ui).toContain("selectProgramDirectory(directory, session.activeProgram.id)");
    for (const forbidden of ["DIU d'Écho", "DFASM Cardiologie", "HVG–Amylose"]) {
      expect(ui.includes(forbidden), `programme codé en dur : ${forbidden}`).toBe(false);
    }
  });

  it("utilise des modèles transversaux (programId null)", () => {
    expect(fixtures).toContain("programId: null");
  });
});

describe("assistant en cinq étapes", () => {
  it("expose les cinq étapes dans l'ordre imposé", () => {
    expect(ui).toContain('"Destinataires"');
    expect(ui).toContain('"Message"');
    expect(ui).toContain('"Programmation"');
    expect(ui).toContain('"Aperçu et contrôle"');
    expect(ui).toContain('"Préparation finale"');
    expect(ui).toContain("Étape précédente");
    expect(ui).toContain("Étape suivante");
    expect(ui).toContain('aria-current={index === step ? "step" : undefined}');
  });
});

describe("destinataires", () => {
  it("propose les huit types d'audience du domaine", () => {
    for (const kind of [
      "program_all",
      "cohort",
      "group",
      "persons",
      "contextual_role",
      "milestone_incomplete",
      "overdue",
      "dynamic_filter",
    ]) {
      expect(ui).toContain(`${kind}:`);
    }
  });

  it("affiche la résolution, les exclusions et les doublons", () => {
    expect(ui).toContain("resolution.recipientCount");
    expect(ui).toContain("resolution.optedOut.length");
    expect(ui).toContain("resolution.duplicatesRemoved.length");
    expect(ui).toContain("resolution.outOfScope.length");
    expect(ui).toContain("resolution.withdrawn.length");
  });

  it("propose une liste nominative repliable", () => {
    expect(ui).toContain("<details");
    expect(ui).toContain("Liste nominative des destinataires simulés");
    expect(ui).toContain("resolution.recipients.map");
  });

  it("bloque l'étape si l'audience est vide ou hors périmètre", () => {
    expect(ui).toContain("step === 0 && resolution.blocking");
    expect(ui).toContain("Étape bloquée : audience vide ou personnes hors périmètre.");
  });
});

describe("message", () => {
  it("permet modèle validé ou message libre et insère les variables autorisées", () => {
    expect(ui).toContain("communicationTemplates.map");
    expect(ui).toContain("ALLOWED_VARIABLES.map");
    expect(ui).toContain("Insérer");
  });

  it("prévisualise deux destinataires et bloque un contenu invalide", () => {
    expect(ui).toContain("previews.slice(0, 2)");
    expect(ui).toContain("previews.some((p) => !p.valid)");
    expect(ui).toContain("Étape bloquée : variable inconnue, non résolue ou contenu invalide.");
  });

  it("propose un lien de ressource sans pièce jointe réelle", () => {
    expect(ui).toContain("aucune pièce jointe réelle");
  });
});

describe("données sensibles", () => {
  it("analyse le sujet et le corps et impose une relecture humaine", () => {
    expect(ui).toContain("scanPatientData(subject, body)");
    expect(ui).toContain("PATIENT_SCAN_DISCLAIMER_FR");
    expect(ui).toContain("Une vérification humaine reste obligatoire.");
    expect(ui).toContain("J'ai relu humainement le contenu");
  });
});

describe("programmation", () => {
  it("couvre les déclenchements simulés du domaine", () => {
    for (const kind of [
      "immediate",
      "at",
      "recurring",
      "before_due",
      "after_overdue",
      "on_step_open",
      "on_enrollment",
    ]) {
      expect(ui).toContain(`${kind}:`);
    }
  });

  it("impose le fuseau horaire et une date future via les contrôles du domaine", () => {
    expect(ui).toContain('"trigger_time_zone"');
    expect(ui).toContain('"future_schedule"');
    expect(ui).toContain("Fuseau horaire (obligatoire)");
  });
});

describe("gouvernance et préparation", () => {
  it("affiche la checklist complète issue de canApproveCampaign", () => {
    expect(ui).toContain("canApproveCampaign");
    expect(ui).toContain("approval.checks.map");
    expect(ui).toContain("approval.blockingReasons.map");
  });

  it("exige une confirmation collective explicite au-delà d'un destinataire", () => {
    expect(ui).toContain("resolution.recipientCount > 1");
    expect(ui).toContain("Je confirme une communication collective");
  });

  it("n'autorise la préparation qu'après approbation et relecture humaine", () => {
    expect(ui).toContain("approval.canApprove && humanValidated");
    expect(ui).toContain("disabled={!canPrepare}");
    expect(ui).toContain("Préparer la campagne (simulation)");
  });

  it("propose uniquement une prévisualisation pour l'auteur", () => {
    expect(ui).toContain("Prévisualiser pour moi");
    expect(ui).toContain("Aucun e-mail et aucune notification ne sont émis par cet aperçu.");
  });
});

describe("historique local", () => {
  it("consigne les campagnes préparées en mémoire de session, annulables", () => {
    expect(ui).toContain("addPreparedCampaign");
    expect(ui).toContain("usePreparedCampaigns");
    expect(ui).toContain("cancelPreparedCampaign");
    expect(ui).toContain("préparé, non expédié");
    expect(store).toContain("useSyncExternalStore");
    expect(store).not.toContain("sessionStorage");
    expect(store).not.toContain("localStorage");
  });
});

describe("absence d'envoi réel", () => {
  it("ne contient aucun appel réseau ni fournisseur de messagerie", () => {
    for (const source of [ui, store, snapshot, fixtures]) {
      for (const forbidden of [
        "fetch(",
        "XMLHttpRequest",
        "WebSocket",
        "nodemailer",
        "sendMail",
        "createServerFn",
        "supabase",
      ]) {
        expect(source.includes(forbidden), `interdit : ${forbidden}`).toBe(false);
      }
    }
  });

  it("annonce explicitement les limites de simulation", () => {
    expect(ui).toContain("Simulé — aucun envoi");
    expect(ui).toContain("aucun appel réseau");
    expect(ui).toContain("perdu au rechargement");
  });
});

describe("mobile et accessibilité", () => {
  it("garantit des cibles tactiles de 44 px et des libellés associés", () => {
    expect(ui).toContain('const TOUCH = "min-h-11"');
    expect(ui).toContain("<Label htmlFor=");
    expect(ui).toContain('aria-label="Étapes de l\'assistant"');
    expect(ui).toContain('aria-live="polite"');
    expect(ui).toContain('role="alert"');
  });

  it("reste lisible en une colonne sur petit écran", () => {
    expect(ui).toContain("sm:grid-cols-2");
    expect(ui).toContain("flex-wrap");
  });
});

/**
 * Contrats UI de l'assistant d'implémentation d'un DPC, vérifiés au
 * niveau source : accès réservé, six étapes, marqueurs « simulé », séparation
 * audits / QCM, exigences mobiles et accessibilité de base.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");

const wizard = read("src/features/administration/DpcProgramWizard.tsx");
const wizardRoute = read("src/routes/espace.administration.assistant-dpc.tsx");
const dpcRoute = read("src/routes/espace.administration.dpc.tsx");
const draftModel = read("src/domain/dpcProgramDraft.ts");

describe("accès", () => {
  it("réserve l'assistant au coordinateur ou administrateur du programme", () => {
    expect(wizardRoute).toContain("session.canAccessProgramAdministration");
    expect(wizardRoute).toContain("<AccessRestricted");
    expect(wizardRoute).toContain('{ name: "robots", content: "noindex" }');
  });

  it("expose une action visible « Implémenter un programme DPC » sans perturber la consultation", () => {
    expect(dpcRoute).toContain("Importer et implémenter un programme DPC");
    expect(dpcRoute).toContain('to="/espace/administration/assistant-dpc"');
    expect(dpcRoute).toContain("<DpcProgrammeSection />");
  });
});

describe("étapes", () => {
  it("rend les cinq étapes du modèle", () => {
    expect(wizard).toContain("DPC_WIZARD_STEPS.map");
    for (const id of [
      "source_documents",
      "proposed_extraction",
      "audit_configuration",
      "assessment_separation",
      "publication_check",
    ]) {
      expect(wizard).toContain(`stepId === "${id}"`);
    }
  });

  it("expose la navigation d'étapes au clavier et à l'assistive technology", () => {
    expect(wizard).toContain('aria-label="Étapes de l\'assistant"');
    expect(wizard).toContain('aria-current={current ? "step" : undefined}');
    expect(wizard).toContain("Étape précédente");
    expect(wizard).toContain("Étape suivante");
  });
});

describe("marqueurs simulés", () => {
  it("annonce l'extraction simulée et la publication simulée", () => {
    expect(draftModel).toContain(
      '"Analyse documentaire simulée — validation du coordinateur requise"',
    );
    expect(wizard).toContain("DPC_SIMULATED_EXTRACTION_NOTICE_FR");
    expect(wizard).toContain("DPC_SIMULATED_UPLOAD_NOTICE_FR");
    expect(wizard).toContain("Ouvrir cette implémentation (simulé)");
    expect(wizard).toContain('label="Ouverture simulée"');
    expect(wizard).not.toContain("Publier (simulé)");
  });

  it("n'effectue aucun envoi réseau", () => {
    expect(wizard).not.toContain("fetch(");
    expect(wizard).not.toContain("FormData");
    expect(wizard).not.toContain("XMLHttpRequest");
  });
});

describe("séparation des évaluations", () => {
  it("distingue explicitement audits de pratiques et QCM", () => {
    expect(wizard).toContain("Audits de pratiques sur dossiers");
    expect(wizard).toContain("Tests de connaissances par QCM");
    expect(wizard).toContain("documentKindConflict");
    expect(wizard).toContain("canAssignKind");
  });

  it("bloque la publication depuis le modèle et non depuis l'interface seule", () => {
    expect(wizard).toContain("disabled={!readiness.canPublish}");
    expect(wizard).toContain("publicationReadiness");
  });

  it("déclare la validation médicale comme un acte humain", () => {
    expect(wizard).toContain("dpc-medical-validated");
    expect(wizard).toContain("validation humaine, non\n                automatisable");
  });
});

describe("valeurs non codées en dur", () => {
  it("n'impose ni 10 dossiers, ni 29 critères, ni 4 parties, ni 2 tours", () => {
    for (const forbidden of ["= 10", "= 29", "recordsPerRound: 10", "rounds: 2"]) {
      expect(wizard).not.toContain(forbidden);
    }
    expect(wizard).toContain("recordsExpectedForRound");
  });
});

describe("portabilité et accessibilité", () => {
  it("garantit des cibles tactiles d'au moins 44 px", () => {
    expect(wizard).toContain('const touch = "min-h-11"');
    expect(wizard).toContain("${touch}");
  });

  it("empile les commandes sur mobile", () => {
    expect(wizard).toContain("flex-col gap-2 sm:flex-row");
    expect(wizard).toContain("w-full sm:w-auto");
    expect(wizard).not.toContain("w-[");
  });

  it("associe un libellé à chaque champ de saisie", () => {
    const inputs = wizard.match(/<Input\b/g) ?? [];
    const labels = wizard.match(/<Label\b/g) ?? [];
    expect(inputs.length).toBeGreaterThan(5);
    expect(labels.length).toBeGreaterThanOrEqual(inputs.length);
  });

  it("signale les erreurs autrement que par la couleur", () => {
    expect(wizard).toContain('role="alert"');
    expect(wizard).toContain("Classement refusé.");
    expect(wizard).toContain("Bloquant :");
  });

  it("replie les listes longues de critères", () => {
    expect(wizard).toContain("Collapsible");
    expect(wizard).toContain("Voir les parties et critères");
  });

  it("programme un calendrier d'implémentation aux composants optionnels", () => {
    expect(wizard).toContain("Tous les composants sont optionnels.");
    expect(wizard).toContain("Ajouter un composant");
    expect(wizard).toContain("Modalité de formation");
    expect(wizard).toContain("Lieu de la séance");
    expect(wizard).toContain("Documents à consulter en ligne");
    expect(wizard).toContain('type="datetime-local"');
    expect(wizard).toContain("Calendrier ordonné");
  });

  it("n'annonce jamais d'envoi réel pour la visioconférence", () => {
    expect(wizard).toContain("aucun lien réel dans la maquette");
  });
});

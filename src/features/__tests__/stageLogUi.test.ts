/**
 * Contrats UI du carnet de stage vérifiés au niveau source :
 * bannière de sécurité, checklist obligatoire, absence de stockage réel,
 * cloisonnement des vues de validation et de réception.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");

const photoDialog = read("src/features/stage/StageLogPhotoDialog.tsx");
const book = read("src/features/stage/StageLogBook.tsx");
const review = read("src/features/stage/StageLogReviewSection.tsx");
const adminTemplates = read("src/features/administration/StageLogTemplatesSection.tsx");
const domain = read("src/domain/stageLog.ts");

describe("messages de sécurité", () => {
  it("affiche la bannière de cadrage dans le carnet et la boîte de dialogue", () => {
    expect(book).toContain("PHOTO_BANNER_FR");
    expect(photoDialog).toContain("PHOTO_BANNER_FR");
    expect(domain).toContain(
      "Ne photographiez que le fragment demandé. En cas de doute, utilisez la saisie manuelle.",
    );
  });

  it("énumère la règle absolue sur les identifiants patient", () => {
    for (const term of ["date de naissance", "IPP/NIP", "code-barres", "QR code"]) {
      expect(photoDialog).toContain(term);
    }
  });

  it("ne présente jamais la photo comme anonymisée", () => {
    expect(domain).toContain("aucune anonymisation n'est garantie");
    expect(photoDialog).toContain("PHOTO_NO_GUARANTEE_FR");
    expect(photoDialog).not.toContain("anonymisée avec succès");
  });
});

describe("checklist et déclaration", () => {
  it("rend la checklist du domaine et la déclaration obligatoire", () => {
    expect(photoDialog).toContain("PHOTO_CHECKLIST.map");
    expect(photoDialog).toContain("PHOTO_DECLARATION_FR");
  });

  it("désactive la pièce jointe tant que la décision du domaine est négative", () => {
    expect(photoDialog).toContain("evaluatePhotoAttach");
    expect(photoDialog).toContain("disabled={!decision.allowed}");
    expect(photoDialog).toContain("if (!requirement || !decision.allowed) return;");
  });
});

describe("absence de stockage réel", () => {
  it("n'utilise ni input file, ni URL d'image, ni stockage local", () => {
    for (const file of [photoDialog, book]) {
      expect(file).not.toContain('type="file"');
      expect(file).not.toContain("URL.createObjectURL");
      expect(file).not.toContain("localStorage");
      expect(file).not.toContain("<img");
    }
    expect(photoDialog).toContain("buildPlaceholderAttachment");
  });
});

describe("droits et visibilité simulés", () => {
  it("réserve « Carnets à valider » aux validateurs de leurs propres stages", () => {
    expect(review).toContain("supervisorPersonId === person.id");
    expect(review).toContain("if (!isValidator) return null;");
    expect(review).toContain("listLogsToValidate");
  });

  it("limite « Carnets reçus » au programme actif et à une transmission interne", () => {
    expect(review).toContain("listLogsReceived(activeProgram.id)");
    expect(review).toContain("aucun carnet n'est envoyé en pièce jointe par e-mail");
  });

  it("expose la configuration des photos autorisées côté administration", () => {
    expect(adminTemplates).toContain("Modèles de carnets de stage");
    expect(adminTemplates).toContain("Photos autorisées");
    expect(adminTemplates).toContain("Durée de conservation");
    expect(adminTemplates.replace(/\s+/g, " ")).toContain(
      "aucune option ne permet de demander un document intégral",
    );
  });
});

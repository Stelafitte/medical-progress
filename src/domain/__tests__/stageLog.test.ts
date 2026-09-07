import { describe, expect, it } from "vitest";
import {
  PHOTO_CHECKLIST,
  PHOTO_RETENTION_TBD_FR,
  buildPlaceholderAttachment,
  canDeriveAcquisitionFromPhoto,
  evaluatePhotoAttach,
  isEntryComplete,
  isPhotoAllowed,
  nextStageLogStatus,
  templatesForContext,
  type StageLogEntry,
} from "@/domain/stageLog";
import { stageLogTemplates, stageLogs } from "@/infrastructure/mock/stageLogFixtures";

const diu = stageLogTemplates.find((t) => t.programId === "prog-diu-echo")!;
const dfasm = stageLogTemplates.find((t) => t.programId === "prog-dfasm-cardio")!;
const allKeys = PHOTO_CHECKLIST.map((i) => i.key);

describe("configuration par programme", () => {
  it("sert les deux programmes avec le même moteur et des configurations distinctes", () => {
    expect(templatesForContext(stageLogTemplates, { programId: "prog-diu-echo" })).toEqual([diu]);
    expect(templatesForContext(stageLogTemplates, { programId: "prog-dfasm-cardio" })).toEqual([
      dfasm,
    ]);
    expect(diu.fields.map((f) => f.key)).toContain("exam_type");
    expect(dfasm.fields.map((f) => f.key)).toContain("clinical_situation");
  });

  it("respecte l'activation par cohorte", () => {
    expect(
      templatesForContext(stageLogTemplates, {
        programId: "prog-diu-echo",
        cohortId: "coh-inconnue",
      }),
    ).toEqual([]);
    // Liste de cohortes vide = toutes les cohortes du programme.
    expect(
      templatesForContext(stageLogTemplates, {
        programId: "prog-dfasm-cardio",
        cohortId: "coh-dfasm-2026",
      }),
    ).toEqual([dfasm]);
  });

  it("ignore un modèle désactivé", () => {
    const disabled = { ...diu, enabled: false };
    expect(templatesForContext([disabled], { programId: "prog-diu-echo" })).toEqual([]);
  });

  it("n'expose aucun champ patient nominatif", () => {
    const labels = [...diu.fields, ...dfasm.fields].map((f) => f.label.toLowerCase());
    for (const forbidden of ["nom", "prénom", "naissance", "ipp", "dossier", "séjour"]) {
      expect(labels.some((l) => l.split(/\s|'/).includes(forbidden))).toBe(false);
    }
  });
});

describe("objet de photo imposé", () => {
  it("prévoit la photo pour les deux carnets, sur un fragment autorisé", () => {
    expect(isPhotoAllowed(diu)).toBe(true);
    expect(isPhotoAllowed(dfasm)).toBe(true);
    expect(diu.photoPolicy.allowedObjects.map((o) => o.label)).toContain(
      "Conclusion du compte rendu d'échocardiographie",
    );
    const dfasmLabels = dfasm.photoPolicy.allowedObjects.map((o) => o.label);
    expect(dfasmLabels).toContain("Histoire de la maladie (HDM)");
    expect(dfasmLabels).toContain("Conclusion de l'observation de l'étudiant");
    expect(dfasm.photoPolicy.allowedObjects.some((o) => o.custom)).toBe(true);
  });

  it("refuse un objet hors liste du modèle", () => {
    const decision = evaluatePhotoAttach(diu, {
      requirementId: "phr-dfasm-hdm",
      checked: allKeys,
      declarationConfirmed: true,
      currentPhotoCount: 0,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reasons.join(" ")).toContain("objet de photo autorisé");
  });

  it("refuse toute photo si le modèle n'active pas la section", () => {
    const noPhoto = { ...diu, photoPolicy: { ...diu.photoPolicy, enabled: false } };
    expect(isPhotoAllowed(noPhoto)).toBe(false);
    expect(
      evaluatePhotoAttach(noPhoto, {
        requirementId: "phr-diu-conclusion",
        checked: allKeys,
        declarationConfirmed: true,
        currentPhotoCount: 0,
      }).allowed,
    ).toBe(false);
  });

  it("borne le nombre de photos défini par la politique", () => {
    expect(
      evaluatePhotoAttach(dfasm, {
        requirementId: "phr-dfasm-hdm",
        checked: allKeys,
        declarationConfirmed: true,
        currentPhotoCount: dfasm.photoPolicy.maxPhotosPerEntry,
      }).allowed,
    ).toBe(false);
  });

  it("documente une conservation à définir avant backend", () => {
    expect(diu.photoPolicy.retentionPolicyLabel).toBe(PHOTO_RETENTION_TBD_FR);
    expect(diu.photoPolicy.automaticCheck).toBe("not_active");
  });
});

describe("checklist et déclaration obligatoires", () => {
  it("impose les cinq points de la checklist", () => {
    expect(allKeys).toEqual([
      "no_name",
      "no_birth_date",
      "no_record_identifier",
      "no_barcode",
      "framing_limited",
    ]);
    expect(
      evaluatePhotoAttach(diu, {
        requirementId: "phr-diu-conclusion",
        checked: allKeys.slice(0, 4),
        declarationConfirmed: true,
        currentPhotoCount: 0,
      }).allowed,
    ).toBe(false);
  });

  it("interdit de joindre sans la déclaration explicite", () => {
    const decision = evaluatePhotoAttach(diu, {
      requirementId: "phr-diu-conclusion",
      checked: allKeys,
      declarationConfirmed: false,
      currentPhotoCount: 0,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reasons.join(" ")).toContain("absence de tout élément nominatif");
  });

  it("autorise uniquement checklist complète + déclaration + objet autorisé", () => {
    expect(
      evaluatePhotoAttach(diu, {
        requirementId: "phr-diu-conclusion",
        checked: allKeys,
        declarationConfirmed: true,
        currentPhotoCount: 0,
      }),
    ).toEqual({ allowed: true, reasons: [] });
  });
});

describe("absence de stockage réel", () => {
  it("ne produit qu'un placeholder de démonstration, sans anonymisation garantie", () => {
    const photo = buildPlaceholderAttachment(
      diu.photoPolicy.allowedObjects[0]!,
      "2026-08-17T10:00:00Z",
    );
    expect(photo.storage).toBe("mock_placeholder");
    expect(photo.automaticCheck).toBe("not_active");
    expect(photo.declaredNoIdentifiers).toBe(true);
    expect(photo.placeholderName).not.toMatch(/^https?:/);
    expect(JSON.stringify(stageLogs)).not.toMatch(/https?:\/\//);
  });

  it("n'autorise jamais de déduction d'acquisition depuis une photo", () => {
    expect(canDeriveAcquisitionFromPhoto()).toBe(false);
  });
});

describe("complétude d'une entrée", () => {
  const entry = (values: Record<string, string>): StageLogEntry => ({
    id: "sle-test",
    createdAt: "2026-08-17T10:00:00Z",
    provenance: { sourceSystem: "native" },
    stageLogId: "slog-test",
    templateId: dfasm.id,
    occurredAt: "2026-08-17T10:00:00Z",
    narrative: "",
    values,
    photos: [],
  });

  it("exige les champs obligatoires du modèle", () => {
    expect(isEntryComplete(dfasm, entry({ clinical_situation: "Dyspnée" }))).toBe(false);
    expect(
      isEntryComplete(
        dfasm,
        entry({
          clinical_situation: "Dyspnée",
          acts: "ECG",
          reasoning: "Hypothèse d'insuffisance cardiaque.",
          autonomy: "réalisation supervisée",
        }),
      ),
    ).toBe(true);
  });
});

describe("workflow de validation", () => {
  const learner = ["learner"] as const;
  const supervisor = ["placement_supervisor"] as const;
  const admin = ["administrator"] as const;

  it("suit brouillon → soumis → validé → transmis", () => {
    expect(nextStageLogStatus("draft", "submit", learner)).toBe("submitted");
    expect(nextStageLogStatus("submitted", "validate", supervisor)).toBe("validated");
    expect(nextStageLogStatus("validated", "transmit", admin)).toBe("transmitted");
  });

  it("permet le retour « à corriger » puis une nouvelle soumission", () => {
    expect(nextStageLogStatus("submitted", "request_revision", supervisor)).toBe("needs_revision");
    expect(nextStageLogStatus("needs_revision", "submit", learner)).toBe("submitted");
  });

  it("interdit à l'apprenant de valider ou de transmettre son propre carnet", () => {
    expect(nextStageLogStatus("submitted", "validate", learner)).toBeNull();
    expect(nextStageLogStatus("validated", "transmit", learner)).toBeNull();
    expect(nextStageLogStatus("validated", "transmit", supervisor)).toBeNull();
  });

  it("laisse valider un carnet resté en brouillon, puisque l'étudiant ne soumet rien", () => {
    // Décision du 07/09 : plus de soumission. Exiger « soumis » rendait la
    // validation inatteignable — aucun geste ne faisait plus passer le carnet
    // dans cet état.
    expect(nextStageLogStatus("draft", "validate", supervisor)).toBe("validated");
    expect(nextStageLogStatus("draft", "request_revision", supervisor)).toBe("needs_revision");
    expect(nextStageLogStatus("draft", "validate", learner)).toBeNull();
  });

  it("interdit les transitions hors séquence", () => {
    expect(nextStageLogStatus("transmitted", "validate", supervisor)).toBeNull();
    expect(nextStageLogStatus("transmitted", "submit", learner)).toBeNull();
  });
});

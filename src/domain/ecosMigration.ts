/**
 * Préparation de l'intégration SÉLECTIVE du moteur ECOS historique.
 *
 * Ce module ne contient AUCUN code, secret, requête ou fonction du projet
 * source : uniquement un inventaire déclaratif des modules constatés, les
 * décisions de migration et les frontières d'adaptation.
 */
import type { IsoDateTime, OutcomeId, ProgramId } from "@/domain/types";

/** Identifiant documentaire du projet source (référence, jamais un appel). */
export const LEGACY_SOURCE_SYSTEM = "dfasm-learnhub";
export const LEGACY_SOURCE_PROJECT_ID = "e3860f5b-091d-4d36-ae37-c2899be8ecdd";

export type LegacyModuleCategory = "screen" | "domain" | "component" | "function";

export const LEGACY_CATEGORY_LABELS_FR: Record<LegacyModuleCategory, string> = {
  screen: "Écran",
  domain: "Domaine",
  component: "Composant",
  function: "Fonction serveur",
};

export type MigrationDecision = "keep" | "adapt" | "replace";

export const MIGRATION_DECISION_LABELS_FR: Record<MigrationDecision, string> = {
  keep: "Conserver",
  adapt: "Adapter",
  replace: "Remplacer",
};

export type MigrationStatus = "inventoried" | "mapped" | "adapted" | "tested" | "blocked";

export const MIGRATION_STATUS_LABELS_FR: Record<MigrationStatus, string> = {
  inventoried: "Inventorié",
  mapped: "Référentiels mappés",
  adapted: "Adapté",
  tested: "Testé",
  blocked: "Bloqué",
};

export interface LegacyModuleInventoryItem {
  readonly id: string;
  readonly category: LegacyModuleCategory;
  /** Nom du module tel que constaté dans le projet source. */
  readonly sourceModule: string;
  readonly decision: MigrationDecision;
  /** Destination dans ce socle (module cible, jamais un chemin du legacy). */
  readonly destination: string;
  readonly status: MigrationStatus;
  readonly note: string;
}

/** Étapes du workflow de migration sélective (aucun import réel). */
export type MigrationStepKey = "inventory" | "map" | "adapt" | "test" | "import";

export interface MigrationStep {
  readonly key: MigrationStepKey;
  readonly label: string;
  readonly description: string;
  readonly done: boolean;
}

export const MIGRATION_STEPS: readonly MigrationStep[] = [
  {
    key: "inventory",
    label: "Inventorier",
    description: "Recenser écrans, domaines, composants et fonctions du moteur historique.",
    done: true,
  },
  {
    key: "map",
    label: "Mapper référentiels / compétences",
    description: "Relier chaque scénario aux Outcome du programme cible.",
    done: true,
  },
  {
    key: "adapt",
    label: "Adapter",
    description: "Réécrire la configuration, les rôles et la production de preuves.",
    done: false,
  },
  {
    key: "test",
    label: "Tester",
    description: "Recette fonctionnelle hors ligne, sans appel temps réel ni coût.",
    done: false,
  },
  {
    key: "import",
    label: "Importer",
    description: "Import sélectif tracé — non disponible : aucun couplage runtime.",
    done: false,
  },
];

export type EcosMode = "text" | "voice" | "text_and_voice";

export const ECOS_MODE_LABELS_FR: Record<EcosMode, string> = {
  text: "Texte",
  voice: "Vocal",
  text_and_voice: "Texte et vocal",
};

export interface EcosGradingCriterion {
  readonly label: string;
  readonly weight: number;
  readonly outcomeId?: OutcomeId;
}

export interface EcosScenarioMock {
  readonly id: string;
  readonly programId: ProgramId;
  readonly title: string;
  readonly patientProfile: string;
  readonly instructions: string;
  readonly durationMinutes: number;
  readonly mode: EcosMode;
  readonly outcomeIds: readonly OutcomeId[];
  readonly grading: readonly EcosGradingCriterion[];
  readonly debriefSummary: string;
  readonly status: "mock" | "to_adapt";
  readonly legacySourceId?: string;
  readonly updatedAt: IsoDateTime;
}

/**
 * Règle non négociable : une performance ECOS produit une preuve de
 * COMPÉTENCE SIMULÉE. Elle ne peut jamais valider une compétence réelle
 * sans validation humaine explicite.
 */
export const ECOS_EVIDENCE_RULE_FR =
  "Une performance ECOS alimente une compétence simulée, jamais une compétence réelle sans validation humaine.";

export interface EcosEvidenceProjection {
  readonly evidenceKind: "simulation";
  readonly outcomeNature: "simulated_competence";
  readonly status: "submitted";
  readonly selfDeclared: false;
  readonly requiresHumanValidationForRealCompetence: true;
}

/** Projection déterministe d'un résultat ECOS en preuve (maquette). */
export function projectEcosResultToEvidence(): EcosEvidenceProjection {
  return {
    evidenceKind: "simulation",
    outcomeNature: "simulated_competence",
    status: "submitted",
    selfDeclared: false,
    requiresHumanValidationForRealCompetence: true,
  };
}

export function inventoryProgress(items: readonly LegacyModuleInventoryItem[]): {
  readonly total: number;
  readonly byDecision: Record<MigrationDecision, number>;
  readonly blocked: number;
} {
  return {
    total: items.length,
    byDecision: {
      keep: items.filter((i) => i.decision === "keep").length,
      adapt: items.filter((i) => i.decision === "adapt").length,
      replace: items.filter((i) => i.decision === "replace").length,
    },
    blocked: items.filter((i) => i.status === "blocked").length,
  };
}

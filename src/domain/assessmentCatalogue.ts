/**
 * LE CATALOGUE DES MODALITÉS D'ÉVALUATION — ce parmi quoi on choisit.
 *
 * POURQUOI CE FICHIER EXISTE (14/09).
 *
 * Le « Concepteur de programme » ne proposait, à l'étape « Évaluations », que
 * les modalités DÉJÀ créées pour le programme. Six lignes, à cocher ou
 * décocher. Concevoir, c'est choisir parmi ce qui est possible ; l'écran
 * n'offrait que ce qui était déjà là, et aucune des dix-huit formes ouvertes
 * le matin même — KFP, mini-DP, ECOS en présentiel, TCS, DOPS — n'y figurait.
 *
 * Ce catalogue est donc le MENU. Cocher une entrée crée la modalité dans le
 * programme ; la décocher la sort du parcours sans la supprimer. La création
 * d'une modalité SUR MESURE, elle, reste dans l'onglet « Évaluations » — un
 * catalogue ne remplace pas ce qu'un programme invente pour lui-même.
 *
 * CE QUE CE CATALOGUE N'EST PAS. Une prescription. Les formats sont ceux que
 * la deuxième partie du deuxième cycle emploie couramment ; les intitulés et
 * les usages sont un point de départ que chaque programme corrige. Rien ici
 * n'est écrit en base tant que personne n'a coché.
 *
 * CE QU'IL NE CONTIENT PAS, ET POURQUOI. Le format `ai_oral` (« Évaluation
 * orale par IA ») existe dans le vocabulaire mais n'a AUCUNE entrée ici.
 * L'interaction vocale du hub est une simulation assumée — le panneau
 * s'intitule « Interaction vocale (simulée) » et son seul bouton s'appelle
 * « Simuler la prise de parole ». Proposer cette modalité reviendrait à
 * promettre à l'étudiant une épreuve qui n'existe pas. L'entrée reviendra
 * le jour où la voix sera réelle.
 */
import {
  ASSESSMENT_MODE_LABELS_FR,
  ASSESSMENT_SUBTYPE_LABELS_FR,
  ASSESSMENT_USAGE_LABELS_FR,
  type AssessmentModality,
  type AssessmentMode,
  type AssessmentSubtype,
  type AssessmentUsage,
} from "@/domain/assessmentModality";
import type { AssociationItem } from "@/domain/outcomeAssociation";

export interface CatalogueEntry {
  /** Clé stable : elle sert d'identifiant de ligne tant que rien n'est créé. */
  readonly key: string;
  /** Intitulé proposé. C'est lui qui fait le rapprochement avec l'existant. */
  readonly name: string;
  readonly subtype: AssessmentSubtype;
  readonly mode: AssessmentMode;
  readonly usage: AssessmentUsage;
  readonly notes: string;
}

/** Préfixe des identifiants de ligne non encore créés en base. */
export const CATALOGUE_ID_PREFIX = "catalogue:";

export const CATALOGUE_MODALITES: readonly CatalogueEntry[] = [
  /* ------------------------- Ce que l'étudiant fait seul ------------------ */
  {
    key: "qcm-entrainement",
    name: "QCM d'entraînement",
    subtype: "qcm",
    mode: "online",
    usage: "self_assessment",
    notes: "Ouvert en continu, corrigé automatiquement, sans trace au dossier.",
  },
  {
    key: "tcs-entrainement",
    name: "TCS d'entraînement",
    subtype: "tcs",
    mode: "online",
    usage: "self_assessment",
    notes: "Concordance de script : confronter son raisonnement à celui d'experts.",
  },
  /*
   * UNE SEULE ENTRÉE POUR LE DOSSIER PROGRESSIF D'ENTRAÎNEMENT (Stef, 17/09).
   * Le catalogue en proposait deux — « Cas cliniques progressifs » (`dp`,
   * auto-évaluation) et « Mini-dossier progressif » (`mini_dp`, formative) —
   * pour une seule réalité et une seule banque. Cochées toutes les deux, elles
   * servaient les mêmes dossiers sous deux cartes dans « Mes évaluations ».
   *
   * Ce qui reste est le format réel des 21 dossiers importés le 16/09
   * (`question_cases.kind = 'mini_dp'`), en AUTO-ÉVALUATION : l'entraînement
   * libre ne retient rien contre l'étudiant.
   */
  {
    key: "mini-dp",
    name: "Mini-dossier progressif",
    subtype: "mini_dp",
    mode: "online",
    usage: "self_assessment",
    notes: "Mobilisation progressive des connaissances et génération d'hypothèses.",
  },
  /*
   * L'ECOS SIMULÉ EST UNE AUTO-ÉVALUATION (Stef, 16/09) : « il n'y aura pas
   * d'ECOS simulé en ECOS de fin de stage, les ECOS de fin de stage sont en
   * présentiel ». Il était rangé sous « Examen de validation », donc invisible
   * dans le paragraphe Auto-évaluation du Concepteur — alors que ses stations
   * s'affichaient déjà chez l'apprenant. La migration 20260916120000 reclasse
   * de la même façon les lignes déjà créées en base.
   */
  {
    key: "ecos-simule",
    name: "ECOS simulé",
    subtype: "ecos",
    mode: "online",
    usage: "self_assessment",
    notes:
      "Stations jouées dans ChatGPT, hors présentiel ; l'étudiant rapporte sa grille. L'équipe choisit les stations offertes à la promotion.",
  },

  /* ------------------------- Ce qu'on lui demande ------------------------- */
  {
    key: "journal-de-stage",
    name: "Journal de stage",
    subtype: "portfolio",
    mode: "online",
    usage: "formative",
    notes: "Traçabilité des situations rencontrées et réflexivité.",
  },
  {
    key: "kfp-formative",
    name: "KFP de mi-stage",
    subtype: "kfp",
    mode: "in_person",
    usage: "formative",
    notes: "Questions à éléments clés : ce qui change la décision, rien d'autre.",
  },
  {
    key: "mini-cex",
    name: "Mini-CEX au lit du malade",
    subtype: "mini_cex",
    mode: "in_person",
    usage: "formative",
    notes: "Rencontre clinique observée par un encadrant, restituée aussitôt.",
  },
  {
    key: "dops",
    name: "DOPS — geste technique observé",
    subtype: "dops",
    mode: "in_person",
    usage: "formative",
    notes: "Observation directe d'un geste, sur une grille connue de l'étudiant.",
  },
  {
    key: "lca",
    name: "Lecture critique d'article",
    subtype: "lca",
    mode: "online",
    usage: "formative",
    notes: "Un article, une grille de lecture, une conclusion argumentée.",
  },

  /* ------------------------- Ce qui engage le stage ----------------------- */
  {
    key: "ecos-presentiel",
    name: "ECOS de fin de stage",
    subtype: "ecos",
    mode: "in_person",
    usage: "validation_exam",
    notes: "Stations chronométrées, patients standardisés, grille par station.",
  },
  {
    key: "qcm-sur-table",
    name: "QCM de validation sur table",
    subtype: "qcm",
    mode: "in_person",
    usage: "validation_exam",
    notes: "Épreuve surveillée, en salle, à date fixée.",
  },
  {
    key: "dp-validation",
    name: "Dossier progressif de validation",
    subtype: "dp",
    mode: "in_person",
    usage: "validation_exam",
    notes: "Format de l'épreuve nationale, en conditions d'examen.",
  },
  {
    key: "oral-validation",
    name: "Oral de validation",
    subtype: "oral",
    mode: "in_person",
    usage: "validation_exam",
    notes: "Entretien devant un ou deux enseignants, sur le parcours du stage.",
  },
  {
    key: "ecrit-validation",
    name: "Épreuve écrite de validation",
    subtype: "written",
    mode: "in_person",
    usage: "validation_exam",
    notes: "Format libre : questions rédactionnelles, QROC, cas rédigé.",
  },

  /* ------------------------- Au-delà du programme ------------------------- */
  {
    key: "edn-blanc",
    name: "EDN blanc",
    subtype: "dp",
    mode: "in_person",
    usage: "certification",
    notes: "Épreuve nationale à blanc, en conditions réelles de durée et de format.",
  },
  {
    key: "ecos-national-blanc",
    name: "ECOS nationaux à blanc",
    subtype: "ecos",
    mode: "in_person",
    usage: "certification",
    notes: "Circuit complet de stations, sur le modèle de l'épreuve nationale.",
  },
];

/** Comparaison des intitulés : c'est la clé unique en base (program_id, name). */
export function memeIntitule(a: string, b: string): boolean {
  return a.trim().toLocaleLowerCase("fr") === b.trim().toLocaleLowerCase("fr");
}

/** L'intitulé tel qu'il se lit dans la liste : le nom, le format, le lieu. */
function libelle(name: string, subtype: AssessmentSubtype, mode: AssessmentMode): string {
  const lieu = ASSESSMENT_MODE_LABELS_FR[mode].toLocaleLowerCase("fr");
  return `${name} — ${ASSESSMENT_SUBTYPE_LABELS_FR[subtype]}, ${lieu}`;
}

/**
 * Les lignes du Concepteur : TOUT le catalogue, plus ce que le programme a
 * créé de son côté.
 *
 * Une entrée du catalogue déjà présente en base prend l'identifiant de la
 * ligne réelle — cocher et décocher agissent alors dessus. Une entrée absente
 * garde un identifiant préfixé `catalogue:` : la cocher la créera.
 *
 * Le rapprochement se fait par INTITULÉ, parce que c'est la clé unique en
 * base (`unique (program_id, name)`). Renommer une modalité dans l'onglet
 * « Évaluations » la détachera donc de son entrée de catalogue et elle
 * rejoindra les modalités sur mesure — ce qui est le comportement voulu :
 * elle n'est plus l'entrée standard.
 */
export function catalogueAssociationItems(
  modalities: readonly AssessmentModality[],
): readonly AssociationItem[] {
  const deja = new Set<string>();
  const lignes: AssociationItem[] = [];

  for (const entree of CATALOGUE_MODALITES) {
    const existante = modalities.find((m) => memeIntitule(m.name, entree.name));
    if (existante) {
      /*
       * La ligne existe : c'est ELLE qui fait foi — son format, son lieu, son
       * usage — pas le catalogue. Sinon le Concepteur la rangerait sous un
       * usage et l'onglet « Évaluations » sous un autre, pour la même ligne.
       */
      deja.add(existante.id);
      lignes.push({
        id: existante.id,
        label: libelle(existante.name, existante.subtype, existante.mode),
        groupLabel: ASSESSMENT_USAGE_LABELS_FR[existante.usage],
        retained: existante.retainedAt !== undefined,
      });
      continue;
    }
    lignes.push({
      id: `${CATALOGUE_ID_PREFIX}${entree.key}`,
      label: libelle(entree.name, entree.subtype, entree.mode),
      groupLabel: ASSESSMENT_USAGE_LABELS_FR[entree.usage],
      retained: false,
    });
  }

  /*
   * Ce que le programme a inventé pour lui-même passe APRÈS, dans son groupe
   * d'usage. Le catalogue ne prétend pas être exhaustif : il est le départ.
   */
  for (const modality of modalities) {
    if (deja.has(modality.id)) continue;
    lignes.push({
      id: modality.id,
      label: libelle(modality.name, modality.subtype, modality.mode),
      groupLabel: ASSESSMENT_USAGE_LABELS_FR[modality.usage],
      retained: modality.retainedAt !== undefined,
    });
  }

  return lignes;
}

/**
 * Une ligne de l'ATELIER (mode construction) : l'entrée de catalogue, la
 * modalité réelle quand elle existe, ou l'une sans l'autre.
 *
 *   entry & modality  → entrée standard, présente dans le programme
 *   entry seule       → possible, pas encore choisie
 *   modality seule    → sur mesure : le programme l'a inventée
 *
 * L'usage affiché est celui de la MODALITÉ quand elle existe — c'est elle qui
 * fait foi — sinon celui proposé par le catalogue.
 */
export interface CatalogueRow {
  readonly id: string;
  readonly entry?: CatalogueEntry;
  readonly modality?: AssessmentModality;
  readonly usage: AssessmentUsage;
}

export function catalogueRows(modalities: readonly AssessmentModality[]): readonly CatalogueRow[] {
  const deja = new Set<string>();
  const rows: CatalogueRow[] = [];
  for (const entry of CATALOGUE_MODALITES) {
    const modality = modalities.find((m) => memeIntitule(m.name, entry.name));
    if (modality) deja.add(modality.id);
    rows.push({
      id: modality ? modality.id : `${CATALOGUE_ID_PREFIX}${entry.key}`,
      entry,
      ...(modality ? { modality } : {}),
      usage: modality ? modality.usage : entry.usage,
    });
  }
  for (const modality of modalities) {
    if (deja.has(modality.id)) continue;
    rows.push({ id: modality.id, modality, usage: modality.usage });
  }
  return rows;
}

/**
 * Création réelle des thèmes et des acquis à partir d'une prévisualisation.
 *
 * `domain/outcomeRoster` lit et devine, sans rien écrire. Ce module-ci écrit,
 * sans rien deviner : il ne prend que ce que la prévisualisation a marqué
 * `ready`, dans l'ordre du fichier. Toute la part discutable — quelle colonne
 * est quoi, quel niveau, quelle nature — a déjà été montrée à l'écran et
 * corrigée avant d'arriver ici.
 *
 * Pourquoi un module d'application et pas du code dans l'écran : la séquence
 * est longue (créer les thèmes, créer les acquis, ranger les acquis sous leur
 * thème dans le bon ordre) et elle doit être testable sans navigateur. Elle
 * l'est ici contre `mockDataAccess`.
 *
 * REPRISE APRÈS ÉCHEC : l'import est rejouable. Le code est l'identité d'un
 * acquis (`unique (program_id, code)`), et un thème est retrouvé par son
 * libellé. Relancer le même fichier après une coupure ne crée donc pas de
 * doublons : la prévisualisation aura marqué `already_present` ce qui est
 * passé, et les thèmes déjà créés sont réutilisés. C'est ce qui autorise à
 * continuer après l'échec d'une ligne plutôt qu'à tout annuler — il n'y a pas
 * de transaction possible à travers autant d'appels, et s'arrêter à la
 * première erreur laisserait un import à moitié fait sans moyen de le finir.
 */
import type { OutcomeRepository } from "@/application/ports/repositories";
import type { OutcomeCandidate, OutcomeRosterPreview } from "@/domain/outcomeRoster";
import type { CurriculumVersionId, Outcome, OutcomeTheme, ProgramId } from "@/domain/types";

export interface ImportOutcomeRosterInput {
  readonly outcomes: OutcomeRepository;
  readonly programId: ProgramId;
  readonly curriculumVersionId: CurriculumVersionId;
  readonly preview: OutcomeRosterPreview;
  /**
   * Thèmes déjà présents dans le programme. Un thème dont le libellé s'y
   * trouve déjà est REPRIS, jamais recréé : sans cela, corriger deux lignes
   * d'un fichier et le rejouer donnerait deux « Sémiologie » que plus rien ne
   * distinguerait.
   */
  readonly existingThemes?: readonly OutcomeTheme[];
  /** Appelé après chaque acquis créé, pour un compteur à l'écran. */
  readonly onProgress?: (done: number, total: number) => void;
}

export interface OutcomeRosterFailure {
  readonly line: number;
  readonly label: string;
  readonly message: string;
}

export interface ImportOutcomeRosterReport {
  readonly createdThemes: readonly OutcomeTheme[];
  readonly reusedThemes: readonly OutcomeTheme[];
  readonly createdOutcomes: readonly Outcome[];
  /** Acquis révisés : le fichier portait un code déjà présent et un contenu différent. */
  readonly updatedOutcomes: readonly Outcome[];
  /** Lignes que la prévisualisation avait écartées : doublons, déjà là, invalides. */
  readonly skippedCount: number;
  readonly failures: readonly OutcomeRosterFailure[];
}

/** Deux libellés de thème ne diffèrent pas pour un accent ou une majuscule. */
function themeKeyOf(label: string): string {
  return label.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase().replace(/\s+/g, " ");
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function importOutcomeRoster(
  input: ImportOutcomeRosterInput,
): Promise<ImportOutcomeRosterReport> {
  const { outcomes: repository, programId, curriculumVersionId, preview } = input;

  const ready = preview.candidates.filter((c) => c.status === "ready");
  const toUpdate = preview.candidates.filter((c) => c.status === "to_update");
  const skippedCount = preview.candidates.length - ready.length - toUpdate.length;

  const createdThemes: OutcomeTheme[] = [];
  const reusedThemes: OutcomeTheme[] = [];
  const createdOutcomes: Outcome[] = [];
  const updatedOutcomes: Outcome[] = [];
  const failures: OutcomeRosterFailure[] = [];

  /**
   * Les RÉVISIONS d'abord, et séparément des créations.
   *
   * Elles ne dépendent d'aucun thème — l'acquis existe déjà et il est déjà rangé
   * — donc les traiter en premier fait qu'un échec de création de thème ne peut
   * pas les empêcher. Comme les créations, elles ne s'arrêtent pas à la première
   * erreur : rejouer le fichier reprend là où ça s'est cassé.
   */
  for (const candidate of toUpdate) {
    if (candidate.outcomeId === undefined) continue;
    try {
      const updated = await repository.updateOutcome({
        outcomeId: candidate.outcomeId as Outcome["id"],
        label: candidate.label,
        description: candidate.description,
        targetMastery: candidate.targetMastery,
        ...(candidate.knowledgeRank !== undefined
          ? { knowledgeRank: candidate.knowledgeRank }
          : {}),
      });
      updatedOutcomes.push(updated);
    } catch (error) {
      failures.push({ line: candidate.line, label: candidate.label, message: messageOf(error) });
    }
  }

  if (ready.length === 0) {
    return {
      createdThemes,
      reusedThemes,
      createdOutcomes,
      updatedOutcomes,
      skippedCount,
      failures,
    };
  }

  /* ---------------------------------------------------------------- */
  /* 1. Les thèmes                                                     */
  /* ---------------------------------------------------------------- */

  const known = new Map<string, OutcomeTheme>();
  let lastPosition = 0;
  for (const theme of input.existingThemes ?? []) {
    known.set(themeKeyOf(theme.label), theme);
    lastPosition = Math.max(lastPosition, theme.position);
  }

  // Seuls les thèmes qui portent au moins une ligne retenue sont créés : un
  // chapitre dont toutes les lignes sont déjà présentes n'a pas à réapparaître
  // vide.
  const themesToMake = preview.themes.filter(
    (t) => t.key !== "" && t.outcomes.some((o) => o.status === "ready"),
  );

  const themeByKey = new Map<string, OutcomeTheme>();
  for (const draft of themesToMake) {
    const key = themeKeyOf(draft.label);
    const existing = known.get(key);
    if (existing) {
      themeByKey.set(draft.key, existing);
      reusedThemes.push(existing);
      continue;
    }
    try {
      lastPosition += 1;
      const created = await repository.createOutcomeTheme({
        programId,
        label: draft.label,
        description: "",
        position: lastPosition,
      });
      known.set(key, created);
      themeByKey.set(draft.key, created);
      createdThemes.push(created);
    } catch (error) {
      // Le thème manque, mais les acquis portent la matière : on les crée
      // quand même, non rangés, et on le dit. Les perdre serait pire, et un
      // second passage les rangera une fois le thème créé.
      failures.push({
        line: draft.outcomes[0]?.line ?? preview.headerLine,
        label: `Thème « ${draft.label} »`,
        message: messageOf(error),
      });
    }
  }

  /* ---------------------------------------------------------------- */
  /* 2. Les acquis                                                     */
  /* ---------------------------------------------------------------- */

  // `domain` est le champ de classement libre d'un acquis. Quand la source
  // porte une colonne de portée (générique / spécialisé), c'est elle qui le
  // remplit — c'est la distinction que le Concepteur veut voir et filtrer ;
  // le chapitre, lui, est désormais tenu par `themeId` et n'a plus besoin de
  // ce champ. Sans colonne de portée, on retombe sur le libellé du thème.
  const scopeMapped = preview.mapping.scope !== undefined;
  const domainOf = (candidate: OutcomeCandidate): string => {
    const value = scopeMapped ? candidate.scope : candidate.themeLabel;
    return value.trim() === "" ? "Non classé" : value.trim();
  };

  const madeByThemeKey = new Map<string, Outcome[]>();
  let done = 0;

  for (const candidate of ready) {
    try {
      const created = await repository.createOutcome({
        programId,
        curriculumVersionId,
        code: candidate.code,
        label: candidate.label,
        description: candidate.description,
        nature: candidate.nature,
        domain: domainOf(candidate),
        targetMastery: candidate.targetMastery,
        ...(candidate.knowledgeRank !== undefined
          ? { knowledgeRank: candidate.knowledgeRank }
          : {}),
      });
      createdOutcomes.push(created);
      const bucket = madeByThemeKey.get(candidate.themeKey);
      if (bucket) bucket.push(created);
      else madeByThemeKey.set(candidate.themeKey, [created]);
    } catch (error) {
      failures.push({
        line: candidate.line,
        label: candidate.label,
        message: messageOf(error),
      });
    }
    done += 1;
    input.onProgress?.(done, ready.length);
  }

  /* ---------------------------------------------------------------- */
  /* 3. Le rangement                                                   */
  /* ---------------------------------------------------------------- */

  // Un seul appel par thème, dans l'ordre du fichier : c'est le contrat du
  // port (`setOutcomesTheme` enregistre l'état complet d'une liste), et
  // l'ordre du référentiel source a un sens pédagogique.
  for (const [key, made] of madeByThemeKey) {
    const theme = themeByKey.get(key);
    if (!theme || made.length === 0) continue;
    try {
      await repository.setOutcomesTheme(
        made.map((o) => o.id),
        theme.id,
      );
    } catch (error) {
      failures.push({
        line: preview.headerLine,
        label: `Rangement sous « ${theme.label} »`,
        message: messageOf(error),
      });
    }
  }

  return { createdThemes, reusedThemes, createdOutcomes, updatedOutcomes, skippedCount, failures };
}

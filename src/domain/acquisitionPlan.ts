/**
 * Plan d'acquisition : logique métier pure (aucun framework, aucun accès données).
 *
 * Le plan n'est PAS une seconde vérité métier : il dérive des acquis
 * (`Outcome`), des preuves (`Evidence`) et d'un calendrier de référence
 * (`PlanScheduleEntry`). Les quatre vues du Passeport (Liste, Kanban, Gantt,
 * Calendrier) consomment ce même modèle.
 */
import type {
  CohortId,
  IsoDateTime,
  OutcomeId,
  OutcomeNature,
  OutcomeThemeId,
  ProgramId,
} from "./types";
import type { MasteryLevel } from "./types";
import { masteryRank, type OutcomeProgress } from "./mastery";

/** Deux plans distincts demandés : connaissances vs compétences. */
export type AcquisitionTrack = "knowledge" | "competence";

/** Colonnes Kanban. */
export type PlanItemStage = "to_plan" | "in_progress" | "to_validate" | "acquired";

/** Calendrier de référence d'un acquis (donnée de démonstration isolée). */
/**
 * LE DECALAGE PERSONNEL D'UN JALON.
 *
 * UN ETUDIANT NE MODIFIE QUE SON PROPRE CALENDRIER (Stef, 09/09) : « aucun
 * impact sur le programme global et sur les autres calendriers des autres
 * etudiants ». La table `plan_milestones` — le retroplanning de la promotion —
 * n'est jamais touchee. Le decalage est une COUCHE par-dessus, propre a une
 * inscription, lue pour elle seule.
 *
 * DEUX FORMES, DEUX SENS. `shiftedStartsOn` absent veut dire « j'ai deplace ce
 * jalon, sa duree reste celle du retroplanning » — la fenetre glisse d'un bloc.
 * Present, il veut dire « j'ai choisi ma fenetre » : l'etudiant a tire une
 * extremite et la duree est desormais la sienne. La colonne est nullable en
 * base pour porter exactement cette distinction, plutot qu'une valeur par
 * defaut qui ferait passer une duree subie pour une duree choisie.
 */
export interface MilestoneShift {
  readonly milestoneId: PlanMilestoneId;
  readonly shiftedDueOn: IsoDateTime;
  /** Absent = duree du retroplanning conservee. */
  readonly shiftedStartsOn?: IsoDateTime;
}

/**
 * LA DATE PERSONNELLE SI ELLE EXISTE, SINON CELLE DE LA PROMOTION.
 *
 * ECRITE UNE SEULE FOIS, ICI. Quatre vues lisent ce calendrier — Passeport,
 * Calendrier, Gantt, Kanban — et le jour ou une seule oublierait la couche
 * personnelle, l'etudiant verrait deux plans differents dans le meme ecran sans
 * savoir lequel croire.
 *
 * SANS DEBUT CHOISI, LA DUREE DU JALON EST CONSERVEE, pas recalculee a une
 * semaine : si le retroplanning lui donne trois jours, il en garde trois apres
 * deplacement. Recalculer une semaine ferait grandir un jalon court a chaque
 * decalage — un effet de bord invisible et cumulatif.
 *
 * AVEC UN DEBUT CHOISI, ON PREND LES DEUX DATES TELLES QUELLES. C'est
 * l'etudiant qui a tire l'extremite ; recalculer quoi que ce soit reviendrait a
 * corriger son geste.
 */
export function appliquerDecalages(
  entries: readonly PlanScheduleEntry[],
  shifts: readonly MilestoneShift[],
): readonly PlanScheduleEntry[] {
  if (shifts.length === 0) return entries;
  const parJalon = new Map(shifts.map((shift) => [shift.milestoneId, shift]));
  return entries.map((entry) => {
    const decalage = parJalon.get(entry.milestoneId);
    if (decalage === undefined) return entry;
    const fin = new Date(decalage.shiftedDueOn).getTime();
    if (decalage.shiftedStartsOn !== undefined) {
      return {
        ...entry,
        startsOn: new Date(decalage.shiftedStartsOn).toISOString(),
        dueOn: new Date(fin).toISOString(),
      };
    }
    const duree = new Date(entry.dueOn).getTime() - new Date(entry.startsOn).getTime();
    return {
      ...entry,
      startsOn: new Date(fin - duree).toISOString(),
      dueOn: new Date(fin).toISOString(),
    };
  });
}

export interface PlanScheduleEntry {
  readonly outcomeId: OutcomeId;
  /**
   * LE JALON, PAR SON IDENTIFIANT ET NON PAR SON LIBELLE (09/09).
   *
   * Le libelle suffisait tant qu'on ne faisait qu'AFFICHER. Il ne suffit plus
   * des lors qu'un apprenant peut DEPLACER son jalon : `shift_milestone` prend
   * un uuid, et deux jalons peuvent porter le meme libelle dans deux
   * promotions. Le Gantt regroupait ses barres sur `libelle|date` — une cle
   * d'affichage, jamais une cle d'ecriture.
   */
  readonly milestoneId: PlanMilestoneId;
  readonly startsOn: IsoDateTime;
  readonly dueOn: IsoDateTime;
  readonly milestoneLabel: string;
  /** Échéance institutionnelle (non déplaçable sans validation). */
  readonly official: boolean;
}

/* ------------------------------------------------------------------ */
/* Rétroplanning réel d'une promotion                                  */
/* ------------------------------------------------------------------ */

export type PlanMilestoneId = string & { readonly __brand?: "PlanMilestone" };

/**
 * Un jalon du rétroplanning d'une PROMOTION.
 *
 * Trois choses à ne pas perdre de vue, toutes portées par la table :
 *
 * 1. **Des rangs de semaine, jamais des dates.** `weekOffset` compte les
 *    semaines depuis le début du stage (0 = semaine d'accueil). Rejouer le même
 *    rétroplanning l'année suivante ne demande donc que de changer la date de la
 *    promotion, pas de ressaisir six échéances.
 * 2. **Une période est facultative.** `weekOffsetEnd` absent = jalon ponctuel
 *    (« semaine 4 ») ; présent = jalon étalé (« semaines 4 à 6 »).
 * 3. **`official` n'est pas décoratif.** Il décide si l'étudiant peut déplacer
 *    ce jalon : c'est exactement `approvalRuleForImpact` — `official_deadline`
 *    exige un enseignant, `personal_pace` est accepté d'office.
 *
 * Un jalon appartient à une cohorte, pas à un programme : « semaine 4 » n'a de
 * sens que pour un stage donné.
 */
export interface PlanMilestone {
  readonly id: PlanMilestoneId;
  readonly cohortId: CohortId;
  readonly programId: ProgramId;
  readonly label: string;
  readonly weekOffset: number;
  readonly weekOffsetEnd?: number;
  readonly official: boolean;
  readonly position: number;
  /** Acquis attendus à ce jalon. Ils héritent de sa date. */
  readonly outcomeIds: readonly OutcomeId[];
}

/**
 * Bornes acceptées par la base (`check (week_offset between 0 and 104)`).
 * Reprises ici pour que l'écran refuse AVANT l'aller-retour, sans pour autant
 * être la seule barrière : la contrainte SQL reste l'autorité.
 */
export const PLAN_MILESTONE_MIN_WEEK = 0;
export const PLAN_MILESTONE_MAX_WEEK = 104;

export type PlanMilestoneIssue =
  | "label_manquant"
  | "semaine_hors_bornes"
  | "fin_hors_bornes"
  | "fin_avant_debut"
  | "semaine_hors_promotion"
  | "fin_hors_promotion";

export const PLAN_MILESTONE_ISSUE_LABELS_FR: Record<PlanMilestoneIssue, string> = {
  label_manquant: "Le jalon doit porter un intitulé.",
  semaine_hors_bornes: `La semaine de début doit être comprise entre ${PLAN_MILESTONE_MIN_WEEK} et ${PLAN_MILESTONE_MAX_WEEK}.`,
  fin_hors_bornes: `La semaine de fin doit être comprise entre ${PLAN_MILESTONE_MIN_WEEK} et ${PLAN_MILESTONE_MAX_WEEK}.`,
  fin_avant_debut: "La fin de la période précède son début.",
  semaine_hors_promotion: "Cette semaine tombe après la fin de la promotion.",
  fin_hors_promotion: "La fin de la période tombe après la fin de la promotion.",
};

/* ------------------------------------------------------------------ */
/* Combien de semaines dure une promotion                              */
/* ------------------------------------------------------------------ */

export interface LearningWeeks {
  /** Durée de la promotion en jours, du premier au dernier. */
  readonly days: number;
  /** Dernier rang de semaine utilisable. Une semaine qui commence après la fin n'existe pas. */
  readonly lastWeek: number;
  /** Nombre de semaines d'apprentissage, la semaine 0 comprise : `lastWeek + 1`. */
  readonly count: number;
  /** La dernière semaine s'arrête avant d'être complète. */
  readonly lastWeekPartial: boolean;
}

/**
 * Les semaines d'apprentissage d'une promotion, déduites de SES dates.
 *
 * Une semaine n'est utilisable que si elle COMMENCE avant la fin de la
 * promotion : la semaine 11 d'un stage de 75 jours débuterait le 17/11 pour un
 * stage qui s'achève le 15/11, et un jalon posé là serait une échéance après
 * la fin. C'est le défaut mesuré le 02/09 sur « Promotion 2026-2027 : centurie
 * A », où cinq jalons et 54 acquis étaient datés hors stage sans que rien ne
 * le signale.
 *
 * La dernière semaine est le plus souvent incomplète, et c'est normal : un
 * stage de 75 jours fait dix semaines et cinq jours. On la compte quand même —
 * elle contient de vrais jours de stage — mais l'écran le dit, pour que
 * « 11 semaines » ne se lise pas comme onze semaines pleines.
 */
export function learningWeeks(startsOn: IsoDateTime, endsOn: IsoDateTime): LearningWeeks {
  const start = Date.parse(startsOn.slice(0, 10));
  const end = Date.parse(endsOn.slice(0, 10));
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) {
    // Une promotion mal bornée ne doit pas rendre l'écran inutilisable : une
    // seule semaine, et la contrainte SQL reste l'autorité.
    return { days: 0, lastWeek: 0, count: 1, lastWeekPartial: true };
  }
  const days = Math.round((end - start) / 86_400_000);
  const lastWeek = Math.min(Math.floor(days / 7), PLAN_MILESTONE_MAX_WEEK);
  return {
    days,
    lastWeek,
    count: lastWeek + 1,
    lastWeekPartial: days - lastWeek * 7 < 6,
  };
}

/**
 * Ce qui empêche d'enregistrer un jalon. Liste vide = enregistrable.
 *
 * Même règle que partout ailleurs dans ce projet : l'écran vérifie pour
 * expliquer, la base vérifie pour garantir. On ne remplace pas l'une par
 * l'autre.
 */
export function validatePlanMilestone(
  input: {
    readonly label: string;
    readonly weekOffset: number;
    readonly weekOffsetEnd?: number;
  },
  /**
   * La promotion visée, quand elle est connue. Elle resserre les bornes
   * générales : la base accepte 104 semaines, une promotion de 75 jours n'en
   * accepte que onze. Optionnelle à dessein — un jalon se valide aussi hors de
   * toute promotion, et l'omettre revient au contrôle d'avant.
   */
  promotion?: { readonly lastWeek: number },
): readonly PlanMilestoneIssue[] {
  const issues: PlanMilestoneIssue[] = [];
  if (input.label.trim() === "") issues.push("label_manquant");
  if (
    !Number.isInteger(input.weekOffset) ||
    input.weekOffset < PLAN_MILESTONE_MIN_WEEK ||
    input.weekOffset > PLAN_MILESTONE_MAX_WEEK
  ) {
    issues.push("semaine_hors_bornes");
  }
  if (input.weekOffsetEnd !== undefined) {
    if (
      !Number.isInteger(input.weekOffsetEnd) ||
      input.weekOffsetEnd < PLAN_MILESTONE_MIN_WEEK ||
      input.weekOffsetEnd > PLAN_MILESTONE_MAX_WEEK
    ) {
      issues.push("fin_hors_bornes");
    } else if (input.weekOffsetEnd < input.weekOffset) {
      issues.push("fin_avant_debut");
    }
  }
  if (promotion !== undefined) {
    // Après les bornes générales : dire « hors promotion » d'une semaine qui
    // n'est même pas un entier valide brouillerait le message.
    if (!issues.includes("semaine_hors_bornes") && input.weekOffset > promotion.lastWeek) {
      issues.push("semaine_hors_promotion");
    }
    if (
      input.weekOffsetEnd !== undefined &&
      !issues.includes("fin_hors_bornes") &&
      input.weekOffsetEnd > promotion.lastWeek
    ) {
      issues.push("fin_hors_promotion");
    }
  }
  return issues;
}

/**
 * La date réelle d'un rang de semaine, pour une promotion donnée.
 *
 * C'est la seule fonction qui transforme un rang en date, et elle est ici —
 * dans le domaine — plutôt que dans un écran : le passeport de l'étudiant, le
 * pilotage et le Concepteur doivent tous les trois lire la même date.
 */
export function milestoneDateFor(cohortStartsOn: IsoDateTime, weekOffset: number): IsoDateTime {
  const start = new Date(cohortStartsOn);
  start.setUTCDate(start.getUTCDate() + weekOffset * 7);
  return start.toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------ */
/* Ce qu'un enregistrement de rétroplanning va faire                   */
/* ------------------------------------------------------------------ */

/**
 * Ce que le concepteur a décidé pour un chapitre, tel qu'il est saisi.
 *
 * Les semaines sont des CHAÎNES parce qu'elles viennent d'un champ de saisie :
 * « » (vide) et « 4 » ne sont pas la même chose, et convertir trop tôt ferait
 * passer un champ vide pour la semaine 0 — soit la semaine d'accueil, ce qui
 * est une vraie valeur.
 */
export type MilestoneTiming =
  | { readonly kind: "undated" }
  | { readonly kind: "week"; readonly from: string }
  | { readonly kind: "period"; readonly from: string; readonly to: string };

export interface MilestoneWrite {
  readonly themeId: string;
  readonly label: string;
  readonly weekOffset: number;
  readonly weekOffsetEnd?: number;
  /** Jalon déjà enregistré à reprendre. Absent = création. */
  readonly milestoneId?: PlanMilestoneId;
}

export interface MilestonePlanIntent {
  /** Jalons à créer ou à reprendre, dans l'ordre des chapitres. */
  readonly toWrite: readonly MilestoneWrite[];
  /** Jalons enregistrés que le concepteur vient de repasser en « non daté ». */
  readonly toDelete: readonly PlanMilestone[];
  /** Jalons enregistrés qu'aucun chapitre ne réclame — un chapitre renommé. */
  readonly orphans: readonly PlanMilestone[];
}

function parsedWeek(value: string): number | undefined {
  if (value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
}

/**
 * Ce qu'un clic sur « Enregistrer » va réellement faire.
 *
 * Cette fonction est ici, et pas dans l'écran, pour une raison précise : elle
 * décide de SUPPRESSIONS. Un chapitre repassé en « non daté » doit voir son
 * jalon disparaître — sinon « non daté » mentirait, l'échéance resterait dans
 * le passeport de l'étudiant, et rien à l'écran ne le dirait. Mais une
 * suppression qu'on ne peut pas rejouer dans un test est une suppression qu'on
 * ne peut pas garantir.
 *
 * Ce qu'elle ne fait JAMAIS : supprimer un jalon orphelin. Un chapitre renommé
 * laisse derrière lui un jalon que plus aucun libellé ne réclame ; l'effacer
 * d'office ferait perdre un travail de planification sur un simple renommage.
 * Il est rendu à part, pour que l'écran le montre et laisse décider.
 */
export function planMilestoneIntent(
  themes: readonly { readonly id: string; readonly label: string }[],
  timings: Readonly<Record<string, MilestoneTiming>>,
  existing: readonly PlanMilestone[],
): MilestonePlanIntent {
  const toWrite: MilestoneWrite[] = [];
  const toDelete: PlanMilestone[] = [];

  for (const theme of themes) {
    const timing = timings[theme.id] ?? { kind: "undated" };
    const saved = existing.find((milestone) => milestone.label === theme.label);
    const from = timing.kind === "undated" ? undefined : parsedWeek(timing.from);

    if (from === undefined) {
      // « Non daté », ou une semaine pas encore saisie : dans les deux cas le
      // chapitre ne porte pas d'échéance. S'il en avait une, elle s'en va.
      if (saved) toDelete.push(saved);
      continue;
    }

    const to = timing.kind === "period" ? parsedWeek(timing.to) : undefined;
    toWrite.push({
      themeId: theme.id,
      label: theme.label,
      weekOffset: from,
      ...(to === undefined ? {} : { weekOffsetEnd: to }),
      ...(saved ? { milestoneId: saved.id } : {}),
    });
  }

  const orphans = existing.filter(
    (milestone) => !themes.some((theme) => theme.label === milestone.label),
  );

  return { toWrite, toDelete, orphans };
}

/**
 * L'ordre dans lequel l'écran présente les chapitres : chronologique.
 *
 * Il se calcule sur les jalons ENREGISTRÉS, jamais sur la saisie en cours.
 * C'est la raison d'être de cette fonction : trier au fil de la frappe ferait
 * sauter les lignes sous le doigt — on tape « 9 » dans un chapitre, il part
 * douze lignes plus bas, et le champ suivant n'est plus là où on le cherchait.
 * L'ordre ne bouge donc qu'au chargement et après un enregistrement, ce qui
 * est exactement ce que demande Stef le 02/09.
 *
 * Les chapitres SANS jalon enregistré vont à la fin, dans l'ordre du
 * référentiel : ils n'ont pas de place dans une chronologie, et les
 * intercaler à l'ordre du référentiel mêlerait deux logiques de tri dans une
 * même liste.
 */
export function chronologicalThemeOrder<
  T extends { readonly id: string; readonly label: string; readonly position: number },
>(themes: readonly T[], existing: readonly PlanMilestone[]): readonly T[] {
  const weekOf = new Map<string, number>();
  for (const milestone of existing) weekOf.set(milestone.label, milestone.weekOffset);

  return [...themes].sort((a, b) => {
    const wa = weekOf.get(a.label);
    const wb = weekOf.get(b.label);
    if (wa === undefined && wb === undefined) return a.position - b.position;
    if (wa === undefined) return 1;
    if (wb === undefined) return -1;
    if (wa !== wb) return wa - wb;
    return a.position - b.position;
  });
}

export interface MilestoneGanttBar {
  /**
   * Le CHAPITRE, pas le jalon : une barre existe dès qu'une semaine est
   * saisie, avant tout enregistrement. C'est ce qui permet au graphique d'être
   * la seconde vue de la saisie plutôt qu'un rapport sur la base.
   */
  readonly themeId: string;
  readonly label: string;
  /** La saisie telle quelle, pour qu'un glissement reparte de son origine. */
  readonly timing: MilestoneTiming;
  readonly weekStart: number;
  /** Égale `weekStart` pour un jalon ponctuel : une barre a toujours une fin. */
  readonly weekEnd: number;
  readonly startsOn: IsoDateTime;
  readonly endsOn: IsoDateTime;
  readonly outcomeCount: number;
  /** Diffère de la base : jamais enregistré, ou déplacé depuis. */
  readonly unsaved: boolean;
}

export interface MilestoneGantt {
  /** Dernière semaine de l'échelle. L'échelle part toujours de la semaine 0. */
  readonly lastWeek: number;
  readonly bars: readonly MilestoneGanttBar[];
}

/**
 * Le rétroplanning vu comme des barres sur une échelle de semaines.
 *
 * TROIS CHOSES QUI EXPLIQUENT CETTE SIGNATURE.
 *
 * 1. **Elle part de la SAISIE, pas des jalons enregistrés.** Le graphique est
 *    devenu manipulable (on tire une barre pour déplacer un jalon) : il doit
 *    donc montrer ce que l'écran contient, sinon la barre qu'on vient de tirer
 *    reviendrait à sa place. `unsaved` porte l'écart avec la base, pour que ce
 *    qui n'est pas encore enregistré se voie.
 * 2. **Elle n'ordonne rien.** Les barres sortent dans l'ordre des chapitres
 *    reçus — celui de la liste au-dessus, chronologique et figé entre deux
 *    enregistrements. Deux tris indépendants finiraient par diverger, et la
 *    troisième barre cesserait de correspondre au troisième chapitre.
 * 3. **L'échelle part de la semaine 0** — le début du stage — et non de la
 *    première semaine occupée : un rétroplanning qui ne commence qu'en semaine
 *    3 doit se VOIR comme tel. Elle va jusqu'à la fin de la promotion, et
 *    au-delà si un jalon déborde : une barre posée après la fin du stage doit
 *    rester visible pour être corrigée.
 *
 * `official` n'y figure plus : la saisie ne le porte pas, et une barre dérivée
 * de la saisie ne peut donc pas l'afficher sans mentir.
 */
export function milestoneGanttBars(input: {
  /** Chapitres DÉJÀ ordonnés : la fonction respecte cet ordre. */
  readonly themes: readonly { readonly id: string; readonly label: string }[];
  readonly timings: Readonly<Record<string, MilestoneTiming>>;
  readonly existing: readonly PlanMilestone[];
  readonly outcomeCounts: ReadonlyMap<string, number>;
  readonly cohortStartsOn: IsoDateTime;
  readonly promotionLastWeek?: number;
}): MilestoneGantt {
  const bars: MilestoneGanttBar[] = [];

  for (const theme of input.themes) {
    const timing = input.timings[theme.id] ?? { kind: "undated" as const };
    if (timing.kind === "undated") continue;
    const from = parsedWeek(timing.from);
    // Une semaine pas encore saisie n'a pas de barre : lui en donner une la
    // placerait en semaine 0, qui est une vraie valeur.
    if (from === undefined) continue;
    const weekEnd = (timing.kind === "period" ? parsedWeek(timing.to) : undefined) ?? from;
    const saved = input.existing.find((milestone) => milestone.label === theme.label);

    bars.push({
      themeId: theme.id,
      label: theme.label,
      timing,
      weekStart: from,
      weekEnd,
      startsOn: milestoneDateFor(input.cohortStartsOn, from),
      endsOn: milestoneDateFor(input.cohortStartsOn, weekEnd),
      outcomeCount: input.outcomeCounts.get(theme.id) ?? 0,
      unsaved:
        saved === undefined ||
        saved.weekOffset !== from ||
        (saved.weekOffsetEnd ?? saved.weekOffset) !== weekEnd,
    });
  }

  // Une échelle de largeur nulle rendrait des barres invisibles : au moins une
  // semaine, même quand tout est posé en semaine 0.
  const lastWeek = Math.max(1, input.promotionLastWeek ?? 0, ...bars.map((bar) => bar.weekEnd));
  return { lastWeek, bars };
}

/** Ce qu'on saisit d'une barre : la déplacer, ou tirer l'une de ses extrémités. */
export type MilestoneDragKind = "move" | "start" | "end";

/**
 * Une période d'une seule semaine EST un jalon ponctuel.
 *
 * Les distinguer laisserait en base un `week_offset_end` égal au début —
 * invisible à l'œil, bien présent dans la table — et le bouton « Semaine
 * unique » cesserait de dire vrai pour ce jalon.
 */
function timingBetween(from: number, to: number): MilestoneTiming {
  return from === to
    ? { kind: "week", from: String(from) }
    : { kind: "period", from: String(from), to: String(to) };
}

/**
 * Ce que devient un jalon qu'on tire dans le graphique.
 *
 * La règle qui compte est celle du déplacement : **on décale le bloc sans
 * jamais le déformer**. Une période poussée contre le bord du stage s'arrête,
 * elle ne se rétrécit pas — sinon un doigt un peu trop appuyé raccourcirait
 * silencieusement une période de trois semaines.
 *
 * Tirer une extrémité, à l'inverse, déforme volontairement : c'est le geste
 * qui transforme un jalon ponctuel en période, et réciproquement.
 *
 * Un chapitre non daté, ou dont la semaine n'est pas encore saisie, ne bouge
 * pas : il n'a pas de barre, il n'y a rien à tirer.
 */
export function dragMilestoneTiming(
  timing: MilestoneTiming,
  drag: { readonly kind: MilestoneDragKind; readonly deltaWeeks: number },
  bounds: { readonly lastWeek: number },
): MilestoneTiming {
  if (timing.kind === "undated") return timing;
  const from = parsedWeek(timing.from);
  if (from === undefined) return timing;
  const end = (timing.kind === "period" ? parsedWeek(timing.to) : undefined) ?? from;

  const max = Math.max(0, bounds.lastWeek);
  const clamp = (value: number) => Math.min(Math.max(value, 0), max);

  if (drag.kind === "move") {
    const width = end - from;
    const start = Math.min(Math.max(from + drag.deltaWeeks, 0), Math.max(0, max - width));
    return timingBetween(start, start + width);
  }
  if (drag.kind === "start") {
    return timingBetween(Math.min(clamp(from + drag.deltaWeeks), end), end);
  }
  return timingBetween(from, Math.max(clamp(end + drag.deltaWeeks), from));
}

export interface AcquisitionPlanItem {
  readonly id: OutcomeId;
  readonly code: string;
  readonly label: string;
  readonly nature: OutcomeNature;
  readonly track: AcquisitionTrack;
  readonly stage: PlanItemStage;
  readonly mastery: MasteryLevel;
  readonly targetMastery: MasteryLevel;
  readonly progressPercent: number;
  /**
   * `null` = NON PLANIFIE. Aucun jalon du retroplanning ne porte cet acquis.
   * Avant le 03/09 le presenter fabriquait ici une date plausible ; l'apprenant
   * lisait une echeance que personne n'avait posee, sans moyen de le savoir.
   */
  readonly startsOn: IsoDateTime | null;
  readonly dueOn: IsoDateTime | null;
  readonly milestoneLabel: string | null;
  /**
   * `null` quand aucun jalon ne porte cet acquis. Necessaire pour ecrire un
   * decalage personnel : voir `PlanScheduleEntry.milestoneId`.
   */
  readonly milestoneId: PlanMilestoneId | null;
  /** Ce que l'apprenant a declare sur cet acquis, s'il l'a fait. */
  readonly declaredLevel?: MasteryLevel;
  /** Chapitre du Concepteur, pour replier les vues qui portent des centaines de lignes. */
  readonly themeId?: OutcomeThemeId;
  readonly officialDeadline: boolean;
  readonly requiresThirdPartyValidation: boolean;
  readonly countedEvidence: number;
  readonly pendingEvidence: number;
  /** Prérequis (ids d'acquis) — utilisé par la vue Gantt. */
  readonly dependsOn: readonly OutcomeId[];
}

export interface AcquisitionPlanTrack {
  readonly track: AcquisitionTrack;
  readonly label: string;
  readonly description: string;
  readonly items: readonly AcquisitionPlanItem[];
}

export const TRACK_LABELS_FR: Record<AcquisitionTrack, string> = {
  knowledge: "Plan d'acquisition des connaissances",
  competence: "Plan d'acquisition des compétences",
};

/**
 * LES QUATRE ETATS SONT CEUX DE L'APPRENANT, PAS CEUX DE L'ADMINISTRATION.
 *
 * « A PLANIFIER » MENTAIT (Stef, 08/09 : « tout est deja planifie par l admin,
 * donc a quoi cela correspond-il ? »). `stageForProgress` ne regarde jamais le
 * retroplanning : un acquis tombe dans `to_plan` des lors qu'il n'a ni preuve,
 * ni declaration, et qu'il n'atteint pas la cible. Ses 333 acquis portent tous
 * un jalon et une echeance — le Gantt et le Calendrier les datent.
 *
 * SUPPRIMER LA COLONNE, comme envisage, aurait cache 333 acquis sur 371 : neuf
 * dixiemes du programme, et tout ce qui reste a faire. C'est le MOT qui etait
 * faux, pas la colonne. « A travailler » est deja le vocabulaire de la vue
 * d'ensemble — legende de la carte du programme, titre « Ce que je peux
 * travailler ». Un seul mot pour une seule idee.
 *
 * A SAVOIR SUR « EN COURS » : elle exige `countedEvidence > 0`, donc au moins
 * une preuve deposee. Tant qu'aucune preuve n'existe en base, cette colonne
 * reste vide — ce n'est pas un defaut, c'est ce que dit la donnee.
 */
export const STAGE_LABELS_FR: Record<PlanItemStage, string> = {
  to_plan: "À travailler",
  in_progress: "En cours",
  to_validate: "À valider",
  acquired: "Acquis",
};

export const PLAN_STAGES: readonly PlanItemStage[] = [
  "to_plan",
  "in_progress",
  "to_validate",
  "acquired",
];

export function trackForNature(nature: OutcomeNature): AcquisitionTrack {
  return nature === "knowledge" ? "knowledge" : "competence";
}

/** Classement déterministe d'un acquis dans une colonne Kanban. */
export function stageForProgress(progress: OutcomeProgress): PlanItemStage {
  if (progress.meetsTarget) return "acquired";
  if (progress.pendingEvidence.length > 0 || progress.blockedBySelfDeclaration) {
    return "to_validate";
  }
  if (progress.countedEvidence.length > 0) return "in_progress";
  return "to_plan";
}

/** Avancement relatif au niveau cible (0–100, déterministe). */
export function progressPercent(mastery: MasteryLevel, target: MasteryLevel): number {
  const targetRank = masteryRank(target);
  if (targetRank <= 0) return 100;
  const ratio = Math.min(masteryRank(mastery) / targetRank, 1);
  return Math.round(ratio * 100);
}

/* ------------------------------------------------------------------ */
/* Demande de modification du plan                                     */
/* ------------------------------------------------------------------ */

/**
 * Nature de l'impact d'une demande, qui détermine seule la règle de validation.
 */
export type PlanChangeImpact = "personal_pace" | "official_deadline" | "clinical_competence";

export type PlanApprovalRule = "auto_accept" | "teacher_or_admin" | "placement_supervisor";

export type PlanChangeStatus = "draft" | "pending" | "accepted" | "rejected";

export const IMPACT_LABELS_FR: Record<PlanChangeImpact, string> = {
  personal_pace: "Organisation personnelle, sans impact institutionnel",
  official_deadline: "Échéance officielle, prérequis ou objectif obligatoire",
  clinical_competence: "Stage ou compétence clinique",
};

export const APPROVAL_RULE_LABELS_FR: Record<PlanApprovalRule, string> = {
  auto_accept: "Acceptation automatique (règle prévue, non active)",
  teacher_or_admin: "Validation enseignant ou administrateur",
  placement_supervisor: "Validation encadrant de stage",
};

export const PLAN_CHANGE_STATUS_LABELS_FR: Record<PlanChangeStatus, string> = {
  draft: "Brouillon",
  pending: "En attente",
  accepted: "Acceptée",
  rejected: "Refusée",
};

/**
 * Contexte minimal nécessaire pour dériver la règle sans ambiguïté.
 * Par défaut, un impact clinique est supposé rattaché à un stage : le
 * comportement existant de l'interface reste inchangé.
 */
export interface PlanChangeApprovalContext {
  readonly hasPlacementAssignment?: boolean;
}

/**
 * Règle d'approbation dérivée de l'impact déclaré.
 *
 * Miroir de `derive_plan_change_request_impact()` (docs/database/draft §7) :
 * un impact clinique SANS stage assigné ne peut pas exiger un encadrant, sinon
 * la demande serait indécidable. Dans ce cas, enseignant/administrateur statue
 * provisoirement sur le calendrier — jamais sur l'acquisition.
 */
export function approvalRuleForImpact(
  impact: PlanChangeImpact,
  context: PlanChangeApprovalContext = {},
): PlanApprovalRule {
  switch (impact) {
    case "personal_pace":
      return "auto_accept";
    case "clinical_competence":
      return context.hasPlacementAssignment === false ? "teacher_or_admin" : "placement_supervisor";
    case "official_deadline":
    default:
      return "teacher_or_admin";
  }
}

export interface PlanChangeRequestDraft {
  readonly itemId: OutcomeId;
  /** Nouvelle date souhaitée (ISO court, optionnelle si seul le rythme change). */
  readonly requestedDate?: string;
  /** Nouvel ordre / rythme souhaité, en texte libre. */
  readonly requestedPace?: string;
  readonly justification: string;
  readonly impact: PlanChangeImpact;
}

export interface PlanChangeRequest extends PlanChangeRequestDraft {
  readonly id: string;
  readonly approvalRule: PlanApprovalRule;
  readonly status: PlanChangeStatus;
  readonly createdAt: IsoDateTime;
  /** Prototype uniquement : aucune persistance, aucun envoi. */
  readonly simulated: true;
}

export type PlanChangeField = "justification" | "requestedDate";

/** Validation locale du formulaire : la justification est obligatoire. */
export function validatePlanChangeDraft(
  draft: PlanChangeRequestDraft,
): readonly { field: PlanChangeField; message: string }[] {
  const errors: { field: PlanChangeField; message: string }[] = [];
  if (draft.justification.trim().length === 0) {
    errors.push({ field: "justification", message: "La justification est obligatoire." });
  }
  if (!draft.requestedDate && !draft.requestedPace?.trim()) {
    errors.push({
      field: "requestedDate",
      message: "Indiquez une nouvelle date ou un nouveau rythme.",
    });
  }
  return errors;
}

/** Crée une demande locale (état React), jamais transmise à un backend. */
export function createPlanChangeRequest(
  draft: PlanChangeRequestDraft,
  now: IsoDateTime,
  id: string,
): PlanChangeRequest {
  return {
    ...draft,
    id,
    approvalRule: approvalRuleForImpact(draft.impact),
    // Une demande sans impact institutionnel resterait un brouillon accepté
    // automatiquement à l'avenir ; ici rien n'est envoyé, donc "draft".
    status: draft.impact === "personal_pace" ? "draft" : "pending",
    createdAt: now,
    simulated: true,
  };
}

import type { ProgramId } from "@/domain/types";

/**
 * LE REGLAGE DE L'ASSISTANT IA, TEL QUE L'ADMINISTRATEUR DU PROGRAMME LE VOIT.
 *
 * POURQUOI CE MODULE EXISTE (Stef, 09/09) : « il faut que ces choix soient
 * disponibles dans la partie Admin / Gestionnaire de programme. Il faut pouvoir
 * jusqu'a masquer la fonction IA si l'admin le decide car trop couteux. »
 *
 * Ce n'est pas un confort d'ecran. Le seuil de pertinence vivait en dur dans la
 * fonction edge (`MIN_RANK = 0.5`) : un arbitrage de cout ecrit par un
 * developpeur, applique a la facture de quelqu'un d'autre. Il devient ici un
 * reglage par programme, lisible et modifiable par celui qui paie.
 *
 * A NE PAS CONFONDRE avec `domain/aiCredits` et `domain/contentAi`, qui
 * decrivent une comptabilite analytique de MAQUETTE (enveloppes par periode,
 * paliers de modele, mode vocal). Ici, tout correspond a une colonne ou a une
 * fonction reellement en base : `program_ai_settings`,
 * `set_program_ai_settings`, `program_ai_usage_this_month`.
 */

/* ==========================================================================
 * LA POLITIQUE DE REPLI
 * ========================================================================== */

/**
 * L'ORDRE EST CELUI DU COUT CROISSANT, et l'ecran s'en sert pour presenter les
 * trois choix du moins cher au plus cher. Les valeurs sont exactement les
 * etiquettes de l'enum `public.ai_fallback_policy` : une traduction en chemin
 * finirait par diverger de la base.
 */
export const AI_FALLBACK_POLICIES = ["seuil", "sections_seules", "chapitre"] as const;

export type AiFallbackPolicy = (typeof AI_FALLBACK_POLICIES)[number];

export const AI_FALLBACK_POLICY_LABELS_FR: Record<AiFallbackPolicy, string> = {
  seuil: "Seulement si la question tombe juste",
  sections_seules: "Si la connaissance a un texte propre",
  chapitre: "Toujours répondre, quitte à lire tout le chapitre",
};

/** Ce que l'ETUDIANT vit. Une politique de cout se juge d'abord par la. */
export const AI_FALLBACK_POLICY_HINTS_FR: Record<AiFallbackPolicy, string> = {
  seuil:
    "L'assistant ne répond que si le cours contient un passage nettement lié à la question. Sinon il dit qu'il n'a rien trouvé.",
  sections_seules:
    "L'assistant répond dès que la connaissance a un texte rattaché. Sur les connaissances sans texte propre, il dit qu'il n'a rien trouvé.",
  chapitre:
    "L'assistant répond toujours : à défaut de passage précis, il lit le chapitre entier, comme le ferait le livre imprimé.",
};

/** Ce que ca COUTE. Dit sans euphemisme : c'est la moitie de la decision. */
export const AI_FALLBACK_POLICY_COST_FR: Record<AiFallbackPolicy, string> = {
  seuil: "Une question sans réponse ne coûte rien : le modèle n'est pas appelé.",
  sections_seules: "Coût intermédiaire : on paie quand la réponse a des chances d'être précise.",
  chapitre: "Chaque question coûte un appel, sans exception.",
};

/* ==========================================================================
 * L'ETAT REEL
 * ========================================================================== */

export interface ProgramAiSettings {
  readonly programId: ProgramId;
  readonly enabled: boolean;
  /** Plafond MENSUEL par apprenant, en credits. Zero = personne ne peut poser de question. */
  readonly monthlyCreditCap: number;
  readonly fallbackPolicy: AiFallbackPolicy;
  /**
   * Le moteur choisi. Se regle ailleurs (`set_program_ai_credential`) : ouvrir
   * l'IA et confier un secret ne sont pas le meme geste. Affiche seulement.
   */
  readonly activeProvider: string | undefined;
}

/**
 * La consommation du mois EN COURS, pour ce programme.
 *
 * `learnersAtCap` EST LE CHIFFRE QUI COMPTE, et il est invisible dans un total :
 * il dit si le plafond est bien place. Un programme peut consommer peu tout en
 * ayant deja mure trois etudiants.
 */
export interface ProgramAiUsage {
  readonly creditsTotal: number;
  readonly messagesTotal: number;
  readonly learnersActive: number;
  readonly learnersAtCap: number;
}

/**
 * L'ABSENCE DE REGLAGE VAUT REFUS — c'est le defaut de la table depuis le
 * 03/09, et l'ecran doit dire la meme chose que la base. Un programme sans
 * ligne n'a donc pas « une IA a 400 credits en attente » : il n'a pas d'IA.
 */
export function defaultProgramAiSettings(programId: ProgramId): ProgramAiSettings {
  return {
    programId,
    enabled: false,
    monthlyCreditCap: 400,
    fallbackPolicy: "seuil",
    activeProvider: undefined,
  };
}

/**
 * CE QUE VOIT L'APPRENANT, en une phrase, calcule une seule fois.
 *
 * Trois etats et non deux : un plafond a zero coupe l'outil aussi surement
 * qu'un interrupteur ferme, mais sans le dire — c'est exactement le genre de
 * reglage qu'on pose un soir et qu'on ne s'explique plus le lendemain.
 */
export function describeLearnerAvailability(settings: ProgramAiSettings): string {
  if (!settings.enabled) {
    return "L'assistant n'apparaît pas dans l'espace des apprenants.";
  }
  if (settings.monthlyCreditCap === 0) {
    return "L'assistant est visible, mais le plafond à 0 crédit refuse toutes les questions.";
  }
  return `L'assistant est ouvert, dans la limite de ${settings.monthlyCreditCap} crédits par apprenant et par mois.`;
}

/**
 * Vrai quand le reglage enregistre ne peut pas fonctionner : ouvert sans
 * moteur. Le declencheur en base refuse deja cet enregistrement ; on le dit
 * AUSSI a l'ecran, parce qu'une ligne posee avant ce declencheur (ou par un
 * autre chemin) donnerait sinon un assistant visible qui echoue a la premiere
 * question.
 */
export function isSettingsInconsistent(settings: ProgramAiSettings): boolean {
  return settings.enabled && settings.activeProvider === undefined;
}

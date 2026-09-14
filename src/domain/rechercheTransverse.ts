/**
 * RECHERCHE TRANSVERSE DE L'APPRENANT — le moteur, sans écran.
 *
 * L'étudiant pose UNE demande ; la réponse arrive en SIX BLOCS : connaissances,
 * compétences, évaluations, stage, calendrier, messages. Ce fichier ne dessine
 * rien : il prend ce qui est déjà chargé, plus les passages rendus par le
 * serveur, et compose les six blocs. L'écran ne fait que les rendre.
 *
 * DEUX PARTIS PRIS, à connaître avant de toucher à ce fichier.
 *
 * 1. **La recherche ne réaffiche pas le contenu, elle ROUTE.** Chaque résultat
 *    porte un lien vers l'onglet qui sait déjà l'afficher, et chaque bloc porte
 *    le sien pour « voir les N autres ». C'est la règle d'architecture du
 *    projet — une entité, un stockage, plusieurs portes d'entrée — appliquée
 *    à l'apprenant : sans elle, il faudrait reconstruire six écrans ici, et ils
 *    divergeraient du jour au lendemain.
 *
 * 2. **Le client cherche en ET, le serveur cherche en OU.** Sur les intitulés
 *    — quelques centaines de lignes courtes, déjà en mémoire — « insuffisance
 *    mitrale » doit vouloir dire les deux mots : le OU rendrait toute la
 *    cardiologie. Sur le TEXTE DES COURS, la fonction serveur relie les lexèmes
 *    en OU et CLASSE par pertinence : c'est le bon choix pour du texte long, où
 *    exiger tous les mots dans la même section rendrait souvent zéro. Les deux
 *    règles sont justes pour leur matière ; ne pas les uniformiser sans mesurer.
 */
import type { PlanScheduleEntry } from "./acquisitionPlan";
import type { AssessmentModality } from "./assessmentModality";
import { normalizeSearch } from "./competenceListView";
import type { LearnerMessage } from "./communication";
import type { StageLog } from "./stageLog";
import type { Outcome } from "./types";
import type { ProgramSectionMatch } from "@/application/ports/repositories";

/* ------------------------------------------------------------------ */
/* Appariement — la fonction partagée                                  */
/* ------------------------------------------------------------------ */

/**
 * LE SEUIL EST À DEUX CARACTÈRES, comme côté serveur, et pour la même raison :
 * « FA », « IM », « RA », « IC » sont des requêtes d'étudiant en cardiologie
 * parfaitement normales. Un seuil à trois les viderait, et l'écran afficherait
 * « aucun résultat » sur un mot que le programme contient partout.
 */
const LONGUEUR_MINIMALE = 2;

/** Les mots utiles d'une requête, désaccentués et minusculés. */
export function motsDeLaRequete(requete: string): readonly string[] {
  return normalizeSearch(requete)
    .split(/[^\p{Letter}\p{Number}]+/u)
    .filter((mot) => mot.length >= LONGUEUR_MINIMALE);
}

/**
 * L'appariement unique du projet côté client.
 *
 * `ResourcesView` comparait jusqu'ici en `toLowerCase()` nu, et
 * `CompetencesView` en `normalizeSearch` : le même mot accentué rendait deux
 * réponses différentes dans deux onglets voisins, sans que rien ne le signale.
 * Partager un composant ne suffit pas — il faut partager la projection.
 */
export function correspond(
  champs: readonly (string | undefined)[],
  mots: readonly string[],
): boolean {
  if (mots.length === 0) return false;
  const botte = normalizeSearch(champs.filter(Boolean).join(" "));
  return mots.every((mot) => botte.includes(mot));
}

/* ------------------------------------------------------------------ */
/* Ce que rend le moteur                                               */
/* ------------------------------------------------------------------ */

export type CleBloc =
  "connaissances" | "competences" | "evaluations" | "stage" | "calendrier" | "messages";

/**
 * L'ordre EST une décision : il descend du plus pédagogique au plus logistique.
 * C'est l'ordre COMPLET, celui d'un apprenant inscrit ; les autres profils en
 * voient le même, privé de « stage » et « calendrier ».
 */
export const ORDRE_DES_BLOCS: readonly CleBloc[] = [
  "connaissances",
  "competences",
  "evaluations",
  "stage",
  "calendrier",
  "messages",
];

export const TITRES_DES_BLOCS: Record<CleBloc, string> = {
  connaissances: "Connaissances",
  competences: "Compétences",
  evaluations: "Évaluations",
  stage: "Stage",
  calendrier: "Calendrier",
  messages: "Messages",
};

export interface LienResultat {
  readonly to: string;
  /** Paramètres de lien profond, quand l'onglet visé en accepte. */
  readonly search?: Readonly<Record<string, string>>;
}

export interface ResultatRecherche {
  readonly id: string;
  readonly titre: string;
  /** Contexte court affiché sous le titre : chapitre, domaine, date… */
  readonly contexte: string;
  /** Présent seulement quand le résultat vient d'un CONTENU, pas d'un intitulé. */
  readonly extrait?: string;
  readonly lien: LienResultat;
}

export interface BlocRecherche {
  readonly cle: CleBloc;
  readonly titre: string;
  /** Total AVANT la coupe — l'en-tête du bloc. */
  readonly total: number;
  readonly resultats: readonly ResultatRecherche[];
  readonly lienOnglet: LienResultat;
  /**
   * DEUX NATURES DE « RESTE », ET C'EST LA CORRECTION DU 14/09 AU SOIR.
   *
   * Un seul compteur « voir les N autres » mentait : le bloc Connaissances
   * annonçait 96 restants et envoyait vers « Mes ressources », qui ne sait
   * filtrer que les INTITULÉS — l'étudiant y retrouvait les 314 connaissances
   * du programme, sans rapport avec ce qu'il venait de chercher.
   *
   * `restantsRoutables` : des entités qui ONT un écran d'accueil capable de les
   * filtrer. Le lien y emporte la requête.
   * `restantsSurPlace` : les passages du texte des cours. **Aucun écran ne les
   * liste**, donc les envoyer quelque part serait une promesse fausse : ils
   * s'affichent ici, en dépliant le bloc.
   */
  readonly restantsRoutables: number;
  readonly restantsSurPlace: number;
}

/**
 * TROIS RÉSULTATS PAR BLOC.
 *
 * Six blocs à cinq résultats font trente lignes : sur un téléphone de 390 px
 * l'étudiant ne voit plus qu'un seul bloc sans défiler, et la vue d'ensemble —
 * la seule raison d'avoir des blocs — disparaît. Trois tient en un écran.
 */
export const RESULTATS_PAR_BLOC = 3;

export interface EntreeRecherche {
  readonly requete: string;
  /*
   * DES ACQUIS, ET PLUS UNE PROGRESSION (14/09 au soir).
   *
   * Le moteur lisait `OutcomeProgress`, c'est-à-dire les acquis VUS PAR UN
   * APPRENANT INSCRIT. Il n'avait donc rien à rendre à un encadrant ou à un
   * administrateur — six blocs vides. Or la recherche ne se sert que de
   * l'intitulé, du code, de la description et du domaine : l'avancement ne lui
   * a jamais servi à rien. Prendre l'acquis nu ouvre l'outil à tous les profils
   * sans rien changer aux résultats de l'apprenant.
   */
  readonly outcomes: readonly Outcome[];
  /**
   * LES BLOCS PERSONNELS N'EXISTENT QUE POUR QUELQU'UN D'INSCRIT : son carnet,
   * son calendrier. Un encadrant n'a ni l'un ni l'autre — et ce n'est pas ici
   * qu'il doit trouver ceux de ses étudiants, mais dans l'espace Encadrement,
   * avec le périmètre que le serveur lui reconnaît.
   */
  readonly estInscrit: boolean;
  /** Le rétroplanning de sa promotion, décalages personnels déjà appliqués. */
  readonly jalons: readonly PlanScheduleEntry[];
  readonly modalites: readonly AssessmentModality[];
  readonly carnets: readonly StageLog[];
  readonly messages: readonly LearnerMessage[];
  /** Les passages du texte 2026, rendus par la fonction serveur. */
  readonly sections: readonly ProgramSectionMatch[];
  /**
   * Le bloc Connaissances montre-t-il TOUS les passages déjà chargés ?
   * Seul ce bloc se déplie, parce que seul son contenu n'a pas d'écran
   * d'accueil. Les cinq autres routent.
   */
  readonly deplierConnaissances?: boolean;
}

/* ------------------------------------------------------------------ */
/* Les blocs                                                           */
/* ------------------------------------------------------------------ */

function couper(resultats: readonly ResultatRecherche[]): readonly ResultatRecherche[] {
  return resultats.slice(0, RESULTATS_PAR_BLOC);
}

/**
 * Le reste d'un bloc ordinaire : tout ce qu'il contient a un écran d'accueil,
 * donc tout le reste est routable et rien ne se déplie sur place.
 */
function restes(total: number): { restantsRoutables: number; restantsSurPlace: number } {
  return { restantsRoutables: Math.max(0, total - RESULTATS_PAR_BLOC), restantsSurPlace: 0 };
}

function extraitAutourDesMots(contenu: string, mots: readonly string[], longueur = 180): string {
  const normalise = normalizeSearch(contenu);
  const premier = mots
    .map((mot) => normalise.indexOf(mot))
    .filter((position) => position >= 0)
    .sort((a, b) => a - b)[0];
  /*
   * LA DÉCOUPE SE FAIT SUR LE TEXTE D'ORIGINE, JAMAIS SUR LE DÉSACCENTUÉ.
   * `normalizeSearch` conserve les longueurs (il retire des diacritiques, pas
   * des lettres), donc la position trouvée vaut pour les deux chaînes — mais
   * c'est bien `contenu` qu'on tranche, sans quoi l'étudiant lirait un extrait
   * de cours de cardiologie sans accents.
   */
  if (premier === undefined) return contenu.slice(0, longueur).trim();
  const debut = Math.max(0, premier - Math.floor(longueur / 3));
  const morceau = contenu.slice(debut, debut + longueur).trim();
  return `${debut > 0 ? "…" : ""}${morceau}${debut + longueur < contenu.length ? "…" : ""}`;
}

function blocConnaissances(entree: EntreeRecherche, mots: readonly string[]): BlocRecherche {
  /*
   * DEUX NATURES DE TROUVAILLE DANS LE MÊME BLOC, et c'est voulu : l'étudiant
   * qui cherche « valvulopathie » veut la connaissance au référentiel ET le
   * passage du cours qui en parle. Les intitulés passent devant, parce qu'ils
   * sont le cadre : le texte vient les expliquer, pas les remplacer.
   */
  const acquis = entree.outcomes.filter(
    (outcome) =>
      outcome.nature === "knowledge" &&
      correspond([outcome.code, outcome.label, outcome.description], mots),
  );

  const depuisLesAcquis: readonly ResultatRecherche[] = acquis.map((outcome) => ({
    id: `acquis-${outcome.id}`,
    titre: outcome.label,
    contexte: outcome.code,
    lien: { to: "/espace/ressources", search: { acquis: outcome.code } },
  }));

  const depuisLeTexte: readonly ResultatRecherche[] = entree.sections.map((section) => ({
    id: `section-${section.sectionId}`,
    titre: section.titre || section.numero || "Passage du cours",
    contexte: [section.resourceTitle, section.numero].filter(Boolean).join(" · "),
    extrait: extraitAutourDesMots(section.contenu, mots),
    /*
     * PAS DE LIEN PROFOND VERS LA SECTION, et il ne faut pas en inventer un :
     * aucune route ne sait aujourd'hui ouvrir un chapitre à une section
     * précise. Un lien qui atterrit en haut du chapitre est honnête ; un lien
     * qui prétend viser la section et n'y va pas ne l'est pas.
     */
    lien: { to: "/espace/ressources" },
  }));

  /*
   * LE TOTAL DU TEXTE VIENT DU SERVEUR, PAS DE `sections.length`. La fonction
   * serveur rend au plus `limit` lignes mais porte le compte complet dans
   * `totalMatches` : compter les lignes reçues afficherait « voir les 0 autres »
   * sur un corpus qui en contient cinquante.
   */
  const totalTexte = entree.sections[0]?.totalMatches ?? 0;

  /*
   * LES INTITULÉS PASSENT TOUJOURS EN PREMIER, et la coupe se fait APRÈS cette
   * concaténation : c'est ce qui garantit qu'une connaissance du référentiel
   * n'est jamais chassée de l'écran par trois passages de cours.
   */
  const tous = [...depuisLesAcquis, ...depuisLeTexte];
  const resultats = entree.deplierConnaissances ? tous : couper(tous);
  const acquisAffiches = resultats.filter((r) => r.id.startsWith("acquis-")).length;
  const passagesAffiches = resultats.length - acquisAffiches;

  return {
    cle: "connaissances",
    titre: TITRES_DES_BLOCS.connaissances,
    total: acquis.length + totalTexte,
    resultats,
    /*
     * LA REQUÊTE EST EMPORTÉE. « Mes ressources » lit `q` et en pré-remplit son
     * filtre : sans ce paramètre, le lien ouvrait les 314 connaissances du
     * programme après en avoir annoncé quatre-vingt-seize.
     */
    lienOnglet: { to: "/espace/ressources", search: { q: entree.requete.trim() } },
    restantsRoutables: Math.max(0, acquis.length - acquisAffiches),
    restantsSurPlace: Math.max(0, totalTexte - passagesAffiches),
  };
}

function blocCompetences(entree: EntreeRecherche, mots: readonly string[]): BlocRecherche {
  const trouvees = entree.outcomes.filter(
    (outcome) =>
      outcome.nature !== "knowledge" &&
      correspond([outcome.code, outcome.label, outcome.description, outcome.domain], mots),
  );
  return {
    cle: "competences",
    titre: TITRES_DES_BLOCS.competences,
    total: trouvees.length,
    resultats: couper(
      trouvees.map((outcome) => ({
        id: `competence-${outcome.id}`,
        titre: outcome.label,
        contexte: [outcome.code, outcome.domain].filter(Boolean).join(" · "),
        lien: { to: "/espace/competences", search: { acquis: outcome.code } },
      })),
    ),
    /* « Mes compétences » lit `q` et en pré-remplit son filtre. */
    lienOnglet: { to: "/espace/competences", search: { q: entree.requete.trim() } },
    ...restes(trouvees.length),
  };
}

function blocEvaluations(entree: EntreeRecherche, mots: readonly string[]): BlocRecherche {
  /*
   * SEULES LES MODALITÉS RETENUES AU PARCOURS. Le catalogue d'un programme
   * contient aussi ce que le concepteur a créé sans le retenir : le faire
   * remonter à l'étudiant lui promettrait une épreuve qui n'aura pas lieu.
   */
  const retenues = entree.modalites.filter((modalite) => Boolean(modalite.retainedAt));
  const trouvees = retenues.filter((modalite) =>
    correspond([modalite.name, modalite.notes, modalite.subtype, modalite.mode], mots),
  );
  return {
    cle: "evaluations",
    titre: TITRES_DES_BLOCS.evaluations,
    total: trouvees.length,
    resultats: couper(
      trouvees.map((modalite) => ({
        id: `modalite-${modalite.id}`,
        titre: modalite.name,
        contexte: [modalite.subtype, modalite.mode].filter(Boolean).join(" · "),
        lien: { to: "/espace/evaluations" },
      })),
    ),
    /*
     * CET ONGLET NE SAIT PAS SE FILTRER : le lien y mène sans emporter la
     * requête. Mieux vaut une liste complète assumée qu'un `?q=` que l'écran
     * ignorerait en silence.
     */
    lienOnglet: { to: "/espace/evaluations" },
    ...restes(trouvees.length),
  };
}

function blocStage(entree: EntreeRecherche, mots: readonly string[]): BlocRecherche {
  const journees = entree.carnets.flatMap((carnet) =>
    carnet.entries.map((entry) => ({ carnet, entry })),
  );
  const trouvees = journees.filter(({ entry }) =>
    correspond([entry.narrative, ...Object.values(entry.values ?? {})], mots),
  );
  return {
    cle: "stage",
    titre: TITRES_DES_BLOCS.stage,
    total: trouvees.length,
    resultats: couper(
      trouvees.map(({ entry }) => ({
        id: `journee-${entry.id}`,
        titre: formaterJour(entry.occurredAt),
        contexte: "Mon carnet de stage",
        extrait: extraitAutourDesMots(entry.narrative, mots),
        lien: { to: "/espace/stage" },
      })),
    ),
    /*
     * CET ONGLET NE SAIT PAS SE FILTRER : le lien y mène sans emporter la
     * requête. Mieux vaut une liste complète assumée qu'un `?q=` que l'écran
     * ignorerait en silence.
     */
    lienOnglet: { to: "/espace/stage" },
    ...restes(trouvees.length),
  };
}

function blocCalendrier(entree: EntreeRecherche, mots: readonly string[]): BlocRecherche {
  /*
   * LE BLOC PARLE DE JALONS, PAS D'ACQUIS. Un acquis apparaît déjà dans les
   * deux premiers blocs ; le rendre une troisième fois ici parce qu'il porte
   * une date ferait lire trois fois la même ligne. On regroupe donc le
   * rétroplanning par jalon — un jalon, une ligne, son échéance et son volume.
   *
   * LES DÉCALAGES PERSONNELS SONT DÉJÀ APPLIQUÉS EN AMONT : c'est le calendrier
   * DE CET APPRENANT, celui que montre son Gantt. Lire le calendrier de
   * référence ici lui ferait lire deux dates différentes pour le même jalon
   * dans le même écran, sans savoir laquelle croire.
   */
  const parJalon = new Map<string, { libelle: string; dueOn: string | null; compte: number }>();
  for (const entry of entree.jalons) {
    const cle = `${entry.milestoneLabel}|${entry.dueOn ?? ""}`;
    const deja = parJalon.get(cle);
    if (deja) parJalon.set(cle, { ...deja, compte: deja.compte + 1 });
    else parJalon.set(cle, { libelle: entry.milestoneLabel, dueOn: entry.dueOn, compte: 1 });
  }
  const trouves = [...parJalon.entries()].filter(([, jalon]) => correspond([jalon.libelle], mots));
  return {
    cle: "calendrier",
    titre: TITRES_DES_BLOCS.calendrier,
    total: trouves.length,
    resultats: couper(
      trouves.map(([cle, jalon]) => ({
        id: `jalon-${cle}`,
        titre: jalon.libelle,
        contexte: [
          jalon.dueOn ? `Échéance ${formaterJour(jalon.dueOn)}` : "Non planifié",
          `${jalon.compte} acquis`,
        ].join(" · "),
        lien: { to: "/espace/passeport" },
      })),
    ),
    lienOnglet: { to: "/espace/passeport" },
    ...restes(trouves.length),
  };
}

function blocMessages(entree: EntreeRecherche, mots: readonly string[]): BlocRecherche {
  const trouves = entree.messages.filter((message) =>
    correspond([message.subject, message.body], mots),
  );
  return {
    cle: "messages",
    titre: TITRES_DES_BLOCS.messages,
    total: trouves.length,
    resultats: couper(
      trouves.map((message) => ({
        id: `message-${message.deliveryId}`,
        titre: message.subject,
        contexte: formaterJour(message.receivedAt),
        extrait: extraitAutourDesMots(message.body, mots),
        lien: { to: "/espace/messages" },
      })),
    ),
    /*
     * CET ONGLET NE SAIT PAS SE FILTRER : le lien y mène sans emporter la
     * requête. Mieux vaut une liste complète assumée qu'un `?q=` que l'écran
     * ignorerait en silence.
     */
    lienOnglet: { to: "/espace/messages" },
    ...restes(trouves.length),
  };
}

function formaterJour(iso: string): string {
  /*
   * PAS DE `new Date(iso).toISOString()` NI DE SUFFIXE AJOUTÉ. La leçon du
   * 03/09 : recomposer une date déjà normalisée par l'adaptateur produit une
   * date invalide, `toISOString()` lève, react-query avale l'exception, et
   * l'écran reste sur son squelette de chargement sans la moindre erreur.
   */
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

/**
 * Les blocs, dans l'ordre. Une requête vide n'en rend aucun.
 *
 * SIX POUR UN APPRENANT, QUATRE POUR LES AUTRES PROFILS. Le carnet de stage et
 * le calendrier n'appartiennent qu'à quelqu'un d'inscrit : les afficher vides à
 * un encadrant ou à un administrateur lui ferait croire que sa recherche n'a
 * rien trouvé là où il n'y avait rien à chercher. Les quatre autres — les
 * connaissances, les compétences, les évaluations et les messages — existent
 * pour tout le monde, chacun avec ce que la RLS lui laisse voir.
 */
export function construireBlocs(entree: EntreeRecherche): readonly BlocRecherche[] {
  const mots = motsDeLaRequete(entree.requete);
  if (mots.length === 0) return [];
  return [
    blocConnaissances(entree, mots),
    blocCompetences(entree, mots),
    blocEvaluations(entree, mots),
    ...(entree.estInscrit ? [blocStage(entree, mots), blocCalendrier(entree, mots)] : []),
    blocMessages(entree, mots),
  ];
}

/** Total tous blocs confondus — l'en-tête de la page en a besoin. */
export function totalDesBlocs(blocs: readonly BlocRecherche[]): number {
  return blocs.reduce((somme, bloc) => somme + bloc.total, 0);
}

/**
 * ECOS VIRTUEL — les stations ChatGPT et ce que le hub en garde (13/09).
 *
 * LA DEMANDE. Stef, le 12/09 : les cinq GPT ECOS « sont à tester et à intégrer
 * dans notre plateforme ». Testés le 12 et le 13 : chacun affiche sa consigne,
 * joue le patient (ou le sénior de garde pour l'ECG) pendant 8 minutes, puis
 * rend au mot « DEBRIEF » une grille Item / Barème / Note obtenue — et, depuis
 * le 13/09, un fichier Excel de cette grille (interpréteur de code activé sur
 * les cinq GPT).
 *
 * OPTION 1, DÉCIDÉE LE 13/09. La station s'ouvre DANS CHATGPT ; le hub ne
 * lance rien et ne voit pas le dialogue. Ce qu'il reçoit, c'est la grille que
 * l'étudiant rapporte : une DÉCLARATION, lisible par son équipe de stage, ni
 * preuve ni confirmation (décisions 1 et 3 du modèle du 12/09).
 *
 * LE CATALOGUE VIT ICI, PAS EN BASE. Cinq stations connues, cinq liens. Le
 * jour où le moteur ECOS interne existe (décision 4), ce fichier disparaît au
 * profit d'une table ; en attendant, une station de plus est une ligne de plus.
 */
import type { AssessmentModality, CohortAssessmentLink } from "@/domain/assessmentModality";
import type { EnrollmentId, ProgramId } from "@/domain/types";

export interface EcosExternalStation {
  /** Clé stable enregistrée avec chaque passage (`station_key`). */
  readonly key: string;
  readonly label: string;
  /** Le patient simulé tel que la consigne le présente. */
  readonly patient: string;
  /** Situation de départ, en une ligne. */
  readonly theme: string;
  /** Ce que le GPT joue et ce qu'il attend de l'étudiant. */
  readonly role: string;
  readonly url: string;
}

/**
 * Les cinq stations, dans l'ordre où Stef les a transmises. Les liens sont ceux
 * des GPT eux-mêmes (retrouvés dans « Mes GPT » le 13/09) — pas des liens de
 * partage de conversation, qui ne rejouent pas la station.
 */
export const ECOS_EXTERNAL_STATIONS: readonly EcosExternalStation[] = [
  {
    key: "cardio-cas-1",
    label: "ECOS cardio cas 1",
    patient: "Pierre Ponce, 60 ans",
    theme: "Douleur thoracique à l'effort",
    role: "Patient simulé ; un ECG est fourni (fichier à ouvrir).",
    url: "https://chatgpt.com/g/g-67545e2bb2648191b6b4e01e44848798-ecos-cardio-cas-1",
  },
  {
    key: "cardio-cas-2",
    label: "ECOS cardio cas 2",
    patient: "Pierre Robert, 58 ans",
    theme: "Dyspnée – insuffisance cardiaque",
    role: "Patient simulé ; l'examen clinique est déjà fait, à vous le diagnostic et la prise en charge.",
    url: "https://chatgpt.com/g/g-6755b64c3ee88191843d32b7cdc5b84e-ecos-cardio-cas-2",
  },
  {
    key: "ecg",
    label: "ECOS ECG",
    patient: "Homme de 38 ans",
    theme: "Douleur thoracique depuis 12 h, ECG à interpréter",
    role: "Le GPT joue le sénior de garde : présentez le cas et votre lecture de l'ECG.",
    url: "https://chatgpt.com/g/g-675609f2abe481919e96ad2a95d5ca6e-ecos-ecg",
  },
  {
    key: "cardio-3-bis",
    label: "ECOS cardio 3 bis",
    patient: "Rolland Duris, 53 ans",
    theme: "HTA, un scanner à interpréter en cabinet",
    role: "Patient simulé ; interrogatoire ciblé, prise en charge spécifique, réponses à ses questions.",
    url: "https://chatgpt.com/g/g-68e8c35810a0819180b737afac503d71-ecos-cardio-3-bis",
  },
  {
    key: "cardio-cas-4",
    label: "ECOS cardio cas 4",
    patient: "Gilberte Dubos, 65 ans",
    theme: "Dyspnée aggravative depuis 4 mois",
    role: "Patiente simulée ; diagnostic précis et examens complémentaires à expliquer.",
    url: "https://chatgpt.com/g/g-676b26a9a3108191bda1c3987ec837e2-ecos-cardio-cas-4",
  },
];

export function findEcosExternalStation(key: string): EcosExternalStation | undefined {
  return ECOS_EXTERNAL_STATIONS.find((s) => s.key === key);
}

/** Une ligne de la grille rapportée : intitulé, barème, note obtenue. */
export interface EcosGridItem {
  readonly label: string;
  readonly maxPoints: number;
  readonly points: number;
}

/** Un passage déclaré, tel que la base le garde. */
export interface EcosExternalRun {
  readonly id: string;
  readonly enrollmentId: EnrollmentId;
  readonly programId: ProgramId;
  readonly stationKey: string;
  readonly stationLabel: string;
  /** ISO `YYYY-MM-DD`. */
  readonly playedOn: string;
  readonly score: number;
  readonly maxScore: number;
  readonly itemCount: number;
  readonly createdAt: string;
}

export interface RecordEcosExternalRunInput {
  readonly enrollmentId: EnrollmentId;
  readonly stationKey: string;
  readonly stationLabel: string;
  readonly playedOn: string;
  readonly items: readonly EcosGridItem[];
}

export function ecosRunPercent(run: Pick<EcosExternalRun, "score" | "maxScore">): number {
  if (run.maxScore <= 0) return 0;
  return Math.round((run.score / run.maxScore) * 100);
}

/**
 * L'ECOS SIMULÉ EST MIS À DISPOSITION, STATION PAR STATION (16/09).
 *
 * Jusqu'ici l'écran apprenant affichait les cinq stations à tout inscrit, sans
 * que personne ne les ait ouvertes — Stef, le 16/09 : « l'Admin les coche ou
 * pas, et ils apparaissent ou pas pour l'Apprenant, et après que l'Admin ait
 * sélectionné lesquels ».
 *
 * Une modalité d'ECOS SIMULÉ, c'est un ECOS **en ligne** : l'ECOS de fin de
 * stage et les ECOS nationaux à blanc se passent en présentiel et ne se jouent
 * pas dans le hub.
 *
 * ⚠️ UNE CLÉ INCONNUE DU CATALOGUE EST IGNORÉE. La base garde des clés de
 * station, le catalogue vit dans ce fichier : retirer une station du code ne
 * doit pas afficher une ligne vide chez l'étudiant.
 */
export function estEcosSimule(modality: Pick<AssessmentModality, "subtype" | "mode">): boolean {
  return modality.subtype === "ecos" && modality.mode === "online";
}

/**
 * Les stations réellement offertes à l'apprenant : celles que son équipe a
 * cochées pour sa promotion. Aucune sélection = aucune station.
 *
 * `isOpen` n'entre PAS dans la règle : aucun écran d'ECOS ne le pose, et la
 * sélection dit déjà tout — ce qui est coché est offert. Le jour où un
 * interrupteur ouvert/fermé apparaît pour l'ECOS, c'est ici qu'il se lit.
 */
export function ecosStationsOffertes(
  modalities: readonly AssessmentModality[],
  links: readonly CohortAssessmentLink[],
): readonly EcosExternalStation[] {
  const modalitesEcos = new Set(modalities.filter(estEcosSimule).map((m) => m.id));
  if (modalitesEcos.size === 0) return [];
  const cles = new Set<string>();
  for (const lien of links) {
    if (!modalitesEcos.has(lien.modalityId)) continue;
    for (const cle of lien.ecosStations ?? []) cles.add(cle);
  }
  return ECOS_EXTERNAL_STATIONS.filter((station) => cles.has(station.key));
}

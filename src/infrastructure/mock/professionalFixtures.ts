/**
 * Données de démonstration des espaces PROFESSIONNELS
 * (responsable de stage et administration).
 *
 * Aucune donnée réelle, aucun élément nominatif patient, aucun envoi,
 * aucun stockage : uniquement des objets en mémoire.
 */
import type {
  AdminDocument,
  AdminTask,
  CompletionCertificate,
  MessageTemplate,
  PlatformSupervisionRow,
  SendHistoryItem,
} from "@/domain/administration";
import { RETENTION_TBD_FR } from "@/domain/administration";
import type {
  CaseDiscussion,
  CompetenceConfirmation,
  PlacementReport,
  ProfessionalMessage,
  SupervisionAlert,
} from "@/domain/supervision";

export const supervisionAlerts: readonly SupervisionAlert[] = [
  {
    id: "sal-1",
    kind: "missing_quota",
    severity: "warning",
    programId: "prog-diu-echo",
    enrollmentId: "enr-diu",
    message: "18 examens sur 30 attendus pour le module 2 : quota non atteint à mi-stage.",
    dueOn: "2026-09-20T00:00:00Z",
  },
  {
    id: "sal-2",
    kind: "underexposed_competence",
    severity: "warning",
    programId: "prog-diu-echo",
    enrollmentId: "enr-diu",
    message: "Valvulopathie aortique : aucune situation réelle observée depuis 3 semaines.",
  },
  {
    id: "sal-3",
    kind: "low_activity",
    severity: "critical",
    programId: "prog-diu-echo",
    enrollmentId: "enr-diu-autre",
    message: "Aucune entrée de carnet depuis 12 jours.",
  },
  {
    id: "sal-4",
    kind: "late_validation",
    severity: "critical",
    programId: "prog-diu-echo",
    enrollmentId: "enr-diu-autre",
    message: "Un carnet soumis attend une décision depuis 9 jours.",
    dueOn: "2026-09-12T00:00:00Z",
  },
  {
    id: "sal-5",
    kind: "no_entry",
    severity: "info",
    programId: "prog-dfasm-cardio",
    enrollmentId: "enr-dfasm",
    message: "Stage non commencé : première saisie attendue après le 1er septembre.",
  },
];

export const caseDiscussions: readonly CaseDiscussion[] = [
  {
    id: "cas-1",
    programId: "prog-diu-echo",
    enrollmentId: "enr-diu",
    kind: "case_to_discuss",
    title: "Discordance sur une FEVG limite",
    body: "Mesure Simpson biplan à 48 % contre estimation visuelle à 40 % : méthode à revoir ensemble.",
    handled: false,
    comments: [
      {
        authorPersonId: "per-learner",
        body: "Cadence d'images faible, je souhaiterais refaire la mesure encadrée.",
        at: "2026-09-08T10:12:00Z",
      },
    ],
  },
  {
    id: "cas-2",
    programId: "prog-diu-echo",
    enrollmentId: "enr-diu-autre",
    kind: "learner_question",
    title: "Quelles incidences pour un doute de RAo serré ?",
    body: "Question théorique sur l'ordre des incidences et les mesures indispensables.",
    handled: true,
    comments: [
      {
        authorPersonId: "per-supervisor",
        body: "Réponse donnée en staff : Vmax, gradient moyen, ITV sous-aortique, surface par équation de continuité.",
        at: "2026-09-05T16:40:00Z",
      },
    ],
  },
  {
    id: "cas-3",
    programId: "prog-dfasm-cardio",
    enrollmentId: "enr-dfasm",
    kind: "case_to_discuss",
    title: "Raisonnement devant une douleur thoracique atypique",
    body: "Hiérarchisation des hypothèses à reprendre avec l'étudiant lors du prochain point.",
    handled: false,
    comments: [],
  },
];

export const competenceConfirmations: readonly CompetenceConfirmation[] = [
  {
    id: "cco-1",
    programId: "prog-diu-echo",
    enrollmentId: "enr-diu",
    outcomeId: "out-echo-fevg",
    evidenceTitle: "12 quantifications de FEVG en situation réelle",
    proposedAutonomy: "proficient",
    decision: "pending",
    placementAssignmentId: "pas-echo-1",
  },
  {
    id: "cco-2",
    programId: "prog-diu-echo",
    enrollmentId: "enr-diu-autre",
    outcomeId: "out-echo-valve",
    evidenceTitle: "3 évaluations de valvulopathie aortique observées",
    proposedAutonomy: "novice",
    decision: "needs_more",
    placementAssignmentId: "pas-echo-2",
  },
  {
    id: "cco-3",
    programId: "prog-dfasm-cardio",
    enrollmentId: "enr-dfasm",
    outcomeId: "out-dfasm-obs",
    evidenceTitle: "Observation clinique complète présentée en visite",
    proposedAutonomy: "intermediate",
    decision: "pending",
    placementAssignmentId: "pas-cardio-1",
  },
];

export const placementReports: readonly PlacementReport[] = [
  {
    id: "rep-1",
    programId: "prog-diu-echo",
    enrollmentId: "enr-diu",
    placementAssignmentId: "pas-echo-1",
    volumes: [
      { label: "Examens réalisés", value: "18 / 30" },
      { label: "Examens supervisés", value: "12" },
      { label: "Semaines présentes", value: "6 / 8" },
    ],
    objectives: [
      { label: "Coupes standard", value: "atteint" },
      { label: "Quantification FEVG", value: "en cours" },
      { label: "Valvulopathies", value: "non atteint" },
    ],
    competences: [
      { label: "Acquisition d'images", value: "autonomie partielle" },
      { label: "Mesures quantitatives", value: "supervision rapprochée" },
    ],
    supervisorComment: "Progression régulière, rigueur des mesures à consolider.",
    appraisal: "satisfaisant",
    reservations: "Volume d'examens à compléter avant le bilan final.",
    signature: { signed: false, mode: "simulated" },
    completionCertificateRequested: false,
  },
  {
    id: "rep-2",
    programId: "prog-diu-echo",
    enrollmentId: "enr-diu-autre",
    placementAssignmentId: "pas-echo-2",
    volumes: [
      { label: "Examens réalisés", value: "7 / 30" },
      { label: "Semaines présentes", value: "3 / 8" },
    ],
    objectives: [{ label: "Coupes standard", value: "en cours" }],
    competences: [{ label: "Acquisition d'images", value: "supervision rapprochée" }],
    supervisorComment: "Activité insuffisante à ce stade du stage.",
    appraisal: "insuffisant",
    reservations: "Reprise de la saisie du carnet exigée sous 7 jours.",
    signature: { signed: false, mode: "simulated" },
    completionCertificateRequested: false,
  },
];

export const professionalMessages: readonly ProfessionalMessage[] = [
  {
    id: "msg-1",
    programId: "prog-diu-echo",
    fromPersonId: "per-supervisor",
    toPersonId: "per-learner",
    subject: "Point hebdomadaire de stage",
    body: "Merci de préparer deux dossiers pour la relecture de vendredi.",
    sentAt: "2026-09-07T08:00:00Z",
    kind: "message",
    delivery: "mock_no_send",
  },
  {
    id: "msg-2",
    programId: "prog-diu-echo",
    fromPersonId: "per-supervisor",
    toPersonId: "per-learner-2",
    subject: "Relance — carnet de stage",
    body: "Aucune saisie depuis 12 jours : merci de mettre le carnet à jour.",
    sentAt: "2026-09-10T09:30:00Z",
    kind: "reminder",
    delivery: "mock_no_send",
  },
  {
    id: "msg-3",
    programId: "prog-diu-echo",
    fromPersonId: "per-admin",
    toPersonId: "per-supervisor",
    subject: "Certificats de complétude",
    body: "Les bilans de fin de stage sont attendus avant le 30 septembre.",
    sentAt: "2026-09-09T14:05:00Z",
    kind: "message",
    delivery: "mock_no_send",
  },
];

export const adminDocuments: readonly AdminDocument[] = [
  {
    id: "doc-1",
    programId: "prog-diu-echo",
    enrollmentId: "enr-diu",
    label: "Attestation de responsabilité civile",
    status: "received",
    requestedOn: "2026-08-01T00:00:00Z",
    receivedOn: "2026-08-12T00:00:00Z",
  },
  {
    id: "doc-2",
    programId: "prog-diu-echo",
    enrollmentId: "enr-diu",
    label: "Convention de stage signée",
    status: "requested",
    requestedOn: "2026-08-20T00:00:00Z",
  },
  {
    id: "doc-3",
    programId: "prog-diu-echo",
    enrollmentId: "enr-diu-autre",
    label: "Convention de stage signée",
    status: "missing",
  },
  {
    id: "doc-4",
    programId: "prog-dfasm-cardio",
    enrollmentId: "enr-dfasm",
    label: "Certificat de vaccination",
    status: "received",
    requestedOn: "2026-07-15T00:00:00Z",
    receivedOn: "2026-07-28T00:00:00Z",
  },
];

export const completionCertificates: readonly CompletionCertificate[] = [
  {
    id: "cer-1",
    programId: "prog-diu-echo",
    enrollmentId: "enr-diu",
    status: "requested",
    updatedAt: "2026-09-09T00:00:00Z",
  },
  {
    id: "cer-2",
    programId: "prog-diu-echo",
    enrollmentId: "enr-diu-autre",
    status: "not_requested",
    updatedAt: "2026-09-01T00:00:00Z",
  },
  {
    id: "cer-3",
    programId: "prog-dfasm-cardio",
    enrollmentId: "enr-dfasm",
    status: "not_requested",
    updatedAt: "2026-09-01T00:00:00Z",
  },
];

export const adminTasks: readonly AdminTask[] = [
  {
    id: "tsk-1",
    programId: "prog-diu-echo",
    label: "Relancer 3 conventions de stage manquantes",
    dueOn: "2026-09-18T00:00:00Z",
    priority: "high",
  },
  {
    id: "tsk-2",
    programId: "prog-diu-echo",
    label: "Valider 2 carnets transmis par les responsables de stage",
    dueOn: "2026-09-22T00:00:00Z",
    priority: "medium",
  },
  {
    id: "tsk-3",
    programId: "prog-diu-echo",
    label: "Vérifier les affectations du second semestre",
    dueOn: "2026-10-05T00:00:00Z",
    priority: "low",
  },
  {
    id: "tsk-4",
    programId: "prog-dfasm-cardio",
    label: "Ouvrir le référentiel 2027 en préparation",
    dueOn: "2026-11-02T00:00:00Z",
    priority: "medium",
  },
];

export const messageTemplates: readonly MessageTemplate[] = [
  {
    id: "mtp-1",
    label: "Relance carnet de stage",
    audience: "individuel",
    body: "Votre carnet de stage présente des entrées manquantes. Merci de le compléter.",
  },
  {
    id: "mtp-2",
    label: "Convocation à une séance de simulation",
    audience: "groupe",
    body: "Une séance de simulation est programmée pour votre groupe.",
  },
  {
    id: "mtp-3",
    label: "Information de promotion",
    audience: "promotion",
    body: "Les modalités de validation du module sont disponibles dans vos ressources.",
  },
];

export const sendHistory: readonly SendHistoryItem[] = [
  {
    id: "snd-1",
    programId: "prog-diu-echo",
    templateId: "mtp-1",
    audienceLabel: "3 apprenants sans saisie",
    preparedAt: "2026-09-10T10:00:00Z",
    recipients: 3,
    state: "prepared_not_sent",
  },
  {
    id: "snd-2",
    programId: "prog-diu-echo",
    templateId: "mtp-3",
    audienceLabel: "Promotion 2026-2027",
    preparedAt: "2026-09-02T09:00:00Z",
    recipients: 412,
    state: "prepared_not_sent",
  },
];

export const platformSupervision: readonly PlatformSupervisionRow[] = [
  {
    programId: "prog-diu-echo",
    programLabel: "DIU d'Échocardiographie",
    authorizedAdministrators: ["per-admin"],
    learners: 412,
    aiQuotaLabel: "Quota IA prévu, non actif",
    storageLabel: `Stockage privé prévu · conservation ${RETENTION_TBD_FR}`,
  },
  {
    programId: "prog-dfasm-cardio",
    programLabel: "DFASM Cardiologie",
    authorizedAdministrators: ["per-admin"],
    learners: 98,
    aiQuotaLabel: "Quota IA prévu, non actif",
    storageLabel: `Stockage privé prévu · conservation ${RETENTION_TBD_FR}`,
  },
];

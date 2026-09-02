/**
 * « Concepteur de programme » — atelier complet, en un seul onglet.
 *
 * Tout se fait ICI : choix ou création du modèle, objectifs pédagogiques,
 * analyse IA (maquette) proposant les ressources nécessaires, implémentation
 * immédiate ou différée de chaque ressource, puis préparation et association
 * de la promotion. Le seul lien sortant est le passage au pilotage, une fois
 * le programme conçu et la promotion associée.
 */
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  FileCheck,
  FileUp,
  Target,
  Users,
  Notebook,
  Check,
  Save,
  Loader2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, MockBadge, PanelCard, ScopeNotice } from "@/features/professional/mock-ui";
import {
  AdminWorkLevelBanner,
  type AdminWorkLevel,
} from "@/features/administration/AdminWorkLevel";
import { useProgramAdmin } from "@/features/administration/useProgramAdmin";
import { CorpusImport } from "@/features/administration/CorpusImport";
import { useDataAccess } from "@/application/session";
import {
  corpusToText,
  isLegacyDoc,
  isZipFile,
  readDocumentCorpus,
  readableFormat,
} from "@/infrastructure/text/documentText";
import { CohortForm } from "@/features/administration/CohortForm";
import { ProgramAssociationList } from "@/features/administration/ProgramAssociationList";
import { CohortSealPanel } from "@/features/administration/CohortSealPanel";
import { ProgramMilestonePlanner } from "@/features/administration/ProgramMilestonePlanner";
import { outcomeAssociationItems } from "@/domain/outcomeAssociation";
import { PlacementCreationForm } from "@/features/administration/PlacementCreationForm";
import { CompetenceCreationForm } from "@/features/administration/CompetenceCreationForm";
import { DocumentRequirementForm } from "@/features/administration/DocumentRequirementForm";
import { KnowledgeCreationForm } from "@/features/administration/KnowledgeCreationForm";
import { AssessmentModalityForm } from "@/features/administration/AssessmentModalityForm";
import { ProgramAiReferentialAnalysis } from "@/features/administration/ProgramAiReferentialAnalysis";
import { useLocalDocumentRequirements } from "@/application/documentRequirementStore";
import { useLocalPlacements } from "@/application/placementDraftStore";

import type { CohortId, OutcomeId, ProgramId } from "@/domain/types";
import { formatFrDate } from "@/features/administration/adminProgramViewModel";

/* ------------------------------------------------------------------ */
/* Ressources du programme                                             */
/* ------------------------------------------------------------------ */

type ResourceKind = "knowledge" | "competences" | "assessments" | "stage" | "documents";
type ResourceMode = "now" | "later" | "existing";

const RESOURCES: readonly {
  readonly id: ResourceKind;
  readonly label: string;
  readonly icon: typeof BookOpen;
  readonly hint: string;
  readonly keywords: readonly string[];
  readonly draftLabel: string;
  readonly draftPlaceholder: string;
}[] = [
  {
    id: "knowledge",
    label: "Base de connaissances propre au programme",
    icon: BookOpen,
    hint: "Supports, cours, documents et QCM de connaissance.",
    keywords: ["cours", "connaissance", "théorie", "support", "qcm", "savoir"],
    draftLabel: "Premiers modules de connaissance (un par ligne)",
    draftPlaceholder: "Anatomie échographique\nDoppler : bases physiques",
  },
  {
    id: "competences",
    label: "Liste de compétences visées",
    icon: Target,
    hint: "Compétences simulées et compétences en situation réelle.",
    keywords: ["compétence", "geste", "savoir-faire", "acquisition", "maîtrise"],
    draftLabel: "Compétences visées (une par ligne)",
    draftPlaceholder: "Réaliser une ETT complète\nMesurer la FEVG",
  },
  {
    id: "assessments",
    label: "Évaluations du programme",
    icon: ClipboardCheck,
    hint: "Examens, ECOS, simulations et grilles de notation.",
    keywords: ["évaluation", "examen", "ecos", "simulation", "note", "certification"],
    draftLabel: "Évaluations prévues (une par ligne)",
    draftPlaceholder: "Examen écrit de fin de module\nECOS de synthèse",
  },
  {
    id: "stage",
    label: "Stage",
    icon: Notebook,
    hint: "Type de stage, lieux, dates et mode de validation.",
    keywords: ["stage", "terrain", "carnet", "service", "clinique", "encadrant"],
    draftLabel: "Terrains et modalités de stage (un par ligne)",
    draftPlaceholder: "CHU cardiologie — 4 semaines\nCarnet validé par l'encadrant",
  },
  {
    id: "documents",
    label: "Pièces administratives exigées",
    icon: FileCheck,
    hint: "Pièces à fournir, échéance, qui les dépose et qui les valide.",
    keywords: ["document", "pièce", "attestation", "convention", "certificat", "assurance"],
    draftLabel: "Pièces exigées (une par ligne)",
    draftPlaceholder: "Attestation d'assurance\nConvention de stage signée",
  },
];

interface ResourceState {
  readonly selected: boolean;
  readonly mode: ResourceMode;
  readonly draft: string;
  readonly implemented: boolean;
}

const INITIAL_RESOURCE: ResourceState = {
  selected: false,
  mode: "now",
  draft: "",
  implemented: false,
};

const MODE_LABELS: Record<ResourceMode, string> = {
  now: "Implémenter maintenant",
  later: "Plus tard",
  existing: "Réutiliser l'existant",
};

/* ------------------------------------------------------------------ */
/* Planning général (étape 3)                                          */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Import de fichiers d'objectifs (PDF / Word / texte)                */
/* ------------------------------------------------------------------ */

/** API mammoth.js minimale utilisée ici (chargée en global via un <script>). */
/* ------------------------------------------------------------------ */
/* Écran                                                              */
/* ------------------------------------------------------------------ */

/**
 * Liste d'éléments rattachés au programme, avec deux gestes distincts.
 *
 * La case à cocher ne déclenche RIEN par elle-même : elle porte l'état
 * « retenue pour le parcours ». Cocher puis décocher laisse la base
 * inchangée tant qu'aucun bouton n'a été utilisé. Décocher ne fait pas
 * disparaître l'élément : il reste dans la liste, simplement hors parcours.
 *
 * Deux boutons, deux effets qu'il faut pouvoir distinguer d'un coup d'œil :
 *
 *   1. « Activer les sélections » enregistre l'état des cases. Ce qui est
 *      coché devient retenu, ce qui ne l'est pas sort du parcours sans être
 *      supprimé ni archivé.
 *   2. « Retirer du programme » archive les éléments cochés : ils quittent
 *      les listes actives mais restent en base, récupérables.
 *
 * `onSetRetained` est facultatif : les modalités d'évaluation n'ont pas
 * d'état « retenue », leur liste n'affiche donc que le second bouton.
 */
const STEP_ANCHORS: Record<AdminWorkLevel, string> = {
  program: "concepteur-etape-1",
  promotion: "concepteur-etape-2",
  schedule: "concepteur-etape-3",
  operations: "concepteur-etape-4",
};

/**
 * Les quatre étapes vivent dans la même page : y « naviguer » veut donc dire
 * faire défiler. Le focus suit le défilement, sinon la navigation n'existerait
 * qu'à l'œil et pas au clavier.
 *
 * Défilement immédiat, et non `behavior: "smooth"` : mesuré le 02/09, le
 * défilement doux ne bouge pas d'un pixel sur cette page — la hauteur du
 * document change encore pendant l'animation, et Chrome l'abandonne en
 * silence. Un saut direct est de toute façon plus lisible sur téléphone, où
 * les 5 600 pixels qui séparent l'étape 1 de l'étape 3 défileraient pendant
 * plusieurs secondes.
 */
function scrollToStep(step: AdminWorkLevel) {
  const target = document.getElementById(STEP_ANCHORS[step]);
  if (target === null) return;
  target.scrollIntoView({ block: "start" });
  target.focus({ preventScroll: true });
}

export function AdminProgramDesigner() {
  const { data, isPending, refetch } = useProgramAdmin();

  const [modelId, setModelId] = useState<string | null>(null);
  const [modelName, setModelName] = useState("");
  const [objectives, setObjectives] = useState("");
  const [importedFile, setImportedFile] = useState<string | null>(null);
  const [importingObjectives, setImportingObjectives] = useState(false);
  const [importObjectivesError, setImportObjectivesError] = useState<string | null>(null);
  const [resources, setResources] = useState<Record<ResourceKind, ResourceState>>({
    knowledge: INITIAL_RESOURCE,
    competences: INITIAL_RESOURCE,
    assessments: INITIAL_RESOURCE,
    stage: INITIAL_RESOURCE,
    documents: INITIAL_RESOURCE,
  });

  const [cohortMode, setCohortMode] = useState<"existing" | "new">("existing");
  const [selectedCohortId, setSelectedCohortId] = useState<string | null>(null);
  const [associated, setAssociated] = useState<string | null>(null);
  const [programStartsOn, setProgramStartsOn] = useState("");
  const [programEndsOn, setProgramEndsOn] = useState("");
  const localPlacements = useLocalPlacements(data?.program?.id);
  const localRequirements = useLocalDocumentRequirements(data?.program?.id);
  const dataAccess = useDataAccess();
  const [draftLoadedForProgramId, setDraftLoadedForProgramId] = useState<string | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  // Retrait (archivage réversible) d'une connaissance/compétence/modalité
  // déjà associée au programme, depuis la case à cocher de la liste.
  const [archivingIds, setArchivingIds] = useState<ReadonlySet<string>>(new Set());
  const [archiveError, setArchiveError] = useState<string | null>(null);

  const existingCounts = useMemo<Record<ResourceKind, number>>(
    () => ({
      knowledge:
        (data?.resources.length ?? 0) +
        (data?.outcomes.filter((o) => o.nature === "knowledge").length ?? 0),
      competences: data?.outcomes.filter((o) => o.nature !== "knowledge").length ?? 0,
      assessments: data?.assessmentModalities.length ?? 0,
      stage:
        (data?.placements.length ?? 0) + (data?.templates.length ?? 0) + localPlacements.length,
      documents: localRequirements.length,
    }),
    [data, localPlacements, localRequirements],
  );

  useEffect(() => {
    const programId = data?.program?.id;
    if (!programId || draftLoadedForProgramId === programId) return;
    const draft = data?.program?.designDraft as Record<string, unknown> | null | undefined;

    // CHAQUE champ est réécrit, y compris quand le brouillon est absent ou
    // incomplet. Auparavant seuls les champs présents dans le brouillon
    // étaient posés : passer d'un programme conçu à un programme vierge
    // laissait à l'écran les objectifs du précédent. Pire, la sauvegarde
    // automatique les enregistrait alors comme brouillon du nouveau
    // programme, sans que rien ne le signale.
    const draftModelId = draft && "modelId" in draft ? (draft["modelId"] as string | null) : null;
    setModelId(draftModelId);

    const draftModelName =
      draft && typeof draft["modelName"] === "string" ? draft["modelName"] : "";
    if (draftModelName) {
      setModelName(draftModelName);
    } else if (draftModelId) {
      // Brouillons enregistrés avant que ce champ ne soit alimenté : on
      // affiche a minima le nom de la version sélectionnée, modifiable.
      const selected = data?.versions.find((v) => v.id === draftModelId);
      setModelName(selected ? selected.label : "");
    } else {
      setModelName("");
    }

    setObjectives(draft && typeof draft["objectives"] === "string" ? draft["objectives"] : "");
    setResources(
      draft && draft["resources"]
        ? (draft["resources"] as typeof resources)
        : {
            knowledge: INITIAL_RESOURCE,
            competences: INITIAL_RESOURCE,
            assessments: INITIAL_RESOURCE,
            stage: INITIAL_RESOURCE,
            documents: INITIAL_RESOURCE,
          },
    );
    setCohortMode(
      draft && (draft["cohortMode"] === "existing" || draft["cohortMode"] === "new")
        ? draft["cohortMode"]
        : "existing",
    );
    setSelectedCohortId(
      draft && "selectedCohortId" in draft ? (draft["selectedCohortId"] as string | null) : null,
    );
    setProgramStartsOn(
      draft && typeof draft["programStartsOn"] === "string" ? draft["programStartsOn"] : "",
    );
    setProgramEndsOn(
      draft && typeof draft["programEndsOn"] === "string" ? draft["programEndsOn"] : "",
    );

    // Repères d'écran propres au programme quitté.
    setImportedFile(null);
    setAssociated(null);
    setDraftSavedAt(null);
    setDraftError(null);

    persistedDraftRef.current = null;
    setDraftLoadedForProgramId(programId);
  }, [data?.program?.id, data?.program?.designDraft, draftLoadedForProgramId]);

  const draftPayload = useMemo(
    () => ({
      modelId,
      modelName,
      objectives,
      resources,
      cohortMode,
      selectedCohortId,
      programStartsOn,
      programEndsOn,
    }),
    [
      modelId,
      modelName,
      objectives,
      resources,
      cohortMode,
      selectedCohortId,
      programStartsOn,
      programEndsOn,
    ],
  );

  /**
   * Dernier état réellement enregistré pour ce programme. Sert de repère à la
   * sauvegarde automatique : sans lui, la simple visite d'un programme vierge
   * y écrirait un brouillon vide.
   */
  const persistedDraftRef = useRef<string | null>(null);

  const handleSaveDraft = async () => {
    const programId = data?.program?.id;
    if (!programId) return;
    setSavingDraft(true);
    setDraftError(null);
    try {
      await dataAccess.programs.saveProgramDesignDraft(programId, draftPayload);
      persistedDraftRef.current = JSON.stringify(draftPayload);
      setDraftSavedAt(new Date().toISOString());
    } catch (err) {
      setDraftError(err instanceof Error ? err.message : "Échec de l'enregistrement du brouillon.");
    } finally {
      setSavingDraft(false);
    }
  };

  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Import d'un fichier d'objectifs : le texte est extrait par le module
   * partagé `documentText` (PDF, Word .docx, .txt, .md, ou archive ZIP) et
   * ajouté au champ « Objectifs pédagogiques ».
   *
   * Cet import-ci ne CONSERVE pas les fichiers : il ne sert qu'à nourrir le
   * texte des objectifs. Pour déposer un corpus dans la médiathèque et en
   * tirer des connaissances rattachées à leur document source, c'est
   * `KnowledgeCorpusImport`, dans le bloc « Base de connaissances ».
   */
  const handleObjectivesFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ""; // permet de réimporter le même fichier ensuite
    if (!file) return;

    setImportedFile(file.name);
    setImportObjectivesError(null);

    if (isLegacyDoc(file.name)) {
      setImportObjectivesError(
        "Format .doc non pris en charge : enregistrez le fichier au format .docx puis réimportez-le.",
      );
      return;
    }
    // autre format : maquette (nom du fichier seulement)
    if (!isZipFile(file) && readableFormat(file.name) === null) return;

    setImportingObjectives(true);
    try {
      const { documents, ignored } = await readDocumentCorpus(file);
      const extracted = corpusToText(documents);

      if (extracted) {
        setObjectives((prev) => (prev.trim() ? `${prev.trim()}\n\n${extracted}` : extracted));
        // Les fichiers non lus sont signalés même quand l'import réussit :
        // sans ça, une archive à moitié lue passerait pour complète.
        if (ignored.length > 0) {
          setImportObjectivesError(
            `${ignored.length} fichier(s) non lus (format non pris en charge ou sans texte) : ${ignored.slice(0, 5).join(", ")}${ignored.length > 5 ? "…" : ""}`,
          );
        }
      } else {
        setImportObjectivesError(
          isZipFile(file)
            ? "Aucun texte lisible dans cette archive : elle doit contenir des PDF, des .docx, des .txt ou des .md."
            : "Aucun texte détecté dans ce fichier.",
        );
      }
    } catch (err) {
      setImportObjectivesError(
        err instanceof Error ? err.message : "Échec de la lecture du fichier.",
      );
    } finally {
      setImportingObjectives(false);
    }
  };

  /**
   * Retirer du programme les éléments sélectionnés. L'archivage est
   * réversible : ils disparaissent des listes actives mais restent
   * récupérables, aucune suppression définitive.
   *
   * Le lot est traité en une passe, avec un seul rechargement à la fin.
   */
  const removeAssociations = async (
    ids: readonly string[],
    archive: (id: string) => Promise<unknown>,
  ) => {
    if (ids.length === 0) return;
    setArchiveError(null);
    setArchivingIds((prev) => new Set([...prev, ...ids]));
    try {
      for (const id of ids) await archive(id);
      await refetch();
    } catch (err) {
      setArchiveError(err instanceof Error ? err.message : "Échec du retrait de l'élément.");
    } finally {
      setArchivingIds((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.delete(id);
        return next;
      });
    }
  };

  /**
   * Liste des éléments que le programme possède DÉJÀ pour cette ressource,
   * avec leurs cases « retenue pour le parcours ».
   *
   * Rendue à l'identique dans « Implémenter maintenant » et dans « Réutiliser
   * l'existant » : ce sont deux façons d'arriver au même stock, pas deux
   * stocks. Un élément déposé depuis l'onglet dédié appartient déjà à ce
   * programme — « réutiliser » ne le rattache pas, il le retient.
   */
  const renderAssociationsFor = (resourceId: ResourceKind) => {
    // Le helper est défini avant la garde de chargement de l'écran.
    if (!data) return null;
    if (resourceId === "knowledge" || resourceId === "competences") {
      const isKnowledge = resourceId === "knowledge";
      return (
        <ProgramAssociationList
          title={
            isKnowledge
              ? "Liste des connaissances déjà associées à ce programme"
              : "Liste des compétences déjà associées à ce programme"
          }
          /*
           * Les MÊMES lignes que dans l'onglet dédié : repliées par chapitre,
           * filtrables par rang, dans l'ordre du référentiel. Le Concepteur les
           * construisait à part, et rendait donc 327 connaissances à plat — même
           * stock, deux visages, et personne ne s'y retrouvait.
           */
          items={outcomeAssociationItems(
            data.outcomes.filter((o) =>
              isKnowledge ? o.nature === "knowledge" : o.nature !== "knowledge",
            ),
            data.outcomeThemes,
          )}
          busyIds={archivingIds}
          removeLabel="Retirer du programme"
          onRemove={(ids) =>
            void removeAssociations(ids, (id) =>
              dataAccess.outcomes.archiveOutcome(id as OutcomeId),
            )
          }
          /*
           * Retenir des acquis DÉJÀ présents vaut implémentation de la
           * ressource.
           *
           * Avant le 02/09, `implemented` ne passait à vrai que dans le
           * `onCreated` des formulaires de création. Un programme dont le
           * référentiel existait déjà — 349 connaissances importées — ne
           * pouvait donc jamais satisfaire « Implémenter maintenant » : l'écran
           * attendait un 350e élément pour débloquer l'étape 2. Décider quels
           * acquis entrent au parcours EST l'implémentation de cette ressource ;
           * en créer un de plus n'y ajoutait rien.
           *
           * Vrai aussi quand la décision est de tout décocher : ce qui compte
           * est que le concepteur ait tranché, pas le sens dans lequel.
           */
          onSetRetained={async (ids, retained) => {
            await setOutcomesRetained(ids, retained);
            patch(resourceId, { implemented: true });
          }}
        />
      );
    }
    if (resourceId === "assessments") {
      return (
        <ProgramAssociationList
          title="Liste des modalités d'évaluation déjà associées à ce programme"
          items={data.assessmentModalities.map((modality) => ({
            id: modality.id,
            label: modality.name,
          }))}
          busyIds={archivingIds}
          removeLabel="Retirer du programme"
          onRemove={(ids) =>
            void removeAssociations(ids, (id) =>
              dataAccess.assessments.archiveAssessmentModality(id),
            )
          }
        />
      );
    }
    return null;
  };

  /**
   * Enregistre l'état « retenue » d'un lot d'acquis, puis relit la liste.
   * Le rechargement est indispensable : c'est lui qui refait descendre l'état
   * enregistré dans la liste, et donc qui referme l'écart entre les cases
   * affichées et la base.
   */
  const setOutcomesRetained = async (ids: readonly string[], retained: boolean) => {
    if (ids.length === 0) return;
    await dataAccess.outcomes.setOutcomesRetained(ids as readonly OutcomeId[], retained);
    await refetch();
  };

  // Sauvegarde automatique (avec anti-rebond) du brouillon dès qu'un champ
  // change, pour ne pas dépendre d'un clic sur « Enregistrer le brouillon ».
  // On attend que le chargement initial du brouillon soit terminé pour ce
  // programme afin de ne pas réécrire par-dessus lui au montage.
  useEffect(() => {
    if (draftLoadedForProgramId !== data?.program?.id) return;
    const current = JSON.stringify(draftPayload);
    // Premier passage après le chargement : on note l'état de départ sans rien
    // enregistrer. Sinon, ouvrir un programme vierge suffirait à lui créer un
    // brouillon vide.
    if (persistedDraftRef.current === null) {
      persistedDraftRef.current = current;
      return;
    }
    // Rien n'a bougé depuis le dernier enregistrement : ne pas réécrire.
    if (persistedDraftRef.current === current) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      void handleSaveDraft();
    }, 1200);
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    draftLoadedForProgramId,
    data?.program?.id,
    modelId,
    modelName,
    objectives,
    resources,
    cohortMode,
    selectedCohortId,
    programStartsOn,
    programEndsOn,
  ]);

  if (isPending || !data) return <Skeleton className="h-80 w-full" />;

  const cohorts = data.cohorts;
  const activeProgramId = (data.program?.id ?? "program-unknown") as ProgramId;
  /** Création réelle (classe, compétence, connaissance) : exige une vraie version de curriculum. */
  const realCurriculumVersionId = data.versions[0]?.id;

  const selectedVersion = data.versions.find((v) => v.id === modelId) ?? null;
  /** Version « en cours » (brouillon) : son nom/objectifs restent modifiables ici même. */
  const editingExistingDraft = selectedVersion?.status === "draft";
  /** Modèle finalisé/archivé sélectionné : on ne réécrit pas son nom depuis cet écran. */
  const modelFieldsLocked = selectedVersion !== null && !editingExistingDraft;

  const modelReady = modelId !== null || modelName.trim().length > 0;
  const chosenResources = RESOURCES.filter((r) => resources[r.id].selected);
  const pendingResources = chosenResources.filter(
    (r) => resources[r.id].mode === "now" && !resources[r.id].implemented,
  );
  const designReady = modelReady && chosenResources.length > 0 && pendingResources.length === 0;

  /*
   * Le motif du blocage, NOMMÉ.
   *
   * Le message disait « implémentations en attente réglées » sans dire
   * laquelle : impossible de savoir où regarder dans six ressources dépliées.
   * Stef, le 02/09 : « que faut-il valider dans l'étape 1 ? » — la question ne
   * se poserait pas si l'écran répondait.
   */
  const designBlockedReason = !modelReady
    ? "Choisissez ou nommez d'abord un modèle de programme (étape 1)."
    : chosenResources.length === 0
      ? "Cochez au moins une ressource du programme (étape 1)."
      : pendingResources.length > 0
        ? `En attente dans l'étape 1 : ${pendingResources.map((r) => r.label).join(", ")}. Créez-y un élément, ou passez ${pendingResources.length > 1 ? "ces ressources" : "cette ressource"} sur « Réutiliser l'existant » ou « Plus tard ».`
        : "";

  const boundsInvalid =
    programStartsOn !== "" && programEndsOn !== "" && programEndsOn < programStartsOn;

  /**
   * Le rétroplanning ne conditionne PAS le passage au pilotage.
   *
   * Avant, il le conditionnait — mais sur des échéances de maquette qui
   * n'allaient nulle part. Maintenant qu'elles sont réelles, elles sont aussi
   * facultatives : un chapitre « non daté » reste un état valide et durable, et
   * une promotion peut démarrer avant que tous ses jalons soient posés. Bloquer
   * le pilotage sur un planning complet interdirait de commencer.
   */
  /** La promotion choisie, telle que la base la connaît — pas un état d'écran. */
  const selectedCohort = cohorts.find((c) => c.id === selectedCohortId);

  /*
   * LE PILOTAGE S'OUVRE SUR UNE PROMOTION OUVERTE.
   *
   * La condition était `associated !== null` : un état local de React, remis à
   * null à chaque rechargement. Le concepteur avait bien associé sa promotion,
   * l'écran l'oubliait au premier F5, et le bouton réclamait un clic déjà fait.
   * Stef, le 02/09 : « mais piloter reste grisé ».
   *
   * Le statut de la promotion dit la même chose, en mieux : il survit au
   * rechargement, et il DONNE SON EFFET AU SCEAU. Piloter un brouillon n'aurait
   * de toute façon aucun sens — il n'y a rien à suivre tant que la promotion
   * n'est pas ouverte.
   */
  const readyForPilot =
    designReady &&
    selectedCohort !== undefined &&
    selectedCohort.status !== "draft" &&
    !boundsInvalid;

  const pilotBlockedReason = !designReady
    ? designBlockedReason
    : selectedCohort === undefined
      ? "Choisissez la promotion à piloter (étape 2)."
      : selectedCohort.status === "draft"
        ? "Ouvrez d'abord la promotion ci-dessus : on ne pilote pas un brouillon."
        : boundsInvalid
          ? "Les dates du programme sont incohérentes (étape 3)."
          : "";

  const patch = (id: ResourceKind, next: Partial<ResourceState>) =>
    setResources((prev) => ({ ...prev, [id]: { ...prev[id], ...next } }));

  return (
    <div className="space-y-6">
      <div className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 id="concepteur-de-programme" className="text-2xl font-semibold">
            Concepteur de programme
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            {draftError ? (
              <span className="text-destructive text-xs">{draftError}</span>
            ) : draftSavedAt ? (
              <span className="text-muted-foreground text-xs">
                Brouillon enregistré à{" "}
                {new Date(draftSavedAt).toLocaleTimeString("fr-FR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="min-h-11"
              disabled={savingDraft}
              onClick={() => void handleSaveDraft()}
            >
              {savingDraft ? (
                <Loader2 className="me-1 size-4 animate-spin" aria-hidden />
              ) : (
                <Save className="me-1 size-4" aria-hidden />
              )}
              Enregistrer le brouillon
            </Button>
            <MockBadge />
          </div>
        </div>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Concevez le programme et préparez sa promotion sans quitter cet onglet. Le brouillon
          (modèle, objectifs, planning) est enregistré automatiquement au fil de la saisie, avant
          finalisation.
        </p>
      </div>

      <AdminWorkLevelBanner
        onSelect={scrollToStep}
        level="program"
        programName={data.program?.name ?? "Programme sélectionné"}
        cohortCount={data.cohorts.length}
      />

      <ScopeNotice>
        Tout ce qui est créé ici alimente directement les onglets correspondants (Base de
        connaissances, Compétences, Évaluations, Gestion des stages, Classes d'apprenants) — et
        réciproquement.
      </ScopeNotice>

      {/* ---------------- Étape 1 : concevoir ---------------- */}
      <PanelCard
        id={STEP_ANCHORS.program}
        title="1. Concevoir le programme"
        description="Partez d'un modèle existant ou créez-en un, puis laissez l'analyse proposer les ressources."
        action={
          <Badge variant={designReady ? "secondary" : "outline"} className="font-normal">
            {designReady ? "conception prête" : "en cours"}
          </Badge>
        }
      >
        {/* a) modèle existant */}
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Sélectionner un modèle existant</legend>
          {data.versions.length === 0 ? (
            <EmptyState>Aucun modèle de programme enregistré.</EmptyState>
          ) : (
            <ul className="space-y-2">
              {data.versions.map((version) => {
                const active = modelId === version.id;
                return (
                  <li key={version.id}>
                    <button
                      type="button"
                      onClick={() => {
                        const next = active ? null : version.id;
                        setModelId(next);
                        setModelName(next ? version.label : "");
                      }}
                      aria-pressed={active}
                      className={`flex min-h-11 w-full flex-wrap items-center gap-2 rounded-md border p-3 text-start text-sm ${
                        active ? "border-primary bg-primary/5" : "border-border"
                      }`}
                    >
                      <span className="font-medium">{version.label}</span>
                      <Badge variant="outline" className="font-normal">
                        {version.status}
                      </Badge>
                      <span className="text-muted-foreground text-xs">
                        depuis {formatFrDate(version.effectiveFrom)}
                      </span>
                      {active ? (
                        <Check className="text-primary ms-auto size-4" aria-hidden />
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </fieldset>

        {/* b) création ou édition du modèle en cours */}
        <fieldset className="border-border space-y-3 rounded-md border p-4">
          <legend className="px-1 text-sm font-medium">
            {editingExistingDraft
              ? "Modèle en cours et ses objectifs pédagogiques"
              : "Sinon, créer le modèle et ses objectifs pédagogiques"}
          </legend>
          <div className="space-y-1.5">
            <Label htmlFor="model-name">Nom du modèle</Label>
            <Input
              id="model-name"
              value={modelName}
              disabled={modelFieldsLocked}
              onChange={(event) => setModelName(event.target.value)}
              placeholder="Référentiel 2026 — échocardiographie"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="objectives">Objectifs pédagogiques (texte libre)</Label>
            <Textarea
              id="objectives"
              rows={5}
              value={objectives}
              onChange={(event) => setObjectives(event.target.value)}
              placeholder="Décrivez les objectifs : connaissances, compétences, évaluations, stage…"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" className="min-h-11" disabled={importingObjectives}>
              <label>
                {importingObjectives ? (
                  <Loader2 className="me-1 size-4 animate-spin" aria-hidden />
                ) : (
                  <FileUp className="me-1 size-4" aria-hidden />
                )}
                Importer un fichier d'objectifs
                <input
                  type="file"
                  accept=".pdf,application/pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.txt,.md,text/plain,.zip,application/zip,application/x-zip-compressed"
                  className="sr-only"
                  disabled={importingObjectives}
                  onChange={(event) => void handleObjectivesFileChange(event)}
                />
              </label>
            </Button>
            {importingObjectives ? (
              <span className="text-muted-foreground text-xs">Lecture du fichier en cours…</span>
            ) : importObjectivesError ? (
              <span className="text-destructive text-xs">{importObjectivesError}</span>
            ) : importedFile ? (
              <span className="text-muted-foreground text-xs">
                {importedFile}
                {/\.(pdf|docx|txt|md|zip)$/i.test(importedFile)
                  ? " — texte ajouté ci-dessus"
                  : " (maquette)"}
              </span>
            ) : null}
          </div>
        </fieldset>

        {/* c) analyse IA du référentiel, à partir des objectifs ci-dessus */}
        <fieldset className="border-border space-y-3 rounded-md border p-4">
          <legend className="px-1 text-sm font-medium">
            Analyse IA du référentiel (connaissances, compétences, évaluations)
          </legend>
          <ProgramAiReferentialAnalysis
            programId={activeProgramId}
            curriculumVersionId={realCurriculumVersionId}
            objectives={objectives}
            existingOutcomeCodes={data.outcomes.map((o) => o.code)}
            existingAssessmentNames={data.assessmentModalities.map((m) => m.name)}
            onCreated={() => void refetch()}
          />
        </fieldset>

        {/* d) ressources du programme */}
        <fieldset className="border-border space-y-3 rounded-md border p-4">
          <legend className="px-1 text-sm font-medium">Ressources du programme</legend>
          <p className="text-muted-foreground text-sm">
            Cochez directement les ressources nécessaires au programme.
          </p>
          {archiveError ? <p className="text-destructive text-sm">{archiveError}</p> : null}

          <div className="space-y-3">
            {RESOURCES.map((resource) => {
              const state = resources[resource.id];
              const Icon = resource.icon;
              return (
                <article
                  key={resource.id}
                  className={`rounded-md border p-4 ${
                    state.selected ? "border-primary/40 bg-primary/5" : "border-border"
                  }`}
                >
                  <div className="flex flex-wrap items-start gap-3">
                    <Checkbox
                      id={`res-${resource.id}`}
                      checked={state.selected}
                      onCheckedChange={(checked) =>
                        patch(resource.id, { selected: checked === true })
                      }
                    />
                    <div className="min-w-0 flex-1">
                      <Label htmlFor={`res-${resource.id}`} className="flex items-center gap-2">
                        <Icon className="text-muted-foreground size-4" aria-hidden />
                        {resource.label}
                      </Label>
                      <p className="text-muted-foreground mt-1 text-xs">{resource.hint}</p>
                      <div className="mt-1 flex flex-wrap gap-2">
                        <Badge variant="outline" className="font-normal">
                          {existingCounts[resource.id]} élément(s) déjà dans l'onglet dédié
                        </Badge>
                      </div>
                    </div>
                  </div>

                  {state.selected ? (
                    <div className="mt-3 space-y-3">
                      <div
                        role="group"
                        aria-label={`Mode d'implémentation — ${resource.label}`}
                        className="flex flex-wrap gap-2"
                      >
                        {(Object.keys(MODE_LABELS) as ResourceMode[]).map((mode) => (
                          <Button
                            key={mode}
                            type="button"
                            size="sm"
                            variant={state.mode === mode ? "default" : "outline"}
                            aria-pressed={state.mode === mode}
                            disabled={mode === "existing" && existingCounts[resource.id] === 0}
                            className="min-h-11"
                            onClick={() => patch(resource.id, { mode })}
                          >
                            {MODE_LABELS[mode]}
                          </Button>
                        ))}
                      </div>

                      {state.mode === "now" && resource.id === "stage" ? (
                        <div className="space-y-3">
                          {localPlacements.length > 0 ? (
                            <div className="space-y-1.5">
                              <p className="text-sm font-medium">
                                Terrains de stage déjà créés dans cette session
                              </p>
                              <ul className="text-muted-foreground space-y-1 text-xs">
                                {localPlacements.map((local) => (
                                  <li key={local.placement.id}>
                                    {local.placement.name} — {local.placement.site} ·{" "}
                                    {local.placement.capacity} place(s)
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                          <div className="space-y-1.5">
                            <p className="text-sm font-medium">Ajouter un terrain de stage</p>
                            <PlacementCreationForm
                              programId={activeProgramId}
                              idPrefix="designer-stage"
                              submitLabel="Créer le terrain de stage"
                              hint="Même outil et même liste que l'onglet « Gestion des stages » : le terrain y apparaît aussitôt, rattaché à ce programme."
                              onCreated={() => patch("stage", { implemented: true })}
                            />
                          </div>
                        </div>
                      ) : null}

                      {state.mode === "now" && resource.id === "competences" ? (
                        <div className="space-y-3">
                          {realCurriculumVersionId ? (
                            <>
                              {renderAssociationsFor("competences")}
                              <div className="space-y-1.5">
                                <p className="text-sm font-medium">
                                  Importer un corpus de compétences
                                </p>
                                <CorpusImport
                                  target="competences"
                                  programId={activeProgramId}
                                  curriculumVersionId={realCurriculumVersionId}
                                  existingOutcomeCodes={data.outcomes.map((o) => o.code)}
                                  onCreated={() => {
                                    patch("competences", { implemented: true });
                                    void refetch();
                                  }}
                                />
                              </div>
                              <div className="space-y-1.5">
                                <p className="text-sm font-medium">Ajouter une compétence</p>
                                <CompetenceCreationForm
                                  programId={activeProgramId}
                                  curriculumVersionId={realCurriculumVersionId}
                                  idPrefix="designer-competence"
                                  submitLabel="Créer la compétence"
                                  hint="Même outil et même liste que l'onglet « Compétences » : elle y apparaît aussitôt, rattachée à ce programme."
                                  onCreated={() => {
                                    patch("competences", { implemented: true });
                                    void refetch();
                                  }}
                                />
                              </div>
                            </>
                          ) : (
                            <EmptyState>
                              Aucune version de curriculum pour ce programme : une compétence ne
                              peut pas encore être créée.
                            </EmptyState>
                          )}
                        </div>
                      ) : null}

                      {state.mode === "now" && resource.id === "documents" ? (
                        <div className="space-y-3">
                          {localRequirements.length > 0 ? (
                            <div className="space-y-1.5">
                              <p className="text-sm font-medium">
                                Pièces déjà exigées dans cette session
                              </p>
                              <ul className="text-muted-foreground space-y-1 text-xs">
                                {localRequirements.map((item) => (
                                  <li key={item.id}>
                                    {item.code} — {item.label}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                          <div className="space-y-1.5">
                            <p className="text-sm font-medium">Ajouter une pièce exigée</p>
                            <DocumentRequirementForm
                              programId={activeProgramId}
                              idPrefix="designer-document"
                              submitLabel="Créer la pièce exigée"
                              hint="Même outil et même liste que l'onglet « Documents et certificats » : la pièce y apparaît aussitôt, rattachée à ce programme."
                              onCreated={() => patch("documents", { implemented: true })}
                            />
                          </div>
                        </div>
                      ) : null}

                      {state.mode === "now" && resource.id === "knowledge" ? (
                        <div className="space-y-3">
                          {realCurriculumVersionId ? (
                            <>
                              {renderAssociationsFor("knowledge")}
                              <div className="space-y-1.5">
                                <p className="text-sm font-medium">
                                  Importer un corpus de connaissances
                                </p>
                                <CorpusImport
                                  target="knowledge"
                                  programId={activeProgramId}
                                  curriculumVersionId={realCurriculumVersionId}
                                  existingOutcomeCodes={data.outcomes.map((o) => o.code)}
                                  onCreated={() => {
                                    patch("knowledge", { implemented: true });
                                    void refetch();
                                  }}
                                />
                              </div>
                              <div className="space-y-1.5">
                                <p className="text-sm font-medium">Ajouter une connaissance</p>
                                <KnowledgeCreationForm
                                  programId={activeProgramId}
                                  curriculumVersionId={realCurriculumVersionId}
                                  idPrefix="designer-knowledge"
                                  submitLabel="Créer la connaissance"
                                  hint="Même outil et même liste que l'onglet « Connaissances » : elle y apparaît aussitôt, rattachée à ce programme."
                                  onCreated={() => {
                                    patch("knowledge", { implemented: true });
                                    void refetch();
                                  }}
                                />
                              </div>
                            </>
                          ) : (
                            <EmptyState>
                              Aucune version de curriculum pour ce programme : une connaissance ne
                              peut pas encore être créée.
                            </EmptyState>
                          )}
                        </div>
                      ) : null}

                      {state.mode === "now" && resource.id === "assessments" ? (
                        <div className="space-y-3">
                          {renderAssociationsFor("assessments")}
                          <div className="space-y-1.5">
                            <p className="text-sm font-medium">Importer un corpus d'évaluations</p>
                            <CorpusImport
                              target="assessments"
                              programId={activeProgramId}
                              curriculumVersionId={realCurriculumVersionId}
                              existingAssessmentNames={data.assessmentModalities.map((m) => m.name)}
                              onCreated={() => {
                                patch("assessments", { implemented: true });
                                void refetch();
                              }}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <p className="text-sm font-medium">Ajouter une modalité d'évaluation</p>
                            <AssessmentModalityForm
                              programId={activeProgramId}
                              idPrefix="designer-assessment"
                              submitLabel="Créer la modalité d'évaluation"
                              hint="Même outil et même liste que l'onglet « Évaluations » : la modalité y apparaît aussitôt, rattachée à ce programme."
                              onCreated={() => {
                                patch("assessments", { implemented: true });
                                void refetch();
                              }}
                            />
                          </div>
                        </div>
                      ) : null}

                      {state.mode === "now" &&
                      resource.id !== "stage" &&
                      resource.id !== "competences" &&
                      resource.id !== "documents" &&
                      resource.id !== "knowledge" &&
                      resource.id !== "assessments" ? (
                        <div className="space-y-2">
                          <Label htmlFor={`draft-${resource.id}`}>{resource.draftLabel}</Label>
                          <Textarea
                            id={`draft-${resource.id}`}
                            rows={3}
                            value={state.draft}
                            placeholder={resource.draftPlaceholder}
                            onChange={(event) =>
                              patch(resource.id, {
                                draft: event.target.value,
                                implemented: false,
                              })
                            }
                          />
                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              type="button"
                              size="sm"
                              className="min-h-11"
                              disabled={state.draft.trim().length === 0}
                              onClick={() => patch(resource.id, { implemented: true })}
                            >
                              Créer dans ce programme
                            </Button>
                            {state.implemented ? (
                              <span className="text-muted-foreground text-xs">
                                {state.draft.split("\n").filter((line) => line.trim()).length}{" "}
                                élément(s) créés ici — visibles ensuite dans l'onglet dédié.
                              </span>
                            ) : null}
                          </div>
                        </div>
                      ) : null}

                      {state.mode === "existing" ? (
                        <div className="space-y-3">
                          <p className="text-muted-foreground text-sm">
                            Les {existingCounts[resource.id]} élément(s) déjà saisis dans l'onglet
                            dédié appartiennent déjà à ce programme. Cochez ceux que ce parcours
                            retient.
                          </p>
                          {renderAssociationsFor(resource.id)}
                        </div>
                      ) : null}

                      {state.mode === "later" ? (
                        <p className="text-muted-foreground text-sm">
                          Ressource retenue mais non implémentée : elle restera à compléter plus
                          tard.
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </fieldset>
      </PanelCard>

      {/* ---------------- Étape 2 : promotion ---------------- */}
      <PanelCard
        id={STEP_ANCHORS.promotion}
        title="2. Préparer et associer la promotion"
        description="Créez la classe ici avec le même outil que l'onglet « Classes d'apprenants », ou réutilisez une classe déjà créée, puis associez-la au programme conçu."
        action={
          <Badge variant={selectedCohort ? "secondary" : "outline"} className="font-normal">
            {selectedCohort ? "promotion associée" : "à associer"}
          </Badge>
        }
      >
        <div className="flex flex-wrap gap-2">
          {(["existing", "new"] as const).map((mode) => (
            <Button
              key={mode}
              type="button"
              size="sm"
              className="min-h-11"
              variant={cohortMode === mode ? "default" : "outline"}
              aria-pressed={cohortMode === mode}
              onClick={() => setCohortMode(mode)}
            >
              <Users className="me-1 size-4" aria-hidden />
              {mode === "existing" ? "Utiliser une classe existante" : "Créer une classe ici"}
            </Button>
          ))}
        </div>

        {cohortMode === "existing" ? (
          cohorts.length === 0 ? (
            <EmptyState>
              Aucune classe rattachée à ce programme : créez-la ici, ou depuis l'onglet « Classes
              d'apprenants ».
            </EmptyState>
          ) : (
            <ul className="space-y-2">
              {cohorts.map((cohort) => {
                const active = selectedCohortId === cohort.id;
                return (
                  <li key={cohort.id}>
                    <button
                      type="button"
                      aria-pressed={active}
                      onClick={() => setSelectedCohortId(active ? null : cohort.id)}
                      className={`flex min-h-11 w-full flex-wrap items-center gap-2 rounded-md border p-3 text-start text-sm ${
                        active ? "border-primary bg-primary/5" : "border-border"
                      }`}
                    >
                      <span className="font-medium">{cohort.label}</span>
                      <span className="text-muted-foreground font-mono text-xs">
                        {formatFrDate(cohort.startsOn)} → {formatFrDate(cohort.endsOn)}
                      </span>
                      <Badge variant="outline" className="font-normal">
                        {cohort.learnerCount} apprenants
                      </Badge>
                    </button>
                  </li>
                );
              })}
            </ul>
          )
        ) : realCurriculumVersionId ? (
          <CohortForm
            idPrefix="designer-cohort"
            programId={activeProgramId}
            curriculumVersionId={realCurriculumVersionId}
            submitLabel="Créer la classe et l'associer"
            hint="La classe créée ici est automatiquement rattachée au programme en conception et apparaît dans l'onglet « Classes d'apprenants »."
            onCreated={(cohort) => {
              void refetch();
              setSelectedCohortId(cohort.id);
              setCohortMode("existing");
              setAssociated(cohort.label);
            }}
          />
        ) : (
          <EmptyState>
            Aucune version de curriculum pour ce programme : une classe ne peut pas encore être
            créée.
          </EmptyState>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            className="min-h-11"
            disabled={!designReady || cohortMode === "new" || !selectedCohortId}
            onClick={() =>
              setAssociated(cohorts.find((c) => c.id === selectedCohortId)?.label ?? null)
            }
          >
            Associer la promotion au programme
          </Button>
          {associated ? (
            <span className="text-muted-foreground text-sm">
              {associated} est associée à {data.program?.name ?? "ce programme"}.
            </span>
          ) : !designReady ? (
            <span className="text-muted-foreground text-sm">{designBlockedReason}</span>
          ) : null}
        </div>
      </PanelCard>

      {/* ---------------- Étape 3 : planning général ---------------- */}
      <PanelCard
        id={STEP_ANCHORS.schedule}
        title="3. Programmer le planning général du programme"
        description="Chaque chapitre du programme peut recevoir une semaine, une période, ou rester non daté. Les semaines se comptent depuis le début de la promotion choisie."
        action={
          <Badge variant="outline" className="font-normal">
            enregistré par promotion
          </Badge>
        }
      >
        <fieldset className="border-border space-y-3 rounded-md border p-4">
          <legend className="px-1 text-sm font-medium">Bornes du programme</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="program-starts-on">Début du programme</Label>
              <Input
                id="program-starts-on"
                type="date"
                value={programStartsOn}
                onChange={(event) => setProgramStartsOn(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="program-ends-on">Fin du programme</Label>
              <Input
                id="program-ends-on"
                type="date"
                value={programEndsOn}
                onChange={(event) => setProgramEndsOn(event.target.value)}
              />
            </div>
          </div>
          {boundsInvalid ? (
            <p className="text-destructive text-sm">
              La fin du programme précède son début : corrigez les bornes.
            </p>
          ) : null}
        </fieldset>

        <fieldset className="border-border space-y-3 rounded-md border p-4">
          <legend className="px-1 text-sm font-medium">Jalons de la promotion</legend>
          {/*
            Le VRAI rétroplanning, écrit dans `plan_milestones`. Il remplace la
            maquette qui listait deux échéances génériques par type de ressource
            et n'enregistrait que dans le brouillon de conception : un écran qui
            fait saisir des dates qui ne vont nulle part coûte plus qu'il ne
            rend.
          */}
          <ProgramMilestonePlanner
            programId={activeProgramId}
            cohorts={cohorts}
            themes={data.outcomeThemes}
            outcomes={data.outcomes}
            {...(selectedCohortId ? { defaultCohortId: selectedCohortId as CohortId } : {})}
          />
        </fieldset>
      </PanelCard>

      {/* ---------------- Étape 4 : bascule dans le pilotage ---------------- */}
      <section
        id={STEP_ANCHORS.operations}
        tabIndex={-1}
        className="border-border bg-card flex scroll-mt-20 flex-wrap items-start justify-between gap-3 rounded-lg border p-5"
      >
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <h2 className="text-base font-semibold">4. Ouvrir la promotion, puis piloter</h2>
            <p className="text-muted-foreground text-sm">
              C'est le seul moment où l'on quitte le concepteur : le suivi se fait dans le pilotage.
            </p>
          </div>
          {/*
            Le sceau. Jusqu'au 02/09 cette étape n'était qu'un lien : rien
            n'écrivait jamais `cohorts.status`, toutes les promotions restaient
            des brouillons, et « valider le programme » ne voulait rien dire.
          */}
          <CohortSealPanel cohort={selectedCohort} onChanged={() => void refetch()} />
        </div>
        <Button asChild={readyForPilot} className="min-h-11" disabled={!readyForPilot}>
          {readyForPilot ? (
            <Link to="/espace/administration/pilotage">
              Piloter le programme
              <ArrowRight className="ms-1 size-4" aria-hidden />
            </Link>
          ) : (
            <span>Piloter le programme</span>
          )}
        </Button>
        {readyForPilot ? null : (
          <p className="text-muted-foreground w-full text-xs">{pilotBlockedReason}</p>
        )}
      </section>
    </div>
  );
}

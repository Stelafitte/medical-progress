/**
 * « Concepteur de programme » — atelier complet, en un seul onglet.
 *
 * Tout se fait ICI : choix ou création du modèle, objectifs pédagogiques,
 * analyse IA (maquette) proposant les ressources nécessaires, implémentation
 * immédiate ou différée de chaque ressource, puis préparation et association
 * de la promotion. Le seul lien sortant est le passage au pilotage, une fois
 * le programme conçu et la promotion associée.
 */
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  FileCheck,
  FileUp,
  Sparkles,
  Target,
  Users,
  Notebook,
  Check,
} from "lucide-react";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, MockBadge, PanelCard, ScopeNotice } from "@/features/professional/mock-ui";
import { AdminWorkLevelBanner } from "@/features/administration/AdminWorkLevel";
import { useProgramAdmin } from "@/features/administration/useProgramAdmin";
import { CohortCreationForm } from "@/features/administration/CohortCreationForm";
import { PlacementCreationForm } from "@/features/administration/PlacementCreationForm";
import { CompetenceCreationForm } from "@/features/administration/CompetenceCreationForm";
import { DocumentRequirementForm } from "@/features/administration/DocumentRequirementForm";
import { useLocalDocumentRequirements } from "@/application/documentRequirementStore";
import { useLocalCohorts } from "@/application/cohortDraftStore";
import { useLocalPlacements } from "@/application/placementDraftStore";
import { useLocalCompetences } from "@/application/competenceDraftStore";
import { mergeCohorts } from "@/domain/cohortDraft";

import type { CohortId, CurriculumVersionId, ProgramId } from "@/domain/types";
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

type ScheduleKind = "date" | "period" | "undated";

const SCHEDULE_KIND_LABELS: Record<ScheduleKind, string> = {
  date: "Date unique",
  period: "Période",
  undated: "Non daté",
};

interface ScheduleEntry {
  readonly kind: ScheduleKind;
  readonly from: string;
  readonly to: string;
}

const INITIAL_SCHEDULE: ScheduleEntry = { kind: "date", from: "", to: "" };

/** Échéances proposées pour chaque ressource retenue à l'étape 1. */
const SCHEDULE_TEMPLATE: Record<ResourceKind, readonly { id: string; label: string }[]> = {
  knowledge: [
    { id: "knowledge-release", label: "Mise à disposition des supports pédagogiques" },
    { id: "knowledge-quiz", label: "Ouverture des QCM de connaissance" },
  ],
  competences: [
    { id: "competences-expected", label: "Attendus des compétences" },
    { id: "competences-review", label: "Bilan de validation des compétences" },
  ],
  assessments: [
    { id: "assessments-continuous", label: "Évaluations en cours de programme" },
    { id: "assessments-exam", label: "Examen final" },
  ],
  stage: [
    { id: "stage-start", label: "Début de stage" },
    { id: "stage-logbook-send", label: "Envoi des carnets de stage" },
    { id: "stage-logbook-return", label: "Retour des carnets de stage validés" },
  ],
  documents: [
    { id: "documents-deposit", label: "Dépôt des pièces administratives" },
    { id: "documents-certificate", label: "Délivrance du certificat de complétude" },
  ],
};


/** Analyse (maquette déterministe) des objectifs pédagogiques saisis. */
function analyseObjectives(text: string): readonly ResourceKind[] {
  const haystack = text.toLowerCase();
  const found = RESOURCES.filter((resource) =>
    resource.keywords.some((keyword) => haystack.includes(keyword)),
  ).map((resource) => resource.id);
  return found.length > 0 ? found : ["knowledge"];
}

/* ------------------------------------------------------------------ */
/* Écran                                                              */
/* ------------------------------------------------------------------ */

export function AdminProgramDesigner() {
  const { data, isPending } = useProgramAdmin();

  const [modelId, setModelId] = useState<string | null>(null);
  const [modelName, setModelName] = useState("");
  const [objectives, setObjectives] = useState("");
  const [importedFile, setImportedFile] = useState<string | null>(null);
  const [analysed, setAnalysed] = useState<readonly ResourceKind[] | null>(null);
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
  const localCohorts = useLocalCohorts(data?.program?.id);
  const localPlacements = useLocalPlacements(data?.program?.id);
  const localCompetences = useLocalCompetences(data?.program?.id);
  const localRequirements = useLocalDocumentRequirements(data?.program?.id);

  const existingCounts = useMemo<Record<ResourceKind, number>>(
    () => ({
      knowledge: data?.resources.length ?? 0,
      competences: data?.outcomes.filter((o) => o.nature !== "knowledge").length ?? 0,
      assessments: data?.ecosScenarios.length ?? 0,
      stage:
        (data?.placements.length ?? 0) + (data?.templates.length ?? 0) + localPlacements.length,
      documents: localRequirements.length,
    }),
    [data, localPlacements, localRequirements],
  );


  if (isPending || !data) return <Skeleton className="h-80 w-full" />;

  /** Liste UNIQUE des classes : celles du dépôt et celles créées dans la session. */
  const cohorts = mergeCohorts(data.cohorts, localCohorts);
  const activeProgramId = (data.program?.id ?? "program-unknown") as ProgramId;
  const curriculumVersionId = (data.versions[0]?.id ??
    `cv-${activeProgramId}`) as CurriculumVersionId;

  const modelReady = modelId !== null || modelName.trim().length > 0;
  const chosenResources = RESOURCES.filter((r) => resources[r.id].selected);
  const pendingResources = chosenResources.filter(
    (r) => resources[r.id].mode === "now" && !resources[r.id].implemented,
  );
  const designReady = modelReady && chosenResources.length > 0 && pendingResources.length === 0;
  const readyForPilot = designReady && associated !== null;

  const patch = (id: ResourceKind, next: Partial<ResourceState>) =>
    setResources((prev) => ({ ...prev, [id]: { ...prev[id], ...next } }));

  const runAnalysis = () => {
    const detected = analyseObjectives(`${objectives} ${importedFile ?? ""}`);
    setAnalysed(detected);
    setResources((prev) => {
      const next = { ...prev };
      for (const kind of detected) {
        next[kind] = {
          ...next[kind],
          selected: true,
          mode: existingCounts[kind] > 0 ? "existing" : "now",
        };
      }
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <SectionHeading
        title="Concepteur de programme"
        level={1}
        action={<MockBadge />}
        description="Concevez le programme et préparez sa promotion sans quitter cet onglet."
      />

      <AdminWorkLevelBanner
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
          <legend className="text-sm font-medium">a. Sélectionner un modèle existant</legend>
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
                        setModelId(active ? null : version.id);
                        if (!active) setModelName("");
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
                      {active ? <Check className="text-primary ms-auto size-4" aria-hidden /> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </fieldset>

        {/* b) création du modèle */}
        <fieldset className="border-border space-y-3 rounded-md border p-4">
          <legend className="px-1 text-sm font-medium">
            b. Sinon, créer le modèle et ses objectifs pédagogiques
          </legend>
          <div className="space-y-1.5">
            <Label htmlFor="model-name">Nom du modèle</Label>
            <Input
              id="model-name"
              value={modelName}
              disabled={modelId !== null}
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
            <Button asChild variant="outline" className="min-h-11">
              <label>
                <FileUp className="me-1 size-4" aria-hidden />
                Importer un fichier d'objectifs
                <input
                  type="file"
                  className="sr-only"
                  onChange={(event) => setImportedFile(event.target.files?.[0]?.name ?? null)}
                />
              </label>
            </Button>
            {importedFile ? (
              <span className="text-muted-foreground text-xs">{importedFile} (maquette)</span>
            ) : null}
          </div>
        </fieldset>

        {/* c) analyse IA */}
        <fieldset className="border-border space-y-3 rounded-md border p-4">
          <legend className="px-1 text-sm font-medium">
            c. Analyse du programme et ressources nécessaires
          </legend>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              className="min-h-11"
              disabled={objectives.trim().length === 0 && importedFile === null}
              onClick={runAnalysis}
            >
              <Sparkles className="me-1 size-4" aria-hidden />
              Analyser les objectifs
            </Button>
            <MockBadge label="Analyse simulée" />
          </div>

          {analysed ? (
            <p className="text-muted-foreground text-sm">
              Ressources proposées :{" "}
              {analysed
                .map((kind) => RESOURCES.find((r) => r.id === kind)?.label ?? kind)
                .join(", ")}
              . Complétez librement la sélection ci-dessous.
            </p>
          ) : (
            <p className="text-muted-foreground text-sm">
              Vous pouvez aussi cocher directement les ressources voulues, sans analyse.
            </p>
          )}

          <div className="space-y-3">
            {RESOURCES.map((resource) => {
              const state = resources[resource.id];
              const suggested = analysed?.includes(resource.id) ?? false;
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
                        {suggested ? (
                          <Badge variant="secondary" className="font-normal">
                            proposé par l'analyse
                          </Badge>
                        ) : null}
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
                        <div className="space-y-2">
                          <p className="text-sm font-medium">Créer un terrain de stage</p>
                          <PlacementCreationForm
                            programId={activeProgramId}
                            idPrefix="designer-stage"
                            submitLabel="Créer le terrain de stage"
                            hint="Même outil et même liste que l'onglet « Gestion des stages » : le terrain y apparaît aussitôt, rattaché à ce programme."
                            onCreated={() => patch("stage", { implemented: true })}
                          />
                          {localPlacements.length > 0 ? (
                            <ul className="text-muted-foreground space-y-1 text-xs">
                              {localPlacements.map((local) => (
                                <li key={local.placement.id}>
                                  {local.placement.name} — {local.placement.site} ·{" "}
                                  {local.placement.capacity} place(s)
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                      ) : null}

                      {state.mode === "now" && resource.id === "competences" ? (
                        <div className="space-y-2">
                          <p className="text-sm font-medium">Créer une compétence</p>
                          <CompetenceCreationForm
                            programId={activeProgramId}
                            curriculumVersionId={curriculumVersionId}
                            idPrefix="designer-competence"
                            submitLabel="Créer la compétence"
                            hint="Même outil et même liste que l'onglet « Compétences » : elle y apparaît aussitôt, rattachée à ce programme."
                            onCreated={() => patch("competences", { implemented: true })}
                          />
                          {localCompetences.length > 0 ? (
                            <ul className="text-muted-foreground space-y-1 text-xs">
                              {localCompetences.map((outcome) => (
                                <li key={outcome.id}>
                                  {outcome.code} — {outcome.label}
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                      ) : null}

                      {state.mode === "now" && resource.id === "documents" ? (
                        <div className="space-y-2">
                          <p className="text-sm font-medium">Créer une pièce exigée</p>
                          <DocumentRequirementForm
                            programId={activeProgramId}
                            idPrefix="designer-document"
                            submitLabel="Créer la pièce exigée"
                            hint="Même outil et même liste que l'onglet « Documents et certificats » : la pièce y apparaît aussitôt, rattachée à ce programme."
                            onCreated={() => patch("documents", { implemented: true })}
                          />
                          {localRequirements.length > 0 ? (
                            <ul className="text-muted-foreground space-y-1 text-xs">
                              {localRequirements.map((item) => (
                                <li key={item.id}>
                                  {item.code} — {item.label}
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                      ) : null}

                      {state.mode === "now" &&
                      resource.id !== "stage" &&
                      resource.id !== "competences" &&
                      resource.id !== "documents" ? (

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
                        <p className="text-muted-foreground text-sm">
                          Les {existingCounts[resource.id]} élément(s) déjà saisis dans l'onglet
                          dédié seront associés à ce programme.
                        </p>
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
        title="2. Préparer et associer la promotion"
        description="Créez la classe ici avec le même outil que l'onglet « Classes d'apprenants », ou réutilisez une classe déjà créée, puis associez-la au programme conçu."
        action={
          <Badge variant={associated ? "secondary" : "outline"} className="font-normal">
            {associated ? "promotion associée" : "à associer"}
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
        ) : (
          <CohortCreationForm
            idPrefix="designer-cohort"
            programId={activeProgramId}
            curriculumVersionId={curriculumVersionId}
            submitLabel="Créer la classe et l'associer"
            hint="La classe créée ici est automatiquement rattachée au programme en conception et apparaît dans l'onglet « Classes d'apprenants »."
            onCreated={(cohort) => {
              setSelectedCohortId(cohort.id);
              setCohortMode("existing");
              setAssociated(cohort.label);
            }}
          />
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
            <span className="text-muted-foreground text-sm">
              Terminez d'abord l'étape 1 (ressources choisies et implémentations en attente
              réglées).
            </span>
          ) : null}
        </div>
      </PanelCard>

      {/* ---------------- Étape 3 : planning général ---------------- */}
      <PanelCard
        title="3. Programmer le planning général du programme"
        description="Le concepteur décide : chaque élément retenu à l'étape 1 peut recevoir une date unique, une période, ou rester non daté."
        action={
          <Badge variant={scheduleReady ? "secondary" : "outline"} className="font-normal">
            {scheduleReady ? "planning cohérent" : "à programmer"}
          </Badge>
        }
      >
        <fieldset className="border-border space-y-3 rounded-md border p-4">
          <legend className="px-1 text-sm font-medium">a. Bornes du programme</legend>
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
          <legend className="px-1 text-sm font-medium">
            b. Échéances des éléments du programme
          </legend>
          {scheduleItems.length === 0 ? (
            <EmptyState>
              Sélectionnez d'abord des ressources à l'étape 1 : leurs échéances apparaîtront ici.
            </EmptyState>
          ) : (
            <ul className="space-y-3">
              {scheduleItems.map((item) => {
                const entry = schedule[item.id] ?? INITIAL_SCHEDULE;
                const invalid =
                  entry.kind === "period" &&
                  entry.from !== "" &&
                  entry.to !== "" &&
                  entry.to < entry.from;
                return (
                  <li key={item.id} className="border-border rounded-md border p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <CalendarDays className="text-muted-foreground size-4" aria-hidden />
                      <span className="text-sm font-medium">{item.label}</span>
                      <Badge variant="outline" className="font-normal">
                        {item.originLabel}
                      </Badge>
                    </div>
                    <div
                      role="group"
                      aria-label={`Programmation — ${item.label}`}
                      className="mt-3 flex flex-wrap gap-2"
                    >
                      {(Object.keys(SCHEDULE_KIND_LABELS) as ScheduleKind[]).map((kind) => (
                        <Button
                          key={kind}
                          type="button"
                          size="sm"
                          className="min-h-11"
                          variant={entry.kind === kind ? "default" : "outline"}
                          aria-pressed={entry.kind === kind}
                          onClick={() => patchSchedule(item.id, { kind })}
                        >
                          {SCHEDULE_KIND_LABELS[kind]}
                        </Button>
                      ))}
                    </div>

                    {entry.kind === "date" ? (
                      <div className="mt-3 max-w-xs space-y-1.5">
                        <Label htmlFor={`sched-${item.id}-date`}>Date</Label>
                        <Input
                          id={`sched-${item.id}-date`}
                          type="date"
                          value={entry.from}
                          onChange={(event) =>
                            patchSchedule(item.id, { from: event.target.value })
                          }
                        />
                      </div>
                    ) : null}

                    {entry.kind === "period" ? (
                      <div className="mt-3 grid max-w-lg gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label htmlFor={`sched-${item.id}-from`}>Début</Label>
                          <Input
                            id={`sched-${item.id}-from`}
                            type="date"
                            value={entry.from}
                            onChange={(event) =>
                              patchSchedule(item.id, { from: event.target.value })
                            }
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor={`sched-${item.id}-to`}>Fin</Label>
                          <Input
                            id={`sched-${item.id}-to`}
                            type="date"
                            value={entry.to}
                            onChange={(event) => patchSchedule(item.id, { to: event.target.value })}
                          />
                        </div>
                      </div>
                    ) : null}

                    {entry.kind === "undated" ? (
                      <p className="text-muted-foreground mt-3 text-sm">
                        Élément retenu sans date : il restera à programmer plus tard, dans le
                        pilotage.
                      </p>
                    ) : null}

                    {invalid ? (
                      <p className="text-destructive mt-2 text-sm">
                        La fin de la période précède son début.
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
          {!scheduleReady && scheduleItems.length > 0 ? (
            <p className="text-muted-foreground text-sm">
              Complétez chaque date choisie, ou marquez l'élément « Non daté ».
            </p>
          ) : null}
        </fieldset>
      </PanelCard>

      {/* ---------------- Étape 4 : bascule dans le pilotage ---------------- */}
      <section className="border-border bg-card flex flex-wrap items-center justify-between gap-3 rounded-lg border p-5">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">4. Basculer dans le pilotage</h2>
          <p className="text-muted-foreground text-sm">
            C'est le seul moment où l'on quitte le concepteur : le suivi se fait dans le pilotage.
          </p>
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
      </section>

    </div>
  );
}

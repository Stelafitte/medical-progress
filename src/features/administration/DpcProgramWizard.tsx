/**
 * Assistant d'IMPLÉMENTATION d'un programme DPC de référence.
 * Le coordinateur ne crée pas le contenu : il importe, configure et implémente
 * un programme de référence déjà conçu et validé, pour une cohorte, un
 * calendrier et des modalités donnés.
 *
 * On n'y « crée » pas un programme abstrait : on implémente un DPC en
 * choisissant les composants réellement retenus (audit avant / après, tests
 * amont / aval, formation en présentiel, en visioconférence ou en e-formation),
 * puis en les datant précisément. Tous ces composants sont OPTIONNELS.
 *
 * MAQUETTE FONCTIONNELLE LOCALE :
 *  - aucun fichier n'est envoyé à un serveur (les fichiers sélectionnés ne sont
 *    lus que pour récupérer leur nom) ;
 *  - aucune extraction documentaire réelle : tout brouillon est marqué
 *    « Extraction simulée — validation du coordinateur requise » ;
 *  - la publication est simulée et reste désactivée si un point obligatoire
 *    manque ;
 *  - aucun paramétrage médical n'est validé automatiquement ;
 *  - le modèle utilisé est `src/domain/dpcProgram.ts`, le programme
 *    HVG–Amylose n'est qu'un démonstrateur prérempli.
 */
import { useMemo, useState } from "react";
import {
  CalendarClock,
  ClipboardList,
  FileCheck2,
  FileText,
  GraduationCap,
  Info,
  ListChecks,
  Stethoscope,
  Trash2,
  Upload,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { MockBadge, PanelCard, ScopeNotice } from "@/features/professional/mock-ui";
import {
  DPC_IMPORTABLE_KIND_LABELS_FR,
  DPC_VERSION_STATUS_LABELS_FR,
  type DpcCompletenessRule,
  type DpcGridConfig,
  type DpcImportableKind,
  type DpcRoundConfig,
  orderedRounds,
  recordsExpectedForRound,
} from "@/domain/dpcProgram";
import {
  DPC_SIMULATED_EXTRACTION_NOTICE_FR,
  DPC_SIMULATED_UPLOAD_NOTICE_FR,
  DPC_WIZARD_STEPS,
  type DpcDraftDocument,
  type DpcProgramDraft,
  type DpcWizardStepId,
  canAssignKind,
  documentKindConflict,
  draftShape,
  publicationChecklist,
  publicationReadiness,
  toggleDocumentKind,
} from "@/domain/dpcProgramDraft";
import {
  DPC_COMPONENT_KIND_LABELS_FR,
  DPC_SLOT_TIMING_LABELS_FR,
  DPC_TRAINING_DELIVERY_LABELS_FR,
  type DpcComponentKind,
  type DpcScheduledSlot,
  type DpcTrainingDelivery,
  expectedTiming,
  implementationSummary,
  implementationTimeline,
  isSlotScheduled,
  validateImplementationPlan,
} from "@/domain/dpcImplementation";
import { dpcDraftDemoStates } from "@/infrastructure/mock/dpcDraftFixtures";
import { dpcHvgGrid } from "@/infrastructure/mock/dpcHvgFixtures";

const KIND_ORDER: readonly DpcImportableKind[] = [
  "program_document",
  "audit_grid",
  "knowledge_quiz",
  "teaching_resource",
  "bibliography",
  "improvement_plan_template",
  "attendance_document",
];

const touch = "min-h-11";

function isoToDateInput(value?: string): string {
  return value ? value.slice(0, 10) : "";
}

function dateInputToIso(value: string): string | undefined {
  return value ? `${value}T08:00:00.000Z` : undefined;
}

/** Champ « datetime-local » ↔ ISO, sans réécriture de fuseau (maquette). */
function isoToDateTimeInput(value?: string): string {
  return value ? value.slice(0, 16) : "";
}

function dateTimeInputToIso(value: string): string | undefined {
  return value ? `${value}:00.000Z` : undefined;
}

function slotStartOf(slot: DpcScheduledSlot): string | undefined {
  return slot.startsAt ?? slot.opensOn;
}

function slotEndOf(slot: DpcScheduledSlot): string | undefined {
  return slot.endsAt ?? slot.closesOn;
}

const COMPONENT_ORDER: readonly DpcComponentKind[] = [
  "audit_round",
  "pre_test",
  "training_session",
  "post_test",
  "other_activity",
];

const DELIVERY_ORDER: readonly DpcTrainingDelivery[] = [
  "in_person",
  "virtual_classroom",
  "e_learning",
];

/** Affecte un champ optionnel, ou le retire réellement quand la valeur est vide. */
function setOptional<T extends object, K extends keyof T>(
  source: T,
  key: K,
  value: T[K] | undefined,
): T {
  const next = { ...source };
  if (value === undefined) delete next[key];
  else next[key] = value;
  return next;
}

export function DpcProgramWizard() {
  const [demoKey, setDemoKey] = useState(dpcDraftDemoStates[0]!.key);
  const [drafts, setDrafts] = useState<Record<string, DpcProgramDraft>>(() =>
    Object.fromEntries(dpcDraftDemoStates.map((state) => [state.key, state.draft])),
  );
  const [stepId, setStepId] = useState<DpcWizardStepId>(DPC_WIZARD_STEPS[0]!.id);
  const [kindError, setKindError] = useState<string | null>(null);
  const [publishNotice, setPublishNotice] = useState<string | null>(null);

  const draft = drafts[demoKey]!;
  const setDraft = (next: DpcProgramDraft) => setDrafts((all) => ({ ...all, [demoKey]: next }));

  const stepIndex = DPC_WIZARD_STEPS.findIndex((step) => step.id === stepId);
  const step = DPC_WIZARD_STEPS[stepIndex]!;
  const checklist = useMemo(() => publicationChecklist(draft), [draft]);
  const readiness = useMemo(() => publicationReadiness(draft), [draft]);
  const shape = useMemo(() => draftShape(draft), [draft]);

  /* ---------------- étape 1 : documents ---------------- */

  const addSimulatedDocuments = (names: readonly string[]) => {
    const created: DpcDraftDocument[] = names.map((fileName, index) => ({
      id: `sim-doc-${Date.now()}-${index}`,
      fileName,
      kinds: [],
      simulated: true,
      note: "Sélection locale simulée : aucun contenu lu, aucun envoi.",
    }));
    setDraft({ ...draft, documents: [...draft.documents, ...created] });
  };

  const onToggleKind = (document: DpcDraftDocument, kind: DpcImportableKind) => {
    const conflict = canAssignKind(document, kind);
    if (conflict.conflict) {
      setKindError(conflict.message);
      return;
    }
    setKindError(null);
    setDraft({
      ...draft,
      documents: draft.documents.map((d) =>
        d.id === document.id ? toggleDocumentKind(d, kind) : d,
      ),
    });
  };

  /* ---------------- étape 3 : audits ---------------- */

  const mapGrid = (gridId: string, fn: (grid: DpcGridConfig) => DpcGridConfig) =>
    setDraft({
      ...draft,
      audit: {
        ...draft.audit,
        grids: draft.audit.grids.map((g) => (g.gridId === gridId ? fn(g) : g)),
      },
    });

  const updateGrid = (gridId: string, patch: Partial<DpcGridConfig>) =>
    mapGrid(gridId, (grid) => ({ ...grid, ...patch }));

  const updateCompleteness = (gridId: string, patch: Partial<DpcCompletenessRule>) =>
    mapGrid(gridId, (grid) => ({
      ...grid,
      completenessRule: { ...grid.completenessRule, ...patch },
    }));

  /** Règle de complétude : champ optionnel réellement retiré quand il est vidé. */
  const updateCompletenessOptional = (
    gridId: string,
    key: "minimumCompleteRecords" | "minimumAnsweredPercentPerRecord",
    value: number | undefined,
  ) =>
    mapGrid(gridId, (grid) => ({
      ...grid,
      completenessRule: setOptional(grid.completenessRule, key, value),
    }));

  const mapRound = (roundId: string, fn: (round: DpcRoundConfig) => DpcRoundConfig) =>
    setDraft({
      ...draft,
      audit: {
        ...draft.audit,
        rounds: draft.audit.rounds.map((r) => (r.roundId === roundId ? fn(r) : r)),
      },
    });

  const updateRound = (roundId: string, patch: Partial<DpcRoundConfig>) =>
    mapRound(roundId, (round) => ({ ...round, ...patch }));

  const updateRoundOptional = <K extends "recordsPerRound" | "opensOn" | "closesOn">(
    roundId: string,
    key: K,
    value: DpcRoundConfig[K] | undefined,
  ) => mapRound(roundId, (round) => setOptional(round, key, value));

  const addGrid = () => {
    const index = draft.audit.grids.length + 1;
    setDraft({
      ...draft,
      audit: {
        ...draft.audit,
        grids: [
          ...draft.audit.grids,
          {
            gridId: `grid-${Date.now()}`,
            title: `Grille d'audit ${index}`,
            version: { version: "v0.1", status: "draft" },
            defaultRecordsPerRound: 1,
            inclusionCriteria: [],
            completenessRule: { allRecordsRequired: true, notApplicableCountsAsAnswered: true },
          },
        ],
      },
    });
  };

  const removeGrid = (gridId: string) =>
    setDraft({
      ...draft,
      audit: {
        grids: draft.audit.grids.filter((g) => g.gridId !== gridId),
        rounds: draft.audit.rounds.filter((r) => r.gridId !== gridId),
      },
    });

  const addRound = (grid: DpcGridConfig) => {
    const order =
      draft.audit.rounds.reduce((max, round) => Math.max(max, round.order), 0) + 1;
    setDraft({
      ...draft,
      audit: {
        ...draft.audit,
        rounds: [
          ...draft.audit.rounds,
          {
            roundId: `round-${Date.now()}`,
            label: `Tour ${order}`,
            order,
            gridId: grid.gridId,
            gridVersion: grid.version.version,
          },
        ],
      },
    });
  };

  const removeRound = (roundId: string) =>
    setDraft({
      ...draft,
      audit: { ...draft.audit, rounds: draft.audit.rounds.filter((r) => r.roundId !== roundId) },
    });

  /* ---------------- étape 5 : calendrier d'implémentation ---------------- */

  const plan = draft.implementation;
  const planIssues = useMemo(() => validateImplementationPlan(plan), [plan]);
  const planSummary = useMemo(() => implementationSummary(plan), [plan]);
  const timeline = useMemo(() => implementationTimeline(plan), [plan]);

  const setPlanSlots = (slots: readonly DpcScheduledSlot[]) =>
    setDraft({ ...draft, implementation: { ...plan, slots } });

  const mapSlot = (slotId: string, fn: (slot: DpcScheduledSlot) => DpcScheduledSlot) =>
    setPlanSlots(plan.slots.map((slot) => (slot.id === slotId ? fn(slot) : slot)));

  const updateSlotOptional = <K extends keyof DpcScheduledSlot>(
    slotId: string,
    key: K,
    value: DpcScheduledSlot[K] | undefined,
  ) => mapSlot(slotId, (slot) => setOptional(slot, key, value));

  /** Changer la nature d'un composant retire les champs devenus hors sujet. */
  const changeSlotKind = (slotId: string, kind: DpcComponentKind) =>
    mapSlot(slotId, (slot) => {
      const next: DpcScheduledSlot = { ...slot, kind };
      if (kind !== "training_session") {
        const cleaned = { ...next };
        delete (cleaned as { delivery?: DpcTrainingDelivery }).delivery;
        delete (cleaned as { location?: string }).location;
        delete (cleaned as { joinInstructions?: string }).joinInstructions;
        delete (cleaned as { resourceIds?: readonly string[] }).resourceIds;
        return cleaned;
      }
      return next;
    });

  /** Changer la modalité change le mode de datation : les dates inadaptées sont retirées. */
  const changeSlotDelivery = (slotId: string, delivery: DpcTrainingDelivery) =>
    mapSlot(slotId, (slot) => {
      const next = { ...slot, delivery } as DpcScheduledSlot;
      const cleaned = { ...next };
      if (expectedTiming("training_session", delivery) === "fixed_datetime") {
        delete (cleaned as { opensOn?: string }).opensOn;
        delete (cleaned as { closesOn?: string }).closesOn;
        delete (cleaned as { resourceIds?: readonly string[] }).resourceIds;
      } else {
        delete (cleaned as { startsAt?: string }).startsAt;
        delete (cleaned as { endsAt?: string }).endsAt;
        delete (cleaned as { location?: string }).location;
        delete (cleaned as { joinInstructions?: string }).joinInstructions;
      }
      return cleaned;
    });

  const addSlot = (kind: DpcComponentKind) => {
    const sameKind = plan.slots.filter((slot) => slot.kind === kind).length;
    const slot: DpcScheduledSlot = {
      id: `slot-${Date.now()}`,
      label: `${DPC_COMPONENT_KIND_LABELS_FR[kind]} ${sameKind + 1}`,
      kind,
      attendanceRequired: false,
      ...(kind === "audit_round"
        ? { order: plan.slots.reduce((max, s) => Math.max(max, s.order ?? 0), 0) + 1 }
        : {}),
    };
    setPlanSlots([...plan.slots, slot]);
  };

  const removeSlot = (slotId: string) =>
    setPlanSlots(plan.slots.filter((slot) => slot.id !== slotId));

  return (
    <div className="space-y-6">
      <ScopeNotice>
        <strong>Assistant simulé</strong> : vous importez le programme DPC et ses documents
        associés, puis vous vérifiez l'implémentation structurée proposée avant de l'ouvrir pour une
        cohorte. {DPC_SIMULATED_UPLOAD_NOTICE_FR} Aucune analyse documentaire réelle, aucune IA,
        aucune ouverture réelle. « DPC HVG–Amylose » n'est qu'un démonstrateur prérempli.
      </ScopeNotice>

      <PanelCard
        title="Programme importé (démonstration)"
        description="Réutiliser un programme déjà importé : trois jeux de données structurées pour éprouver l'assistant."
        action={<MockBadge label="Simulé" />}
      >
        <div className="grid gap-3 sm:grid-cols-3">
          {dpcDraftDemoStates.map((state) => {
            const active = state.key === demoKey;
            return (
              <button
                key={state.key}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setDemoKey(state.key);
                  setKindError(null);
                  setPublishNotice(null);
                }}
                className={`${touch} rounded-md border p-3 text-left text-sm ${
                  active ? "border-primary bg-primary/5 font-medium" : "border-border"
                }`}
              >
                <span className="block">{state.label}</span>
                <span className="text-muted-foreground mt-1 block text-xs">{state.hint}</span>
              </button>
            );
          })}
        </div>
      </PanelCard>

      {/* Navigation des étapes : liste ordonnée, utilisable au clavier */}
      <nav aria-label="Étapes de l'assistant">
        <ol className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {DPC_WIZARD_STEPS.map((item) => {
            const current = item.id === stepId;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => setStepId(item.id)}
                  aria-current={current ? "step" : undefined}
                  className={`${touch} w-full rounded-md border px-3 py-2 text-left text-xs ${
                    current ? "border-primary bg-primary/5 font-semibold" : "border-border"
                  }`}
                >
                  <span className="text-muted-foreground block">Étape {item.order}</span>
                  {item.title}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <PanelCard title={`Étape ${step.order} — ${step.title}`} description={step.description}>
        {stepId === "source_documents" ? (
          <div className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Label htmlFor="dpc-wizard-files" className="sm:sr-only">
                Sélectionner des documents locaux (aucun envoi)
              </Label>
              <Input
                id="dpc-wizard-files"
                type="file"
                multiple
                className={`${touch} w-full sm:w-auto`}
                onChange={(event) => {
                  const names = Array.from(event.target.files ?? []).map((file) => file.name);
                  if (names.length > 0) addSimulatedDocuments(names);
                  event.target.value = "";
                }}
              />
              <Button
                type="button"
                variant="outline"
                className={`${touch} w-full gap-2 sm:w-auto`}
                onClick={() => addSimulatedDocuments([`document_simule_${draft.documents.length + 1}.docx`])}
              >
                <Upload className="size-4" aria-hidden="true" />
                Simuler un dépôt
              </Button>
            </div>
            <p className="text-muted-foreground text-xs">{DPC_SIMULATED_UPLOAD_NOTICE_FR}</p>

            {kindError ? (
              <p role="alert" className="rounded-md border border-destructive p-3 text-sm">
                <strong>Classement refusé.</strong> {kindError}
              </p>
            ) : null}

            <ul className="space-y-3">
              {draft.documents.map((document) => {
                const conflict = documentKindConflict(document.kinds);
                return (
                  <li key={document.id} className="space-y-3 rounded-md border border-border p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <FileText className="size-4" aria-hidden="true" />
                      <span className="min-w-0 break-words font-medium">{document.fileName}</span>
                      <Badge variant="outline">Simulé</Badge>
                      {document.kinds.length === 0 ? (
                        <Badge variant="secondary">Nature à attribuer</Badge>
                      ) : null}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className={`${touch} ml-auto gap-2`}
                        onClick={() =>
                          setDraft({
                            ...draft,
                            documents: draft.documents.filter((d) => d.id !== document.id),
                          })
                        }
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                        Retirer
                      </Button>
                    </div>
                    <fieldset className="space-y-2">
                      <legend className="text-muted-foreground text-xs">
                        Nature du document (classement explicite)
                      </legend>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {KIND_ORDER.map((kind) => {
                          const id = `${document.id}-${kind}`;
                          const checked = document.kinds.includes(kind);
                          const blocked = !checked && canAssignKind(document, kind).conflict;
                          return (
                            <div key={kind} className={`${touch} flex items-center gap-2`}>
                              <Checkbox
                                id={id}
                                checked={checked}
                                disabled={blocked}
                                onCheckedChange={() => onToggleKind(document, kind)}
                              />
                              <Label htmlFor={id} className="text-sm font-normal">
                                {DPC_IMPORTABLE_KIND_LABELS_FR[kind]}
                                {blocked ? " (incompatible)" : ""}
                              </Label>
                            </div>
                          );
                        })}
                      </div>
                    </fieldset>
                    {conflict.conflict ? (
                      <p role="alert" className="text-sm">
                        <strong>Conflit de classement.</strong> {conflict.message}
                      </p>
                    ) : null}
                    {document.note ? (
                      <p className="text-muted-foreground text-xs">{document.note}</p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            {draft.documents.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Aucun document : sélectionnez des fichiers locaux ou simulez un dépôt.
              </p>
            ) : null}
          </div>
        ) : null}

        {stepId === "proposed_extraction" ? (
          <div className="space-y-4">
            <p className="flex items-center gap-2 rounded-md border border-border p-3 text-sm">
              <Info className="size-4 shrink-0" aria-hidden="true" />
              <span>
                <strong>{DPC_SIMULATED_EXTRACTION_NOTICE_FR}</strong> — aucun document n'a été lu :
                les valeurs proposées proviennent du modèle générique du démonstrateur.
              </span>
            </p>

            <section className="space-y-1 rounded-md border border-border p-3">
              <h3 className="text-sm font-medium">Traçabilité de la version</h3>
              <p className="text-muted-foreground text-xs">
                Données structurées issues du programme importé : version {draft.version} · empreinte{" "}
                {draft.checksum ?? "non calculée"}. Section technique secondaire : aucune action de
                publication n'est demandée au coordinateur.
              </p>
            </section>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="dpc-title">Titre du programme</Label>
                <Input
                  id="dpc-title"
                  className={touch}
                  value={draft.extraction.title}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      extraction: { ...draft.extraction, title: event.target.value },
                    })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="dpc-admin-number">Numéro administratif</Label>
                <Input
                  id="dpc-admin-number"
                  className={touch}
                  value={draft.extraction.administrativeNumber ?? ""}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      extraction: {
                        ...draft.extraction,
                        administrativeNumber: event.target.value,
                      },
                    })
                  }
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="dpc-audience">Public cible</Label>
                <Textarea
                  id="dpc-audience"
                  value={draft.extraction.targetAudience}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      extraction: { ...draft.extraction, targetAudience: event.target.value },
                    })
                  }
                />
              </div>
            </div>

            <DraftList label="Orientations" items={draft.extraction.orientations} />
            <DraftList label="Objectifs" items={draft.extraction.objectives} collapsible />
            <DraftList
              label="Modalités"
              items={draft.extraction.teachingModalities.map(
                (modality) =>
                  `${modality.label}${modality.durationMinutes ? ` · ${modality.durationMinutes} min` : ""}`,
              )}
            />
            <DraftList
              label="Intervenants"
              items={draft.extraction.faculty.map(
                (member) =>
                  `${member.fullName} — ${member.role}${member.interestsDeclared ? " · liens d'intérêts déclarés" : ""}`,
              )}
            />
            <DraftList
              label="Calendrier"
              items={draft.extraction.schedule.map(
                (entry) => `${entry.window} — ${entry.description}`,
              )}
            />
            <DraftList label="Modules détectés" items={draft.extraction.detectedModules} />
            <DraftList
              label="Ressources"
              items={draft.extraction.resources.map((resource) => resource.label)}
              collapsible
            />
            <DraftList
              label="Bibliographie"
              items={draft.extraction.bibliography.map(
                (entry) => `${entry.order}. ${entry.citation}`,
              )}
              collapsible
            />
          </div>
        ) : null}

        {stepId === "audit_configuration" ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="outline">{shape.grids} grille(s)</Badge>
              <Badge variant="outline">{shape.rounds} tour(s)</Badge>
              <Button type="button" variant="outline" className={`${touch} ml-auto`} onClick={addGrid}>
                Ajouter une grille
              </Button>
            </div>
            <p className="text-muted-foreground text-xs">
              Aucune valeur n'est imposée : le nombre de grilles, de parties, de critères, de tours et
              de dossiers est propre à chaque programme.
            </p>

            {draft.audit.grids.length === 0 ? (
              <p className="text-sm">
                Aucune grille d'audit : un programme DPC peut n'avoir aucun audit de pratiques.
              </p>
            ) : null}

            {draft.audit.grids.map((grid) => {
              const rounds = orderedRounds(draft.audit).filter((r) => r.gridId === grid.gridId);
              const isHvgGrid = grid.gridId === dpcHvgGrid.id;
              return (
                <section key={grid.gridId} className="space-y-3 rounded-md border border-border p-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label htmlFor={`${grid.gridId}-title`}>Titre de la grille</Label>
                      <Input
                        id={`${grid.gridId}-title`}
                        className={touch}
                        value={grid.title}
                        onChange={(event) => updateGrid(grid.gridId, { title: event.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`${grid.gridId}-version`}>Version de la grille</Label>
                      <Input
                        id={`${grid.gridId}-version`}
                        className={touch}
                        value={grid.version.version}
                        onChange={(event) =>
                          updateGrid(grid.gridId, {
                            version: { ...grid.version, version: event.target.value },
                          })
                        }
                      />
                      <p className="text-muted-foreground text-xs">
                        Statut : {DPC_VERSION_STATUS_LABELS_FR[grid.version.status]}
                        {grid.version.frozenAt ? " · gelée" : ""}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`${grid.gridId}-records`}>
                        Nombre X de dossiers par tour (défaut de la grille)
                      </Label>
                      <Input
                        id={`${grid.gridId}-records`}
                        type="number"
                        min={1}
                        className={touch}
                        value={grid.defaultRecordsPerRound}
                        onChange={(event) =>
                          updateGrid(grid.gridId, {
                            defaultRecordsPerRound: Number(event.target.value),
                          })
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`${grid.gridId}-inclusion`}>
                        Critères d'inclusion des dossiers (une ligne par critère)
                      </Label>
                      <Textarea
                        id={`${grid.gridId}-inclusion`}
                        value={grid.inclusionCriteria.join("\n")}
                        onChange={(event) =>
                          updateGrid(grid.gridId, {
                            inclusionCriteria: event.target.value
                              .split("\n")
                              .filter((line) => line.trim() !== ""),
                          })
                        }
                      />
                    </div>
                  </div>

                  <fieldset className="space-y-2 rounded-md border border-border p-3">
                    <legend className="text-sm font-medium">Règle de complétude</legend>
                    <div className={`${touch} flex items-center gap-3`}>
                      <Switch
                        id={`${grid.gridId}-all`}
                        checked={grid.completenessRule.allRecordsRequired}
                        onCheckedChange={(checked) =>
                          updateCompleteness(grid.gridId, { allRecordsRequired: checked })
                        }
                      />
                      <Label htmlFor={`${grid.gridId}-all`} className="font-normal">
                        Tous les dossiers attendus sont requis
                      </Label>
                    </div>
                    <div className={`${touch} flex items-center gap-3`}>
                      <Switch
                        id={`${grid.gridId}-na`}
                        checked={grid.completenessRule.notApplicableCountsAsAnswered}
                        onCheckedChange={(checked) =>
                          updateCompleteness(grid.gridId, {
                            notApplicableCountsAsAnswered: checked,
                          })
                        }
                      />
                      <Label htmlFor={`${grid.gridId}-na`} className="font-normal">
                        « Non applicable » compte comme renseigné
                      </Label>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label htmlFor={`${grid.gridId}-min-records`}>
                          Dossiers complets minimum
                        </Label>
                        <Input
                          id={`${grid.gridId}-min-records`}
                          type="number"
                          min={0}
                          className={touch}
                          value={grid.completenessRule.minimumCompleteRecords ?? ""}
                          onChange={(event) =>
                            updateCompletenessOptional(
                              grid.gridId,
                              "minimumCompleteRecords",
                              event.target.value ? Number(event.target.value) : undefined,
                            )
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor={`${grid.gridId}-min-percent`}>
                          Part minimale de critères renseignés par dossier (%)
                        </Label>
                        <Input
                          id={`${grid.gridId}-min-percent`}
                          type="number"
                          min={0}
                          max={100}
                          className={touch}
                          value={grid.completenessRule.minimumAnsweredPercentPerRecord ?? ""}
                          onChange={(event) =>
                            updateCompletenessOptional(
                              grid.gridId,
                              "minimumAnsweredPercentPerRecord",
                              event.target.value ? Number(event.target.value) : undefined,
                            )
                          }
                        />
                      </div>
                    </div>
                    <p className="text-muted-foreground text-xs">
                      Modalités de réponse par critère : Oui / Non / Non applicable.
                    </p>
                  </fieldset>

                  {isHvgGrid ? (
                    <Collapsible>
                      <CollapsibleTrigger asChild>
                        <Button type="button" variant="outline" className={`${touch} w-full sm:w-auto`}>
                          Voir les parties et critères ({dpcHvgGrid.sections.length} parties)
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="mt-2 space-y-2">
                        {dpcHvgGrid.sections.map((section) => (
                          <Collapsible key={section.id}>
                            <CollapsibleTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                className={`${touch} w-full justify-between gap-2 text-left`}
                              >
                                <span className="min-w-0 break-words">{section.label}</span>
                                <Badge variant="secondary">
                                  {section.criteria.length} critères
                                </Badge>
                              </Button>
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                              <ol className="space-y-1 p-2">
                                {section.criteria.map((criterion) => (
                                  <li key={criterion.id} className="text-muted-foreground text-xs">
                                    <span className="font-mono">{criterion.number}.</span>{" "}
                                    {criterion.label}
                                  </li>
                                ))}
                              </ol>
                            </CollapsibleContent>
                          </Collapsible>
                        ))}
                      </CollapsibleContent>
                    </Collapsible>
                  ) : (
                    <p className="text-muted-foreground text-xs">
                      Parties et critères à saisir ou à importer : aucun contenu n'est présumé.
                    </p>
                  )}

                  <Separator />

                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-sm font-medium">Tours d'audit</h4>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className={`${touch} ml-auto`}
                      onClick={() => addRound(grid)}
                    >
                      Ajouter un tour
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className={touch}
                      onClick={() => removeGrid(grid.gridId)}
                    >
                      Supprimer la grille
                    </Button>
                  </div>

                  <ul className="space-y-3">
                    {rounds.map((round) => (
                      <li key={round.roundId} className="grid gap-3 rounded-md border border-border p-3 sm:grid-cols-2">
                        <div className="space-y-1">
                          <Label htmlFor={`${round.roundId}-label`}>Libellé du tour</Label>
                          <Input
                            id={`${round.roundId}-label`}
                            className={touch}
                            value={round.label}
                            onChange={(event) =>
                              updateRound(round.roundId, { label: event.target.value })
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor={`${round.roundId}-records`}>
                            Dossiers de ce tour (vide = défaut de la grille)
                          </Label>
                          <Input
                            id={`${round.roundId}-records`}
                            type="number"
                            min={1}
                            className={touch}
                            value={round.recordsPerRound ?? ""}
                            placeholder={String(grid.defaultRecordsPerRound)}
                            onChange={(event) =>
                              updateRoundOptional(
                                round.roundId,
                                "recordsPerRound",
                                event.target.value ? Number(event.target.value) : undefined,
                              )
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor={`${round.roundId}-opens`}>Ouverture</Label>
                          <Input
                            id={`${round.roundId}-opens`}
                            type="date"
                            className={touch}
                            value={isoToDateInput(round.opensOn)}
                            onChange={(event) =>
                              updateRoundOptional(
                                round.roundId,
                                "opensOn",
                                dateInputToIso(event.target.value),
                              )
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor={`${round.roundId}-closes`}>Fermeture</Label>
                          <Input
                            id={`${round.roundId}-closes`}
                            type="date"
                            className={touch}
                            value={isoToDateInput(round.closesOn)}
                            onChange={(event) =>
                              updateRoundOptional(
                                round.roundId,
                                "closesOn",
                                dateInputToIso(event.target.value),
                              )
                            }
                          />
                        </div>
                        <p className="text-muted-foreground text-xs sm:col-span-2">
                          Ordre {round.order} · version de grille {round.gridVersion} ·{" "}
                          {recordsExpectedForRound(draft.audit, round.roundId) ?? "?"} dossiers attendus
                        </p>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className={`${touch} sm:col-span-2`}
                          onClick={() => removeRound(round.roundId)}
                        >
                          Supprimer ce tour
                        </Button>
                      </li>
                    ))}
                    {rounds.length === 0 ? (
                      <li className="text-muted-foreground text-sm">
                        Aucun tour pour cette grille.
                      </li>
                    ) : null}
                  </ul>
                </section>
              );
            })}
          </div>
        ) : null}

        {stepId === "assessment_separation" ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="space-y-2 rounded-md border border-border p-3">
              <h3 className="flex items-center gap-2 font-medium">
                <Stethoscope className="size-4" aria-hidden="true" />
                Audits de pratiques sur dossiers
              </h3>
              <p className="text-muted-foreground text-sm">
                Analyse de dossiers réels par le professionnel, critère par critère, en Oui / Non /
                Non applicable. Ce n'est pas une évaluation de connaissances : le résultat décrit une
                pratique observée, jamais un score de savoir.
              </p>
              <ul className="text-sm">
                <li>{shape.grids} grille(s) d'audit</li>
                <li>{shape.rounds} tour(s) configuré(s)</li>
                <li>
                  Dossiers attendus :{" "}
                  {shape.recordsPerRound.map((entry) => entry.records ?? "?").join(" · ") || "—"}
                </li>
              </ul>
              <Badge variant="outline" className="gap-1">
                <ClipboardList className="size-3" aria-hidden="true" />
                Pratique déclarée sur dossiers
              </Badge>
            </section>
            <section className="space-y-2 rounded-md border border-border p-3">
              <h3 className="flex items-center gap-2 font-medium">
                <GraduationCap className="size-4" aria-hidden="true" />
                Tests de connaissances par QCM
              </h3>
              <p className="text-muted-foreground text-sm">
                Questions à choix multiples mesurant des connaissances, avant puis après la
                formation. Aucun dossier patient, aucune conformité de pratique : ces résultats ne
                remplacent jamais un audit de pratiques.
              </p>
              <div className="space-y-1">
                <Label htmlFor="dpc-quiz-count">Nombre de QCM déclarés</Label>
                <Input
                  id="dpc-quiz-count"
                  type="number"
                  min={0}
                  className={`${touch} sm:w-40`}
                  value={draft.quizCount}
                  onChange={(event) =>
                    setDraft({ ...draft, quizCount: Number(event.target.value) })
                  }
                />
              </div>
              <Badge variant="outline" className="gap-1">
                <ListChecks className="size-3" aria-hidden="true" />
                Connaissances évaluées par QCM
              </Badge>
            </section>
            <p className="text-muted-foreground text-xs lg:col-span-2">
              Un même document ne peut jamais être classé à la fois grille d'audit et QCM : les deux
              natures d'évaluation restent distinctes dans tout le programme.
            </p>
          </div>
        ) : null}

        {stepId === "implementation_schedule" ? (
          <div className="space-y-4">
            <p className="flex items-start gap-2 rounded-md border border-border p-3 text-sm">
              <CalendarClock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>
                <strong>Tous les composants sont optionnels.</strong> Un DPC peut comporter ou non un
                audit de pratiques avant / après, des tests de connaissances amont / aval et une
                formation en présentiel, en visioconférence ou en e-formation. Le coordinateur
                sélectionne les composants retenus, puis fixe le calendrier précis de chacun.
              </span>
            </p>

            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="outline">{planSummary.totalSlots} composant(s)</Badge>
              <Badge variant="outline">{planSummary.scheduledSlots} programmé(s)</Badge>
              <Badge variant="outline">
                Audit avant / après : {planSummary.hasBeforeAfterAudit ? "oui" : "non"}
              </Badge>
              <Badge variant="outline">
                Tests amont / aval : {planSummary.hasPrePostTests ? "oui" : "non"}
              </Badge>
              <Badge variant="outline">Fuseau {plan.timeZone}</Badge>
            </div>

            <fieldset className="space-y-2 rounded-md border border-border p-3">
              <legend className="text-sm font-medium">Ajouter un composant</legend>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                {COMPONENT_ORDER.map((kind) => (
                  <Button
                    key={kind}
                    type="button"
                    variant="outline"
                    className={`${touch} w-full sm:w-auto`}
                    onClick={() => addSlot(kind)}
                  >
                    {DPC_COMPONENT_KIND_LABELS_FR[kind]}
                  </Button>
                ))}
              </div>
            </fieldset>

            {plan.slots.length === 0 ? (
              <p className="text-sm">
                Aucun composant programmé : ajoutez seulement ceux dont ce DPC a besoin.
              </p>
            ) : null}

            <ul className="space-y-3">
              {plan.slots.map((slot) => {
                const timing = expectedTiming(slot.kind, slot.delivery);
                const slotProblems = planIssues.filter((issue) => issue.slotId === slot.id);
                return (
                  <li key={slot.id} className="space-y-3 rounded-md border border-border p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">
                        {DPC_COMPONENT_KIND_LABELS_FR[slot.kind]}
                      </span>
                      <Badge variant={isSlotScheduled(slot) ? "outline" : "secondary"}>
                        {isSlotScheduled(slot) ? "Programmé" : "À programmer"}
                      </Badge>
                      <Badge variant="outline">{DPC_SLOT_TIMING_LABELS_FR[timing]}</Badge>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className={`${touch} ml-auto gap-2`}
                        onClick={() => removeSlot(slot.id)}
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                        Retirer ce composant
                      </Button>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label htmlFor={`${slot.id}-label`}>Libellé du composant</Label>
                        <Input
                          id={`${slot.id}-label`}
                          className={touch}
                          value={slot.label}
                          onChange={(event) =>
                            mapSlot(slot.id, (current) => ({
                              ...current,
                              label: event.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor={`${slot.id}-kind`}>Nature du composant</Label>
                        <Select
                          value={slot.kind}
                          onValueChange={(value) =>
                            changeSlotKind(slot.id, value as DpcComponentKind)
                          }
                        >
                          <SelectTrigger id={`${slot.id}-kind`} className={touch}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {COMPONENT_ORDER.map((kind) => (
                              <SelectItem key={kind} value={kind}>
                                {DPC_COMPONENT_KIND_LABELS_FR[kind]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {slot.kind === "training_session" ? (
                        <div className="space-y-1 sm:col-span-2">
                          <Label htmlFor={`${slot.id}-delivery`}>Modalité de formation</Label>
                          <Select
                            value={slot.delivery ?? ""}
                            onValueChange={(value) =>
                              changeSlotDelivery(slot.id, value as DpcTrainingDelivery)
                            }
                          >
                            <SelectTrigger id={`${slot.id}-delivery`} className={touch}>
                              <SelectValue placeholder="Choisir une modalité" />
                            </SelectTrigger>
                            <SelectContent>
                              {DELIVERY_ORDER.map((delivery) => (
                                <SelectItem key={delivery} value={delivery}>
                                  {DPC_TRAINING_DELIVERY_LABELS_FR[delivery]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ) : null}

                      {timing === "fixed_datetime" ? (
                        <>
                          <div className="space-y-1">
                            <Label htmlFor={`${slot.id}-starts`}>Début (date et heure)</Label>
                            <Input
                              id={`${slot.id}-starts`}
                              type="datetime-local"
                              className={touch}
                              value={isoToDateTimeInput(slot.startsAt)}
                              onChange={(event) =>
                                updateSlotOptional(
                                  slot.id,
                                  "startsAt",
                                  dateTimeInputToIso(event.target.value),
                                )
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor={`${slot.id}-ends`}>Fin (date et heure)</Label>
                            <Input
                              id={`${slot.id}-ends`}
                              type="datetime-local"
                              className={touch}
                              value={isoToDateTimeInput(slot.endsAt)}
                              onChange={(event) =>
                                updateSlotOptional(
                                  slot.id,
                                  "endsAt",
                                  dateTimeInputToIso(event.target.value),
                                )
                              }
                            />
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="space-y-1">
                            <Label htmlFor={`${slot.id}-opens`}>Ouverture</Label>
                            <Input
                              id={`${slot.id}-opens`}
                              type="date"
                              className={touch}
                              value={isoToDateInput(slot.opensOn)}
                              onChange={(event) =>
                                updateSlotOptional(
                                  slot.id,
                                  "opensOn",
                                  dateInputToIso(event.target.value),
                                )
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor={`${slot.id}-closes`}>Fermeture</Label>
                            <Input
                              id={`${slot.id}-closes`}
                              type="date"
                              className={touch}
                              value={isoToDateInput(slot.closesOn)}
                              onChange={(event) =>
                                updateSlotOptional(
                                  slot.id,
                                  "closesOn",
                                  dateInputToIso(event.target.value),
                                )
                              }
                            />
                          </div>
                        </>
                      )}

                      {slot.delivery === "in_person" ? (
                        <div className="space-y-1 sm:col-span-2">
                          <Label htmlFor={`${slot.id}-location`}>Lieu de la séance</Label>
                          <Input
                            id={`${slot.id}-location`}
                            className={touch}
                            value={slot.location ?? ""}
                            onChange={(event) =>
                              updateSlotOptional(
                                slot.id,
                                "location",
                                event.target.value || undefined,
                              )
                            }
                          />
                        </div>
                      ) : null}

                      {slot.delivery === "virtual_classroom" ? (
                        <div className="space-y-1 sm:col-span-2">
                          <Label htmlFor={`${slot.id}-join`}>
                            Modalités de connexion (aucun lien réel dans la maquette)
                          </Label>
                          <Input
                            id={`${slot.id}-join`}
                            className={touch}
                            value={slot.joinInstructions ?? ""}
                            onChange={(event) =>
                              updateSlotOptional(
                                slot.id,
                                "joinInstructions",
                                event.target.value || undefined,
                              )
                            }
                          />
                        </div>
                      ) : null}

                      {slot.delivery === "e_learning" ? (
                        <div className="space-y-1 sm:col-span-2">
                          <Label htmlFor={`${slot.id}-resources`}>
                            Documents à consulter en ligne (un identifiant par ligne)
                          </Label>
                          <Textarea
                            id={`${slot.id}-resources`}
                            value={(slot.resourceIds ?? []).join("\n")}
                            onChange={(event) => {
                              const ids = event.target.value
                                .split("\n")
                                .map((line) => line.trim())
                                .filter((line) => line !== "");
                              updateSlotOptional(
                                slot.id,
                                "resourceIds",
                                ids.length > 0 ? ids : undefined,
                              );
                            }}
                          />
                        </div>
                      ) : null}

                      {slot.kind === "audit_round" ? (
                        <>
                          <div className="space-y-1">
                            <Label htmlFor={`${slot.id}-order`}>Ordre du tour</Label>
                            <Input
                              id={`${slot.id}-order`}
                              type="number"
                              min={1}
                              className={touch}
                              value={slot.order ?? ""}
                              onChange={(event) =>
                                updateSlotOptional(
                                  slot.id,
                                  "order",
                                  event.target.value ? Number(event.target.value) : undefined,
                                )
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor={`${slot.id}-round`}>
                              Tour d'audit rattaché (facultatif)
                            </Label>
                            <Select
                              value={slot.roundId ?? "none"}
                              onValueChange={(value) =>
                                updateSlotOptional(
                                  slot.id,
                                  "roundId",
                                  value === "none" ? undefined : value,
                                )
                              }
                            >
                              <SelectTrigger id={`${slot.id}-round`} className={touch}>
                                <SelectValue placeholder="Aucun" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">Aucun rattachement</SelectItem>
                                {orderedRounds(draft.audit).map((round) => (
                                  <SelectItem key={round.roundId} value={round.roundId}>
                                    {round.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </>
                      ) : null}

                      <div className={`${touch} flex items-center gap-3 sm:col-span-2`}>
                        <Switch
                          id={`${slot.id}-attendance`}
                          checked={slot.attendanceRequired}
                          onCheckedChange={(checked) =>
                            mapSlot(slot.id, (current) => ({
                              ...current,
                              attendanceRequired: checked,
                            }))
                          }
                        />
                        <Label htmlFor={`${slot.id}-attendance`} className="font-normal">
                          Preuve de participation attendue (émargement)
                        </Label>
                      </div>
                    </div>

                    {slotProblems.length > 0 ? (
                      <ul role="alert" className="rounded-md border border-destructive p-3 text-sm">
                        {slotProblems.map((issue) => (
                          <li key={`${slot.id}-${issue.code}`}>À corriger : {issue.message}</li>
                        ))}
                      </ul>
                    ) : null}

                    {slot.note ? (
                      <p className="text-muted-foreground text-xs">{slot.note}</p>
                    ) : null}
                  </li>
                );
              })}
            </ul>

            <section className="space-y-2 rounded-md border border-border p-3">
              <h3 className="text-sm font-medium">Calendrier ordonné</h3>
              <ol className="space-y-1">
                {timeline.map((slot) => (
                  <li key={`tl-${slot.id}`} className="text-muted-foreground text-sm">
                    {DPC_COMPONENT_KIND_LABELS_FR[slot.kind]} — {slot.label} ·{" "}
                    {isSlotScheduled(slot)
                      ? `${isoToDateInput(slotStartOf(slot))} → ${isoToDateInput(slotEndOf(slot))}`
                      : "non programmé"}
                  </li>
                ))}
                {timeline.length === 0 ? (
                  <li className="text-muted-foreground text-sm">Calendrier vide.</li>
                ) : null}
              </ol>
            </section>

            {planIssues.filter((issue) => issue.slotId === undefined).length > 0 ? (
              <ul role="alert" className="rounded-md border border-border p-3 text-sm">
                {planIssues
                  .filter((issue) => issue.slotId === undefined)
                  .map((issue) => (
                    <li key={issue.code}>
                      {issue.severity === "blocking" ? "Bloquant : " : "Avertissement : "}
                      {issue.message}
                    </li>
                  ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        {stepId === "publication_check" ? (
          <div className="space-y-4">
            <div className={`${touch} flex flex-wrap items-center gap-3 rounded-md border border-border p-3`}>
              <Switch
                id="dpc-medical-validated"
                checked={draft.medicalParametersValidated}
                onCheckedChange={(checked) =>
                  setDraft({ ...draft, medicalParametersValidated: checked })
                }
              />
              <Label htmlFor="dpc-medical-validated" className="font-normal">
                Je déclare avoir validé le paramétrage médical des critères (validation humaine, non
                automatisable)
              </Label>
            </div>
            <p className="text-muted-foreground text-xs">
              Aucune validation médicale n'est produite par l'application : cette déclaration est de
              la responsabilité du coordinateur.
            </p>

            <ul className="space-y-2">
              {checklist.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-col gap-1 rounded-md border border-border p-3 sm:flex-row sm:items-start sm:gap-3"
                >
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <FileCheck2 className="size-4 shrink-0" aria-hidden="true" />
                    {item.satisfied ? "Conforme" : item.required ? "À compléter" : "Optionnel"} :{" "}
                    {item.label}
                  </span>
                  <span className="text-muted-foreground text-xs sm:ml-auto sm:text-right">
                    {item.detail}
                  </span>
                </li>
              ))}
            </ul>

            <p className="text-sm">
              {readiness.satisfiedCount}/{readiness.requiredCount} points obligatoires satisfaits.
            </p>

            {readiness.blocking.length > 0 ? (
              <ul role="alert" className="rounded-md border border-destructive p-3 text-sm">
                {readiness.blocking.map((item) => (
                  <li key={item.id}>Bloquant : {item.label} — {item.detail}</li>
                ))}
              </ul>
            ) : null}

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Button
                type="button"
                className={`${touch} w-full gap-2 sm:w-auto`}
                disabled={!readiness.canPublish}
                onClick={() =>
                  setPublishNotice(
                    "Publication simulée : aucune écriture, aucun envoi, aucun programme réellement publié.",
                  )
                }
              >
                Publier (simulé)
              </Button>
              <MockBadge label="Publication simulée" />
            </div>
            {publishNotice ? (
              <p role="status" className="rounded-md border border-border p-3 text-sm">
                {publishNotice}
              </p>
            ) : null}
          </div>
        ) : null}
      </PanelCard>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          variant="outline"
          className={`${touch} w-full sm:w-auto`}
          disabled={stepIndex === 0}
          onClick={() => setStepId(DPC_WIZARD_STEPS[Math.max(0, stepIndex - 1)]!.id)}
        >
          Étape précédente
        </Button>
        <Button
          type="button"
          variant="outline"
          className={`${touch} w-full sm:w-auto`}
          disabled={stepIndex === DPC_WIZARD_STEPS.length - 1}
          onClick={() =>
            setStepId(
              DPC_WIZARD_STEPS[Math.min(DPC_WIZARD_STEPS.length - 1, stepIndex + 1)]!.id,
            )
          }
        >
          Étape suivante
        </Button>
      </div>
    </div>
  );
}

function DraftList({
  label,
  items,
  collapsible = false,
}: {
  label: string;
  items: readonly string[];
  collapsible?: boolean;
}) {
  const body = (
    <ul className="space-y-1">
      {items.map((item, index) => (
        <li key={`${label}-${index}`} className="text-muted-foreground text-sm">
          {item}
        </li>
      ))}
      {items.length === 0 ? (
        <li className="text-muted-foreground text-sm">Non renseigné.</li>
      ) : null}
    </ul>
  );
  if (!collapsible || items.length <= 3)
    return (
      <section className="space-y-1 rounded-md border border-border p-3">
        <h3 className="text-sm font-medium">
          {label} <span className="text-muted-foreground">({items.length})</span>
        </h3>
        {body}
      </section>
    );
  return (
    <Collapsible className="rounded-md border border-border p-3">
      <CollapsibleTrigger asChild>
        <Button type="button" variant="ghost" className={`${touch} w-full justify-between gap-2`}>
          <span>
            {label} ({items.length})
          </span>
          <span className="text-muted-foreground text-xs">Afficher / masquer</span>
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2">{body}</CollapsibleContent>
    </Collapsible>
  );
}

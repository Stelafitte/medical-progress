/**
 * COMMUNICATIONS — assistant transversal (DIU, DFASM, DPC, autre).
 *
 * SIMULATION LOCALE STRICTE :
 * - aucun e-mail, aucune notification, aucun appel réseau, aucune tâche
 *   programmée, aucune persistance après rechargement ;
 * - le bouton final prépare une campagne locale ; l'action « Envoyer » n'existe
 *   pas dans cet écran ;
 * - toute la logique de résolution, de contrôle et d'approbation vient du
 *   domaine générique `src/domain/communication.ts`.
 */
import { useMemo, useState } from "react";
import { CheckCircle2, Circle, Info } from "lucide-react";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, MockBadge, PanelCard, ScopeNotice } from "@/features/professional/mock-ui";
import { useProgramAdmin } from "@/features/administration/useProgramAdmin";
import { useSession } from "@/application/session";
import { AdminWorkLevelBanner } from "@/features/administration/AdminWorkLevel";
import { useDirectoryState } from "@/application/directoryStore";
import {
  addPreparedCampaign,
  cancelPreparedCampaign,
  usePreparedCampaigns,
} from "@/application/communicationStore";
import {
  buildActorScope,
  buildCommunicationSnapshot,
} from "@/application/communicationSnapshot";
import {
  buildDemoPreferences,
  communicationTemplates,
} from "@/infrastructure/mock/communicationFixtures";
import { selectProgramDirectory } from "@/domain/directory";
import {
  ALLOWED_VARIABLES,
  MESSAGE_CATEGORY_LABELS_FR,
  PATIENT_SCAN_DISCLAIMER_FR,
  COMMUNICATION_NO_REAL_SEND_FR,
  canApproveCampaign,
  previewCampaign,
  renderForRecipient,
  resolveAudience,
  scanPatientData,
  scheduleCampaign,
  type AudienceDefinition,
  type CommunicationCampaign,
  type MessageCategory,
  type RenderedPreview,
  type ScheduleTrigger,
} from "@/domain/communication";

const LIMITS_FR =
  "Simulation locale : aucun e-mail, aucune notification, aucun appel réseau, aucune tâche programmée. L'historique préparé est perdu au rechargement de la page.";

const HUMAN_CHECK_FR =
  "Ce contrôle automatisé ne garantit pas à lui seul l'absence de données sensibles. Une vérification humaine reste obligatoire.";

const STEPS = [
  "Destinataires",
  "Message",
  "Programmation",
  "Aperçu et contrôle",
  "Préparation finale",
] as const;

type AudienceKind = AudienceDefinition["kind"];

const AUDIENCE_LABELS: Record<AudienceKind, string> = {
  program_all: "Tous les inscrits du programme",
  cohort: "Une cohorte",
  group: "Un groupe",
  persons: "Une ou plusieurs personnes",
  contextual_role: "Un rôle contextualisé",
  milestone_incomplete: "Participants n'ayant pas terminé une étape",
  overdue: "Participants en retard",
  dynamic_filter: "Filtre dynamique",
};

const TRIGGER_LABELS = {
  immediate: "Préparation immédiate",
  at: "Date et heure précises",
  recurring: "Récurrence",
  before_due: "Avant une échéance",
  after_overdue: "Après un retard",
  on_step_open: "À l'ouverture d'une étape",
  on_enrollment: "Lors d'une inscription",
} as const;

type TriggerKind = keyof typeof TRIGGER_LABELS;

const ROLE_LABELS_FR = {
  learner: "Apprenant",
  placement_supervisor: "Encadrant de stage",
  teacher: "Enseignant",
  administrator: "Administrateur",
} as const;

const TIME_ZONES = ["Europe/Paris", "Europe/Brussels", "Indian/Reunion", ""] as const;

const TOUCH = "min-h-11";

export function AdminCommunications() {
  const { data, isPending } = useProgramAdmin();
  const session = useSession();
  const directory = useDirectoryState();
  const history = usePreparedCampaigns();

  const [step, setStep] = useState(0);
  const [audienceKind, setAudienceKind] = useState<AudienceKind>("cohort");
  const [cohortId, setCohortId] = useState("");
  const [groupId, setGroupId] = useState("");
  const [personIds, setPersonIds] = useState<readonly string[]>([]);
  const [role, setRole] = useState<keyof typeof ROLE_LABELS_FR>("learner");
  const [milestoneId, setMilestoneId] = useState("");
  const [search, setSearch] = useState("");
  const [overdueAsOf, setOverdueAsOf] = useState("2027-01-15");

  const [templateId, setTemplateId] = useState("");
  const [category, setCategory] = useState<MessageCategory>("announcement");
  const [subject, setSubject] = useState("Information — {{programTitle}}");
  const [body, setBody] = useState(
    "Bonjour {{firstName}},\n\nUne information concernant {{programTitle}} ({{cohortTitle}}) est disponible : {{accessLink}}\n\n{{coordinatorName}}",
  );
  const [linkLabel, setLinkLabel] = useState("");

  const [triggerKind, setTriggerKind] = useState<TriggerKind>("immediate");
  const [at, setAt] = useState("2027-03-01T09:00");
  const [timeZone, setTimeZone] = useState("Europe/Paris");
  const [everyDays, setEveryDays] = useState(7);
  const [occurrences, setOccurrences] = useState(3);
  const [relativeDays, setRelativeDays] = useState(3);
  const [stepId, setStepId] = useState("");

  const [collectiveConfirmed, setCollectiveConfirmed] = useState(false);
  const [humanValidated, setHumanValidated] = useState(false);
  const [authorPreview, setAuthorPreview] = useState<RenderedPreview | null>(null);
  const [lastPreparedId, setLastPreparedId] = useState<string | null>(null);

  const scope = useMemo(
    () => selectProgramDirectory(directory, session.activeProgram.id),
    [directory, session.activeProgram.id],
  );

  const snapshot = useMemo(
    () =>
      buildCommunicationSnapshot({
        programId: session.activeProgram.id,
        programTitle: session.activeProgram.name,
        coordinatorName: session.person.fullName,
        scope,
        schedule: data?.planSchedule ?? [],
      }),
    [scope, data?.planSchedule, session.activeProgram, session.person.fullName],
  );

  const actorScope = useMemo(
    () =>
      buildActorScope({
        actorPersonId: session.person.id,
        programId: session.activeProgram.id,
        rolesInProgram: session.rolesInActiveProgram,
      }),
    [session.person.id, session.activeProgram.id, session.rolesInActiveProgram],
  );

  const preferences = useMemo(
    () => buildDemoPreferences(scope.rows.map((r) => r.person.id)),
    [scope.rows],
  );

  const audience = useMemo<AudienceDefinition>(() => {
    switch (audienceKind) {
      case "cohort":
        return { kind: "cohort", cohortId };
      case "group":
        return { kind: "group", groupId };
      case "persons":
        return { kind: "persons", personIds };
      case "contextual_role":
        return { kind: "contextual_role", role };
      case "milestone_incomplete":
        return { kind: "milestone_incomplete", milestoneId };
      case "overdue":
        return {
          kind: "overdue",
          asOf: `${overdueAsOf}T00:00:00.000Z`,
          ...(milestoneId ? { milestoneId } : {}),
        };
      case "dynamic_filter":
        return { kind: "dynamic_filter", filter: { search } };
      default:
        return { kind: "program_all" };
    }
  }, [audienceKind, cohortId, groupId, personIds, role, milestoneId, overdueAsOf, search]);

  const resolution = useMemo(
    () => resolveAudience(audience, snapshot, actorScope, preferences),
    [audience, snapshot, actorScope, preferences],
  );

  const milestoneTitle = snapshot.milestones.find((m) => m.milestoneId === milestoneId)?.title;

  const previews = useMemo(
    () =>
      previewCampaign(
        { subject, body },
        resolution,
        snapshot,
        milestoneTitle ? { milestoneTitle } : {},
      ),
    [subject, body, resolution, snapshot, milestoneTitle],
  );

  const patientScan = useMemo(() => scanPatientData(subject, body), [subject, body]);

  const requiresCollective = resolution.recipientCount > 1;

  const trigger = useMemo<ScheduleTrigger>(() => {
    switch (triggerKind) {
      case "at":
        return { kind: "at", at: `${at}:00.000Z`, timeZone };
      case "recurring":
        return { kind: "recurring", startAt: `${at}:00.000Z`, timeZone, everyDays, occurrences };
      case "before_due":
        return { kind: "before_due", days: relativeDays, timeZone };
      case "after_overdue":
        return { kind: "after_overdue", days: relativeDays, timeZone };
      case "on_step_open":
        return { kind: "on_step_open", stepId };
      case "on_enrollment":
        return { kind: "on_enrollment" };
      default:
        return { kind: "immediate" };
    }
  }, [triggerKind, at, timeZone, everyDays, occurrences, relativeDays, stepId]);

  const template = communicationTemplates.find((t) => t.id === templateId);

  const campaign = useMemo<CommunicationCampaign>(
    () => ({
      id: `camp-local-${resolution.recipientCount}-${subject.length}`,
      programId: session.activeProgram.id,
      channel: "email",
      audience,
      subject,
      body,
      status: "pending_approval",
      createdBy: session.person.id,
      maxRecipients: 500,
      requiresCollectiveConfirmation: requiresCollective,
      ...(templateId ? { templateId } : {}),
      ...(requiresCollective && collectiveConfirmed
        ? { collectiveConfirmationAt: "2026-01-01T00:00:00.000Z" }
        : {}),
    }),
    [
      audience,
      subject,
      body,
      templateId,
      requiresCollective,
      collectiveConfirmed,
      resolution.recipientCount,
      session.activeProgram.id,
      session.person.id,
    ],
  );

  const approval = useMemo(
    () =>
      canApproveCampaign({
        campaign,
        resolution,
        previews,
        patientScan,
        actorScope,
        template,
        trigger,
        now: "2026-01-01T00:00:00.000Z",
      }),
    [campaign, resolution, previews, patientScan, actorScope, template, trigger],
  );

  if (isPending || !data) return <Skeleton className="h-80 w-full" />;

  const contentInvalid = previews.some((p) => !p.valid) || previews.length === 0;
  const stepBlocked =
    (step === 0 && resolution.blocking) ||
    (step === 1 && contentInvalid) ||
    (step === 2 &&
      !(
        approval.checks.find((c) => c.id === "trigger_time_zone")?.satisfied &&
        approval.checks.find((c) => c.id === "future_schedule")?.satisfied
      ));

  const canPrepare = approval.canApprove && humanValidated;

  function previewForAuthor() {
    setAuthorPreview(
      renderForRecipient(subject, body, {
        recipient: {
          personId: session.person.id,
          fullName: session.person.fullName,
          email: session.person.email,
          cohortId: session.activeEnrollment?.cohortId ?? "",
          cohortLabel: "Aperçu auteur (simulé)",
        },
        snapshot,
        ...(milestoneTitle ? { milestoneTitle } : {}),
      }),
    );
  }

  function prepareCampaign() {
    const approved: CommunicationCampaign = {
      ...campaign,
      status: "approved",
      approvedBy: session.person.id,
    };
    const finalCampaign =
      trigger.kind === "immediate" ? approved : scheduleCampaign(approved).campaign;
    addPreparedCampaign({
      campaign: { ...finalCampaign, id: `${campaign.id}-${history.length + 1}` },
      trigger,
      triggerLabel: TRIGGER_LABELS[triggerKind],
      audienceLabel: AUDIENCE_LABELS[audienceKind],
      recipientCount: resolution.recipientCount,
      preparedAt: new Date().toISOString(),
      dispatchStatus: "pending",
      isSimulated: true,
    });
    setLastPreparedId(`${campaign.id}-${history.length + 1}`);
  }

  return (
    <div className="space-y-8">


      <div className="grid gap-3 md:grid-cols-3">
        <PanelCard title="Modèles" description="Conception du programme">
          <p className="text-sm text-muted-foreground">
            Les textes réutilisables sont définis au niveau du programme.
          </p>
        </PanelCard>
        <PanelCard title="Programmation" description="Préparation de la promotion">
          <p className="text-sm text-muted-foreground">
            Audience, dates et déclencheurs sont rattachés à la promotion concernée.
          </p>
        </PanelCard>
        <PanelCard title="Campagnes et historique" description="Pilotage de la promotion">
          <p className="text-sm text-muted-foreground">
            Les campagnes préparées, leurs contrôles et leur historique sont suivis ici.
          </p>
        </PanelCard>
      </div>

      <ScopeNotice>
        {COMMUNICATION_NO_REAL_SEND_FR} {LIMITS_FR}
      </ScopeNotice>

      {/* Fil des étapes */}
      <ol className="flex flex-wrap gap-2" aria-label="Étapes de l'assistant">
        {STEPS.map((label, index) => (
          <li key={label}>
            <Button
              type="button"
              variant={index === step ? "default" : "outline"}
              className={TOUCH}
              size="sm"
              aria-current={index === step ? "step" : undefined}
              disabled={index > step}
              onClick={() => setStep(index)}
            >
              {index + 1}. {label}
            </Button>
          </li>
        ))}
      </ol>

      {step === 0 ? (
        <PanelCard
          title="1. Destinataires"
          description="Périmètre limité au programme sélectionné : aucune autre formation n'est accessible."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="audience-kind">Type d'audience</Label>
              <Select
                value={audienceKind}
                onValueChange={(v) => setAudienceKind(v as AudienceKind)}
              >
                <SelectTrigger id="audience-kind" className={TOUCH}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(AUDIENCE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {audienceKind === "cohort" ? (
              <div>
                <Label htmlFor="audience-cohort">Cohorte</Label>
                <Select value={cohortId} onValueChange={setCohortId}>
                  <SelectTrigger id="audience-cohort" className={TOUCH}>
                    <SelectValue placeholder="Choisir une cohorte" />
                  </SelectTrigger>
                  <SelectContent>
                    {scope.cohorts.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            {audienceKind === "group" ? (
              <div>
                <Label htmlFor="audience-group">Groupe</Label>
                <Select value={groupId} onValueChange={setGroupId}>
                  <SelectTrigger id="audience-group" className={TOUCH}>
                    <SelectValue placeholder="Choisir un groupe" />
                  </SelectTrigger>
                  <SelectContent>
                    {snapshot.groups.map((g) => (
                      <SelectItem key={g.groupId} value={g.groupId}>
                        {g.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            {audienceKind === "contextual_role" ? (
              <div>
                <Label htmlFor="audience-role">Rôle contextualisé</Label>
                <Select
                  value={role}
                  onValueChange={(v) => setRole(v as keyof typeof ROLE_LABELS_FR)}
                >
                  <SelectTrigger id="audience-role" className={TOUCH}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(ROLE_LABELS_FR).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            {audienceKind === "milestone_incomplete" || audienceKind === "overdue" ? (
              <div>
                <Label htmlFor="audience-milestone">Étape ou échéance</Label>
                <Select value={milestoneId} onValueChange={setMilestoneId}>
                  <SelectTrigger id="audience-milestone" className={TOUCH}>
                    <SelectValue placeholder="Choisir une étape" />
                  </SelectTrigger>
                  <SelectContent>
                    {snapshot.milestones.map((m) => (
                      <SelectItem key={m.milestoneId} value={m.milestoneId}>
                        {m.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            {audienceKind === "overdue" ? (
              <div>
                <Label htmlFor="audience-asof">Date de référence du retard</Label>
                <Input
                  id="audience-asof"
                  type="date"
                  className={TOUCH}
                  value={overdueAsOf}
                  onChange={(e) => setOverdueAsOf(e.target.value)}
                />
              </div>
            ) : null}

            {audienceKind === "dynamic_filter" ? (
              <div>
                <Label htmlFor="audience-search">Filtre dynamique (nom ou e-mail)</Label>
                <Input
                  id="audience-search"
                  className={TOUCH}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="ex. mar"
                />
              </div>
            ) : null}
          </div>

          {audienceKind === "persons" ? (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Personnes sélectionnées</legend>
              <ul className="max-h-64 space-y-1 overflow-y-auto">
                {scope.rows.map((r) => (
                  <li key={r.enrollment.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`person-${r.enrollment.id}`}
                      checked={personIds.includes(r.person.id)}
                      onCheckedChange={(checked) =>
                        setPersonIds((prev) =>
                          checked === true
                            ? [...prev, r.person.id]
                            : prev.filter((id) => id !== r.person.id),
                        )
                      }
                    />
                    <Label htmlFor={`person-${r.enrollment.id}`} className="py-2 font-normal">
                      {r.fullName} — {r.cohortLabel}
                    </Label>
                  </li>
                ))}
              </ul>
            </fieldset>
          ) : null}

          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Programme concerné</dt>
              <dd className="font-medium">{snapshot.programTitle}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Cohorte ou filtre</dt>
              <dd className="font-medium">{AUDIENCE_LABELS[audienceKind]}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Personnes trouvées</dt>
              <dd className="font-medium">{resolution.recipientCount}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Exclues par préférence</dt>
              <dd className="font-medium">{resolution.optedOut.length}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Doublons éliminés</dt>
              <dd className="font-medium">{resolution.duplicatesRemoved.length}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Hors périmètre</dt>
              <dd className="font-medium">{resolution.outOfScope.length}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Inscriptions retirées exclues</dt>
              <dd className="font-medium">{resolution.withdrawn.length}</dd>
            </div>
          </dl>

          <div aria-live="polite" className="space-y-1 text-sm">
            {resolution.warnings.map((w) => (
              <p key={w} className="text-muted-foreground">
                Avertissement : {w}
              </p>
            ))}
            {resolution.blocking ? (
              <p role="alert" className="font-medium text-destructive">
                Étape bloquée : audience vide ou personnes hors périmètre.
              </p>
            ) : null}
          </div>

          <details className="rounded-md border border-border p-3">
            <summary className="cursor-pointer py-2 text-sm font-medium">
              Liste nominative des destinataires simulés ({resolution.recipientCount})
            </summary>
            {resolution.recipientCount === 0 ? (
              <EmptyState>Aucun destinataire résolu.</EmptyState>
            ) : (
              <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto text-sm">
                {resolution.recipients.map((r) => (
                  <li key={r.personId}>
                    {r.fullName} — {r.cohortLabel}
                  </li>
                ))}
              </ul>
            )}
          </details>
        </PanelCard>
      ) : null}

      {step === 1 ? (
        <PanelCard title="2. Message" description="Modèle validé ou message libre, sans pièce jointe réelle.">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="modele">Modèle de message</Label>
              <Select
                value={templateId}
                onValueChange={(v) => {
                  const chosen = communicationTemplates.find((t) => t.id === v);
                  setTemplateId(v);
                  if (chosen) {
                    setSubject(chosen.subject);
                    setBody(chosen.body);
                    setCategory(chosen.category);
                  }
                }}
              >
                <SelectTrigger id="modele" className={TOUCH}>
                  <SelectValue placeholder="Message libre (aucun modèle)" />
                </SelectTrigger>
                <SelectContent>
                  {communicationTemplates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.subject} — {MESSAGE_CATEGORY_LABELS_FR[t.category]} (
                      {t.status === "validated" ? "validé" : "non validé"})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="categorie">Catégorie</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as MessageCategory)}>
                <SelectTrigger id="categorie" className={TOUCH}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(MESSAGE_CATEGORY_LABELS_FR).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="sujet">Sujet</Label>
            <Input
              id="sujet"
              className={TOUCH}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="contenu-message">Corps du message</Label>
            <Textarea
              id="contenu-message"
              rows={8}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Contenu du message (aucun envoi réel)."
            />
          </div>

          <div>
            <Label htmlFor="lien-ressource">
              Lien vers une ressource ou une étape (aucune pièce jointe réelle)
            </Label>
            <Input
              id="lien-ressource"
              className={TOUCH}
              value={linkLabel}
              onChange={(e) => setLinkLabel(e.target.value)}
              placeholder="ex. Ressource « Coupes standard »"
            />
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Variables autorisées</p>
            <div className="flex flex-wrap gap-2">
              {ALLOWED_VARIABLES.map((name) => (
                <Button
                  key={name}
                  type="button"
                  size="sm"
                  variant="outline"
                  className={TOUCH}
                  onClick={() => setBody((prev) => `${prev}{{${name}}}`)}
                >
                  Insérer {`{{${name}}}`}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Aperçu de personnalisation (2 destinataires)</p>
            {previews.slice(0, 2).length === 0 ? (
              <EmptyState>Aucun destinataire pour prévisualiser.</EmptyState>
            ) : (
              previews.slice(0, 2).map((p) => (
                <div key={p.personId} className="rounded-md border border-border p-3 text-sm">
                  <p className="font-medium">{p.subject}</p>
                  <p className="whitespace-pre-wrap text-muted-foreground">{p.body}</p>
                  {p.issues.map((issue) => (
                    <p key={issue.variable + issue.kind} role="alert" className="text-destructive">
                      {issue.message}
                    </p>
                  ))}
                </div>
              ))
            )}
          </div>

          <Button type="button" variant="outline" className={TOUCH} onClick={previewForAuthor}>
            Prévisualiser pour moi
          </Button>
          {authorPreview ? (
            <div className="rounded-md border border-border p-3 text-sm">
              <p className="font-medium">Aperçu local pour l'auteur — {authorPreview.subject}</p>
              <p className="whitespace-pre-wrap text-muted-foreground">{authorPreview.body}</p>
              <p className="text-xs text-muted-foreground">
                Aucun e-mail et aucune notification ne sont émis par cet aperçu.
              </p>
            </div>
          ) : null}

          <div aria-live="polite">
            {contentInvalid ? (
              <p role="alert" className="text-sm font-medium text-destructive">
                Étape bloquée : variable inconnue, non résolue ou contenu invalide.
              </p>
            ) : null}
          </div>
        </PanelCard>
      ) : null}

      {step === 2 ? (
        <PanelCard
          title="3. Programmation"
          description="Configuration simulée : aucune horloge, aucun ordonnanceur, aucune tâche réelle."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="trigger">Déclenchement</Label>
              <Select value={triggerKind} onValueChange={(v) => setTriggerKind(v as TriggerKind)}>
                <SelectTrigger id="trigger" className={TOUCH}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TRIGGER_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {triggerKind === "at" || triggerKind === "recurring" ? (
              <div>
                <Label htmlFor="trigger-at">Date et heure (future)</Label>
                <Input
                  id="trigger-at"
                  type="datetime-local"
                  className={TOUCH}
                  value={at}
                  onChange={(e) => setAt(e.target.value)}
                />
              </div>
            ) : null}

            {triggerKind === "recurring" ? (
              <>
                <div>
                  <Label htmlFor="trigger-every">Répéter tous les (jours)</Label>
                  <Input
                    id="trigger-every"
                    type="number"
                    min={1}
                    className={TOUCH}
                    value={everyDays}
                    onChange={(e) => setEveryDays(Number(e.target.value))}
                  />
                </div>
                <div>
                  <Label htmlFor="trigger-occ">Nombre d'occurrences</Label>
                  <Input
                    id="trigger-occ"
                    type="number"
                    min={1}
                    className={TOUCH}
                    value={occurrences}
                    onChange={(e) => setOccurrences(Number(e.target.value))}
                  />
                </div>
              </>
            ) : null}

            {triggerKind === "before_due" || triggerKind === "after_overdue" ? (
              <div>
                <Label htmlFor="trigger-days">Nombre de jours</Label>
                <Input
                  id="trigger-days"
                  type="number"
                  min={1}
                  className={TOUCH}
                  value={relativeDays}
                  onChange={(e) => setRelativeDays(Number(e.target.value))}
                />
              </div>
            ) : null}

            {triggerKind === "on_step_open" ? (
              <div>
                <Label htmlFor="trigger-step">Étape déclenchante</Label>
                <Select value={stepId} onValueChange={setStepId}>
                  <SelectTrigger id="trigger-step" className={TOUCH}>
                    <SelectValue placeholder="Choisir une étape" />
                  </SelectTrigger>
                  <SelectContent>
                    {snapshot.milestones.map((m) => (
                      <SelectItem key={m.milestoneId} value={m.milestoneId}>
                        {m.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            {triggerKind !== "immediate" &&
            triggerKind !== "on_step_open" &&
            triggerKind !== "on_enrollment" ? (
              <div>
                <Label htmlFor="trigger-tz">Fuseau horaire (obligatoire)</Label>
                <Select value={timeZone} onValueChange={setTimeZone}>
                  <SelectTrigger id="trigger-tz" className={TOUCH}>
                    <SelectValue placeholder="Aucun fuseau" />
                  </SelectTrigger>
                  <SelectContent>
                    {TIME_ZONES.filter((z) => z !== "").map((z) => (
                      <SelectItem key={z} value={z}>
                        {z}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>

          <div aria-live="polite" className="space-y-1 text-sm">
            {approval.checks
              .filter((c) => c.id === "trigger_time_zone" || c.id === "future_schedule")
              .filter((c) => !c.satisfied)
              .map((c) => (
                <p key={c.id} role="alert" className="font-medium text-destructive">
                  {c.label} : {c.detail}
                </p>
              ))}
          </div>
        </PanelCard>
      ) : null}

      {step === 3 ? (
        <PanelCard
          title="4. Aperçu et contrôle des données sensibles"
          description="Contrôle automatisé du sujet et du corps par les garde-fous du domaine."
        >
          <p className="text-sm">
            Résultat :{" "}
            <Badge variant="outline" className="font-normal">
              {patientScan.verdict === "none"
                ? "aucun marqueur détecté"
                : patientScan.verdict === "warning"
                  ? "avertissement"
                  : "blocage"}
            </Badge>
          </p>
          {patientScan.markers.length > 0 ? (
            <p className="text-sm text-muted-foreground">
              Marqueurs : {patientScan.markers.join(", ")}
            </p>
          ) : null}
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            <span>{HUMAN_CHECK_FR}</span>
          </p>
          <p className="text-xs text-muted-foreground">{PATIENT_SCAN_DISCLAIMER_FR}</p>

          <div className="space-y-2">
            <p className="text-sm font-medium">Aperçus personnalisés</p>
            {previews.slice(0, 2).map((p) => (
              <div key={p.personId} className="rounded-md border border-border p-3 text-sm">
                <p className="font-medium">{p.subject}</p>
                <p className="whitespace-pre-wrap text-muted-foreground">{p.body}</p>
              </div>
            ))}
          </div>
        </PanelCard>
      ) : null}

      {step === 4 ? (
        <PanelCard title="5. Préparation finale" description="Gouvernance avant toute préparation.">
          <ul className="space-y-2 text-sm">
            {approval.checks.map((c) => (
              <li key={c.id} className="flex items-start gap-2">
                {c.satisfied ? (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                ) : (
                  <Circle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
                )}
                <span>
                  <span className="font-medium">
                    {c.label} — {c.satisfied ? "conforme" : "non conforme"}
                  </span>
                  <span className="block text-muted-foreground">{c.detail}</span>
                </span>
              </li>
            ))}
            <li className="flex items-start gap-2">
              {humanValidated ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              ) : (
                <Circle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
              )}
              <span className="font-medium">
                Validation humaine — {humanValidated ? "effectuée" : "requise"}
              </span>
            </li>
          </ul>

          {requiresCollective ? (
            <div className="flex items-start gap-2">
              <Checkbox
                id="confirmation-collective"
                checked={collectiveConfirmed}
                onCheckedChange={(v) => setCollectiveConfirmed(v === true)}
              />
              <Label htmlFor="confirmation-collective" className="py-2 font-normal">
                Je confirme une communication collective à {resolution.recipientCount}{" "}
                destinataire(s) exactement.
              </Label>
            </div>
          ) : null}

          <div className="flex items-start gap-2">
            <Checkbox
              id="validation-humaine"
              checked={humanValidated}
              onCheckedChange={(v) => setHumanValidated(v === true)}
            />
            <Label htmlFor="validation-humaine" className="py-2 font-normal">
              J'ai relu humainement le contenu : aucune donnée sensible de patient.
            </Label>
          </div>

          <div aria-live="polite" className="space-y-1">
            {approval.blockingReasons.map((reason) => (
              <p key={reason} role="alert" className="text-sm text-destructive">
                {reason}
              </p>
            ))}
          </div>

          <Button type="button" className={TOUCH} disabled={!canPrepare} onClick={prepareCampaign}>
            Préparer la campagne (simulation)
          </Button>
          {lastPreparedId ? (
            <p aria-live="polite" className="text-sm text-muted-foreground">
              Campagne préparée localement ({lastPreparedId}) — aucun message n'a été expédié.
            </p>
          ) : null}
        </PanelCard>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          className={TOUCH}
          disabled={step === 0}
          onClick={() => setStep((s) => Math.max(0, s - 1))}
        >
          Étape précédente
        </Button>
        <Button
          type="button"
          className={TOUCH}
          disabled={step === STEPS.length - 1 || stepBlocked}
          onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
        >
          Étape suivante
        </Button>
      </div>

      <PanelCard
        title="Historique local des campagnes préparées"
        description="Mémoire de session uniquement : rien n'est expédié, rien n'est conservé après rechargement."
      >
        {history.length === 0 ? (
          <EmptyState>Aucune campagne préparée dans cette session.</EmptyState>
        ) : (
          <ul className="space-y-3 text-sm">
            {history.map((entry) => (
              <li key={entry.campaign.id} className="space-y-1 rounded-md border border-border p-3">
                <p className="font-medium">{entry.campaign.subject}</p>
                <p className="text-muted-foreground">
                  {entry.audienceLabel} · {entry.recipientCount} destinataire(s) ·{" "}
                  {entry.triggerLabel} · statut simulé :{" "}
                  {entry.campaign.status === "scheduled"
                    ? "scheduled"
                    : entry.campaign.status === "cancelled"
                      ? "cancelled"
                      : "approved"}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="font-normal">
                    préparé, non expédié
                  </Badge>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className={TOUCH}
                    disabled={entry.dispatchStatus !== "pending"}
                    onClick={() => cancelPreparedCampaign(entry.campaign.id)}
                  >
                    Annuler localement
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </PanelCard>
    </div>
  );
}

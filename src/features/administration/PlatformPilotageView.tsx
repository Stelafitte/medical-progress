/**
 * Onglet 4 — « Pilotage et paramétrage ».
 *
 * Cinq sections verticales :
 * 1. utilisateurs par groupe de rôle, fiche ouvrable et modifiable ;
 * 2. cadre général de la plateforme ;
 * 3. cadre par programme ;
 * 4. notifications et sollicitations ;
 * 5. courriel aux non-apprenants (aucun envoi réel).
 *
 * Invariant : aucune donnée pédagogique (preuve, carnet, progression) n'est
 * accessible ici, et toute modification de fiche exige un motif.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import {
  EmptyState,
  MockBadge,
  PanelCard,
  ScopeNotice,
} from "@/features/professional/mock-ui";
import { useDataAccess } from "@/application/session";
import {
  ACCOUNT_STATUS_LABELS_FR,
  PLATFORM_NO_PEDAGOGY_FR,
  PLATFORM_ROLE_GROUP_LABELS_FR,
  PLATFORM_ROLE_GROUP_ORDER,
  NON_LEARNER_GROUPS,
  buildPlatformDirectory,
  groupPlatformDirectory,
  personEditAuditLabel,
  resolveNonLearnerRecipients,
  validatePersonEdit,
  type AccountStatus,
  type PersonEditInput,
  type PlatformDirectoryRow,
  type PlatformRoleGroup,
} from "@/domain/platformDirectory";
import {
  NOTIFICATION_CADENCE_LABELS_FR,
  NOTIFICATION_CHANNEL_LABELS_FR,
  PLATFORM_SETTINGS_MOCK_FR,
  SOLICITATION_LABELS_FR,
  checkNonLearnerMailing,
  validateGeneralSettings,
  validateProgramSettings,
  type NotificationCadence,
  type NotificationChannel,
  type PlatformGeneralSettings,
  type ProgramPlatformSettings,
} from "@/domain/platformSettings";
import {
  addPreparedMailing,
  programSettingsFor,
  savePersonOverride,
  setGeneralSettings,
  setNotificationRule,
  setProgramSettings,
  usePlatformSettings,
} from "@/application/platformSettingsStore";
import { PlatformGovernanceSections } from "@/features/administration/PlatformGovernanceSections";
import { formatFrDate } from "@/features/administration/adminProgramViewModel";
import type { Program } from "@/domain/types";

export function PlatformPilotageView() {
  const data = useDataAccess();
  const settings = usePlatformSettings();

  const { data: result, isPending } = useQuery({
    queryKey: ["platform-pilotage"],
    queryFn: async () => {
      const [people, roles, programs, cohorts] = await Promise.all([
        data.administration.listPeople(),
        data.administration.listAllRoleAssignments(),
        data.programs.listPrograms(),
        data.programs.listCohorts(),
      ]);
      return { people, roles, programs, cohorts };
    },
  });

  if (isPending || !result) return <Skeleton className="h-80 w-full" />;

  const directory = buildPlatformDirectory(result.people, result.roles);
  const grouped = groupPlatformDirectory(directory);

  return (
    <div className="space-y-6">
      <SectionHeading
        title="Pilotage et paramétrage"
        level={1}
        action={<MockBadge label="Maquette limitée" />}
        description="Utilisateurs et fiches, cadre général, cadre par programme, sécurité, conservation, délégations de rôles, fonctionnalités, maintenance, exports d'audit, notifications et courriel aux intervenants."
      />

      <ScopeNotice>{PLATFORM_SETTINGS_MOCK_FR}</ScopeNotice>
      <ScopeNotice>{PLATFORM_NO_PEDAGOGY_FR}</ScopeNotice>

      <DirectorySection rows={directory} grouped={grouped} programs={result.programs} />
      <GeneralSettingsSection value={settings.general} />
      <ProgramSettingsSection programs={result.programs} cohorts={result.cohorts} />
      <NotificationsSection />
      <PlatformGovernanceSections programs={result.programs} people={result.people} />
      <MailingSection rows={directory} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 1. Utilisateurs par groupe de rôle                                  */
/* ------------------------------------------------------------------ */

function DirectorySection({
  rows,
  grouped,
  programs,
}: {
  rows: readonly PlatformDirectoryRow[];
  grouped: Record<PlatformRoleGroup, readonly PlatformDirectoryRow[]>;
  programs: readonly Program[];
}) {
  const settings = usePlatformSettings();
  const [group, setGroup] = useState<PlatformRoleGroup>("platform_admin");
  const [editing, setEditing] = useState<PlatformDirectoryRow | null>(null);

  const visible = grouped[group] ?? [];
  const programName = (id: string) => programs.find((p) => p.id === id)?.code ?? id;

  return (
    <PanelCard
      title="Utilisateurs par groupe de rôle"
      description={`${rows.length} personne(s) disposant d'au moins un rôle contextualisé.`}
    >
      <div className="flex flex-wrap gap-2">
        {PLATFORM_ROLE_GROUP_ORDER.map((key) => (
          <Button
            key={key}
            size="sm"
            variant={key === group ? "default" : "outline"}
            className="min-h-11"
            onClick={() => setGroup(key)}
          >
            {PLATFORM_ROLE_GROUP_LABELS_FR[key]}
            <Badge variant="secondary" className="ms-2 font-normal">
              {(grouped[key] ?? []).length}
            </Badge>
          </Button>
        ))}
      </div>

      {visible.length === 0 ? (
        <EmptyState>Aucune personne dans ce groupe.</EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Personne</TableHead>
                <TableHead>Courriel</TableHead>
                <TableHead>Périmètres</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="text-right">Fiche</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((row) => {
                const override = settings.personOverrides[row.personId];
                const status: AccountStatus = override?.status ?? "active";
                return (
                  <TableRow key={`${group}-${row.personId}`}>
                    <TableCell className="font-medium">
                      {override?.fullName ?? row.fullName}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {override?.email ?? row.email}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {row.programIds.length > 0
                        ? row.programIds.map(programName).join(" · ")
                        : "plateforme"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={status === "active" ? "secondary" : "destructive"}
                        className="font-normal"
                      >
                        {ACCOUNT_STATUS_LABELS_FR[status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        className="min-h-11"
                        onClick={() => setEditing(row)}
                      >
                        Ouvrir la fiche
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <PersonSheetDialog row={editing} onClose={() => setEditing(null)} />
    </PanelCard>
  );
}

function PersonSheetDialog({
  row,
  onClose,
}: {
  row: PlatformDirectoryRow | null;
  onClose: () => void;
}) {
  const settings = usePlatformSettings();
  const override = row ? settings.personOverrides[row.personId] : undefined;
  const [draft, setDraft] = useState<PersonEditInput | null>(null);

  const value: PersonEditInput | null = row
    ? (draft ?? {
        fullName: override?.fullName ?? row.fullName,
        email: override?.email ?? row.email,
        status: override?.status ?? "active",
        notifyByEmail: override?.notifyByEmail ?? true,
        reason: "",
      })
    : null;

  const errors = value ? validatePersonEdit(value) : [];

  const close = () => {
    setDraft(null);
    onClose();
  };

  return (
    <Dialog open={row !== null} onOpenChange={(open) => (open ? undefined : close())}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Fiche de {row?.fullName ?? ""}</DialogTitle>
          <DialogDescription>{PLATFORM_NO_PEDAGOGY_FR}</DialogDescription>
        </DialogHeader>

        {row && value ? (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {row.groups.map((g) => (
                <Badge key={g} variant="outline" className="font-normal">
                  {PLATFORM_ROLE_GROUP_LABELS_FR[g]}
                </Badge>
              ))}
            </div>

            <div className="space-y-2">
              <Label htmlFor="person-name">Nom complet</Label>
              <Input
                id="person-name"
                value={value.fullName}
                onChange={(e) => setDraft({ ...value, fullName: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="person-email">Courriel</Label>
              <Input
                id="person-email"
                type="email"
                value={value.email}
                onChange={(e) => setDraft({ ...value, email: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="person-status">Statut du compte</Label>
              <Select
                value={value.status}
                onValueChange={(v) => setDraft({ ...value, status: v as AccountStatus })}
              >
                <SelectTrigger id="person-status" className="min-h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">{ACCOUNT_STATUS_LABELS_FR.active}</SelectItem>
                  <SelectItem value="suspended">{ACCOUNT_STATUS_LABELS_FR.suspended}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="border-border flex items-center justify-between gap-3 rounded-md border px-3 py-2">
              <Label htmlFor="person-notify">Notifications par courriel</Label>
              <Switch
                id="person-notify"
                checked={value.notifyByEmail}
                onCheckedChange={(checked) => setDraft({ ...value, notifyByEmail: checked })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="person-reason">Motif de la modification (obligatoire)</Label>
              <Textarea
                id="person-reason"
                value={value.reason}
                onChange={(e) => setDraft({ ...value, reason: e.target.value })}
                placeholder="Ex. changement d'adresse institutionnelle"
              />
            </div>

            {errors.length > 0 ? (
              <ul className="text-destructive space-y-1 text-xs">
                {errors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            ) : null}

            {override ? (
              <p className="text-muted-foreground text-xs">
                Dernière modification simulée le {formatFrDate(override.updatedAt)} — motif :{" "}
                {override.reason}
              </p>
            ) : null}
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" className="min-h-11" onClick={close}>
            Annuler
          </Button>
          <Button
            className="min-h-11"
            disabled={!row || !value || errors.length > 0}
            onClick={() => {
              if (!row || !value) return;
              savePersonOverride(row.personId, value);
              toast.success("Fiche mise à jour (simulé)", {
                description: personEditAuditLabel(row, value),
              });
              close();
            }}
          >
            Enregistrer (simulé)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* 2. Cadre général                                                    */
/* ------------------------------------------------------------------ */

function GeneralSettingsSection({ value }: { value: PlatformGeneralSettings }) {
  const [draft, setDraft] = useState<PlatformGeneralSettings | null>(null);
  const current = draft ?? value;
  const errors = validateGeneralSettings(current);

  return (
    <PanelCard
      title="Paramètres généraux de la plateforme"
      description="Cadre commun à tous les programmes. La validation humaine avant publication ne peut pas être désactivée."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="platform-name">Nom de la plateforme</Label>
          <Input
            id="platform-name"
            value={current.platformName}
            onChange={(e) => setDraft({ ...current, platformName: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="platform-support">Adresse de support</Label>
          <Input
            id="platform-support"
            type="email"
            value={current.supportEmail}
            onChange={(e) => setDraft({ ...current, supportEmail: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="platform-retention">Conservation des traces (mois)</Label>
          <Input
            id="platform-retention"
            type="number"
            min={1}
            value={current.retentionMonths}
            onChange={(e) => setDraft({ ...current, retentionMonths: Number(e.target.value) })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="platform-storage">Quota de stockage global (Go)</Label>
          <Input
            id="platform-storage"
            type="number"
            min={1}
            value={current.storageQuotaGb}
            onChange={(e) => setDraft({ ...current, storageQuotaGb: Number(e.target.value) })}
          />
        </div>
      </div>

      <div className="border-border flex items-center justify-between gap-3 rounded-md border px-3 py-2">
        <Label htmlFor="platform-human">Validation humaine obligatoire avant publication</Label>
        <Switch
          id="platform-human"
          checked={current.requireHumanValidation}
          onCheckedChange={(checked) => setDraft({ ...current, requireHumanValidation: checked })}
        />
      </div>
      <div className="border-border flex items-center justify-between gap-3 rounded-md border px-3 py-2">
        <Label htmlFor="platform-ai">
          Exploitation IA autorisée (aucun appel réel dans cette maquette)
        </Label>
        <Switch
          id="platform-ai"
          checked={current.aiEnabled}
          onCheckedChange={(checked) => setDraft({ ...current, aiEnabled: checked })}
        />
      </div>

      {errors.length > 0 ? (
        <ul className="text-destructive space-y-1 text-xs">
          {errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          className="min-h-11"
          disabled={errors.length > 0 || draft === null}
          onClick={() => {
            setGeneralSettings(current);
            setDraft(null);
            toast.success("Paramètres généraux enregistrés (simulé)");
          }}
        >
          Enregistrer (simulé)
        </Button>
        <Button
          variant="outline"
          className="min-h-11"
          disabled={draft === null}
          onClick={() => setDraft(null)}
        >
          Annuler les modifications
        </Button>
      </div>
    </PanelCard>
  );
}

/* ------------------------------------------------------------------ */
/* 3. Cadre par programme                                              */
/* ------------------------------------------------------------------ */

function ProgramSettingsSection({
  programs,
  cohorts,
}: {
  programs: readonly Program[];
  cohorts: readonly { programId: string; learnerCount: number }[];
}) {
  const state = usePlatformSettings();
  const [programId, setProgramId] = useState<string>(programs[0]?.id ?? "");
  const [draft, setDraft] = useState<ProgramPlatformSettings | null>(null);

  const fallback = useMemo<ProgramPlatformSettings>(() => {
    const learners = cohorts
      .filter((c) => c.programId === programId)
      .reduce((n, c) => n + c.learnerCount, 0);
    return {
      programId: programId as ProgramPlatformSettings["programId"],
      learnerCap: Math.max(50, learners * 2),
      aiCreditQuota: 5000,
      storageQuotaGb: 50,
      placementsEnabled: true,
      notificationsEnabled: true,
    };
  }, [cohorts, programId]);

  const stored = programSettingsFor(
    state,
    programId as ProgramPlatformSettings["programId"],
    fallback,
  );
  const current = draft?.programId === programId ? draft : stored;
  const errors = validateProgramSettings(current);

  return (
    <PanelCard
      title="Paramètres par programme"
      description="Plafonds et modules activés pour chaque programme, dans le cadre général ci-dessus."
    >
      <div className="space-y-2">
        <Label htmlFor="program-settings-select">Programme</Label>
        <Select
          value={programId}
          onValueChange={(v) => {
            setProgramId(v);
            setDraft(null);
          }}
        >
          <SelectTrigger id="program-settings-select" className="min-h-11">
            <SelectValue placeholder="Choisir un programme" />
          </SelectTrigger>
          <SelectContent>
            {programs.map((program) => (
              <SelectItem key={program.id} value={program.id}>
                {program.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="program-cap">Plafond d'apprenants</Label>
          <Input
            id="program-cap"
            type="number"
            min={1}
            value={current.learnerCap}
            onChange={(e) => setDraft({ ...current, learnerCap: Number(e.target.value) })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="program-credits">Quota de crédits IA</Label>
          <Input
            id="program-credits"
            type="number"
            min={0}
            value={current.aiCreditQuota}
            onChange={(e) => setDraft({ ...current, aiCreditQuota: Number(e.target.value) })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="program-storage">Stockage (Go)</Label>
          <Input
            id="program-storage"
            type="number"
            min={1}
            value={current.storageQuotaGb}
            onChange={(e) => setDraft({ ...current, storageQuotaGb: Number(e.target.value) })}
          />
        </div>
      </div>

      <div className="border-border flex items-center justify-between gap-3 rounded-md border px-3 py-2">
        <Label htmlFor="program-placements">Module stages activé</Label>
        <Switch
          id="program-placements"
          checked={current.placementsEnabled}
          onCheckedChange={(checked) => setDraft({ ...current, placementsEnabled: checked })}
        />
      </div>
      <div className="border-border flex items-center justify-between gap-3 rounded-md border px-3 py-2">
        <Label htmlFor="program-notifications">Notifications activées</Label>
        <Switch
          id="program-notifications"
          checked={current.notificationsEnabled}
          onCheckedChange={(checked) => setDraft({ ...current, notificationsEnabled: checked })}
        />
      </div>

      {errors.length > 0 ? (
        <ul className="text-destructive space-y-1 text-xs">
          {errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      ) : null}

      <Button
        className="min-h-11"
        disabled={errors.length > 0 || draft === null}
        onClick={() => {
          setProgramSettings(current);
          setDraft(null);
          toast.success("Paramètres du programme enregistrés (simulé)");
        }}
      >
        Enregistrer (simulé)
      </Button>
    </PanelCard>
  );
}

/* ------------------------------------------------------------------ */
/* 4. Notifications et sollicitations                                  */
/* ------------------------------------------------------------------ */

function NotificationsSection() {
  const state = usePlatformSettings();

  return (
    <PanelCard
      title="Notifications et sollicitations"
      description="Canal et cadence par type de sollicitation. Aucun message n'est expédié depuis cet écran."
    >
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Sollicitation</TableHead>
              <TableHead>Destinataires</TableHead>
              <TableHead>Canal</TableHead>
              <TableHead>Cadence</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {state.notificationRules.map((rule, index) => (
              <TableRow key={rule.kind}>
                <TableCell className="font-medium">{SOLICITATION_LABELS_FR[rule.kind]}</TableCell>
                <TableCell className="text-muted-foreground">{rule.audienceLabel}</TableCell>
                <TableCell>
                  <Select
                    value={rule.channel}
                    onValueChange={(v) =>
                      setNotificationRule(index, { ...rule, channel: v as NotificationChannel })
                    }
                  >
                    <SelectTrigger className="min-h-11 min-w-44">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(NOTIFICATION_CHANNEL_LABELS_FR).map(([key, label]) => (
                        <SelectItem key={key} value={key}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Select
                    value={rule.cadence}
                    onValueChange={(v) =>
                      setNotificationRule(index, { ...rule, cadence: v as NotificationCadence })
                    }
                  >
                    <SelectTrigger className="min-h-11 min-w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(NOTIFICATION_CADENCE_LABELS_FR).map(([key, label]) => (
                        <SelectItem key={key} value={key}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-muted-foreground text-xs">
        Règles de garde : une alerte de quota IA ne cible jamais les apprenants, et le SMS immédiat
        reste réservé aux convocations.
      </p>
    </PanelCard>
  );
}

/* ------------------------------------------------------------------ */
/* 5. Courriel aux non-apprenants                                      */
/* ------------------------------------------------------------------ */

function MailingSection({ rows }: { rows: readonly PlatformDirectoryRow[] }) {
  const state = usePlatformSettings();
  const [groupKeys, setGroupKeys] = useState<readonly string[]>(["platform_admin"]);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const staff = resolveNonLearnerRecipients(rows);
  const recipients = staff.filter((row) =>
    row.groups.some((g) => groupKeys.includes(g as string)),
  );
  const check = checkNonLearnerMailing({ subject, body, groupKeys }, recipients.length);

  const toggle = (key: string) =>
    setGroupKeys((keys) => (keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key]));

  return (
    <PanelCard
      title="Courriel aux intervenants (hors apprenants)"
      description="Message ponctuel vers les équipes. Les apprenants restent adressés par les communications de programme."
    >
      <div className="flex flex-wrap gap-2">
        {NON_LEARNER_GROUPS.map((key) => (
          <Button
            key={key}
            size="sm"
            variant={groupKeys.includes(key) ? "default" : "outline"}
            className="min-h-11"
            onClick={() => toggle(key)}
          >
            {PLATFORM_ROLE_GROUP_LABELS_FR[key]}
          </Button>
        ))}
      </div>

      <p className="text-muted-foreground text-xs">
        {recipients.length} destinataire(s) résolu(s) sur {staff.length} intervenant(s).
      </p>

      <div className="space-y-2">
        <Label htmlFor="mailing-subject">Objet</Label>
        <Input
          id="mailing-subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Ex. réunion de coordination pédagogique"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="mailing-body">Message</Label>
        <Textarea
          id="mailing-body"
          value={body}
          rows={5}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Texte simple : le balisage exécutable et les données patient sont refusés."
        />
      </div>

      {check.errors.length > 0 ? (
        <ul className="text-destructive space-y-1 text-xs">
          {check.errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      ) : null}
      {check.patientVerdict !== "none" ? (
        <p className="text-destructive text-xs">
          Marqueurs détectés : {check.markers.join(", ")}.
        </p>
      ) : null}

      <Button
        className="min-h-11"
        disabled={!check.canPrepare}
        onClick={() => {
          addPreparedMailing({ subject, groupKeys, recipients: recipients.length });
          setSubject("");
          setBody("");
          toast.success("Courriel préparé (aucun envoi réel)");
        }}
      >
        Préparer l'envoi (simulé)
      </Button>

      {state.preparedMailings.length === 0 ? (
        <EmptyState>Aucun courriel préparé pour l'instant.</EmptyState>
      ) : (
        <ul className="space-y-2">
          {state.preparedMailings.map((mailing) => (
            <li key={mailing.id} className="border-border rounded-md border px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{mailing.subject}</span>
                <Badge variant="outline" className="font-normal">
                  préparé, non envoyé
                </Badge>
              </div>
              <p className="text-muted-foreground text-xs">
                {mailing.recipients} destinataire(s) ·{" "}
                {mailing.groupKeys
                  .map((k) => PLATFORM_ROLE_GROUP_LABELS_FR[k as PlatformRoleGroup] ?? k)
                  .join(" · ")}{" "}
                · {formatFrDate(mailing.preparedAt)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </PanelCard>
  );
}

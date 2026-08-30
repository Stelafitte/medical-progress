/**
 * Sections de gouvernance de l'onglet « Pilotage et paramétrage ».
 *
 * Six blocs complémentaires au paramétrage de base : sécurité et
 * authentification, conservation des données, délégations de rôles
 * contextualisés, drapeaux de fonctionnalités par programme, maintenance et
 * exports d'audit, puis le catalogue d'intégrations.
 *
 * Tout est simulé et conservé le temps de la session ; aucune donnée
 * pédagogique n'est accessible depuis ces écrans.
 */
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, PanelCard } from "@/features/professional/mock-ui";
import {
  AUDIT_EXPORT_SCOPE_LABELS_FR,
  FEATURE_FLAG_LABELS_FR,
  FEATURE_FLAG_ORDER,
  INTEGRATION_CATALOG,
  INTEGRATION_STATUS_LABELS_FR,
  PLATFORM_GOVERNANCE_MOCK_FR,
  validateAuditExport,
  validateFeatureFlags,
  validateMaintenance,
  validateRetentionPolicy,
  validateRoleDelegation,
  validateSecurityPolicy,
  type AuditExportDraft,
  type AuditExportScope,
  type DataRetentionPolicy,
  type FeatureFlags,
  type MaintenanceSettings,
  type PlatformSecurityPolicy,
  type RoleDelegationDraft,
} from "@/domain/platformGovernance";
import {
  addAuditExport,
  addRoleDelegation,
  featureFlagsFor,
  setFeatureFlags,
  setMaintenanceSettings,
  setRetentionPolicy,
  setSecurityPolicy,
  usePlatformSettings,
} from "@/application/platformSettingsStore";
import { ROLE_LABELS_FR } from "@/domain/roles";
import type { Person, Program, ProgramId, RoleName } from "@/domain/types";

/** Liste d'erreurs de validation, présentation homogène. */
function Errors({ errors }: { errors: readonly string[] }) {
  if (errors.length === 0) return null;
  return (
    <ul className="text-destructive space-y-1 text-xs">
      {errors.map((error) => (
        <li key={error}>{error}</li>
      ))}
    </ul>
  );
}

export function PlatformGovernanceSections({
  programs,
  people,
}: {
  readonly programs: readonly Program[];
  readonly people: readonly Person[];
}) {
  return (
    <div className="space-y-6">
      <SecuritySection />
      <RetentionSection />
      <DelegationSection programs={programs} people={people} />
      <FeatureFlagsSection programs={programs} />
      <MaintenanceSection />
      <AuditExportSection programs={programs} people={people} />
      <IntegrationsSection />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sécurité et authentification                                        */
/* ------------------------------------------------------------------ */

function SecuritySection() {
  const stored = usePlatformSettings().security;
  const [draft, setDraft] = useState<PlatformSecurityPolicy>(stored);
  const [domains, setDomains] = useState(stored.allowedEmailDomains.join(", "));

  const parsed: PlatformSecurityPolicy = {
    ...draft,
    allowedEmailDomains: domains
      .split(",")
      .map((d) => d.trim())
      .filter((d) => d.length > 0),
  };
  const errors = validateSecurityPolicy(parsed);

  return (
    <PanelCard
      title="Sécurité et authentification"
      description="Double facteur, sessions, mots de passe et domaines de courriel autorisés."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
          <span className="text-sm">Double facteur imposé aux administrateurs</span>
          <Switch
            checked={parsed.mfaRequiredForAdmins}
            onCheckedChange={(v) => setDraft({ ...draft, mfaRequiredForAdmins: v })}
            aria-label="Double facteur imposé aux administrateurs"
          />
        </label>
        <label className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
          <span className="text-sm">Journaliser les accès aux fiches</span>
          <Switch
            checked={parsed.logPersonFileAccess}
            onCheckedChange={(v) => setDraft({ ...draft, logPersonFileAccess: v })}
            aria-label="Journaliser les accès aux fiches"
          />
        </label>
        <div className="space-y-1">
          <Label htmlFor="session-timeout">Expiration de session (minutes)</Label>
          <Input
            id="session-timeout"
            type="number"
            min={5}
            value={parsed.sessionTimeoutMinutes}
            onChange={(e) =>
              setDraft({ ...draft, sessionTimeoutMinutes: Number(e.target.value) })
            }
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="password-length">Longueur minimale du mot de passe</Label>
          <Input
            id="password-length"
            type="number"
            min={12}
            value={parsed.passwordMinLength}
            onChange={(e) => setDraft({ ...draft, passwordMinLength: Number(e.target.value) })}
          />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="allowed-domains">Domaines de courriel autorisés</Label>
          <Input
            id="allowed-domains"
            value={domains}
            onChange={(e) => setDomains(e.target.value)}
            placeholder="univ-bordeaux.fr, chu-bordeaux.fr"
          />
          <p className="text-muted-foreground text-xs">
            Séparés par des virgules. Laisser vide pour n'appliquer aucun filtre.
          </p>
        </div>
      </div>
      <Errors errors={errors} />
      <div className="flex justify-end">
        <Button
          className="min-h-11"
          disabled={errors.length > 0}
          onClick={() => {
            setSecurityPolicy(parsed);
            toast.success("Politique de sécurité enregistrée (simulation locale).");
          }}
        >
          Enregistrer la politique
        </Button>
      </div>
    </PanelCard>
  );
}

/* ------------------------------------------------------------------ */
/* Conservation des données                                            */
/* ------------------------------------------------------------------ */

function RetentionSection() {
  const stored = usePlatformSettings().retention;
  const [draft, setDraft] = useState<DataRetentionPolicy>(stored);
  const errors = validateRetentionPolicy(draft);

  return (
    <PanelCard
      title="Conservation des données et protection"
      description="Durées de conservation par nature de donnée, purge après archivage et contact du délégué à la protection des données."
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="retention-evidence">Preuves (mois)</Label>
          <Input
            id="retention-evidence"
            type="number"
            min={12}
            value={draft.evidenceMonths}
            onChange={(e) => setDraft({ ...draft, evidenceMonths: Number(e.target.value) })}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="retention-audit">Journal d'audit (mois)</Label>
          <Input
            id="retention-audit"
            type="number"
            min={36}
            value={draft.auditMonths}
            onChange={(e) => setDraft({ ...draft, auditMonths: Number(e.target.value) })}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="retention-media">Médias déposés (mois)</Label>
          <Input
            id="retention-media"
            type="number"
            min={1}
            value={draft.mediaMonths}
            onChange={(e) => setDraft({ ...draft, mediaMonths: Number(e.target.value) })}
          />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="dpo-email">Délégué à la protection des données</Label>
          <Input
            id="dpo-email"
            type="email"
            value={draft.dpoEmail}
            onChange={(e) => setDraft({ ...draft, dpoEmail: e.target.value })}
          />
        </div>
        <label className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
          <span className="text-sm">Purge après export d'archive</span>
          <Switch
            checked={draft.purgeAfterExport}
            onCheckedChange={(v) => setDraft({ ...draft, purgeAfterExport: v })}
            aria-label="Purge après export d'archive"
          />
        </label>
      </div>
      <Errors errors={errors} />
      <div className="flex justify-end">
        <Button
          className="min-h-11"
          disabled={errors.length > 0}
          onClick={() => {
            setRetentionPolicy(draft);
            toast.success("Politique de conservation enregistrée (simulation locale).");
          }}
        >
          Enregistrer la conservation
        </Button>
      </div>
    </PanelCard>
  );
}

/* ------------------------------------------------------------------ */
/* Délégations de rôles                                                */
/* ------------------------------------------------------------------ */

const DELEGABLE_ROLES: readonly RoleName[] = [
  "administrator",
  "teacher",
  "placement_supervisor",
];

function DelegationSection({
  programs,
  people,
}: {
  readonly programs: readonly Program[];
  readonly people: readonly Person[];
}) {
  const traces = usePlatformSettings().delegations;
  const today = new Date().toISOString().slice(0, 10);
  const [draft, setDraft] = useState<RoleDelegationDraft>({
    personId: people[0]?.id ?? "",
    role: "administrator",
    scope: "program",
    programId: programs[0]?.id,
    reason: "",
    expiresOn: "",
  });
  const errors = validateRoleDelegation(draft, today);

  return (
    <PanelCard
      title="Délégations de rôles contextualisés"
      description="Aucun rôle global : chaque délégation porte sur un programme ou sur la plateforme, avec motif et échéance obligatoires."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="deleg-person">Personne</Label>
          <Select
            value={draft.personId}
            onValueChange={(v) => setDraft({ ...draft, personId: v })}
          >
            <SelectTrigger id="deleg-person" className="min-h-11">
              <SelectValue placeholder="Choisir une personne" />
            </SelectTrigger>
            <SelectContent>
              {people.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.fullName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="deleg-role">Rôle délégué</Label>
          <Select
            value={draft.role}
            onValueChange={(v) => setDraft({ ...draft, role: v as RoleName })}
          >
            <SelectTrigger id="deleg-role" className="min-h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DELEGABLE_ROLES.map((role) => (
                <SelectItem key={role} value={role}>
                  {ROLE_LABELS_FR[role]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="deleg-scope">Portée</Label>
          <Select
            value={draft.scope}
            onValueChange={(v) =>
              setDraft({ ...draft, scope: v as RoleDelegationDraft["scope"] })
            }
          >
            <SelectTrigger id="deleg-scope" className="min-h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="program">Un programme</SelectItem>
              <SelectItem value="platform">Plateforme entière</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {draft.scope === "program" ? (
          <div className="space-y-1">
            <Label htmlFor="deleg-program">Programme</Label>
            <Select
              value={draft.programId ?? ""}
              onValueChange={(v) => setDraft({ ...draft, programId: v as ProgramId })}
            >
              <SelectTrigger id="deleg-program" className="min-h-11">
                <SelectValue placeholder="Choisir un programme" />
              </SelectTrigger>
              <SelectContent>
                {programs.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        <div className="space-y-1">
          <Label htmlFor="deleg-expires">Fin de délégation</Label>
          <Input
            id="deleg-expires"
            type="date"
            value={draft.expiresOn}
            onChange={(e) => setDraft({ ...draft, expiresOn: e.target.value })}
          />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="deleg-reason">Motif (obligatoire)</Label>
          <Textarea
            id="deleg-reason"
            value={draft.reason}
            onChange={(e) => setDraft({ ...draft, reason: e.target.value })}
            placeholder="Remplacement du coordinateur pendant son congé, validé par la direction."
          />
        </div>
      </div>
      <Errors errors={errors} />
      <div className="flex justify-end">
        <Button
          className="min-h-11"
          disabled={errors.length > 0}
          onClick={() => {
            addRoleDelegation(draft);
            setDraft({ ...draft, reason: "", expiresOn: "" });
            toast.success("Délégation enregistrée dans la trace locale.");
          }}
        >
          Enregistrer la délégation
        </Button>
      </div>

      {traces.length === 0 ? (
        <EmptyState>Aucune délégation enregistrée pendant cette session.</EmptyState>
      ) : (
        <ul className="text-muted-foreground space-y-1 text-xs">
          {traces.map((trace) => (
            <li key={trace.id}>{trace.label}</li>
          ))}
        </ul>
      )}
    </PanelCard>
  );
}

/* ------------------------------------------------------------------ */
/* Drapeaux de fonctionnalités                                         */
/* ------------------------------------------------------------------ */

function FeatureFlagsSection({ programs }: { readonly programs: readonly Program[] }) {
  const settings = usePlatformSettings();
  const [programId, setProgramId] = useState<ProgramId | "">(programs[0]?.id ?? "");
  const stored = programId ? featureFlagsFor(settings, programId as ProgramId) : null;
  const [draft, setDraft] = useState<FeatureFlags | null>(stored);
  const flags = draft ?? stored;

  const errors = flags
    ? validateFeatureFlags(flags, { aiEnabledPlatformWide: settings.general.aiEnabled })
    : [];

  return (
    <PanelCard
      title="Fonctionnalités activées par programme"
      description="Chaque module s'ouvre programme par programme, sans créer d'architecture parallèle."
    >
      <div className="space-y-1 sm:max-w-xs">
        <Label htmlFor="flags-program">Programme</Label>
        <Select
          value={programId}
          onValueChange={(v) => {
            setProgramId(v as ProgramId);
            setDraft(featureFlagsFor(settings, v as ProgramId));
          }}
        >
          <SelectTrigger id="flags-program" className="min-h-11">
            <SelectValue placeholder="Choisir un programme" />
          </SelectTrigger>
          <SelectContent>
            {programs.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!flags ? (
        <EmptyState>Aucun programme disponible.</EmptyState>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {FEATURE_FLAG_ORDER.map((key) => (
              <label
                key={key}
                className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
              >
                <span className="text-sm">{FEATURE_FLAG_LABELS_FR[key]}</span>
                <Switch
                  checked={flags[key]}
                  onCheckedChange={(v) => setDraft({ ...flags, [key]: v })}
                  aria-label={FEATURE_FLAG_LABELS_FR[key]}
                />
              </label>
            ))}
          </div>
          <Errors errors={errors} />
          <div className="flex justify-end">
            <Button
              className="min-h-11"
              disabled={errors.length > 0 || !programId}
              onClick={() => {
                setFeatureFlags(programId as ProgramId, flags);
                toast.success("Fonctionnalités du programme enregistrées (simulation locale).");
              }}
            >
              Enregistrer les fonctionnalités
            </Button>
          </div>
        </>
      )}
    </PanelCard>
  );
}

/* ------------------------------------------------------------------ */
/* Maintenance                                                         */
/* ------------------------------------------------------------------ */

function MaintenanceSection() {
  const stored = usePlatformSettings().maintenance;
  const [draft, setDraft] = useState<MaintenanceSettings>(stored);
  const errors = validateMaintenance(draft);

  return (
    <PanelCard
      title="Maintenance et bandeau d'information"
      description="Mode lecture seule et message affiché à tous les espaces, sans aucune donnée patient."
      action={
        <Badge variant={stored.readOnlyMode ? "destructive" : "outline"} className="font-normal">
          {stored.readOnlyMode ? "Lecture seule active" : "Plateforme ouverte"}
        </Badge>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
          <span className="text-sm">Mode lecture seule</span>
          <Switch
            checked={draft.readOnlyMode}
            onCheckedChange={(v) => setDraft({ ...draft, readOnlyMode: v })}
            aria-label="Mode lecture seule"
          />
        </label>
        <div className="space-y-1">
          <Label htmlFor="maintenance-window">Fenêtre planifiée</Label>
          <Input
            id="maintenance-window"
            value={draft.windowLabel}
            onChange={(e) => setDraft({ ...draft, windowLabel: e.target.value })}
            placeholder="12/09 22h–23h"
          />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="maintenance-banner">Message du bandeau</Label>
          <Textarea
            id="maintenance-banner"
            value={draft.bannerMessage}
            onChange={(e) => setDraft({ ...draft, bannerMessage: e.target.value })}
            placeholder="Maintenance programmée : dépôts de preuves indisponibles pendant une heure."
          />
        </div>
      </div>
      <Errors errors={errors} />
      <div className="flex justify-end">
        <Button
          className="min-h-11"
          disabled={errors.length > 0}
          onClick={() => {
            setMaintenanceSettings(draft);
            toast.success("Paramètres de maintenance enregistrés (simulation locale).");
          }}
        >
          Enregistrer la maintenance
        </Button>
      </div>
    </PanelCard>
  );
}

/* ------------------------------------------------------------------ */
/* Exports d'audit                                                     */
/* ------------------------------------------------------------------ */

function AuditExportSection({
  programs,
  people,
}: {
  readonly programs: readonly Program[];
  readonly people: readonly Person[];
}) {
  const traces = usePlatformSettings().auditExports;
  const [draft, setDraft] = useState<AuditExportDraft>({
    scope: "platform",
    fromDate: "",
    toDate: "",
    includeIdentities: false,
    reason: "",
  });
  const errors = validateAuditExport(draft);

  return (
    <PanelCard
      title="Exports du journal d'audit"
      description="Chaque export est motivé et tracé. Un export nominatif exige une finalité détaillée."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="export-scope">Périmètre</Label>
          <Select
            value={draft.scope}
            onValueChange={(v) => setDraft({ ...draft, scope: v as AuditExportScope })}
          >
            <SelectTrigger id="export-scope" className="min-h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(AUDIT_EXPORT_SCOPE_LABELS_FR) as AuditExportScope[]).map((scope) => (
                <SelectItem key={scope} value={scope}>
                  {AUDIT_EXPORT_SCOPE_LABELS_FR[scope]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {draft.scope === "program" ? (
          <div className="space-y-1">
            <Label htmlFor="export-program">Programme</Label>
            <Select
              value={draft.programId ?? ""}
              onValueChange={(v) => setDraft({ ...draft, programId: v as ProgramId })}
            >
              <SelectTrigger id="export-program" className="min-h-11">
                <SelectValue placeholder="Choisir un programme" />
              </SelectTrigger>
              <SelectContent>
                {programs.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        {draft.scope === "person" ? (
          <div className="space-y-1">
            <Label htmlFor="export-person">Personne</Label>
            <Select
              value={draft.personId ?? ""}
              onValueChange={(v) => setDraft({ ...draft, personId: v, includeIdentities: true })}
            >
              <SelectTrigger id="export-person" className="min-h-11">
                <SelectValue placeholder="Choisir une personne" />
              </SelectTrigger>
              <SelectContent>
                {people.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        <div className="space-y-1">
          <Label htmlFor="export-from">Du</Label>
          <Input
            id="export-from"
            type="date"
            value={draft.fromDate}
            onChange={(e) => setDraft({ ...draft, fromDate: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="export-to">Au</Label>
          <Input
            id="export-to"
            type="date"
            value={draft.toDate}
            onChange={(e) => setDraft({ ...draft, toDate: e.target.value })}
          />
        </div>
        <label className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
          <span className="text-sm">Inclure les identités</span>
          <Switch
            checked={draft.includeIdentities}
            onCheckedChange={(v) => setDraft({ ...draft, includeIdentities: v })}
            aria-label="Inclure les identités"
          />
        </label>
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="export-reason">Motif et finalité</Label>
          <Textarea
            id="export-reason"
            value={draft.reason}
            onChange={(e) => setDraft({ ...draft, reason: e.target.value })}
            placeholder="Contrôle de conformité demandé par la direction des études, remis au coordinateur du DIU."
          />
        </div>
      </div>
      <Errors errors={errors} />
      <div className="flex justify-end">
        <Button
          className="min-h-11"
          disabled={errors.length > 0}
          onClick={() => {
            addAuditExport(draft);
            setDraft({ ...draft, reason: "" });
            toast.success("Demande d'export tracée (aucun fichier produit).");
          }}
        >
          Demander l'export
        </Button>
      </div>

      {traces.length === 0 ? (
        <EmptyState>Aucun export demandé pendant cette session.</EmptyState>
      ) : (
        <ul className="text-muted-foreground space-y-1 text-xs">
          {traces.map((trace) => (
            <li key={trace.id}>
              {trace.label} — motif : {trace.reason}
            </li>
          ))}
        </ul>
      )}
    </PanelCard>
  );
}

/* ------------------------------------------------------------------ */
/* Intégrations                                                        */
/* ------------------------------------------------------------------ */

function IntegrationsSection() {
  return (
    <PanelCard
      title="Intégrations et passerelles"
      description={PLATFORM_GOVERNANCE_MOCK_FR}
    >
      <ul className="space-y-2 text-sm">
        {INTEGRATION_CATALOG.map((entry) => (
          <li key={entry.key} className="rounded-md border border-border px-3 py-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">{entry.label}</span>
              <Badge variant="outline" className="font-normal">
                {INTEGRATION_STATUS_LABELS_FR[entry.status]}
              </Badge>
            </div>
            <p className="text-muted-foreground text-xs">{entry.purpose}</p>
          </li>
        ))}
        <li className="text-muted-foreground text-xs">
          Aucune clé ni secret n'est saisi ni stocké dans l'interface : les identifiants resteront
          côté serveur.
        </li>
      </ul>
    </PanelCard>
  );
}

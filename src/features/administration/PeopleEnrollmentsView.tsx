/**
 * « Personnes et inscriptions » — point d'entrée UNIVERSEL (MAQUETTE LOCALE).
 *
 * Fonctionne pour tout type de programme (DFASM, DIU, DPC, autre) : aucune
 * logique conditionnelle sur `ProgramKind`. Toutes les décisions passent par
 * le domaine `src/domain/directory.ts` et l'état local `directoryStore`.
 *
 * SIMULATION : aucune écriture backend, aucun e-mail réel, aucune invitation
 * réelle, aucune suppression définitive. Le filtrage par périmètre est fait ici
 * côté client pour la démonstration ; dans le produit réel, il DEVRA être imposé
 * côté serveur (requêtes filtrées + RLS).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, FileSpreadsheet, Upload, UserPlus } from "lucide-react";

import { SectionHeading } from "@/components/section-heading";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  EmptyState,
  MockBadge,
  PanelCard,
  ScopeNotice,
  StatCard,
} from "@/features/professional/mock-ui";
import { RealRosterImportPanel } from "@/features/administration/RealRosterImportPanel";
import { PendingPeopleTable } from "@/features/administration/PendingPeopleTable";
import { RealIndividualPersonForm } from "@/features/administration/RealIndividualPersonForm";
import { useDataAccess, useSession } from "@/application/session";
import { setDirectoryState, useDirectoryState } from "@/application/directoryStore";
import { ROLE_LABELS_FR } from "@/domain/roles";
import type { Cohort, CohortId, RoleName } from "@/domain/types";
import {
  ROSTER_COLUMNS,
  ROSTER_COLUMN_LABELS_FR,
  ROSTER_TEMPLATE_CSV,
  buildRosterPreview,
  toCsv,
  type RosterColumn,
  type RosterColumnMapping,
} from "@/domain/cohortRoster";
import {
  ACCOUNT_STATUS_LABELS_FR,
  ENROLLMENT_STATUS_LABELS_FR,
  ORIGIN_LABELS_FR,
  addIndividual,
  applyRosterImport,
  archiveCohort,
  filterDirectoryRows,
  findPersonByEmail,
  fullNameOf,
  selectProgramDirectory,
  summariseDirectory,
  withdrawEnrollment,
  type AccountStatus,
  type DirectoryPerson,
  type EnrollmentStatus,
  type ExistingEmailStrategy,
  type ImportableRow,
} from "@/domain/directory";
import {
  PENDING_PERSON_STATUS_LABELS_FR,
  fullNameOfPendingPerson,
  type PendingPerson,
  type PendingPersonId,
  type UpdatePendingPersonInput,
} from "@/domain/peopleStaging";

const ROLE_OPTIONS: readonly RoleName[] = ["learner", "teacher", "administrator"];
const ENROLLMENT_OPTIONS: readonly EnrollmentStatus[] = [
  "active",
  "suspended",
  "completed",
  "withdrawn",
];
const ACCOUNT_OPTIONS: readonly AccountStatus[] = ["invited", "active", "suspended"];

function download(filename: string, content: string) {
  const blob = new Blob([`\uFEFF${content}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function nowIso(): string {
  return new Date().toISOString();
}

export function PeopleEnrollmentsView() {
  const { isSimulated } = useSession();
  return isSimulated ? <MockPeopleEnrollmentsView /> : <RealPeopleEnrollmentsView />;
}

/* ------------------------------------------------------------------ */
/* 1. Mode simulé (maquette locale)                                    */
/* ------------------------------------------------------------------ */

function MockPeopleEnrollmentsView() {
  const { activeProgram, isSimulated } = useSession();
  const state = useDirectoryState();

  const scope = useMemo(
    () => selectProgramDirectory(state, activeProgram.id),
    [state, activeProgram.id],
  );
  const summary = useMemo(() => summariseDirectory(scope), [scope]);
  const activeCohorts = scope.cohorts.filter((c) => c.lifecycle === "active");

  const [cohortId, setCohortId] = useState(activeCohorts[0]?.id ?? "");
  const effectiveCohortId = scope.cohorts.some((c) => c.id === cohortId)
    ? cohortId
    : (activeCohorts[0]?.id ?? "");

  return (
    <div className="space-y-8">
      <SectionHeading
        eyebrow={activeProgram.name}
        title="Personnes et inscriptions"
        level={1}
        action={
          <MockBadge label={isSimulated ? "Données simulées" : "Données réelles (Supabase)"} />
        }
        description="Ajout individuel, import groupé, inscriptions, retraits et archivage — pour tout type de programme."
      />

      <ScopeNotice>
        Périmètre : {activeProgram.name}. Aucune personne extérieure à ce programme n'est chargée.
        Maquette locale : aucune écriture serveur, aucun e-mail ni invitation réels, aucune
        suppression définitive. Le filtrage de périmètre devra être imposé côté serveur dans le
        produit réel.
      </ScopeNotice>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Programme actif" value={activeProgram.code} hint={activeProgram.name} />
        <StatCard
          label="Cohorte active"
          value={scope.cohorts.find((c) => c.id === effectiveCohortId)?.label ?? "—"}
          hint={`${activeCohorts.length} cohorte(s) active(s)`}
        />
        <StatCard
          label="Inscrits"
          value={summary.enrolledCount}
          hint={`${summary.activeCount} actives`}
        />
        <StatCard
          label="Comptes non activés"
          value={summary.withoutActivatedAccount}
          hint="invités ou suspendus"
        />
        <StatCard
          label="Doublons / erreurs"
          value={summary.duplicateEmailCount}
          hint={`${summary.withdrawnCount} retrait(s), ${summary.archivedCohortCount} cohorte(s) archivée(s)`}
        />
      </div>

      <IndividualForm programCohortId={effectiveCohortId} onCohortChange={setCohortId} />
      <BulkImportPanel programCohortId={effectiveCohortId} />
      <RosterListPanel />
      <LifecyclePanel />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Mode réel (Supabase) — sas de pré-inscription D94/D95               */
/* ------------------------------------------------------------------ */

function RealPeopleEnrollmentsView() {
  const { activeProgram } = useSession();
  const dataAccess = useDataAccess();

  const [people, setPeople] = useState<readonly PendingPerson[]>([]);
  const [cohorts, setCohorts] = useState<readonly Cohort[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<PendingPersonId | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [rows, cohortRows] = await Promise.all([
        dataAccess.peopleStaging.listPendingPeople(activeProgram.id),
        dataAccess.programs.listCohorts(activeProgram.id),
      ]);
      setPeople(rows);
      setCohorts(cohortRows);
    } catch (reason) {
      setLoadError(reason instanceof Error ? reason.message : "Chargement impossible.");
    } finally {
      setLoading(false);
    }
  }, [dataAccess, activeProgram.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function sendInvitation(personId: PendingPersonId) {
    setBusyId(personId);
    try {
      const outcomes = await dataAccess.peopleStaging.sendInvitations([personId]);
      const outcome = outcomes.find((o) => o.personId === personId);
      if (outcome && !outcome.ok) {
        setLoadError(outcome.error ?? "Échec de l'envoi de l'invitation.");
      }
      await refresh();
    } catch (reason) {
      setLoadError(reason instanceof Error ? reason.message : "Échec de l'envoi de l'invitation.");
    } finally {
      setBusyId(null);
    }
  }

  /**
   * Les deux écritures sont ici, pas dans le tableau : le tableau sert aussi
   * l'onglet « Classes d'apprenants », qui recharge autre chose. Ce qui se
   * partage est la projection et le rendu, pas le chargement.
   */
  async function updatePerson(input: UpdatePendingPersonInput) {
    setBusyId(input.personId);
    setLoadError(null);
    try {
      await dataAccess.peopleStaging.updatePendingPerson(input);
      await refresh();
    } catch (reason) {
      setLoadError(reason instanceof Error ? reason.message : "Modification impossible.");
    } finally {
      setBusyId(null);
    }
  }

  async function setCancelled(personId: PendingPersonId, cancelled: boolean) {
    setBusyId(personId);
    setLoadError(null);
    try {
      await dataAccess.peopleStaging.setPendingPersonCancelled(personId, cancelled);
      await refresh();
    } catch (reason) {
      setLoadError(reason instanceof Error ? reason.message : "Opération impossible.");
    } finally {
      setBusyId(null);
    }
  }

  const pendingCount = people.filter((p) => p.status === "pending").length;
  const invitedCount = people.filter((p) => p.status === "invited").length;
  const activatedCount = people.filter((p) => p.status === "activated").length;

  return (
    <div className="space-y-8">
      <SectionHeading
        eyebrow={activeProgram.name}
        title="Personnes et inscriptions"
        level={1}
        action={<MockBadge label="Données réelles (Supabase)" />}
        description="Ajout individuel et envoi d'invitation réelle — pour tout type de programme."
      />

      <ScopeNotice>
        Périmètre : {activeProgram.name}. Cette vue lit et écrit pour de vrai dans Supabase (table{" "}
        <code>people</code>, décision D94). <strong>La promotion choisie ici décide de tout</strong>{" "}
        : à la première connexion de la personne, elle seule déclenche la création de l'inscription
        et du rôle apprenant. Sans elle, le compte s'active mais l'étudiant ne voit aucun programme.
        L'import groupé lit désormais pour de vrai un CSV ou un classeur Excel. La correction d'une
        ligne et son retrait écrivent eux aussi pour de vrai — retirer n'efface pas, la ligne passe
        en « annulée » et se remet.
      </ScopeNotice>

      {loadError ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {loadError}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Programme actif" value={activeProgram.code} hint={activeProgram.name} />
        <StatCard label="En attente d'envoi" value={pendingCount} />
        <StatCard label="Invitées" value={invitedCount} hint="en attente de première connexion" />
        <StatCard label="Activées" value={activatedCount} hint="première connexion effectuée" />
      </div>

      <RealRosterImportPanel
        programId={activeProgram.id}
        cohorts={cohorts}
        existingEmails={people.map((p) => p.loginEmail)}
        onImported={refresh}
      />

      <RealIndividualPersonForm
        programId={activeProgram.id}
        cohorts={cohorts}
        existingPeople={people}
        onCreated={refresh}
      />

      <PanelCard
        title="Personnes du sas de pré-inscription"
        description="Toute personne créée ici pour ce programme, avec le statut réel de son invitation."
        action={<MockBadge label="Données réelles (Supabase)" />}
      >
        {loading ? (
          <p className="text-xs text-muted-foreground">Chargement…</p>
        ) : people.length === 0 ? (
          <EmptyState>Aucune personne créée pour ce programme pour l'instant.</EmptyState>
        ) : (
          <PendingPeopleTable
            people={people}
            cohorts={cohorts}
            busyId={busyId}
            onUpdate={updatePerson}
            onSetCancelled={setCancelled}
            onSendInvitation={sendInvitation}
          />
        )}
      </PanelCard>
    </div>
  );
}

const NO_COHORT = "__none__";

/* ------------------------------------------------------------------ */
/* 3. Ajout individuel (mode simulé)                                   */
/* ------------------------------------------------------------------ */

function IndividualForm({
  programCohortId,
  onCohortChange,
}: {
  programCohortId: string;
  onCohortChange: (id: string) => void;
}) {
  const { activeProgram, isSimulated } = useSession();
  const state = useDirectoryState();
  const scope = selectProgramDirectory(state, activeProgram.id);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [institutionalId, setInstitutionalId] = useState("");
  const [role, setRole] = useState<RoleName>("learner");
  const [status, setStatus] = useState<EnrollmentStatus>("active");
  const [error, setError] = useState<string | null>(null);
  const [existing, setExisting] = useState<DirectoryPerson | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const knownPerson = email.trim() ? findPersonByEmail(state, email) : undefined;

  function submit(attachExistingPerson: boolean) {
    setError(null);
    setSuccess(null);
    const result = addIndividual(state, {
      firstName,
      lastName,
      email,
      institutionalId: institutionalId || undefined,
      programId: activeProgram.id,
      cohortId: programCohortId,
      role,
      enrollmentStatus: status,
      attachExistingPerson,
      now: nowIso(),
    });
    if (!result.ok) {
      setError(result.message);
      setExisting(result.existingPerson ?? null);
      return;
    }
    setDirectoryState(result.state);
    setExisting(null);
    setSuccess(
      result.attachedExistingPerson
        ? `Personne existante rattachée et inscrite (simulation locale) : ${firstName || ""} ${lastName}.`
        : `Personne créée localement, compte au statut « invité » (aucun e-mail envoyé) : ${firstName} ${lastName}.`,
    );
    setFirstName("");
    setLastName("");
    setEmail("");
    setInstitutionalId("");
  }

  return (
    <PanelCard
      title="Ajouter une personne"
      description="Recherche globale par e-mail normalisé avant toute création : une personne connue est rattachée, jamais dupliquée."
      action={<MockBadge label={isSimulated ? "Données simulées" : "Données réelles (Supabase)"} />}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="dir-firstname">Prénom</Label>
          <Input
            id="dir-firstname"
            value={firstName}
            className="min-h-11"
            onChange={(e) => setFirstName(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="dir-lastname">Nom</Label>
          <Input
            id="dir-lastname"
            value={lastName}
            className="min-h-11"
            onChange={(e) => setLastName(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="dir-email">E-mail de connexion</Label>
          <Input
            id="dir-email"
            type="email"
            value={email}
            className="min-h-11"
            onChange={(e) => setEmail(e.target.value)}
          />
          {knownPerson ? (
            <p className="text-xs text-muted-foreground">
              Compte déjà connu sur la plateforme : {fullNameOf(knownPerson)}.
            </p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="dir-institutional">Identifiant institutionnel (facultatif)</Label>
          <Input
            id="dir-institutional"
            value={institutionalId}
            className="min-h-11"
            onChange={(e) => setInstitutionalId(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="dir-cohort">Cohorte</Label>
          <Select value={programCohortId} onValueChange={onCohortChange}>
            <SelectTrigger id="dir-cohort" className="min-h-11">
              <SelectValue placeholder="Choisir une cohorte" />
            </SelectTrigger>
            <SelectContent>
              {scope.cohorts.map((c) => (
                <SelectItem key={c.id} value={c.id} disabled={c.lifecycle === "archived"}>
                  {c.label} · {c.academicYear}
                  {c.lifecycle === "archived" ? " (archivée)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="dir-role">Rôle dans ce programme</Label>
          <Select value={role} onValueChange={(v) => setRole(v as RoleName)}>
            <SelectTrigger id="dir-role" className="min-h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLE_OPTIONS.map((r) => (
                <SelectItem key={r} value={r}>
                  {ROLE_LABELS_FR[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="dir-status">Statut de l'inscription</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as EnrollmentStatus)}>
            <SelectTrigger id="dir-status" className="min-h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ENROLLMENT_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>
                  {ENROLLMENT_STATUS_LABELS_FR[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {error ? (
        <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          <p>{error}</p>
          {existing ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="min-h-11"
              onClick={() => submit(true)}
            >
              Rattacher {fullNameOf(existing)} plutôt que dupliquer
            </Button>
          ) : null}
        </div>
      ) : null}

      {success ? (
        <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">{success}</p>
      ) : null}

      <Button type="button" size="sm" className="min-h-11" onClick={() => submit(false)}>
        <UserPlus className="mr-2 size-4" aria-hidden /> Ajouter à ce programme (local)
      </Button>
    </PanelCard>
  );
}

/* ------------------------------------------------------------------ */
/* 4. Import groupé                                                    */
/* ------------------------------------------------------------------ */

function BulkImportPanel({ programCohortId }: { programCohortId: string }) {
  const { activeProgram, isSimulated } = useSession();
  const state = useDirectoryState();
  const fileInput = useRef<HTMLInputElement>(null);

  const [rawText, setRawText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [unsupported, setUnsupported] = useState<string | null>(null);
  const [manualMapping, setManualMapping] = useState<RosterColumnMapping>({});
  const [showMapping, setShowMapping] = useState(false);
  const [strategy, setStrategy] = useState<ExistingEmailStrategy>("attach");
  const [role, setRole] = useState<RoleName>("learner");
  const [report, setReport] = useState<string | null>(null);

  /** Détection GLOBALE : tout e-mail déjà connu de la plateforme est signalé. */
  const knownEmails = useMemo(() => state.accounts.map((a) => a.loginEmail), [state.accounts]);

  const parsedHeaders = useMemo(() => {
    if (!rawText.trim()) return [] as readonly string[];
    const firstLine = rawText.split(/\r\n|\r|\n/)[0] ?? "";
    const delimiter = [";", "\t", ",", "|"]
      .map((d) => ({ d, n: firstLine.split(d).length }))
      .sort((a, b) => b.n - a.n)[0]?.d;
    return firstLine.split(delimiter ?? ";").map((h) => h.trim());
  }, [rawText]);

  const preview = useMemo(
    () =>
      rawText.trim()
        ? buildRosterPreview({ text: rawText, mapping: manualMapping, existingEmails: knownEmails })
        : null,
    [rawText, manualMapping, knownEmails],
  );

  const mappingUncertain = (preview?.missingRequiredColumns.length ?? 0) > 0;

  const importableRows: readonly ImportableRow[] = useMemo(() => {
    if (!preview) return [];
    return preview.candidates
      .filter(
        (c) => c.status === "ready" || (c.status === "already_enrolled" && strategy === "attach"),
      )
      .map((c) => ({
        line: c.line,
        firstName: c.firstName,
        lastName: c.lastName,
        email: c.email,
        studentNumber: c.studentNumber,
      }));
  }, [preview, strategy]);

  async function onPickFile(file: File | undefined) {
    if (!file) return;
    setReport(null);
    setFileName(file.name);
    setManualMapping({});
    if (/\.(xlsx|xls)$/i.test(file.name)) {
      setRawText("");
      setUnsupported(
        "XLSX non pris en charge dans cette maquette : aucune dépendance de lecture sûre côté client n'est installée. Exportez la feuille en CSV (séparateur point-virgule) ou collez le tableau ci-dessous. Aucun import n'a été simulé.",
      );
      return;
    }
    setUnsupported(null);
    setRawText(await file.text());
  }

  function confirmImport() {
    const result = applyRosterImport(state, {
      programId: activeProgram.id,
      cohortId: programCohortId,
      role,
      rows: importableRows,
      existingEmailStrategy: strategy,
      now: nowIso(),
    });
    setDirectoryState(result.state);
    setReport(
      `Import local appliqué : ${result.report.created} création(s), ${result.report.attached} rattachement(s), ${result.report.skipped} ignorée(s), ${result.report.rejected} refusée(s). Aucune donnée envoyée.`,
    );
    setRawText("");
    setFileName(null);
  }

  return (
    <PanelCard
      title="Import groupé (CSV, TSV)"
      description="Prévisualisation, détection automatique des colonnes, mapping manuel si nécessaire, erreurs ligne par ligne, puis confirmation avant création locale."
      action={<MockBadge label={isSimulated ? "Données simulées" : "Données réelles (Supabase)"} />}
    >
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileInput}
          type="file"
          accept=".csv,.tsv,.txt,.xlsx,.xls"
          className="hidden"
          onChange={(e) => void onPickFile(e.target.files?.[0])}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="min-h-11"
          onClick={() => fileInput.current?.click()}
        >
          <Upload className="mr-2 size-4" aria-hidden /> Choisir un fichier
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="min-h-11"
          onClick={() => download("modele-promotion.csv", ROSTER_TEMPLATE_CSV)}
        >
          <FileSpreadsheet className="mr-2 size-4" aria-hidden /> Télécharger le modèle
        </Button>
        {fileName ? <span className="text-xs text-muted-foreground">{fileName}</span> : null}
      </div>

      {unsupported ? (
        <p className="rounded-md border border-dashed border-destructive/40 px-3 py-2 text-xs text-destructive">
          {unsupported}
        </p>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="dir-paste">Ou coller la liste (CSV / TSV)</Label>
        <Textarea
          id="dir-paste"
          rows={5}
          value={rawText}
          placeholder={ROSTER_TEMPLATE_CSV}
          onChange={(e) => {
            setRawText(e.target.value);
            setReport(null);
          }}
        />
      </div>

      {preview ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="À créer" value={preview.readyCount} />
            <StatCard label="Doublons fichier" value={preview.duplicateCount} />
            <StatCard label="E-mails déjà connus" value={preview.alreadyEnrolledCount} />
            <StatCard label="Erreurs" value={preview.invalidCount} />
          </div>

          {mappingUncertain ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              Détection incertaine : colonnes obligatoires non reconnues (
              {preview.missingRequiredColumns.map((c) => ROSTER_COLUMN_LABELS_FR[c]).join(", ")}).
              Renseignez le mapping manuel ci-dessous.
            </p>
          ) : null}

          <div className="space-y-3">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="min-h-11"
              onClick={() => setShowMapping((v) => !v)}
            >
              {showMapping ? "Masquer le mapping manuel" : "Ajuster le mapping des colonnes"}
            </Button>
            {showMapping || mappingUncertain ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {ROSTER_COLUMNS.map((column) => (
                  <div key={column} className="space-y-2">
                    <Label htmlFor={`map-${column}`}>{ROSTER_COLUMN_LABELS_FR[column]}</Label>
                    <Select
                      value={String(preview.mapping[column] ?? "none")}
                      onValueChange={(v) =>
                        setManualMapping((prev) => {
                          const next: Record<string, number> = { ...prev } as Record<
                            string,
                            number
                          >;
                          if (v === "none") delete next[column];
                          else next[column] = Number(v);
                          return next as RosterColumnMapping;
                        })
                      }
                    >
                      <SelectTrigger id={`map-${column}`} className="min-h-11">
                        <SelectValue placeholder="Non mappée" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Non mappée</SelectItem>
                        {parsedHeaders.map((h, index) => (
                          <SelectItem key={`${column}-${index}`} value={String(index)}>
                            {h || `Colonne ${index + 1}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="dir-strategy">E-mails déjà connus</Label>
              <Select
                value={strategy}
                onValueChange={(v) => setStrategy(v as ExistingEmailStrategy)}
              >
                <SelectTrigger id="dir-strategy" className="min-h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="attach">Rattacher la personne existante</SelectItem>
                  <SelectItem value="skip">Ignorer la ligne</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="dir-import-role">Rôle attribué</Label>
              <Select value={role} onValueChange={(v) => setRole(v as RoleName)}>
                <SelectTrigger id="dir-import-role" className="min-h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABELS_FR[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ligne</TableHead>
                  <TableHead>Nom</TableHead>
                  <TableHead>Prénom</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>État</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.candidates.map((c) => (
                  <TableRow key={c.line}>
                    <TableCell className="text-muted-foreground">{c.line}</TableCell>
                    <TableCell className="font-medium">{c.lastName || "—"}</TableCell>
                    <TableCell>{c.firstName || "—"}</TableCell>
                    <TableCell className="break-all">{c.email || "—"}</TableCell>
                    <TableCell>
                      <Badge
                        variant={c.status === "invalid" ? "destructive" : "outline"}
                        className="font-normal"
                      >
                        {c.status === "ready"
                          ? "à créer"
                          : c.status === "duplicate_in_file"
                            ? "doublon fichier"
                            : c.status === "already_enrolled"
                              ? strategy === "attach"
                                ? "rattachement"
                                : "ignorée"
                              : "erreur"}
                      </Badge>
                      {c.issues.length > 0 ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {c.issues.map((i) => i.message).join(" ")}
                        </p>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                size="sm"
                className="min-h-11"
                disabled={importableRows.length === 0 || programCohortId === ""}
              >
                Importer {importableRows.length} ligne(s) dans la cohorte
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Confirmer l'import local</AlertDialogTitle>
                <AlertDialogDescription>
                  {importableRows.length} ligne(s) seront ajoutées à l'état local de démonstration.
                  Aucune donnée n'est envoyée, aucun e-mail n'est expédié : les comptes créés
                  restent au statut « invité ».
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="min-h-11">Annuler</AlertDialogCancel>
                <AlertDialogAction className="min-h-11" onClick={confirmImport}>
                  Confirmer
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      ) : (
        <EmptyState>
          Déposez un fichier CSV/TSV ou collez une liste pour lancer le contrôle.
        </EmptyState>
      )}

      {report ? (
        <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">{report}</p>
      ) : null}
    </PanelCard>
  );
}

/* ------------------------------------------------------------------ */
/* 5. Liste des inscrits                                               */
/* ------------------------------------------------------------------ */

function RosterListPanel() {
  const { activeProgram, isSimulated } = useSession();
  const state = useDirectoryState();
  const scope = selectProgramDirectory(state, activeProgram.id);

  const [search, setSearch] = useState("");
  const [cohortFilter, setCohortFilter] = useState<string>("all");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [accountFilter, setAccountFilter] = useState<string>("all");

  const rows = filterDirectoryRows(scope.rows, {
    search,
    cohortId: cohortFilter as never,
    role: roleFilter as never,
    enrollmentStatus: statusFilter as never,
    accountStatus: accountFilter as never,
  });

  function exportCsv() {
    download(
      `inscrits-${activeProgram.code}.csv`,
      toCsv(
        [
          "Nom",
          "E-mail",
          "Cohorte",
          "Programme",
          "Rôle",
          "Statut du compte",
          "Statut d'inscription",
          "Origine",
          "Date d'inscription (simulée)",
        ],
        rows.map((r) => [
          r.fullName,
          r.email,
          r.cohortLabel,
          activeProgram.name,
          r.roles.map((role) => ROLE_LABELS_FR[role]).join(" / "),
          ACCOUNT_STATUS_LABELS_FR[r.accountStatus],
          ENROLLMENT_STATUS_LABELS_FR[r.enrollment.status],
          ORIGIN_LABELS_FR[r.enrollment.origin],
          new Date(r.enrollment.enrolledAt).toLocaleDateString("fr-FR"),
        ]),
      ),
    );
  }

  return (
    <PanelCard
      title="Liste des inscrits"
      description="Recherche, filtres, export CSV. L'accès au détail de progression sera raccordé dans un lot ultérieur."
      action={<MockBadge label={isSimulated ? "Données simulées" : "Données réelles (Supabase)"} />}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="space-y-2">
          <Label htmlFor="dir-search">Recherche</Label>
          <Input
            id="dir-search"
            value={search}
            className="min-h-11"
            placeholder="Nom ou e-mail"
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <FilterSelect
          id="dir-filter-cohort"
          label="Cohorte"
          value={cohortFilter}
          onChange={setCohortFilter}
          options={[
            { value: "all", label: "Toutes" },
            ...scope.cohorts.map((c) => ({ value: c.id, label: c.label })),
          ]}
        />
        <FilterSelect
          id="dir-filter-role"
          label="Rôle"
          value={roleFilter}
          onChange={setRoleFilter}
          options={[
            { value: "all", label: "Tous" },
            ...ROLE_OPTIONS.map((r) => ({ value: r, label: ROLE_LABELS_FR[r] })),
          ]}
        />
        <FilterSelect
          id="dir-filter-status"
          label="Inscription"
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: "all", label: "Toutes" },
            ...ENROLLMENT_OPTIONS.map((s) => ({
              value: s,
              label: ENROLLMENT_STATUS_LABELS_FR[s],
            })),
          ]}
        />
        <FilterSelect
          id="dir-filter-account"
          label="Compte"
          value={accountFilter}
          onChange={setAccountFilter}
          options={[
            { value: "all", label: "Tous" },
            ...ACCOUNT_OPTIONS.map((s) => ({ value: s, label: ACCOUNT_STATUS_LABELS_FR[s] })),
          ]}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="min-h-11"
          disabled={rows.length === 0}
          onClick={exportCsv}
        >
          <Download className="mr-2 size-4" aria-hidden /> Exporter en CSV
        </Button>
        <span className="text-xs text-muted-foreground">{rows.length} inscrit(s) affiché(s).</span>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nom</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead>Cohorte</TableHead>
              <TableHead>Rôle</TableHead>
              <TableHead>Compte</TableHead>
              <TableHead>Inscription</TableHead>
              <TableHead>Origine</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.enrollment.id}>
                <TableCell className="font-medium">{r.fullName}</TableCell>
                <TableCell className="break-all">{r.email}</TableCell>
                <TableCell>{r.cohortLabel}</TableCell>
                <TableCell>
                  {r.roles.length > 0
                    ? r.roles.map((role) => ROLE_LABELS_FR[role]).join(" / ")
                    : "—"}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="font-normal">
                    {ACCOUNT_STATUS_LABELS_FR[r.accountStatus]}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge
                    variant={r.enrollment.status === "withdrawn" ? "destructive" : "outline"}
                    className="font-normal"
                  >
                    {ENROLLMENT_STATUS_LABELS_FR[r.enrollment.status]}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {ORIGIN_LABELS_FR[r.enrollment.origin]}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(r.enrollment.enrolledAt).toLocaleDateString("fr-FR")}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button size="sm" variant="ghost" className="min-h-11" disabled>
                      Progression (à raccorder)
                    </Button>
                    {r.enrollment.status !== "withdrawn" ? (
                      <WithdrawButton enrollmentId={r.enrollment.id} name={r.fullName} />
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {rows.length === 0 ? <EmptyState>Aucun inscrit ne correspond aux filtres.</EmptyState> : null}
    </PanelCard>
  );
}

function FilterSelect({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly { value: string; label: string }[];
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="min-h-11">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 6. Retrait et archivage                                             */
/* ------------------------------------------------------------------ */

function WithdrawButton({ enrollmentId, name }: { enrollmentId: string; name: string }) {
  const state = useDirectoryState();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="outline" className="min-h-11">
          Retirer
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Retirer l'inscription de {name} ?</AlertDialogTitle>
          <AlertDialogDescription>
            L'inscription passera au statut « retirée ». La personne, son compte, ses rôles et son
            historique sont CONSERVÉS : aucune suppression n'est effectuée.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="min-h-11">Annuler</AlertDialogCancel>
          <AlertDialogAction
            className="min-h-11"
            onClick={() => {
              const result = withdrawEnrollment(state, enrollmentId, nowIso());
              if (result.ok) setDirectoryState(result.state);
            }}
          >
            Confirmer le retrait
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function LifecyclePanel() {
  const { activeProgram, isSimulated } = useSession();
  const state = useDirectoryState();
  const scope = selectProgramDirectory(state, activeProgram.id);

  return (
    <PanelCard
      title="Cycle de vie des cohortes"
      description="Une cohorte archivée reste consultable et n'accepte plus de nouvelle inscription. Aucune suppression n'est possible."
      action={<MockBadge label={isSimulated ? "Données simulées" : "Données réelles (Supabase)"} />}
    >
      <ul className="space-y-3">
        {scope.cohorts.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-3">
            <span className="font-medium">{c.label}</span>
            <span className="text-sm text-muted-foreground">{c.academicYear}</span>
            <Badge variant="outline" className="font-normal">
              {c.lifecycle === "archived" ? "archivée" : "active"}
            </Badge>
            {c.lifecycle === "active" ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="outline" className="min-h-11">
                    Archiver
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Archiver « {c.label} » ?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Les inscriptions existantes sont conservées ; aucune nouvelle inscription ne
                      pourra être ajoutée à cette cohorte. Action simulée localement.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="min-h-11">Annuler</AlertDialogCancel>
                    <AlertDialogAction
                      className="min-h-11"
                      onClick={() => {
                        const result = archiveCohort(state, c.id);
                        if (result.ok) setDirectoryState(result.state);
                      }}
                    >
                      Confirmer l'archivage
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : null}
          </li>
        ))}
      </ul>
      {scope.cohorts.length === 0 ? (
        <EmptyState>Aucune cohorte dans ce programme.</EmptyState>
      ) : null}
    </PanelCard>
  );
}

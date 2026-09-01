/**
 * Import réel d'une liste d'étudiants — écrit pour de vrai dans Supabase.
 *
 * Trois choses le distinguent du panneau simulé voisin :
 *   * il lit le fichier tel qu'il arrive (CSV quel que soit l'encodage, .xlsx
 *     sans bibliothèque tierce) via `readRosterFile` ;
 *   * il crée vraiment les lignes du sas de pré-inscription, rattachées à une
 *     classe — sans classe, l'activation d'un compte ne crée aucune inscription ;
 *   * il ne cache rien de ce qu'il a deviné : séparateur, ligne d'en-tête,
 *     colonnes reconnues, adresses composées. Tout est visible et corrigeable
 *     AVANT que la moindre ligne ne parte en base.
 */
import { useMemo, useRef, useState } from "react";
import { FileSpreadsheet, Upload } from "lucide-react";

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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { MockBadge, PanelCard, StatCard } from "@/features/professional/mock-ui";
import { useDataAccess } from "@/application/session";
import {
  EMAIL_PATTERN_PLACEHOLDER,
  ROSTER_COLUMNS,
  ROSTER_COLUMN_LABELS_FR,
  ROSTER_TEMPLATE_CSV,
  buildRosterPreview,
  type RosterColumnMapping,
} from "@/domain/cohortRoster";
import { readRosterFile, type RosterFileRead } from "@/infrastructure/text/rosterFile";
import type { Cohort, CohortId } from "@/domain/types";

const AUTO = "__auto__";

function download(filename: string, content: string) {
  const blob = new Blob([`\uFEFF${content}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export interface ImportReport {
  readonly created: number;
  readonly failed: readonly { name: string; email: string; error: string }[];
}

export function RealRosterImportPanel({
  programId,
  cohorts,
  existingEmails,
  onImported,
  defaultCohortId,
  lockCohort = false,
  title = "Importer une liste d'étudiants",
  idPrefix = "real-roster",
}: {
  programId: string;
  cohorts: readonly Cohort[];
  existingEmails: readonly string[];
  onImported: () => void | Promise<void>;
  /**
   * Classe de destination pré-choisie. Le panneau est monté à deux endroits :
   * dans le bloc général, où l'on choisit la classe dans la liste, et sous une
   * classe précise, où le choix est déjà fait — c'est la même opération, pas un
   * second import.
   */
  defaultCohortId?: CohortId;
  /** Monté sous une classe : la destination n'est plus un choix, elle s'affiche. */
  lockCohort?: boolean;
  title?: string;
  /**
   * Préfixe des identifiants de champs. Indispensable depuis que le panneau est
   * monté DEUX FOIS sur le même écran (sous une classe et dans le bloc général) :
   * deux `id` identiques dans une page font pointer les deux `label` vers le
   * même champ, et cliquer sur l'un déplace le curseur dans l'autre.
   */
  idPrefix?: string;
}) {
  const dataAccess = useDataAccess();

  const [rawText, setRawText] = useState("");
  const [fileRead, setFileRead] = useState<RosterFileRead | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [manualMapping, setManualMapping] = useState<RosterColumnMapping>({});
  const [emailPattern, setEmailPattern] = useState("");
  const [cohortId, setCohortId] = useState<string>(defaultCohortId ?? "");
  const [derivedAcknowledged, setDerivedAcknowledged] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [report, setReport] = useState<ImportReport | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const preview = useMemo(
    () =>
      rawText.trim() === ""
        ? null
        : buildRosterPreview({
            text: rawText,
            mapping: manualMapping,
            existingEmails,
            ...(emailPattern.trim() ? { emailPattern } : {}),
          }),
    [rawText, manualMapping, existingEmails, emailPattern],
  );

  const headers = useMemo(
    () => (rawText.trim() === "" ? [] : (rawText.split(/\r?\n/)[0]?.split(/[;\t,|]/) ?? [])),
    [rawText],
  );

  function reset(text: string, read: RosterFileRead | null, name: string | null) {
    setRawText(text);
    setFileRead(read);
    setFileName(name);
    setManualMapping({});
    setDerivedAcknowledged(false);
    setReport(null);
  }

  async function onPickFile(file: File | undefined) {
    if (!file) return;
    setReadError(null);
    try {
      const read = await readRosterFile(file);
      if (read.text.trim() === "") {
        setReadError("Fichier lu, mais vide : aucune ligne exploitable.");
        return;
      }
      reset(read.text, read, file.name);
    } catch (reason) {
      setReadError(reason instanceof Error ? reason.message : "Ce fichier n'a pas pu être lu.");
    }
  }

  const needsAcknowledgement = (preview?.derivedEmailCount ?? 0) > 0 && !derivedAcknowledged;
  const canImport =
    preview !== null && preview.canImport && cohortId !== "" && !needsAcknowledgement && !importing;

  async function runImport() {
    if (!preview) return;
    const rows = preview.candidates.filter((c) => c.status === "ready");
    setImporting(true);
    setProgress(0);
    const failed: { name: string; email: string; error: string }[] = [];
    let created = 0;

    // Séquentiel, volontairement : vingt lignes ne justifient pas un envoi
    // parallèle, et une erreur reste attribuable à sa ligne.
    for (const row of rows) {
      try {
        await dataAccess.peopleStaging.createPendingPerson({
          programId,
          firstName: row.firstName,
          lastName: row.lastName,
          loginEmail: row.email,
          ...(row.studentNumber ? { institutionalId: row.studentNumber } : {}),
          intendedCohortId: cohortId as CohortId,
        });
        created += 1;
      } catch (reason) {
        failed.push({
          name: `${row.firstName} ${row.lastName}`.trim(),
          email: row.email,
          error: reason instanceof Error ? reason.message : "Création refusée.",
        });
      }
      setProgress((p) => p + 1);
    }

    setImporting(false);
    setReport({ created, failed });
    if (created > 0) {
      reset("", null, null);
      await onImported();
    }
  }

  const cohortLabel = cohorts.find((c) => c.id === cohortId)?.label;

  return (
    <PanelCard
      title={title}
      description="Fichier CSV ou Excel, ou liste collée. Ce qui est deviné reste affiché et corrigeable ; rien n'est écrit avant votre confirmation."
      action={<MockBadge label="Données réelles (Supabase)" />}
    >
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileInput}
          type="file"
          accept=".csv,.tsv,.txt,.xlsx,.xlsm"
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

      {readError ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {readError}
        </p>
      ) : null}

      {fileRead ? (
        <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">
          Lu comme {fileRead.source === "xlsx" ? "classeur Excel" : "fichier texte"}
          {fileRead.encoding ? `, encodage ${fileRead.encoding}` : ""}
          {preview
            ? `, séparateur « ${preview.delimiter === "\t" ? "tabulation" : preview.delimiter} », en-tête ligne ${preview.headerLine}`
            : ""}
          .
        </p>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-paste`}>Ou coller la liste</Label>
        <Textarea
          id={`${idPrefix}-paste`}
          rows={5}
          value={rawText}
          placeholder={ROSTER_TEMPLATE_CSV}
          onChange={(e) => reset(e.target.value, null, null)}
        />
      </div>

      {preview ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="À créer" value={preview.readyCount} />
            <StatCard label="Doublons du fichier" value={preview.duplicateCount} />
            <StatCard label="Déjà connus" value={preview.alreadyEnrolledCount} />
            <StatCard label="En erreur" value={preview.invalidCount} />
          </div>

          {preview.missingRequiredColumns.length > 0 ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              Colonnes obligatoires non reconnues :{" "}
              {preview.missingRequiredColumns.map((c) => ROSTER_COLUMN_LABELS_FR[c]).join(", ")}.
              Corrigez la correspondance ci-dessous, ou donnez un motif d'adresse.
            </p>
          ) : null}

          {preview.nameOrderAssumed ? (
            <p className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs">
              Nom et prénom lus dans une seule colonne, sans majuscules ni virgule pour trancher :
              l'ordre « NOM Prénom » a été supposé. Vérifiez les deux premières colonnes du tableau.
            </p>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-pattern`}>
              Motif d'adresse e-mail (si le fichier n'en contient pas)
            </Label>
            <Input
              id={`${idPrefix}-pattern`}
              value={emailPattern}
              className="min-h-11"
              placeholder={EMAIL_PATTERN_PLACEHOLDER}
              onChange={(e) => {
                setEmailPattern(e.target.value);
                setDerivedAcknowledged(false);
              }}
            />
            <p className="text-xs text-muted-foreground">
              Jetons : <code>{"{prenom}"}</code>, <code>{"{nom}"}</code>, <code>{"{p}"}</code>{" "}
              (initiale du prénom), <code>{"{numero}"}</code>. Une adresse du fichier n'est jamais
              remplacée.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {ROSTER_COLUMNS.map((column) => (
              <div key={column} className="space-y-2">
                <Label htmlFor={`real-map-${column}`}>{ROSTER_COLUMN_LABELS_FR[column]}</Label>
                <Select
                  value={manualMapping[column] === undefined ? AUTO : String(manualMapping[column])}
                  onValueChange={(value) =>
                    setManualMapping((prev) => {
                      const next = { ...prev };
                      if (value === AUTO) delete next[column];
                      else next[column] = Number(value);
                      return next;
                    })
                  }
                >
                  <SelectTrigger id={`real-map-${column}`} className="min-h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={AUTO}>
                      {preview.mapping[column] === undefined
                        ? "— non reconnue —"
                        : `Détectée : ${headers[preview.mapping[column]!] ?? "?"}`}
                    </SelectItem>
                    {headers.map((header, index) => (
                      <SelectItem key={`${header}-${index}`} value={String(index)}>
                        {header || `Colonne ${index + 1}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ligne</TableHead>
                  <TableHead>Nom</TableHead>
                  <TableHead>Prénom</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Groupe</TableHead>
                  <TableHead>État</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.candidates.slice(0, 50).map((row) => (
                  <TableRow key={row.line}>
                    <TableCell className="text-muted-foreground">{row.line}</TableCell>
                    <TableCell className="font-medium">{row.lastName}</TableCell>
                    <TableCell>{row.firstName}</TableCell>
                    <TableCell className="break-all">
                      {row.email}
                      {row.emailDerived ? (
                        <Badge variant="outline" className="ml-2 font-normal">
                          composée
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{row.group ?? "—"}</TableCell>
                    <TableCell>
                      <Badge
                        variant={row.status === "invalid" ? "destructive" : "outline"}
                        className="font-normal"
                      >
                        {row.status === "ready"
                          ? "à créer"
                          : row.status === "duplicate_in_file"
                            ? "doublon"
                            : row.status === "already_enrolled"
                              ? "déjà connu"
                              : "erreur"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {preview.candidates.length > 50 ? (
              <p className="px-1 py-2 text-xs text-muted-foreground">
                50 premières lignes affichées sur {preview.candidates.length}. L'import les traite
                toutes.
              </p>
            ) : null}
          </div>

          {preview.issues.filter((i) => i.level === "error").length > 0 ? (
            <div className="space-y-1 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs">
              {preview.issues
                .filter((i) => i.level === "error")
                .slice(0, 10)
                .map((issue, index) => (
                  <p key={index}>
                    Ligne {issue.line} : {issue.message}
                  </p>
                ))}
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-cohort`}>Classe de destination</Label>
            {lockCohort ? (
              <p className="border-border rounded-md border px-3 py-2 text-sm">
                {cohorts.find((c) => c.id === cohortId)?.label ?? "—"}
              </p>
            ) : (
              <Select value={cohortId} onValueChange={setCohortId}>
                <SelectTrigger id={`${idPrefix}-cohort`} className="min-h-11">
                  <SelectValue placeholder="Choisir la classe…" />
                </SelectTrigger>
                <SelectContent>
                  {cohorts.map((cohort) => (
                    <SelectItem key={cohort.id} value={cohort.id}>
                      {cohort.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <p className="text-xs text-muted-foreground">
              Sans classe, l'activation d'un compte ne crée ni inscription ni rôle apprenant :
              l'étudiant ne verrait aucun programme.
            </p>
          </div>

          {preview.derivedEmailCount > 0 ? (
            <label className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs">
              <Checkbox
                checked={derivedAcknowledged}
                onCheckedChange={(v) => setDerivedAcknowledged(v === true)}
                className="mt-0.5"
              />
              <span>
                <strong>{preview.derivedEmailCount} adresse(s) composée(s)</strong> par le motif, et
                absente(s) du fichier. Une adresse inventée reçoit une invitation qui part dans le
                vide sans que personne ne le sache. J'ai vérifié les adresses marquées « composée »
                dans le tableau.
              </span>
            </label>
          ) : null}

          <Button
            type="button"
            size="sm"
            className="min-h-11"
            disabled={!canImport}
            onClick={() => void runImport()}
          >
            {importing
              ? `Création… ${progress}/${preview.readyCount}`
              : `Créer ${preview.readyCount} personne(s)${cohortLabel ? ` dans « ${cohortLabel} »` : ""}`}
          </Button>
        </div>
      ) : null}

      {report ? (
        <div className="space-y-1 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">
          <p>
            <strong>{report.created}</strong> personne(s) créée(s) dans le sas. Les invitations ne
            partent pas toutes seules : envoyez-les depuis la liste ci-dessous.
          </p>
          {report.failed.map((f, index) => (
            <p key={index} className="text-destructive">
              {f.name} ({f.email}) : {f.error}
            </p>
          ))}
        </div>
      ) : null}
    </PanelCard>
  );
}

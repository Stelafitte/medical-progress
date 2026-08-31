/**
 * Import d'un référentiel déjà structuré : un tableau, pas des documents.
 *
 * Le voisin `CorpusImport` part de documents et fait travailler l'IA pour en
 * TIRER des acquis. Ici, le référentiel existe déjà sous forme de tableau — le
 * fichier du collège, la table d'une autre plateforme, un export de scolarité —
 * et il n'y a rien à inventer : il faut le lire sans le déformer. Aucun appel
 * IA, donc, et aucun crédit consommé.
 *
 * Les deux vivent sous le même bouton, en deux onglets, parce que ce sont deux
 * voies vers la même liste unique d'acquis. Deux boutons séparés donneraient
 * deux chemins d'écriture à tenir en accord.
 *
 * Ce que l'écran s'interdit : écrire quoi que ce soit avant confirmation, et
 * taire ce qu'il a deviné. Séparateur, ligne d'en-tête, colonnes reconnues,
 * codes engendrés, natures supposées — tout est affiché et corrigeable.
 */
import { useMemo, useRef, useState } from "react";
import { Upload } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { useDataAccess } from "@/application/session";
import {
  importOutcomeRoster,
  type ImportOutcomeRosterReport,
} from "@/application/outcomeRosterImport";
import { COMPETENCE_MASTERY_LABELS_FR } from "@/domain/competenceDraft";
import {
  OUTCOME_COLUMNS,
  OUTCOME_COLUMN_LABELS_FR,
  buildOutcomeRosterPreview,
} from "@/domain/outcomeRoster";
import type { ColumnMapping } from "@/domain/delimitedTable";
import type { OutcomeColumn } from "@/domain/outcomeRoster";
import { readRosterFile, type RosterFileRead } from "@/infrastructure/text/rosterFile";
import type { CurriculumVersionId, MasteryLevel, OutcomeNature, ProgramId } from "@/domain/types";

const AUTO = "__auto__";

const NATURE_LABELS_FR: Record<OutcomeNature, string> = {
  knowledge: "Connaissance",
  simulated_competence: "Compétence simulée",
  real_competence: "Compétence en situation réelle",
};

const STATUS_LABELS: Record<string, string> = {
  ready: "à créer",
  duplicate_in_file: "doublon",
  already_present: "déjà présent",
  invalid: "erreur",
};

const EXAMPLE = [
  "Thème;Intitulé;Nature;Niveau",
  "Sémiologie cardiovasculaire;Ausculter un souffle;Compétence;Avancé",
  "Sémiologie cardiovasculaire;Décrire les souffles;Connaissance;Base",
  "Rythmologie;Lire un ECG de repos;Compétence;Expert",
].join("\n");

export function OutcomeRosterImportPanel({
  programId,
  curriculumVersionId,
  defaultNature,
  existingOutcomeCodes = [],
  onCreated,
}: {
  readonly programId: ProgramId;
  readonly curriculumVersionId: CurriculumVersionId | undefined;
  /** Nature retenue quand le tableau n'en porte pas : celle de l'onglet d'accueil. */
  readonly defaultNature: OutcomeNature;
  readonly existingOutcomeCodes?: readonly string[];
  readonly onCreated?: () => void;
}) {
  const dataAccess = useDataAccess();

  const [rawText, setRawText] = useState("");
  const [fileRead, setFileRead] = useState<RosterFileRead | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [manualMapping, setManualMapping] = useState<ColumnMapping<OutcomeColumn>>({});
  const [nature, setNature] = useState<OutcomeNature>(defaultNature);
  const [level, setLevel] = useState<MasteryLevel>("proficient");
  const [natureAcknowledged, setNatureAcknowledged] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [report, setReport] = useState<ImportOutcomeRosterReport | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const preview = useMemo(
    () =>
      rawText.trim() === ""
        ? null
        : buildOutcomeRosterPreview({
            text: rawText,
            mapping: manualMapping,
            existingCodes: existingOutcomeCodes,
            defaultNature: nature,
            defaultLevel: level,
          }),
    [rawText, manualMapping, existingOutcomeCodes, nature, level],
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
    setNatureAcknowledged(false);
    setReport(null);
    setFailure(null);
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

  // Aucune colonne de nature : TOUTES les lignes prendront la nature choisie
  // ci-dessus. Sur un référentiel médical, ranger des connaissances parmi les
  // compétences fausse tout le passeport de l'étudiant — d'où la case à cocher.
  const natureFullyAssumed =
    preview !== null && preview.candidates.length > 0 && preview.mapping.nature === undefined;
  const needsAcknowledgement = natureFullyAssumed && !natureAcknowledged;

  const canImport =
    preview !== null &&
    preview.canImport &&
    curriculumVersionId !== undefined &&
    !needsAcknowledgement &&
    !importing;

  async function runImport() {
    if (!preview || curriculumVersionId === undefined) return;
    setImporting(true);
    setProgress(0);
    setFailure(null);
    try {
      // Les thèmes sont relus MAINTENANT, pas au montage : entre l'ouverture
      // de l'écran et le clic, un autre import a pu en créer, et un thème
      // ignoré ferait un chapitre en double.
      const existingThemes = await dataAccess.outcomes.listOutcomeThemes(programId);
      const result = await importOutcomeRoster({
        outcomes: dataAccess.outcomes,
        programId,
        curriculumVersionId,
        preview,
        existingThemes,
        onProgress: (done) => setProgress(done),
      });
      setReport(result);
      if (result.createdOutcomes.length > 0) {
        reset("", null, null);
        setReport(result);
        onCreated?.();
      }
    } catch (reason) {
      setFailure(reason instanceof Error ? reason.message : "L'import a échoué.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-xs">
        Pour un référentiel DÉJÀ sous forme de tableau : chaque ligne devient un acquis, chaque
        thème un chapitre. Aucune analyse par l'IA, aucun crédit consommé, et aucun document déposé
        dans la médiathèque — c'est l'autre onglet qui conserve les fichiers.
      </p>

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
          disabled={importing}
          onClick={() => fileInput.current?.click()}
        >
          <Upload className="mr-2 size-4" aria-hidden /> Choisir un fichier CSV ou Excel
        </Button>
        {fileName ? <span className="text-muted-foreground text-xs">{fileName}</span> : null}
      </div>

      {readError ? (
        <p className="border-destructive/40 bg-destructive/5 text-destructive rounded-md border px-3 py-2 text-xs">
          {readError}
        </p>
      ) : null}

      {fileRead && preview ? (
        <p className="border-border bg-muted/40 rounded-md border px-3 py-2 text-xs">
          Lu comme {fileRead.source === "xlsx" ? "classeur Excel" : "fichier texte"}
          {fileRead.encoding ? `, encodage ${fileRead.encoding}` : ""}, séparateur «{" "}
          {preview.delimiter === "\t" ? "tabulation" : preview.delimiter} », en-tête ligne{" "}
          {preview.headerLine}.
        </p>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="outcome-roster-paste">Ou coller le tableau</Label>
        <Textarea
          id="outcome-roster-paste"
          rows={6}
          value={rawText}
          placeholder={EXAMPLE}
          disabled={importing}
          onChange={(e) => reset(e.target.value, null, null)}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="outcome-roster-nature">Nature par défaut</Label>
          <Select
            value={nature}
            onValueChange={(v) => {
              setNature(v as OutcomeNature);
              setNatureAcknowledged(false);
            }}
          >
            <SelectTrigger id="outcome-roster-nature" className="min-h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(NATURE_LABELS_FR) as OutcomeNature[]).map((value) => (
                <SelectItem key={value} value={value}>
                  {NATURE_LABELS_FR[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-muted-foreground text-xs">
            Employée seulement pour les lignes dont la colonne « Nature » est vide ou absente.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="outcome-roster-level">Niveau attendu par défaut</Label>
          <Select value={level} onValueChange={(v) => setLevel(v as MasteryLevel)}>
            <SelectTrigger id="outcome-roster-level" className="min-h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(COMPETENCE_MASTERY_LABELS_FR) as MasteryLevel[]).map((value) => (
                <SelectItem key={value} value={value}>
                  {COMPETENCE_MASTERY_LABELS_FR[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-muted-foreground text-xs">
            Une échelle à trois crans (base / avancé / expert) est traduite vers celle du socle.
          </p>
        </div>
      </div>

      {preview ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            {[
              ["Thèmes", preview.themes.filter((t) => t.key !== "").length],
              ["À créer", preview.readyCount],
              ["Doublons du fichier", preview.duplicateCount],
              ["Déjà présents", preview.alreadyPresentCount],
              ["En erreur", preview.invalidCount],
            ].map(([label, value]) => (
              <div key={String(label)} className="border-border rounded-md border px-3 py-2">
                <p className="text-muted-foreground text-xs">{label}</p>
                <p className="text-lg font-semibold">{value}</p>
              </div>
            ))}
          </div>

          {preview.missingRequiredColumns.length > 0 ? (
            <p className="border-destructive/40 bg-destructive/5 text-destructive rounded-md border px-3 py-2 text-xs">
              Colonnes obligatoires non reconnues :{" "}
              {preview.missingRequiredColumns.map((c) => OUTCOME_COLUMN_LABELS_FR[c]).join(", ")}.
              Corrigez la correspondance ci-dessous.
            </p>
          ) : null}

          {preview.generatedCodeCount > 0 ? (
            <p className="border-border bg-muted/40 rounded-md border px-3 py-2 text-xs">
              {preview.generatedCodeCount} code(s) engendrés faute de colonne dans la source, de la
              forme <code>T1-01</code> (numéro de thème, rang dans le thème). Ils resteront
              modifiables.
            </p>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {OUTCOME_COLUMNS.map((column) => (
              <div key={column} className="space-y-2">
                <Label htmlFor={`outcome-map-${column}`}>{OUTCOME_COLUMN_LABELS_FR[column]}</Label>
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
                  <SelectTrigger id={`outcome-map-${column}`} className="min-h-11">
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
                  <TableHead>Thème</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Intitulé</TableHead>
                  <TableHead>Nature</TableHead>
                  <TableHead>Niveau</TableHead>
                  <TableHead>État</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.candidates.slice(0, 50).map((row) => (
                  <TableRow key={row.line}>
                    <TableCell className="text-muted-foreground">{row.line}</TableCell>
                    <TableCell className="text-muted-foreground">{row.themeLabel || "—"}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {row.code}
                      {row.codeGenerated ? (
                        <Badge variant="outline" className="ml-2 font-normal">
                          engendré
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="font-medium">{row.label}</TableCell>
                    <TableCell className="text-xs">
                      {NATURE_LABELS_FR[row.nature]}
                      {row.natureAssumed ? (
                        <Badge variant="outline" className="ml-2 font-normal">
                          supposée
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-xs">
                      {COMPETENCE_MASTERY_LABELS_FR[row.targetMastery]}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={row.status === "invalid" ? "destructive" : "outline"}
                        className="font-normal"
                      >
                        {STATUS_LABELS[row.status]}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {preview.candidates.length > 50 ? (
              <p className="text-muted-foreground px-1 py-2 text-xs">
                50 premières lignes affichées sur {preview.candidates.length}. L'import les traite
                toutes.
              </p>
            ) : null}
          </div>

          {preview.issues.filter((i) => i.level === "error").length > 0 ? (
            <div className="border-destructive/40 bg-destructive/5 space-y-1 rounded-md border px-3 py-2 text-xs">
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

          {natureFullyAssumed ? (
            <label className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs">
              <Checkbox
                checked={natureAcknowledged}
                onCheckedChange={(v) => setNatureAcknowledged(v === true)}
                className="mt-0.5"
              />
              <span>
                Aucune colonne « Nature » dans ce tableau : les{" "}
                <strong>{preview.candidates.length} lignes</strong> seront créées comme «{" "}
                {NATURE_LABELS_FR[nature]} ». Une connaissance rangée parmi les compétences fausse
                le passeport de l'étudiant. J'ai vérifié que ce tableau ne mélange pas les deux.
              </span>
            </label>
          ) : null}

          {curriculumVersionId === undefined ? (
            <p className="border-destructive/40 bg-destructive/5 text-destructive rounded-md border px-3 py-2 text-xs">
              Aucune version de curriculum pour ce programme : le référentiel ne peut pas encore
              être alimenté.
            </p>
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
              : `Créer ${preview.readyCount} acquis dans ${
                  preview.themes.filter((t) => t.key !== "").length
                } thème(s)`}
          </Button>
        </div>
      ) : null}

      {failure ? (
        <p className="border-destructive/40 bg-destructive/5 text-destructive rounded-md border px-3 py-2 text-sm">
          {failure}
        </p>
      ) : null}

      {report ? (
        <div className="border-border bg-muted/40 space-y-2 rounded-md border px-3 py-2 text-sm">
          <p>
            {report.createdOutcomes.length} acquis créés, {report.createdThemes.length} thème(s)
            créés
            {report.reusedThemes.length > 0
              ? `, ${report.reusedThemes.length} thème(s) déjà présents réutilisés`
              : ""}
            {report.skippedCount > 0 ? `, ${report.skippedCount} ligne(s) ignorées` : ""}.
          </p>
          {report.failures.length > 0 ? (
            <div className="text-destructive space-y-1 text-xs">
              <p>
                {report.failures.length} échec(s). Rejouer le même fichier reprendra uniquement ce
                qui manque : les acquis déjà créés seront marqués « déjà présents ».
              </p>
              {report.failures.slice(0, 10).map((f, index) => (
                <p key={index}>
                  Ligne {f.line} — {f.label} : {f.message}
                </p>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

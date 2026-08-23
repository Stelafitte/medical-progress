/**
 * Import / export d'une promotion en bloc (MAQUETTE).
 *
 * Le fichier déposé est lu et contrôlé localement dans le navigateur.
 * Aucune donnée n'est transmise ni enregistrée : la création de la promotion
 * est simulée tant que l'infrastructure de données n'est pas activée.
 */
import { useMemo, useRef, useState } from "react";
import { Download, FileSpreadsheet, Upload } from "lucide-react";

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
import { EmptyState, MockBadge, PanelCard, StatCard } from "@/features/professional/mock-ui";
import type { ProgramAdminScope } from "@/features/administration/useProgramAdmin";
import {
  ROSTER_TEMPLATE_CSV,
  buildCohortExportCsv,
  buildRosterPreview,
  type RosterCandidate,
} from "@/domain/cohortRoster";

const STATUS_LABELS: Record<RosterCandidate["status"], string> = {
  ready: "à créer",
  duplicate_in_file: "doublon fichier",
  already_enrolled: "déjà inscrit",
  invalid: "erreur",
};

const ENROLLMENT_STATUS_FR: Record<string, string> = {
  active: "active",
  suspended: "suspendue",
  completed: "terminée",
  withdrawn: "abandon",
};

function download(filename: string, content: string) {
  const blob = new Blob([`\uFEFF${content}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function CohortRosterSection({
  data,
  section = "all",
}: {
  data: ProgramAdminScope;
  /** « import » sert à embarquer le dépôt de liste dans le bloc « Créer une classe ». */
  section?: "all" | "import" | "export";
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [rawText, setRawText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileNotice, setFileNotice] = useState<string | null>(null);
  const [cohortLabel, setCohortLabel] = useState("");
  const [academicYear, setAcademicYear] = useState("");
  const [simulated, setSimulated] = useState<string | null>(null);
  const [exportCohortId, setExportCohortId] = useState(data.cohorts[0]?.id ?? "");

  const existingEmails = useMemo(
    () =>
      data.enrollments
        .map((e) => data.people.find((p) => p.id === e.personId)?.email)
        .filter((e): e is string => Boolean(e)),
    [data.enrollments, data.people],
  );

  const preview = useMemo(
    () => (rawText.trim() ? buildRosterPreview({ text: rawText, existingEmails }) : null),
    [rawText, existingEmails],
  );

  async function onPickFile(file: File | undefined) {
    if (!file) return;
    setSimulated(null);
    setFileName(file.name);
    const isSpreadsheet = /\.(xlsx|xls)$/i.test(file.name);
    if (isSpreadsheet) {
      setRawText("");
      setFileNotice(
        "Lecture XLSX prévue : elle sera branchée avec le backend. En attendant, exportez la feuille en CSV (séparateur point-virgule) ou collez le tableau ci-dessous.",
      );
      return;
    }
    setFileNotice(null);
    setRawText(await file.text());
  }

  const exportRows = useMemo(() => {
    const cohort = data.cohorts.find((c) => c.id === exportCohortId);
    if (!cohort) return [];
    return data.enrollments
      .filter((e) => e.cohortId === cohort.id)
      .map((e) => {
        const person = data.people.find((p) => p.id === e.personId);
        return {
          fullName: person?.fullName ?? e.personId,
          email: person?.email ?? "—",
          cohortLabel: cohort.label,
          academicYear: cohort.academicYear,
          enrollmentStatus: ENROLLMENT_STATUS_FR[e.status] ?? e.status,
        };
      });
  }, [data, exportCohortId]);

  return (
    <div className="space-y-8">
      <PanelCard
        title="Importer une promotion (liste d'étudiants)"
        description="Dépôt CSV ou collage d'un tableau : contrôle des colonnes, des doublons et des erreurs avant création."
        action={<MockBadge />}
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

        {fileNotice ? (
          <p className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
            {fileNotice}
          </p>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="roster-paste">Ou coller la liste (Nom;Prénom;Email;…)</Label>
          <Textarea
            id="roster-paste"
            rows={5}
            value={rawText}
            placeholder={ROSTER_TEMPLATE_CSV}
            onChange={(e) => {
              setRawText(e.target.value);
              setSimulated(null);
            }}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="cohort-label">Nom de la promotion à créer</Label>
            <Input
              id="cohort-label"
              value={cohortLabel}
              placeholder="Promotion 2026-2027"
              onChange={(e) => setCohortLabel(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cohort-year">Année universitaire</Label>
            <Input
              id="cohort-year"
              value={academicYear}
              placeholder="2026-2027"
              onChange={(e) => setAcademicYear(e.target.value)}
            />
          </div>
        </div>

        {preview ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard label="À créer" value={preview.readyCount} />
              <StatCard label="Doublons fichier" value={preview.duplicateCount} />
              <StatCard label="Déjà inscrits" value={preview.alreadyEnrolledCount} />
              <StatCard label="Erreurs" value={preview.invalidCount} />
            </div>

            {preview.missingRequiredColumns.length > 0 ? (
              <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                Colonnes obligatoires absentes : {preview.missingRequiredColumns.join(", ")}.
                Utilisez le modèle fourni.
              </p>
            ) : null}

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ligne</TableHead>
                    <TableHead>Nom</TableHead>
                    <TableHead>Prénom</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Groupe</TableHead>
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
                      <TableCell>{c.group ?? "—"}</TableCell>
                      <TableCell>
                        <Badge
                          variant={c.status === "invalid" ? "destructive" : "outline"}
                          className="font-normal"
                        >
                          {STATUS_LABELS[c.status]}
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

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                className="min-h-11"
                disabled={!preview.canImport || cohortLabel.trim() === ""}
                onClick={() =>
                  setSimulated(
                    `Simulation : ${preview.readyCount} inscription(s) et ${preview.readyCount} rôle(s) « apprenant » seraient créés dans « ${cohortLabel.trim()} »${
                      academicYear.trim() ? ` (${academicYear.trim()})` : ""
                    }. Rien n'a été enregistré.`,
                  )
                }
              >
                Créer la promotion (démonstration)
              </Button>
              <span className="text-xs text-muted-foreground">
                Les lignes en doublon ou en erreur sont exclues de l'import.
              </span>
            </div>
            {simulated ? (
              <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">
                {simulated}
              </p>
            ) : null}
          </div>
        ) : (
          <EmptyState>
            Déposez un fichier ou collez une liste pour afficher le contrôle avant import.
          </EmptyState>
        )}
      </PanelCard>

      <PanelCard
        title="Exporter une promotion"
        description="Export CSV des identités et des états d'inscription. Les instantanés statistiques restent conservés d'une année à l'autre."
      >
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-56 space-y-2">
            <Label htmlFor="export-cohort">Promotion</Label>
            <Select value={exportCohortId} onValueChange={setExportCohortId}>
              <SelectTrigger id="export-cohort" className="min-h-11">
                <SelectValue placeholder="Choisir une promotion" />
              </SelectTrigger>
              <SelectContent>
                {data.cohorts.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.label} · {c.academicYear}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-11"
            disabled={exportRows.length === 0}
            onClick={() =>
              download(`promotion-${exportCohortId}.csv`, buildCohortExportCsv(exportRows))
            }
          >
            <Download className="mr-2 size-4" aria-hidden /> Exporter en CSV
          </Button>
          <span className="text-xs text-muted-foreground">
            {exportRows.length} étudiant(s) dans la promotion sélectionnée.
          </span>
        </div>
      </PanelCard>
    </div>
  );
}

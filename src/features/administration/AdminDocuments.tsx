/**
 * « Documents et certificats » — pièces exigées par le programme, puis
 * exploitation par promotion.
 *
 * Une seule page déroulante, sans onglets, comme Compétences, Connaissances,
 * Stages et Évaluations : le référentiel des pièces exigées, puis la création
 * (import en masse d'abord, saisie manuelle ensuite), puis — rattaché à une
 * classe — le suivi nominatif des pièces et le certificat de complétude.
 * Tout est simulé de façon déterministe : aucune écriture réelle.
 */
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  EmptyState,
  MockBadge,
  PanelCard,
  ScopeNotice,
  StatCard,
} from "@/features/professional/mock-ui";
import { CohortSelector } from "@/features/administration/CohortSelector";
import { DocumentRequirementForm } from "@/features/administration/DocumentRequirementForm";
import { personNameFor, useProgramAdmin } from "@/features/administration/useProgramAdmin";
import { AdminChargement } from "@/features/administration/AdminChargement";
import { defaultPilotCohortId } from "@/features/administration/adminProgramViewModel";
import {
  createLocalDocumentRequirement,
  useLocalDocumentRequirements,
} from "@/application/documentRequirementStore";
import {
  DOCUMENT_DUE_LABELS_FR,
  DOCUMENT_PROVIDER_LABELS_FR,
  DOCUMENT_VALIDATOR_LABELS_FR,
  EMPTY_NEW_DOCUMENT_REQUIREMENT_INPUT,
  diffDocumentRequirementRows,
  parseDocumentRequirementText,
} from "@/domain/documentRequirement";
import {
  ADMIN_DOCUMENT_STATUS_LABELS_FR,
  CERTIFICATE_STATUS_LABELS_FR,
  EXPORT_NO_PATIENT_DATA_FR,
  nextCertificateStatus,
  type CertificateAction,
  type CertificateStatus,
} from "@/domain/administration";
import type { ProgramId } from "@/domain/types";

const ACTIONS: readonly { action: CertificateAction; label: string }[] = [
  { action: "request", label: "Demander" },
  { action: "remind", label: "Relancer" },
  { action: "validate", label: "Valider" },
];

export function AdminDocuments() {
  const { data, isPending, error } = useProgramAdmin();
  const [cohortId, setCohortId] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, CertificateStatus>>({});
  const [feedback, setFeedback] = useState<string | null>(null);
  const [importText, setImportText] = useState("");
  const [imported, setImported] = useState<number | null>(null);

  const programId = (data?.program?.id ?? "program-unknown") as ProgramId;
  const localRequirements = useLocalDocumentRequirements(data?.program?.id);

  const parsed = useMemo(() => parseDocumentRequirementText(importText), [importText]);
  const diff = useMemo(
    () => diffDocumentRequirementRows(parsed, localRequirements),
    [parsed, localRequirements],
  );

  if (isPending || !data) return <AdminChargement error={error} />;

  const cohorts = data.cohorts;
  const selectedId = cohortId ?? defaultPilotCohortId(cohorts);
  const selectedCohort = cohorts.find((cohort) => cohort.id === selectedId) ?? null;
  const enrollmentIds = new Set(
    data.enrollments.filter((e) => e.cohortId === selectedId).map((e) => e.id),
  );
  const documents = data.documents.filter((d) => enrollmentIds.has(d.enrollmentId));
  const certificates = data.certificates.filter((c) => enrollmentIds.has(c.enrollmentId));
  const missing = documents.filter((d) => d.status === "missing").length;
  const mandatoryCount = localRequirements.filter((item) => item.mandatory).length;

  return (
    <div className="space-y-6">
      <SectionHeading
        title="Documents et certificats"
        level={1}
        action={<MockBadge />}
        description="Pièces exigées par le programme, création par import ou à la main, puis suivi des dépôts et du certificat de complétude pour une classe."
      />

      <ScopeNotice>
        {EXPORT_NO_PATIENT_DATA_FR} La signature du certificat relève du responsable de stage,
        jamais de l'administration.
      </ScopeNotice>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Pièces exigées" value={localRequirements.length} />
        <StatCard label="dont obligatoires" value={mandatoryCount} />
        <StatCard label="Apprenants suivis" value={enrollmentIds.size} />
        <StatCard label="Pièces manquantes" value={missing} />
      </div>

      {/* 1. Le référentiel des pièces exigées par le programme */}
      <SectionHeading
        title="Pièces exigées par le programme"
        level={2}
        description="Le modèle : ce que le programme réclame, indépendamment d'une promotion."
      />

      <PanelCard
        title="Référentiel des pièces"
        description={`${localRequirements.length} pièce(s) définie(s)`}
      >
        {localRequirements.length === 0 ? (
          <EmptyState>
            Aucune pièce exigée n'est encore définie pour ce programme. Utilisez l'import rapide ou
            le formulaire ci-dessous.
          </EmptyState>
        ) : (
          <ul className="space-y-2 text-sm">
            {localRequirements.map((item) => (
              <li key={item.id} className="border-border space-y-1 rounded-md border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="font-mono text-[10px]">
                    {item.code}
                  </Badge>
                  <span className="font-medium">{item.label}</span>
                  <Badge variant={item.mandatory ? "default" : "outline"} className="font-normal">
                    {item.mandatory ? "obligatoire" : "facultative"}
                  </Badge>
                  <Badge variant="outline" className="font-normal">
                    créée dans cette session
                  </Badge>
                </div>
                <p className="text-muted-foreground text-xs">
                  fournie par {DOCUMENT_PROVIDER_LABELS_FR[item.provider]} · validée par{" "}
                  {DOCUMENT_VALIDATOR_LABELS_FR[item.validator]} · attendue{" "}
                  {DOCUMENT_DUE_LABELS_FR[item.due]}
                  {item.notes.length > 0 ? ` · ${item.notes}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </PanelCard>

      {/* 2. Ajout : import d'abord, saisie manuelle ensuite */}
      <SectionHeading
        title="Ajouter des pièces exigées"
        level={2}
        description="Deux voies pour alimenter la même liste : coller un tableau existant, ou saisir une pièce à la main."
      />

      <PanelCard
        title="Voie rapide — coller une liste de pièces"
        description="Un tableau CSV/TSV : code, intitulé, obligation (obligatoire / facultative). Analyse locale uniquement, rien n'est envoyé."
        action={<MockBadge />}
      >
        <Textarea
          value={importText}
          onChange={(event) => setImportText(event.target.value)}
          rows={6}
          placeholder={
            "DOC-01;Attestation d'assurance;obligatoire\nDOC-02;Convention de stage signée;obligatoire"
          }
          aria-label="Pièces à importer"
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{parsed.length} ligne(s) reconnue(s)</Badge>
          <Badge variant="outline">{diff.newCount} nouvelle(s)</Badge>
          <Badge variant="outline">{diff.changedCount} déjà présente(s)</Badge>
          <Badge variant="outline">{diff.unchangedCount} inchangée(s)</Badge>
          <Badge variant="outline">{diff.ignoredCount} ignorée(s)</Badge>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            className="min-h-11"
            disabled={diff.newCount === 0}
            onClick={() => {
              let added = 0;
              for (const row of diff.rows) {
                if (row.kind !== "new") continue;
                const created = createLocalDocumentRequirement({
                  input: {
                    ...EMPTY_NEW_DOCUMENT_REQUIREMENT_INPUT,
                    code: row.code,
                    label: row.label,
                    mandatory: row.mandatory,
                  },
                  programId,
                });
                if (created) added += 1;
              }
              setImported(added);
              setImportText("");
            }}
          >
            Ajouter les {diff.newCount} nouvelle(s) pièce(s)
          </Button>
          <Button size="sm" variant="ghost" className="min-h-11" onClick={() => setImportText("")}>
            Effacer
          </Button>
          {imported !== null ? (
            <span className="text-muted-foreground text-sm">
              {imported} pièce(s) ajoutée(s) au référentiel de cette session.
            </span>
          ) : null}
        </div>
        <p className="text-muted-foreground mt-2 text-xs">
          Seules les lignes nouvelles sont ajoutées : un code déjà présent n'écrase jamais la pièce
          en place. Fournisseur et validateur sont posés par défaut (apprenant / administration) et
          restent modifiables à la main.
        </p>
      </PanelCard>

      <PanelCard title="Saisie manuelle — une pièce à la fois" action={<MockBadge />}>
        <DocumentRequirementForm
          programId={programId}
          idPrefix="documents-tab"
          submitLabel="Créer la pièce exigée"
          hint="La pièce rejoint la liste unique : elle est aussitôt proposée dans le « Concepteur de programme »."
        />
      </PanelCard>

      {/* 3. Exploitation : rattachée à une classe */}
      <SectionHeading
        title="Suivi des pièces par classe"
        level={2}
        description="L'exploitation ne se lit jamais hors promotion : les dépôts et le certificat se suivent pour une classe donnée."
      />

      <CohortSelector cohorts={cohorts} value={selectedId} onChange={setCohortId} />

      <PanelCard
        title={
          selectedCohort
            ? `Pièces déposées — classe « ${selectedCohort.label} »`
            : "Pièces déposées"
        }
        description="Vue de lecture simulée : aucun dépôt réel de fichier dans cette maquette."
      >
        {documents.length === 0 ? (
          <EmptyState>Aucune pièce suivie pour cette classe.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Apprenant</TableHead>
                  <TableHead>Pièce</TableHead>
                  <TableHead>État</TableHead>
                  <TableHead>Dates</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">
                      {personNameFor(data, d.enrollmentId)}
                    </TableCell>
                    <TableCell>{d.label}</TableCell>
                    <TableCell>
                      <Badge
                        variant={d.status === "missing" ? "destructive" : "outline"}
                        className="font-normal"
                      >
                        {ADMIN_DOCUMENT_STATUS_LABELS_FR[d.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {d.requestedOn
                        ? `demandée le ${new Date(d.requestedOn).toLocaleDateString("fr-FR")}`
                        : "—"}
                      {d.receivedOn
                        ? ` · reçue le ${new Date(d.receivedOn).toLocaleDateString("fr-FR")}`
                        : ""}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </PanelCard>

      <PanelCard
        title="Certificat de complétude"
        description="non demandé → demandé → relancé → signé (responsable de stage) → validé (administration)."
      >
        {certificates.length === 0 ? (
          <EmptyState>Aucun certificat suivi pour cette classe.</EmptyState>
        ) : (
          <ul className="space-y-3">
            {certificates.map((c) => {
              const status = overrides[c.id] ?? c.status;
              return (
                <li key={c.id} className="flex flex-wrap items-center gap-3">
                  <span className="font-medium">{personNameFor(data, c.enrollmentId)}</span>
                  <Badge variant="outline" className="font-normal">
                    {CERTIFICATE_STATUS_LABELS_FR[status]}
                  </Badge>
                  <span className="flex flex-wrap gap-2">
                    {ACTIONS.map(({ action, label }) => {
                      const next = nextCertificateStatus(status, action);
                      return (
                        <Button
                          key={action}
                          size="sm"
                          variant="outline"
                          disabled={next === null}
                          onClick={() => {
                            if (!next) return;
                            setOverrides((prev) => ({ ...prev, [c.id]: next }));
                            setFeedback(
                              `Démonstration : certificat « ${CERTIFICATE_STATUS_LABELS_FR[next]} » — aucune écriture réelle.`,
                            );
                          }}
                        >
                          {label}
                        </Button>
                      );
                    })}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {feedback ? <p className="mt-3 text-sm text-muted-foreground">{feedback}</p> : null}
      </PanelCard>

      <PanelCard
        title="Attestations et exports"
        description="Exports simulés, sans donnée patient."
      >
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled>
            Exporter les attestations (prévu)
          </Button>
          <Button size="sm" variant="outline" disabled>
            Exporter le suivi de promotion (prévu)
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button asChild variant="outline" className="min-h-11">
            <Link to="/espace/administration/pilotage">
              Agir sur cette promotion dans Pilotage
              <ArrowRight className="ms-1 size-4" aria-hidden />
            </Link>
          </Button>
          <Button asChild variant="outline" className="min-h-11">
            <Link to="/espace/administration/securite">
              Conservation et audit
              <ArrowRight className="ms-1 size-4" aria-hidden />
            </Link>
          </Button>
        </div>
      </PanelCard>
    </div>
  );
}

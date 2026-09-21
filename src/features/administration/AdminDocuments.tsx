/**
 * « Documents et certificats » — pièces exigées par le programme, puis
 * exploitation par promotion.
 *
 * Une seule page déroulante, sans onglets, comme Compétences, Connaissances,
 * Stages et Évaluations : le référentiel des pièces exigées, puis la création
 * (import en masse d'abord, saisie manuelle ensuite), puis — rattaché à une
 * classe — le suivi nominatif des pièces et le certificat de complétude.
 * Le référentiel des pièces et le suivi sont réels (21/09). Le certificat est
 * affiché en lecture : ses changements d'état ne sont pas encore branchés.
 */
import { useEffect, useMemo, useState } from "react";
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
import { EmptyState, PanelCard, ScopeNotice, StatCard } from "@/features/professional/mock-ui";
import { CohortSelector } from "@/features/administration/CohortSelector";
import { DocumentRequirementForm } from "@/features/administration/DocumentRequirementForm";
import { personNameFor, useProgramAdmin } from "@/features/administration/useProgramAdmin";
import { AdminChargement } from "@/features/administration/AdminChargement";
import { defaultPilotCohortId } from "@/features/administration/adminProgramViewModel";
import {
  createDocumentRequirement,
  hydrateDocumentRequirements,
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
} from "@/domain/administration";
import type { ProgramId } from "@/domain/types";
import { setCohortFocus, useCohortFocus } from "@/application/cohortFocusStore";

export function AdminDocuments() {
  const { data, isPending, error } = useProgramAdmin();
  /*
   * LA PROMOTION EST CHOISIE UNE FOIS, PAS UNE FOIS PAR ONGLET (17/09).
   * Chaque écran gardait son propre `useState` : on choisissait une promotion
   * dans Évaluations, et le Pilotage l'ignorait. Sept écrans, sept vérités.
   */
  const cohortId = useCohortFocus();
  const [importText, setImportText] = useState("");
  const [imported, setImported] = useState<number | null>(null);

  const programId = (data?.program?.id ?? "program-unknown") as ProgramId;
  const localRequirements = useLocalDocumentRequirements(data?.program?.id);
  /*
   * LA BASE SEME L'INSTANTANE. Sans cela l'ecran repartirait vide a chaque
   * rechargement, ce qui etait justement le defaut d'hier.
   */
  useEffect(() => {
    if (data?.program?.id) hydrateDocumentRequirements(data.program.id, data.documentRequirements);
  }, [data?.program?.id, data?.documentRequirements]);

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
        eyebrow={data.program?.name ?? "Programme"}
        title="Documents et certificats"
        level={1}
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
              <li key={item.id} className="border-border space-y-1 rounded-lg border p-4">
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
              /*
               * UNE PIECE A LA FOIS, EN SERIE. Un `Promise.all` sur trente
               * lignes ouvre trente ecritures simultanees pour un geste que
               * l'utilisateur percoit comme un seul ; la serie garde aussi
               * l'ordre du fichier importe.
               */
              void (async () => {
                let added = 0;
                for (const row of diff.rows) {
                  if (row.kind !== "new") continue;
                  const created = await createDocumentRequirement({
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
              })();
            }}
          >
            Ajouter les {diff.newCount} nouvelle(s) pièce(s)
          </Button>
          <Button size="sm" variant="ghost" className="min-h-11" onClick={() => setImportText("")}>
            Effacer
          </Button>
          {imported !== null ? (
            <span className="text-muted-foreground text-sm">
              {imported} pièce(s) ajoutée(s) au référentiel du programme.
            </span>
          ) : null}
        </div>
        <p className="text-muted-foreground mt-2 text-xs">
          Seules les lignes nouvelles sont ajoutées : un code déjà présent n'écrase jamais la pièce
          en place. Fournisseur et validateur sont posés par défaut (apprenant / administration) et
          restent modifiables à la main.
        </p>
      </PanelCard>

      <PanelCard title="Saisie manuelle — une pièce à la fois">
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

      <CohortSelector cohorts={cohorts} value={selectedId} onChange={setCohortFocus} />

      <PanelCard
        title={
          selectedCohort
            ? `Pièces déposées — classe « ${selectedCohort.label} »`
            : "Pièces déposées"
        }
        description="Vue de lecture : le dépôt de fichier n'est pas encore branché."
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
        description="État de chaque certificat : non demandé → demandé → relancé → signé (responsable de stage) → validé (administration). Lecture seule : les changements d'état ne sont pas encore branchés."
      >
        {certificates.length === 0 ? (
          <EmptyState>Aucun certificat suivi pour cette classe.</EmptyState>
        ) : (
          <ul className="space-y-3">
            {certificates.map((c) => {
              const status = c.status;
              return (
                <li key={c.id} className="flex flex-wrap items-center gap-3">
                  <span className="font-medium">{personNameFor(data, c.enrollmentId)}</span>
                  <Badge variant="outline" className="font-normal">
                    {CERTIFICATE_STATUS_LABELS_FR[status]}
                  </Badge>
                </li>
              );
            })}
          </ul>
        )}
      </PanelCard>

      {/* « Attestations et exports » retiré le 21/09 : deux boutons désactivés
          « (prévu) » et un lien vers le Pilotage, qui renvoyait ici. */}
    </div>
  );
}

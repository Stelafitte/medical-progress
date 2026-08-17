import { useState } from "react";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState, MockBadge, PanelCard, ScopeNotice } from "@/features/professional/mock-ui";
import { personNameFor, useProgramAdmin } from "@/features/administration/useProgramAdmin";
import {
  ADMIN_DOCUMENT_STATUS_LABELS_FR,
  CERTIFICATE_STATUS_LABELS_FR,
  EXPORT_NO_PATIENT_DATA_FR,
  nextCertificateStatus,
  type CertificateAction,
  type CertificateStatus,
} from "@/domain/administration";

const ACTIONS: readonly { action: CertificateAction; label: string }[] = [
  { action: "request", label: "Demander" },
  { action: "remind", label: "Relancer" },
  { action: "validate", label: "Valider" },
];

export function AdminDocuments() {
  const { data, isPending } = useProgramAdmin();
  const [overrides, setOverrides] = useState<Record<string, CertificateStatus>>({});
  const [feedback, setFeedback] = useState<string | null>(null);

  if (isPending || !data) return <Skeleton className="h-80 w-full" />;

  return (
    <div className="space-y-8">
      <SectionHeading
        title="Documents et certificats"
        level={1}
        action={<MockBadge />}
        description="Pièces administratives et workflow du certificat de complétude."
      />

      <ScopeNotice>{EXPORT_NO_PATIENT_DATA_FR}</ScopeNotice>

      <PanelCard title="Pièces administratives">
        {data.documents.length === 0 ? (
          <EmptyState>Aucune pièce suivie.</EmptyState>
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
                {data.documents.map((d) => (
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
        <ul className="space-y-3">
          {data.certificates.map((c) => {
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
                <span className="text-xs text-muted-foreground">
                  La signature relève du responsable de stage, jamais de l'administration.
                </span>
              </li>
            );
          })}
        </ul>
        {feedback ? <p className="text-sm text-muted-foreground">{feedback}</p> : null}
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
      </PanelCard>
    </div>
  );
}

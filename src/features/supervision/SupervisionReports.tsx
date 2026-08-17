import { useState } from "react";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, MockBadge, PanelCard, ScopeNotice } from "@/features/professional/mock-ui";
import { learnerName, useSupervision } from "@/features/supervision/useSupervision";
import { canSignPlacementReport } from "@/domain/supervision";
import { useSession } from "@/application/session";

const APPRAISAL_LABEL: Record<string, string> = {
  insuffisant: "insuffisant",
  satisfaisant: "satisfaisant",
  "très satisfaisant": "très satisfaisant",
};

export function SupervisionReports() {
  const { rolesInActiveProgram, activeProgram } = useSession();
  const { data, isPending } = useSupervision();
  const [reviewed, setReviewed] = useState<readonly string[]>([]);
  const [signed, setSigned] = useState<readonly string[]>([]);
  const [transmitted, setTransmitted] = useState<readonly string[]>([]);

  if (isPending || !data) return <Skeleton className="h-72 w-full" />;

  const canSign = canSignPlacementReport(rolesInActiveProgram);

  return (
    <div className="space-y-6">
      <SectionHeading
        title="Bilans de fin de stage"
        level={1}
        action={<MockBadge />}
        description="Volumes, objectifs, compétences, appréciation et réserves, puis signature simulée."
      />

      <ScopeNotice>
        La signature est explicitement <strong>simulée</strong> et sans valeur juridique. La
        transmission est interne à l'application : aucune pièce n'est envoyée par e-mail.
      </ScopeNotice>

      {data.reports.length === 0 ? (
        <EmptyState>Aucun bilan à préparer sur votre périmètre.</EmptyState>
      ) : (
        <div className="grid gap-4">
          {data.reports.map((report) => {
            const isReviewed = reviewed.includes(report.id);
            const isSigned = report.signature.signed || signed.includes(report.id);
            return (
              <PanelCard
                key={report.id}
                title={`Bilan — ${learnerName(data, report.enrollmentId)}`}
                description={`${activeProgram.name} · appréciation : ${APPRAISAL_LABEL[report.appraisal]}`}
                action={
                  <Badge variant={isSigned ? "secondary" : "outline"} className="font-normal">
                    {isSigned ? "signé (simulé)" : "non signé"}
                  </Badge>
                }
              >
                <div className="grid gap-4 sm:grid-cols-3">
                  <ReportBlock title="Volumes" lines={report.volumes} />
                  <ReportBlock title="Objectifs" lines={report.objectives} />
                  <ReportBlock title="Compétences" lines={report.competences} />
                </div>
                <p>
                  <span className="font-medium">Commentaire : </span>
                  {report.supervisorComment}
                </p>
                {report.reservations ? (
                  <p className="text-destructive">
                    <span className="font-medium">Réserves : </span>
                    {report.reservations}
                  </p>
                ) : null}

                <div className="flex items-start gap-2">
                  <Checkbox
                    id={`revue-${report.id}`}
                    checked={isReviewed}
                    onCheckedChange={(v) =>
                      setReviewed((prev) =>
                        v === true ? [...prev, report.id] : prev.filter((x) => x !== report.id),
                      )
                    }
                  />
                  <label htmlFor={`revue-${report.id}`} className="text-sm">
                    J'ai relu la synthèse complète avant signature
                  </label>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    disabled={!canSign || !isReviewed || isSigned}
                    onClick={() => setSigned((prev) => [...prev, report.id])}
                  >
                    Signer (signature simulée)
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!isSigned || transmitted.includes(report.id)}
                    onClick={() => setTransmitted((prev) => [...prev, report.id])}
                  >
                    Transmettre à l'administration (interne)
                  </Button>
                  <Button size="sm" variant="outline" disabled={!isSigned}>
                    Demander le certificat de complétude
                  </Button>
                </div>
                {transmitted.includes(report.id) ? (
                  <p className="text-sm text-muted-foreground">
                    Démonstration : bilan disponible dans l'espace sécurisé de l'administration du
                    programme. Aucun envoi externe.
                  </p>
                ) : null}
              </PanelCard>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ReportBlock({
  title,
  lines,
}: {
  title: string;
  lines: readonly { label: string; value: string }[];
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{title}</p>
      <ul className="mt-1 space-y-1">
        {lines.map((l) => (
          <li key={l.label} className="flex justify-between gap-2">
            <span>{l.label}</span>
            <span className="text-muted-foreground">{l.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

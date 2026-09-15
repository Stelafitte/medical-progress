/**
 * LES SIGNALEMENTS SUR LES QUESTIONS — le panneau de l'équipe.
 *
 * Stef (15/09) : « les signalements doivent remonter à toute l'équipe
 * d'encadrement dont les responsables de stage et admin programme ». Ce
 * panneau lit `list_question_reports` (équipe entière) et traite avec
 * `resolve_question_report` (équipe entière aussi, depuis la migration
 * 20260915160000). Corriger la QUESTION elle-même reste un ré-import de la
 * banque (mode fusionner) : ici on décide, on n'édite pas l'énoncé.
 *
 * Deux vues : « À traiter » (nouveau, en cours) et « Traités ». Une décision
 * s'enregistre aussitôt, avec la note écrite juste avant.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useDataAccess } from "@/application/session";
import { EmptyState, PanelCard } from "@/features/professional/mock-ui";
import { formatFrDate } from "@/features/administration/adminProgramViewModel";
import {
  DECISIONS_SIGNALEMENT,
  STATUTS_SIGNALEMENT_FR,
  estATraiter,
  libelleRaison,
} from "@/domain/questionReport";
import type { QuestionReportDecision, QuestionReportRow } from "@/application/ports/repositories";
import type { ProgramId } from "@/domain/types";

export function QuestionReports({ programId }: { readonly programId: ProgramId }) {
  const dataAccess = useDataAccess();
  const [vue, setVue] = useState<"ouverts" | "traites">("ouverts");
  const reports = useQuery({
    queryKey: ["question-reports", programId],
    queryFn: () => dataAccess.assessments.listQuestionReports(programId),
  });

  const tous = reports.data ?? [];
  const ouverts = tous.filter((r) => estATraiter(r.status));
  const traites = tous.filter((r) => !estATraiter(r.status));
  const visibles = vue === "ouverts" ? ouverts : traites;

  return (
    <PanelCard
      title={`Signalements sur les questions${ouverts.length > 0 ? ` (${ouverts.length} à traiter)` : ""}`}
      description="Ce que les étudiants signalent depuis la correction : réponse discutable, recommandation plus récente, énoncé ambigu. Toute l'équipe d'encadrement les voit et peut trancher ; corriger une question passe par un ré-import de la banque."
      action={
        <div className="flex gap-1">
          <Button
            size="sm"
            variant={vue === "ouverts" ? "default" : "outline"}
            onClick={() => setVue("ouverts")}
          >
            À traiter ({ouverts.length})
          </Button>
          <Button
            size="sm"
            variant={vue === "traites" ? "default" : "outline"}
            onClick={() => setVue("traites")}
          >
            Traités ({traites.length})
          </Button>
        </div>
      }
    >
      {reports.isPending ? (
        <p className="text-muted-foreground text-sm">Lecture des signalements…</p>
      ) : reports.isError ? (
        <p className="text-destructive text-sm">Signalements illisibles pour l'instant.</p>
      ) : visibles.length === 0 ? (
        <EmptyState>
          {vue === "ouverts" ? "Aucun signalement à traiter." : "Aucun signalement traité."}
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {visibles.map((r) => (
            <SignalementRow key={r.id} report={r} programId={programId} />
          ))}
        </ul>
      )}
    </PanelCard>
  );
}

function SignalementRow({
  report,
  programId,
}: {
  readonly report: QuestionReportRow;
  readonly programId: ProgramId;
}) {
  const dataAccess = useDataAccess();
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ouvert = estATraiter(report.status);

  async function decider(decision: QuestionReportDecision) {
    setBusy(true);
    setError(null);
    try {
      await dataAccess.assessments.resolveQuestionReport(report.id, decision, note);
      await queryClient.invalidateQueries({ queryKey: ["question-reports", programId] });
      setNote("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Décision impossible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="border-border rounded-md border p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs">{report.externalRef}</span>
        <Badge variant={report.status === "nouveau" ? "default" : "secondary"}>
          {STATUTS_SIGNALEMENT_FR[report.status] ?? report.status}
        </Badge>
        <Badge variant="outline">{libelleRaison(report.reason)}</Badge>
        {report.questionStatus !== "publiee" ? (
          <Badge variant="outline">question : {report.questionStatus}</Badge>
        ) : null}
        <span className="text-muted-foreground ml-auto text-xs">
          {report.reportedByName ?? "un étudiant"} · {formatFrDate(report.createdAt)}
        </span>
      </div>
      <p className="mt-2 line-clamp-3 whitespace-pre-line">{report.stem}</p>
      {report.message ? (
        <p className="text-muted-foreground mt-1 whitespace-pre-line text-xs">
          « {report.message} »
        </p>
      ) : null}

      {ouvert ? (
        <div className="mt-3 space-y-2">
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note pour l'équipe (facultative) — ce qui a été vérifié, corrigé, ou pourquoi c'est rejeté"
            rows={2}
            disabled={busy}
          />
          <div className="flex flex-wrap gap-2">
            {DECISIONS_SIGNALEMENT.filter(
              (d) => !(d.value === "en_revue" && report.status === "en_revue"),
            ).map((d) => (
              <Button
                key={d.value}
                size="sm"
                variant={d.value === "en_revue" ? "outline" : "secondary"}
                disabled={busy}
                title={d.aide}
                onClick={() => void decider(d.value)}
              >
                {d.label}
              </Button>
            ))}
          </div>
          {error ? <p className="text-destructive text-xs">{error}</p> : null}
        </div>
      ) : (
        <p className="text-muted-foreground mt-2 text-xs">
          {STATUTS_SIGNALEMENT_FR[report.status] ?? report.status}
          {report.handledByName ? ` par ${report.handledByName}` : ""}
          {report.handledAt ? ` le ${formatFrDate(report.handledAt)}` : ""}
          {report.resolution ? ` — ${report.resolution}` : ""}
        </p>
      )}
    </li>
  );
}

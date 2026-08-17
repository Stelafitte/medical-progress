import { useState } from "react";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, MockBadge, PanelCard, ScopeNotice } from "@/features/professional/mock-ui";
import { learnerName, useSupervision } from "@/features/supervision/useSupervision";
import { StageLogsToValidate } from "@/features/stage/StageLogReviewSection";
import { evaluateBulkValidation } from "@/domain/supervision";
import { useSession } from "@/application/session";

/**
 * Réutilise le module de carnet déjà livré (aucun second carnet) et y ajoute
 * le traitement rapide : validation unitaire, hebdomadaire groupée et finale.
 * Une validation groupée exige toujours la revue de la synthèse.
 */
export function SupervisionLogs() {
  const { rolesInActiveProgram } = useSession();
  const { data, isPending } = useSupervision();
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [summaryReviewed, setSummaryReviewed] = useState(false);
  const [comment, setComment] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);

  if (isPending || !data) return <Skeleton className="h-72 w-full" />;

  const decision = evaluateBulkValidation(rolesInActiveProgram, {
    selectedLogIds: selected,
    summaryReviewed,
  });

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <div className="space-y-8">
      <SectionHeading
        title="Carnets à valider"
        level={1}
        action={<MockBadge />}
        description="Décision unitaire, groupée hebdomadaire ou finale, sur vos stages uniquement."
      />

      <ScopeNotice>
        Vous ne voyez que les carnets rattachés à vos affectations. Les fragments photo autorisés
        sont consultables ; la plateforme ne garantit aucune anonymisation.
      </ScopeNotice>

      <StageLogsToValidate />

      <PanelCard
        title="Traitement rapide (groupé)"
        description="Sélection explicite, puis revue obligatoire de la synthèse avant toute validation groupée."
      >
        {data.logsToValidate.length === 0 ? (
          <EmptyState>Aucun carnet soumis en attente sur votre périmètre.</EmptyState>
        ) : (
          <>
            <ul className="space-y-2">
              {data.logsToValidate.map((log) => (
                <li key={log.id} className="flex flex-wrap items-center gap-3">
                  <Checkbox
                    id={`bulk-${log.id}`}
                    checked={selected.includes(log.id)}
                    onCheckedChange={() => {
                      toggle(log.id);
                      setSummaryReviewed(false);
                    }}
                  />
                  <label htmlFor={`bulk-${log.id}`} className="text-sm">
                    {learnerName(data, log.enrollmentId)} — {log.entries.length} entrée(s)
                  </label>
                  <Badge variant="outline" className="font-normal">
                    soumis
                  </Badge>
                </li>
              ))}
            </ul>

            {selected.length > 0 ? (
              <div className="space-y-3 rounded-md border border-border p-3">
                <p className="text-sm font-medium">
                  Synthèse des {selected.length} carnet(s) sélectionné(s)
                </p>
                <ul className="list-inside list-disc text-sm text-muted-foreground">
                  {data.logsToValidate
                    .filter((l) => selected.includes(l.id))
                    .map((l) => (
                      <li key={l.id}>
                        {learnerName(data, l.enrollmentId)} :{" "}
                        {l.entries.reduce((n, e) => n + e.photos.length, 0)} fragment(s) photo,{" "}
                        {l.entries.length} entrée(s)
                      </li>
                    ))}
                </ul>
                <div className="flex items-start gap-2">
                  <Checkbox
                    id="synthese-revue"
                    checked={summaryReviewed}
                    onCheckedChange={(v) => setSummaryReviewed(v === true)}
                  />
                  <label htmlFor="synthese-revue" className="text-sm">
                    J'ai revu la synthèse ci-dessus avant validation groupée
                  </label>
                </div>
              </div>
            ) : null}

            <div>
              <label htmlFor="motif-correction" className="mb-1 block text-sm font-medium">
                Motif (obligatoire pour une demande de correction)
              </label>
              <Textarea
                id="motif-correction"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Précisez ce qui doit être corrigé."
              />
            </div>

            {decision.reasons.length > 0 ? (
              <ul className="list-inside list-disc text-sm text-destructive">
                {decision.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={!decision.allowed}
                onClick={() =>
                  setFeedback(
                    `Démonstration : validation hebdomadaire groupée de ${selected.length} carnet(s) — aucune écriture réelle.`,
                  )
                }
              >
                Valider le lot (hebdomadaire)
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!decision.allowed}
                onClick={() =>
                  setFeedback(
                    "Démonstration : validation finale de fin de stage — aucune écriture réelle.",
                  )
                }
              >
                Validation finale
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={selected.length === 0 || comment.trim().length === 0}
                onClick={() =>
                  setFeedback("Démonstration : demande de correction motivée envoyée à l'étudiant.")
                }
              >
                Demander une correction motivée
              </Button>
            </div>
            {feedback ? <p className="text-sm text-muted-foreground">{feedback}</p> : null}
          </>
        )}
      </PanelCard>

      <PanelCard
        title="Historique des décisions"
        description="Journal simulé, conservé par carnet."
      >
        <ul className="space-y-2 text-sm text-muted-foreground">
          {data.logsToValidate.flatMap((log) =>
            log.validations.map((v) => (
              <li key={`${log.id}-${v.decidedAt}`}>
                {new Date(v.decidedAt).toLocaleDateString("fr-FR")} —{" "}
                {learnerName(data, log.enrollmentId)} :{" "}
                {v.decision === "validated" ? "validé" : "à corriger"}
                {v.comment ? ` · ${v.comment}` : ""}
              </li>
            )),
          )}
          {data.logsToValidate.every((l) => l.validations.length === 0) ? (
            <li>Aucune décision enregistrée dans cette démonstration.</li>
          ) : null}
        </ul>
      </PanelCard>
    </div>
  );
}

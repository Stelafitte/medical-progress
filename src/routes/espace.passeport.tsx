import { createFileRoute } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { MasteryBadge, NatureBadge } from "@/components/mastery-badge";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MASTERY_LABELS_FR } from "@/domain/mastery";
import type { EvidenceKind } from "@/domain/types";
import { useLearnerPassport } from "@/features/dashboard/useLearnerPassport";

const EVIDENCE_LABELS: Record<EvidenceKind, string> = {
  quiz: "QCM",
  real_activity: "Activité réelle",
  simulation: "Simulation / ECOS",
  placement: "Stage",
  human_validation: "Validation humaine",
};

export const Route = createFileRoute("/espace/passeport")({
  head: () => ({
    meta: [
      { title: "Passeport de compétences — Passeport Éducatif Médical" },
      {
        name: "description",
        content:
          "Preuves d'acquisition et niveaux de maîtrise par acquis : connaissance, compétence simulée, compétence réelle validée.",
      },
      { property: "og:title", content: "Passeport de compétences — Passeport Éducatif Médical" },
      {
        property: "og:description",
        content: "Preuves d'acquisition et niveaux de maîtrise par acquis d'apprentissage.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PassportPage,
});

function PassportPage() {
  const { data, isPending } = useLearnerPassport();

  if (isPending || !data) return <Skeleton className="h-96 w-full" />;

  return (
    <div className="space-y-6">
      <SectionHeading
        title="Passeport de compétences"
        level={1}
        description="Chaque acquis affiche son niveau de maîtrise, sa nature et les preuves qui le soutiennent. Données de démonstration."
      />

      <ul className="space-y-4">
        {data.progress.map((item) => {
          const related = data.evidence.filter((e) => e.outcomeId === item.outcome.id);
          return (
            <li key={item.outcome.id}>
              <Card>
                <CardHeader>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="font-mono text-xs">
                      {item.outcome.code}
                    </Badge>
                    <NatureBadge nature={item.outcome.nature} />
                    <MasteryBadge level={item.mastery} className="ms-auto" />
                  </div>
                  <CardTitle className="text-base">{item.outcome.label}</CardTitle>
                  <CardDescription>
                    {item.outcome.description} · Cible :{" "}
                    {MASTERY_LABELS_FR[item.outcome.targetMastery]}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {item.blockedBySelfDeclaration ? (
                    <p className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-foreground">
                      <ShieldAlert className="mt-0.5 size-4 text-warning" aria-hidden />
                      Compétence réelle : l'auto-déclaration ne suffit pas. Une validation par un
                      encadrant de stage est requise.
                    </p>
                  ) : null}

                  {related.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Aucune preuve enregistrée.</p>
                  ) : (
                    <ul className="divide-y divide-border">
                      {related.map((ev) => (
                        <li key={ev.id} className="flex flex-wrap items-center gap-2 py-2">
                          <Badge variant="outline" className="font-normal">
                            {EVIDENCE_LABELS[ev.kind]}
                          </Badge>
                          <span className="text-sm text-foreground">{ev.title}</span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(ev.occurredAt).toLocaleDateString("fr-FR")}
                          </span>
                          <span className="ms-auto flex items-center gap-2 text-xs">
                            {ev.selfDeclared ? (
                              <span className="text-warning">auto-déclarée</span>
                            ) : null}
                            <Badge
                              className={
                                ev.status === "validated"
                                  ? "border-transparent bg-success text-success-foreground"
                                  : "border-transparent bg-muted text-muted-foreground"
                              }
                            >
                              {ev.status === "validated" ? "validée" : ev.status}
                            </Badge>
                          </span>
                          {ev.validations.length > 0 ? (
                            <p className="w-full text-xs text-muted-foreground">
                              Validée par un encadrant :{" "}
                              {ev.validations[0]?.comment ?? "sans commentaire"}
                            </p>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

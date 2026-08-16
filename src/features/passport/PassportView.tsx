import { CheckCircle2, ShieldAlert, Target } from "lucide-react";
import { MasteryBadge, NatureBadge } from "@/components/mastery-badge";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MASTERY_LABELS_FR } from "@/domain/mastery";
import type { OutcomeProgress } from "@/domain/mastery";
import type { Evidence, EvidenceKind, OutcomeNature } from "@/domain/types";
import { useLearnerPassport } from "@/features/dashboard/useLearnerPassport";

const EVIDENCE_LABELS: Record<EvidenceKind, string> = {
  quiz: "QCM",
  real_activity: "Activité réelle",
  simulation: "Simulation (dont ECOS)",
  placement: "Stage",
  human_validation: "Validation humaine",
};

/** Les trois catégories visibles du passeport, alignées sur outcome.nature. */
const CATEGORIES: ReadonlyArray<{
  nature: OutcomeNature;
  id: string;
  title: string;
  description: string;
}> = [
  {
    nature: "knowledge",
    id: "categorie-connaissances",
    title: "Connaissances",
    description: "Ce que je sais.",
  },
  {
    nature: "simulated_competence",
    id: "categorie-simulees",
    title: "Compétences simulées",
    description:
      "Ce que je sais faire en situation simulée (simulation, ECOS et autres modalités).",
  },
  {
    nature: "real_competence",
    id: "categorie-reelles",
    title: "Compétences réelles",
    description: "Ce que je réalise en situation clinique, toujours validé par un encadrant.",
  },
];

function OutcomeCard({ item, evidence }: { item: OutcomeProgress; evidence: readonly Evidence[] }) {
  const related = evidence.filter((e) => e.outcomeId === item.outcome.id);

  return (
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
          {item.outcome.description} · Cible : {MASTERY_LABELS_FR[item.outcome.targetMastery]}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {item.blockedBySelfDeclaration ? (
          <p className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-foreground">
            <ShieldAlert className="mt-0.5 size-4 text-warning" aria-hidden />
            Compétence réelle : l'auto-déclaration ne suffit pas. Une validation par un encadrant de
            stage est requise.
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
                  {ev.selfDeclared ? <span className="text-warning">auto-déclarée</span> : null}
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
                    Validée par un encadrant : {ev.validations[0]?.comment ?? "sans commentaire"}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function PassportView() {
  const { data, isPending } = useLearnerPassport();

  if (isPending || !data) return <Skeleton className="h-96 w-full" />;

  const { progress, evidence, summary } = data;
  const nextSteps = progress.filter((p) => !p.meetsTarget).slice(0, 4);
  const validatedCount = evidence.filter((e) => e.status === "validated").length;

  return (
    <div className="space-y-10">
      <SectionHeading
        title="Mon Passeport Éducatif Médical"
        level={1}
        description="Connaissances, compétences simulées et compétences en situation réelle"
      />

      <section aria-labelledby="titre-deux-questions" className="space-y-4">
        <h2 id="titre-deux-questions" className="sr-only">
          Synthèse du passeport
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CheckCircle2 className="size-5 text-success" aria-hidden />
              <CardTitle className="text-base">Qu'ai-je acquis ?</CardTitle>
              <CardDescription>
                {summary.atTarget} / {summary.total} acquis au niveau cible ·{" "}
                {summary.percentAtTarget} % · {validatedCount} preuve(s) validée(s).
              </CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <Target className="size-5 text-primary" aria-hidden />
              <CardTitle className="text-base">Que dois-je faire maintenant ?</CardTitle>
              <CardDescription>
                {nextSteps.length === 0
                  ? "Tous les acquis du référentiel sont au niveau cible."
                  : "Prochains jalons à travailler :"}
              </CardDescription>
            </CardHeader>
            {nextSteps.length > 0 ? (
              <CardContent>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {nextSteps.map((item) => (
                    <li key={item.outcome.id}>
                      <span className="font-mono text-xs">{item.outcome.code}</span>{" "}
                      {item.outcome.label}
                    </li>
                  ))}
                </ul>
              </CardContent>
            ) : null}
          </Card>
        </div>
      </section>

      {CATEGORIES.map((category) => {
        const items = progress.filter((p) => p.outcome.nature === category.nature);
        return (
          <section key={category.nature} aria-labelledby={category.id}>
            <SectionHeading
              id={category.id}
              title={category.title}
              description={category.description}
              action={
                <Badge variant="outline" className="font-normal">
                  {items.filter((i) => i.meetsTarget).length} / {items.length} au niveau cible
                </Badge>
              }
            />
            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Aucun acquis de cette catégorie dans ce programme.
              </p>
            ) : (
              <ul className="space-y-4">
                {items.map((item) => (
                  <li key={item.outcome.id}>
                    <OutcomeCard item={item} evidence={evidence} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

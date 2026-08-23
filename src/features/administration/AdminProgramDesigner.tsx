/**
 * « Concepteur de programme » — le MODÈLE réutilisable du programme.
 *
 * Cet écran ne contient aucune donnée datée d'une promotion : identité,
 * versions de référentiel, objectifs par nature, chronologie type et modèles
 * de carnet de stage. Le rappel des trois étapes de travail n'apparaît que
 * sur cet écran (aucune redite ailleurs).
 */
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BadgeCheck,
  BookOpen,
  ClipboardCheck,
  Layers,
  Milestone,
  Notebook,
} from "lucide-react";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, MockBadge, PanelCard, ScopeNotice } from "@/features/professional/mock-ui";
import { AdminWorkLevelBanner } from "@/features/administration/AdminWorkLevel";
import { useProgramAdmin } from "@/features/administration/useProgramAdmin";
import { formatFrDate } from "@/features/administration/adminProgramViewModel";
import { NATURE_LABELS_FR } from "@/domain/mastery";

const NATURES = ["knowledge", "simulated_competence", "real_competence"] as const;

const NATURE_ROUTES: Record<(typeof NATURES)[number], { to: string; label: string }> = {
  knowledge: { to: "/espace/administration/connaissances", label: "Base de connaissances" },
  simulated_competence: { to: "/espace/administration/competences", label: "Compétences" },
  real_competence: { to: "/espace/administration/competences", label: "Compétences" },
};

export function AdminProgramDesigner() {
  const { data, isPending } = useProgramAdmin();
  if (isPending || !data) return <Skeleton className="h-80 w-full" />;

  const cohorts = data.cohorts;
  const byNature = (nature: string) => data.outcomes.filter((o) => o.nature === nature);

  return (
    <div className="space-y-6">
      <SectionHeading
        title="Concepteur de programme"
        level={1}
        action={<MockBadge />}
        description="Définissez une seule fois le modèle pédagogique : référentiel, objectifs, chronologie type et carnets."
      />

      <AdminWorkLevelBanner
        level="program"
        programName={data.program?.name ?? "Programme sélectionné"}
        cohortCount={cohorts.length}
      />

      <ScopeNotice>
        Rien n'est daté ici. Les dates, inscriptions et suivis appartiennent à l'onglet « Pilotage de
        programme », promotion par promotion.
      </ScopeNotice>

      {/* Carte d'identité du modèle */}
      <section className="border-border bg-card rounded-lg border p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-muted-foreground text-xs uppercase tracking-wide">
              Modèle de programme
            </p>
            <h2 className="truncate text-lg font-semibold">{data.program?.name ?? "Programme"}</h2>
            <p className="text-muted-foreground text-sm">
              {data.program?.institution ?? ""} · {data.program?.code ?? ""} · ≈{" "}
              {data.program?.annualLearnerEstimate ?? 0} apprenants/an
            </p>
          </div>
          <Badge variant="outline" className="font-normal">
            {cohorts.length} promotion(s) rejouent ce modèle
          </Badge>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { icon: Layers, label: "Versions de référentiel", value: data.versions.length },
            { icon: BadgeCheck, label: "Objectifs et compétences", value: data.outcomes.length },
            { icon: Milestone, label: "Jalons type", value: data.planSchedule.length },
            { icon: ClipboardCheck, label: "Modèles de carnet", value: data.templates.length },
          ].map(({ icon: Icon, label, value }) => (
            <div key={label} className="border-border rounded-md border p-3">
              <Icon className="text-muted-foreground size-4" aria-hidden />
              <dd className="mt-1 text-2xl font-semibold tabular-nums">{value}</dd>
              <dt className="text-muted-foreground text-xs">{label}</dt>
            </div>
          ))}
        </dl>
      </section>

      <PanelCard
        title="Versions de référentiel"
        description="Une version encadre les objectifs et les promotions qui s'y rattachent."
      >
        {data.versions.length === 0 ? (
          <EmptyState>Aucune version de référentiel.</EmptyState>
        ) : (
          <ol className="space-y-2">
            {data.versions.map((version) => (
              <li
                key={version.id}
                className="border-border flex flex-wrap items-center gap-2 rounded-md border p-3 text-sm"
              >
                <span className="font-medium">{version.label}</span>
                <Badge variant="outline" className="font-normal">
                  {version.status}
                </Badge>
                <span className="text-muted-foreground">
                  en vigueur depuis {formatFrDate(version.effectiveFrom)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </PanelCard>

      <PanelCard
        title="Objectifs du programme, par nature"
        description="Connaissance, compétence simulée et compétence en situation réelle ne se prouvent pas de la même façon."
      >
        <div className="grid gap-3 md:grid-cols-3">
          {NATURES.map((nature) => {
            const route = NATURE_ROUTES[nature];
            return (
              <article key={nature} className="border-border rounded-md border p-4">
                <p className="text-sm font-medium">{NATURE_LABELS_FR[nature]}</p>
                <p className="mt-1 text-3xl font-semibold tabular-nums">
                  {byNature(nature).length}
                </p>
                <p className="text-muted-foreground mt-1 text-xs">
                  {nature === "knowledge"
                    ? "Preuves par supports et QCM"
                    : nature === "simulated_competence"
                      ? "Preuves par simulation et ECOS"
                      : "Validation humaine obligatoire"}
                </p>
                <Button asChild variant="ghost" size="sm" className="mt-3 min-h-11 px-0">
                  <Link to={route.to}>
                    {route.label}
                    <ArrowRight className="ms-1 size-4" aria-hidden />
                  </Link>
                </Button>
              </article>
            );
          })}
        </div>
      </PanelCard>

      <PanelCard
        title="Chronologie type"
        description="Jalons réutilisables, exprimés indépendamment des dates d'une promotion."
      >
        {data.planSchedule.length === 0 ? (
          <EmptyState>Aucun jalon type défini.</EmptyState>
        ) : (
          <ol className="border-border space-y-0 border-s ps-4">
            {data.planSchedule.map((entry) => (
              <li key={`${entry.outcomeId}-${entry.dueOn}`} className="relative py-3">
                <span
                  aria-hidden
                  className="bg-primary absolute -start-[1.3rem] top-5 size-2 rounded-full"
                />
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium">{entry.milestoneLabel}</span>
                  {entry.official ? (
                    <Badge variant="secondary" className="font-normal">
                      échéance institutionnelle
                    </Badge>
                  ) : null}
                  <span className="text-muted-foreground font-mono text-xs">
                    {formatFrDate(entry.startsOn)} → {formatFrDate(entry.dueOn)}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        )}
      </PanelCard>

      <PanelCard
        title="Poursuivre la conception"
        description="Les contenus détaillés vivent dans leurs écrans dédiés."
      >
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" className="min-h-11">
            <Link to="/espace/administration/connaissances">
              <BookOpen className="me-1 size-4" aria-hidden />
              Base de connaissances
            </Link>
          </Button>
          <Button asChild variant="outline" className="min-h-11">
            <Link to="/espace/administration/competences">Compétences</Link>
          </Button>
          <Button asChild variant="outline" className="min-h-11">
            <Link to="/espace/administration/evaluations">Évaluations</Link>
          </Button>
          <Button asChild variant="outline" className="min-h-11">
            <Link to="/espace/administration/stages">
              <Notebook className="me-1 size-4" aria-hidden />
              Stages : type, lieu, dates, validation (dont carnet)
            </Link>
          </Button>
          <Button asChild variant="outline" className="min-h-11">
            <Link to="/espace/administration/pilotage">
              Pilotage de programme
              <ArrowRight className="ms-1 size-4" aria-hidden />
            </Link>
          </Button>
        </div>
      </PanelCard>
    </div>
  );
}

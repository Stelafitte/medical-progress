/**
 * « Gestion des stages » — éléments GÉNÉRAUX des stages du programme.
 *
 * Écran de programme (non daté par apprenant) : types de stage, lieux,
 * périodes types, modes de validation (dont le carnet de stage) et modèles de
 * carnet. Maquette : aucune écriture réelle.
 */
import { Building2, CalendarRange, ClipboardCheck, MapPin, Notebook, Users } from "lucide-react";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, MockBadge, PanelCard, ScopeNotice } from "@/features/professional/mock-ui";

import { StageLogTemplatesSection } from "@/features/administration/StageLogTemplatesSection";
import { useProgramAdmin } from "@/features/administration/useProgramAdmin";
import { formatFrDate } from "@/features/administration/adminProgramViewModel";

/** Modes de validation d'un stage, indépendants d'une promotion. */
const VALIDATION_MODES = [
  {
    label: "Carnet de stage",
    detail: "Activités consignées par l'apprenant, contresignées par l'encadrant.",
    icon: Notebook,
  },
  {
    label: "Bilan d'encadrement",
    detail: "Entretien de fin de stage et appréciation écrite du responsable.",
    icon: ClipboardCheck,
  },
  {
    label: "Validation de compétence réelle",
    detail: "Toujours prononcée par un validateur humain, jamais par l'apprenant.",
    icon: Users,
  },
] as const;

export function AdminStages() {
  const { data, isPending } = useProgramAdmin();
  if (isPending || !data) return <Skeleton className="h-80 w-full" />;

  const placements = data.placements;
  const assignments = data.assignments;
  const sites = Array.from(new Set(placements.map((p) => p.site)));
  const capacity = placements.reduce((total, p) => total + p.capacity, 0);

  return (
    <div className="space-y-6">
      <SectionHeading
        title="Gestion des stages"
        level={1}
        action={<MockBadge />}
        description="Cadre général des stages du programme : types, lieux, périodes et modes de validation."
      />


      <ScopeNotice>
        Les affectations nominatives d'une promotion se règlent dans « Pilotage de programme ». Ici,
        on décrit ce qu'est un stage dans <strong>{data.program?.name}</strong>.
      </ScopeNotice>

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { icon: Building2, label: "Terrains de stage", value: placements.length },
          { icon: MapPin, label: "Lieux distincts", value: sites.length },
          { icon: Users, label: "Places totales", value: capacity },
          { icon: CalendarRange, label: "Affectations connues", value: assignments.length },
        ].map(({ icon: Icon, label, value }) => (
          <div key={label} className="border-border bg-card rounded-md border p-3">
            <Icon className="text-muted-foreground size-4" aria-hidden />
            <dd className="mt-1 text-2xl font-semibold tabular-nums">{value}</dd>
            <dt className="text-muted-foreground text-xs">{label}</dt>
          </div>
        ))}
      </dl>

      <PanelCard
        title="Types de stage et lieux"
        description="Un type de stage décrit un terrain, un service et une capacité d'accueil."
      >
        {placements.length === 0 ? (
          <EmptyState>Aucun terrain de stage déclaré pour ce programme.</EmptyState>
        ) : (
          <ul className="space-y-2 text-sm">
            {placements.map((placement) => (
              <li
                key={placement.id}
                className="border-border flex flex-wrap items-center gap-2 rounded-md border p-3"
              >
                <span className="font-medium">{placement.name}</span>
                <Badge variant="outline" className="font-normal">
                  {placement.department}
                </Badge>
                <span className="text-muted-foreground">
                  <MapPin className="me-1 inline size-3" aria-hidden />
                  {placement.site}
                </span>
                <span className="text-muted-foreground text-xs">
                  {placement.capacity} place(s)
                </span>
              </li>
            ))}
          </ul>
        )}
      </PanelCard>

      <PanelCard
        title="Périodes de stage"
        description="Dates observées sur les affectations existantes, toutes promotions confondues."
      >
        {assignments.length === 0 ? (
          <EmptyState>Aucune période de stage enregistrée.</EmptyState>
        ) : (
          <ul className="space-y-2 text-sm">
            {assignments.map((assignment) => {
              const placement = placements.find((p) => p.id === assignment.placementId);
              return (
                <li
                  key={assignment.id}
                  className="border-border flex flex-wrap items-center gap-2 rounded-md border p-3"
                >
                  <span className="font-mono text-xs">
                    {formatFrDate(assignment.startsOn)} → {formatFrDate(assignment.endsOn)}
                  </span>
                  <span className="font-medium">{placement?.name ?? assignment.placementId}</span>
                  <Badge variant="secondary" className="font-normal">
                    {assignment.status}
                  </Badge>
                </li>
              );
            })}
          </ul>
        )}
      </PanelCard>

      <PanelCard
        title="Types de validation"
        description="Ce qui permet de considérer un stage comme accompli."
      >
        <div className="grid gap-3 md:grid-cols-3">
          {VALIDATION_MODES.map(({ label, detail, icon: Icon }) => (
            <article key={label} className="border-border rounded-md border p-4">
              <Icon className="text-muted-foreground size-4" aria-hidden />
              <p className="mt-2 text-sm font-medium">{label}</p>
              <p className="text-muted-foreground mt-1 text-xs">{detail}</p>
            </article>
          ))}
        </div>
      </PanelCard>

      <StageLogTemplatesSection />
    </div>
  );
}

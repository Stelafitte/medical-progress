import { useMemo, useState } from "react";
import { CheckCircle2, Target } from "lucide-react";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  APPROVAL_RULE_LABELS_FR,
  IMPACT_LABELS_FR,
  PLAN_CHANGE_STATUS_LABELS_FR,
  TRACK_LABELS_FR,
  approvalRuleForImpact,
  type AcquisitionPlanItem,
  type PlanChangeImpact,
  type PlanChangeRequest,
} from "@/domain/acquisitionPlan";
import { useLearnerPassport } from "@/features/dashboard/useLearnerPassport";
import { PlanChangeRequestDialog } from "./PlanChangeRequestDialog";
import { CalendarView } from "./views/CalendarView";
import { GanttView } from "./views/GanttView";
import { KanbanView } from "./views/KanbanView";
import { ListView } from "./views/ListView";

type PassportViewMode = "list" | "kanban" | "gantt" | "calendar";

const VIEW_TABS: ReadonlyArray<{ value: PassportViewMode; label: string }> = [
  { value: "list", label: "Liste" },
  { value: "kanban", label: "Kanban" },
  { value: "gantt", label: "Gantt" },
  { value: "calendar", label: "Calendrier" },
];

type PlanFilter = "all" | "knowledge" | "simulated_competence" | "real_competence";

const FILTERS: ReadonlyArray<{ value: PlanFilter; label: string }> = [
  { value: "all", label: "Tout le plan d'acquisition" },
  { value: "knowledge", label: "Connaissances" },
  { value: "simulated_competence", label: "Compétences — simulées" },
  { value: "real_competence", label: "Compétences — réelles" },
];

const IMPACTS: readonly PlanChangeImpact[] = [
  "personal_pace",
  "official_deadline",
  "clinical_competence",
];

export function PassportView() {
  const { data, isPending } = useLearnerPassport();
  const [view, setView] = useState<PassportViewMode>("list");
  const [filter, setFilter] = useState<PlanFilter>("all");
  const [dialogItem, setDialogItem] = useState<AcquisitionPlanItem | null>(null);
  const [requests, setRequests] = useState<readonly PlanChangeRequest[]>([]);

  const plan = data?.plan;

  const filteredItems = useMemo(
    () => (plan?.items ?? []).filter((item) => filter === "all" || item.nature === filter),
    [plan, filter],
  );

  const filteredEvents = useMemo(
    () => (plan?.events ?? []).filter((event) => filter === "all" || event.nature === filter),
    [plan, filter],
  );

  if (isPending || !data || !plan) return <Skeleton className="h-96 w-full" />;

  const { progress, evidence, summary } = data;
  const nextSteps = plan.items.filter((i) => i.stage !== "acquired").slice(0, 4);
  const validatedCount = evidence.filter((e) => e.status === "validated").length;

  return (
    <div className="space-y-10">
      <SectionHeading
        title="Mon Passeport Éducatif"
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
                    <li key={item.id}>
                      <span className="font-mono text-xs">{item.code}</span> {item.milestoneLabel} —{" "}
                      {new Date(item.dueOn).toLocaleDateString("fr-FR")}
                    </li>
                  ))}
                </ul>
              </CardContent>
            ) : null}
          </Card>
        </div>
      </section>

      <section aria-labelledby="titre-plan" className="space-y-4">
        <SectionHeading
          id="titre-plan"
          title="Plan d'acquisition"
          description="Une seule source de données, quatre représentations. Les plans connaissances et compétences sont distingués par filtre."
          action={<Badge variant="outline">Prototype — non enregistré</Badge>}
        />

        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1">
            <Label htmlFor="filtre-plan">Filtrer le plan</Label>
            <Select value={filter} onValueChange={(value) => setFilter(value as PlanFilter)}>
              <SelectTrigger id="filtre-plan" className="w-72">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FILTERS.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-sm text-muted-foreground">
            {filter === "knowledge"
              ? TRACK_LABELS_FR.knowledge
              : filter === "all"
                ? `${TRACK_LABELS_FR.knowledge} et ${TRACK_LABELS_FR.competence.toLowerCase()}`
                : TRACK_LABELS_FR.competence}{" "}
            · {filteredItems.length} élément(s)
          </p>
        </div>

        <Tabs value={view} onValueChange={(value) => setView(value as PassportViewMode)}>
          <TabsList aria-label="Choisir une vue du passeport">
            {VIEW_TABS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="list" className="mt-6">
            <ListView
              progress={progress}
              planItems={filteredItems}
              evidence={evidence}
              onProposeChange={setDialogItem}
            />
          </TabsContent>
          <TabsContent value="kanban" className="mt-6">
            <KanbanView items={filteredItems} onProposeChange={setDialogItem} />
          </TabsContent>
          <TabsContent value="gantt" className="mt-6">
            <GanttView items={filteredItems} range={plan.range} />
          </TabsContent>
          <TabsContent value="calendar" className="mt-6">
            <CalendarView events={filteredEvents} />
          </TabsContent>
        </Tabs>
      </section>

      <section aria-labelledby="titre-regles" className="space-y-4">
        <SectionHeading
          id="titre-regles"
          title="Modifier mon plan : règles de validation"
          description="Prototype : aucune demande n'est enregistrée ni transmise."
        />
        <ul className="grid gap-3 md:grid-cols-3">
          {IMPACTS.map((impact) => (
            <li key={impact} className="rounded-lg border border-border bg-card p-4">
              <p className="text-sm font-medium">{IMPACT_LABELS_FR[impact]}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {APPROVAL_RULE_LABELS_FR[approvalRuleForImpact(impact)]}
              </p>
            </li>
          ))}
        </ul>

        <div>
          <h3 className="mb-2 text-sm font-semibold">Mes demandes simulées</h3>
          {requests.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucune demande. Utilisez « Proposer une modification » sur un élément planifié.
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border bg-card">
              {requests.map((request) => {
                const item = plan.items.find((i) => i.id === request.itemId);
                return (
                  <li key={request.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
                    <span className="font-mono text-xs">{item?.code ?? request.itemId}</span>
                    <span className="text-sm">
                      {request.requestedDate
                        ? `Nouvelle date : ${new Date(request.requestedDate).toLocaleDateString("fr-FR")}`
                        : `Nouveau rythme : ${request.requestedPace}`}
                    </span>
                    <Badge variant="secondary">
                      {PLAN_CHANGE_STATUS_LABELS_FR[request.status]}
                    </Badge>
                    <Badge variant="outline" className="ms-auto font-normal">
                      {APPROVAL_RULE_LABELS_FR[request.approvalRule]}
                    </Badge>
                    <p className="w-full text-xs text-muted-foreground">
                      Justification : {request.justification} · Demande simulée, non enregistrée.
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            Statuts prévus : {Object.values(PLAN_CHANGE_STATUS_LABELS_FR).join(" · ")}.
          </p>
        </div>
      </section>

      <PlanChangeRequestDialog
        item={dialogItem}
        onClose={() => setDialogItem(null)}
        onCreate={(request) => setRequests((prev) => [request, ...prev])}
      />
    </div>
  );
}

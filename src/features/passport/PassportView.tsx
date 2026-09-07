import { useMemo, useState } from "react";
import { CheckCircle2, Target } from "lucide-react";
import { useSession } from "@/application/session";
import { FieldHeader } from "@/components/field-header";
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

type PassportViewMode = "kanban" | "gantt" | "calendar";

/**
 * ORDRE ET SELECTION DES VUES, decides par Stef le 03/09 : Calendrier d'abord,
 * puis Gantt, puis Kanban — du plus proche du temps vecu au plus proche de
 * l'etat d'avancement. Et **la Liste est retiree** : elle rendait les
 * 368 acquis a plat, alors que les trois autres vues disent la meme chose en
 * les regroupant. `ListView` reste dans le depot, sans onglet.
 */
const VIEW_TABS: ReadonlyArray<{ value: PassportViewMode; label: string }> = [
  { value: "calendar", label: "Calendrier" },
  { value: "gantt", label: "Gantt" },
  { value: "kanban", label: "Kanban" },
];

type PlanFilter = "all" | "knowledge" | "competence";

const FILTERS: ReadonlyArray<{ value: PlanFilter; label: string }> = [
  { value: "all", label: "Tout mon parcours" },
  { value: "knowledge", label: "Connaissances théoriques" },
  { value: "competence", label: "Compétences" },
];

const IMPACTS: readonly PlanChangeImpact[] = [
  "personal_pace",
  "official_deadline",
  "clinical_competence",
];

export function PassportView() {
  const { activeProgram } = useSession();
  const { data, isPending } = useLearnerPassport();
  const [view, setView] = useState<PassportViewMode>("calendar");
  const [filter, setFilter] = useState<PlanFilter>("all");
  const [dialogItem, setDialogItem] = useState<AcquisitionPlanItem | null>(null);
  const [requests, setRequests] = useState<readonly PlanChangeRequest[]>([]);

  const plan = data?.plan;

  const filteredItems = useMemo(
    () =>
      (plan?.items ?? []).filter(
        (item) =>
          filter === "all" ||
          (filter === "knowledge" ? item.nature === "knowledge" : item.nature !== "knowledge"),
      ),
    [plan, filter],
  );

  const filteredEvents = useMemo(
    () =>
      (plan?.events ?? []).filter(
        (event) =>
          filter === "all" ||
          // Un jalon porte souvent les deux natures : il reste visible des qu'il
          // en porte une qui correspond au filtre.
          event.natures.some((nature) =>
            filter === "knowledge" ? nature === "knowledge" : nature !== "knowledge",
          ),
      ),
    [plan, filter],
  );

  if (isPending || !data || !plan) return <Skeleton className="h-96 w-full" />;

  const { evidence, summary } = data;
  /*
   * « Que dois-je faire maintenant ? » repond avec des JALONS, pas avec des
   * acquis. Un jalon porte souvent une dizaine d'acquis : les lister un par un
   * remplissait la carte de quatre lignes portant le meme libelle et la meme
   * date — le doublon vu le 03/09. On regroupe donc par jalon, on compte ce
   * qu'il reste a y faire, et on garde les quatre prochains. Les items sont
   * deja tries echeance croissante.
   */
  const prochainsJalons = new Map<string, { label: string; dueOn: string; restants: number }>();
  for (const item of plan.items) {
    if (item.stage === "acquired" || !item.dueOn || !item.milestoneLabel) continue;
    const cle = `${item.milestoneLabel}|${item.dueOn}`;
    const jalon = prochainsJalons.get(cle) ?? {
      label: item.milestoneLabel,
      dueOn: item.dueOn,
      restants: 0,
    };
    jalon.restants += 1;
    prochainsJalons.set(cle, jalon);
  }
  const nextSteps = [...prochainsJalons.entries()]
    .map(([cle, jalon]) => ({ cle, ...jalon }))
    .slice(0, 4);
  const nonPlanifies = plan.items.filter((i) => !i.dueOn).length;
  const validatedCount = evidence.filter((e) => e.status === "validated").length;

  return (
    <div className="space-y-10">
      {/*
        LES DEUX CHIFFRES QUI COMPTENT sur cet ecran : ce que porte le
        programme, et en combien de jalons il est decoupe. Le nombre de jalons
        est compte sur les LIBELLES DISTINCTS du retroplanning — c'est la
        confusion exacte qui avait produit « Jalons restants : 367 » sur
        l'ecran de progression.
      */}
      <FieldHeader
        eyebrow={activeProgram.name}
        title="Mon Passeport Éducatif"
        figures={[
          { value: summary.total, label: "acquis" },
          {
            value: new Set(
              plan.items.filter((i) => i.milestoneLabel !== null).map((i) => i.milestoneLabel),
            ).size,
            label: "jalons",
          },
        ]}
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
                  ? "Aucun jalon à venir sur les acquis qui vous restent."
                  : "Prochains jalons à travailler :"}
              </CardDescription>
            </CardHeader>
            {nextSteps.length > 0 ? (
              <CardContent>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {nextSteps.map((jalon) => (
                    <li key={jalon.cle}>
                      {jalon.label} — {new Date(jalon.dueOn).toLocaleDateString("fr-FR")} ·{" "}
                      {jalon.restants} acquis à travailler
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
          title="Mon parcours dans le temps"
          description="Mes objectifs et mes échéances, des prochaines actions jusqu'aux jalons du semestre."
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
              ? "Connaissances théoriques"
              : filter === "all"
                ? "Connaissances théoriques et compétences"
                : "Compétences"}{" "}
            · {filteredItems.length} élément(s)
          </p>
          {nonPlanifies > 0 ? (
            <p className="text-sm text-muted-foreground">
              Dont {nonPlanifies} sans jalon — non planifié(s).
            </p>
          ) : null}
        </div>

        <Tabs value={view} onValueChange={(value) => setView(value as PassportViewMode)}>
          <TabsList aria-label="Choisir une vue du passeport">
            {VIEW_TABS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="calendar" className="mt-6">
            <CalendarView events={filteredEvents} items={plan.items} />
          </TabsContent>
          <TabsContent value="gantt" className="mt-6">
            <GanttView items={filteredItems} range={plan.range} />
          </TabsContent>
          <TabsContent value="kanban" className="mt-6">
            <KanbanView
              items={filteredItems}
              themes={data.themes}
              onProposeChange={setDialogItem}
            />
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
      {/*
        LE DRAPEAU EST RETROGRADE EN PETIT LIBELLE DE PIED DE PAGE. En badge
        d'en-tete de section il criait plus fort que le contenu ; il doit se
        lire, pas dominer.
      */}
      <p className="pt-2 text-center text-[11.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        Prototype — non enregistré
      </p>
    </div>
  );
}

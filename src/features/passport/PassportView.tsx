import { useMemo, useState } from "react";
import { Check } from "lucide-react";
import { useSession } from "@/application/session";
import { FieldHeader } from "@/components/field-header";
import {
  EYEBROW,
  FOND_CONNAISSANCE,
  MilestoneHeading,
  TABULAIRE,
} from "@/components/milestone-heading";
import { Badge } from "@/components/ui/badge";
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
import type { OutcomeThemeId } from "@/domain/types";
import { buildDomainColors } from "@/features/dashboard/domainColor";
import { useLearnerPassport } from "@/features/dashboard/useLearnerPassport";
import { useReamenagementDuPlan } from "@/features/passport/useReamenagementDuPlan";
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

/** Le titre de section de la vue d'ensemble : serif, pas de chapeau sous lui. */
const TITRE_SECTION = "mb-3 font-display text-[21px] font-medium tracking-[-0.015em]";

function dateCourte(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}

export function PassportView() {
  const { activeProgram } = useSession();
  const { data, isPending } = useLearnerPassport();
  const [view, setView] = useState<PassportViewMode>("calendar");
  const [filter, setFilter] = useState<PlanFilter>("all");
  const [dialogItem, setDialogItem] = useState<AcquisitionPlanItem | null>(null);
  const [requests, setRequests] = useState<readonly PlanChangeRequest[]>([]);
  /*
   * `undefined` tant que le programme n'ouvre pas le reamenagement : le Gantt
   * reste alors le diagramme de lecture qu'il a toujours ete.
   */
  const reamenagement = useReamenagementDuPlan(data?.shifts);

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
  const couleurParTheme = buildDomainColors(data.themes, data.outcomes);
  /*
   * LE MEME RESOLVEUR POUR TOUT L'ECRAN. La carte de synthese, le Calendrier,
   * le Gantt et le Kanban parlent des memes jalons : ils doivent en donner la
   * meme couleur. On le calcule ici, une fois, et on le fait descendre — plutot
   * que quatre appels a `buildDomainColors` qui pourraient diverger.
   *
   * L'IDENTIFIANT ARRIVE EN `string` des vues (`ThemeGroup.key`, qui vaut soit
   * un identifiant de theme, soit « hors chapitre »). La marque de type est
   * retablie ici, au seul endroit ou la provenance est connue.
   */
  const couleurDe = (themeId: string | undefined) =>
    themeId === undefined
      ? FOND_CONNAISSANCE
      : (couleurParTheme.get(themeId as OutcomeThemeId) ?? FOND_CONNAISSANCE);

  /*
   * « Que dois-je faire maintenant ? » repond avec des JALONS, pas avec des
   * acquis. Un jalon porte souvent une dizaine d'acquis : les lister un par un
   * remplissait la carte de quatre lignes portant le meme libelle et la meme
   * date — le doublon vu le 03/09. On regroupe donc par jalon, on compte ce
   * qu'il reste a y faire, et on garde les quatre prochains. Les items sont
   * deja tries echeance croissante.
   *
   * TROIS ETATS, PAS DEUX (meme correction que sur la vue d'ensemble, 08/09).
   * Cette liste ne sautait que `acquired`. Or declarer une COMPETENCE REELLE
   * ne fait pas monter le niveau : l'acquis passe en `to_validate` et attend
   * l'encadrant. Il restait donc compte comme « a travailler », et un jalon
   * entierement declare s'affichait a son plein volume, indefiniment — c'est
   * exactement la liste figee que Stef avait vue. On distingue desormais ce
   * qui reste A FAIRE de ce qui attend une contresignature, sans toucher a
   * l'invariant : une declaration ne vaut toujours pas acquisition.
   */
  const parJalon = new Map<
    string,
    { label: string; dueOn: string; items: AcquisitionPlanItem[] }
  >();
  for (const item of plan.items) {
    if (item.dueOn === null || item.milestoneLabel === null) continue;
    const cle = `${item.milestoneLabel}|${item.dueOn}`;
    const jalon = parJalon.get(cle) ?? {
      label: item.milestoneLabel,
      dueOn: item.dueOn,
      items: [],
    };
    jalon.items.push(item);
    parJalon.set(cle, jalon);
  }
  const nextSteps = [...parJalon.entries()]
    .map(([cle, jalon]) => {
      const restants = jalon.items.filter((item) => item.stage !== "acquired");
      const aValider = restants.filter((item) => item.stage === "to_validate");
      const aFaire = restants.filter((item) => item.stage !== "to_validate");
      const comptes = new Map<OutcomeThemeId, number>();
      for (const item of jalon.items) {
        if (item.themeId === undefined) continue;
        comptes.set(item.themeId, (comptes.get(item.themeId) ?? 0) + 1);
      }
      const dominant = [...comptes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      return {
        cle,
        label: jalon.label,
        dueOn: jalon.dueOn,
        total: jalon.items.length,
        acquis: jalon.items.length - restants.length,
        aValider: aValider.length,
        aFaire: aFaire.length,
        /* Un jalon de connaissances est en marine : la teinte ne dit qu'un
           domaine de COMPETENCE, et un chapitre n'en est pas un. */
        couleur:
          dominant === undefined
            ? FOND_CONNAISSANCE
            : (couleurParTheme.get(dominant) ?? FOND_CONNAISSANCE),
      };
    })
    .filter((jalon) => jalon.aFaire > 0)
    .slice(0, 4);

  const nonPlanifies = plan.items.filter((i) => !i.dueOn).length;
  const validatedCount = evidence.filter((e) => e.status === "validated").length;
  const enAttenteGlobal = plan.items.filter((item) => item.stage === "to_validate").length;

  return (
    <div className="space-y-7">
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

      {/*
        LA CARTE DE SYNTHESE, SOULEVEE SUR LE BANDEAU — meme geste que la carte
        du prochain jalon sur la vue d'ensemble, meme classe.

        ELLE REMPLACE LES DEUX CARTES A ICONES. « Qu'ai-je acquis ? » et « Que
        dois-je faire ? » y tenaient chacune une phrase grise sous une icone
        verte ou bleue : deux couleurs qui ne designaient aucun domaine, dans
        une application ou la teinte ne dit que cela. Le chiffre et les jalons
        se lisent maintenant dans l'anatomie de la vue d'ensemble.
      */}
      <section
        aria-labelledby="titre-synthese"
        className="-mt-[38px] overflow-hidden rounded-xl border bg-card shadow-[var(--shadow-card)]"
      >
        <h2 id="titre-synthese" className="sr-only">
          Synthèse du passeport
        </h2>
        <div className="px-4 pb-3.5 pt-4">
          <p className="flex items-baseline gap-2.5">
            <b
              className="font-display text-[40px] font-medium leading-none tracking-[-0.03em]"
              style={TABULAIRE}
            >
              {summary.atTarget}
            </b>
            <span className="text-sm text-muted-foreground">
              acquis validé{summary.atTarget > 1 ? "s" : ""} sur {summary.total} ·{" "}
              {summary.percentAtTarget} %
              {enAttenteGlobal > 0 ? (
                <>
                  {" · "}
                  <span className="font-medium text-foreground">
                    {enAttenteGlobal} déclaré{enAttenteGlobal > 1 ? "s" : ""}
                  </span>
                </>
              ) : null}
            </span>
          </p>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
            {validatedCount === 0
              ? "Aucune preuve validée pour l'instant."
              : `${validatedCount} preuve${validatedCount > 1 ? "s" : ""} validée${validatedCount > 1 ? "s" : ""} par votre encadrant.`}
          </p>
        </div>

        {nextSteps.length === 0 ? (
          <p className="border-t px-4 py-3.5 text-[13px] text-muted-foreground">
            Aucun jalon à venir sur les acquis qui vous restent.
          </p>
        ) : (
          <>
            <p className={`${EYEBROW} border-t px-4 pb-1.5 pt-3 text-muted-foreground`}>
              Prochains jalons à travailler
            </p>
            <ul className="pb-2">
              {nextSteps.map((jalon) => (
                <li key={jalon.cle} className="flex px-4 py-2">
                  <MilestoneHeading
                    count={jalon.aFaire}
                    color={jalon.couleur}
                    label={jalon.label}
                    done={jalon.acquis}
                    pending={jalon.aValider}
                    total={jalon.total}
                    trailing={
                      <span
                        className={`${EYEBROW} shrink-0 self-center text-muted-foreground`}
                        style={TABULAIRE}
                      >
                        {dateCourte(jalon.dueOn)}
                      </span>
                    }
                  />
                </li>
              ))}
            </ul>
          </>
        )}

        {/*
          CE QUI ATTEND L'ENCADRANT est rappele hors du decompte : l'etudiant a
          fait sa part, l'ecran ne doit ni la lui compter comme un acquis, ni la
          lui faire oublier. Pas de lien ici : on est deja sur le passeport.
        */}
        {enAttenteGlobal > 0 ? (
          <p className="flex items-start gap-2 border-t px-4 py-3.5 text-[13px] text-muted-foreground">
            <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
            <span>
              {enAttenteGlobal} acquis déclaré{enAttenteGlobal > 1 ? "s" : ""} attend
              {enAttenteGlobal > 1 ? "ent" : ""} la validation de votre encadrant. Ils apparaissent
              en « À valider » dans le Kanban.
            </span>
          </p>
        ) : null}
      </section>

      <section aria-labelledby="titre-plan">
        <h2 id="titre-plan" className={TITRE_SECTION}>
          Mon parcours dans le temps
        </h2>

        <div className="mb-4 flex flex-wrap items-end gap-x-4 gap-y-2">
          <div className="space-y-1">
            <Label
              htmlFor="filtre-plan"
              className="block text-[12.5px] font-normal text-muted-foreground"
            >
              Filtrer le plan
            </Label>
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
          <p className="text-[12.5px] text-muted-foreground" style={TABULAIRE}>
            {filteredItems.length} élément{filteredItems.length > 1 ? "s" : ""} affiché
            {filteredItems.length > 1 ? "s" : ""}
            {nonPlanifies > 0 ? ` · ${nonPlanifies} sans jalon` : ""}
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

          <TabsContent value="calendar" className="mt-5">
            <CalendarView events={filteredEvents} items={plan.items} couleurDe={couleurDe} />
          </TabsContent>
          <TabsContent value="gantt" className="mt-5">
            <GanttView
              items={filteredItems}
              range={plan.range}
              couleurDe={couleurDe}
              /*
               * `undefined` QUAND LE PROGRAMME NE L'OUVRE PAS : le diagramme
               * reste alors strictement celui d'avant, sans poignee ni
               * mention de ce qui est interdit.
               */
              {...(reamenagement ? { reamenagement } : {})}
            />
          </TabsContent>
          <TabsContent value="kanban" className="mt-5">
            <KanbanView
              items={filteredItems}
              themes={data.themes}
              couleurDe={couleurDe}
              onProposeChange={setDialogItem}
            />
          </TabsContent>
        </Tabs>
      </section>

      <section aria-labelledby="titre-regles">
        {/*
          LE CHAPEAU « Prototype : aucune demande n'est enregistree » SAUTE : le
          pied de page le dit deja pour tout l'ecran, et chaque demande le
          repete sur sa propre ligne. Trois fois la meme phrase, c'est le ton
          administratif que la maquette v2 corrige.
        */}
        <h2 id="titre-regles" className={TITRE_SECTION}>
          Modifier mon plan
        </h2>
        <ul className="grid gap-3 md:grid-cols-3">
          {IMPACTS.map((impact) => (
            <li key={impact} className="rounded-xl border bg-card p-4 shadow-[var(--shadow-card)]">
              <p className="text-sm font-medium">{IMPACT_LABELS_FR[impact]}</p>
              <p className="mt-1 text-[13px] leading-snug text-muted-foreground">
                {APPROVAL_RULE_LABELS_FR[approvalRuleForImpact(impact)]}
              </p>
            </li>
          ))}
        </ul>

        <div className="mt-5">
          <p className={`${EYEBROW} mb-2 text-muted-foreground`}>Mes demandes simulées</p>
          {requests.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">
              Aucune demande. Utilisez « Proposer une modification » sur un élément planifié.
            </p>
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-xl border bg-card shadow-[var(--shadow-card)]">
              {requests.map((request) => {
                const item = plan.items.find((i) => i.id === request.itemId);
                return (
                  <li key={request.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
                    <span className="font-mono text-xs" style={TABULAIRE}>
                      {item?.code ?? request.itemId}
                    </span>
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
        LA MENTION « Prototype — non enregistre » EST RETIREE (Stef, 09/09),
        comme celle de la vue d'ensemble et pour la meme raison : elle etait
        devenue FAUSSE. Les declarations d'acquis sont ecrites en base
        (`outcome_self_reports`) et le carnet de stage aussi depuis le 07/09.
        Dire a l'etudiant que rien n'est enregistre pendant que tout l'est est
        pire qu'un ecran de maquette : il pourrait croire que son travail ne
        compte pas, et le refaire.

        Elle avait deja ete RETROGRADEE une fois, de badge d'en-tete a libelle
        de pied de page. Le bon geste n'etait pas de l'attenuer mais de la
        dater : une mention de maquette doit disparaitre le jour ou l'ecran
        devient reel, pas retrecir.
      */}
    </div>
  );
}

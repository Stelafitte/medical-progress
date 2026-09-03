/**
 * Mes compétences — liste UNIQUE de compétences.
 *
 * Le caractère simulé ou réel n'est plus un bloc de page : c'est un attribut de
 * la compétence, affiché au même rang que le niveau cible ou l'échéance.
 * L'apprenant peut cocher une compétence comme acquise (auto-déclaration),
 * décrire son expérience d'acquisition et échanger avec son tuteur. Ces gestes
 * ne modifient jamais le niveau calculé : la progression reste dérivée des
 * preuves et une compétence réelle exige une validation humaine tierce.
 */
import { useMemo, useState } from "react";
import { CalendarDays, Download, MessageSquare, Search } from "lucide-react";
import { SectionHeading } from "@/components/section-heading";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  EmptyState,
  MockBadge,
  PanelCard,
  ScopeNotice,
  StatCard,
} from "@/features/professional/mock-ui";
import { useLearnerPassport } from "@/features/dashboard/useLearnerPassport";
import { useSession } from "@/application/session";
import { MASTERY_LABELS_FR, NATURE_LABELS_FR, summarizeProgress } from "@/domain/mastery";
import type { OutcomeProgress } from "@/domain/mastery";
import type { AcquisitionPlanItem } from "@/domain/acquisitionPlan";
import type { CompetenceJournalEntry } from "@/domain/competenceJournal";
import {
  COMPETENCE_STATUS_LABELS_FR,
  EMPTY_COMPETENCE_FILTERS,
  buildJournalExportHtml,
  filterCompetences,
  type CompetenceListFilters,
  type CompetenceStatusFilter,
} from "@/domain/competenceListView";
import type { LearningResourceId, OutcomeNature } from "@/domain/types";
import { OutcomeRow } from "@/features/passport/OutcomeRow";
import { OutcomeScheduleSection } from "@/features/passport/OutcomeScheduleSection";
import { ResourceMediaPlayer } from "@/features/resources/ResourceMediaPlayer";
import { ResourceTextPanel } from "@/features/resources/ResourceTextPanel";
import {
  saveExperienceNote,
  sendJournalMessage,
  useCompetenceJournal,
} from "@/application/competenceJournalStore";

function formatDate(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function DeclarationNotice({ item }: { item: OutcomeProgress }) {
  if (item.outcome.nature !== "real_competence") return null;
  return (
    <p className="text-xs text-muted-foreground">
      Compétence en situation réelle : votre déclaration est transmise pour validation à un tiers
      habilité (encadrant, enseignant). Elle ne vaut pas acquisition.
    </p>
  );
}

function TutorThread({
  entry,
  onSend,
}: {
  entry: CompetenceJournalEntry;
  onSend: (body: string) => void;
}) {
  const [draft, setDraft] = useState("");
  return (
    <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
      <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <MessageSquare className="size-4" aria-hidden /> Échange avec mon tuteur
        <MockBadge label="Simulé" />
      </p>
      {entry.messages.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Aucun échange pour cette compétence. Posez une question à votre tuteur.
        </p>
      ) : (
        <ul className="space-y-2">
          {entry.messages.map((message) => (
            <li key={message.id} className="text-xs">
              <span className="font-medium">{message.author === "learner" ? "Moi" : "Tuteur"}</span>{" "}
              <span className="text-muted-foreground">
                · {new Date(message.sentAt).toLocaleString("fr-FR")}
              </span>
              <p className="text-foreground">{message.body}</p>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Question ou précision pour le tuteur…"
          aria-label="Message au tuteur"
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            onSend(draft);
            setDraft("");
          }}
          disabled={draft.trim().length === 0}
        >
          Envoyer
        </Button>
      </div>
    </div>
  );
}

function CompetenceRow({
  item,
  planItem,
  entry,
  supports,
}: {
  item: OutcomeProgress;
  planItem: AcquisitionPlanItem | undefined;
  entry: CompetenceJournalEntry;
  /** Supports qui traitent CETTE competence — les 4 videos, aujourd'hui. */
  supports: readonly { id: LearningResourceId; title: string; format: string }[];
}) {
  const [openJournal, setOpenJournal] = useState(false);

  /*
   * LA MISE EN PAGE EST CELLE DE « MES RESSOURCES », demandee par Stef le
   * 03/09 apres l'avoir vue sur les connaissances. La carte precedente etalait
   * badges, barre d'avancement, dates et journal a plat : sur 57 competences,
   * l'ecran devenait une colonne interminable ou rien ne se reperait. Tout ce
   * detail est desormais DERRIERE l'intitulé — on l'ouvre quand on le veut.
   *
   * UN SEUL GESTE DE DECLARATION. La case a cocher du journal local a disparu :
   * elle ecrivait dans un magasin en memoire, a cote de la vraie declaration en
   * base. Deux cases pour la meme phrase, dont une qui n'enregistrait rien.
   * L'interrupteur de `OutcomeRow` est maintenant le seul chemin, et le journal
   * ne garde que ce qui lui appartient : la note d'experience et le fil avec le
   * tuteur.
   */
  return (
    <OutcomeRow
      outcome={item.outcome}
      {...(item.declaredLevel === undefined ? {} : { declaredLevel: item.declaredLevel })}
      badges={
        <>
          <Badge variant="secondary" className="ml-2 font-normal">
            {NATURE_LABELS_FR[item.outcome.nature]}
          </Badge>
          <Badge variant={item.meetsTarget ? "default" : "outline"} className="ml-2 font-normal">
            {MASTERY_LABELS_FR[item.mastery]}
          </Badge>
        </>
      }
    >
      <div className="space-y-3">
        {item.outcome.description ? (
          <p className="text-sm text-muted-foreground">{item.outcome.description}</p>
        ) : null}

        <Progress
          value={planItem?.progressPercent ?? (item.meetsTarget ? 100 : 0)}
          aria-label={`Avancement ${item.outcome.code}`}
        />
        <p className="text-xs text-muted-foreground">
          Cible : {MASTERY_LABELS_FR[item.outcome.targetMastery]} · {item.countedEvidence.length}{" "}
          preuve(s) retenue(s) · {item.pendingEvidence.length} en attente
        </p>

        {planItem ? (
          <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <CalendarDays className="size-4" aria-hidden />
            {planItem.startsOn && planItem.dueOn ? (
              <>
                Montée en compétence : du {formatDate(planItem.startsOn)} au{" "}
                {formatDate(planItem.dueOn)} · {planItem.milestoneLabel}
                {planItem.officialDeadline ? (
                  <Badge variant="outline" className="font-normal">
                    Échéance officielle
                  </Badge>
                ) : null}
              </>
            ) : (
              <>Non planifié : aucun jalon du rétroplanning ne porte cette compétence.</>
            )}
          </p>
        ) : null}

        {supports.map((support) => (
          <section key={support.id}>
            <p className="mb-1 text-xs font-medium text-muted-foreground">{support.title}</p>
            {support.format === "video" ? (
              <ResourceMediaPlayer resourceId={support.id} title={support.title} />
            ) : (
              <ResourceTextPanel resourceId={support.id} />
            )}
          </section>
        ))}

        <DeclarationNotice item={item} />

        {item.blockedBySelfDeclaration ? (
          <p className="text-xs text-warning">
            Déclaration enregistrée : une validation par un encadrant reste nécessaire pour une
            compétence en situation réelle.
          </p>
        ) : null}

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setOpenJournal((open) => !open)}
          aria-expanded={openJournal}
        >
          {openJournal ? "Masquer mon journal" : "Commenter mon expérience et échanger"}
        </Button>

        {openJournal ? (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor={`note-${item.outcome.id}`} className="text-xs">
                Mon expérience d'acquisition
              </Label>
              <Textarea
                id={`note-${item.outcome.id}`}
                value={entry.experienceNote}
                rows={3}
                placeholder="Contexte, gestes réalisés, difficultés, ce qu'il me reste à consolider…"
                onChange={(event) => saveExperienceNote(item.outcome.id, event.target.value)}
              />
            </div>
            <TutorThread
              entry={entry}
              onSend={(body) => sendJournalMessage(item.outcome.id, "learner", body)}
            />
          </div>
        ) : null}
      </div>
    </OutcomeRow>
  );
}

export function CompetencesView() {
  const { activeProgram, activeEnrollment, person } = useSession();
  const { data, isPending } = useLearnerPassport();
  const journal = useCompetenceJournal();
  const [filters, setFilters] = useState<CompetenceListFilters>(EMPTY_COMPETENCE_FILTERS);

  const journalById = useMemo(
    () => new Map(journal.map((entry) => [entry.outcomeId, entry] as const)),
    [journal],
  );

  if (!activeEnrollment) {
    return (
      <p className="text-sm text-muted-foreground">Aucune inscription active pour ce programme.</p>
    );
  }
  if (isPending || !data) return <Skeleton className="h-80 w-full" />;

  const competences = data.progress.filter((p) => p.outcome.nature !== "knowledge");

  /*
   * LE JOURNAL DIT MAINTENANT LA VERITE SUR CE QUI EST DECLARE.
   *
   * `selfDeclaredAcquired` venait d'un magasin en memoire, alimente par une case
   * a cocher locale. Depuis que la declaration passe par `declare_outcome_level`
   * et vit en base, cette colonne mentait : le filtre « Declarees » et le compteur
   * « Declarees, a valider » ignoraient les vraies declarations. On la reconcilie
   * ici plutot que de changer la signature de `filterCompetences` — le journal
   * garde ce qui lui appartient (la note d'experience, le fil avec le tuteur), et
   * l'etat de declaration vient d'ou il doit venir.
   */
  const journalReconcilie = new Map(
    competences.map((c) => {
      const entree = journalById.get(c.outcome.id) ?? {
        outcomeId: c.outcome.id,
        selfDeclaredAcquired: false,
        experienceNote: "",
        messages: [],
      };
      const declare = c.declaredLevel !== undefined && c.declaredLevel !== "not_started";
      return [c.outcome.id, { ...entree, selfDeclaredAcquired: declare }] as const;
    }),
  );

  const visible = filterCompetences(competences, filters, journalReconcilie);
  const summary = summarizeProgress(competences);
  const planById = new Map(data.plan.items.map((i) => [i.id, i] as const));
  const declaredCount = competences.filter(
    (c) => !c.meetsTarget && journalReconcilie.get(c.outcome.id)?.selfDeclaredAcquired,
  ).length;

  /**
   * Les competences repliees PAR CHAPITRE.
   *
   * L'ecran rendait une liste a plat : sur ce programme, plusieurs centaines de
   * lignes que l'apprenant devait parcourir au doigt. La forme arretee le 01/09
   * est celle-ci — on voit les chapitres, on deplie celui qui interesse.
   *
   * LES ACQUIS SANS CHAPITRE NE SONT PAS PERDUS : ils tombent dans un groupe
   * « Hors chapitre », place en dernier. Les faire disparaitre serait pire que
   * de les montrer mal — c'est precisement ce qui rend visible le fait qu'ils
   * attendent un rangement.
   *
   * L'ORDRE EST CELUI DU CONCEPTEUR (`position` du chapitre), pas l'ordre
   * alphabetique : l'apprenant doit retrouver la progression telle qu'elle a
   * ete pensee.
   */
  const HORS_CHAPITRE = "Hors chapitre";
  const chapitreDe = new Map(data.themes.map((t) => [t.id, t] as const));
  const parChapitre = new Map<string, { label: string; position: number; items: typeof visible }>();
  for (const item of visible) {
    const theme = item.outcome.themeId ? chapitreDe.get(item.outcome.themeId) : undefined;
    const cle = theme?.id ?? HORS_CHAPITRE;
    const groupe = parChapitre.get(cle) ?? {
      label: theme?.label ?? HORS_CHAPITRE,
      // Sans chapitre, on passe en dernier plutot qu'en premier.
      position: theme ? theme.position : Number.MAX_SAFE_INTEGER,
      items: [] as typeof visible,
    };
    groupe.items = [...groupe.items, item];
    parChapitre.set(cle, groupe);
  }
  /*
   * AIGUILLAGE D'UN SUPPORT, regle posee le 03/09 : un support apparait dans
   * l'onglet de la NATURE des acquis qu'il couvre. Les 4 videos ne couvrent que
   * des competences — elles n'avaient donc rien a faire dans « Mes ressources »,
   * ou elles trainaient, injouables. Un support mixte apparait des deux cotes,
   * et c'est correct : il traite bien les deux.
   */
  const supportsParAcquis = new Map<
    string,
    { id: LearningResourceId; title: string; format: string }[]
  >();
  for (const resource of data.resources) {
    for (const id of resource.outcomeIds) {
      supportsParAcquis.set(id, [
        ...(supportsParAcquis.get(id) ?? []),
        { id: resource.id, title: resource.title, format: resource.format },
      ]);
    }
  }

  const chapitres = [...parChapitre.entries()]
    .map(([cle, g]) => ({ cle, ...g }))
    .sort((a, b) => a.position - b.position);

  /** Export local imprimable : « Enregistrer en PDF » depuis la boîte d'impression. */
  const exportJournal = () => {
    const html = buildJournalExportHtml({
      programName: activeProgram.name,
      learnerName: person.fullName,
      generatedAt: new Date().toISOString(),
      items: visible,
      journal: journalReconcilie,
    });
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
  };

  return (
    <div className="space-y-8">
      {/*
        LE BADGE « SIMULÉ » A ÉTÉ RETIRÉ LE 03/09 : les compétences viennent de
        Supabase et la déclaration s'écrit vraiment en base. Ce qui reste simulé
        — le fil avec le tuteur — porte sa propre mention, à l'endroit exact où
        il se trouve. Une mention globale posée sur un écran majoritairement réel
        apprend à l'étudiant à ne plus lire les avertissements.

        LE CALENDRIER A QUITTÉ CET ÉCRAN pour le Passeport : la description ne
        doit plus le promettre.
      */}
      <SectionHeading
        title="Mes compétences"
        level={1}
        description={`${activeProgram.name} — les compétences du programme, chapitre par chapitre, avec leurs contenus et mon journal d'acquisition.`}
      />

      <ScopeNotice>
        Déclarer une compétence acquise est une auto-déclaration : elle est enregistrée et vous
        suivez ainsi votre progression, mais elle ne vaut jamais acquisition d'une compétence en
        situation réelle, qui exige la validation d'un encadrant. La notification au tuteur n'est
        pas encore branchée.
      </ScopeNotice>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Compétences suivies" value={summary.total} />
        <StatCard
          label="Au niveau cible"
          value={`${summary.atTarget} (${summary.percentAtTarget} %)`}
        />
        <StatCard label="Déclarées, à valider" value={declaredCount} />
        <StatCard label="Non commencées" value={summary.notStarted} />
      </div>

      <PanelCard
        title="Liste de mes compétences"
        description="Une seule liste : la nature (simulée ou réelle) est un attribut de la compétence."
        action={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={exportJournal}
          >
            <Download className="size-4" aria-hidden />
            Exporter mon journal (PDF)
          </Button>
        }
      >
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={filters.search ?? ""}
              onChange={(event) => setFilters((f) => ({ ...f, search: event.target.value }))}
              placeholder="Rechercher une compétence…"
              aria-label="Rechercher une compétence"
              className="pl-9"
            />
          </div>
          <Select
            value={filters.nature ?? "all"}
            onValueChange={(value) =>
              setFilters((f) => ({ ...f, nature: value as OutcomeNature | "all" }))
            }
          >
            <SelectTrigger aria-label="Filtrer par nature">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les natures</SelectItem>
              <SelectItem value="simulated_competence">
                {NATURE_LABELS_FR.simulated_competence}
              </SelectItem>
              <SelectItem value="real_competence">{NATURE_LABELS_FR.real_competence}</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={filters.status ?? "all"}
            onValueChange={(value) =>
              setFilters((f) => ({ ...f, status: value as CompetenceStatusFilter }))
            }
          >
            <SelectTrigger aria-label="Filtrer par statut">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(["all", "at_target", "declared", "in_progress", "not_started"] as const).map(
                (status) => (
                  <SelectItem key={status} value={status}>
                    {COMPETENCE_STATUS_LABELS_FR[status]}
                  </SelectItem>
                ),
              )}
            </SelectContent>
          </Select>
        </div>

        <p className="mb-3 text-xs text-muted-foreground">
          {visible.length} compétence(s) affichée(s) sur {competences.length}.
        </p>

        {competences.length === 0 ? (
          <EmptyState>Aucune compétence définie dans ce programme.</EmptyState>
        ) : visible.length === 0 ? (
          <EmptyState>Aucune compétence ne correspond à cette recherche.</EmptyState>
        ) : (
          <Accordion type="multiple" className="w-full">
            {chapitres.map((chapitre) => (
              <AccordionItem key={chapitre.cle} value={chapitre.cle}>
                <AccordionTrigger className="text-left">
                  <span className="flex flex-1 items-center justify-between gap-3 pr-2">
                    <span className="font-medium">{chapitre.label}</span>
                    <Badge variant="outline" className="font-normal">
                      {chapitre.items.length}
                    </Badge>
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  <ul className="pt-2">
                    {chapitre.items.map((item) => (
                      <CompetenceRow
                        key={item.outcome.id}
                        item={item}
                        planItem={planById.get(item.outcome.id)}
                        entry={
                          journalReconcilie.get(item.outcome.id) ?? {
                            outcomeId: item.outcome.id,
                            selfDeclaredAcquired: false,
                            experienceNote: "",
                            messages: [],
                          }
                        }
                        supports={supportsParAcquis.get(item.outcome.id) ?? []}
                      />
                    ))}
                  </ul>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </PanelCard>

      <OutcomeScheduleSection
        plan={data.plan}
        garder={(nature) => nature !== "knowledge"}
        title="Quand je dois les maîtriser"
        description="Les jalons du programme qui portent des compétences. Dépliez un jalon pour voir ce qu'il demande, et déclarez au passage."
      />
    </div>
  );
}

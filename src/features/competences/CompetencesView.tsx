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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { selfDeclarationState, type CompetenceJournalEntry } from "@/domain/competenceJournal";
import {
  COMPETENCE_STATUS_LABELS_FR,
  EMPTY_COMPETENCE_FILTERS,
  buildJournalExportHtml,
  filterCompetences,
  type CompetenceListFilters,
  type CompetenceStatusFilter,
} from "@/domain/competenceListView";
import type { OutcomeNature } from "@/domain/types";
import {
  declareCompetence,
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
              <span className="font-medium">
                {message.author === "learner" ? "Moi" : "Tuteur"}
              </span>{" "}
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
}: {
  item: OutcomeProgress;
  planItem: AcquisitionPlanItem | undefined;
  entry: CompetenceJournalEntry;
}) {
  const [openJournal, setOpenJournal] = useState(false);
  const declaration = selfDeclarationState(entry, item.meetsTarget);
  const checkboxId = `acquise-${item.outcome.id}`;

  return (
    <li className="space-y-3 rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{item.outcome.label}</span>
        <Badge variant="outline" className="font-normal">
          {item.outcome.code}
        </Badge>
        {/* Le caractère simulé / réel est un attribut, pas une catégorie de page. */}
        <Badge variant="secondary" className="font-normal">
          {NATURE_LABELS_FR[item.outcome.nature]}
        </Badge>
        <Badge variant={item.meetsTarget ? "default" : "outline"} className="font-normal">
          {MASTERY_LABELS_FR[item.mastery]}
        </Badge>
        <Badge variant="outline" className="font-normal">
          Cible : {MASTERY_LABELS_FR[item.outcome.targetMastery]}
        </Badge>
        {declaration === "awaiting_validation" ? (
          <Badge variant="outline" className="font-normal text-warning">
            Déclarée — en attente de validation
          </Badge>
        ) : null}
      </div>

      <p className="text-sm text-muted-foreground">{item.outcome.description}</p>
      <Progress
        value={planItem?.progressPercent ?? (item.meetsTarget ? 100 : 0)}
        aria-label={`Avancement ${item.outcome.code}`}
      />
      <p className="text-xs text-muted-foreground">
        {item.countedEvidence.length} preuve(s) retenue(s) · {item.pendingEvidence.length} en attente
      </p>

      {planItem ? (
        <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <CalendarDays className="size-4" aria-hidden />
          Montée en compétence : du {formatDate(planItem.startsOn)} au {formatDate(planItem.dueOn)} ·{" "}
          {planItem.milestoneLabel}
          {planItem.officialDeadline ? (
            <Badge variant="outline" className="font-normal">
              Échéance officielle
            </Badge>
          ) : null}
        </p>
      ) : null}

      <div className="flex items-center gap-2">
        <Checkbox
          id={checkboxId}
          checked={entry.selfDeclaredAcquired || item.meetsTarget}
          disabled={item.meetsTarget}
          onCheckedChange={(checked) => declareCompetence(item.outcome.id, checked === true)}
        />
        <Label htmlFor={checkboxId} className="text-sm font-normal">
          {item.meetsTarget
            ? "Acquise et validée par des preuves"
            : "Je considère cette compétence acquise"}
        </Label>
      </div>
      <DeclarationNotice item={item} />
      {item.blockedBySelfDeclaration ? (
        <p className="text-xs text-warning">
          Auto-déclaration enregistrée : une validation par un tiers est nécessaire pour une
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
    </li>
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
  const visible = filterCompetences(competences, filters, journalById);
  const summary = summarizeProgress(competences);
  const planById = new Map(data.plan.items.map((i) => [i.id, i] as const));
  const declaredCount = competences.filter(
    (c) => !c.meetsTarget && journalById.get(c.outcome.id)?.selfDeclaredAcquired,
  ).length;

  const scheduled = competences
    .map((c) => planById.get(c.outcome.id))
    .filter((item): item is AcquisitionPlanItem => Boolean(item))
    .sort((a, b) => a.dueOn.localeCompare(b.dueOn));

  /** Export local imprimable : « Enregistrer en PDF » depuis la boîte d'impression. */
  const exportJournal = () => {
    const html = buildJournalExportHtml({
      programName: activeProgram.name,
      learnerName: person.fullName,
      generatedAt: new Date().toISOString(),
      items: visible,
      journal: journalById,
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
      <SectionHeading
        title="Mes compétences"
        level={1}
        action={<MockBadge label="Simulé" />}
        description={`${activeProgram.name} — liste unique des compétences, avec leurs attributs, mon journal d'acquisition et mon calendrier.`}
      />

      <ScopeNotice>
        Cocher une compétence est une auto-déclaration : elle est notifiée à votre tuteur, qui la
        retrouve dans « Compétences à confirmer », mais elle ne vaut jamais acquisition d'une
        compétence en situation réelle, qui exige une validation humaine par un tiers habilité.
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
          <Button type="button" variant="outline" size="sm" className="gap-2" onClick={exportJournal}>
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
              {(
                ["all", "at_target", "declared", "in_progress", "not_started"] as const
              ).map((status) => (
                <SelectItem key={status} value={status}>
                  {COMPETENCE_STATUS_LABELS_FR[status]}
                </SelectItem>
              ))}
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
          <ul className="space-y-4">
            {visible.map((item) => (
              <CompetenceRow
                key={item.outcome.id}
                item={item}
                planItem={planById.get(item.outcome.id)}
                entry={journalById.get(item.outcome.id) ?? {
                  outcomeId: item.outcome.id,
                  selfDeclaredAcquired: false,
                  experienceNote: "",
                  messages: [],
                }}
              />
            ))}
          </ul>
        )}
      </PanelCard>


      <PanelCard
        title="Calendrier de montée en compétence"
        description="Jalons issus du plan d'acquisition du programme, classés par échéance."
        action={<MockBadge label="Simulé" />}
      >
        {scheduled.length === 0 ? (
          <EmptyState>Aucun calendrier de montée en compétence défini.</EmptyState>
        ) : (
          <ul className="space-y-2">
            {scheduled.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2 last:border-0"
              >
                <span className="text-sm">
                  <span className="font-medium">{item.code}</span> — {item.label}
                </span>
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  {formatDate(item.startsOn)} → {formatDate(item.dueOn)}
                  <Badge variant="outline" className="font-normal">
                    {NATURE_LABELS_FR[item.nature]}
                  </Badge>
                  {item.officialDeadline ? (
                    <Badge variant="outline" className="font-normal">
                      Officielle
                    </Badge>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </PanelCard>
    </div>
  );
}

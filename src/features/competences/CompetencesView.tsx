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
import { useEffect, useMemo, useState } from "react";
import { Link, useSearch } from "@tanstack/react-router";
import { CalendarDays, ChevronDown, Download, MessageSquare, Search } from "lucide-react";
import { FieldHeader } from "@/components/field-header";
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
import { EmptyState, MockBadge, PanelCard, ScopeNotice } from "@/features/professional/mock-ui";
import { buildDomainColors, DOMAIN_NEUTRAL } from "@/features/dashboard/domainColor";
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
import type { LearningResourceId, OutcomeId, OutcomeNature, OutcomeThemeId } from "@/domain/types";
import { OutcomeRow } from "@/features/passport/OutcomeRow";
import { OutcomeScheduleSection } from "@/features/passport/OutcomeScheduleSection";
import { ResourceMediaPlayer } from "@/features/resources/ResourceMediaPlayer";
import { ChapterTextPanel } from "@/features/resources/ChapterTextPanel";
import { OutcomeSectionsPanel } from "@/features/resources/OutcomeSectionsPanel";
import { useCompetenceJournal } from "@/application/competenceJournalStore";
import {
  EXPERIENCE_NOTE_MAX,
  useSaveExperienceNote,
} from "@/features/competences/useSaveExperienceNote";

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

/**
 * « MON EXPERIENCE D'ACQUISITION » — un vrai champ, enregistre en base.
 *
 * IL EST INDEPENDANT DE LA DECLARATION, et c'est tout son objet : le texte le
 * plus utile est celui de quelqu'un qui n'est PAS encore pret a se declarer
 * competent (« j'ai fait quatre interrogatoires, je bute sur les antecedents
 * familiaux »). L'ecrire dans `outcome_self_reports.note` aurait exige un
 * niveau declare — la plateforme aurait declare une competence a la place de
 * l'apprenant. Voir la migration 20260910140000.
 *
 * ETAT LOCAL PENDANT LA FRAPPE, ecriture a la SORTIE du champ. Enregistrer a
 * chaque lettre ferait autant d'appels que de caracteres ; relire la valeur du
 * serveur pendant la frappe ferait sauter le curseur.
 *
 * LA MENTION N'EST PAS UNE PRECAUTION, C'EST UNE CONDITION. Ces notes seront
 * lues par l'encadrement — c'est la raison meme de leur stockage (analyse a
 * venir, cf. objectifs de dev). Un champ intitule « Mon experience » sans rien
 * dire laisserait croire a un journal intime. C'est le defaut du 09/09 (« un
 * contenu credible et faux ») retourne dans l'autre sens.
 */
function ExperienceNoteField({ outcomeId, initial }: { outcomeId: OutcomeId; initial: string }) {
  const [texte, setTexte] = useState(initial);
  const [dernierEnvoi, setDernierEnvoi] = useState(initial);
  const enregistrement = useSaveExperienceNote();

  /* La note relue depuis le serveur reprend la main SI l'apprenant n'a rien
     tape depuis — sinon on ecraserait sa frappe en cours. */
  useEffect(() => {
    if (texte === dernierEnvoi) {
      setTexte(initial);
      setDernierEnvoi(initial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  return (
    <div className="space-y-1">
      <Label htmlFor={`note-${outcomeId}`} className="text-xs">
        Mon expérience d'acquisition
      </Label>
      <Textarea
        id={`note-${outcomeId}`}
        value={texte}
        rows={3}
        maxLength={EXPERIENCE_NOTE_MAX}
        placeholder="Contexte, gestes réalisés, difficultés, ce qu'il me reste à consolider…"
        onChange={(event) => setTexte(event.target.value)}
        onBlur={() => {
          /* Rien a envoyer si le texte n'a pas bouge : un aller-retour reseau
             pour un champ seulement survole serait du bruit. */
          if (texte === dernierEnvoi) return;
          setDernierEnvoi(texte);
          enregistrement.mutate({ outcomeId, body: texte });
        }}
      />
      <p className="text-muted-foreground text-xs">
        Vos encadrants peuvent lire vos notes.
        {texte.length > EXPERIENCE_NOTE_MAX - 500
          ? ` ${EXPERIENCE_NOTE_MAX - texte.length} caractères restants.`
          : ""}
      </p>
    </div>
  );
}

function CompetenceRow({
  item,
  planItem,
  entry,
  supports,
  experienceNote,
  spotlight = false,
}: {
  item: OutcomeProgress;
  planItem: AcquisitionPlanItem | undefined;
  entry: CompetenceJournalEntry;
  /** La note reelle, lue en base — et non celle du magasin en memoire. */
  experienceNote: string;
  /** Arrivée d'un lien profond : la ligne s'ouvre et l'écran défile jusqu'à elle. */
  spotlight?: boolean;
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
      spotlight={spotlight}
      {...(item.declaredLevel === undefined ? {} : { declaredLevel: item.declaredLevel })}
      supportCount={supports.length}
      supportKind={supports.some((s) => s.format === "video") ? "video" : "text"}
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

        {/*
          LE CONTENU DE LA COMPETENCE, LU PAR L'ETUDIANT (14/09).
          L'ecran affichait l'intitule, la cible et les preuves — jamais ce
          qu'il fallait savoir faire. Le meme composant que les connaissances
          est utilise ici : `read_outcome_sections` rend le passage PROPRE a
          l'acquis, et `sectionsPropres` ecarte le repli chapitre. Quand il n'y
          a pas de texte, le composant le DIT — un vide credible serait pire.
        */}
        <OutcomeSectionsPanel outcomeId={item.outcome.id} />

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
              /*
                TEXTE 2026 (09/09). Cet ecran lisait `learning_resource_texts` —
                l'import 2022, en segments aveugles de 4 000 caracteres, sans un
                seul titre. Decision de Stef : « tout DOIT etre du 2026 ». Le
                remplacement est ici volontairement A FORME EGALE : meme place,
                meme geste, autre source. Afficher a la place les sections
                PROPRES a l'acquis serait mieux, mais c'est un changement
                d'ecran que personne n'a demande sur cette vue-la.
              */
              <ChapterTextPanel resourceId={support.id} />
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
            <ExperienceNoteField outcomeId={item.outcome.id} initial={experienceNote} />
            {/*
              LE FIL N'EST PLUS ICI, ET C'EST UNE DECISION DE STEF (10/09).
              Il vivait en memoire, sous un badge « Simule » : rien n'etait
              envoye, rien n'etait recu. L'echange se fait desormais dans « Mes
              messages », pave « Mes echanges », et le bouton l'ouvre SUR CETTE
              COMPETENCE — sans quoi l'apprenant perdrait le contexte de ce qu'il
              regardait et devrait retrouver son fil dans une liste.
            */}
            <Button asChild variant="outline" size="sm" className="w-full sm:w-auto">
              <Link to="/espace/messages" search={{ competence: item.outcome.id }}>
                <MessageSquare className="size-4" aria-hidden />
                Échanger avec mon tuteur
              </Link>
            </Button>
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
  const { acquis, q } = useSearch({ from: "/espace/competences" });
  /*
   * MEME GRAINE QUE « Mes ressources » : `q` vient de la recherche transverse et
   * pre-remplit le filtre. Sans lui, « voir les N autres » ouvrait la liste
   * entiere des competences.
   */
  const [filters, setFilters] = useState<CompetenceListFilters>({
    ...EMPTY_COMPETENCE_FILTERS,
    ...(q ? { search: q } : {}),
  });
  /** Lien profond depuis « Mon prochain jalon » : `?acquis=<code>`. */

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
  /* Les notes d'experience REELLES, lues en base, indexees par acquis. */
  const notesParAcquis = new Map(data.experienceNotes.map((n) => [n.outcomeId, n.body] as const));

  const journalReconcilie = new Map(
    competences.map((c) => {
      const entree = journalById.get(c.outcome.id) ?? {
        outcomeId: c.outcome.id,
        selfDeclaredAcquired: false,
        experienceNote: "",
        messages: [],
      };
      const declare = c.declaredLevel !== undefined && c.declaredLevel !== "not_started";
      /*
       * LA NOTE VIENT DE LA BASE, PLUS DU MAGASIN EN MEMOIRE.
       *
       * Sans cette ligne, l'export de la liste (`competenceListView`) aurait
       * cesse en SILENCE de contenir le recit d'experience : il lit
       * `entry.experienceNote`, que plus personne n'alimente depuis que le
       * champ ecrit dans `outcome_experience_notes`. Le meme piege que le
       * 09/09 — un ecran qui continue de fonctionner en disant moins.
       */
      return [
        c.outcome.id,
        {
          ...entree,
          selfDeclaredAcquired: declare,
          experienceNote: notesParAcquis.get(c.outcome.id) ?? "",
        },
      ] as const;
    }),
  );

  const visible = filterCompetences(competences, filters, journalReconcilie);
  const summary = summarizeProgress(competences);
  const planById = new Map(data.plan.items.map((i) => [i.id, i] as const));

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
  /*
   * LES HUIT TEINTES APPARAISSENT ICI ENSEMBLE POUR LA PREMIERE FOIS. C'est
   * l'ecran ou la palette paie : un domaine porte la meme couleur ici et sur
   * `/espace`, quel que soit l'ordre d'affichage, parce qu'elle est derivee de
   * son identifiant. « Hors chapitre » n'est pas un domaine : il reste neutre.
   */
  const couleurParTheme = buildDomainColors(data.themes, data.outcomes);
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

  /** Le chapitre qui porte l'acquis visé — celui qu'il faut déplier à l'arrivée. */
  const chapitreCible =
    acquis === undefined
      ? undefined
      : chapitres.find((chapitre) => chapitre.items.some((item) => item.outcome.code === acquis))
          ?.cle;

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
      <FieldHeader
        eyebrow={activeProgram.name}
        title="Mes compétences"
        figures={[
          { value: summary.total, label: "suivies" },
          { value: summary.atTarget, label: "au niveau cible" },
          { value: summary.notStarted, label: "non commencées" },
        ]}
      />

      <ScopeNotice>
        Déclarer une compétence acquise est une auto-déclaration : elle est enregistrée et vous
        suivez ainsi votre progression, mais elle ne vaut jamais acquisition d'une compétence en
        situation réelle, qui exige la validation d'un encadrant. La notification au tuteur n'est
        pas encore branchée.
      </ScopeNotice>

      <PanelCard
        title="Liste de mes compétences"
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
          <Accordion
            type="multiple"
            className="w-full"
            key={acquis ?? "tous"}
            defaultValue={chapitreCible === undefined ? [] : [chapitreCible]}
          >
            {chapitres.map((chapitre) => (
              <AccordionItem
                key={chapitre.cle}
                value={chapitre.cle}
                className="border-b-0"
                style={
                  {
                    "--c": couleurParTheme.get(chapitre.cle as OutcomeThemeId) ?? DOMAIN_NEUTRAL,
                  } as React.CSSProperties
                }
              >
                <AccordionTrigger className="gap-3 py-3 text-left hover:no-underline [&>svg]:hidden">
                  <span className="flex min-w-0 flex-1 items-stretch gap-3">
                    {/*
                      LA TUILE PORTE LE COMPTE. Une pastille de 8 px ne pesait
                      rien ; un aplat qui porte un chiffre fait travailler la
                      couleur, et c'est ce qui dit « competence » d'un coup
                      d'oeil dans toute l'application.
                    */}
                    <span
                      className="grid w-11 shrink-0 place-items-center rounded-lg py-2 text-white"
                      style={{ backgroundColor: "var(--c)" }}
                    >
                      <b
                        className="text-[17px] font-bold leading-none"
                        style={{ fontVariantNumeric: "tabular-nums" }}
                      >
                        {chapitre.items.length}
                      </b>
                      <span className="mt-[3px] text-[9px] tracking-wider opacity-85">ACQUIS</span>
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col justify-center gap-[5px]">
                      <span className="font-display text-[16.5px] leading-tight tracking-[-0.01em]">
                        {chapitre.label}
                      </span>
                      <span className="h-[3px] overflow-hidden rounded-sm bg-card-sunk" aria-hidden>
                        <span
                          className="block h-full rounded-sm"
                          style={{
                            width: `${Math.max(
                              (chapitre.items.filter((i) => i.meetsTarget).length /
                                chapitre.items.length) *
                                100,
                              3,
                            )}%`,
                            backgroundColor: "var(--c)",
                          }}
                        />
                      </span>
                    </span>
                    <ChevronDown
                      className="size-4 shrink-0 self-center text-muted-foreground transition-transform"
                      aria-hidden
                    />
                  </span>
                </AccordionTrigger>
                <AccordionContent
                  className="mb-2 px-3"
                  style={{
                    backgroundColor: "color-mix(in oklch, var(--c) 8%, var(--card))",
                    borderTop: "1px solid color-mix(in oklch, var(--c) 22%, transparent)",
                    borderBottom: "1px solid color-mix(in oklch, var(--c) 22%, transparent)",
                  }}
                >
                  <ul className="pt-2">
                    {chapitre.items.map((item) => (
                      <CompetenceRow
                        key={item.outcome.id}
                        item={item}
                        spotlight={acquis !== undefined && item.outcome.code === acquis}
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
                        experienceNote={notesParAcquis.get(item.outcome.id) ?? ""}
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
        couleurDe={(themeId) =>
          themeId === undefined
            ? "var(--field)"
            : (couleurParTheme.get(themeId as OutcomeThemeId) ?? "var(--field)")
        }
        title="Quand je dois les maîtriser"
        description="Les jalons du programme qui portent des compétences."
        collapsible
      />
    </div>
  );
}

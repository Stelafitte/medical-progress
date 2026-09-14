import { useState } from "react";
import { BookOpen, ChevronDown, FileText, Globe, PlayCircle, Search } from "lucide-react";
import { Link, useSearch } from "@tanstack/react-router";
import { useSession } from "@/application/session";
import { correspond, motsDeLaRequete } from "@/domain/rechercheTransverse";
import { FieldHeader } from "@/components/field-header";
import { SectionHeading } from "@/components/section-heading";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPlayerDuration } from "@/domain/mediaLibrary";
import { KNOWLEDGE_RANKS, type KnowledgeRank, type OutcomeId } from "@/domain/types";
import { RankBadge } from "@/components/rank-badge";
import { ResourceFigures } from "@/features/resources/ResourceFigures";
import { ResourceMediaPlayer } from "@/features/resources/ResourceMediaPlayer";
import { ChapterTextPanel } from "@/features/resources/ChapterTextPanel";
import { AiCompanionInline } from "@/features/ai/AiCompanionInline";
import { useProgramAiEnabled } from "@/features/resources/useProgramAiEnabled";
import { useLearnerPassport } from "@/features/dashboard/useLearnerPassport";
import {
  KnowledgeRow,
  type CoveringDeck,
  type CoveringSupport,
} from "@/features/resources/KnowledgeRow";
import { searchResources } from "@/domain/learnerLibrary";

export function ResourcesView() {
  const { activeProgram } = useSession();
  const { data, isPending } = useLearnerPassport();
  /*
   * UN SEUL ACQUIS OUVERT A LA FOIS (regle b, Stef 07/09). Chaque ligne portait
   * son propre accordeon : depliees a la suite, dix connaissances rendaient la
   * page interminable sur telephone, chacune avec son assistant et son texte.
   * L'etat vit ici, au-dessus de la liste, parce que c'est la LISTE qui arbitre.
   */
  const [acquisOuvert, setAcquisOuvert] = useState<OutcomeId | null>(null);
  /*
   * LE FILTRE PAR RANG. `KNOWLEDGE_RANKS` etait declare depuis le 01/09 et
   * utilise NULLE PART : les trois rangs existaient en base et dans les types,
   * sans qu'aucun ecran ne permette de s'y reperer. Or c'est la premiere chose
   * qu'un etudiant cherche a l'approche des EDN — le rang A est le socle
   * exigible, le rang C de l'approfondissement.
   *
   * ENSEMBLE VIDE = TOUT AFFICHER, plutot que rien. Un filtre qui vide l'ecran
   * quand on decoche la derniere case se lit comme une panne.
   */
  const [rangs, setRangs] = useState<ReadonlySet<KnowledgeRank>>(new Set());
  const { acquis, q } = useSearch({ from: "/espace/ressources/" });
  /*
   * LE CHAMP PART DE L'URL quand la recherche transverse a emporte `q` : sinon
   * « voir les N autres » ouvrait cet onglet vide de tout filtre, et l'etudiant
   * lisait les 314 connaissances du programme a la place des N annoncees.
   * Il reste librement modifiable ensuite -- l'URL n'est qu'une graine.
   */
  const [search, setSearch] = useState(q ?? "");
  /**
   * L'ACQUIS VISÉ PAR UN LIEN PROFOND (`?acquis=<code>`), demandé par Stef le
   * 04/09 : « clique sur item de Mes prochains jalons envoie dans le bon
   * onglet et surtout directement sur le bon item à voir et à valider ».
   * On désigne l'acquis par son CODE et non par son identifiant : il est
   * unique par programme, lisible dans la barre d'adresse, et stable.
   */

  if (isPending || !data) return <Skeleton className="h-64 w-full" />;

  const { outcomes } = data;
  const narratedDecks = searchResources(data.narratedDecks, search);

  /**
   * LES CONNAISSANCES DU PROGRAMME, repliees par chapitre.
   *
   * CE QUI MANQUAIT. Cet ecran listait les SUPPORTS — 26 fiches — et jamais les
   * CONNAISSANCES. Les 313 acquis de nature `knowledge` du referentiel n'avaient
   * aucune vue apprenant : l'etudiant ne pouvait pas savoir ce qu'il devait
   * savoir. C'est l'objectif 2 enonce par Stef le 03/09.
   *
   * CHAQUE CONNAISSANCE PORTE SES SUPPORTS. Le lien vit dans
   * `learning_resource_outcomes` ; on le retourne ici pour que l'etudiant parte
   * de ce qu'il doit apprendre et trouve de quoi l'apprendre — et non l'inverse.
   *
   * LE RANG EST AFFICHE quand il existe : rang A et rang B ne se revisent pas de
   * la meme facon, et c'est l'information que l'etudiant cherche en premier.
   */
  const HORS_CHAPITRE = "Hors chapitre";
  const chapitreDe = new Map(data.themes.map((t) => [t.id, t] as const));
  /*
   * MEME APPARIEMENT QUE LA RECHERCHE TRANSVERSE ET QUE « Mes competences »
   * (14/09). Ce filtre comparait en `toLowerCase()` nu : « echographie » ne
   * trouvait pas « Echocardiographie » accentue, alors que l'onglet voisin,
   * lui, desaccentuait. Le meme mot rendait deux reponses differentes dans
   * deux onglets voisins, sans que rien ne le signale. Partager un composant
   * ne suffit pas -- il faut partager la projection.
   */
  const motsRecherches = motsDeLaRequete(search);
  /*
   * LE CHIFFRE DU BANDEAU COMPTE LE PROGRAMME, PAS LA RECHERCHE. `connaissances`
   * est filtre par le champ de recherche ; l'afficher dans le bandeau faisait
   * tomber « 314 connaissances » a « 3 » des la premiere lettre tapee, comme si
   * le referentiel avait retreci.
   */
  const totalConnaissances = outcomes.filter((o) => o.nature === "knowledge").length;
  /*
   * LE COMPTE PAR RANG PORTE SUR LE PROGRAMME, jamais sur la liste filtree :
   * un bouton qui affiche « 0 » des qu'on le decoche ne dit plus rien de ce
   * qu'il ferait revenir. Un rang absent du programme voit son bouton RETIRE,
   * pas grise.
   */
  const totalParRang = new Map<KnowledgeRank, number>();
  for (const o of outcomes) {
    if (o.nature !== "knowledge" || o.knowledgeRank === undefined) continue;
    totalParRang.set(o.knowledgeRank, (totalParRang.get(o.knowledgeRank) ?? 0) + 1);
  }
  const connaissances = outcomes
    .filter((o) => o.nature === "knowledge")
    .filter((o) => motsRecherches.length === 0 || correspond([o.code, o.label], motsRecherches))
    .filter(
      (o) => rangs.size === 0 || (o.knowledgeRank !== undefined && rangs.has(o.knowledgeRank)),
    );

  /*
   * L'identifiant du support, et plus seulement son titre : c'est lui qui
   * ouvre `learning_resource_texts`. Sans lui, l'ecran savait nommer le
   * chapitre qui traite une connaissance mais pas en montrer le contenu.
   */
  const supportsParAcquis = new Map<string, CoveringSupport[]>();
  for (const resource of data.resources) {
    for (const id of resource.outcomeIds) {
      supportsParAcquis.set(id, [
        ...(supportsParAcquis.get(id) ?? []),
        { id: resource.id, title: resource.title, format: resource.format },
      ]);
    }
  }
  /*
   * LES DIAPORAMAS COMMENTES RATTACHES A UNE CONNAISSANCE. Ils portent deja
   * leurs `outcomeIds` ; sans ce regroupement ils ne vivaient que dans la
   * section du haut, ou l'etudiant devait les retrouver a la main apres avoir
   * ouvert la connaissance qui les concerne.
   */
  const decksParAcquis = new Map<string, CoveringDeck[]>();
  for (const deck of data.narratedDecks) {
    for (const id of deck.outcomeIds) {
      decksParAcquis.set(id, [
        ...(decksParAcquis.get(id) ?? []),
        { mediaId: deck.mediaId, title: deck.title, slideCount: deck.slideCount },
      ]);
    }
  }
  const niveauDeclare = new Map(data.selfReports.map((r) => [r.outcomeId, r.declaredLevel]));

  const chapitresConnaissances = [
    ...connaissances
      .reduce((acc, outcome) => {
        const theme = outcome.themeId ? chapitreDe.get(outcome.themeId) : undefined;
        const cle = theme?.id ?? HORS_CHAPITRE;
        const groupe = acc.get(cle) ?? {
          cle,
          label: theme?.label ?? HORS_CHAPITRE,
          // Sans chapitre, on passe en dernier plutot qu'en premier.
          position: theme ? theme.position : Number.MAX_SAFE_INTEGER,
          items: [] as typeof connaissances,
        };
        groupe.items = [...groupe.items, outcome];
        acc.set(cle, groupe);
        return acc;
      }, new Map<string, { cle: string; label: string; position: number; items: typeof connaissances }>())
      .values(),
  ].sort((a, b) => a.position - b.position);

  /** Le chapitre qui porte l'acquis visé — celui qu'il faut déplier à l'arrivée. */
  const chapitreCible =
    acquis === undefined
      ? undefined
      : chapitresConnaissances.find((chapitre) =>
          chapitre.items.some((outcome) => outcome.code === acquis),
        )?.cle;

  return (
    <div className="space-y-8">
      {/*
        LE BADGE « SIMULÉ » ET LE BANDEAU « CATALOGUE SIMULÉ » ONT ÉTÉ RETIRÉS
        LE 03/09 : ils ne disaient plus la vérité. Les connaissances, les
        supports et leur texte intégral viennent de Supabase depuis le 30/08 et
        le 03/09. Une mention « simulé » sur du réel est aussi trompeuse qu'une
        absence de mention sur du simulé — et elle apprend à l'étudiant à ne
        plus lire les avertissements.
      */}
      <FieldHeader
        eyebrow={activeProgram.name}
        title="Mes ressources"
        figures={[
          { value: totalConnaissances, label: "connaissances" },
          { value: chapitresConnaissances.length, label: "chapitres" },
        ]}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Rechercher un support…"
            aria-label="Rechercher un support"
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2" role="group" aria-label="Filtrer par rang">
          {KNOWLEDGE_RANKS.map((rang) => {
            const actif = rangs.has(rang);
            const nombre = totalParRang.get(rang) ?? 0;
            if (nombre === 0) return null;
            return (
              <button
                key={rang}
                type="button"
                aria-pressed={actif}
                onClick={() =>
                  setRangs((precedents) => {
                    const suivant = new Set(precedents);
                    if (suivant.has(rang)) suivant.delete(rang);
                    else suivant.add(rang);
                    return suivant;
                  })
                }
                className={`inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-md border px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  actif ? "border-primary bg-accent" : "border-border hover:bg-accent"
                }`}
              >
                <RankBadge rank={rang} />
                <span style={{ fontVariantNumeric: "tabular-nums" }}>{nombre}</span>
              </button>
            );
          })}
        </div>
      </div>

      {narratedDecks.length > 0 ? (
        <section className="space-y-4">
          <SectionHeading
            title="Diaporamas commentés"
            level={2}
            description="Lecture en ligne synchronisée : diapositives, commentaire audio, sommaire et transcription. Le fichier PowerPoint source n'est pas distribué."
          />
          <ul className="grid gap-4 md:grid-cols-2">
            {narratedDecks.map((deck) => (
              <li key={deck.mediaId}>
                <Card className="flex h-full flex-col">
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <PlayCircle className="size-4 text-primary" aria-hidden />
                      <Badge variant="outline" className="font-normal">
                        Diaporama commenté
                      </Badge>
                    </div>
                    <CardTitle className="text-base">{deck.title}</CardTitle>
                    <CardDescription>
                      {deck.module} · {deck.slideCount} diapositives ·{" "}
                      {formatPlayerDuration(deck.totalDurationSeconds)}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="mt-auto">
                    <Button asChild className="min-h-11 w-full gap-2 sm:w-auto">
                      <Link
                        to="/espace/ressources/$resourceId/lecture"
                        params={{ resourceId: deck.mediaId }}
                      >
                        <PlayCircle className="size-4" aria-hidden />
                        Consulter le cours
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/*
        LE TUTEUR IA DE DEMONSTRATION EST DEBRANCHE DE CET ECRAN (Stef, 09/09).

        CE QUI POSAIT PROBLEME : cette section — « Assistant (maquette) »,
        « Simuler la prise de parole », « Aucun traitement IA reel n'est
        effectue dans cette maquette » — vivait sur la MEME page que le vrai
        assistant, celui qui lit le texte 2026 et coute des jetons. Deux IA
        cote a cote, une vraie et une fausse, chacune avec ses boutons. La
        maquette annoncait honnetement qu'elle etait fausse ; ce n'est pas
        suffisant quand la vraie est a quelques centimetres.

        CE QU'ON NE PERD PAS, MESURE : la liste venait de
        `listLearnerAiResources`, qui n'a AUCUNE implementation Supabase — en
        production elle rend une liste vide, ses fixtures etant indexees sur
        des identifiants de maquette. La section ne s'affichait donc deja plus,
        sauf en demonstration ; et le jour ou quelqu'un aurait seme une
        politique de contenu, le faux tuteur serait apparu a cote du vrai sans
        que personne l'ait decide. Les cours narres ont leur propre section,
        plus haut, et elle est reelle.

        DEBRANCHE, PAS SUPPRIME : `ContentAiTutorPanel` reste sur le disque.
        Les modes qu'il esquisse — QCM, cas clinique guide, revision adaptative
        — sont une feuille de route, pas du code mort.
      */}

      <section className="space-y-3">
        <SectionHeading title="Les connaissances du programme" level={2} />
        {chapitresConnaissances.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucune connaissance ne correspond à cette recherche.
          </p>
        ) : (
          /*
            LA CLÉ CHANGE AVEC LA CIBLE, ce qui remonte l'accordéon et applique
            `defaultValue`. Un accordéon contrôlé aurait exigé un état déclaré
            avant le retour anticipé de chargement — donc avant que les
            chapitres n'existent. Le remontage ne se produit qu'à l'arrivée
            d'un lien, jamais pendant que l'étudiant navigue.
          */
          <Accordion
            type="multiple"
            className="w-full"
            key={acquis ?? "tous"}
            defaultValue={chapitreCible === undefined ? [] : [chapitreCible]}
          >
            {chapitresConnaissances.map((chapitre) => (
              <AccordionItem key={chapitre.cle} value={chapitre.cle}>
                {/*
                  LA TUILE EST EN MARINE, PAS DANS UNE TEINTE DE DOMAINE. Une
                  connaissance n'est pas une competence : la couleur ne dit
                  qu'une chose dans toute l'application, et c'est « domaine de
                  competence ». Teinter un chapitre ferait mentir tout le code
                  couleur des autres ecrans.
                */}
                <AccordionTrigger className="gap-3 py-3 text-left hover:no-underline [&>svg]:hidden">
                  <span className="flex min-w-0 flex-1 items-stretch gap-3">
                    <span className="grid w-11 shrink-0 place-items-center rounded-lg bg-field py-2 text-field-ink">
                      <b
                        className="text-[17px] font-bold leading-none"
                        style={{ fontVariantNumeric: "tabular-nums" }}
                      >
                        {chapitre.items.length}
                      </b>
                      <span className="mt-[3px] text-[9px] tracking-wider opacity-85">SAVOIRS</span>
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col justify-center gap-[3px]">
                      <span className="font-display text-[16.5px] leading-tight tracking-[-0.01em]">
                        {chapitre.label}
                      </span>
                    </span>
                    <ChevronDown
                      className="size-4 shrink-0 self-center text-muted-foreground transition-transform"
                      aria-hidden
                    />
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  {/*
                    LES MEDIAS SONT AU NIVEAU DU CHAPITRE, PAS DE L'ACQUIS.
                    Verifie dans le schema le 07/09 : figures, videos et
                    diaporamas pendent au SUPPORT (`resource_id`), jamais a
                    l'acquis — aucune de ces tables ne porte d'`outcome_id`. Les
                    afficher sous chaque savoir affichait les 62 figures du
                    chapitre 15 autant de fois qu'on depliait une ligne.
                  */}
                  <div className="space-y-4 pt-2">
                    <ChapitreMedias
                      supports={supportsDuChapitre(chapitre.items, supportsParAcquis)}
                      decks={decksDuChapitre(chapitre.items, decksParAcquis)}
                      titreChapitre={chapitre.label}
                    />
                    <ul>
                      {chapitre.items.map((outcome) => (
                        <KnowledgeRow
                          key={outcome.id}
                          outcome={outcome}
                          spotlight={acquis !== undefined && outcome.code === acquis}
                          supports={supportsParAcquis.get(outcome.id) ?? []}
                          open={acquisOuvert === outcome.id}
                          onOpenChange={(ouvert) => setAcquisOuvert(ouvert ? outcome.id : null)}
                          {...(niveauDeclare.has(outcome.id)
                            ? { declaredLevel: niveauDeclare.get(outcome.id)! }
                            : {})}
                        />
                      ))}
                    </ul>
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </section>

      {/*
        « QUAND JE DOIS LES SAVOIR » A ETE SUPPRIME : c'etait la TROISIEME copie
        des memes jalons — ils sont deja sur `/espace` (prochaine echeance) et
        dans le Passeport (chronologie complete). La doctrine reste « le
        Passeport porte la chronologie complete » ; un rappel de plus n'y
        ajoutait rien et poussait les connaissances hors de l'ecran.
      */}
    </div>
  );
}

/**
 * LES SUPPORTS D'UN CHAPITRE : l'union de ceux qui couvrent ses acquis, sans
 * doublon. Un chapitre SFC est UN support qui traite une quinzaine de
 * connaissances ; sans cette deduplication, il apparaitrait quinze fois.
 */
function supportsDuChapitre(
  items: readonly { readonly id: OutcomeId }[],
  parAcquis: ReadonlyMap<string, readonly CoveringSupport[]>,
): readonly CoveringSupport[] {
  const vus = new Map<string, CoveringSupport>();
  for (const item of items) {
    for (const support of parAcquis.get(item.id) ?? []) vus.set(support.id, support);
  }
  return [...vus.values()];
}

function decksDuChapitre(
  items: readonly { readonly id: OutcomeId }[],
  parAcquis: ReadonlyMap<string, readonly CoveringDeck[]>,
): readonly CoveringDeck[] {
  const vus = new Map<string, CoveringDeck>();
  for (const item of items) {
    for (const deck of parAcquis.get(item.id) ?? []) vus.set(deck.mediaId, deck);
  }
  return [...vus.values()];
}

/**
 * CE QU'UN CHAPITRE PORTE EN PROPRE : ses figures, ses diaporamas commentes,
 * ses videos. Le texte, lui, reste sous chaque acquis — c'est la que
 * l'etudiant en a besoin, en regard de l'enonce qu'il travaille.
 *
 * IL N'Y A PAS DE TABLEAUX A AFFICHER : aucune entite tableau n'existe dans le
 * schema, ils sont aplatis dans le texte du cours. Les extraire est un chantier
 * d'import, pas d'affichage.
 */
function ChapitreMedias({
  supports,
  decks,
  titreChapitre,
}: {
  readonly supports: readonly CoveringSupport[];
  readonly decks: readonly CoveringDeck[];
  /** Nomme le fil d'assistant ouvert sur ce chapitre. */
  readonly titreChapitre: string;
}) {
  const [texteOuvert, setTexteOuvert] = useState(false);
  const aiOuverte = useProgramAiEnabled();
  const videos = supports.filter((s) => s.format === "video");
  const textuels = supports.filter((s) => s.format !== "video");
  /*
   * UN SEUL CHAPITRE PORTE LE FIL. Un item du referentiel est presque toujours
   * couvert par un support textuel unique ; dans le cas contraire, ancrer le fil
   * sur le premier vaut mieux que d'en ouvrir plusieurs — l'etudiant pose une
   * question sur « l'item 221 », pas sur l'un de ses supports.
   */
  const premierTextuel = textuels[0];
  if (textuels.length === 0 && videos.length === 0 && decks.length === 0) return null;

  return (
    <div className="space-y-4">
      {/*
        LE TEXTE DU COURS EST ICI, UNE SEULE FOIS — et c'est desormais celui de
        l'edition 2026 (`course_sections`), avec ses titres et son ordre de
        lecture. `learning_resource_texts` reste en base comme archive de
        l'import 2022 : plus rien ne l'affiche. Decision de Stef, 09/09.

        « Integral » ET NON « du chapitre » : le texte du chapitre se lit
        maintenant a deux endroits — ici en entier, et par morceaux sous chaque
        connaissance. Le mot doit dire lequel des deux on ouvre.
      */}
      {textuels.length > 0 ? (
        <>
          <Button
            variant="outline"
            className="h-auto min-h-11 w-full gap-2 whitespace-normal px-3 text-center"
            onClick={() => setTexteOuvert((v) => !v)}
            aria-expanded={texteOuvert}
          >
            <FileText className="size-4 shrink-0" aria-hidden />
            {texteOuvert ? "Masquer le texte intégral" : "Lire le texte intégral"}
          </Button>
          {texteOuvert ? (
            <div className="bg-card space-y-4 rounded-lg border px-3 py-3">
              {/*
                L'ASSISTANT DU CHAPITRE, ENTRE LE BOUTON ET LE TEXTE (Stef,
                09/09). Sa place dit sa portee : il travaille sur le texte qui
                s'ouvre en dessous, et non sur une connaissance en particulier.
                Son fil porte un `resource_id` et aucun `outcome_id` — c'est ce
                qui, cote serveur, fait lire le chapitre plutot qu'un acquis.
              */}
              {aiOuverte && premierTextuel !== undefined ? (
                <AiCompanionInline
                  sujet={titreChapitre}
                  scope="knowledge"
                  resourceId={premierTextuel.id}
                />
              ) : null}
              {textuels.map((support) => (
                <ChapterTextPanel key={support.id} resourceId={support.id} />
              ))}
            </div>
          ) : null}
        </>
      ) : null}

      <ResourceFigures resourceIds={textuels.map((s) => s.id)} />

      {decks.map((deck) => (
        <Link
          key={deck.mediaId}
          to="/espace/ressources/$resourceId/lecture"
          params={{ resourceId: deck.mediaId }}
          className="flex min-h-11 items-center gap-2 rounded-lg border bg-card px-3 py-2.5 text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <PlayCircle className="size-4 shrink-0 text-primary" aria-hidden />
          <span className="min-w-0 flex-1">{deck.title}</span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {deck.slideCount} diapositives
          </span>
        </Link>
      ))}

      {videos.map((video) => (
        <section key={video.id}>
          <p className="mb-1 text-xs font-medium text-muted-foreground">{video.title}</p>
          <ResourceMediaPlayer resourceId={video.id} title={video.title} />
        </section>
      ))}
    </div>
  );
}

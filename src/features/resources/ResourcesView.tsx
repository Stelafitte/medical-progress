import { useState } from "react";
import { BookOpen, Globe, PlayCircle, Search } from "lucide-react";
import { Link } from "@tanstack/react-router";
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
import { useLearnerPassport } from "@/features/dashboard/useLearnerPassport";
import { ContentAiTutorPanel } from "@/features/resources/ContentAiTutorPanel";
import { KnowledgeRow, type CoveringSupport } from "@/features/resources/KnowledgeRow";
import {
  AI_GROUNDING_NOTICE_FR,
  CITATION_KIND_LABELS_FR,
  AI_STUDY_CTA_FR,
  WEB_REFERENCE_CTA_FR,
} from "@/domain/contentAi";
import { MEDIA_KIND_LABELS_FR } from "@/domain/mediaLibrary";
import { searchResources } from "@/domain/learnerLibrary";

export function ResourcesView() {
  const { data, isPending } = useLearnerPassport();
  const [search, setSearch] = useState("");

  if (isPending || !data) return <Skeleton className="h-64 w-full" />;

  const { outcomes } = data;
  const narratedDecks = searchResources(data.narratedDecks, search);
  const aiResources = searchResources(data.aiResources, search);

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
  const termeRecherche = search.trim().toLowerCase();
  const connaissances = outcomes
    .filter((o) => o.nature === "knowledge")
    .filter(
      (o) =>
        termeRecherche.length === 0 ||
        `${o.code} ${o.label}`.toLowerCase().includes(termeRecherche),
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
        { id: resource.id, title: resource.title },
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
      <SectionHeading
        title="Mes ressources théoriques"
        level={1}
        description="Ce que je dois savoir, chapitre par chapitre, avec le contenu des cours."
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

      {aiResources.length > 0 ? (
        <section className="space-y-4">
          <SectionHeading
            title={AI_STUDY_CTA_FR}
            level={2}
            description="Chaque support validé peut être interrogé, transformé en QCM, en cas clinique guidé ou en révision adaptative. Les réponses sont maquettées et citent leur référence dans le contenu validé."
          />
          <p className="rounded-md border border-border bg-secondary/40 px-4 py-3 text-sm text-muted-foreground">
            {AI_GROUNDING_NOTICE_FR}. Aucun traitement IA réel n'est effectué dans cette maquette.
          </p>
          <ul className="grid gap-4 md:grid-cols-2">
            {aiResources.map((item) => (
              <li key={item.mediaId}>
                <Card className="flex h-full flex-col">
                  <CardHeader>
                    <div className="flex flex-wrap items-center gap-2">
                      {item.kind === "web_page" ? (
                        <Globe className="size-4 text-primary" aria-hidden />
                      ) : (
                        <BookOpen className="size-4 text-primary" aria-hidden />
                      )}
                      <Badge variant="outline" className="font-normal">
                        {MEDIA_KIND_LABELS_FR[item.kind]}
                      </Badge>
                      <Badge variant="secondary" className="font-normal">
                        {item.sourceVersion}
                      </Badge>
                    </div>
                    <CardTitle className="text-base">{item.title}</CardTitle>
                    <CardDescription>{item.module}</CardDescription>
                  </CardHeader>
                  <CardContent className="mt-auto space-y-3">
                    <p className="text-xs text-muted-foreground">
                      Références citables :{" "}
                      {item.citations.length > 0
                        ? `${CITATION_KIND_LABELS_FR[item.citations[0]!.kind]} — ${item.citations
                            .map((c) => c.locator)
                            .join(" · ")}`
                        : "aucune"}
                      .
                    </p>
                    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                      {item.canonicalUrl ? (
                        <Button
                          asChild
                          variant="secondary"
                          className="min-h-11 w-full gap-2 sm:w-auto"
                        >
                          <a href={item.canonicalUrl} target="_blank" rel="noreferrer noopener">
                            <Globe className="size-4" aria-hidden />
                            {WEB_REFERENCE_CTA_FR}
                          </a>
                        </Button>
                      ) : null}
                      {item.hasNarratedPlayer ? (
                        <Button asChild className="min-h-11 w-full gap-2 sm:w-auto">
                          <Link
                            to="/espace/ressources/$resourceId/lecture"
                            params={{ resourceId: item.mediaId }}
                          >
                            <PlayCircle className="size-4" aria-hidden />
                            Consulter le cours
                          </Link>
                        </Button>
                      ) : null}
                      <ContentAiTutorPanel resource={item} />
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-3">
        <SectionHeading
          title="Les connaissances du programme"
          level={2}
          description="Ce que vous devez savoir, chapitre par chapitre. Dépliez un chapitre pour voir ses connaissances et les supports qui les traitent."
        />
        {chapitresConnaissances.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucune connaissance ne correspond à cette recherche.
          </p>
        ) : (
          <Accordion type="multiple" className="w-full">
            {chapitresConnaissances.map((chapitre) => (
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
                    {chapitre.items.map((outcome) => (
                      <KnowledgeRow
                        key={outcome.id}
                        outcome={outcome}
                        supports={supportsParAcquis.get(outcome.id) ?? []}
                        {...(niveauDeclare.has(outcome.id)
                          ? { declaredLevel: niveauDeclare.get(outcome.id)! }
                          : {})}
                      />
                    ))}
                  </ul>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </section>
    </div>
  );
}

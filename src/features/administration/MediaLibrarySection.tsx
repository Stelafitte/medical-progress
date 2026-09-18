/**
 * Catalogue des supports du programme — LECTURE RÉELLE depuis Supabase.
 * Les supports affichés viennent de `learning_resources` ; ils sont projetés
 * sur le type riche `MediaResource` de la maquette (module, historique de
 * versions et marquage "à réviser" restent donc neutres tant que la base ne
 * les porte pas). La création d'un support (AddMediaDialog) est réelle.
 * Reste à câbler : la publication d'un PPTX sonorisé depuis
 * PptxConverterDialog (la conversion est réelle, la mise en ligne non).
 */
import { useMemo, useState } from "react";
import {
  FileText,
  Filter,
  Globe,
  Link2,
  PlayCircle,
  Presentation,
  Search,
  Stethoscope,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState, PanelCard, ScopeNotice, StatCard } from "@/features/professional/mock-ui";
import { AddMediaDialog } from "@/features/administration/AddMediaDialog";
import { PptxConverterDialog } from "@/features/administration/PptxConverterDialog";
import { NarratedPackagePublishDialog } from "@/features/administration/NarratedPackagePublishDialog";

import { MediaDetailDialog } from "@/features/administration/MediaDetailDialog";
import {
  CONVERSION_STATUS_LABELS_FR,
  MEDIA_KIND_LABELS_FR,
  MEDIA_STATUS_LABELS_FR,
  MEDIA_STORAGE_NOTICE_FR,
  MEDIA_VISIBILITY_LABELS_FR,
  conversionStatusOf,
  filterMedia,
  sortMediaForCatalogue,
  mediaIndicators,
  mediaModules,
  type MediaKind,
  type MediaResource,
  type MediaStatus,
} from "@/domain/mediaLibrary";
import type { CurriculumVersionId, Outcome, Person, ProgramId } from "@/domain/types";

const KIND_ICONS: Record<MediaKind, typeof FileText> = {
  pdf: FileText,
  slides: Presentation,
  slides_audio: Presentation,
  video: PlayCircle,
  web_page: Globe,
  link: Link2,
  quiz: FileText,
  clinical_case: Stethoscope,
};

const statusVariant = (status: MediaStatus) =>
  status === "published" ? "secondary" : status === "draft" ? "outline" : "outline";

const formatDate = (iso: string) => new Date(iso).toLocaleDateString("fr-FR");

export function MediaLibrarySection({
  programName,
  programId,
  curriculumVersionId,
  media,
  outcomes,
  people,
}: {
  programName: string;
  programId: ProgramId;
  /** `undefined` tant que le programme n'a aucune version de curriculum (cas rare, déjà géré ainsi ailleurs dans AdminKnowledgeBase) : la création reste alors indisponible. */
  curriculumVersionId: CurriculumVersionId | undefined;
  media: readonly MediaResource[];
  outcomes: readonly Outcome[];
  people: readonly Person[];
}) {
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<MediaKind | "all">("all");
  const [status, setStatus] = useState<MediaStatus | "all">("all");
  const [moduleName, setModuleName] = useState<string>("all");
  const [onlyUnlinked, setOnlyUnlinked] = useState(false);
  const [lastAction, setLastAction] = useState<string | null>(null);

  const indicators = useMemo(() => mediaIndicators(media), [media]);
  const modules = useMemo(() => mediaModules(media), [media]);
  const visible = useMemo(
    () =>
      sortMediaForCatalogue(
        filterMedia(media, { search, kind, status, module: moduleName, onlyUnlinked }),
      ),
    [media, search, kind, status, moduleName, onlyUnlinked],
  );

  const authorName = (id: string) =>
    people.find((p) => p.id === id)?.fullName ?? "Équipe pédagogique";
  const outcomeCodes = (resource: MediaResource) =>
    resource.outcomeIds.map((id) => outcomes.find((o) => o.id === id)?.code ?? id).join(" · ");

  return (
    <div className="space-y-6">
      <ScopeNotice>
        Ressources théoriques de <strong>{programName}</strong> uniquement : aucun support d'un
        autre programme n'est chargé. Les métadonnées sont distinctes du futur fichier binaire —{" "}
        {MEDIA_STORAGE_NOTICE_FR}.
      </ScopeNotice>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Supports publiés" value={indicators.published} />
        <StatCard label="Brouillons" value={indicators.drafts} />
        <StatCard label="À réviser" value={indicators.needsReview} />
        <StatCard
          label="Sans objectif"
          value={indicators.unlinked}
          hint="Non rattachés à un acquis"
        />
      </div>

      <PanelCard
        collapsible
        title="Catalogue des supports"
        description={`${visible.length} support(s) affiché(s) sur ${indicators.total}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {curriculumVersionId ? (
              <>
                {/*
                 * La conversion PPTX -> lecteur web est réelle et locale, mais
                 * sa publication (RPC `publish_narrated_deck`) n'est pas encore
                 * branchée : ce dialogue ne reçoit donc pas encore le contexte
                 * programme/version/objectifs.
                 */}
                <PptxConverterDialog onConverted={setLastAction} />
                <NarratedPackagePublishDialog
                  programName={programName}
                  programId={programId}
                  curriculumVersionId={curriculumVersionId}
                  outcomes={outcomes}
                  onPublished={(title) => setLastAction(`Cours commenté publié : « ${title} ».`)}
                />
                <AddMediaDialog
                  programName={programName}
                  programId={programId}
                  curriculumVersionId={curriculumVersionId}
                  outcomes={outcomes}
                  onSaved={(title) =>
                    setLastAction(`Support créé : « ${title} » (visible dans le catalogue réel).`)
                  }
                />
              </>
            ) : (
              <Badge variant="outline" className="font-normal">
                Création indisponible : aucune version de curriculum
              </Badge>
            )}
          </div>
        }
      >
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="media-search" className="text-xs">
              Rechercher
            </Label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                id="media-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Titre, module, version…"
                className="pl-9"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1">
              <Label className="text-xs" htmlFor="media-kind">
                Type
              </Label>
              <Select value={kind} onValueChange={(value) => setKind(value as MediaKind | "all")}>
                <SelectTrigger id="media-kind">
                  <SelectValue placeholder="Tous les types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les types</SelectItem>
                  {(Object.keys(MEDIA_KIND_LABELS_FR) as MediaKind[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {MEDIA_KIND_LABELS_FR[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs" htmlFor="media-status">
                Statut
              </Label>
              <Select
                value={status}
                onValueChange={(value) => setStatus(value as MediaStatus | "all")}
              >
                <SelectTrigger id="media-status">
                  <SelectValue placeholder="Tous les statuts" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les statuts</SelectItem>
                  {(Object.keys(MEDIA_STATUS_LABELS_FR) as MediaStatus[]).map((s) => (
                    <SelectItem key={s} value={s}>
                      {MEDIA_STATUS_LABELS_FR[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs" htmlFor="media-module">
                Module
              </Label>
              <Select value={moduleName} onValueChange={setModuleName}>
                <SelectTrigger id="media-module">
                  <SelectValue placeholder="Tous les modules" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les modules</SelectItem>
                  {modules.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button
            type="button"
            variant={onlyUnlinked ? "secondary" : "outline"}
            size="sm"
            className="min-h-11 w-full gap-2 sm:w-auto"
            aria-pressed={onlyUnlinked}
            onClick={() => setOnlyUnlinked((v) => !v)}
          >
            <Filter className="size-4" aria-hidden />
            Supports sans objectif rattaché
          </Button>
        </div>

        {lastAction ? (
          <p
            role="status"
            className="rounded-md border border-border bg-secondary/40 px-3 py-2 text-sm"
          >
            {lastAction}
          </p>
        ) : null}

        {visible.length === 0 ? (
          <EmptyState>Aucun support ne correspond à cette recherche.</EmptyState>
        ) : (
          <>
            {/* Mobile : cartes, aucune table à faire défiler à l'aveugle. */}
            <ul className="grid gap-3 md:hidden">
              {visible.map((resource) => {
                const Icon = KIND_ICONS[resource.kind];
                return (
                  <li key={resource.id} className="rounded-lg border border-border p-3">
                    <div className="flex items-start gap-2">
                      <Icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="break-words font-medium">{resource.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {MEDIA_KIND_LABELS_FR[resource.kind]} · {resource.module}
                        </p>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge variant={statusVariant(resource.status)} className="font-normal">
                            {MEDIA_STATUS_LABELS_FR[resource.status]}
                          </Badge>
                          <Badge variant="outline" className="font-mono text-[10px]">
                            {resource.version}
                          </Badge>
                          {resource.narrated ? (
                            <Badge variant="outline" className="font-normal">
                              {CONVERSION_STATUS_LABELS_FR[conversionStatusOf(resource)]}
                            </Badge>
                          ) : null}
                          {resource.needsReview ? (
                            <Badge variant="outline" className="font-normal">
                              à réviser
                            </Badge>
                          ) : null}
                          {resource.outcomeIds.length === 0 ? (
                            <Badge variant="outline" className="font-normal">
                              sans objectif
                            </Badge>
                          ) : null}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Objectifs : {outcomeCodes(resource) || "aucun"} — MAJ{" "}
                          {formatDate(resource.updatedAt)}
                        </p>
                        <MediaDetailDialog
                          resource={resource}
                          outcomes={outcomes}
                          authorName={authorName(resource.authorPersonId)}
                          onAction={(label) => setLastAction(label)}
                        />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>

            {/* Desktop : tableau complet. */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Titre</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Module</TableHead>
                    {/*
                      Pas de colonne « Objectifs » : un chapitre en porte jusqu'à
                      26, la cellule faisait trois lignes de codes et écrasait le
                      reste du tableau. Le détail les liste avec leur intitulé,
                      ce qu'une colonne de codes ne fera jamais.
                    */}
                    <TableHead>Version</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Conversion</TableHead>
                    <TableHead>Visibilité</TableHead>
                    <TableHead>MAJ</TableHead>
                    <TableHead>Auteur</TableHead>
                    <TableHead className="text-right">Détail</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((resource) => (
                    <TableRow key={resource.id}>
                      <TableCell className="max-w-56 font-medium">{resource.title}</TableCell>
                      <TableCell>{MEDIA_KIND_LABELS_FR[resource.kind]}</TableCell>
                      <TableCell>{resource.module}</TableCell>
                      <TableCell className="font-mono text-xs">{resource.version}</TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(resource.status)} className="font-normal">
                          {MEDIA_STATUS_LABELS_FR[resource.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        {resource.narrated
                          ? CONVERSION_STATUS_LABELS_FR[conversionStatusOf(resource)]
                          : "—"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {MEDIA_VISIBILITY_LABELS_FR[resource.visibility]}
                      </TableCell>
                      <TableCell className="text-xs">{formatDate(resource.updatedAt)}</TableCell>
                      <TableCell className="text-xs">
                        {authorName(resource.authorPersonId)}
                      </TableCell>
                      <TableCell className="text-right">
                        <MediaDetailDialog
                          resource={resource}
                          outcomes={outcomes}
                          authorName={authorName(resource.authorPersonId)}
                          onAction={(label) => setLastAction(label)}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}

        <p className="text-xs text-muted-foreground">{MEDIA_STORAGE_NOTICE_FR}.</p>
      </PanelCard>
    </div>
  );
}

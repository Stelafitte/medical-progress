/**
 * Outil statistique pluriannuel (maquette, données de démonstration).
 * Toutes les promotions restent consultables : rien n'est écrasé d'une année
 * sur l'autre, les instantanés clôturés servent de référence historique.
 */
import { useMemo, useState } from "react";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
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
import {
  EmptyState,
  MockBadge,
  PanelCard,
  ScopeNotice,
  StatCard,
} from "@/features/professional/mock-ui";
import { useStatistics } from "@/features/statistics/useStatistics";
import { compareCohorts, formatDelta, formatRate, sortByAcademicYear } from "@/domain/statistics";
import { useSession } from "@/application/session";

export function StatisticsView() {
  const { activeProgram } = useSession();
  const { data, isPending } = useStatistics();
  const [leftId, setLeftId] = useState<string>("");
  const [rightId, setRightId] = useState<string>("");

  const ordered = useMemo(() => (data ? sortByAcademicYear(data.snapshots) : []), [data]);

  if (isPending || !data) return <Skeleton className="h-80 w-full" />;

  const left = ordered.find((s) => s.id === leftId) ?? ordered[0];
  const right = ordered.find((s) => s.id === rightId) ?? ordered[ordered.length - 1];
  const comparison = left && right ? compareCohorts(left, right) : [];

  return (
    <div className="space-y-8">
      <SectionHeading
        eyebrow={activeProgram.name}
        title="Statistiques et suivi pluriannuel"
        level={1}
        action={<MockBadge />}
        description={`${activeProgram.name} — comparaison des promotions et des années universitaires.`}
      />

      <ScopeNotice>
        {data.isProgramWide
          ? "Périmètre programme : toutes les promotions, agrégats anonymes."
          : `Périmètre limité à vos stages (${data.supervisedPlacementIds.length} stage(s)). Les indicateurs sont agrégés et anonymes.`}{" "}
        Les instantanés de promotion sont conservés sans limite de durée : chaque année
        universitaire reste comparable aux précédentes.
      </ScopeNotice>

      {ordered.length === 0 ? (
        <EmptyState>Aucune promotion rattachée à votre périmètre pour ce programme.</EmptyState>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Années couvertes" value={data.summary.yearsCovered} />
            <StatCard
              label="Apprenants cumulés"
              value={data.summary.cumulativeLearnerCount}
              hint="Toutes promotions conservées"
            />
            <StatCard
              label="Réussite moyenne (promotions clôturées)"
              value={formatRate(data.summary.meanCompletionRate)}
              hint={`Meilleure année : ${data.summary.bestYear ?? "—"}`}
            />
            <StatCard
              label="Année en cours vs moyenne"
              value={formatDelta(data.summary.deltaToHistoricalMean)}
              hint={data.summary.currentYear ?? "—"}
            />
          </div>

          <PanelCard
            title="Évolution année après année"
            description="Taux de réussite, compétences réelles et effectifs par promotion."
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Année</TableHead>
                  <TableHead>Promotion</TableHead>
                  <TableHead className="text-right">Apprenants</TableHead>
                  <TableHead>Réussite</TableHead>
                  <TableHead className="text-right">Compétences réelles</TableHead>
                  <TableHead className="text-right">Écart n-1</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.trend.map((point) => (
                  <TableRow key={point.academicYear}>
                    <TableCell className="font-medium">{point.academicYear}</TableCell>
                    <TableCell>{point.cohortLabel}</TableCell>
                    <TableCell className="text-right">{point.learnerCount}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Progress
                          value={Math.round(point.completionRate * 100)}
                          className="h-2 w-24"
                        />
                        <span className="text-xs text-muted-foreground">
                          {formatRate(point.completionRate)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{formatRate(point.realRate)}</TableCell>
                    <TableCell className="text-right">
                      {formatDelta(point.completionDelta)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </PanelCard>

          <PanelCard
            title="Comparer deux promotions"
            description="Les promotions clôturées restent exploitables indéfiniment."
          >
            <div className="mb-4 grid gap-3 sm:grid-cols-2">
              <Select value={left?.id ?? ""} onValueChange={setLeftId}>
                <SelectTrigger aria-label="Promotion de référence">
                  <SelectValue placeholder="Promotion de référence" />
                </SelectTrigger>
                <SelectContent>
                  {ordered.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.academicYear} — {s.cohortLabel}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={right?.id ?? ""} onValueChange={setRightId}>
                <SelectTrigger aria-label="Promotion comparée">
                  <SelectValue placeholder="Promotion comparée" />
                </SelectTrigger>
                <SelectContent>
                  {ordered.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.academicYear} — {s.cohortLabel}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Indicateur</TableHead>
                  <TableHead className="text-right">{left?.academicYear}</TableHead>
                  <TableHead className="text-right">{right?.academicYear}</TableHead>
                  <TableHead className="text-right">Écart</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {comparison.map((row) => {
                  const isRate = row.left <= 1 && row.right <= 1;
                  return (
                    <TableRow key={row.label}>
                      <TableCell>{row.label}</TableCell>
                      <TableCell className="text-right">
                        {isRate ? formatRate(row.left) : row.left}
                      </TableCell>
                      <TableCell className="text-right">
                        {isRate ? formatRate(row.right) : row.right}
                      </TableCell>
                      <TableCell className="text-right">
                        {isRate ? formatDelta(row.delta) : row.delta}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </PanelCard>

          <PanelCard
            title="Conservation des données"
            description="Ce que la plateforme garde d'une année à l'autre."
          >
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Badge variant="outline" className="me-2 font-normal">
                  Conservé
                </Badge>
                Instantanés agrégés par promotion et par année universitaire, jamais écrasés.
              </li>
              <li>
                <Badge variant="outline" className="me-2 font-normal">
                  Conservé
                </Badge>
                Preuves validées et validations humaines, rattachées à l'inscription d'origine.
              </li>
              <li>
                <Badge variant="outline" className="me-2 font-normal">
                  Prévu
                </Badge>
                Export CSV et comparaison inter-programmes pour l'administration plateforme.
              </li>
            </ul>
          </PanelCard>
        </>
      )}
    </div>
  );
}

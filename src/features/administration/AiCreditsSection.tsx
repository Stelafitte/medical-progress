/**
 * Comptabilité des crédits IA par enseignement (MAQUETTE).
 *
 * Aucun appel IA n'est émis et aucune consommation réelle n'est mesurée :
 * les écritures affichées sont des données de démonstration en mémoire.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Coins } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
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
import { useDataAccess, useSession } from "@/application/session";
import {
  AI_CREDITS_GOVERNANCE_NOTICE_FR,
  AI_CREDITS_MOCK_NOTICE_FR,
  AI_CREDIT_BUDGET_STATE_LABELS_FR,
  buildAiCreditAccount,
  projectPeriodCredits,
  type AiCreditBreakdownRow,
} from "@/domain/aiCredits";
import { CONTENT_AI_MODE_LABELS_FR } from "@/domain/contentAi";

function BreakdownList({
  title,
  rows,
}: {
  title: string;
  rows: readonly AiCreditBreakdownRow<string>[];
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{title}</p>
      {rows.length === 0 ? (
        <EmptyState>Aucune écriture.</EmptyState>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.key} className="space-y-1">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate">{row.label}</span>
                <span className="shrink-0 text-muted-foreground">
                  {row.credits} cr. · {Math.round(row.share * 100)} %
                </span>
              </div>
              <Progress
                value={row.share * 100}
                aria-label={`${row.label} : ${row.credits} crédits`}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function AiCreditsSection() {
  const data = useDataAccess();
  const { activeProgram } = useSession();

  const { data: loaded, isPending } = useQuery({
    queryKey: ["ai-credits", activeProgram.id],
    queryFn: async () => {
      const [entries, budget, cohorts] = await Promise.all([
        data.aiCredits.listEntries(activeProgram.id),
        data.aiCredits.getBudget(activeProgram.id),
        data.programs.listCohorts(activeProgram.id),
      ]);
      return { entries, budget, cohorts };
    },
  });

  const account = useMemo(() => {
    if (!loaded) return undefined;
    return buildAiCreditAccount(activeProgram.id, loaded.entries, loaded.budget, {
      cohort: (id) => loaded.cohorts.find((c) => c.id === id)?.label ?? id,
      mode: (mode) => CONTENT_AI_MODE_LABELS_FR[mode],
    });
  }, [loaded, activeProgram.id]);

  if (isPending || !account) return <Skeleton className="h-64 w-full" />;

  const budget = account.budget;
  const percent = Math.min(100, Math.round(account.consumedRatio * 100));
  const projection = projectPeriodCredits(account, account.byMonth.length, 12);
  const stateVariant = account.state === "ok" ? "secondary" : "outline";

  return (
    <div className="space-y-6">
      <ScopeNotice>
        Comptabilité des crédits IA de <strong>{activeProgram.name}</strong>. Chaque usage est
        imputé à l'enseignement (version de cursus et promotion). {AI_CREDITS_MOCK_NOTICE_FR}.
      </ScopeNotice>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Crédits consommés" value={account.totalCredits} />
        <StatCard
          label="Enveloppe"
          value={budget ? budget.allocatedCredits : "—"}
          {...(budget ? { hint: budget.periodLabel } : {})}
        />
        <StatCard label="Crédits restants" value={budget ? account.remainingCredits : "—"} />
        <StatCard label="Écritures" value={account.entryCount} hint="Unités facturables simulées" />
      </div>

      <PanelCard
        title="Consommation de la période"
        description="Suivi de l'enveloppe déclarée pour cet enseignement."
        action={<MockBadge />}
      >
        <div className="space-y-3">
          <Progress value={percent} aria-label="Consommation des crédits IA" />
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant={stateVariant}>{AI_CREDIT_BUDGET_STATE_LABELS_FR[account.state]}</Badge>
            <span className="text-muted-foreground">{percent} % de l'enveloppe</span>
            {budget ? (
              <>
                <Badge variant="outline" className="font-normal">
                  Seuil d'alerte {Math.round(budget.warningRatio * 100)} %
                </Badge>
                <Badge variant="outline" className="font-normal">
                  Plafond dur {budget.hardCapCredits} cr.
                </Badge>
                <Badge variant="outline" className="font-normal">
                  Vocal {budget.voiceAllowed ? "autorisé" : "désactivé"}
                </Badge>
              </>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            Projection annuelle linéaire : {projection} crédits (indicative). {budget?.note ?? ""}
          </p>
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <Coins className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>{AI_CREDITS_GOVERNANCE_NOTICE_FR}.</span>
          </p>
        </div>
      </PanelCard>

      <PanelCard
        title="Répartition analytique"
        description="Par palier de modèle, par usage, par promotion et par rôle demandeur."
      >
        <div className="grid gap-6 md:grid-cols-2">
          <BreakdownList title="Par palier de modèle" rows={account.byTier} />
          <BreakdownList title="Par mode d'usage" rows={account.byMode} />
          <BreakdownList title="Par promotion" rows={account.byCohort} />
          <BreakdownList title="Par rôle demandeur" rows={account.byActorRole} />
        </div>
      </PanelCard>

      <PanelCard
        title="Consommation mensuelle"
        description="Historique conservé d'une année et d'une promotion à l'autre."
      >
        {account.byMonth.length === 0 ? (
          <EmptyState>Aucune écriture sur la période.</EmptyState>
        ) : (
          <>
            <ul className="space-y-2 md:hidden">
              {[...account.byMonth]
                .sort((a, b) => a.key.localeCompare(b.key))
                .map((row) => (
                  <li
                    key={row.key}
                    className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
                  >
                    <span>{row.key}</span>
                    <Badge variant="outline" className="font-normal">
                      {row.credits} cr. / {row.units} u.
                    </Badge>
                  </li>
                ))}
            </ul>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mois</TableHead>
                    <TableHead>Unités</TableHead>
                    <TableHead>Crédits</TableHead>
                    <TableHead>Part</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...account.byMonth]
                    .sort((a, b) => a.key.localeCompare(b.key))
                    .map((row) => (
                      <TableRow key={row.key}>
                        <TableCell className="font-medium">{row.key}</TableCell>
                        <TableCell>{row.units}</TableCell>
                        <TableCell>{row.credits}</TableCell>
                        <TableCell>{Math.round(row.share * 100)} %</TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </PanelCard>
    </div>
  );
}

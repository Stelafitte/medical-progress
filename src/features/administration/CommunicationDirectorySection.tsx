/**
 * DESTINATAIRES ET ENVOIS — l'onglet demandé par Stef le 10/09.
 *
 * ⚠️ POURQUOI CET ÉCRAN LIT LE VIVIER, ET PAS SEULEMENT LES INSCRITS.
 * Mesure du 10/09 sur DFASM-CARDIO : UN apprenant inscrit, UN encadrant — et
 * VINGT-SIX personnes dans `people`. Un annuaire branché sur les seules
 * inscriptions aurait affiché deux lignes. Les gens à qui l'on veut écrire,
 * surtout pour une première connexion, sont précisément ceux qui n'ont pas
 * encore de compte. `program_directory` assemble donc les deux, et l'ÉTAT de
 * chaque ligne décide du geste applicable.
 *
 * CE QUI EST DÉLIBÉRÉMENT VISIBLE : l'état de chaque personne. Sans lui, on
 * réinvite quelqu'un de déjà connecté, et l'on croit avoir touché un désabonné.
 * C'est la seule information qui transforme une liste en outil.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Building2,
  ChevronDown,
  ChevronRight,
  GraduationCap,
  Stethoscope,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, PanelCard } from "@/features/professional/mock-ui";
import { useSession } from "@/application/session";
import { fetchProgramDirectory } from "@/infrastructure/supabase/communicationDirectory";
import {
  ACCOUNT_STATE_LABELS_FR,
  allSelected,
  groupDirectory,
  selectedRows,
  someSelected,
  toggleMany,
  type DirectoryAccountState,
  type DirectoryAudience,
  type DirectoryBlock,
  type DirectoryRow,
} from "@/domain/communicationDirectory";
import { CommunicationSendDialogs } from "@/features/administration/CommunicationSendDialogs";

const TOUCH = "min-h-11";

/**
 * UNE COULEUR PAR POPULATION (Stef, 18/09 : « sépare les entités, mets de la
 * couleur »). Ici la teinte ne décore pas : elle dit À QUI l'on écrit, et elle
 * reste la même du bandeau de synthèse jusqu'au bloc et à ses groupes — un
 * envoi aux encadrants ne se confond plus avec un envoi aux étudiants.
 */
const AUDIENCE_STYLE: Record<
  DirectoryAudience,
  { icon: LucideIcon; rail: string; tint: string; ink: string; hint: string }
> = {
  learner: {
    icon: GraduationCap,
    rail: "bg-sky-500",
    tint: "bg-sky-50 dark:bg-sky-950/40",
    ink: "text-sky-700 dark:text-sky-300",
    hint: "Les étudiants de chaque promotion.",
  },
  placement_supervisor: {
    icon: Stethoscope,
    rail: "bg-emerald-500",
    tint: "bg-emerald-50 dark:bg-emerald-950/40",
    ink: "text-emerald-700 dark:text-emerald-300",
    hint: "Les seniors qui encadrent au quotidien, par terrain.",
  },
  placement_manager: {
    icon: Building2,
    rail: "bg-amber-500",
    tint: "bg-amber-50 dark:bg-amber-950/40",
    ink: "text-amber-700 dark:text-amber-300",
    hint: "Les responsables qui valident le stage, par terrain.",
  },
};

/** La couleur dit l'action à poser, pas la sévérité : bleu = un geste possible. */
const STATE_VARIANT: Record<DirectoryAccountState, "default" | "secondary" | "outline"> = {
  active: "secondary",
  never_signed_in: "default",
  invited: "outline",
  staged: "default",
  no_account: "outline",
  no_address: "outline",
};

export function CommunicationDirectorySection() {
  const { activeProgram } = useSession();
  const [selection, setSelection] = useState<ReadonlySet<string>>(new Set());
  const [openBlocks, setOpenBlocks] = useState<readonly string[]>(["learner"]);
  const [openGroups, setOpenGroups] = useState<readonly string[]>([]);

  const annuaire = useQuery({
    queryKey: ["program-directory", activeProgram.id],
    queryFn: () => fetchProgramDirectory(activeProgram.id),
  });

  const rows = useMemo(() => annuaire.data ?? [], [annuaire.data]);
  const blocks = useMemo(() => groupDirectory(rows), [rows]);
  const retenues = useMemo(() => selectedRows(rows, selection), [rows, selection]);

  function basculer(cible: readonly DirectoryRow[], valeur: boolean) {
    setSelection((courante) => toggleMany(courante, cible, valeur));
  }

  if (annuaire.isPending) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (annuaire.isError) {
    return (
      <PanelCard title="Annuaire indisponible" description="Lecture refusée ou interrompue">
        <p className="text-sm text-destructive">
          {annuaire.error instanceof Error ? annuaire.error.message : "Erreur inconnue."}
        </p>
        <Button variant="outline" className={TOUCH} onClick={() => void annuaire.refetch()}>
          Réessayer
        </Button>
      </PanelCard>
    );
  }

  return (
    <div className="space-y-4 pb-28">
      <PanelCard
        title="Destinataires du programme"
        description={`${rows.length} personne(s) rattachée(s) à ${activeProgram.name}`}
      >
        <p className="text-muted-foreground text-sm">
          Les personnes déjà inscrites et celles qui attendent encore leur invitation figurent dans
          la même liste. L'état de chaque ligne indique ce qu'il est possible de lui envoyer. Les
          adresses sont volontairement masquées.
        </p>
        {/* Le bandeau de synthèse : une tuile par population, qui ouvre son bloc. */}
        <div className="grid gap-3 sm:grid-cols-3">
          {blocks.map((bloc) => {
            const style = AUDIENCE_STYLE[bloc.kind];
            const Icon = style.icon;
            const ouvert = openBlocks.includes(bloc.kind);
            return (
              <button
                key={bloc.kind}
                type="button"
                aria-pressed={ouvert}
                onClick={() =>
                  setOpenBlocks((keys) =>
                    keys.includes(bloc.kind)
                      ? keys.filter((k) => k !== bloc.kind)
                      : [...keys, bloc.kind],
                  )
                }
                className={`flex items-center gap-3 overflow-hidden rounded-xl border text-start transition-shadow hover:shadow-[var(--shadow-card)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${style.tint} ${ouvert ? "ring-2 ring-offset-1 ring-border" : ""}`}
              >
                <span className={`w-1.5 self-stretch ${style.rail}`} aria-hidden />
                <Icon className={`size-6 shrink-0 ${style.ink}`} aria-hidden />
                <span className="min-w-0 flex-1 py-3 pe-3">
                  <span
                    className="block font-display text-[26px] leading-none"
                    style={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    {bloc.total}
                  </span>
                  <span className={`mt-1 block text-[13px] font-medium ${style.ink}`}>
                    {bloc.label}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </PanelCard>

      {blocks.map((bloc) => (
        <BlocAnnuaire
          key={bloc.kind}
          bloc={bloc}
          selection={selection}
          ouvert={openBlocks.includes(bloc.kind)}
          onBasculerOuvert={() =>
            setOpenBlocks((keys) =>
              keys.includes(bloc.kind) ? keys.filter((k) => k !== bloc.kind) : [...keys, bloc.kind],
            )
          }
          groupesOuverts={openGroups}
          onBasculerGroupe={(id) =>
            setOpenGroups((keys) =>
              keys.includes(id) ? keys.filter((k) => k !== id) : [...keys, id],
            )
          }
          onSelection={basculer}
        />
      ))}

      <CommunicationSendDialogs
        selection={retenues}
        onVider={() => setSelection(new Set())}
        onRafraichir={() => void annuaire.refetch()}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function BlocAnnuaire({
  bloc,
  selection,
  ouvert,
  onBasculerOuvert,
  groupesOuverts,
  onBasculerGroupe,
  onSelection,
}: {
  bloc: DirectoryBlock;
  selection: ReadonlySet<string>;
  ouvert: boolean;
  onBasculerOuvert: () => void;
  groupesOuverts: readonly string[];
  onBasculerGroupe: (id: string) => void;
  onSelection: (rows: readonly DirectoryRow[], valeur: boolean) => void;
}) {
  const toutes = bloc.groups.flatMap((g) => g.rows);
  const tout = allSelected(toutes, selection);
  const partiel = someSelected(toutes, selection);
  const style = AUDIENCE_STYLE[bloc.kind];
  const Icon = style.icon;
  const choisis = toutes.filter((r) => selection.has(r.rowKey)).length;

  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-[var(--shadow-card)]">
      <div className={`h-1 ${style.rail}`} aria-hidden />
      <div className={`flex flex-wrap items-center gap-3 px-4 py-3 ${style.tint}`}>
        <Checkbox
          checked={partiel ? "indeterminate" : tout}
          onCheckedChange={(valeur) => onSelection(toutes, valeur === true)}
          disabled={toutes.length === 0}
          aria-label={`Sélectionner tout le bloc ${bloc.label}`}
        />
        <button
          type="button"
          onClick={onBasculerOuvert}
          className={`flex flex-1 items-center gap-2 text-start ${TOUCH}`}
          aria-expanded={ouvert}
        >
          {ouvert ? (
            <ChevronDown className="size-4 shrink-0" aria-hidden />
          ) : (
            <ChevronRight className="size-4 shrink-0" aria-hidden />
          )}
          <Icon className={`size-5 shrink-0 ${style.ink}`} aria-hidden />
          <span className="min-w-0">
            <span className="block font-display text-[19px] leading-tight">{bloc.label}</span>
            <span className="block text-xs text-muted-foreground">{style.hint}</span>
          </span>
          <span className="ms-auto flex shrink-0 items-center gap-2">
            {choisis > 0 ? <Badge className="font-normal">{choisis} sélectionné(s)</Badge> : null}
            <Badge variant="outline" className="bg-background font-normal">
              {bloc.total} personne(s)
            </Badge>
          </span>
        </button>
      </div>

      {ouvert && bloc.total === 0 && (
        <div className="px-4 pb-4">
          {/* Un bloc vide s'affiche vide : le masquer laisserait croire que la
              notion n'existe pas dans la plateforme. */}
          <EmptyState>Personne dans cette catégorie pour ce programme.</EmptyState>
        </div>
      )}

      {ouvert &&
        bloc.groups.map((groupe) => {
          const cle = `${bloc.kind}:${groupe.groupId}`;
          const deplie = groupesOuverts.includes(cle);
          const toutGroupe = allSelected(groupe.rows, selection);
          const partielGroupe = someSelected(groupe.rows, selection);
          return (
            <div key={cle} className="border-border border-t">
              <div className="flex flex-wrap items-center gap-3 px-4 py-2 ps-6">
                <Checkbox
                  checked={partielGroupe ? "indeterminate" : toutGroupe}
                  onCheckedChange={(valeur) => onSelection(groupe.rows, valeur === true)}
                  aria-label={`Sélectionner ${groupe.label}`}
                />
                <button
                  type="button"
                  onClick={() => onBasculerGroupe(cle)}
                  className={`flex flex-1 items-center gap-2 text-start ${TOUCH}`}
                  aria-expanded={deplie}
                >
                  {deplie ? (
                    <ChevronDown className="size-4 shrink-0" aria-hidden />
                  ) : (
                    <ChevronRight className="size-4 shrink-0" aria-hidden />
                  )}
                  <span className={`size-2 shrink-0 rounded-full ${style.rail}`} aria-hidden />
                  <span className="text-sm font-medium">{groupe.label}</span>
                  <span className="text-muted-foreground text-xs">
                    {groupe.rows.length} personne(s)
                  </span>
                </button>
              </div>

              {deplie && (
                <ul className="divide-border divide-y">
                  {groupe.rows.map((ligne) => (
                    <li
                      key={ligne.rowKey}
                      className="flex flex-wrap items-center gap-3 px-4 py-2 ps-8"
                    >
                      <Checkbox
                        checked={selection.has(ligne.rowKey)}
                        onCheckedChange={(valeur) => onSelection([ligne], valeur === true)}
                        aria-label={`Sélectionner ${ligne.fullName}`}
                      />
                      <span className="min-w-0 flex-1 truncate text-sm">{ligne.fullName}</span>
                      <span className="text-muted-foreground font-mono text-xs">
                        {ligne.emailMasked}
                      </span>
                      <Badge variant={STATE_VARIANT[ligne.accountState]} className="font-normal">
                        {ACCOUNT_STATE_LABELS_FR[ligne.accountState]}
                      </Badge>
                      {ligne.optedOut && (
                        <Badge variant="destructive" className="font-normal">
                          désabonné
                        </Badge>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
    </section>
  );
}

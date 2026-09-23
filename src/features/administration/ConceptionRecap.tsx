/**
 * LE RECAPITULATIF DE CONCEPTION — étape 4, avant la bascule au pilotage
 * (11/09, demandé par Stef).
 *
 * POURQUOI IL EXISTE. Les trois étapes précédentes décident chacune une
 * pièce : le modèle et les rubriques (1), la promotion (2), le planning (3).
 * Rien ne les rassemblait. Stef, le 11/09 : « en 4 on devrait avoir le résumé
 * de tout ce qui a été programmé au-dessus et notamment des associations
 * Programme / Promotion / Stage ». Sans ce résumé, la seule façon de savoir si
 * la promotion est réellement reliée à un terrain était d'ouvrir un autre
 * onglet — et on basculait au pilotage sans le savoir.
 *
 * ⚠️ IL NE RECOPIE RIEN, IL LIT. Chaque ligne vient de la base : promotion de
 * `cohorts`, rattachement au terrain de `supervision_groups` ET des
 * affectations, carnets de `stage_logs`. Un récapitulatif qui recopierait un
 * état d'écran finirait par affirmer le contraire de la base, ce qui est
 * exactement le défaut qu'on vient de corriger sur la rubrique « Stage ».
 *
 * ⚠️ IL NE CORRIGE RIEN NON PLUS. Chaque manque nomme l'endroit qui le
 * répare — une étape de cette page, ou l'onglet dédié. Dupliquer ici les
 * formulaires créerait un second chemin d'écriture pour les mêmes tables, donc
 * une seconde façon de se tromper.
 *
 * LE LIEN PROMOTION ↔ TERRAIN SE LIT DES DEUX COTES, et il le faut : un groupe
 * d'encadrement porte la promotion et le terrain, une affectation porte
 * l'étudiant et le terrain. Un étudiant affecté sans groupe n'apparaîtrait pas
 * si l'on ne regardait que les groupes — c'est le trou d'accès mesuré le
 * 11/09 au matin.
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useDataAccess } from "@/application/session";
import { etudiantsAffectes, formatFrDate } from "@/features/administration/adminProgramViewModel";
import type { ProgramAdminScope } from "@/features/administration/useProgramAdmin";
import { COHORT_STATUS_LABELS_FR, type CohortId } from "@/domain/types";

export type RubriqueRecap = {
  readonly id: string;
  readonly label: string;
  readonly retenue: boolean;
  readonly mode: string;
  readonly elements: number;
};

/** Une ligne du récapitulatif : un constat, et l'endroit qui le corrige. */
function Ligne({
  ok,
  titre,
  children,
  action,
}: {
  ok: boolean;
  titre: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <li className="border-border flex flex-wrap items-start gap-3 border-b py-3 last:border-b-0">
      {ok ? (
        <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
      ) : (
        <AlertTriangle className="text-destructive mt-0.5 size-4 shrink-0" aria-hidden />
      )}
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm font-medium">{titre}</p>
        <div className="text-muted-foreground space-y-1 text-xs">{children}</div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </li>
  );
}

export function ConceptionRecap({
  scope,
  modele,
  rubriques,
  cohortId,
  programStartsOn,
  programEndsOn,
  onEtape,
}: {
  scope: ProgramAdminScope;
  /** Nom du modèle retenu à l'étape 1, vide si aucun. */
  modele: string;
  rubriques: readonly RubriqueRecap[];
  cohortId: string | null;
  programStartsOn: string;
  programEndsOn: string;
  onEtape: (etape: "program" | "promotion" | "schedule") => void;
}) {
  const dataAccess = useDataAccess();
  const promotion = scope.cohorts.find((c) => c.id === cohortId);

  /* Les jalons ne sont pas dans le périmètre de l'écran : ils se lisent par
     promotion, et la promotion n'est choisie qu'ici. */
  const { data: jalons } = useQuery({
    queryKey: ["conception-recap-milestones", cohortId],
    queryFn: () => dataAccess.plan.listMilestones(cohortId as CohortId),
    enabled: cohortId !== null,
  });

  const retenues = rubriques.filter((r) => r.retenue);

  /* --- Le nœud : promotion ↔ terrain ------------------------------------ */
  const inscriptions = promotion
    ? scope.enrollments.filter((e) => (e.cohortId as string) === (promotion.id as string))
    : [];
  const idsInscriptions = new Set(inscriptions.map((e) => e.id as string));

  const affectations = scope.assignments.filter((a) =>
    idsInscriptions.has(a.enrollmentId as string),
  );
  const groupes = promotion
    ? scope.groups.filter((g) => (g.cohortId as string) === (promotion.id as string))
    : [];

  const terrainIds = new Set<string>();
  for (const g of groupes) terrainIds.add(g.placementId as string);
  for (const a of affectations) terrainIds.add(a.placementId as string);
  const terrains = scope.placements.filter((p) => terrainIds.has(p.id as string));

  const sansAffectation = inscriptions.filter(
    (e) => !affectations.some((a) => (a.enrollmentId as string) === (e.id as string)),
  );
  const carnets = scope.stageLogs.filter((log) => idsInscriptions.has(log.enrollmentId as string));

  const stageRetenu = rubriques.some((r) => r.id === "stage" && r.retenue);
  const stageRelie = terrains.length > 0;

  /*
   * LA RESULTANTE, EN UNE LIGNE — « programme X, promotion Y, stage Z »
   * (Stef, 11/09). C'est la phrase qu'on relit avant de basculer au pilotage :
   * elle ne vaut que parce que ses trois termes sont lus en base, pas repris
   * d'un état d'écran. Un terme manquant s'écrit en clair plutôt que de
   * disparaître — une phrase tronquée se lirait comme une phrase complète.
   */
  return (
    <div className="space-y-3">
      <p className="border-border bg-muted/40 rounded-lg border p-4 text-sm">
        <span className="font-medium">{scope.program?.name ?? "Programme"}</span>
        {" · "}
        {promotion ? (
          <span className="font-medium">{promotion.label}</span>
        ) : (
          <span className="text-destructive">promotion non choisie</span>
        )}
        {" · "}
        {!stageRetenu ? (
          <span className="text-muted-foreground">stage non retenu dans ce parcours</span>
        ) : terrains.length > 0 ? (
          <span className="font-medium">{terrains.map((t) => t.name).join(", ")}</span>
        ) : (
          <span className="text-destructive">stage non rattaché</span>
        )}
      </p>

      <ul className="mt-1">
        <Ligne
          ok={modele.trim().length > 0}
          titre="Programme et modèle"
          action={
            <Button type="button" size="sm" variant="outline" onClick={() => onEtape("program")}>
              Étape 1
            </Button>
          }
        >
          <p>
            {scope.program?.name ?? "Programme"} —{" "}
            {modele.trim().length > 0 ? modele : "aucun modèle choisi"}
          </p>
        </Ligne>

        <Ligne
          ok={retenues.length > 0}
          titre={`Rubriques retenues (${retenues.length})`}
          action={
            <Button type="button" size="sm" variant="outline" onClick={() => onEtape("program")}>
              Étape 1
            </Button>
          }
        >
          {retenues.length === 0 ? (
            <p>Aucune rubrique retenue : le parcours ne porte encore rien.</p>
          ) : (
            <ul className="space-y-0.5">
              {retenues.map((r) => (
                <li key={r.id}>
                  {r.label} — {r.elements} élément(s) · {r.mode}
                </li>
              ))}
            </ul>
          )}
        </Ligne>

        <Ligne
          ok={promotion !== undefined}
          titre="Promotion associée"
          action={
            <Button type="button" size="sm" variant="outline" onClick={() => onEtape("promotion")}>
              Étape 2
            </Button>
          }
        >
          {promotion ? (
            <p>
              {promotion.label} ({promotion.academicYear}) — {formatFrDate(promotion.startsOn)} →{" "}
              {formatFrDate(promotion.endsOn)} · {inscriptions.length} inscrit(s) · promotion{" "}
              {COHORT_STATUS_LABELS_FR[promotion.status]}
            </p>
          ) : (
            <p>Aucune promotion choisie : rien ne relie encore le programme à des apprenants.</p>
          )}
        </Ligne>

        {stageRetenu ? (
          <Ligne
            ok={stageRelie && sansAffectation.length === 0}
            titre="Promotion ↔ stage"
            action={
              <Button asChild size="sm" variant="outline">
                <Link to="/espace/administration/stages">Gestion des stages</Link>
              </Button>
            }
          >
            {promotion === undefined ? (
              <p>Choisissez d'abord la promotion (étape 2) pour vérifier son rattachement.</p>
            ) : !stageRelie ? (
              <p>
                La rubrique « Stage » est retenue, mais {promotion.label} n'est reliée à aucun
                terrain. Le rattachement se fait dans « Gestion des stages » : c'est le groupe
                d'encadrement qui porte à la fois la promotion et le terrain.
              </p>
            ) : (
              <>
                <ul className="space-y-0.5">
                  {terrains.map((t) => {
                    const affectationsDuTerrain = affectations.filter(
                      (a) => (a.placementId as string) === (t.id as string),
                    );
                    const groupesDuTerrain = groupes.filter(
                      (g) => (g.placementId as string) === (t.id as string),
                    );
                    return (
                      <li key={t.id}>
                        {t.name} ({t.site}) — {etudiantsAffectes(affectationsDuTerrain)} affecté(s)
                        sur {t.capacity} place(s)
                        {groupesDuTerrain.length > 0
                          ? ` · ${groupesDuTerrain.map((g) => g.label).join(", ")}`
                          : " · aucun groupe d'encadrement"}
                      </li>
                    );
                  })}
                </ul>
                <p>
                  {carnets.length} carnet(s) ouvert(s)
                  {sansAffectation.length > 0
                    ? ` · ⚠ ${sansAffectation.length} inscrit(s) de la promotion sans affectation`
                    : ""}
                </p>
              </>
            )}
          </Ligne>
        ) : null}

        <Ligne
          ok={programStartsOn !== "" && programEndsOn !== ""}
          titre="Planning"
          action={
            <Button type="button" size="sm" variant="outline" onClick={() => onEtape("schedule")}>
              Étape 3
            </Button>
          }
        >
          <p>
            {programStartsOn !== "" && programEndsOn !== ""
              ? `Bornes du programme : ${formatFrDate(programStartsOn)} → ${formatFrDate(programEndsOn)}`
              : "Bornes du programme non fixées"}
            {promotion ? ` · ${jalons?.length ?? 0} jalon(s) pour ${promotion.label}` : ""}
          </p>
        </Ligne>
      </ul>
    </div>
  );
}

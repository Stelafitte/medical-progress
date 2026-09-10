import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState, PanelCard } from "@/features/professional/mock-ui";
import { useDataAccess } from "@/application/session";
import type { Cohort, ProgramId, SupervisionGroup, SupervisionGroupId } from "@/domain/types";

/**
 * « SEMAINE EN SERVICE / SEMAINE CHEZ SOI » — le calendrier d'un groupe.
 *
 * POURQUOI CET ECRAN EXISTE. Les etudiants du DFASM alternent : pendant qu'une
 * moitie est dans le service, l'autre travaille chez elle. Cette alternance
 * n'etait modelisee nulle part, et le calendrier de presence de l'encadrant ne
 * savait donc pas distinguer une journee manquee d'une semaine ou personne
 * n'etait attendu -- il peignait faute de mieux toute semaine vide comme une
 * semaine off, ce qui masquait une semaine en service oubliee.
 *
 * L'ALTERNANCE EST PORTEE PAR LE GROUPE, pas par l'etudiant : deux moities qui
 * alternent l'une contre l'autre sont DEUX GROUPES de supervision, avec des
 * calendriers decales. Les encadrants, eux, restent communs aux deux --
 * `handle_people_activation` inscrit chaque nouvel encadrant dans tous les
 * groupes du terrain.
 *
 * DEUX GESTES, ET LEUR ORDRE. On pose d'abord le rythme theorique d'un clic,
 * puis on corrige semaine par semaine : un ferie, un congres ou un rattrapage
 * casse toujours le rythme, et regenerer effacerait les corrections.
 *
 * ⚠️ « NON RENSEIGNE » N'EST PAS « OFF ». Une semaine effacee redevient
 * inconnue, et le calendrier de l'encadrant le dit au lieu de conclure.
 */

const COULEUR: Record<"on" | "off" | "vide", string> = {
  on: "bg-emerald-600",
  off: "bg-sky-300 dark:bg-sky-800",
  vide: "bg-muted",
};

function cle(date: Date): string {
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const j = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${m}-${j}`;
}

/** Les lundis couvrant la periode de la promotion. */
function lundisDeLaPromotion(debut: string, fin: string): readonly Date[] {
  const premier = new Date(debut);
  premier.setDate(premier.getDate() - ((premier.getDay() + 6) % 7));
  premier.setHours(0, 0, 0, 0);
  const dernier = new Date(fin);
  const lundis: Date[] = [];
  for (let l = new Date(premier); l <= dernier; l.setDate(l.getDate() + 7)) {
    lundis.push(new Date(l));
  }
  return lundis;
}

export function SupervisionWeeksSection({
  programId,
  cohorts,
  cohortId,
  groups,
}: {
  readonly programId: ProgramId;
  readonly cohorts: readonly Cohort[];
  readonly cohortId: string;
  readonly groups: readonly SupervisionGroup[];
}) {
  const data = useDataAccess();
  const queryClient = useQueryClient();
  const [premiere, setPremiere] = useState<"on" | "off">("on");
  const [periode, setPeriode] = useState("1");

  const cohorte = cohorts.find((c) => c.id === cohortId);
  const groupesDeLaPromo = groups.filter((g) => g.cohortId === cohortId);

  const { data: semaines } = useQuery({
    queryKey: ["supervision-group-weeks", programId],
    queryFn: () => data.placements.listSupervisionGroupWeeks(programId),
  });

  const rafraichir = () => {
    void queryClient.invalidateQueries({ queryKey: ["supervision-group-weeks"] });
    void queryClient.invalidateQueries({ queryKey: ["supervision"] });
  };

  const poser = useMutation({
    mutationFn: (input: {
      groupId: SupervisionGroupId;
      weekStart: string;
      kind: "on" | "off" | null;
    }) => data.placements.setSupervisionGroupWeek(input),
    onSuccess: rafraichir,
    onError: (raison) =>
      toast.error(raison instanceof Error ? raison.message : "Semaine non enregistrée."),
  });

  const generer = useMutation({
    mutationFn: (groupId: SupervisionGroupId) =>
      data.placements.generateSupervisionGroupWeeks({
        groupId,
        firstKind: premiere,
        period: Number(periode),
      }),
    onSuccess: (posees) => {
      toast.success(`${posees} semaine(s) posée(s).`);
      rafraichir();
    },
    onError: (raison) =>
      toast.error(raison instanceof Error ? raison.message : "Calendrier non généré."),
  });

  if (!cohorte) return null;

  const lundis = lundisDeLaPromotion(cohorte.startsOn.slice(0, 10), cohorte.endsOn.slice(0, 10));

  return (
    <PanelCard
      title="Semaines en service et semaines de travail personnel"
      description="Une case par semaine. Cliquez pour faire tourner : non renseignée, en service, travail personnel."
    >
      {groupesDeLaPromo.length === 0 ? (
        <EmptyState>
          Cette promotion n'a pas encore de groupe d'encadrement. Créez-en un ci-dessus — et deux si
          les étudiants alternent par moitiés.
        </EmptyState>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="premiere-semaine">
                Première semaine
              </label>
              <Select value={premiere} onValueChange={(v) => setPremiere(v as "on" | "off")}>
                <SelectTrigger id="premiere-semaine" className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="on">en service</SelectItem>
                  <SelectItem value="off">travail personnel</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="periode-alternance">
                Alternance
              </label>
              <Select value={periode} onValueChange={setPeriode}>
                <SelectTrigger id="periode-alternance" className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">une semaine sur deux</SelectItem>
                  <SelectItem value="2">deux semaines sur quatre</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-muted-foreground text-[12.5px]">
              Générer remplace tout le calendrier du groupe.
            </p>
          </div>

          {groupesDeLaPromo.map((groupe) => {
            const siennes = new Map(
              (semaines ?? [])
                .filter((w) => w.groupId === groupe.id)
                .map((w) => [w.weekStart, w.kind] as const),
            );
            return (
              <div key={groupe.id} className="space-y-2 rounded-xl border p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{groupe.label}</span>
                  <Badge variant="outline" className="font-normal">
                    {groupe.memberEnrollmentIds.length} étudiant(s)
                  </Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    className="ms-auto"
                    disabled={generer.isPending}
                    onClick={() => generer.mutate(groupe.id)}
                  >
                    Générer l'alternance
                  </Button>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {lundis.map((lundi) => {
                    const k = cle(lundi);
                    const etat = siennes.get(k) ?? "vide";
                    const suivant = etat === "vide" ? "on" : etat === "on" ? "off" : null;
                    return (
                      <button
                        key={k}
                        type="button"
                        disabled={poser.isPending}
                        title={`Semaine du ${lundi.toLocaleDateString("fr-FR")} — ${
                          etat === "on"
                            ? "en service"
                            : etat === "off"
                              ? "travail personnel"
                              : "non renseignée"
                        }`}
                        className="flex flex-col items-center gap-1"
                        onClick={() =>
                          poser.mutate({ groupId: groupe.id, weekStart: k, kind: suivant })
                        }
                      >
                        <span className={`size-6 rounded ${COULEUR[etat]}`} aria-hidden />
                        <span className="text-muted-foreground text-[10px] tabular-nums">
                          {lundi.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          <ul className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
            <li className="flex items-center gap-1.5">
              <span className={`size-3 rounded-[2px] ${COULEUR.on}`} aria-hidden /> en service
            </li>
            <li className="flex items-center gap-1.5">
              <span className={`size-3 rounded-[2px] ${COULEUR.off}`} aria-hidden /> travail
              personnel
            </li>
            <li className="flex items-center gap-1.5">
              <span className={`size-3 rounded-[2px] ${COULEUR.vide}`} aria-hidden /> non renseignée
            </li>
          </ul>
        </div>
      )}
    </PanelCard>
  );
}

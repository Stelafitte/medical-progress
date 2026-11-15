/**
 * UN SEUL TABLEAU D'ENCADRANTS (demande de Stef, 15/11).
 *
 * Avant : un tableau « Retirer ou supprimer » et une liste « Ajouter un
 * encadrant », deux vues du même monde qui ne s'accordaient pas. Maintenant :
 * une ligne par encadrant (synchronisé, ajouté à la main, ou déjà actif), et
 * les mêmes gestes pour une personne ou pour une sélection :
 *   - Inviter (lien d'activation, ou nouveau lien si le compte existe) ;
 *   - Écrire un message ;
 *   - Rattacher à un groupe (rôle actif + entrée dans les encadrants du groupe) ;
 *   - Retirer / Réintégrer / Supprimer (barre partagée).
 * Le formulaire d'ajout vit dans la même carte, replié.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link2, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { PanelCard } from "@/features/professional/mock-ui";
import { PeopleRemovalBar } from "@/features/administration/PeopleRemovalBar";
import { CommunicationSendDialogs } from "@/features/administration/CommunicationSendDialogs";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDataAccess, useSession } from "@/application/session";
import { fetchProgramDirectory } from "@/infrastructure/supabase/communicationDirectory";
import {
  PENDING_PERSON_ISSUE_LABELS_FR,
  fullNameOfPendingPerson,
  validatePendingPersonCreation,
} from "@/domain/peopleStaging";
import type { DirectoryRow } from "@/domain/communicationDirectory";
import type { PersonId, PlacementId } from "@/domain/types";

const RAISONS_RATTACHEMENT: Record<string, string> = {
  "pas-de-compte": "pas encore de compte : l'inviter d'abord",
  introuvable: "introuvable",
};

interface Ligne {
  readonly id: string;
  readonly nom: string;
  readonly etat: string;
  readonly email: string;
  readonly terrain: string;
  readonly groupes: string;
  readonly profileId?: string | undefined;
  readonly stagingId?: string | undefined;
  readonly statutVivier?: string | undefined;
}

export function AdminSupervisorsTable() {
  const data = useDataAccess();
  const queryClient = useQueryClient();
  const { activeProgram } = useSession();

  const [selection, setSelection] = useState<ReadonlySet<string>>(new Set());
  const [groupeChoisi, setGroupeChoisi] = useState("");
  const [rattacheMsg, setRattacheMsg] = useState<string | null>(null);
  const [ajoutOuvert, setAjoutOuvert] = useState(false);
  const [prenom, setPrenom] = useState("");
  const [nom, setNom] = useState("");
  const [email, setEmail] = useState("");
  const [terrainSaisi, setTerrainSaisi] = useState("");

  const { data: terrains } = useQuery({
    queryKey: ["placements", activeProgram.id],
    queryFn: () => data.placements.listPlacements(activeProgram.id),
  });
  const { data: promotions } = useQuery({
    queryKey: ["cohorts", activeProgram.id],
    queryFn: () => data.programs.listCohorts(activeProgram.id),
  });
  const { data: groupes } = useQuery({
    queryKey: ["supervision-groups", activeProgram.id],
    queryFn: () => data.placements.listSupervisionGroups(activeProgram.id),
  });
  const { data: vivier } = useQuery({
    queryKey: ["pending-people", activeProgram.id],
    queryFn: () => data.peopleStaging.listPendingPeople(activeProgram.id),
  });
  const { data: comptes } = useQuery({
    queryKey: ["administration-people"],
    queryFn: () => data.administration.listPeople(),
  });
  const { data: roles } = useQuery({
    queryKey: ["administration-role-assignments"],
    queryFn: () => data.administration.listAllRoleAssignments(),
  });
  const annuaire = useQuery({
    queryKey: ["program-directory", activeProgram.id],
    queryFn: () => fetchProgramDirectory(activeProgram.id),
  });

  const nomDe = useMemo(() => {
    const index = new Map((comptes ?? []).map((p) => [p.id, p.fullName]));
    return (id: PersonId) => index.get(id) ?? "compte sans nom lisible";
  }, [comptes]);
  const nomDuTerrain = useMemo(() => {
    const index = new Map((terrains ?? []).map((t) => [t.id, t.name]));
    return (id: PlacementId) => index.get(id) ?? "terrain inconnu";
  }, [terrains]);
  const nomPromotion = useMemo(() => {
    const index = new Map((promotions ?? []).map((c) => [c.id as string, c.label]));
    return (id: string) => index.get(id) ?? "";
  }, [promotions]);

  const groupesDe = (profileId: string | undefined): string => {
    if (!profileId) return "";
    return (groupes ?? [])
      .filter((g) => g.supervisorPersonIds.some((id) => id === profileId))
      .map((g) => `${nomPromotion(g.cohortId)} ${g.label}`.trim())
      .join(", ");
  };

  const lignes: readonly Ligne[] = useMemo(() => {
    const viviers = (vivier ?? []).filter(
      (p) => p.intendedRole === "placement_supervisor" || p.origin === "sync",
    );
    const comptesVivier = new Set(
      viviers.map((p) => p.activatedProfileId).filter((id): id is PersonId => Boolean(id)),
    );
    const aRoleOuGroupe = (profileId: string | undefined) =>
      (roles ?? []).some(
        (r) =>
          r.personId === profileId &&
          r.role === "placement_supervisor" &&
          r.scope.kind !== "platform" &&
          "programId" in r.scope &&
          r.scope.programId === activeProgram.id,
      ) || (groupes ?? []).some((g) => g.supervisorPersonIds.some((id) => id === profileId));

    const issues: Ligne[] = viviers.map((p) => ({
      id: p.id,
      profileId: p.activatedProfileId ?? undefined,
      stagingId: p.id,
      statutVivier: p.status,
      nom: fullNameOfPendingPerson(p),
      email: p.loginEmail ?? "",
      terrain: p.intendedPlacementId ? nomDuTerrain(p.intendedPlacementId) : "aucun terrain visé",
      groupes: groupesDe(p.activatedProfileId ?? undefined),
      etat:
        p.status === "cancelled"
          ? "retiré"
          : p.status === "activated"
            ? aRoleOuGroupe(p.activatedProfileId ?? undefined)
              ? "compte actif"
              : "retiré"
            : p.status === "invited"
              ? "invité"
              : "à inviter",
    }));
    const autres: Ligne[] = [...new Set((groupes ?? []).flatMap((g) => g.supervisorPersonIds))]
      .filter((id) => !comptesVivier.has(id))
      .map((id) => ({
        id,
        profileId: id,
        nom: nomDe(id),
        email: "",
        terrain: "",
        groupes: groupesDe(id),
        etat: "compte actif",
      }));
    return [...issues, ...autres].sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vivier, groupes, roles, comptes, terrains, promotions, activeProgram.id]);

  const ids = [...selection];
  const lignesChoisies = lignes.filter((l) => selection.has(l.id));
  const tout = lignes.length > 0 && lignes.every((l) => selection.has(l.id));
  const partiel = !tout && lignes.some((l) => selection.has(l.id));

  /** Lignes de l'annuaire correspondant à la sélection : c'est ce que les
   *  fenêtres « Inviter » et « Écrire un message » savent envoyer. */
  const lignesAnnuaire = useMemo<readonly DirectoryRow[]>(() => {
    const dir = annuaire.data ?? [];
    return lignes
      .filter((l) => selection.has(l.id))
      .map((l): DirectoryRow => {
        const connue = dir.find(
          (r) =>
            r.kind === "placement_supervisor" &&
            ((l.profileId && r.personId === l.profileId) ||
              (l.stagingId && r.stagingId === l.stagingId)),
        );
        if (connue) return connue;
        // Personne absente de l'annuaire (rôle retiré, pas encore rattachée) :
        // on la décrit à partir du tableau pour pouvoir quand même lui écrire.
        const arobase = l.email.indexOf("@");
        return {
          rowKey: `enc:${l.id}`,
          kind: "placement_supervisor",
          personId: l.profileId,
          stagingId: l.profileId ? undefined : l.stagingId,
          fullName: l.nom,
          groupLabel: l.terrain || "Encadrants",
          accountState: !l.email
            ? "no_address"
            : l.profileId
              ? "active"
              : l.statutVivier === "invited"
                ? "invited"
                : "staged",
          emailMasked: arobase > 0 ? `${l.email[0]}***${l.email.slice(arobase)}` : "",
          optedOut: false,
        };
      });
  }, [annuaire.data, lignes, selection]);

  const groupesChoisissables = (groupes ?? []).map((g) => ({
    id: g.id as string,
    libelle: `${nomPromotion(g.cohortId)} — ${g.label} (${nomDuTerrain(g.placementId)})`,
  }));
  const groupeEffectif = groupeChoisi || groupesChoisissables[0]?.id || "";

  const rattacher = useMutation({
    mutationFn: () =>
      data.peopleStaging.attachSupervisorsToGroup(activeProgram.id, ids, groupeEffectif),
    onSuccess: (r) => {
      const ecartes = r.skipped.map(
        (s) =>
          `${lignes.find((l) => l.id === s.id)?.nom ?? s.id} (${RAISONS_RATTACHEMENT[s.reason] ?? s.reason})`,
      );
      setRattacheMsg(
        `${r.done} encadrant(s) rattaché(s).` +
          (ecartes.length > 0 ? ` Écarté(s) : ${ecartes.join(" ; ")}.` : ""),
      );
      setSelection(new Set());
      void queryClient.invalidateQueries();
    },
    onError: (raison) =>
      toast.error(raison instanceof Error ? raison.message : "Rattachement impossible."),
  });

  const terrainParDefaut = terrains?.[0]?.id ?? "";
  const terrainChoisi = (terrainSaisi || terrainParDefaut) as PlacementId;
  const ajouter = useMutation({
    mutationFn: () =>
      data.peopleStaging.createPendingPerson({
        programId: activeProgram.id,
        firstName: prenom.trim(),
        lastName: nom.trim(),
        loginEmail: email,
        intendedRole: "placement_supervisor",
        intendedPlacementId: terrainChoisi,
      }),
    onSuccess: (personne) => {
      setPrenom("");
      setNom("");
      setEmail("");
      void queryClient.invalidateQueries({ queryKey: ["pending-people"] });
      toast.success(
        `${fullNameOfPendingPerson(personne)} est au vivier. Aucun compte n'a été créé : il reste à l'inviter.`,
      );
    },
    onError: (raison) =>
      toast.error(raison instanceof Error ? raison.message : "Ajout impossible."),
  });
  const saisieIncomplete =
    prenom.trim() === "" || nom.trim() === "" || email.trim() === "" || terrainChoisi === "";
  const problemes = saisieIncomplete
    ? []
    : validatePendingPersonCreation({
        programId: activeProgram.id,
        firstName: prenom.trim(),
        lastName: nom.trim(),
        loginEmail: email,
      });

  function basculer(id: string, valeur: boolean) {
    setSelection((cur) => {
      const next = new Set(cur);
      if (valeur) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  return (
    <PanelCard
      title="Encadrants"
      description="Un seul tableau : cochez une ou plusieurs personnes, puis invitez, écrivez, rattachez à un groupe, retirez ou supprimez."
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setAjoutOuvert((v) => !v)}>
            <UserPlus className="size-4" aria-hidden />
            {ajoutOuvert ? "Fermer l'ajout" : "Ajouter un encadrant"}
          </Button>
        </div>

        {ajoutOuvert ? (
          <div className="space-y-3 rounded-md border p-3">
            <p className="text-muted-foreground text-[12.5px] leading-relaxed">
              La personne entre au vivier ; aucun compte n'est créé. Elle apparaît dans le tableau,
              d'où on l'invite. En activant son compte, elle devient encadrante du terrain choisi et
              de tous ses groupes.
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor="enc-prenom" className="text-xs">
                  Prénom
                </Label>
                <Input id="enc-prenom" value={prenom} onChange={(e) => setPrenom(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="enc-nom" className="text-xs">
                  Nom
                </Label>
                <Input id="enc-nom" value={nom} onChange={(e) => setNom(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="enc-email" className="text-xs">
                  Adresse de connexion
                </Label>
                <Input
                  id="enc-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="off"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="enc-terrain" className="text-xs">
                Terrain encadré
              </Label>
              <select
                id="enc-terrain"
                className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm sm:max-w-sm"
                value={terrainChoisi}
                onChange={(e) => setTerrainSaisi(e.target.value)}
              >
                {(terrains ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            {problemes.length > 0 ? (
              <ul className="text-destructive space-y-0.5 text-[12.5px]">
                {problemes.map((p) => (
                  <li key={p}>{PENDING_PERSON_ISSUE_LABELS_FR[p]}</li>
                ))}
              </ul>
            ) : null}
            <Button
              size="sm"
              disabled={saisieIncomplete || problemes.length > 0 || ajouter.isPending}
              onClick={() => ajouter.mutate()}
            >
              <UserPlus className="size-4" aria-hidden />
              Ajouter au vivier
            </Button>
          </div>
        ) : null}

        {lignes.length === 0 ? (
          <p className="text-muted-foreground text-sm">Aucun encadrant à gérer.</p>
        ) : (
          <>
            {ids.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 p-3 text-sm">
                <Link2 className="size-4" aria-hidden />
                <span className="font-medium">Rattacher {ids.length} personne(s) à</span>
                <select
                  aria-label="Groupe d'encadrement"
                  className="border-input bg-background h-10 rounded-md border px-3 text-sm"
                  value={groupeEffectif}
                  onChange={(e) => setGroupeChoisi(e.target.value)}
                >
                  {groupesChoisissables.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.libelle}
                    </option>
                  ))}
                </select>
                <Button
                  size="sm"
                  className="min-h-11"
                  disabled={!groupeEffectif || rattacher.isPending}
                  onClick={() => rattacher.mutate()}
                >
                  {rattacher.isPending ? "En cours…" : "Rattacher"}
                </Button>
              </div>
            ) : null}
            {rattacheMsg ? (
              <p className="rounded-md border bg-muted/40 p-3 text-sm" role="status">
                {rattacheMsg}
              </p>
            ) : null}

            <PeopleRemovalBar
              programId={activeProgram.id}
              personIds={ids}
              nameOf={(id) => lignes.find((l) => l.id === id)?.nom ?? id}
              onClear={() => setSelection(new Set())}
              onDone={() => void queryClient.invalidateQueries()}
            />

            <div className="flex items-center gap-2 px-2 text-xs text-muted-foreground">
              <Checkbox
                checked={partiel ? "indeterminate" : tout}
                onCheckedChange={(v) =>
                  setSelection(v === true ? new Set(lignes.map((l) => l.id)) : new Set())
                }
                aria-label="Tout sélectionner"
              />
              <span>
                {lignesChoisies.length} sélectionné(s) sur {lignes.length}
              </span>
            </div>
            <ul className="space-y-1 text-sm">
              {lignes.map((l) => (
                <li
                  key={l.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border p-2"
                >
                  <Checkbox
                    checked={selection.has(l.id)}
                    onCheckedChange={(v) => basculer(l.id, v === true)}
                    aria-label={`Sélectionner ${l.nom}`}
                  />
                  <span className="font-medium">{l.nom}</span>
                  <span className="text-muted-foreground">{l.etat}</span>
                  {l.email ? (
                    <span className="text-muted-foreground font-mono text-xs">{l.email}</span>
                  ) : null}
                  {l.terrain ? (
                    <span className="text-muted-foreground text-xs">{l.terrain}</span>
                  ) : null}
                  <span className="text-muted-foreground text-xs">
                    {l.groupes ? `Groupe : ${l.groupes}` : "aucun groupe"}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <CommunicationSendDialogs
        selection={lignesAnnuaire}
        libelleConnexion="Inviter"
        onVider={() => setSelection(new Set())}
        onRafraichir={() => void queryClient.invalidateQueries()}
      />
    </PanelCard>
  );
}

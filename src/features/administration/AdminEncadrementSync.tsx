import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Send, ShieldCheck, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { SectionHeading } from "@/components/section-heading";
import { PanelCard } from "@/features/professional/mock-ui";
import { EYEBROW, TABULAIRE } from "@/components/milestone-heading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useDataAccess, useSession } from "@/application/session";
import {
  PENDING_PERSON_ISSUE_LABELS_FR,
  PENDING_PERSON_STATUS_LABELS_FR,
  fullNameOfPendingPerson,
  validatePendingPersonCreation,
  type PendingPerson,
  type PendingPersonId,
} from "@/domain/peopleStaging";
import type {
  EncadrementMembre,
  EncadrementSourceId,
  EncadrementSyncPreview,
  EncadrementSyncReport,
  PersonId,
  PlacementId,
} from "@/domain/types";

/** L'adresse de base de la source UMCV, proposée par défaut. Le jeton n'y est
 *  PLUS : il part en en-tête depuis le 10/09. */
const URL_PAR_DEFAUT = "https://echocardio-planner.lovable.app/api/public/equipe-4o";

function Ligne({ m }: { m: EncadrementMembre & { raison?: string; statut?: string } }) {
  return (
    <li className="text-[13px] leading-snug">
      <span className="font-medium">
        {m.prenom} {m.nom}
      </span>{" "}
      <span className="text-muted-foreground">
        {m.email}
        {m.categorie ? ` · ${m.categorie}` : ""}
        {m.raison === "homonyme" ? " · nom déjà connu sous une autre adresse" : ""}
        {m.raison === "incomplet" ? " · fiche incomplète, ignorée" : ""}
      </span>
    </li>
  );
}

function Bloc({
  titre,
  aide,
  membres,
}: {
  titre: string;
  aide: string;
  membres: readonly (EncadrementMembre & { raison?: string; statut?: string })[];
}) {
  if (membres.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <p className="font-display text-[15px] leading-tight">
        {titre} <span className="text-muted-foreground">({membres.length})</span>
      </p>
      <p className="text-muted-foreground text-[12.5px] leading-relaxed">{aide}</p>
      <ul className="space-y-1">
        {membres.map((m, i) => (
          <Ligne key={`${m.email ?? "x"}-${i}`} m={m} />
        ))}
      </ul>
    </div>
  );
}

/**
 * MISE À JOUR DE L'ÉQUIPE D'ENCADREMENT — depuis un service (10/09), et à la
 * main depuis le 14/09.
 *
 * ⚠️ CE QUE CET ÉCRAN NE FAIT PAS, et il le dit : la synchronisation n'ajoute
 * aucun encadrant et n'en retire aucun. Elle alimente le VIVIER (`people`,
 * statut « en attente ») ; l'invitation reste un geste humain. Et les absents
 * sont PROPOSÉS, jamais révoqués — un encadrant qui quitte le service a validé
 * des carnets et répondu dans des fils, et une date changée dans une autre
 * application ne doit pas pouvoir couper quelqu'un en plein stage.
 *
 * ⚠️ LE JETON N'EST JAMAIS RELU. Une fois posé, la base n'en rend que les
 * quatre derniers caractères : `resolve_encadrement_source` est révoquée
 * jusqu'à `authenticated` comprise, et seule la fonction edge peut le lire. Ce
 * qu'on ne peut pas lire ne fuit pas par une capture d'écran. Pour le changer,
 * on le remplace — on ne le consulte pas.
 *
 * LE CHAMP ACCEPTE L'URL COMPLÈTE OU LE JETON SEUL : la fonction SQL démêle et
 * refuse d'enregistrer une adresse qui contiendrait encore le secret.
 *
 * ⚠️ L'ÉQUIPE ACTUELLE SE LIT EN PREMIER (14/09). L'écran proposait de mettre
 * l'équipe à jour sans jamais dire s'il y en avait déjà une : on pouvait donc
 * lancer une synchronisation pour rien. Rien n'est déduit ici — les groupes,
 * leurs encadrants et les rôles posés viennent tous de la base.
 */
export function AdminEncadrementSync() {
  const data = useDataAccess();
  const queryClient = useQueryClient();
  const { activeProgram } = useSession();

  const [placementId, setPlacementId] = useState<string>("");
  const [label, setLabel] = useState("UMCV - 4O");
  const [url, setUrl] = useState(URL_PAR_DEFAUT);
  const [token, setToken] = useState("");
  const [apercu, setApercu] = useState<EncadrementSyncPreview | null>(null);
  const [rapport, setRapport] = useState<EncadrementSyncReport | null>(null);

  /* ---- saisie manuelle d'un encadrant ---- */
  const [prenom, setPrenom] = useState("");
  const [nom, setNom] = useState("");
  const [email, setEmail] = useState("");
  const [terrainSaisi, setTerrainSaisi] = useState<string>("");

  const { data: terrains } = useQuery({
    queryKey: ["placements", activeProgram.id],
    queryFn: () => data.placements.listPlacements(activeProgram.id),
  });
  const { data: sources, isPending } = useQuery({
    queryKey: ["encadrement-sources", activeProgram.id],
    queryFn: () => data.encadrementSources.listSources(activeProgram.id),
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

  const source = (sources ?? [])[0];

  const { data: journal } = useQuery({
    queryKey: ["encadrement-runs", source?.id ?? "none"],
    queryFn: () => data.encadrementSources.listRuns(source!.id),
    enabled: Boolean(source),
  });

  /** Nom affichable d'un compte activé. Jamais l'adresse : `profiles` n'en porte pas. */
  const nomDe = useMemo(() => {
    const index = new Map((comptes ?? []).map((p) => [p.id, p.fullName]));
    return (id: PersonId) => index.get(id) ?? "compte sans nom lisible";
  }, [comptes]);

  /** Les responsables de terrain : leur droit passe par la PORTÉE de leur rôle,
   *  jamais par `supervision_group_supervisors`. Sans cette lecture, un
   *  responsable de stage serait invisible sur un écran qui prétend dire qui
   *  encadre. */
  const responsablesParTerrain = useMemo(() => {
    const index = new Map<string, PersonId[]>();
    for (const r of roles ?? []) {
      if (r.role !== "placement_manager" || r.scope.kind !== "placement") continue;
      if (r.scope.programId !== activeProgram.id) continue;
      const deja = index.get(r.scope.placementId) ?? [];
      index.set(r.scope.placementId, [...deja, r.personId]);
    }
    return index;
  }, [roles, activeProgram.id]);

  const nomDuTerrain = useMemo(() => {
    const index = new Map((terrains ?? []).map((t) => [t.id, t.name]));
    return (id: PlacementId) => index.get(id) ?? "terrain inconnu";
  }, [terrains]);

  /** Le vivier ENCADRANT seulement : intention explicite, ou rapporté par une
   *  source d'équipe. Les apprenants du sas n'ont rien à faire ici. */
  const vivierEncadrant = useMemo(
    () =>
      (vivier ?? []).filter(
        (p) =>
          p.status !== "cancelled" &&
          (p.intendedRole === "placement_supervisor" || p.origin === "sync"),
      ),
    [vivier],
  );

  const terrainParDefaut = source?.placementId ?? terrains?.[0]?.id ?? "";
  const terrainChoisi = (terrainSaisi || terrainParDefaut) as PlacementId;

  const enregistrer = useMutation({
    mutationFn: () =>
      data.encadrementSources.setSource({
        programId: activeProgram.id,
        placementId: (placementId || terrains?.[0]?.id || "") as PlacementId,
        label,
        endpointUrl: url,
        token,
      }),
    onSuccess: () => {
      /* LE JETON EST EFFACÉ DU CHAMP DÈS QU'IL EST RANGÉ : le laisser à
         l'écran, c'est le laisser dans une capture, un partage d'écran ou un
         gestionnaire de mots de passe qui propose de l'enregistrer. */
      setToken("");
      void queryClient.invalidateQueries({ queryKey: ["encadrement-sources"] });
      toast.success("Source enregistrée. Le jeton est rangé, il ne sera plus affiché.");
    },
    onError: (raison) =>
      toast.error(raison instanceof Error ? raison.message : "Source non enregistrée."),
  });

  const tester = useMutation({
    mutationFn: (id: EncadrementSourceId) => data.encadrementSources.testSource(id),
    onSuccess: (r) => {
      setRapport(null);
      setApercu(r);
    },
    onError: (raison) => toast.error(raison instanceof Error ? raison.message : "Test impossible."),
  });

  const synchroniser = useMutation({
    mutationFn: (id: EncadrementSourceId) => data.encadrementSources.syncSource(id),
    onSuccess: (r) => {
      setApercu(null);
      setRapport(r);
      void queryClient.invalidateQueries({ queryKey: ["encadrement-runs"] });
      void queryClient.invalidateQueries({ queryKey: ["encadrement-sources"] });
      void queryClient.invalidateQueries({ queryKey: ["pending-people"] });
    },
    onError: (raison) =>
      toast.error(raison instanceof Error ? raison.message : "Synchronisation impossible."),
  });

  /**
   * AJOUT À LA MAIN. L'INTENTION DE RÔLE EST POSÉE DÈS LE VIVIER : sans elle,
   * l'activation du compte ne saurait rien accorder et la personne arriverait
   * sans aucun rôle. Le rôle est porté par le TERRAIN, jamais par la
   * promotion — et à l'activation, le déclencheur la rattache à TOUS les
   * groupes de ce terrain, donc à ceux de la promotion en cours.
   */
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

  const inviter = useMutation({
    mutationFn: async (personId: PendingPersonId) => {
      const resultats = await data.peopleStaging.sendInvitations([personId]);
      const resultat = resultats.find((r) => r.personId === personId);
      if (resultat && !resultat.ok) {
        throw new Error(resultat.error ?? "Envoi de l'invitation impossible.");
      }
      return resultat;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["pending-people"] });
      toast.success("Invitation envoyée.");
    },
    onError: (raison) =>
      toast.error(raison instanceof Error ? raison.message : "Invitation non envoyée."),
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

  if (isPending) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-6">
      <SectionHeading
        eyebrow={activeProgram.name}
        title="Équipe d'encadrement"
        level={1}
        description="Qui encadre déjà les promotions de ce programme, et comment compléter l'équipe."
      />

      {/* ---------- l'équipe actuelle, AVANT toute mise à jour ---------- */}
      <PanelCard
        collapsible
        defaultOpen
        title="Équipe actuelle"
        description="Qui encadre déjà, promotion par promotion, groupe par groupe."
      >
        {(promotions ?? []).length === 0 ? (
          <p className="text-muted-foreground text-[13px]">
            Ce programme n'a aucune promotion. Une équipe d'encadrement se rattache à un groupe, et
            un groupe appartient à une promotion.
          </p>
        ) : (
          <div className="space-y-4">
            {(promotions ?? []).map((promo) => {
              const siens = (groupes ?? []).filter((g) => g.cohortId === promo.id);
              return (
                <div key={promo.id} className="space-y-2">
                  <p className="font-display text-[15px] leading-tight">
                    {promo.label}{" "}
                    <span className="text-muted-foreground">
                      ({siens.length} groupe{siens.length > 1 ? "s" : ""} d'encadrement)
                    </span>
                  </p>
                  {siens.length === 0 ? (
                    <p className="text-muted-foreground text-[13px] leading-relaxed">
                      Aucun groupe d'encadrement :{" "}
                      <strong className="font-medium">
                        aucune équipe n'est attachée à cette promotion
                      </strong>
                      . Les groupes se créent dans « Gestion des stages ».
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {siens.map((g) => {
                        const responsables = responsablesParTerrain.get(g.placementId) ?? [];
                        return (
                          <li key={g.id} className="text-[13px] leading-snug">
                            <span className="font-medium">{g.label}</span>{" "}
                            <span className="text-muted-foreground">
                              · {nomDuTerrain(g.placementId)} · {g.memberEnrollmentIds.length}{" "}
                              étudiant(s)
                            </span>
                            <p className="text-muted-foreground mt-0.5">
                              {g.supervisorPersonIds.length === 0
                                ? "Aucun encadrant rattaché à ce groupe."
                                : `Encadrants : ${g.supervisorPersonIds.map(nomDe).join(", ")}`}
                            </p>
                            {responsables.length > 0 ? (
                              <p className="text-muted-foreground mt-0.5">
                                Responsable du terrain : {responsables.map(nomDe).join(", ")}
                              </p>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <p className={`${EYEBROW} text-muted-foreground`} style={TABULAIRE}>
          Vivier encadrant : {vivierEncadrant.filter((p) => p.status === "pending").length} en
          attente d'invitation · {vivierEncadrant.filter((p) => p.status === "invited").length}{" "}
          invité(s) · {vivierEncadrant.filter((p) => p.status === "activated").length} activé(s)
        </p>
      </PanelCard>

      {/* ---------- ajouter un encadrant à la main ---------- */}
      <PanelCard
        collapsible
        title="Ajouter un encadrant"
        description="À la main, avec invitation : pour un senior que le service ne rend pas."
      >
        <p className="text-muted-foreground text-[12.5px] leading-relaxed">
          La personne entre au vivier ; aucun compte n'est créé. À l'invitation, elle reçoit un lien
          d'activation, et c'est en activant son compte qu'elle devient encadrante du terrain choisi
          — et de tous ses groupes, donc de la promotion en cours.
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

        {vivierEncadrant.length === 0 ? (
          <p className="text-muted-foreground text-[13px]">
            Le vivier encadrant est vide : personne n'attend d'invitation.
          </p>
        ) : (
          <ul className="divide-border divide-y border-t">
            {vivierEncadrant.map((p: PendingPerson) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-[13px] leading-snug"
              >
                <span>
                  <span className="font-medium">{fullNameOfPendingPerson(p)}</span>{" "}
                  <span className="text-muted-foreground">
                    {p.loginEmail} · {PENDING_PERSON_STATUS_LABELS_FR[p.status]}
                    {p.origin === "sync" ? " · venue de la synchronisation" : ""}
                    {p.intendedPlacementId
                      ? ` · ${nomDuTerrain(p.intendedPlacementId)}`
                      : " · aucun terrain visé"}
                  </span>
                </span>
                {p.status === "activated" ? null : (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={inviter.isPending}
                    onClick={() => inviter.mutate(p.id)}
                  >
                    <Send className="size-4" aria-hidden />
                    {p.status === "invited" ? "Renvoyer l'invitation" : "Inviter"}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </PanelCard>

      {/* ---------- la source ---------- */}
      <PanelCard
        collapsible
        title="Mise à jour depuis un service"
        description="Synchronise l'équipe d'un service vers le vivier du programme, sans rien ajouter ni retirer d'office."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="source-terrain" className="text-xs">
              Terrain alimenté
            </Label>
            <select
              id="source-terrain"
              className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm"
              value={placementId || source?.placementId || terrains?.[0]?.id || ""}
              onChange={(e) => setPlacementId(e.target.value)}
            >
              {(terrains ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="source-label" className="text-xs">
              Nom de la source
            </Label>
            <Input
              id="source-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="UMCV - 4O"
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="source-url" className="text-xs">
            Adresse
          </Label>
          <Input id="source-url" value={url} onChange={(e) => setUrl(e.target.value)} />
        </div>

        <div className="space-y-1">
          <Label htmlFor="source-token" className="text-xs">
            Jeton
          </Label>
          <Input
            id="source-token"
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={
              source
                ? `Jeton en place (…${source.tokenHint}) — saisir pour le remplacer`
                : "Collez le jeton, ou l'URL complète"
            }
            autoComplete="off"
          />
          <p className="text-muted-foreground flex items-start gap-1.5 text-[12.5px] leading-relaxed">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            Le jeton est rangé chiffré et n'est jamais réaffiché — même à vous. Pour le changer,
            saisissez le nouveau. Vous pouvez coller l'URL complète&nbsp;: elle en sera séparée.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={token.trim().length < 8 || enregistrer.isPending}
            onClick={() => enregistrer.mutate()}
          >
            {source ? "Remplacer le jeton" : "Enregistrer la source"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!source || tester.isPending}
            onClick={() => source && tester.mutate(source.id)}
          >
            Tester la connexion
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!source || synchroniser.isPending}
            onClick={() => source && synchroniser.mutate(source.id)}
          >
            <RefreshCw className="size-4" aria-hidden />
            Synchroniser
          </Button>
        </div>

        {source ? (
          <p className={`${EYEBROW} text-muted-foreground`} style={TABULAIRE}>
            {source.label} · jeton …{source.tokenHint} ·{" "}
            {source.lastSyncAt
              ? `dernière synchronisation le ${new Date(source.lastSyncAt).toLocaleString("fr-FR")}`
              : "jamais synchronisée"}
          </p>
        ) : null}
      </PanelCard>

      {/* ---------- le test ---------- */}
      {apercu ? (
        <PanelCard tone="action" title="Test de connexion">
          <p className="text-muted-foreground text-[13px]">
            {apercu.membres_lus} membre(s) lu(s), dont {apercu.encadrants} encadrant(s).{" "}
            <strong className="font-medium">Rien n'a été enregistré.</strong>
          </p>
          <ul className="space-y-1">
            {apercu.apercu.map((m, i) => (
              <Ligne key={`${m.email ?? "x"}-${i}`} m={m} />
            ))}
          </ul>
        </PanelCard>
      ) : null}

      {/* ---------- le compte rendu ---------- */}
      {rapport ? (
        <PanelCard tone="done" title={`Synchronisation — ${rapport.membres_lus} membre(s) lu(s)`}>
          <Bloc
            titre="Ajoutés au vivier"
            aide="En attente d'invitation. Aucun compte n'a été créé."
            membres={rapport.ajoutes}
          />
          <Bloc
            titre="À rapprocher"
            aide="Ce nom est déjà connu sous une autre adresse. Rien n'a été inséré : à vous de dire s'il s'agit de la même personne."
            membres={rapport.a_rapprocher}
          />
          <Bloc
            titre="Absents de la source"
            aide="Ces personnes ne sont plus rendues par le service. Rien n'a été retiré — le retrait reste votre décision."
            membres={rapport.absents}
          />
          {rapport.ajoutes.length === 0 &&
          rapport.a_rapprocher.length === 0 &&
          rapport.absents.length === 0 ? (
            <p className="text-muted-foreground text-[13px]">
              Rien à signaler : {rapport.inchanges.length} personne(s) déjà à jour.
            </p>
          ) : null}
        </PanelCard>
      ) : null}

      {/* ---------- le journal ---------- */}
      {source ? (
        <PanelCard collapsible title="Historique des synchronisations">
          {(journal ?? []).length === 0 ? (
            <p className="text-muted-foreground px-4 py-5 text-center text-[13px]">
              Aucune synchronisation pour l'instant.
            </p>
          ) : (
            <ul className="divide-border divide-y">
              {(journal ?? []).map((r) => (
                <li key={r.id} className="px-4 py-3 text-[13px] leading-snug">
                  <span className={`${EYEBROW} text-muted-foreground`} style={TABULAIRE}>
                    {new Date(r.startedAt).toLocaleString("fr-FR")}
                  </span>
                  {r.status === "failed" ? (
                    <p className="text-destructive mt-1">
                      Échec{r.errorMessage ? ` — ${r.errorMessage}` : ""}
                    </p>
                  ) : (
                    <p className="mt-1">
                      {r.membersSeen} lu(s) · {r.peopleAdded} ajouté(s) · {r.unchanged} inchangé(s)
                      · {r.removalsProposed} absent(s)
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </PanelCard>
      ) : null}
    </div>
  );
}

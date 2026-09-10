import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { SectionHeading } from "@/components/section-heading";
import { EYEBROW, TABULAIRE } from "@/components/milestone-heading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useDataAccess, useSession } from "@/application/session";
import type {
  EncadrementMembre,
  EncadrementSourceId,
  EncadrementSyncPreview,
  EncadrementSyncReport,
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
 * MISE À JOUR DE L'ÉQUIPE D'ENCADREMENT — depuis un service (10/09).
 *
 * ⚠️ CE QUE CET ÉCRAN NE FAIT PAS, et il le dit : il n'ajoute aucun encadrant
 * et n'en retire aucun. Il alimente le VIVIER (`people`, statut « en
 * attente ») ; l'invitation reste un geste humain. Et les absents sont
 * PROPOSÉS, jamais révoqués — un encadrant qui quitte le service a validé des
 * carnets et répondu dans des fils, et une date changée dans une autre
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

  const { data: terrains } = useQuery({
    queryKey: ["placements", activeProgram.id],
    queryFn: () => data.placements.listPlacements(activeProgram.id),
  });
  const { data: sources, isPending } = useQuery({
    queryKey: ["encadrement-sources", activeProgram.id],
    queryFn: () => data.encadrementSources.listSources(activeProgram.id),
  });

  const source = (sources ?? [])[0];

  const { data: journal } = useQuery({
    queryKey: ["encadrement-runs", source?.id ?? "none"],
    queryFn: () => data.encadrementSources.listRuns(source!.id),
    enabled: Boolean(source),
  });

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
    },
    onError: (raison) =>
      toast.error(raison instanceof Error ? raison.message : "Synchronisation impossible."),
  });

  if (isPending) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-6">
      <SectionHeading
        title="Mise à jour de l'équipe d'encadrement"
        level={1}
        description="Récupère l'équipe d'un service depuis son application, et la verse au vivier du programme."
      />

      {/* ---------- la source ---------- */}
      <div className="bg-card space-y-4 rounded-xl border p-4 shadow-[var(--shadow-card)]">
        <p className="font-display text-[17px] leading-tight">Source</p>

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
      </div>

      {/* ---------- le test ---------- */}
      {apercu ? (
        <div className="bg-card space-y-2 rounded-xl border p-4 shadow-[var(--shadow-card)]">
          <p className="font-display text-[17px] leading-tight">Test de connexion</p>
          <p className="text-muted-foreground text-[13px]">
            {apercu.membres_lus} membre(s) lu(s), dont {apercu.encadrants} encadrant(s).{" "}
            <strong className="font-medium">Rien n'a été enregistré.</strong>
          </p>
          <ul className="space-y-1">
            {apercu.apercu.map((m, i) => (
              <Ligne key={`${m.email ?? "x"}-${i}`} m={m} />
            ))}
          </ul>
        </div>
      ) : null}

      {/* ---------- le compte rendu ---------- */}
      {rapport ? (
        <div className="bg-card space-y-4 rounded-xl border p-4 shadow-[var(--shadow-card)]">
          <p className="font-display text-[17px] leading-tight">
            Synchronisation — {rapport.membres_lus} membre(s) lu(s)
          </p>
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
        </div>
      ) : null}

      {/* ---------- le journal ---------- */}
      {source ? (
        <div className="bg-card overflow-hidden rounded-xl border shadow-[var(--shadow-card)]">
          <p className="font-display border-b px-4 py-3 text-[17px] leading-tight">
            Historique des synchronisations
          </p>
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
        </div>
      ) : null}
    </div>
  );
}

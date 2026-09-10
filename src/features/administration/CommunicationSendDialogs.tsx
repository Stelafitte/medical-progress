/**
 * LES GESTES POSÉS SUR UNE SÉLECTION — barre d'action et boîtes de dialogue.
 *
 * DEUX GESTES ICI, ET C'EST VOULU : la première connexion et le message libre
 * agissent sur DES PERSONNES. Une règle de rappel, elle, agit sur un PROGRAMME
 * et se déclenche toute seule plus tard — la mettre dans la même barre laisserait
 * croire qu'elle envoie quelque chose maintenant. Elle a sa propre section.
 *
 * ⚠️ LE MODE ESSAI N'EST PAS OPTIONNEL. `send-campaign` sait rendre ce qui
 * PARTIRAIT sans rien envoyer ni rien tracer. L'écran s'en sert toujours en
 * premier : c'est le seul moment où l'on voit le nombre réel de destinataires,
 * les exclus, et les variables non résolues — avant que ce soit irréversible.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { KeyRound, Mail, Send, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/application/session";
import {
  MAIL_BLOCK_LABELS_FR,
  planCampaign,
  planFirstLogin,
  type DirectoryRow,
} from "@/domain/communicationDirectory";
import {
  VARIABLES_CONNUES,
  confirmCampaign,
  createCampaign,
  fetchMessageTemplates,
  invitePeople,
  resendFirstLogin,
  runCampaign,
  type ResultatEnvoi,
  type ResultatParPersonne,
} from "@/infrastructure/supabase/communicationDirectory";

const TOUCH = "min-h-11";

export function CommunicationSendDialogs({
  selection,
  onVider,
  onRafraichir,
}: {
  selection: readonly DirectoryRow[];
  onVider: () => void;
  onRafraichir: () => void;
}) {
  const [ouvert, setOuvert] = useState<"aucun" | "connexion" | "message">("aucun");

  if (selection.length === 0) return null;

  return (
    <>
      {/* Barre collante : elle n'apparaît que s'il y a quelque chose à faire. */}
      <div className="bg-background/95 border-border fixed inset-x-0 bottom-0 z-40 border-t p-3 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2">
          <span className="text-sm font-medium">
            {selection.length} personne(s) sélectionnée(s)
          </span>
          <Button variant="ghost" size="sm" className={TOUCH} onClick={onVider}>
            Tout désélectionner
          </Button>
          <div className="flex-1" />
          <Button variant="outline" className={TOUCH} onClick={() => setOuvert("connexion")}>
            <KeyRound className="me-1 size-4" aria-hidden />
            Première connexion
          </Button>
          <Button className={TOUCH} onClick={() => setOuvert("message")}>
            <Mail className="me-1 size-4" aria-hidden />
            Écrire un message
          </Button>
        </div>
      </div>

      <DialogueConnexion
        ouvert={ouvert === "connexion"}
        onFermer={() => setOuvert("aucun")}
        selection={selection}
        onTermine={onRafraichir}
      />
      <DialogueMessage
        ouvert={ouvert === "message"}
        onFermer={() => setOuvert("aucun")}
        selection={selection}
      />
    </>
  );
}

/* ================================================================== */
/* Geste 1 — mail de première connexion                                */
/* ================================================================== */

function DialogueConnexion({
  ouvert,
  onFermer,
  selection,
  onTermine,
}: {
  ouvert: boolean;
  onFermer: () => void;
  selection: readonly DirectoryRow[];
  onTermine: () => void;
}) {
  const plan = useMemo(() => planFirstLogin(selection), [selection]);
  const [resultats, setResultats] = useState<readonly ResultatParPersonne[] | null>(null);

  const envoi = useMutation({
    mutationFn: async () => {
      /* DEUX APPELS, JAMAIS UN SEUL. `invite-person` crée un compte et échoue
         si le compte existe ; `resend-first-login` fait l'inverse. C'est le
         domaine qui a réparti les identifiants, pas cet écran. */
      const [invites, relances] = await Promise.all([
        plan.toInvite.length > 0 ? invitePeople(plan.toInvite) : Promise.resolve([]),
        plan.toResend.length > 0 ? resendFirstLogin(plan.toResend) : Promise.resolve([]),
      ]);
      return [...invites, ...relances];
    },
    onSuccess: (res) => {
      setResultats(res);
      const ok = res.filter((r) => r.ok).length;
      const ko = res.length - ok;
      if (ko === 0) toast.success(`${ok} lien(s) de première connexion envoyé(s).`);
      else toast.warning(`${ok} envoyé(s), ${ko} en échec — le détail est affiché.`);
      onTermine();
    },
    onError: (raison) =>
      toast.error(raison instanceof Error ? raison.message : "Envoi impossible."),
  });

  const total = plan.toInvite.length + plan.toResend.length;

  return (
    <Dialog open={ouvert} onOpenChange={(o) => !o && (setResultats(null), onFermer())}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Envoyer un lien de première connexion</DialogTitle>
          <DialogDescription>
            Chaque personne reçoit le lien qui correspond à son état. Rien n'est envoyé avant
            confirmation.
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-2 text-sm">
          <li className="flex items-center justify-between gap-2">
            <span>Invitations à créer (personnes sans compte)</span>
            <Badge variant="outline">{plan.toInvite.length}</Badge>
          </li>
          <li className="flex items-center justify-between gap-2">
            <span>Relances de connexion (comptes existants)</span>
            <Badge variant="outline">{plan.toResend.length}</Badge>
          </li>
          {plan.skipped.length > 0 && (
            <li className="text-muted-foreground border-border rounded border p-2">
              <span className="text-foreground flex items-center gap-1 font-medium">
                <TriangleAlert className="size-4" aria-hidden />
                {plan.skipped.length} personne(s) écartée(s)
              </span>
              <ul className="mt-1 space-y-0.5 text-xs">
                {plan.skipped.map(({ row, reason }) => (
                  <li key={row.rowKey}>
                    {row.fullName} — {reason}
                  </li>
                ))}
              </ul>
            </li>
          )}
        </ul>

        {resultats && (
          <div className="border-border max-h-48 overflow-y-auto rounded border p-2 text-xs">
            {resultats.map((r) => (
              <p key={r.personId} className={r.ok ? "" : "text-destructive"}>
                {r.ok ? "✓" : "✗"} {r.personId}
                {r.error ? ` — ${r.error}` : ""}
              </p>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" className={TOUCH} onClick={onFermer}>
            Fermer
          </Button>
          <Button
            className={TOUCH}
            disabled={total === 0 || envoi.isPending}
            onClick={() => envoi.mutate()}
          >
            {envoi.isPending ? "Envoi…" : `Envoyer à ${total} personne(s)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ================================================================== */
/* Geste 2 — message libre ou depuis un modèle                         */
/* ================================================================== */

function DialogueMessage({
  ouvert,
  onFermer,
  selection,
}: {
  ouvert: boolean;
  onFermer: () => void;
  selection: readonly DirectoryRow[];
}) {
  const { activeProgram } = useSession();
  const plan = useMemo(() => planCampaign(selection), [selection]);
  const [modeleId, setModeleId] = useState("");
  const [objet, setObjet] = useState("");
  const [corps, setCorps] = useState("");
  const [campagneId, setCampagneId] = useState<string | null>(null);
  const [essai, setEssai] = useState<ResultatEnvoi | null>(null);

  const modeles = useQuery({
    queryKey: ["message-templates", activeProgram.id],
    queryFn: () => fetchMessageTemplates(activeProgram.id),
    enabled: ouvert,
  });

  /** Mode essai : crée le brouillon si besoin, puis demande ce qui PARTIRAIT. */
  const preparer = useMutation({
    mutationFn: async () => {
      const id =
        campagneId ??
        (await createCampaign({
          programId: activeProgram.id,
          subject: objet,
          body: corps,
          audience: { kind: "persons", personIds: [...plan.personIds] },
          ...(modeleId ? { templateId: modeleId } : {}),
          maxRecipients: Math.max(plan.personIds.length, 1),
        }));
      setCampagneId(id);
      return runCampaign(id, true);
    },
    onSuccess: (res) => {
      setEssai(res);
      toast.success(`Essai : ${res.recipientCount ?? 0} destinataire(s) joignable(s).`);
    },
    onError: (raison) =>
      toast.error(raison instanceof Error ? raison.message : "Essai impossible."),
  });

  const envoyer = useMutation({
    mutationFn: async () => {
      if (!campagneId) throw new Error("Faire d'abord un essai.");
      /* LE GARDE-FOU 428 SE LÈVE ICI, ET SEULEMENT ICI — après que le nombre
         réel de destinataires a été vu à l'écran. */
      if ((essai?.recipientCount ?? 0) > 1) await confirmCampaign(campagneId);
      return runCampaign(campagneId, false);
    },
    onSuccess: (res) => {
      toast.success(`${res.sent ?? 0} message(s) envoyé(s), ${res.failed ?? 0} en échec.`);
      setCampagneId(null);
      setEssai(null);
      onFermer();
    },
    onError: (raison) =>
      toast.error(raison instanceof Error ? raison.message : "Envoi impossible."),
  });

  function appliquerModele(id: string) {
    setModeleId(id);
    const modele = modeles.data?.find((m) => m.id === id);
    if (modele) {
      setObjet(modele.subject);
      setCorps(modele.body);
    }
    /* Changer le texte invalide l'essai : sinon on enverrait un message
       différent de celui qui a été vérifié. */
    setCampagneId(null);
    setEssai(null);
  }

  const peutEssayer = objet.trim() !== "" && corps.trim() !== "" && plan.personIds.length > 0;

  return (
    <Dialog open={ouvert} onOpenChange={(o) => !o && onFermer()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Écrire à {plan.personIds.length} personne(s)</DialogTitle>
          <DialogDescription>
            Un essai est obligatoire avant l'envoi : il montre les destinataires réels sans rien
            expédier.
          </DialogDescription>
        </DialogHeader>

        {plan.excluded.length > 0 && (
          <div className="border-border rounded border p-2 text-xs">
            <p className="flex items-center gap-1 font-medium">
              <TriangleAlert className="size-4" aria-hidden />
              {plan.excluded.length} personne(s) de la sélection ne recevront pas ce message
            </p>
            <ul className="mt-1 space-y-0.5">
              {plan.excluded.map(({ row, reason }) => (
                <li key={row.rowKey} className="text-muted-foreground">
                  {row.fullName} — {MAIL_BLOCK_LABELS_FR[reason]}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="modele">Partir d'un modèle (facultatif)</Label>
            <Select value={modeleId} onValueChange={appliquerModele}>
              <SelectTrigger id="modele" className={TOUCH}>
                <SelectValue placeholder="Écrire un message libre" />
              </SelectTrigger>
              <SelectContent>
                {(modeles.data ?? []).map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="objet">Objet</Label>
            <Input
              id="objet"
              value={objet}
              className={TOUCH}
              onChange={(e) => {
                setObjet(e.target.value);
                setCampagneId(null);
                setEssai(null);
              }}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="corps">Message</Label>
            <Textarea
              id="corps"
              rows={8}
              value={corps}
              onChange={(e) => {
                setCorps(e.target.value);
                setCampagneId(null);
                setEssai(null);
              }}
            />
            <p className="text-muted-foreground text-xs">
              Variables reconnues : {VARIABLES_CONNUES.map((v) => `{{${v}}}`).join(", ")}. Toute
              autre sera laissée telle quelle dans le message reçu.
            </p>
          </div>
        </div>

        {essai && (
          <div className="border-border space-y-1 rounded border p-2 text-xs">
            <p className="font-medium">
              Essai : {essai.recipientCount} destinataire(s), {essai.excludedOptedOut ?? 0}{" "}
              désabonné(s), {essai.excludedNoAddress ?? 0} sans adresse.
            </p>
            {essai.subjectPreview && <p>Objet rendu : {essai.subjectPreview}</p>}
            {(essai.unresolvedVariables?.length ?? 0) > 0 && (
              <p className="text-destructive">
                Variables non résolues : {essai.unresolvedVariables?.join(", ")}
              </p>
            )}
            <ul className="max-h-32 overflow-y-auto">
              {(essai.recipients ?? []).map((r) => (
                <li key={r.personId} className="text-muted-foreground">
                  {r.fullName} — {r.email}
                </li>
              ))}
            </ul>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" className={TOUCH} onClick={onFermer}>
            Annuler
          </Button>
          <Button
            variant="outline"
            className={TOUCH}
            disabled={!peutEssayer || preparer.isPending}
            onClick={() => preparer.mutate()}
          >
            {preparer.isPending ? "Essai…" : "Faire un essai"}
          </Button>
          <Button
            className={TOUCH}
            disabled={!essai || envoyer.isPending}
            onClick={() => envoyer.mutate()}
          >
            <Send className="me-1 size-4" aria-hidden />
            {envoyer.isPending ? "Envoi…" : "Envoyer pour de vrai"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

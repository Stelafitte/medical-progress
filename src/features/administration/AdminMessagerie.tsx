/**
 * LA MESSAGERIE DU PROGRAMME, CÔTÉ ADMINISTRATION (Stef, 21/09 : « l'onglet
 * Messagerie des apprenants doit aussi être présent pour l'admin programme,
 * pour qu'il puisse voir ce qui se passe sur la plateforme avec un visuel
 * synthétique »).
 *
 * TROIS ÉTAGES, du plus synthétique au plus détaillé :
 *   1. les chiffres qui disent si ça vit : fils, fils actifs cette semaine,
 *      fils en attente de réponse de l'équipe, annonces envoyées ;
 *   2. l'activité des 14 derniers jours, une barre par jour ;
 *   3. les fils eux-mêmes (on peut les lire et y répondre), puis les annonces.
 *
 * LES MÊMES DONNÉES QUE L'ENCADRANT, pas une copie : `listThreadsForProgram`,
 * que la RLS ouvre à l'administration du programme sur tout le programme.
 * « En attente de réponse » = le dernier message du fil n'est pas de l'équipe
 * — mesuré à la lecture, jamais stocké.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MessagesSquare, Send } from "lucide-react";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useDataAccess, useSession } from "@/application/session";
import { EmptyState, PanelCard, StatCard } from "@/features/professional/mock-ui";
import { ThreadConversation, nonLu, sujetDuFil } from "@/features/discussions/ThreadPanel";
import type { DiscussionThreadId } from "@/domain/types";

const JOUR = 24 * 60 * 60 * 1000;

const ETAT_CAMPAGNE: Record<string, string> = {
  draft: "brouillon",
  pending_approval: "à approuver",
  approved: "approuvée",
  scheduled: "programmée",
  running: "en cours d'envoi",
  completed: "envoyée",
  cancelled: "annulée",
};

export function AdminMessagerie() {
  const data = useDataAccess();
  const { activeProgram } = useSession();
  const [ouvert, setOuvert] = useState<DiscussionThreadId | null>(null);

  const fils = useQuery({
    queryKey: ["discussion-threads", "programme", activeProgram.id],
    queryFn: () => data.discussions.listThreadsForProgram(activeProgram.id),
  });
  const annonces = useQuery({
    queryKey: ["send-history", activeProgram.id],
    queryFn: () => data.administration.listSendHistory(activeProgram.id),
  });

  if (fils.isPending) return <Skeleton className="h-72 w-full" />;

  const liste = fils.data ?? [];
  const maintenant = Date.now();
  const actifsSemaine = liste.filter(
    (f) => maintenant - new Date(f.lastMessageAt).getTime() < 7 * JOUR,
  ).length;
  const nonLus = liste.filter(nonLu).length;
  const envoyees = (annonces.data ?? []).filter((a) => a.state === "completed");
  const destinataires = envoyees.reduce((n, a) => n + a.recipients, 0);

  // L'activité des 14 derniers jours : dernier message de chaque fil, par jour.
  const jours = Array.from({ length: 14 }, (_, i) => {
    const debut = new Date(maintenant - (13 - i) * JOUR);
    debut.setHours(0, 0, 0, 0);
    return debut;
  });
  const parJour = jours.map((debut) => {
    const fin = debut.getTime() + JOUR;
    return liste.filter((f) => {
      const t = new Date(f.lastMessageAt).getTime();
      return t >= debut.getTime() && t < fin;
    }).length;
  });
  const maxJour = Math.max(1, ...parJour);

  return (
    <div className="space-y-6">
      <SectionHeading
        eyebrow={activeProgram.name}
        title="Messagerie du programme"
        level={1}
        description="Ce qui s'échange sur la plateforme : les fils entre apprenants et encadrants, et les annonces envoyées."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Fils d'échange" value={liste.length} />
        <StatCard
          label="Actifs cette semaine"
          value={actifsSemaine}
          tone={actifsSemaine > 0 ? "done" : "neutral"}
        />
        <StatCard
          label="Non lus par moi"
          value={nonLus}
          tone={nonLus > 0 ? "attention" : "neutral"}
        />
        <StatCard
          label="Annonces envoyées"
          value={envoyees.length}
          hint={`${destinataires} destinataire(s) au total`}
        />
      </div>

      <PanelCard
        collapsible
        defaultOpen
        title="Activité des 14 derniers jours"
        description="Nombre de fils dont le dernier message date de ce jour."
      >
        <div className="flex h-28 items-end gap-1.5" role="img" aria-label="Activité par jour">
          {parJour.map((n, i) => (
            <div key={i} className="flex flex-1 flex-col items-center gap-1">
              <span className="text-[10px] tabular-nums text-muted-foreground">{n || ""}</span>
              <div
                className={`w-full rounded-t ${n > 0 ? "bg-sky-500" : "bg-muted"}`}
                style={{ height: `${Math.max(4, (n / maxJour) * 80)}px` }}
                title={`${jours[i]!.toLocaleDateString("fr-FR")} : ${n} fil(s)`}
              />
              <span className="text-[10px] text-muted-foreground">
                {jours[i]!.toLocaleDateString("fr-FR", { day: "numeric" })}
              </span>
            </div>
          ))}
        </div>
      </PanelCard>

      <PanelCard
        collapsible
        defaultOpen
        title="Fils d'échange"
        description="Un fil pend à une compétence ou à une journée de carnet. Ouvrez-le pour le lire et y répondre."
        action={
          <Badge variant="outline" className="font-normal">
            {liste.length} fil(s)
          </Badge>
        }
      >
        {liste.length === 0 ? (
          <EmptyState>Aucun échange pour l'instant sur ce programme.</EmptyState>
        ) : (
          <ul className="divide-y divide-border rounded-lg border">
            {liste.map((fil) => {
              const deplie = ouvert === fil.id;
              return (
                <li key={fil.id}>
                  <button
                    type="button"
                    aria-expanded={deplie}
                    onClick={() => setOuvert(deplie ? null : fil.id)}
                    className="flex min-h-11 w-full flex-wrap items-center gap-3 px-4 py-2.5 text-start hover:bg-accent/40"
                  >
                    <MessagesSquare
                      className={`size-4 shrink-0 ${nonLu(fil) ? "text-sky-600" : "text-muted-foreground"}`}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className={`block text-sm ${nonLu(fil) ? "font-semibold" : ""}`}>
                        {fil.learnerName ?? "Apprenant"}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {sujetDuFil(fil)}
                      </span>
                    </span>
                    {nonLu(fil) ? <Badge className="font-normal">non lu</Badge> : null}
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {new Date(fil.lastMessageAt).toLocaleDateString("fr-FR")}
                    </span>
                  </button>
                  {deplie ? (
                    <div className="border-t border-border bg-muted/20 px-4 py-4">
                      <ThreadConversation fil={fil} contexte={fil.contextBody} />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </PanelCard>

      <PanelCard
        collapsible
        title="Annonces envoyées"
        description="Les campagnes de « Communication interne » : une diffusion, sans réponse possible."
        action={
          <Badge variant="outline" className="font-normal">
            {(annonces.data ?? []).length}
          </Badge>
        }
      >
        {(annonces.data ?? []).length === 0 ? (
          <EmptyState>Aucune annonce pour l'instant.</EmptyState>
        ) : (
          <ul className="space-y-2 text-sm">
            {(annonces.data ?? []).map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
                <Send className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1 font-medium">{a.subject}</span>
                <Badge variant="outline" className="font-normal">
                  {ETAT_CAMPAGNE[a.state] ?? a.state}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {a.recipients} destinataire(s) ·{" "}
                  {new Date(a.preparedAt).toLocaleDateString("fr-FR")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </PanelCard>
    </div>
  );
}

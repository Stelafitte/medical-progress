import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessagesSquare } from "lucide-react";

import { SectionHeading } from "@/components/section-heading";
import { EYEBROW, TABULAIRE } from "@/components/milestone-heading";
import { Skeleton } from "@/components/ui/skeleton";
import { useDataAccess, useSession } from "@/application/session";
import { ThreadConversation, nonLu, sujetDuFil } from "@/features/discussions/ThreadPanel";
import type { DiscussionThreadId } from "@/domain/types";

/**
 * MESSAGERIE DE L'ENCADRANT — les fils de ses étudiants (10/09).
 *
 * ⚠️ CE QUE CET ÉCRAN AFFICHAIT JUSQU'ICI. Un formulaire « Préparer un
 * message » qui n'expédiait rien, un « Historique simulé » alimenté par des
 * fixtures de maquette, et un bandeau « Simulé — aucun envoi ». Constaté par
 * Stef en testant la boucle de bout en bout : ses deux vrais messages, envoyés
 * depuis « Mes compétences » et depuis le carnet, n'apparaissaient nulle part.
 * L'écran ne mentait pas sur son état — il le disait — mais il occupait la
 * place de la seule chose qui compte ici.
 *
 * LE PÉRIMÈTRE N'EST PAS CALCULÉ ICI, et c'est structurel : on demande TOUS les
 * fils du programme, et la policy `discussion_threads_select` s'appuie sur
 * `supervises_enrollment()` — l'encadrant ne reçoit que les fils de ses
 * groupes. Le filtrer côté écran aurait créé une seconde vérité à tenir
 * d'accord avec la RLS ; c'est exactement ce qu'on a refusé pour les
 * affectations.
 *
 * PAS DE « NOUVEAU MESSAGE ». Un fil pend à une compétence ou à une journée de
 * carnet : il n'y a pas de conversation « à propos de rien ». L'encadrant peut
 * ouvrir un fil de sa propre initiative — décision de Stef — mais depuis
 * l'objet concerné, pas depuis une page blanche. Tant que l'écran étudiant de
 * l'encadrant n'existe pas, il répond aux fils qu'on lui adresse.
 */
export function SupervisionMessages() {
  const data = useDataAccess();
  const queryClient = useQueryClient();
  const { activeProgram } = useSession();
  const [ouvert, setOuvert] = useState<DiscussionThreadId | null>(null);

  const { data: fils, isPending } = useQuery({
    queryKey: ["discussion-threads", "programme", activeProgram.id],
    queryFn: () => data.discussions.listThreadsForProgram(activeProgram.id),
  });

  const marquer = useMutation({
    mutationFn: (threadId: DiscussionThreadId) => data.discussions.markThreadRead(threadId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["discussion-threads"] }),
  });

  if (isPending) return <Skeleton className="h-64 w-full" />;

  const liste = fils ?? [];
  const enAttente = liste.filter(nonLu).length;

  return (
    <div className="space-y-6">
      <SectionHeading
        title="Messagerie"
        level={1}
        description="Les échanges ouverts par vos étudiants, à propos d'une compétence ou d'une journée de stage."
      />

      <div className="bg-card overflow-hidden rounded-xl border shadow-[var(--shadow-card)]">
        {liste.length === 0 ? (
          /*
            LE VIDE DIT CE QU'IL ATTEND, et d'où ça viendra. « Aucun message »
            seul laisserait l'encadrant se demander si l'écran fonctionne.
          */
          <p className="text-muted-foreground px-4 py-6 text-center text-[13px] leading-relaxed">
            Aucun échange pour l'instant.
            <br />
            Vos étudiants ouvrent un échange depuis une compétence ou une journée de leur carnet.
          </p>
        ) : (
          <ul className="divide-border divide-y">
            {liste.map((fil) => (
              <li key={fil.id}>
                <button
                  type="button"
                  className="hover:bg-muted/40 flex w-full items-start gap-3 px-4 py-3.5 text-start"
                  aria-expanded={ouvert === fil.id}
                  onClick={() => {
                    const suivant = ouvert === fil.id ? null : fil.id;
                    setOuvert(suivant);
                    if (suivant && nonLu(fil)) marquer.mutate(fil.id);
                  }}
                >
                  <span
                    className={`mt-2 size-2 shrink-0 rounded-full ${
                      nonLu(fil) ? "bg-live" : "bg-transparent"
                    }`}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    {/*
                      LE NOM DE L'ÉTUDIANT D'ABORD : l'encadrant suit des
                      personnes, pas des sujets. L'apprenant, lui, voit ses
                      propres fils et n'a besoin que de l'objet.
                    */}
                    <span
                      className={`font-display block text-[16.5px] leading-tight tracking-[-0.01em] ${
                        nonLu(fil) ? "" : "text-muted-foreground"
                      }`}
                    >
                      {fil.learnerName ?? "Apprenant"}
                      {nonLu(fil) ? <span className="sr-only"> (non lu)</span> : null}
                    </span>
                    <span className="text-muted-foreground mt-0.5 block text-[13px] leading-snug">
                      {sujetDuFil(fil)}
                    </span>
                    <span
                      className={`${EYEBROW} text-muted-foreground mt-2 block`}
                      style={TABULAIRE}
                    >
                      <MessagesSquare className="me-1 inline size-3" aria-hidden />
                      dernier message le {new Date(fil.lastMessageAt).toLocaleDateString("fr-FR")}
                    </span>
                  </span>
                </button>
                {ouvert === fil.id ? (
                  <ThreadConversation fil={fil} contexte={fil.contextBody} />
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <p className="text-muted-foreground border-t px-4 py-3 text-[12.5px] leading-relaxed">
          Vous voyez les échanges des étudiants de vos groupes d'encadrement
          {enAttente > 0 ? ` — ${enAttente} en attente de votre lecture.` : "."}
        </p>
      </div>
    </div>
  );
}

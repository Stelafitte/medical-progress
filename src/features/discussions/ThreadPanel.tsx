import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { EYEBROW, TABULAIRE } from "@/components/milestone-heading";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useDataAccess, useSession } from "@/application/session";
import type { DiscussionThread } from "@/domain/types";

/** Le plafond de `discussion_messages.body`, redit ici pour compter AVANT
 *  l'envoi : au-dela, la base refuse et l'auteur perdrait son texte. */
export const MESSAGE_MAX = 10000;

/**
 * LE FIL PORTE-T-IL QUELQUE CHOSE QUE *JE* N'AI PAS ENCORE LU ?
 *
 * La lecture est PERSONNELLE (`discussion_thread_reads`, une ligne par
 * personne) : un encadrant qui ouvre un fil ne l'eteint pas pour ses collegues
 * du groupe. C'est la consequence directe du choix de Stef — le groupe entier
 * voit le fil, donc « lu » ne peut pas etre une propriete du message.
 */
export function nonLu(fil: DiscussionThread): boolean {
  return fil.readAt === null || new Date(fil.readAt) < new Date(fil.lastMessageAt);
}

/**
 * LE SUJET D'UN FIL EST L'OBJET AUQUEL IL PEND, jamais une ligne d'objet
 * saisie. C'est ce qui distingue ces echanges d'une messagerie : on ne parle
 * pas « de rien », on parle d'une competence ou d'une journee.
 */
export function sujetDuFil(fil: DiscussionThread): string {
  if (fil.outcomeLabel) {
    return fil.outcomeCode ? `${fil.outcomeCode} — ${fil.outcomeLabel}` : fil.outcomeLabel;
  }
  if (fil.occurredOn) {
    return `Journée du ${new Date(fil.occurredOn).toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long",
    })}`;
  }
  return "Échange";
}

/**
 * LA CONVERSATION OUVERTE — la meme des deux cotes.
 *
 * Un seul composant pour l'apprenant et pour l'encadrant : ce sont les memes
 * messages, la meme fonction d'ecriture et les memes droits. En ecrire deux
 * aurait garanti qu'ils finissent par dire deux choses differentes de la meme
 * conversation.
 *
 * L'INSCRIPTION VIENT DU FIL, pas d'une propriete : l'encadrant lit les fils de
 * plusieurs etudiants, il n'a pas « une » inscription.
 */
export function ThreadConversation({
  fil,
  contexte,
}: {
  fil: DiscussionThread;
  contexte: string | undefined;
}) {
  const data = useDataAccess();
  const queryClient = useQueryClient();
  const { person } = useSession();
  const [brouillon, setBrouillon] = useState("");

  const { data: messages, isPending } = useQuery({
    queryKey: ["discussion-messages", fil.id],
    queryFn: () => data.discussions.listMessages(fil.id),
  });

  const envoi = useMutation({
    mutationFn: (body: string) =>
      data.discussions.postMessage({
        enrollmentId: fil.enrollmentId,
        ...(fil.outcomeId ? { outcomeId: fil.outcomeId } : {}),
        ...(fil.stageLogEntryId ? { stageLogEntryId: fil.stageLogEntryId } : {}),
        body,
      }),
    onSuccess: () => {
      setBrouillon("");
      void queryClient.invalidateQueries({ queryKey: ["discussion-messages", fil.id] });
      void queryClient.invalidateQueries({ queryKey: ["discussion-threads"] });
    },
    onError: (raison) =>
      toast.error(raison instanceof Error ? raison.message : "Message non envoyé."),
  });

  return (
    <div className="space-y-3 border-t px-4 py-3.5">
      {/*
        LE CONTEXTE EST RELU, PAS RECOPIE. Le recit d'une journee se complete
        souvent apres coup : une copie figee au moment du clic ferait repondre
        l'encadrant a une version perimee du texte.
      */}
      {contexte && contexte.trim().length > 0 ? (
        <blockquote className="text-muted-foreground border-s-2 ps-3 text-[13px] leading-snug">
          {contexte}
        </blockquote>
      ) : null}

      {isPending ? (
        <Skeleton className="h-20 w-full" />
      ) : (
        <ul className="space-y-3">
          {(messages ?? []).map((message) => {
            const deMoi = message.authorPersonId === person.id;
            return (
              <li key={message.id} className="text-[13px] leading-snug">
                <p className={`${EYEBROW} text-muted-foreground`} style={TABULAIRE}>
                  {deMoi ? "Moi" : (message.authorName ?? "Participant")} ·{" "}
                  {new Date(message.createdAt).toLocaleString("fr-FR", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
                <p className="text-foreground mt-1 whitespace-pre-line">{message.body}</p>
              </li>
            );
          })}
        </ul>
      )}

      <div className="space-y-2">
        <Textarea
          value={brouillon}
          rows={2}
          maxLength={MESSAGE_MAX}
          aria-label={`Répondre — ${sujetDuFil(fil)}`}
          placeholder="Votre message…"
          onChange={(event) => setBrouillon(event.target.value)}
        />
        <Button
          size="sm"
          disabled={brouillon.trim().length === 0 || envoi.isPending}
          onClick={() => envoi.mutate(brouillon)}
        >
          Envoyer
        </Button>
      </div>
    </div>
  );
}

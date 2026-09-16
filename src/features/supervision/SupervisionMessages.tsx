import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessagesSquare } from "lucide-react";
import { toast } from "sonner";

import { SectionHeading } from "@/components/section-heading";
import { EYEBROW, TABULAIRE } from "@/components/milestone-heading";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useDataAccess, useSession } from "@/application/session";
import { ThreadConversation, nonLu, sujetDuFil } from "@/features/discussions/ThreadPanel";
import { renderReceivedMessage } from "@/domain/communication";
import type { DiscussionThreadId, MessageDeliveryId } from "@/domain/types";

/**
 * MESSAGERIE DE L'ENCADRANT — deux pavés (10/09).
 *
 * DEUX PAVES, PARCE QU'IL Y A DEUX MODELES EN BASE, exactement comme côté
 * apprenant depuis le 09/09 : les ANNONCES sont des campagnes
 * (`communication_deliveries` — diffusion, aucune réponse possible), les
 * ECHANGES sont des FILS (`discussion_threads` — un auteur par message, ancrés
 * sur une compétence ou une journée de carnet). Une liste unique laisserait
 * croire qu'on peut répondre à tout. Décision de Stef, 10/09.
 *
 * LE PÉRIMÈTRE DES FILS N'EST PAS CALCULÉ ICI, et c'est structurel : on demande
 * TOUS les fils du programme, et la policy `discussion_threads_select`
 * s'appuie sur `supervises_enrollment()` — l'encadrant ne reçoit que les fils
 * de ses groupes. Le filtrer côté écran aurait créé une seconde vérité à tenir
 * d'accord avec la RLS.
 *
 * LES ANNONCES SONT CELLES DE L'ENCADRANT LUI-MEME : `listMyMessages()` lit
 * les livraisons de la personne connectée, quel que soit son rôle. Un encadrant
 * destinataire d'une campagne la lit ici, et nulle part ailleurs.
 *
 * PAS DE « NOUVEAU MESSAGE ». Un fil pend à une compétence ou à une journée de
 * carnet : il n'y a pas de conversation « à propos de rien ».
 */
export function SupervisionMessages() {
  const data = useDataAccess();
  const queryClient = useQueryClient();
  const { activeProgram, person } = useSession();
  const [ouvert, setOuvert] = useState<DiscussionThreadId | null>(null);

  const { data: fils, isPending } = useQuery({
    queryKey: ["discussion-threads", "programme", activeProgram.id],
    queryFn: () => data.discussions.listThreadsForProgram(activeProgram.id),
  });

  const { data: annonces } = useQuery({
    queryKey: ["learner-messages", activeProgram.id],
    queryFn: () => data.messages.listMyMessages(),
  });

  const marquerFil = useMutation({
    mutationFn: (threadId: DiscussionThreadId) => data.discussions.markThreadRead(threadId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["discussion-threads"] }),
  });

  const marquerAnnonce = useMutation({
    mutationFn: (deliveryId: MessageDeliveryId) => data.messages.markRead(deliveryId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["learner-messages"] }),
    onError: (raison) =>
      toast.error(raison instanceof Error ? raison.message : "Message non marqué comme lu."),
  });

  if (isPending) return <Skeleton className="h-64 w-full" />;

  const liste = fils ?? [];
  const enAttente = liste.filter(nonLu).length;
  /* La promotion n'a pas de sens pour un encadrant : `{{cohortTitle}}` reste
     visible si une campagne l'emploie, ce qui est le comportement voulu — une
     variable non résolue doit se voir. */
  const valeurs = { fullName: person.fullName, programTitle: activeProgram.name };
  const recus = (annonces ?? []).map((message) => ({
    ...message,
    subject: renderReceivedMessage(message.subject, valeurs),
    body: renderReceivedMessage(message.body, valeurs),
  }));

  return (
    <div className="space-y-7">
      <SectionHeading
        eyebrow={activeProgram.name}
        title="Messagerie"
        level={1}
        description="Les annonces qui vous sont adressées, et les échanges ouverts par vos étudiants."
      />

      <section>
        <h2 className="font-display mb-3 text-[21px] font-medium tracking-[-0.015em]">
          Boîte de réception
        </h2>
        <div className="bg-card overflow-hidden rounded-xl border shadow-[var(--shadow-card)]">
          {recus.length === 0 ? (
            <p className="text-muted-foreground px-4 py-6 text-center text-[13px] leading-relaxed">
              Aucune annonce pour l'instant.
              <br />
              Les messages adressés par l'administration du programme apparaîtront ici.
            </p>
          ) : (
            <ul className="divide-border divide-y">
              {recus.map((message) => {
                const lu = message.readAt !== null;
                return (
                  <li key={message.deliveryId} className="flex items-start gap-3 px-4 py-3.5">
                    <span
                      className={`mt-2 size-2 shrink-0 rounded-full ${lu ? "bg-transparent" : "bg-live"}`}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <p
                        className={`font-display text-[16.5px] leading-tight tracking-[-0.01em] ${
                          lu ? "text-muted-foreground" : ""
                        }`}
                      >
                        {message.subject}
                        {lu ? null : <span className="sr-only"> (non lu)</span>}
                      </p>
                      <p className="text-muted-foreground mt-1.5 text-[13px] leading-snug whitespace-pre-line">
                        {message.body}
                      </p>
                      <p className={`${EYEBROW} text-muted-foreground mt-2`} style={TABULAIRE}>
                        {message.channel === "email" ? "e-mail" : "application"} ·{" "}
                        {new Date(message.receivedAt).toLocaleDateString("fr-FR")}
                      </p>
                    </div>
                    {lu ? null : (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="shrink-0"
                        disabled={marquerAnnonce.isPending}
                        onClick={() => marquerAnnonce.mutate(message.deliveryId)}
                      >
                        Marquer comme lu
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <p className="text-muted-foreground border-t px-4 py-3 text-[12.5px] leading-relaxed">
            On ne répond pas à une annonce&nbsp;: pour écrire à un étudiant, utilisez son échange
            ci-dessous.
          </p>
        </div>
      </section>

      <section>
        <h2 className="font-display mb-3 text-[21px] font-medium tracking-[-0.015em]">
          Échanges avec mes étudiants
        </h2>
        <div className="bg-card overflow-hidden rounded-xl border shadow-[var(--shadow-card)]">
          {liste.length === 0 ? (
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
                      if (suivant && nonLu(fil)) marquerFil.mutate(fil.id);
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
                        personnes, pas des sujets.
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
      </section>
    </div>
  );
}

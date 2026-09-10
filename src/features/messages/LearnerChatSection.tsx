import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessagesSquare } from "lucide-react";
import { toast } from "sonner";

import { EYEBROW, TABULAIRE } from "@/components/milestone-heading";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useDataAccess, useSession } from "@/application/session";
import type { DiscussionThread, DiscussionThreadId, EnrollmentId, OutcomeId } from "@/domain/types";
import {
  MESSAGE_MAX,
  ThreadConversation,
  nonLu,
  sujetDuFil,
} from "@/features/discussions/ThreadPanel";

/**
 * LE COMPOSEUR D'UN FIL QUI N'EXISTE PAS ENCORE.
 *
 * ON N'OUVRE PAS DE FIL VIDE. Creer le fil a l'arrivee, avant tout message,
 * ferait une ligne muette dans la liste des deux cotes et une alerte de non-lu
 * pour l'encadrant, sans rien a lire. Le fil naît de son premier message —
 * `post_discussion_message` ouvre et poste en un seul geste.
 */
function NouvelEchange({
  enrollmentId,
  outcomeId,
  stageLogEntryId,
  sujet: intitule,
  contexte,
}: {
  enrollmentId: EnrollmentId;
  outcomeId?: string;
  stageLogEntryId?: string;
  sujet: string;
  contexte: string | undefined;
}) {
  const data = useDataAccess();
  const queryClient = useQueryClient();
  const [brouillon, setBrouillon] = useState("");

  const envoi = useMutation({
    mutationFn: (body: string) =>
      data.discussions.postMessage({
        enrollmentId,
        ...(outcomeId ? { outcomeId: outcomeId as OutcomeId } : {}),
        ...(stageLogEntryId ? { stageLogEntryId } : {}),
        body,
      }),
    onSuccess: () => {
      setBrouillon("");
      void queryClient.invalidateQueries({ queryKey: ["discussion-threads"] });
      toast.success("Message envoyé à vos encadrants.");
    },
    onError: (raison) =>
      toast.error(raison instanceof Error ? raison.message : "Message non envoyé."),
  });

  return (
    <div className="space-y-3 px-4 py-3.5">
      <p className="font-display text-[16.5px] leading-tight tracking-[-0.01em]">{intitule}</p>
      {contexte && contexte.trim().length > 0 ? (
        <blockquote className="border-s-2 ps-3 text-[13px] leading-snug text-muted-foreground">
          {contexte}
        </blockquote>
      ) : null}
      <Textarea
        value={brouillon}
        rows={3}
        maxLength={MESSAGE_MAX}
        aria-label={`Message à mes encadrants — ${intitule}`}
        placeholder="Votre question ou votre précision…"
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
  );
}

/**
 * MES ÉCHANGES — le pavé « Chat », à côté de la boîte de réception (10/09).
 *
 * DEUX PAVÉS PARCE QU'IL Y A DEUX MODÈLES EN BASE, et non par goût de la mise
 * en page. « Boîte de réception » lit des CAMPAGNES : une administration écrit
 * à une audience, une ligne de remise par destinataire, et rien dans cette
 * table ne sait porter une réponse. « Mes échanges » lit des FILS : un auteur
 * par message, une conversation à propos d'un objet. Les mélanger dans une
 * liste unique aurait obligé l'écran à faire croire qu'on peut répondre à tout.
 *
 * LE FIL S'OUVRE, ET C'EST CE GESTE QUI LE MARQUE LU — contrairement aux
 * messages de campagne, qui ont leur propre bouton. La différence est voulue :
 * ouvrir un fil, c'est le lire ; recevoir une convocation ne l'est pas.
 *
 * ⚠️ « LU » EST PERSONNEL. La table `discussion_thread_reads` porte une ligne
 * par personne : un encadrant qui ouvre le fil ne l'éteint pas pour ses
 * collègues du groupe. C'est la conséquence directe du choix de Stef — le
 * groupe entier voit le fil.
 */
export function LearnerChatSection({
  enrollmentId,
  contextes,
  ancre,
  sujetAncre,
}: {
  enrollmentId: EnrollmentId;
  /** Les notes d'expérience, par acquis : le contexte des fils de compétence. */
  contextes: ReadonlyMap<string, string>;
  /** L'objet désigné par le lien profond, quand on arrive depuis un bouton. */
  ancre?: { competence?: string; journee?: string };
  /** Le sujet à afficher tant que le fil n'existe pas encore. */
  sujetAncre?: string;
}) {
  const data = useDataAccess();
  const queryClient = useQueryClient();
  const [ouvert, setOuvert] = useState<DiscussionThreadId | null>(null);

  const { data: fils, isPending } = useQuery({
    queryKey: ["discussion-threads", enrollmentId],
    queryFn: () => data.discussions.listThreads(enrollmentId),
  });

  const marquer = useMutation({
    mutationFn: (threadId: DiscussionThreadId) => data.discussions.markThreadRead(threadId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["discussion-threads"] }),
  });

  /*
   * ARRIVEE PAR LE BOUTON « Echanger avec mon tuteur ».
   *
   * Si un fil existe deja sur cet objet, on l'ouvre. SINON ON N'EN CREE PAS UN
   * VIDE : un fil sans message serait une ligne muette dans la liste, et
   * l'encadrant recevrait une alerte pour rien. On affiche un composeur, et
   * c'est le premier envoi qui ouvre le fil — exactement ce que
   * `post_discussion_message` sait faire en un seul geste.
   */
  const filDeLAncre = ancre
    ? (fils ?? []).find(
        (f) =>
          (ancre.competence !== undefined && f.outcomeId === ancre.competence) ||
          (ancre.journee !== undefined && f.stageLogEntryId === ancre.journee),
      )
    : undefined;
  const ancreSansFil = Boolean(ancre?.competence ?? ancre?.journee) && filDeLAncre === undefined;

  const ouverture = ouvert ?? filDeLAncre?.id ?? null;

  const ouvrir = (fil: DiscussionThread) => {
    const suivant = ouverture === fil.id ? null : fil.id;
    setOuvert(suivant);
    if (suivant && nonLu(fil)) marquer.mutate(fil.id);
  };

  return (
    <section>
      <h2 className="mb-3 font-display text-[21px] font-medium tracking-[-0.015em]">
        Mes échanges
      </h2>
      <div className="overflow-hidden rounded-xl border bg-card shadow-[var(--shadow-card)]">
        {isPending ? (
          <Skeleton className="h-24 w-full" />
        ) : ancreSansFil ? (
          <NouvelEchange
            enrollmentId={enrollmentId}
            {...(ancre?.competence ? { outcomeId: ancre.competence } : {})}
            {...(ancre?.journee ? { stageLogEntryId: ancre.journee } : {})}
            sujet={sujetAncre ?? "Nouvel échange"}
            contexte={ancre?.competence !== undefined ? contextes.get(ancre.competence) : undefined}
          />
        ) : (fils ?? []).length === 0 ? (
          /*
            LE VIDE DIT OU SE FAIT LE GESTE. « Aucun échange » seul laisserait
            l'apprenant chercher un bouton « nouveau message » qui n'existe pas :
            un fil s'ouvre depuis la compétence ou la journée dont il parle.
          */
          <p className="px-4 py-6 text-center text-[13px] leading-relaxed text-muted-foreground">
            Aucun échange pour l'instant.
            <br />
            Un échange s'ouvre depuis une compétence ou une journée de stage, avec le bouton
            «&nbsp;Échanger avec mon tuteur&nbsp;».
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {(fils ?? []).map((fil) => (
              <li key={fil.id}>
                <button
                  type="button"
                  className="flex w-full items-start gap-3 px-4 py-3.5 text-start hover:bg-muted/40"
                  onClick={() => ouvrir(fil)}
                  aria-expanded={ouverture === fil.id}
                >
                  <span
                    className={`mt-2 size-2 shrink-0 rounded-full ${
                      nonLu(fil) ? "bg-live" : "bg-transparent"
                    }`}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block font-display text-[16.5px] leading-tight tracking-[-0.01em] ${
                        nonLu(fil) ? "" : "text-muted-foreground"
                      }`}
                    >
                      {sujetDuFil(fil)}
                      {nonLu(fil) ? <span className="sr-only"> (non lu)</span> : null}
                    </span>
                    <span
                      className={`${EYEBROW} mt-2 block text-muted-foreground`}
                      style={TABULAIRE}
                    >
                      <MessagesSquare className="me-1 inline size-3" aria-hidden />
                      dernier message le {new Date(fil.lastMessageAt).toLocaleDateString("fr-FR")}
                    </span>
                  </span>
                </button>
                {ouverture === fil.id ? (
                  <ThreadConversation
                    fil={fil}
                    contexte={
                      fil.contextBody ?? (fil.outcomeId ? contextes.get(fil.outcomeId) : undefined)
                    }
                  />
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <p className="border-t px-4 py-3 text-[12.5px] leading-relaxed text-muted-foreground">
          Ces échanges sont lus par vos encadrants de stage. Chaque fil reste rattaché à la
          compétence ou à la journée dont il parle.
        </p>
      </div>
    </section>
  );
}

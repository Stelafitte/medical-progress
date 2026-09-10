import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearch } from "@tanstack/react-router";
import { toast } from "sonner";

import { FieldHeader } from "@/components/field-header";
import { EYEBROW, TABULAIRE } from "@/components/milestone-heading";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useDataAccess, useSession } from "@/application/session";
import { LearnerChatSection } from "@/features/messages/LearnerChatSection";
import { useUnreadMessages } from "@/features/messages/useUnreadMessages";
import { nonLus, renderReceivedMessage } from "@/domain/communication";
import type { MessageDeliveryId } from "@/domain/types";

/**
 * MES MESSAGES — la boîte de réception réelle de l'apprenant (09/09).
 *
 * ⚠️ CE QUE CET ÉCRAN AFFICHAIT JUSQU'ICI. Trois messages ÉCRITS EN DUR dans ce
 * fichier — « Ouverture du module Doppler », « Rappel : dépôt de votre carnet de
 * stage », « Convocation à l'atelier de simulation », datés d'août 2026 —
 * servis à de vrais étudiants en production. Ce n'était pas une table vide ni un
 * écran à construire : du contenu inventé, plausible, indiscernable d'un vrai
 * message. C'est la troisième nature de maquette décrite le 04/09, et la seule
 * qui MENT au lieu de se taire.
 *
 * CE QUI EXISTAIT DÉJÀ. `communication_campaigns` et `communication_deliveries`
 * sont en base depuis le 04/09, avec un envoi réel déjà passé, et l'index
 * `communication_deliveries_person_idx` posé pour cette lecture précisément.
 * L'écran ne les avait jamais lues.
 *
 * LE TROU EXACT, MESURÉ AU BANC AVANT DE LE BOUCHER : l'apprenant avait le
 * droit de lire SA ligne de livraison, mais pas la campagne qui porte l'objet et
 * le corps. Il voyait qu'on lui avait écrit, jamais ce qu'on lui avait écrit.
 * Une policy de plus, appuyée sur une fonction `security definer` — sans elle,
 * les deux policies se regardent et PostgreSQL refuse les DEUX lectures.
 *
 * CE QUI DISPARAÎT AVEC LES FAUX MESSAGES : la mention « Simulé — aucune
 * réception réelle » et la catégorie. La catégorie n'existe pas en base (elle
 * vivait sur le modèle de message, pas sur la campagne) : l'afficher demanderait
 * de la deviner, et deviner est exactement ce qu'on vient de retirer de cet
 * écran.
 *
 * ⚠️ LES VARIABLES SONT RENDUES À LA LECTURE. La campagne est stockée avec
 * ses `{{...}}` — le premier envoi réel porte en base « Essai Campus —
 * {{programTitle}} » — et la substitution faite à l'envoi n'est écrite nulle
 * part. Sans ce rendu, l'étudiant lirait les accolades. On le fait ici parce
 * qu'ici, et seulement ici, le lecteur EST le destinataire : son nom, son
 * programme et sa promotion sont exactement les valeurs qu'a utilisées l'envoi.
 *
 * LA MARQUE « LU » A SON PROPRE BOUTON, elle ne se déclenche pas en ouvrant. La
 * règle vient du carnet de stage (07/09) : une écriture qui n'existe qu'en effet
 * de bord d'un autre geste devient inatteignable — et ici, marquer lu en
 * survolant priverait l'étudiant du seul repère qui lui reste dans une liste.
 */
export function LearnerMessagesView() {
  const data = useDataAccess();
  const { activeProgram, activeEnrollment, person } = useSession();
  const queryClient = useQueryClient();
  /** Lien profond depuis « Échanger avec mon tuteur ». */
  const ancre = useSearch({ from: "/espace/messages" });

  const {
    data: messages,
    isPending,
    isError,
  } = useQuery({
    queryKey: ["learner-messages", activeProgram.id],
    queryFn: () => data.messages.listMyMessages(),
  });

  /*
   * LA PROMOTION, LUE A PART, POUR LA SEULE VARIABLE `{{cohortTitle}}`. Sans
   * elle le rendu laisserait ces accolades-la visibles — ce qui reste correct
   * (une variable non resolue doit se voir) mais evitable : la session connait
   * deja l'inscription, il ne manquait que le libelle.
   */
  const { data: cohorte } = useQuery({
    queryKey: ["cohort", activeEnrollment?.cohortId ?? "none"],
    queryFn: () => data.programs.getCohort(activeEnrollment!.cohortId),
    enabled: Boolean(activeEnrollment),
  });

  /*
   * LES NOTES D'EXPERIENCE, pour afficher en tete d'un fil de competence le
   * texte dont on parle. RELUES, jamais recopiees dans le premier message :
   * l'apprenant complete sa note apres coup, et une copie figee ferait repondre
   * l'encadrant a une version perimee.
   */
  const { data: notes } = useQuery({
    queryKey: ["experience-notes", activeEnrollment?.id ?? "none"],
    queryFn: () => data.passport.listExperienceNotes(activeEnrollment!.id),
    enabled: Boolean(activeEnrollment),
  });

  /*
   * LES ACQUIS, LUS SEULEMENT SI ON ARRIVE PAR UN LIEN DE COMPETENCE : c'est la
   * seule facon de nommer le sujet d'un fil qui n'existe pas encore. Sur la
   * messagerie ouverte normalement, cette lecture ne part pas.
   */
  const { data: acquis } = useQuery({
    queryKey: ["outcomes", activeProgram.id],
    queryFn: () => data.outcomes.listOutcomes(activeProgram.id),
    enabled: ancre.competence !== undefined,
  });

  /* Le meme compteur que la pastille du bandeau, sur les memes cles de cache :
     aucune requete de plus, et les deux chiffres ne peuvent pas diverger. */
  const compteurs = useUnreadMessages();

  const marquer = useMutation({
    mutationFn: (deliveryId: MessageDeliveryId) => data.messages.markRead(deliveryId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["learner-messages"] }),
    onError: (reason) =>
      toast.error(reason instanceof Error ? reason.message : "Message non marqué comme lu."),
  });

  if (!activeEnrollment) {
    return (
      <p className="text-sm text-muted-foreground">Aucune inscription active pour ce programme.</p>
    );
  }
  if (isPending) return <Skeleton className="h-64 w-full" />;
  if (isError) {
    return <p className="text-destructive text-sm">Boîte de réception momentanément illisible.</p>;
  }

  const valeurs = {
    fullName: person.fullName,
    programTitle: activeProgram.name,
    ...(cohorte ? { cohortTitle: cohorte.label } : {}),
  };
  const recus = (messages ?? []).map((message) => ({
    ...message,
    subject: renderReceivedMessage(message.subject, valeurs),
    body: renderReceivedMessage(message.body, valeurs),
  }));

  /*
   * LE SUJET D'UN FIL PAS ENCORE OUVERT. Pour une journee de carnet on ne va
   * PAS chercher sa date : il faudrait une lecture de plus pour un libelle qui
   * ne vit que le temps du premier message — apres quoi le fil porte lui-meme
   * son sujet, joint par la requete.
   */
  const acquisAncre = ancre.competence
    ? (acquis ?? []).find((o) => o.id === ancre.competence)
    : undefined;
  const sujetAncre = acquisAncre
    ? `${acquisAncre.code} — ${acquisAncre.label}`
    : ancre.journee
      ? "Nouvel échange à propos d'une journée de stage"
      : undefined;

  return (
    <div className="space-y-7">
      <FieldHeader
        eyebrow={activeProgram.name}
        title="Mes messages"
        /*
          LES DEUX SOURCES COMPTEES SEPAREMENT, et pas fondues en un total :
          une annonce et un echange ne se traitent pas pareil — l'une se marque
          lue d'un bouton, l'autre en s'ouvrant. Un chiffre unique dirait « il y
          a quelque chose », sans dire OU.
        */
        figures={[
          { value: recus.length, label: recus.length > 1 ? "messages" : "message" },
          { value: nonLus(recus), label: "annonces non lues" },
          { value: compteurs.echanges, label: "échanges non lus" },
        ]}
      />

      <section>
        <h2 className="mb-3 font-display text-[21px] font-medium tracking-[-0.015em]">
          Boîte de réception
        </h2>
        {/*
          LE PERIMETRE EST RAPPELE DANS LA CARTE, PAS AU-DESSUS. Le bandeau
          `ScopeNotice` flottait entre le titre de page et le contenu, encadre
          et souligne d'une icone : il criait plus fort que les messages
          eux-memes. Il redevient une note de pied, sous un filet, a l'interieur
          de l'objet qu'il qualifie — le meme geste que sur le pave de stage.
        */}
        <div className="overflow-hidden rounded-xl border bg-card shadow-[var(--shadow-card)]">
          {recus.length === 0 ? (
            /*
              LE VIDE DIT CE QU'IL ATTEND. « Aucun message » tout court laisse
              l'etudiant se demander si l'ecran fonctionne ; nommer ce qui
              arrivera ici fait la difference entre une boite vide et une boite
              cassee.
            */
            <p className="px-4 py-6 text-center text-[13px] leading-relaxed text-muted-foreground">
              Aucun message reçu pour l'instant.
              <br />
              Les annonces et convocations de votre programme apparaîtront ici.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {recus.map((message) => {
                const lu = message.readAt !== null;
                return (
                  <li key={message.deliveryId} className="flex items-start gap-3 px-4 py-3.5">
                    {/*
                      LE NON-LU EST PORTE PAR LA GRAISSE ET UN MARQUEUR, jamais
                      par la couleur seule : un daltonien, un ecran en plein
                      soleil ou un mode contraste eleve la perdent.
                    */}
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
                      {/*
                        `whitespace-pre-line` : le corps vient d'un courriel
                        redige par un enseignant, avec ses retours a la ligne.
                        Les ecraser collerait deux paragraphes en un bloc.
                      */}
                      <p className="mt-1.5 whitespace-pre-line text-[13px] leading-snug text-muted-foreground">
                        {message.body}
                      </p>
                      <p className={`${EYEBROW} mt-2 text-muted-foreground`} style={TABULAIRE}>
                        {message.channel === "email" ? "e-mail" : "application"} ·{" "}
                        {new Date(message.receivedAt).toLocaleDateString("fr-FR")}
                      </p>
                    </div>
                    {lu ? null : (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="shrink-0"
                        disabled={marquer.isPending}
                        onClick={() => marquer.mutate(message.deliveryId)}
                      >
                        Marquer comme lu
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <p className="border-t px-4 py-3 text-[12.5px] leading-relaxed text-muted-foreground">
            Vous recevez ici les messages adressés par l'équipe de votre programme. On ne répond pas
            à une annonce&nbsp;: pour écrire à vos encadrants, utilisez «&nbsp;Mes échanges&nbsp;»
            ci-dessous.
          </p>
        </div>
      </section>

      {/*
        DEUX PAVES, PARCE QU'IL Y A DEUX MODELES EN BASE. Les annonces sont des
        CAMPAGNES (diffusion, aucune reponse possible) ; les echanges sont des
        FILS (un auteur par message, ancres sur une competence ou une journee).
        Une liste unique aurait laisse croire qu'on peut repondre a tout.
      */}
      <LearnerChatSection
        enrollmentId={activeEnrollment.id}
        contextes={new Map((notes ?? []).map((n) => [n.outcomeId as string, n.body] as const))}
        ancre={ancre}
        {...(sujetAncre ? { sujetAncre } : {})}
      />
    </div>
  );
}

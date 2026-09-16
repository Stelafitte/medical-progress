/**
 * RELANCER LES PERSONNES CONCERNÉES — depuis le pilotage, pour de bon.
 *
 * Les marqueurs par apprenant (en retard, en attente de validation, sans
 * activité) étaient calculés correctement depuis longtemps, et les
 * destinataires de chaque relance déjà identifiés. Il ne manquait que l'envoi :
 * le bouton était inerte.
 *
 * CE QUE CE PANNEAU FAIT, ET CE QU'IL NE FAIT PAS. Il écrit un vrai BROUILLON
 * de campagne, avec la bonne liste nominative et un texte prérempli. Il
 * n'envoie pas : l'envoi reste le monopole de « Communication interne », qui a
 * le mode essai, le décompte des destinataires et la confirmation en deux
 * temps. Dupliquer ce geste ici, ce serait une deuxième façon de se tromper —
 * et la seule irréversible.
 */
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Loader2, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/features/professional/mock-ui";
import { createCampaign } from "@/infrastructure/supabase/communicationDirectory";
import { LEARNER_MARKER_LABELS_FR } from "@/features/administration/pilotSectionsViewModel";
import type { LearnerActivityRow } from "@/features/administration/pilotSectionsViewModel";
import type { ProgramId } from "@/domain/types";

/** Les marqueurs qui appellent une relance. « À jour » n'en appelle aucune. */
const A_RELANCER: readonly LearnerActivityRow["marker"][] = ["late", "idle", "awaiting_validation"];

export function RelancePanel({
  programId,
  cohortLabel,
  rows,
  personIdPour,
}: {
  readonly programId: ProgramId;
  readonly cohortLabel: string;
  readonly rows: readonly LearnerActivityRow[];
  /** L'inscription ne porte pas la personne : le pilotage fait la jointure. */
  readonly personIdPour: (enrollmentId: string) => string | undefined;
}) {
  const [marqueur, setMarqueur] = useState<LearnerActivityRow["marker"] | null>(null);
  const [objet, setObjet] = useState("");
  const [corps, setCorps] = useState("");
  const [brouillon, setBrouillon] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const destinataires = marqueur
    ? rows
        .filter((r) => r.marker === marqueur)
        .map((r) => ({ nom: r.personName, personId: personIdPour(r.enrollmentId) }))
        .filter((d): d is { nom: string; personId: string } => Boolean(d.personId))
    : [];

  const creer = useMutation({
    mutationFn: () =>
      createCampaign({
        programId,
        subject: objet.trim(),
        body: corps.trim(),
        audience: { kind: "persons", personIds: destinataires.map((d) => d.personId) },
      }),
    onSuccess: (id) => {
      setBrouillon(id);
      setErreur(null);
    },
    onError: (raison: unknown) =>
      setErreur(raison instanceof Error ? raison.message : "Brouillon impossible."),
  });

  const choisir = (m: LearnerActivityRow["marker"]) => {
    setMarqueur(m);
    setBrouillon(null);
    setErreur(null);
    setObjet(`${cohortLabel} — ${LEARNER_MARKER_LABELS_FR[m]}`);
    setCorps(
      m === "late"
        ? "Bonjour {{firstName}},\n\nVotre parcours accuse un retard sur le calendrier de la promotion. Prenez quelques minutes pour faire le point, et dites-nous si quelque chose vous bloque.\n\nL'équipe pédagogique."
        : m === "idle"
          ? "Bonjour {{firstName}},\n\nNous n'avons aucune activité de votre part sur le parcours depuis un moment. Tout va bien ? Répondez à ce message si vous avez besoin d'aide.\n\nL'équipe pédagogique."
          : "Bonjour {{firstName}},\n\nVos déclarations attendent une validation de votre encadrant. Nous l'avons relancé de notre côté ; prévenez-nous si rien ne bouge.\n\nL'équipe pédagogique.",
    );
  };

  const groupes = A_RELANCER.map((m) => ({
    marker: m,
    nombre: rows.filter((r) => r.marker === m).length,
  })).filter((g) => g.nombre > 0);

  if (groupes.length === 0) {
    return <EmptyState>Personne à relancer sur cette promotion.</EmptyState>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {groupes.map((g) => (
          <Button
            key={g.marker}
            type="button"
            size="sm"
            variant={marqueur === g.marker ? "default" : "outline"}
            className="min-h-11"
            onClick={() => choisir(g.marker)}
          >
            {LEARNER_MARKER_LABELS_FR[g.marker]}
            <Badge variant="secondary" className="ms-2 font-normal">
              {g.nombre}
            </Badge>
          </Button>
        ))}
      </div>

      {erreur ? (
        <p className="border-destructive/40 text-destructive rounded-lg border px-3 py-2 text-[13px]">
          {erreur}
        </p>
      ) : null}

      {marqueur && !brouillon ? (
        <div className="space-y-3 rounded-lg border p-4">
          <p className="text-muted-foreground text-[13px]">
            {destinataires.length} destinataire(s) : {destinataires.map((d) => d.nom).join(", ")}
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="relance-objet">Objet</Label>
            <Input
              id="relance-objet"
              value={objet}
              onChange={(e) => setObjet(e.target.value)}
              className="min-h-11"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="relance-corps">Message</Label>
            <Textarea
              id="relance-corps"
              value={corps}
              onChange={(e) => setCorps(e.target.value)}
              rows={7}
            />
            <p className="text-muted-foreground text-[12px]">
              {"{{firstName}}"} et {"{{lastName}}"} sont remplacés à l'envoi.
            </p>
          </div>
          <Button
            type="button"
            className="min-h-11"
            disabled={
              destinataires.length === 0 ||
              objet.trim().length < 3 ||
              corps.trim().length < 10 ||
              creer.isPending
            }
            onClick={() => creer.mutate()}
          >
            {creer.isPending ? (
              <Loader2 className="me-1 size-4 animate-spin" aria-hidden />
            ) : (
              <Send className="me-1 size-4" aria-hidden />
            )}
            Préparer l'envoi
          </Button>
        </div>
      ) : null}

      {brouillon ? (
        <div className="bg-card-sunk space-y-2 rounded-lg px-4 py-3">
          <p className="text-[13px] leading-relaxed">
            Brouillon créé pour {destinataires.length} destinataire(s). L'envoi — mode essai,
            décompte, confirmation — se fait dans « Communication interne » : c'est le seul endroit
            qui l'ait, et le geste est irréversible.
          </p>
          <Button asChild size="sm" className="min-h-11">
            <Link to="/espace/administration/communications">
              Ouvrir Communication interne
              <ArrowRight className="ms-1 size-4" aria-hidden />
            </Link>
          </Button>
        </div>
      ) : null}
    </div>
  );
}

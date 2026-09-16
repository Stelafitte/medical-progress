/**
 * PARCOURS SUSPENDU — l'écran que voit l'apprenant à la place du programme.
 *
 * ⚠️ CE QUI MANQUAIT, ET QUE STEF A TROUVÉ EN TESTANT (16/09 au soir) :
 * « malgré suspension, l'accès apprenant maintenu malgré présence du message ».
 * Il avait raison, et c'était mon oubli. J'avais posé deux choses — la garde
 * d'ÉCRITURE en trigger de base, et le bandeau d'annonce — mais RIEN qui
 * empêche de VOIR. Or « suspendre » veut dire, depuis le premier jour :
 * « l'apprenant ne voit plus le programme ». Un bandeau qui dit que le parcours
 * est suspendu au-dessus d'un parcours qui fonctionne, c'est le pire des deux
 * mondes : ça inquiète sans protéger.
 *
 * CE QUI RESTE ACCESSIBLE, ET POURQUOI. Le profil et la messagerie. Un étudiant
 * dont le parcours ferme sans qu'il puisse écrire à personne appelle le
 * secrétariat — et suspendre un parcours n'est pas couper le contact.
 *
 * `geler` NE PASSE PAS PAR ICI : tout y reste visible et relisible, c'est la
 * base qui refuse les rendus.
 */
import { Link } from "@tanstack/react-router";
import { Pause } from "lucide-react";
import { Button } from "@/components/ui/button";

function dateFr(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}

export function ParcoursSuspendu({
  motif,
  jusquA,
}: {
  readonly motif: string;
  readonly jusquA?: string | null | undefined;
}) {
  return (
    <section className="mx-auto max-w-xl">
      <div className="bg-card overflow-hidden rounded-xl border shadow-[var(--shadow-card)]">
        <div className="bg-live h-[3px]" aria-hidden />
        <div className="space-y-4 px-6 py-7">
          <span className="bg-live/15 text-live-ink grid size-10 place-items-center rounded-lg">
            <Pause className="size-5" aria-hidden />
          </span>
          <div>
            <h1 className="font-display text-[26px] font-medium leading-tight">
              Votre parcours est suspendu
            </h1>
            <p className="text-ink-soft mt-3 text-[14px] leading-relaxed">{motif}</p>
            {jusquA ? (
              <p className="text-ink-soft mt-2 text-[14px]">
                Reprise prévue le <strong>{dateFr(jusquA)}</strong>.
              </p>
            ) : null}
          </div>
          <p className="text-muted-foreground text-[13px] leading-relaxed">
            Rien n'est perdu : ce que vous avez rendu et ce qui a été validé sont conservés. Le
            parcours reprendra là où il s'est arrêté.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button asChild className="min-h-11">
              <Link to="/espace/messages">Écrire à l'équipe</Link>
            </Button>
            <Button asChild variant="outline" className="min-h-11">
              <Link to="/espace/profil">Mon profil</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

import { useId, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import { initials } from "@/lib/initials";
import { loadOwnAvatar, removeOwnAvatar, uploadOwnAvatar } from "@/infrastructure/supabase/avatar";

/**
 * LA PHOTO DE PROFIL, cote ecran.
 *
 * POURQUOI UNE PHOTO. Stef, 08/09 : « cela pourrait permettre de suivre les
 * etudiants ». Le rond d'initiales ne distingue pas deux etudiants aux memes
 * initiales, et ne dit rien a un encadrant qui ouvre une fiche.
 *
 * LES INITIALES RESTENT LE REPLI, jamais un etat d'erreur. Pas de photo, URL
 * non signee, image illisible : dans les trois cas le rond de degrade revient,
 * sans message. Une page de profil ne doit pas se casser parce qu'une image
 * manque.
 *
 * EN SESSION SIMULEE, RIEN N'EST PROPOSE. Il n'y a aucun compte derriere, donc
 * aucun dossier ou ecrire : afficher un bouton qui echouera apprend a
 * l'utilisateur a se mefier de l'ecran. Meme parti pris que `IdentityForm`.
 *
 * LES CONTROLES DE TAILLE ET DE TYPE SONT DANS LE MODULE D'ACCES, et surtout en
 * base. Ceux d'ici ne servent qu'a rendre le message lisible.
 */
export function AvatarField({
  fullName,
  isSimulated,
}: {
  readonly fullName: string;
  readonly isSimulated: boolean;
}) {
  const champId = useId();
  const queryClient = useQueryClient();
  const entree = useRef<HTMLInputElement>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const avatar = useQuery({
    queryKey: ["own-avatar"],
    queryFn: loadOwnAvatar,
    enabled: !isSimulated,
  });

  const rafraichir = () => {
    setErreur(null);
    void queryClient.invalidateQueries({ queryKey: ["own-avatar"] });
  };

  const televerser = useMutation({
    mutationFn: uploadOwnAvatar,
    onSuccess: rafraichir,
    onError: (e: Error) => setErreur(e.message),
  });

  const retirer = useMutation({
    mutationFn: removeOwnAvatar,
    onSuccess: rafraichir,
    onError: (e: Error) => setErreur(e.message),
  });

  const enCours = televerser.isPending || retirer.isPending;
  const url = avatar.data?.url ?? null;

  return (
    <div className="flex flex-wrap items-center gap-4">
      {url === null ? (
        <span
          aria-hidden
          className="hero-gradient grid size-14 shrink-0 place-items-center rounded-full text-lg font-semibold text-primary-foreground"
        >
          {initials(fullName)}
        </span>
      ) : (
        /*
          `alt` VIDE, DELIBEREMENT : le nom de la personne est affiche juste a
          cote. Le repeter ici le ferait annoncer deux fois par un lecteur
          d'ecran, et la photo n'apporte aucune information de plus.
        */
        <img
          src={url}
          alt=""
          className="size-14 shrink-0 rounded-full border object-cover"
          /* Si l'URL signee expire ou l'objet disparait, on retombe sur les
             initiales au prochain rendu plutot que d'afficher une image cassee. */
          onError={() => queryClient.invalidateQueries({ queryKey: ["own-avatar"] })}
        />
      )}

      <div className="min-w-0">
        <p className="font-display text-[19px] leading-tight tracking-[-0.015em]">{fullName}</p>

        {isSimulated ? (
          <p className="mt-1 text-[12.5px] text-muted-foreground">
            Photo indisponible en session simulée : aucun compte derrière ce profil.
          </p>
        ) : (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
            {/*
              L'ENTREE DE FICHIER EST MASQUEE VISUELLEMENT, PAS RETIREE :
              `sr-only` la garde atteignable au clavier et au lecteur d'ecran,
              et le libelle lui sert de commande. `capture` n'est pas pose : sur
              telephone, le systeme propose deja l'appareil photo ET la
              galerie, et forcer l'appareil interdirait une photo existante.
            */}
            <input
              ref={entree}
              id={champId}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              disabled={enCours}
              onChange={(event) => {
                const fichier = event.target.files?.[0];
                event.target.value = "";
                if (fichier) televerser.mutate(fichier);
              }}
            />
            <label
              htmlFor={champId}
              className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 text-[13.5px] font-semibold text-primary focus-within:outline-none"
            >
              {enCours ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {url === null ? "Ajouter une photo" : "Changer la photo"}
            </label>

            {url === null ? null : (
              <button
                type="button"
                className="inline-flex min-h-11 items-center text-[13.5px] text-muted-foreground underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                disabled={enCours}
                onClick={() => retirer.mutate()}
              >
                Retirer
              </button>
            )}
          </div>
        )}

        {erreur === null ? (
          <p className="mt-1 text-[12.5px] text-muted-foreground">
            JPEG, PNG ou WebP, 2 Mo maximum.
          </p>
        ) : (
          <p role="alert" className="mt-1 text-[12.5px] text-destructive">
            {erreur}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * RECHERCHE — l'écran de résultats, en six blocs.
 *
 * Il ne réaffiche aucun contenu : chaque résultat porte un lien vers l'onglet
 * qui sait déjà l'afficher, et chaque bloc un lien « voir les N autres ». La
 * recherche est une PORTE D'ENTRÉE, pas un septième écran de contenu — sans
 * cette règle il faudrait reconstruire six vues ici, et elles divergeraient.
 *
 * Elle ne coûte rien non plus : tout se joue en mémoire et dans une fonction
 * Postgres, aucun appel au fournisseur d'IA. C'est ce qui la rend utilisable
 * vingt fois par jour sans toucher au plafond par question du programme.
 */
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, ChevronDown, Search, SearchX } from "lucide-react";
import { FieldHeader } from "@/components/field-header";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, PanelCard } from "@/features/professional/mock-ui";
import { useSession } from "@/application/session";
import {
  construireBlocs,
  RESULTATS_PAR_BLOC,
  totalDesBlocs,
  type BlocRecherche,
  type ResultatRecherche,
} from "@/domain/rechercheTransverse";
import {
  LIMITE_SECTIONS,
  LIMITE_SECTIONS_DEPLIEE,
  useMaterielDeRecherche,
  useSectionsTrouvees,
} from "./useRechercheTransverse";

function LigneResultat({ resultat }: { resultat: ResultatRecherche }) {
  return (
    <li className="border-b border-border/60 last:border-0">
      <Link
        to={resultat.lien.to}
        search={resultat.lien.search ?? {}}
        className="block rounded-md px-1 py-3 transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <p className="font-medium text-foreground">{resultat.titre}</p>
        {resultat.contexte ? (
          <p className="mt-0.5 text-xs text-muted-foreground">{resultat.contexte}</p>
        ) : null}
        {resultat.extrait ? (
          <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">{resultat.extrait}</p>
        ) : null}
      </Link>
    </li>
  );
}

function Bloc({
  bloc,
  onDeplier,
  deplie,
}: {
  bloc: BlocRecherche;
  /** Présent seulement sur le bloc qui sait se déplier. */
  onDeplier?: () => void;
  deplie?: boolean;
}) {
  return (
    <PanelCard
      title={bloc.titre}
      description={
        bloc.total === 0 ? "Aucun résultat" : `${bloc.total} résultat${bloc.total > 1 ? "s" : ""}`
      }
    >
      {bloc.resultats.length === 0 ? (
        <EmptyState>Rien dans ce bloc pour cette recherche.</EmptyState>
      ) : (
        <>
          <ul className="-mt-1">
            {bloc.resultats.map((resultat) => (
              <LigneResultat key={resultat.id} resultat={resultat} />
            ))}
          </ul>

          {/*
            DEUX SORTIES, PARCE QU'IL Y A DEUX NATURES DE RESTE.
            Ce qui a un écran d'accueil s.y route, avec la requête emportée ;
            les passages du cours n'en ont aucun, donc ils se déplient ICI. Un
            seul bouton pour les deux annonçait 96 résultats et en montrait 314.
          */}
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
            {bloc.restantsRoutables > 0 ? (
              <Link
                to={bloc.lienOnglet.to}
                search={bloc.lienOnglet.search ?? {}}
                className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {bloc.restantsRoutables > 1
                  ? `Voir les ${bloc.restantsRoutables} autres dans ${bloc.titre}`
                  : `Voir l’autre dans ${bloc.titre}`}
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            ) : null}

            {bloc.restantsSurPlace > 0 && onDeplier && !deplie ? (
              <button
                type="button"
                onClick={onDeplier}
                className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Afficher {bloc.restantsSurPlace} passage{bloc.restantsSurPlace > 1 ? "s" : ""} du
                cours
                <ChevronDown className="size-4" aria-hidden />
              </button>
            ) : null}

            {deplie && bloc.restantsSurPlace > 0 ? (
              /*
               * LE PLAFOND SE DIT. La fonction serveur borne à cinquante lignes ;
               * taire ce reste laisserait croire que le cours ne contient rien
               * de plus, alors que le compteur du bloc, lui, annonce le total.
               */
              <p className="text-xs text-muted-foreground">
                {bloc.restantsSurPlace} autre{bloc.restantsSurPlace > 1 ? "s" : ""} passage
                {bloc.restantsSurPlace > 1 ? "s" : ""} non affiché
                {bloc.restantsSurPlace > 1 ? "s" : ""} — affinez la recherche pour les atteindre.
              </p>
            ) : null}
          </div>
        </>
      )}
    </PanelCard>
  );
}

/**
 * L'ÉCRAN PORTE SON PROPRE CHAMP, et ce n'est pas un doublon de celui de
 * l'en-tête : sur téléphone l'en-tête n'affiche qu'une loupe, et c'est ici que
 * l'étudiant tape. Sur grand écran les deux coexistent et disent la même chose,
 * parce que tous deux lisent `q` dans l'URL.
 */
function ChampDeRecherche({ requete }: { requete: string }) {
  const navigate = useNavigate();
  const [saisie, setSaisie] = useState(requete);
  /*
   * RESYNCHRONISER SUR L'URL. Sans cet effet, revenir par le bouton Précédent
   * changerait les résultats sans changer le champ : l'étudiant lirait une
   * recherche sous le libellé d'une autre.
   */
  useEffect(() => setSaisie(requete), [requete]);

  function soumettre(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const q = saisie.trim();
    void navigate({ to: "/espace/recherche", search: q.length > 0 ? { q } : {} });
  }

  return (
    <form onSubmit={soumettre} role="search">
      <div className="relative">
        <Search
          className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          value={saisie}
          onChange={(event) => setSaisie(event.target.value)}
          placeholder="Que cherchez-vous ?"
          aria-label="Rechercher dans tout le programme"
          className="h-11 ps-9"
          autoFocus
        />
      </div>
    </form>
  );
}

export function RechercheView({ requete }: { requete: string }) {
  const { activeProgram } = useSession();
  /*
   * LE DÉPLIEMENT SE REMET À ZÉRO À CHAQUE NOUVELLE REQUÊTE : garder le bloc
   * déplié ferait redemander cinquante passages au serveur dès la première
   * lettre de la recherche suivante.
   */
  const [deplie, setDeplie] = useState(false);
  useEffect(() => setDeplie(false), [requete]);

  const materiel = useMaterielDeRecherche();
  const sections = useSectionsTrouvees(requete, deplie ? LIMITE_SECTIONS_DEPLIEE : LIMITE_SECTIONS);

  const blocs = useMemo(() => {
    if (!materiel.data) return [];
    return construireBlocs({
      requete,
      outcomes: materiel.data.outcomes,
      estInscrit: materiel.data.estInscrit,
      jalons: materiel.data.jalons,
      modalites: materiel.data.modalites,
      carnets: materiel.data.carnets,
      messages: materiel.data.messages,
      sections: sections.data ?? [],
      deplierConnaissances: deplie,
    });
  }, [requete, materiel.data, sections.data, deplie]);

  const enCours = materiel.isLoading || sections.isFetching;
  const total = totalDesBlocs(blocs);

  return (
    <div className="space-y-6">
      <FieldHeader
        eyebrow={activeProgram.name}
        title={requete.trim() ? `Recherche : « ${requete.trim()} »` : "Recherche"}
        figures={
          requete.trim() && !enCours
            ? [{ value: total, label: total > 1 ? "résultats" : "résultat" }]
            : []
        }
      />

      <ChampDeRecherche requete={requete} />

      {!requete.trim() ? (
        <EmptyState>
          Tapez ce que vous cherchez : la recherche parcourt les connaissances, les compétences et
          les évaluations du programme, vos messages, et — si vous y êtes inscrit — votre carnet de
          stage et votre calendrier.
        </EmptyState>
      ) : enCours && blocs.length === 0 ? (
        <div className="space-y-4" aria-busy="true">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : total === 0 ? (
        <div className="rounded-md border border-dashed border-border px-4 py-10 text-center">
          <SearchX className="mx-auto size-6 text-muted-foreground" aria-hidden />
          <p className="mt-3 font-medium text-foreground">Aucun résultat</p>
          <p className="mx-auto mt-1 max-w-prose text-sm text-muted-foreground">
            Essayez un mot plus court, ou un seul mot : la recherche demande que <em>tous</em> les
            mots saisis se retrouvent dans un même intitulé.
          </p>
        </div>
      ) : (
        /*
         * TOUS LES BLOCS SONT RENDUS, MÊME VIDES, et c'est une décision : masquer
         * les blocs sans résultat ferait bouger la page d'une recherche à
         * l'autre, et l'étudiant ne saurait jamais si « Stage » n'a rien rendu
         * ou n'a pas été cherché. Une colonne en grand écran, une pile sur
         * téléphone.
         */
        <div className="grid gap-4 lg:grid-cols-2">
          {blocs.map((bloc) => (
            <Bloc
              key={bloc.cle}
              bloc={bloc}
              {...(bloc.cle === "connaissances"
                ? { onDeplier: () => setDeplie(true), deplie }
                : {})}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * LA PASTILLE D'AVANCEMENT — une case = un étudiant × un acquis (11/09).
 *
 * POURQUOI UNE BRIQUE PARTAGÉE ET PAS DEUX COMPOSANTS. Les compétences et les
 * connaissances se lisent dans le même geste : l'encadrant balaie une ligne
 * pour voir où en est un étudiant, une colonne pour voir où en est la
 * promotion. Deux codes de couleur différents pour la même question auraient
 * obligé à réapprendre l'écran d'un onglet à l'autre.
 *
 * CE QUE DIT LA COULEUR, ET CE QUE DIT LA COCHE — deux informations, jamais
 * fondues : la COULEUR dit le niveau que l'étudiant DÉCLARE, la COCHE dit que
 * l'encadrant l'a CONFIRMÉ. Les confondre ferait passer une déclaration
 * d'autonomie non vérifiée pour une compétence acquise, ce qui est exactement
 * l'invariant que le passeport protège.
 *
 * L'ABSENCE DE DÉCLARATION A SA PROPRE FORME (bordure pointillée, fond vide) :
 * elle n'est pas un « niveau zéro ». Un étudiant silencieux et un étudiant qui
 * se déclare débutant ne demandent pas la même chose à l'encadrant.
 */
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { MASTERY_LABELS_FR } from "@/domain/mastery";
import type { MasteryLevel } from "@/domain/types";

/** Fond de la case selon le niveau déclaré. Du plus pâle au plus soutenu. */
const FOND: Record<MasteryLevel, string> = {
  not_started: "bg-muted",
  novice: "bg-amber-200 dark:bg-amber-900",
  intermediate: "bg-amber-400 dark:bg-amber-700",
  proficient: "bg-emerald-400 dark:bg-emerald-700",
  autonomous: "bg-emerald-600 dark:bg-emerald-500",
};

/** Couleur du texte porté par la case, pour rester lisible sur chaque fond. */
const ENCRE: Record<MasteryLevel, string> = {
  not_started: "text-muted-foreground",
  novice: "text-amber-950 dark:text-amber-50",
  intermediate: "text-amber-950 dark:text-amber-50",
  proficient: "text-emerald-950 dark:text-emerald-50",
  autonomous: "text-white",
};

export type EtatAcquis = {
  /** Niveau déclaré par l'étudiant, ou `undefined` s'il n'a rien déclaré. */
  readonly niveau?: MasteryLevel | undefined;
  /** Vrai quand un encadrant a confirmé la déclaration. */
  readonly confirme: boolean;
};

/** La phrase que lisent le survol et le lecteur d'écran. Jamais un code. */
export function libelleEtat(etat: EtatAcquis, nom: string, acquis: string): string {
  if (etat.niveau === undefined) return `${nom} — ${acquis} : aucune déclaration`;
  const niveau = MASTERY_LABELS_FR[etat.niveau].toLowerCase();
  return `${nom} — ${acquis} : déclaré ${niveau}${etat.confirme ? ", confirmé" : ", à confirmer"}`;
}

export function ProgressionDot({
  etat,
  titre,
  onClick,
  disabled,
}: {
  etat: EtatAcquis;
  titre: string;
  /** Absent pour une case de lecture seule — les connaissances, par exemple. */
  onClick?: (() => void) | undefined;
  disabled?: boolean | undefined;
}) {
  const classes = cn(
    "inline-flex size-6 items-center justify-center rounded-[5px] border text-[10px] font-semibold transition",
    etat.niveau === undefined
      ? "border-dashed border-border bg-transparent"
      : cn("border-transparent", FOND[etat.niveau], ENCRE[etat.niveau]),
    etat.confirme ? "ring-2 ring-emerald-700 ring-offset-1 ring-offset-background" : "",
    onClick ? "hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring" : "",
    disabled ? "opacity-50" : "",
  );

  const dedans = etat.confirme ? <Check className="size-3.5" aria-hidden /> : null;

  if (!onClick) {
    return (
      <span className={classes} title={titre} aria-label={titre} role="img">
        {dedans}
      </span>
    );
  }
  return (
    <button
      type="button"
      className={classes}
      title={titre}
      aria-label={titre}
      onClick={onClick}
      disabled={disabled}
    >
      {dedans}
    </button>
  );
}

/**
 * La légende. Elle accompagne TOUJOURS une matrice : une grille de couleurs
 * sans légende se devine, et se devine mal.
 */
export function ProgressionLegend({ confirmation = true }: { confirmation?: boolean }) {
  return (
    <ul className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
      <li className="flex items-center gap-1.5">
        <ProgressionDot etat={{ confirme: false }} titre="" /> aucune déclaration
      </li>
      {/*
        « NON COMMENCE » FIGURE DANS LA LEGENDE, et c'est une correction du
        11/09 faite APRES l'avoir vu a l'ecran : la case grise pleine
        apparaissait dans la grille sans etre expliquee nulle part, juste a
        cote des cases en pointilles. Deux gris voisins dont un seul est
        legende, c'est un piege a lecture.
      */}
      {(["not_started", "novice", "intermediate", "proficient", "autonomous"] as const).map((n) => (
        <li key={n} className="flex items-center gap-1.5">
          <ProgressionDot etat={{ niveau: n, confirme: false }} titre="" />{" "}
          {MASTERY_LABELS_FR[n].toLowerCase()}
        </li>
      ))}
      {confirmation ? (
        <li className="flex items-center gap-1.5">
          <ProgressionDot etat={{ niveau: "proficient", confirme: true }} titre="" /> confirmé par
          un encadrant
        </li>
      ) : null}
    </ul>
  );
}

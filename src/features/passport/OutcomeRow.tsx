import { useEffect, useRef, type ReactNode } from "react";
import { BookOpen, PlayCircle } from "lucide-react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { MasteryLevel, Outcome } from "@/domain/types";
import { OutcomeDeclarationSwitch } from "@/features/passport/OutcomeDeclarationSwitch";

/**
 * LA LIGNE D'UN ACQUIS, identique dans « Mes ressources » et « Mes compétences ».
 *
 * Stef a validé cette mise en page sur les connaissances le 03/09 et demandé la
 * même sur les compétences. La partager plutôt que la recopier n'est pas une
 * coquetterie : c'est la règle du dépôt — une entité, deux portes d'entrée, la
 * même projection. Deux copies auraient divergé au premier ajustement.
 *
 * TROIS ÉLÉMENTS, TOUJOURS DANS CET ORDRE : l'interrupteur de déclaration à
 * gauche, hors du bouton d'accordéon ; l'intitulé, qui EST le bouton — on appuie
 * dessus et le contenu s'ouvre ; le contenu, chargé seulement à l'ouverture.
 *
 * L'interrupteur est en dehors du bouton parce qu'un contrôle imbriqué dans un
 * bouton n'est pas activable au clavier, et parce qu'on doit pouvoir cocher une
 * ligne sans déplier ce qu'elle contient.
 */
export function OutcomeRow({
  outcome,
  declaredLevel,
  badges,
  supportCount,
  supportKind,
  spotlight = false,
  children,
}: {
  readonly outcome: Outcome;
  readonly declaredLevel?: MasteryLevel;
  /** Étiquettes affichées à la suite de l'intitulé, sur la ligne fermée. */
  readonly badges?: ReactNode;
  /**
   * Nombre de supports pédagogiques derrière cette ligne. Zéro = aucune
   * pastille : promettre un contenu absent est pire que ne rien promettre.
   */
  readonly supportCount?: number;
  /** Vidéo si au moins un support en est une, texte sinon. */
  readonly supportKind?: "video" | "text";
  /**
   * VRAI quand on ARRIVE SUR CETTE LIGNE depuis un lien (Vue d'ensemble →
   * « Mon prochain jalon »). Elle s'ouvre alors d'elle-même, se signale, et
   * l'écran défile jusqu'à elle. Sans cela, un lien profond déposait
   * l'étudiant en haut d'un écran de 368 lignes : il avait changé de page
   * sans être arrivé nulle part.
   */
  readonly spotlight?: boolean;
  /** Ce que l'ouverture révèle : contenus, échéances, journal. */
  readonly children: ReactNode;
}) {
  /*
   * On défile APRÈS la peinture (`requestAnimationFrame`) : avant, la ligne
   * n'a pas encore sa hauteur ouverte et le navigateur viserait à côté.
   */
  const ancre = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (!spotlight) return;
    const trame = window.requestAnimationFrame(() => {
      ancre.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    return () => window.cancelAnimationFrame(trame);
  }, [spotlight]);
  /**
   * LA PASTILLE DE CONTENU (03/09). Rien, sur la ligne fermée, ne disait qu'un
   * cours se cachait derrière l'intitulé : le chevron d'un accordéon annonce
   * qu'il y a « quelque chose », jamais qu'il y a un support à lire ou une
   * vidéo à regarder. Un étudiant pressé passait à côté de tout le contenu.
   *
   * ELLE COMPTE, elle ne se contente pas d'exister : savoir qu'une
   * connaissance est traitée par trois supports et une autre par un seul
   * change ce qu'on ouvre en premier.
   */
  const pastille =
    supportCount && supportCount > 0 ? (
      <Badge
        variant="secondary"
        className="ml-2 gap-1 border-transparent bg-success font-normal text-success-foreground"
      >
        {supportKind === "video" ? (
          <PlayCircle className="size-3" aria-hidden />
        ) : (
          <BookOpen className="size-3" aria-hidden />
        )}
        {supportCount}
        <span className="sr-only">
          {supportKind === "video" ? "vidéo(s) disponible(s)" : "support(s) de cours disponible(s)"}
        </span>
      </Badge>
    ) : null;
  return (
    <li
      ref={ancre}
      id={`acquis-${outcome.code}`}
      className={cn(
        "border-b border-border last:border-0",
        spotlight ? "rounded-md bg-primary/5 ring-2 ring-primary/50" : null,
      )}
    >
      <div className="flex items-start gap-3 py-1">
        <div className="flex shrink-0 items-center pt-3">
          <OutcomeDeclarationSwitch
            outcomeId={outcome.id}
            label={outcome.label}
            nature={outcome.nature}
            targetMastery={outcome.targetMastery}
            {...(declaredLevel === undefined ? {} : { declaredLevel })}
          />
        </div>
        <Accordion
          type="single"
          collapsible
          className="min-w-0 flex-1"
          {...(spotlight ? { defaultValue: "contenu" } : {})}
        >
          <AccordionItem value="contenu" className="border-b-0">
            <AccordionTrigger className="py-2 text-left">
              <span className="min-w-0 flex-1 pr-2 text-sm">
                <span className="font-mono text-xs">{outcome.code}</span> {outcome.label}
                {pastille}
                {badges}
              </span>
            </AccordionTrigger>
            <AccordionContent>{children}</AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </li>
  );
}

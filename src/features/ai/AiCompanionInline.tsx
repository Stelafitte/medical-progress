import { useState } from "react";
import { Loader2, Send } from "lucide-react";

import { useSession } from "@/application/session";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  askCompanion,
  startAiThread,
  type AiAnswer,
  type AiThreadScope,
} from "@/infrastructure/supabase/aiCompanion";

type Tour = { role: "learner" | "assistant"; texte: string; reponse?: AiAnswer };

type Mode = "ask" | "be_questioned" | "generate_quiz";

/**
 * LES TROIS FACONS DE TRAVAILLER UN ACQUIS. Ce ne sont pas trois outils : c'est
 * le MEME fil, avec une consigne differente. Le sujet ne change pas, les
 * passages de cours non plus — seul le role de l'assistant bascule.
 *
 * `be_questioned` et `generate_quiz` posent UNE question puis s'arretent :
 * c'est la boucle mesuree le 04/09 — question (recherche, cout plein), reponse
 * de l'etudiant (pas de recherche, quasi gratuit), correction citant le passage
 * d'ou venait la question. Enchainer trois QCM d'un coup ferait payer trois fois
 * et priverait l'etudiant de la correction entre deux.
 */
const MODES: readonly { id: Mode; label: string; consigne: (sujet: string) => string }[] = [
  { id: "ask", label: "Je demande", consigne: (s) => `Explique-moi l'essentiel de « ${s} ».` },
  {
    id: "be_questioned",
    label: "Interroge-moi",
    consigne: (s) =>
      `Pose-moi une question ouverte sur « ${s} », attends ma réponse, puis corrige-la.`,
  },
  {
    id: "generate_quiz",
    label: "QCM",
    consigne: (s) =>
      `Pose-moi UN QCM sur « ${s} », avec ses propositions. Attends ma réponse avant le suivant.`,
  },
];

/**
 * LE TITRE DU SUPPORT EST UN SLUG EN BASE — « chapitre-1-item-221-atherome-… ».
 * L'afficher tel quel revient a demander a un etudiant de lire un identifiant de
 * fichier. On le remet en francais. AUCUNE INVENTION : on reformate ce que la
 * base contient, et si le motif ne correspond pas, le libelle passe tel quel.
 */
function titreLisible(brut: string): string {
  if (brut === "" || brut.includes(" ")) return brut;
  const mots = brut.split("-").filter((m) => m !== "");
  const rendu = mots
    .map((mot, i) => {
      if (mot === "chapitre" || mot === "item") return mot.charAt(0).toUpperCase() + mot.slice(1);
      if (/^\d+$/.test(mot)) return mot;
      return i === 0 ? mot.charAt(0).toUpperCase() + mot.slice(1) : mot;
    })
    .join(" ");
  return rendu.replace(/^(Chapitre \d+)\s(Item \d+)\s/, "$1 · $2 — ");
}

/**
 * L'ASSISTANT, DANS LE CONTINUUM DU DEPLIAGE.
 *
 * PLUS DE PANNEAU, PLUS DE BOUTON D'OUVERTURE (Stef, 07/09). La feuille laterale
 * plein ecran etait une sortie hors de la page : il fallait un bouton pour y
 * entrer, une croix pour en sortir, et l'etudiant perdait le contexte de
 * l'acquis qu'il travaillait. L'assistant fait maintenant partie de ce que
 * deplier un acquis revele, au meme titre que son texte.
 *
 * DEPLIER NE COUTE RIEN. Le fil n'est ouvert (`start_ai_thread`) qu'au PREMIER
 * message envoye, et aucun appel au fournisseur n'est fait avant. Deplier dix
 * acquis coute donc exactement zero credit et zero jeton — c'est la regle (a),
 * et elle est structurelle, pas une optimisation.
 *
 * AUCUN EXEMPLE, AUCUNE QUESTION TOUTE FAITE. Les trois modes disent deja ce
 * qu'on peut faire ; une liste d'exemples cliquables ajoutait du bruit et
 * poussait l'etudiant a envoyer une question qui n'etait pas la sienne.
 *
 * PAS DE TELEMETRIE A L'ECRAN. Credits et jetons sont journalises dans
 * `ai_messages` ; affiches sous chaque reponse, ils dissuadent de poser des
 * questions. Si un plafond doit se voir, ce sera une jauge de credits RESTANTS
 * en tete de page, jamais un decompte par message.
 *
 * UN ECHANGE NE MARQUE JAMAIS UN ACQUIS COMME ACQUIS. Rien ici n'ecrit dans le
 * passeport, et c'est une regle, pas un oubli.
 */
export function AiCompanionInline({
  sujet,
  scope,
  outcomeId,
}: {
  readonly sujet: string;
  readonly scope: AiThreadScope;
  readonly outcomeId?: string;
}) {
  const { activeEnrollment } = useSession();
  const [threadId, setThreadId] = useState<string | null>(null);
  const [tours, setTours] = useState<readonly Tour[]>([]);
  const [saisie, setSaisie] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("ask");

  async function envoyer(question: string, modeDuTour: Mode = mode) {
    if (question.trim() === "" || enCours) return;
    if (!activeEnrollment) {
      setErreur("Aucune inscription active pour ce programme.");
      return;
    }
    setEnCours(true);
    setErreur(null);
    setSaisie("");
    const premier = threadId === null;
    setTours((t) => [...t, { role: "learner", texte: question }]);
    try {
      const fil =
        threadId ??
        (await startAiThread({
          enrollmentId: activeEnrollment.id,
          scope,
          title: sujet,
          ...(outcomeId === undefined ? {} : { outcomeId }),
        }));
      if (threadId === null) setThreadId(fil);
      /*
       * `newSubject` au premier tour SEULEMENT : un fil a un sujet, et relancer
       * la recherche a chaque tour envoie l'assistant ailleurs. Mesure du
       * 04/09 : « non je pense que c'est la reponse B » sortait sur la
       * thrombose et les dyslipidemies, au-dessus de tout seuil raisonnable.
       */
      const reponse = await askCompanion({
        threadId: fil,
        question,
        mode: modeDuTour,
        newSubject: premier,
      });
      setTours((t) => [...t, { role: "assistant", texte: reponse.answer, reponse }]);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "L'assistant n'a pas répondu.");
      setTours((t) => t.slice(0, -1));
    } finally {
      setEnCours(false);
    }
  }

  return (
    <section className="rounded-lg border bg-card">
      <div
        className="flex gap-1 border-b bg-card-sunk p-1.5"
        role="group"
        aria-label="Comment travailler cet acquis"
      >
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            disabled={enCours}
            aria-pressed={mode === m.id}
            onClick={() => {
              setMode(m.id);
              if (m.id !== "ask") void envoyer(m.consigne(sujet), m.id);
            }}
            className={`min-h-11 flex-1 rounded-md px-2 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 ${
              mode === m.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {tours.length > 0 || enCours || erreur !== null ? (
        <div className="space-y-4 px-3 py-3">
          {tours.map((tour, i) => (
            <div key={i} className={tour.role === "learner" ? "flex justify-end" : ""}>
              <div
                className={
                  tour.role === "learner"
                    ? "max-w-[85%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground"
                    : "space-y-2 text-sm"
                }
              >
                <p className="whitespace-pre-line leading-relaxed">{tour.texte}</p>
                {tour.reponse && tour.reponse.citations.length > 0 ? (
                  <ul className="space-y-0.5">
                    {tour.reponse.citations.map((c) => (
                      <li key={`${c.resourceId}-${c.segmentIndex}`}>
                        <details className="group">
                          <summary className="min-h-11 cursor-pointer list-none py-1.5 text-[12.5px] text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                            <span className="font-medium text-foreground">
                              {titreLisible(c.resourceTitle)}
                            </span>
                            {c.excerpt ? " · lire le passage" : ""}
                          </summary>
                          {c.excerpt ? (
                            <p className="mt-1 whitespace-pre-wrap border-s-2 ps-3 text-[12.5px] leading-relaxed text-muted-foreground">
                              {c.excerpt}
                            </p>
                          ) : null}
                        </details>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>
          ))}

          {enCours ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              L'assistant lit vos cours…
            </p>
          ) : null}

          {erreur !== null ? (
            <p className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              {erreur}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="border-t p-3">
        <Textarea
          value={saisie}
          onChange={(e) => setSaisie(e.target.value)}
          placeholder={mode === "ask" ? "Votre question sur cet acquis…" : "Votre réponse…"}
          className="min-h-20"
          disabled={enCours}
          aria-label="Votre message à l'assistant"
        />
        <Button
          className="mt-2 min-h-11 w-full gap-2"
          disabled={enCours || saisie.trim() === ""}
          onClick={() => void envoyer(saisie)}
        >
          <Send className="size-4 shrink-0" aria-hidden />
          Envoyer
        </Button>
      </div>
    </section>
  );
}

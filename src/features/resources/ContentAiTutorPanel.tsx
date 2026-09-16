/**
 * Assistant IA de contenu côté apprenant — ENTIÈREMENT SIMULÉ.
 *
 * Aucun appel réseau, aucun modèle, aucun microphone : les réponses sont
 * fabriquées localement et citent systématiquement une référence du contenu
 * validé (page, diapositive, chapitre/timestamp, ancre HTML, question, étape).
 * Le mode vocal est une maquette d'état, jamais une session temps réel.
 */
import { useMemo, useState } from "react";
import { Bot, Mic, Send, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AI_GROUNDING_NOTICE_FR,
  AI_MOCK_NOTICE_FR,
  AI_STUDY_CTA_FR,
  AI_TIER_LABELS_FR,
  AI_VOICE_MOCK_NOTICE_FR,
  CITATION_KIND_LABELS_FR,
  CONTENT_AI_MODE_LABELS_FR,
  MOCK_VOICE_STATE_LABELS_FR,
  buildMockAnswer,
  plannedTierForMode,
  type ContentAiMode,
  type LearnerAiResource,
  type MockAiTurn,
  type MockVoiceState,
} from "@/domain/contentAi";

export function ContentAiTutorPanel({
  resource,
  /** Vrai si le programme met le vocal en avant (DFASM Cardiologie). */
  voicePromoted = false,
}: {
  resource: LearnerAiResource;
  voicePromoted?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const modes = resource.modes;
  const initialMode = useMemo<ContentAiMode | undefined>(
    () =>
      voicePromoted && modes.includes("voice")
        ? "voice"
        : (modes.find((m) => m !== "voice") ?? modes[0]),
    [modes, voicePromoted],
  );
  const [mode, setMode] = useState<ContentAiMode | undefined>(initialMode);
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<readonly MockAiTurn[]>([]);
  const [voiceState, setVoiceState] = useState<MockVoiceState>("idle");

  if (modes.length === 0) return null;

  const send = () => {
    if (!mode) return;
    const learnerTurn: MockAiTurn = {
      role: "learner",
      text: question.trim() || CONTENT_AI_MODE_LABELS_FR[mode],
    };
    setTurns((prev) => [...prev, learnerTurn, buildMockAnswer(resource, mode, question)]);
    setQuestion("");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setTurns([]);
          setVoiceState("idle");
          setMode(initialMode);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className="min-h-11 w-full gap-2 sm:w-auto">
          <Sparkles className="size-4" aria-hidden />
          {AI_STUDY_CTA_FR}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">{AI_STUDY_CTA_FR}</DialogTitle>
          <DialogDescription>
            {resource.title} · version exploitée {resource.sourceVersion}. {AI_GROUNDING_NOTICE_FR}.
          </DialogDescription>
        </DialogHeader>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Mode d'étude</legend>
          <div className="flex flex-wrap gap-2">
            {modes.map((item) => (
              <Button
                key={item}
                type="button"
                size="sm"
                variant={mode === item ? "default" : "outline"}
                className="min-h-11"
                onClick={() => setMode(item)}
              >
                {CONTENT_AI_MODE_LABELS_FR[item]}
              </Button>
            ))}
          </div>
          {mode ? (
            <p className="text-xs text-muted-foreground">
              Palier prévu : {AI_TIER_LABELS_FR[plannedTierForMode(mode)]}. {AI_MOCK_NOTICE_FR}.
            </p>
          ) : null}
        </fieldset>

        {mode === "voice" ? (
          <section className="space-y-2 rounded-md border border-border p-3">
            <p className="text-sm font-medium">Interaction vocale (simulée)</p>
            <p className="text-xs text-muted-foreground">{AI_VOICE_MOCK_NOTICE_FR}.</p>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{MOCK_VOICE_STATE_LABELS_FR[voiceState]}</Badge>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="min-h-11 gap-2"
                onClick={() =>
                  setVoiceState((prev) =>
                    prev === "listening" ? "assistant_speaking" : "listening",
                  )
                }
              >
                <Mic className="size-4" aria-hidden />
                Simuler la prise de parole
              </Button>
            </div>
          </section>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="ai-question">Votre demande</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id="ai-question"
              className="min-h-11"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Ex. explique la démarche de mesure"
            />
            <Button type="button" className="min-h-11 gap-2" onClick={send}>
              <Send className="size-4" aria-hidden />
              Envoyer
            </Button>
          </div>
        </div>

        <ul className="space-y-3">
          {turns.map((turn, index) => (
            <li
              key={`${turn.role}-${index}`}
              className="space-y-1 rounded-md border border-border p-3 text-sm"
            >
              <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                {turn.role === "assistant" ? (
                  <>
                    <Bot className="size-3.5" aria-hidden /> Assistant
                  </>
                ) : (
                  "Vous"
                )}
              </p>
              <p>{turn.text}</p>
              {turn.citations?.map((citation) => (
                <p key={citation.locator} className="text-xs text-muted-foreground">
                  Référence : {CITATION_KIND_LABELS_FR[citation.kind]} — {citation.locator} (
                  {citation.label})
                </p>
              ))}
            </li>
          ))}
          {turns.length === 0 ? (
            <li className="text-xs text-muted-foreground">
              Références disponibles pour ce support :{" "}
              {resource.citations.map((c) => c.locator).join(" · ") || "aucune"}.
            </li>
          ) : null}
        </ul>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => setOpen(false)}
          >
            Fermer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export type MicPromptVariant = "prompt" | "denied" | "unavailable";

interface MicPromptProps {
  variant: MicPromptVariant;
  onAction: () => void;
  onBack: () => void;
  backLabel?: string;
}

const COPY: Record<
  MicPromptVariant,
  { heading: string; body: string; action: string }
> = {
  prompt: {
    heading: "Let Needle Drop hear you play",
    body: "Turn on your mic so it can check your take. Your audio stays on this machine.",
    action: "Turn on mic",
  },
  denied: {
    heading: "Turn on your mic",
    body: "Allow mic access in your browser, then try again.",
    action: "Try again",
  },
  unavailable: {
    heading: "Connect a microphone",
    body: "Plug in a mic, then try again.",
    action: "Try again",
  },
};

/** The designed mic permission request and its denied / unavailable variants.
 * Each states the next step, so none is a dead end. */
export function MicPrompt({
  variant,
  onAction,
  onBack,
  backLabel = "Back to the chart",
}: MicPromptProps) {
  const copy = COPY[variant];
  return (
    <section className="mic-prompt" role="group" aria-label="Microphone">
      <h2>{copy.heading}</h2>
      <p>{copy.body}</p>
      <div className="mic-prompt-actions">
        <button type="button" className="btn btn-primary" onClick={onAction}>
          {copy.action}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onBack}>
          {backLabel}
        </button>
      </div>
    </section>
  );
}

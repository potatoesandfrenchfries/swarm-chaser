// The wire contract between the PartyKit server (party/index.ts) and the web
// client. Both import this file, so a change here is a type error on both
// sides instead of a silent mismatch at runtime.

export type Phase = "lobby" | "question" | "reveal" | "ended";

export interface Question {
  prompt: string;
  /** Optional code block shown under the prompt. */
  code?: string;
  options: string[];
  /** Index into `options`. Never sent to clients before the reveal. */
  answer: number;
  /** Shown after the reveal. */
  explanation: string;
  /** Time allowed once the question opens. */
  seconds: number;
}

/** A question as clients see it while it is open: no answer, no explanation. */
export type PublicQuestion = Pick<Question, "prompt" | "code" | "options" | "seconds"> & {
  index: number;
  total: number;
};

export interface PlayerView {
  id: string;
  name: string;
  score: number;
  connected: boolean;
  /** Whether they have answered the open question. Never what they answered. */
  answered: boolean;
}

export interface Reveal {
  answer: number;
  explanation: string;
  /** How many players picked each option. */
  counts: number[];
}

/** Everything a client needs to draw the room, tailored to that client. */
export interface RoomState {
  phase: Phase;
  code: string;
  /** Players ranked by score. The host is not a player. */
  players: PlayerView[];
  question: PublicQuestion | null;
  /** Milliseconds left on the open question, as of when this was sent. */
  remainingMs: number;
  reveal: Reveal | null;
  you: {
    id: string;
    isHost: boolean;
    name: string;
    /** Option you picked this round, once you answered. */
    choice: number | null;
    /** Points you earned this round, once revealed. */
    gained: number | null;
  };
}

export type ClientMessage =
  | { type: "join"; name: string }
  | { type: "answer"; choice: number }
  // Host only:
  | { type: "start" }
  | { type: "reveal" }
  | { type: "next" }
  | { type: "restart" };

export type ServerMessage =
  | { type: "state"; state: RoomState }
  | { type: "error"; message: string };

export const MAX_NAME_LENGTH = 20;

/** Parse untrusted client input. Returns null for anything malformed. */
export function parseClientMessage(raw: string): ClientMessage | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const m = value as Record<string, unknown>;
  switch (m.type) {
    case "join":
      return typeof m.name === "string" ? { type: "join", name: m.name } : null;
    case "answer":
      return typeof m.choice === "number" && Number.isInteger(m.choice)
        ? { type: "answer", choice: m.choice }
        : null;
    case "start":
    case "reveal":
    case "next":
    case "restart":
      return { type: m.type };
    default:
      return null;
  }
}

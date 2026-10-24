import type * as Party from "partykit/server";
import {
  MAX_NAME_LENGTH,
  parseClientMessage,
  type ClientMessage,
  type Phase,
  type PlayerView,
  type Reveal,
  type RoomState,
  type ServerMessage,
} from "../src/shared/protocol";
import { QUESTIONS } from "../src/shared/questions";

interface Player {
  name: string;
  score: number;
  connected: boolean;
  /** Option picked this round, and when (ms since the question opened). */
  answer: { choice: number; at: number } | null;
  gained: number | null;
}

const POINTS_BASE = 500;
const POINTS_SPEED = 500;

// One instance per room code. The server is the single source of truth: clients
// only send intents (join, answer, start...) and render whatever state comes
// back, so a client can never award itself points or see an answer early.
export default class GameServer implements Party.Server {
  phase: Phase = "lobby";
  hostId: string | null = null;
  players = new Map<string, Player>();
  qIndex = 0;
  openedAt = 0;
  timer: ReturnType<typeof setTimeout> | null = null;
  reveal: Reveal | null = null;

  constructor(readonly room: Party.Room) {}

  // ---- connections

  onConnect(conn: Party.Connection) {
    // The first connection to an empty room hosts it. The id comes from the
    // client's sessionStorage, so a host who reloads gets the room back.
    if (this.hostId === null) this.hostId = conn.id;
    // A returning player is marked connected again; a new one appears once
    // they send `join` with a name.
    const returning = this.players.get(conn.id);
    if (returning) returning.connected = true;
    this.broadcast();
  }

  onClose(conn: Party.Connection) {
    const player = this.players.get(conn.id);
    if (player) player.connected = false;
    this.broadcast();
  }

  onMessage(raw: string, sender: Party.Connection) {
    const message = parseClientMessage(raw);
    if (!message) return this.sendError(sender, "Unrecognised message.");
    // Role is decided here, from the connection, never from anything the client claims.
    const isHost = sender.id === this.hostId;
    if (isHost) this.onHostMessage(message, sender);
    else this.onPlayerMessage(message, sender);
  }

  // ---- host

  private onHostMessage(message: ClientMessage, sender: Party.Connection) {
    switch (message.type) {
      case "start":
        if (this.phase !== "lobby") return;
        if (this.players.size === 0) return this.sendError(sender, "Wait for at least one player.");
        this.qIndex = 0;
        return this.openQuestion();
      case "reveal":
        if (this.phase === "question") this.closeQuestion();
        return;
      case "next":
        if (this.phase !== "reveal") return;
        if (this.qIndex + 1 >= QUESTIONS.length) {
          this.phase = "ended";
          return this.broadcast();
        }
        this.qIndex += 1;
        return this.openQuestion();
      case "restart":
        if (this.phase !== "ended") return;
        for (const player of this.players.values()) {
          player.score = 0;
          player.answer = null;
          player.gained = null;
        }
        this.phase = "lobby";
        this.reveal = null;
        return this.broadcast();
    }
  }

  // ---- players

  private onPlayerMessage(message: ClientMessage, sender: Party.Connection) {
    switch (message.type) {
      case "join": {
        const name = message.name.trim().slice(0, MAX_NAME_LENGTH);
        if (!name) return this.sendError(sender, "Pick a name.");
        const existing = this.players.get(sender.id);
        if (existing) {
          existing.name = name;
          existing.connected = true;
        } else {
          this.players.set(sender.id, { name, score: 0, connected: true, answer: null, gained: null });
        }
        return this.broadcast();
      }
      case "answer": {
        const player = this.players.get(sender.id);
        const question = QUESTIONS[this.qIndex];
        if (this.phase !== "question" || !player || !question || player.answer) return;
        if (message.choice < 0 || message.choice >= question.options.length) return;
        player.answer = { choice: message.choice, at: Date.now() - this.openedAt };
        // Everyone still connected has answered: no reason to wait out the clock.
        const waiting = [...this.players.values()].some((p) => p.connected && !p.answer);
        if (!waiting) return this.closeQuestion();
        return this.broadcast();
      }
    }
  }

  // ---- rounds

  private openQuestion() {
    const question = QUESTIONS[this.qIndex]!;
    for (const player of this.players.values()) {
      player.answer = null;
      player.gained = null;
    }
    this.reveal = null;
    this.phase = "question";
    this.openedAt = Date.now();
    this.clearTimer();
    this.timer = setTimeout(() => this.closeQuestion(), question.seconds * 1000);
    this.broadcast();
  }

  private closeQuestion() {
    this.clearTimer();
    const question = QUESTIONS[this.qIndex]!;
    const totalMs = question.seconds * 1000;
    const counts = question.options.map(() => 0);

    for (const player of this.players.values()) {
      if (!player.answer) {
        player.gained = 0;
        continue;
      }
      counts[player.answer.choice]! += 1;
      if (player.answer.choice === question.answer) {
        // Faster correct answers earn more, down to the base score at the buzzer.
        const left = Math.max(0, totalMs - player.answer.at) / totalMs;
        player.gained = POINTS_BASE + Math.round(POINTS_SPEED * left);
        player.score += player.gained;
      } else {
        player.gained = 0;
      }
    }

    this.reveal = { answer: question.answer, explanation: question.explanation, counts };
    this.phase = "reveal";
    this.broadcast();
  }

  private clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  // ---- output

  /** Each connection gets its own snapshot: same room, tailored `you`. */
  private broadcast() {
    for (const conn of this.room.getConnections()) {
      this.send(conn, { type: "state", state: this.snapshot(conn.id) });
    }
  }

  private snapshot(forId: string): RoomState {
    const question = this.phase === "question" || this.phase === "reveal" ? QUESTIONS[this.qIndex] : null;
    const me = this.players.get(forId);
    const players: PlayerView[] = [...this.players.entries()]
      .map(([id, p]) => ({
        id,
        name: p.name,
        score: p.score,
        connected: p.connected,
        answered: p.answer !== null,
      }))
      .sort((a, b) => b.score - a.score);

    return {
      phase: this.phase,
      code: this.room.id,
      players,
      question: question
        ? {
            index: this.qIndex,
            total: QUESTIONS.length,
            prompt: question.prompt,
            code: question.code,
            options: question.options,
            seconds: question.seconds,
          }
        : null,
      remainingMs:
        this.phase === "question" && question
          ? Math.max(0, question.seconds * 1000 - (Date.now() - this.openedAt))
          : 0,
      reveal: this.reveal,
      you: {
        id: forId,
        isHost: forId === this.hostId,
        name: me?.name ?? "",
        choice: me?.answer?.choice ?? null,
        gained: this.phase === "reveal" || this.phase === "ended" ? (me?.gained ?? null) : null,
      },
    };
  }

  private send(conn: Party.Connection, message: ServerMessage) {
    conn.send(JSON.stringify(message));
  }

  private sendError(conn: Party.Connection, message: string) {
    this.send(conn, { type: "error", message });
  }
}

GameServer satisfies Party.Worker;

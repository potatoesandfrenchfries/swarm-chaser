/** Who is using the app. The same data, two views and two agent personas. */
export type Role = "member" | "overseer";
export const ROLES: Role[] = ["member", "overseer"];

export type Severity = "info" | "watch" | "urgent";

export interface Member {
  id: number;
  name: string;
  /** Free text the agents read for context: routines, preferences, who matters. */
  profile: string;
}

export interface Task {
  id: number;
  title: string;
  done: boolean;
  createdBy: Role;
  createdAt: string;
}

/** A concern raised in conversation, surfaced on the overseer's dashboard. */
export interface Note {
  id: number;
  text: string;
  severity: Severity;
  resolved: boolean;
  createdAt: string;
}

export interface Message {
  id: number;
  role: "user" | "assistant";
  speaker: Role;
  text: string;
  route: string | null;
  createdAt: string;
}

export interface AppState {
  member: Member;
  tasks: Task[];
  notes: Note[];
  /** The requesting role's own thread. */
  messages: Message[];
  /** Overseer only: the member's thread. */
  memberMessages: Message[];
}

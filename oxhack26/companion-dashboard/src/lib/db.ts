import { mkdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import type { AppState, Member, Message, Note, Role, Severity, Task } from "./types";

// node:sqlite ships with Node, so there is nothing native to compile. For a
// real deployment swap this file for Postgres; the rest of the app only calls
// the functions exported below.
const MEMBER_ID = 1;

declare global {
  var __companionDb: DatabaseSync | undefined;
}

function open() {
  mkdirSync("data", { recursive: true });
  const db = new DatabaseSync("data/app.db");
  // First, so parallel processes (next build workers) wait instead of failing.
  db.exec("pragma busy_timeout = 5000");
  db.exec(`
    pragma journal_mode = wal;
    create table if not exists member (
      id integer primary key, name text not null, profile text not null
    );
    create table if not exists tasks (
      id integer primary key autoincrement,
      title text not null,
      done integer not null default 0,
      removed integer not null default 0,
      created_by text not null,
      created_at text not null default (datetime('now'))
    );
    create table if not exists notes (
      id integer primary key autoincrement,
      text text not null,
      severity text not null check (severity in ('info', 'watch', 'urgent')),
      resolved integer not null default 0,
      created_at text not null default (datetime('now'))
    );
    create table if not exists messages (
      id integer primary key autoincrement,
      role text not null,
      speaker text not null,
      text text not null,
      route text,
      created_at text not null default (datetime('now'))
    );
  `);
  const seeded = db.prepare("select count(*) as n from member").get() as { n: number };
  if (!seeded.n) {
    db.prepare("insert into member (id, name, profile) values (?, ?, ?)").run(
      MEMBER_ID,
      "Alex",
      "Alex is 74 and lives alone. Likes tea in the morning and a walk after lunch. Daughter Sam calls on Sundays. Gets anxious when the day has no plan."
    );
    const addTask = db.prepare("insert into tasks (title, created_by) values (?, 'overseer')");
    for (const title of ["Take morning medication", "Walk around the block", "Call Sam"]) {
      addTask.run(title);
    }
  }
  return db;
}

// Opened on first query, not on import: `next build` imports every route in
// parallel workers, and none of them should touch the file just to be built.
// Kept on globalThis because dev reloads modules.
function getDb() {
  return (globalThis.__companionDb ??= open());
}

type Row = Record<string, unknown>;

const toTask = (r: Row): Task => ({
  id: Number(r.id),
  title: String(r.title),
  done: Boolean(r.done),
  createdBy: r.created_by as Role,
  createdAt: String(r.created_at),
});
const toNote = (r: Row): Note => ({
  id: Number(r.id),
  text: String(r.text),
  severity: r.severity as Severity,
  resolved: Boolean(r.resolved),
  createdAt: String(r.created_at),
});
const toMessage = (r: Row): Message => ({
  id: Number(r.id),
  role: r.role as Message["role"],
  speaker: r.speaker as Role,
  text: String(r.text),
  route: r.route ? String(r.route) : null,
  createdAt: String(r.created_at),
});

export function getMember(): Member {
  return getDb().prepare("select * from member where id = ?").get(MEMBER_ID) as unknown as Member;
}

export function listTasks(): Task[] {
  return (getDb().prepare("select * from tasks where removed = 0 order by id").all() as Row[]).map(toTask);
}

export function addTask(title: string, createdBy: Role) {
  const info = getDb().prepare("insert into tasks (title, created_by) values (?, ?)").run(title, createdBy);
  return Number(info.lastInsertRowid);
}

export function setTaskDone(id: number, done: boolean) {
  getDb().prepare("update tasks set done = ? where id = ?").run(done ? 1 : 0, id);
}

/** Soft delete: the overseer can still see in the log that it existed. */
export function removeTask(id: number) {
  getDb().prepare("update tasks set removed = 1 where id = ?").run(id);
}

export function listNotes(): Note[] {
  return (getDb().prepare("select * from notes order by resolved, id desc limit 50").all() as Row[]).map(toNote);
}

export function addNote(text: string, severity: Severity) {
  getDb().prepare("insert into notes (text, severity) values (?, ?)").run(text, severity);
}

export function resolveNote(id: number, resolved: boolean) {
  getDb().prepare("update notes set resolved = ? where id = ?").run(resolved ? 1 : 0, id);
}

/** Newest `limit` messages, oldest first. Each role has its own thread. */
export function listMessages(speaker: Role, limit = 40): Message[] {
  const rows = getDb()
    .prepare("select * from messages where speaker = ? order by id desc limit ?")
    .all(speaker, limit) as Row[];
  return rows.map(toMessage).reverse();
}

export function addMessage(m: { role: Message["role"]; speaker: Role; text: string; route?: string }) {
  getDb().prepare("insert into messages (role, speaker, text, route) values (?, ?, ?, ?)").run(
    m.role,
    m.speaker,
    m.text,
    m.route ?? null
  );
}

/** Everything a view needs. `role` picks whose conversation thread to include. */
export function getState(role: Role): AppState {
  return {
    member: getMember(),
    tasks: listTasks(),
    notes: listNotes(),
    messages: listMessages(role),
    // The overseer can read what the member has been saying, never the reverse.
    memberMessages: role === "overseer" ? listMessages("member", 20) : [],
  };
}

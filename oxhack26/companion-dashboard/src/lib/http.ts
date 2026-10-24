import { NextResponse } from "next/server";
import { ROLES, type Role } from "./types";

export function errorResponse(error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : "Something went wrong.";
  return NextResponse.json({ error: message }, { status });
}

export function parseRole(value: unknown): Role {
  if (ROLES.includes(value as Role)) return value as Role;
  throw new Error("role must be 'member' or 'overseer'.");
}

export function parseId(value: string) {
  const id = Number(value);
  if (!Number.isInteger(id)) throw new Error("Invalid id.");
  return id;
}

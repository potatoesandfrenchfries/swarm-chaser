import { z } from "zod";

export const STATUSES = [
  "queued",
  "planning",
  "searching",
  "retrieving",
  "drafting",
  "verifying",
  "completed",
  "failed",
] as const;
export type RunStatus = (typeof STATUSES)[number];

/** The graph's stages, in order. The UI renders its timeline from this list. */
export const STAGES = [
  { key: "plan", label: "Plan", status: "planning" },
  { key: "web_search", label: "Web search", status: "searching" },
  { key: "document_retrieval", label: "Documents", status: "retrieving" },
  { key: "draft", label: "Draft", status: "drafting" },
  { key: "verify", label: "Verify", status: "verifying" },
  { key: "finalize", label: "Report", status: "verifying" },
] as const;
export type StageKey = (typeof STAGES)[number]["key"];

export const createRunInput = z.object({
  topic: z.string().trim().min(3).max(300),
  objective: z.string().trim().max(1000).nullish(),
  documentIds: z.array(z.string()).max(10).default([]),
});

// LLM outputs
export const planSchema = z.object({
  queries: z
    .array(z.object({ query: z.string().min(3), purpose: z.string() }))
    .min(1)
    .max(5),
});

export const draftSchema = z.object({
  findings: z
    .array(
      z.object({
        claim: z.string().min(10),
        // Labels from the numbered evidence list the model was shown ("E3").
        evidenceRefs: z.array(z.string()).min(1),
        confidence: z.enum(["high", "medium", "low"]),
      })
    )
    .max(10),
});

export const verdictSchema = z.object({
  verdict: z.enum(["supported", "partial", "unsupported"]),
  notes: z.string(),
});

// Rows, as the API returns them.
export interface Run {
  id: string;
  topic: string;
  objective: string | null;
  status: RunStatus;
  currentStage: string;
  planJson: z.infer<typeof planSchema> | null;
  finalReportMarkdown: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RunEvent {
  id: number;
  stage: string;
  eventType: string;
  message: string;
  createdAt: string;
}

export interface Evidence {
  id: string;
  sourceType: "web" | "document";
  title: string;
  url: string | null;
  excerpt: string;
  metadataJson: Record<string, unknown>;
}

export interface Finding {
  id: string;
  claim: string;
  evidenceIds: string[];
  confidence: "high" | "medium" | "low";
  status: "draft" | "verified" | "needs-review";
  verificationNotes: string | null;
}

export interface RunDocument {
  documentId: string;
  fileName: string | null;
}

export interface RunSnapshot {
  run: Run;
  events: RunEvent[];
  evidence: Evidence[];
  findings: Finding[];
  documents: RunDocument[];
}

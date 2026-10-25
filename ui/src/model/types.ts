// The canonical replay model. Every view, the Neo4j loader and the Python exporter
// (src/report/replay_bundle.py in the pipeline) speak this one shape: schema "claim-spread/replay@1".
//
// Unknown facts are null or absent, never guessed. `basis` says how we know each event or verdict.

export const SCHEMA = 'claim-spread/replay@1';

/** Where a bundle's data came from. "live" is reserved; nothing produces it yet. */
export type Provenance = 'recorded' | 'live' | 'synthetic';

/**
 * How we know something.
 * observed: present in the source log (a message, a tool call, a file read).
 * inferred: produced by a rule or linker over the log (e.g. "could have seen", n-gram repeat match).
 * derived:  a classification by a model or checker (e.g. an LLM verdict) that is not itself in the log.
 */
export type Basis = 'observed' | 'inferred' | 'derived';

export type EventType =
  | 'read' // an actor reads a record
  | 'delegate' // an actor hands a task to another actor
  | 'claim' // an actor states a claim for the first time in this run
  | 'repeat' // an actor restates a claim it received
  | 'endorse' // an actor agrees with or builds on a claim
  | 'dispute' // an actor questions a claim without a replacement fact
  | 'action' // an actor changes a record or the outside world (tool call with an effect)
  | 'check' // an actor or checker tests a claim against a record
  | 'intervene' // a monitor posts to an actor about a claim
  | 'correct' // an actor states a claim was wrong and gives the replacement
  | 'submit' // an agent hands a proposed action to VETO instead of doing it directly
  | 'allow' // VETO lets a submitted action through to the sandbox
  | 'divert'; // VETO routes a suspicious action to the honeypot instead

export type Verdict = 'supported' | 'contradicted' | 'unverifiable';
export type ClaimStatus = Verdict | 'unchecked';

/** How the logical order of an event was established. */
export type OrderBasis = 'logged-sequence' | 'timestamp' | 'tied-timestamp';

export interface SourcePointer {
  /** File or table the record lives in, relative to the bundle's source root. */
  file: string;
  /** Row id, message id or line, when the source has one. */
  ref: string | null;
}

export interface Actor {
  id: string;
  name: string;
  kind: 'agent' | 'monitor' | 'checker';
  /** Model string when known (village rows carry it); null in synthetic runs. */
  model: string | null;
  role: string | null;
}

export interface RecordNode {
  id: string;
  label: string;
  /** sandbox: where allowed actions take effect. honeypot: a decoy that captures diverted actions. */
  kind: 'document' | 'sheet' | 'listing' | 'post' | 'message' | 'tool' | 'sandbox' | 'honeypot';
  /** True when the experiment put this record there on purpose. */
  planted: boolean;
  /** Verbatim content when the bundle carries it; null when only a pointer is known. */
  content: string | null;
  source: SourcePointer | null;
}

export interface EvidenceQuote {
  record: string;
  /** Exact substring of the record's content (checked by validate()). */
  quote: string;
  stance: 'supports' | 'contradicts' | 'context';
}

export interface Claim {
  id: string;
  /** Verbatim claim text as first stated. */
  text: string;
  /** The event that first states it in this run. */
  origin: string;
  /**
   * What the experiment design says about the claim, independent of any checker.
   * "false-by-design" only for planted claims; null when nobody knows.
   */
  ground_truth: 'false-by-design' | 'true-by-design' | null;
}

export interface ReplayEvent {
  id: string;
  /** Logical order, 0-based and contiguous within the run. */
  seq: number;
  /** ISO 8601 UTC when the source has a time; null otherwise. */
  ts: string | null;
  order_basis: OrderBasis;
  type: EventType;
  /** The actor who does it. */
  actor: string;
  /** Who or what it is directed at. Null for an actor's own private step. */
  target: { kind: 'actor' | 'record'; id: string } | null;
  claim: string | null;
  /** Verbatim text of the message or tool output, when there is one. */
  text: string | null;
  /** One plain sentence describing the event; written by the bundle author or a template, never verbatim. */
  summary: string;
  tool: { name: string; args: Record<string, string | number | boolean> } | null;
  /** For actions: the record's state after the event, verbatim from the tool result. */
  effect: string | null;
  /** For checks: the verdict and the quotes it rests on. */
  verdict: Verdict | null;
  evidence: EvidenceQuote[];
  /** Event ids this one depends on, where the log establishes it (replies, task ids). */
  causes: string[];
  basis: Basis;
  source: SourcePointer | null;
}

export interface Run {
  id: string;
  title: string;
  /** Experimental condition, or null for a village episode. */
  condition: 'baseline' | 'planted' | 'monitored' | null;
  provenance: Provenance;
  actors: Actor[];
  records: RecordNode[];
  claims: Claim[];
  events: ReplayEvent[];
  /** Caveats specific to this run, shown with it. */
  notes: string[];
}

export interface Bundle {
  schema: typeof SCHEMA;
  id: string;
  title: string;
  provenance: Provenance;
  /** What this bundle is, in one or two sentences. */
  description: string;
  /** Where its data came from: a file path, dataset name, or "hand-written fixture". */
  source: string;
  /** For experiments: which runs to compare, and the sample size per condition. */
  experiment: {
    question: string;
    /** The claim the conditions are compared on. */
    focus_claim: string;
    runs_per_condition: number;
    caveats: string[];
  } | null;
  runs: Run[];
}

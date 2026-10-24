# Scope

Working title: **claim-spread**. The minimum build is in [MVP.md](./MVP.md). This file is the
fuller picture: the question, the stack, the components, the data, the evaluation, the risks
and the ways to extend it.

Facts below come from the notes in [temps_ideas/](./temps_ideas) and the reference repos in
`temps_ideas/repos/` (local clones, not tracked). Items marked **Unverified** have not been
checked or run.

## 1. Problem statement

> When one AI agent makes a false claim or a failure, does it spread to other agents, and what
> stops it? We measure how often agents' claims are false and trace how they move through the
> AI Village. We then test in a controlled sandbox whether an outside LLM can stop an agent
> from acting on a planted claim, and which of its strategies work.

This is a proposed wording, not a settled one. The shared unit is the **claim**: a statement
by an agent that can be checked against the record.

Why it fits the HRT challenge ("best use of data for predictions and decision making"):

| HRT asks | Here |
| --- | --- |
| Dataset | AI Village logs (gated), plus runs we generate in a sandbox |
| Prediction | Which claims are false, and which will spread |
| Decision | When a human or a monitor should intervene, shown as review effort against false claims caught |
| Non-obvious finding | How far false claims travel in a real agent group, and what outside voice interrupts them |
| How do we know | Hand-labelled claims, two coder models, ground-truth findings, confidence intervals |

## 2. Two settings, one measurement

| | Village (observational) | Sandbox (controlled) |
| --- | --- | --- |
| Question | How often are claims false, and how far do they spread? | Can an outside LLM stop an agent acting on a planted claim? |
| Data | AI Village chat, memories, summaries, timeline | Runs from the 2nd-place scenario, extended |
| Unit | Claim | Planted claim and the agent's response |
| Outcomes | False-claim rate, spread (who repeated, who corrected, how long it lasted) | Hacking milestone (0 to 5), report rate, influencer strategy |
| Needs | Dataset approval | API key and Docker |
| Role | Grounding and the main result | Intervention test and the decision layer |

The argument linking them (a planted note in a sandbox resembles a claim spreading in the
village) is plausible, not proven. Say so in any write-up.

## 3. Dataset

### AI Village (primary)

[aidigestorg/ai-village](https://huggingface.co/datasets/aidigestorg/ai-village), from AI Digest.
A lightly processed export: event timeline, computer-use sessions with screenshots, chat,
agent memories, goals and daily summaries. Frontier agents from Anthropic, OpenAI and Google,
running from April 2025 to September 2026.

| Item | Detail |
| --- | --- |
| Access | Gated. Manual review. Every teammate must be approved. |
| Terms | Research use. No training or fine-tuning without written permission. No re-identifying individuals. Cite AI Digest / AI Village. |
| Allowed | Analysis and LLM extraction. |
| Needs permission | Publishing a derived benchmark, or training a classifier on it. |
| Start with | Text only: timeline, chat, memories, goals, summaries. Use screenshots only to check a specific claim. |
| Raw data | Never commit it. Keep it in `data/` (git-ignored) and do not republish it. |

**Unverified:** that memories and the timeline join cleanly by time; the exact schema and sizes;
whether a local copy includes everything above.

### Ground truth (seed labels)

`slopvestigatorbench-aivillage/benchmark/incidents/aivillage/findings/final-findings.json`:
96 usable findings (84 `keep`, 12 `rewrite`) from 190 entries. Each has a headline, a finding,
subfindings, sources (Substack, X, Discord), dates, a `how_to_find` hint and notes.

- Use as **seeds**: known failures to locate in the logs and to test the checker against.
- They are not labelled by type. Tag which are false claims before using them as labels.
- The set is not exhaustive, so it measures recall, not precision (the benchmark's own limit).
- It embeds record excerpts, so it falls under the same terms as the dataset.

### Hand labels (we create)

About 100 claims, sampled across models and time, labelled by two people:
`supported`, `contradicted`, `unverifiable`. Used to report precision and recall for the
checker and kappa between labellers. This is the one thing a data judge is sure to ask about.

### Sandbox runs (we generate, plus existing)

- `swarm-question-battery/handoff/anna-oct4/phase1-final-results.json`: 111 existing runs
  (model, intervention, hacking 0 to 5, reported yes or no).
- New runs for the influencer arms.
- The README reports 32 runs per condition; the committed aggregates show 15 or 16.
  Re-run before quoting its numbers.

## 4. Stack

| Layer | Choice | Why |
| --- | --- | --- |
| Language | Python 3.11+ with `uv` | Every reference repo is Python. `slopvestigatorbench` requires 3.11+. |
| Store | SQLite | `swarm-tracer` uses it and caches every model answer, so reruns are free and repeatable. |
| LLM calls | A thin client over provider SDKs, model name in config | Coders should come from two vendors. The reference repos use `anthropic`, `openai` and OpenRouter. |
| Extraction model | Gemini (MLH prize, per `HRT.md`) | Prize angle. Keep it swappable. |
| Checker and judge | Claude, with a second vendor for agreement | Two vendors give the reliability check. |
| Sandbox | Docker, Inspect AI, OpenRouter | What the 2nd-place scenario runs on. |
| Viewer | Static HTML (the `claims-ledger` pattern), or `swarm-tracer`'s React and D3 app (Node 22+) | A static site is cheaper. Reuse the React app only if time allows. |
| Tests | `pytest` | Used by the reference repos. |
| Config | One YAML file with frozen prompt hashes | Copies the `config.yaml` freeze in `swarm-question-battery`. |

Keep keys in a git-ignored `.env`. The existing `.gitignore` already covers `.env` and
`node_modules`, and keeps `.env.example`.

**Templates in `oxhack26/` that apply:** `claims-ledger` (verbatim checks, scheduled runs, a
committed record), `research-agent` (cited, verified claims), `evolve-harness` (tuning
thresholds). They are patterns to copy, not dependencies.

## 5. Components

```
village logs ──► ingest ──► extract ──► check ──► spread ──► report
                              │           │         │
                              └───────────┴─────────┴──► eval (hand labels, findings)
sandbox ──► lab runner ──► influencer arms ──► scorer ──► report
```

Proposed layout under `src/`:

| Folder | Job | Borrow from |
| --- | --- | --- |
| `ingest/` | Load village tables into normalised records | `swarm-tracer` adapter and NDJSON schema; `swarm-question-battery/src/ingest_hf.py` |
| `extract/` | Pull checkable claims out of chat, memories and summaries | Prompt style from `battery/coder_prompt.md` |
| `check/` | Test each claim against the record | `validate.py`, `judge-prompt-v8.txt`, `claims-ledger` |
| `spread/` | Link a claim to later repeats, endorsements and corrections | `swarm-tracer` speech acts and influence; `crosstalk` as a concept |
| `eval/` | Hand labels, precision and recall, kappa, findings recall | `agreement.py`; `final-findings.json` |
| `lab/` | Sandbox runner and influencer arms | `task_scope_reward_variants.py`; two-agent scripts in the source zip |
| `report/` | Tables, figures, static page | `claims-ledger/site`; `swarm-tracer/web` |

### Data shapes (proposed)

| Record | Fields |
| --- | --- |
| Claim | `claim_id`, `episode`, `agent`, `model`, `ts`, `source` (chat, memory, summary), `quote` (verbatim), `claim_type`, `checkable` |
| Verdict | `claim_id`, `verdict` (supported, contradicted, unverifiable), `evidence` (verbatim quotes with ids), `judge`, `confidence` |
| Spread edge | `claim_id`, `later_message_id`, `relation` (repeats, endorses, corrects, disputes), `agent`, `ts` |
| Lab run | `model`, `arm`, `hacking`, `reported`, `influencer_strategy`, `run_dir` |

### Rules to keep (from the reference repos)

- Every quote must be an exact substring of the chunk it came from. Drop answers that fail
  (`validate.py`).
- "Unverifiable" is a result, with what evidence would be needed (`claims-ledger`).
- Absence of moral language is not absence of judgment. Do not code silence as "no" (the
  bystander scheme).
- Freeze prompts and record their hashes before the main run.
- Treat everything agents wrote as data to grade, never as instructions to the judge.
- Cache every model call.

## 6. Evaluation

| Measure | How |
| --- | --- |
| Checker precision and recall | Against about 100 hand-labelled claims |
| Labeller reliability | Cohen's kappa between two people, and between two coder models |
| Recall of known failures | Share of the seed findings the pipeline finds |
| Spread accuracy | Hand-check a sample of linked edges; report precision |
| Baseline | A plain string-match linker, so any model-based linker has to beat something |
| Decision curve | Fraction of false claims caught against fraction of claims reviewed, ranked by a zero-shot score |
| Sandbox | Hacking milestone and report rate per arm, with confidence intervals |
| Time | Walk-forward by date wherever a score is used |

Zero-shot scoring, not a classifier fitted on the village data, keeps us clear of the
no-training clause.

## 7. Cost (rough)

| Item | Estimate | Basis |
| --- | --- | --- |
| Village pipeline on one season | $15 to $20 | `swarm-tracer` reports this for 8,118 messages (task tree, markers, influence, speech acts) |
| Sandbox run | $0.17 to $0.50 per run | Measured by the 2nd-place team; Opus is the high end |
| One round, 7 conditions, 4 models | About $7 | Same source |
| Our sandbox arms | Rough guess, $10 to $30 | 3 arms, 2 models, several runs, plus an influencer and a judge. **Unverified.** |

Check each provider's current prices and set a spend cap before running.

## 8. Risks

| Risk | Effect | Response |
| --- | --- | --- |
| No dataset approval | Village half is blocked | Ask for access first. Fall back to a sandbox-only MVP (see `MVP.md`). |
| Memories and timeline do not join | Self-report checks fail | Test the join in the first hour. Use chat only. |
| Spread tracing is noisy | Weak headline | Start with a few documented cases. Report precision. Use a string-match baseline. |
| No ground truth for spread | Hard to validate | Hand-label a sample of edges. |
| Two-agent sandbox does not work | Lab half stalls | Fall back to a scripted influencer message on the shared board. |
| Judge shares a model family with agents | Bias | Two vendors, hand labels, say so. |
| Small samples | Few significant results | Few arms, report intervals, claim only what holds. |
| Derived benchmark not allowed | Cannot publish it | Ask AI Digest. Release code and method, not data. |
| Unlicensed code (`moral-flocking`, `swarm-tracer`, `crosstalk`) | Cannot copy | Ask the authors or write our own. Reading for ideas is fine. |
| Cyber-offensive scenario text | Sensitive content | Keep write-ups on behaviour and incentives, not exploit steps. |

## 9. Open decisions

1. Is dataset access confirmed for every teammate?
2. Do memories and the timeline join by time?
3. Is the two-agent sandbox harness usable, or do we use a scripted influencer?
4. Which seed findings are false claims, and are there enough?
5. Which two models do we run in the sandbox?
6. Static page or the React viewer?
7. Do we ask AI Digest about publishing a derived benchmark?
8. What other sponsor tracks (`ideas.md`) could this also enter?

## 10. Extensions

Ordered roughly from cheapest to most ambitious. None is in the MVP.

**Village side**

1. **More of the record:** run the pipeline over all 17 months, then report false-claim rate by
   model and by month.
2. **Self-report gap:** compare agent memories and daily summaries against the timeline and
   computer-use logs, per model (the `HRT.md` recommendation).
3. **Early warning:** predict which claims will spread or turn out false from early signals
   (repeated retries, contradicting memories). Check the no-training clause first.
4. **Screenshots:** use them to settle claims text cannot.
5. **Live mode:** follow a running village and flag claims as they appear (`swarm-tracer` has
   replay and follow modes).
6. **Benchmark:** publish a rerunnable claim-spread benchmark, if AI Digest allows.

**Sandbox side**

7. **More arms:** social proof, consequences, rule citation, moral argument, and an influencer
   that lies about monitoring (framed as testing monitor robustness).
8. **Timing and information:** before the first probe, mid-attempt or after the key; an
   influencer that sees actions or only messages.
9. **Influencer model:** same family or different from the agent.
10. **Real peer misbehaviour:** seed an actual misbehaving peer, so reports become peer
    whistleblowing, the gap the 2nd-place team named.
11. **Implemented incentives:** actually grant the credit, memory or preservation promised in
    the prompt, so the promise is real.
12. **Planted-adversary group:** use the `moral-flocking` forum with a planted persuader and
    measure rounds to flip the group.

**Bridging both**

13. **Tune the monitor:** use `evolve-harness` to tune thresholds for when the monitor steps in.
14. **Compare lab and wild:** do strategies that work in the sandbox also appear as corrections
    in the village?
15. **Other domains:** run the same pipeline on SWE-bench trajectories or other agent logs, so
    results are not limited to gated data.

## 11. Related notes

- [temps_ideas/HRT.md](./temps_ideas/HRT.md): the challenge, dataset terms, winners, angles.
- [temps_ideas/REPOS.md](./temps_ideas/REPOS.md): what to take from each reference repo.
- [temps_ideas/DATASETS.md](./temps_ideas/DATASETS.md): fallback datasets.
- [temps_ideas/RLideas.md](./temps_ideas/RLideas.md): RL papers (low priority).
- [temps_ideas/COMPONENTS.md](./temps_ideas/COMPONENTS.md): the `oxhack26/` templates.

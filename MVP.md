# MVP

The smallest build that answers the problem statement in [scope.md](./scope.md) and can be shown
to a data judge: *do false claims spread through the AI Village, and what stops them?*

Everything not listed under "Must" is out of the MVP. Extensions are in
[scope.md section 10](./scope.md#10-extensions).

## Goal

One results page with:

1. **A headline number:** the share of checked claims that are contradicted by the record.
2. **A spread picture** for at least three documented cases: who said it, who repeated it, who
   corrected it, how long it lasted.
3. **A validation table:** precision and recall of the claim checker against about 100
   hand-labelled claims.
4. **A decision curve:** how many false claims a reviewer catches as a function of how many
   claims they review.
5. **One small controlled result:** whether an outside LLM changes an agent's hacking, if the
   sandbox works (see "Should").

## Must

| # | Requirement | Done when |
| --- | --- | --- |
| M1 | Dataset access for every teammate | Everyone can download the data. If not, use the fallback below. |
| M2 | Ingest one slice of the village into one table | Messages and memories load into SQLite with agent, model, timestamp and text. The join test (memories and timeline by time) is recorded as pass or fail. |
| M3 | Claim extraction | An LLM turns chunks into claims, each with a verbatim quote that passes the substring check (`validate.py` pattern). Prompt frozen with its hash. |
| M4 | Claim checker | Each claim gets `supported`, `contradicted` or `unverifiable`, with evidence quotes that pass the substring check. "Unverifiable" is allowed and counted. |
| M5 | Hand labels | About 100 claims labelled by two people, with kappa reported. |
| M6 | Validation | Precision and recall of the checker against the hand labels, shown in a table. |
| M7 | Spread for three cases | For at least three of the documented seed findings, trace later repeats, endorsements and corrections. Compare the linker against a plain string-match baseline. |
| M8 | Decision curve | Rank claims by a zero-shot score. Plot false claims caught against claims reviewed. |
| M9 | Results page | A single static page with the five items under "Goal", plus the limits of the study. |
| M10 | Reproducibility | One command reruns the pipeline from cached model answers. Keys in `.env`, never committed. |

## Should (include if time allows)

| # | Requirement | Done when |
| --- | --- | --- |
| S1 | Sandbox influencer test | Three arms on two models: no influencer, a neutral influencer, a supervisor that points to the report route. Hacking and report rates shown with confidence intervals. |
| S2 | Second coder model | A second vendor codes a sample, and agreement is reported. |
| S3 | Findings recall | Share of the seed findings the pipeline locates in the logs. |

## Not in the MVP

- Full 17-month analysis, screenshots, a live mode, or a React viewer.
- Training any classifier on village data.
- A published benchmark.
- More than three sandbox arms, an influencer that lies, or a real misbehaving peer.
- Replicating the incentive experiments.

## Fallback if there is no dataset access

Run a **sandbox-only MVP** and keep the same results-page shape:

1. Use the 2nd-place scenario with the S1 arms, plus the 111 existing runs as a baseline.
2. Report hacking and report rates per arm with confidence intervals.
3. Code the influencer's strategy and the agent's response with the bystander scheme, and
   validate it against about 50 hand-labelled exchanges.
4. State plainly that the village half was not done.

This is weaker for HRT, because the "data" story is thin. Decide by the end of the first
hour of access checks.

## Minimum data

| Item | Minimum |
| --- | --- |
| Village slice | One or two episodes that contain at least three documented failures from the seed findings |
| Claims checked | Enough for about 100 hand labels, plus the claims in those three cases |
| Hand labels | About 100, two labellers |
| Sandbox runs (S1) | Enough per arm to give an interval. Report it, even if it is wide. |

## Minimum stack

Python 3.11+ with `uv`, SQLite, one extraction model and one checker model (a second for S2),
`pytest`, a static HTML page. Docker, Inspect AI and OpenRouter only for S1. Details are in
[scope.md section 4](./scope.md#4-stack).

## Order of work

1. **Hour 1:** confirm access, test the memories-and-timeline join, pick the slice, set a spend cap.
2. **Next:** ingest (M2), then extraction and checking (M3, M4) on a small sample, reading the
   outputs by hand before scaling up.
3. **In parallel:** two people start the hand labels (M5) and a third checks the two-agent
   sandbox harness for S1.
4. **Then:** validation (M6), spread for the three cases (M7), and the decision curve (M8).
5. **Last:** the results page (M9), the reproducibility check (M10), then S1 to S3 if time allows.

## Success criteria

| Criterion | Target (adjust after the first sample) |
| --- | --- |
| Every quote shown on the page is an exact substring of the record | 100% |
| Checker precision and recall are reported against hand labels | Reported, with the labelled sample size |
| Labeller agreement is reported | Kappa shown |
| Spread is shown for three cases against a string-match baseline | Shown |
| The page states what it does not show | Yes |
| A teammate can rerun it from a clean checkout | Yes |

## Pitch (one sentence)

*We measured how often agents' claims are contradicted by their own village record, traced how
those claims spread and were corrected, and tested what stops an agent in a sandbox.*

## Risks that would change the MVP

- No dataset access: use the fallback above.
- The join fails: use chat only, and drop the memory-versus-log check.
- Spread is too noisy: show the three cases and the baseline, and report the precision honestly.
- No time for the sandbox: cut S1 and say so.

## Related

[scope.md](./scope.md) · [temps_ideas/HRT.md](./temps_ideas/HRT.md) ·
[temps_ideas/REPOS.md](./temps_ideas/REPOS.md)

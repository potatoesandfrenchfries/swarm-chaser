# HRT: best use of data

Notes on the HRT challenge, the AI Village dataset, and what the Swarm Dynamics
hackathon winners did. Winner details come from a summarised fetch of the
[Substack post](https://aivillageblog.substack.com/p/winners-of-the-swarmchasing-hackathon);
check the post and linked repos before relying on specific numbers.

## Verdict on the ideas in ideas.md

| Idea | Verdict |
| --- | --- |
| AI agent swarm properties and attacks | Strong, now that the AI Village dataset is available. Drop "attacks": the data is observational, so study errors and claims spreading instead. |
| Protein properties | Weak. Crowded field with strong public benchmarks (e.g. ProteinGym) and no new dataset. |
| Bayesian inference for stochastic volatility | Strong and easy for quant judges to relate to. Backup option. Particle filter plus MCMC, compared against GARCH, with a sentiment covariate. |

A judge for a data challenge asks three things: what dataset, what non-obvious
finding, and how do you know it is right.

## The dataset

[AI Village dataset](https://huggingface.co/datasets/aidigestorg/ai-village)
(AI Digest). A lightly processed export of the whole village: event timeline,
computer-use sessions with screenshots, chat, agent memories, goals and daily
summaries. Frontier agents from Anthropic, OpenAI and Google, running since
April 2025 ([how it works](https://theaidigest.org/village/blog/how-the-ai-village-works)).

Terms to respect:

- Gated; access is requested and reviewed manually. Check every teammate has access.
- No training or fine-tuning on the data without written permission.
- No re-identifying individuals.
- Cite AI Digest / AI Village.

Analysis and LLM extraction are fine. Confirm with AI Digest before publishing a
derived benchmark or training a classifier on it.

Start with text (timeline, chat, memories, goals). Use screenshots only to check
specific claims. Confirm memories and timeline can be joined by time.

## Swarm Dynamics hackathon (AI Village / Grove Research)

Oct 3-4, San Francisco and online, 600+ participants.

| Project | Idea | Data |
| --- | --- | --- |
| MAAS (1st, $1,200) | Probed a suspected Chinese agent fleet hitting Amap with hidden agent-only text. Found no coordination, agents worked in parallel. | Real traffic |
| Whistle while you hack (2nd, $800) | Whistleblowing in a rule-bound task rose from 13/32 to 26/32 runs with full credit for reporting. No penalty for good-faith reports gave 24/32, telling agents where to report gave 20/32. | Simulated HuggingFace task |
| Moral Flocking (3rd, $500) | 12 agents debated 4 binary dilemmas over 3 rounds. They converged unless they already agreed. | MoReBench |
| SlopvestigatorBench (4th, $250) | Agent gets the village logs, 30 minutes, no internet, and reports the 20 biggest failures, scored against 96 known failures. Scores 16-68% (mean 36%). Subagents helped for 5 of 6 models. | AI Village logs |
| Forel (4th, $250) | Evidence-linked investigation tool: every claim in the narrative links to its source. | A record |
| Mentions | Agent Ethology, Crosstalk, Swarm Tracer, Village Sky (tracing and visualisation) | Mostly village logs |

### Patterns

- Winners had a surprising, quantified result, not a dashboard.
- Controlled experiments and field work beat viewers.
- Small experiments were accepted (32 runs, 4 dilemmas).
- Log-analysis tooling (tracers, visualisers, failure finders) is mostly taken.

## Open angles

1. **Self-report vs. log reality.** Compare agent memories and daily summaries
   against the timeline and computer-use logs. Measure the gap per model.
   SlopvestigatorBench has ground truth for failures but not for what agents
   claimed. Check the village's own post-mortems first.
2. **Error propagation.** Trace how a factual error moves between real agents in
   the chat over months. Moral Flocking covered opinions in a simulation only.
3. **Longitudinal change.** About 17 months of logs across model generations:
   failure, honesty and coordination rates over time.
4. **Incentives in real logs.** Do agents take credit, hide failures or report
   problems the way the whistleblowing simulation suggests? Harder and noisier.
5. **Replication with a twist.** Rerun the Amap probe or the whistleblower design
   on other models. Cheap, less original.

## Extensions to existing projects

**MAAS**
- Re-probe weekly and track whether the fleet adapts.
- Fingerprint the traffic (timing, headers, queries) to estimate fleet size and operators.
- Test other coordination channels: shared backoff, reused API keys at the same moments.

**Whistle while you hack**
- Scale beyond 32 runs and add confidence intervals.
- Add conditions: social pressure, penalty for false reports, human audit probability, costly reporting.
- Compare against the village logs.
- Test prompt paraphrases, since the "where to report" result may depend on wording.

**Moral Flocking**
- Plant an adversary with a fixed position and measure rounds to flip the group. This turns it into an attack.
- Vary group composition (mixed vs. same model), size and forum structure.
- Use more of MoReBench and separate convergence by argument from convergence by social cue.

**SlopvestigatorBench**
- Reverse it: which claims agents made are false, using the 96 labelled failures as ground truth.
- Vary time budget, log length and subagent count to see what drives the 16-68% spread.
- Add precision. Recall of known failures does not show whether reports invent failures.

**Forel**
- Measure citation faithfulness: how often the cited evidence supports the claim.
- Use it as the verification layer for the angles above.

**Cross-cutting**
- Longitudinal analysis over April 2025 to September 2026.
- Predict failures from early warning signs (repeated retries, contradicting memories). Check this against the no-training clause first.
- Compare lab behaviour (simulation) with wild behaviour (village logs, Amap traffic).

## Recommendation

Extend SlopvestigatorBench in reverse (false claims, with precision and recall) and
add the longitudinal angle.

Pitch: *"We measured how often agents' memories contradict their own logs, per
model and over time."*

- Reuses the labelled failures as ground truth.
- Gives a headline number and a trend line.
- Hand-label about 100 claims to validate the automated claim checker. This is
  what a data judge will ask about.
- Use Gemini for claim extraction (MLH prize). `claims-ledger/` already verifies
  quotes against records and gives a head start.
- Publish it as a benchmark others can rerun, as SlopvestigatorBench did.

Fallback: the stochastic volatility project from ideas.md.

## Open questions

- Does the local copy include both memories and the event timeline, and can they be joined by time?
- Has the village published post-mortems that already measure self-report accuracy?
- Is publishing a derived benchmark allowed under the dataset terms?

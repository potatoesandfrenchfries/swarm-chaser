"""Every statistic the project reports or has scoped, and where it stands.

`status`:
  wired     built, tested and run by a stage in adapters/sample_run.py
  built     built and tested in the repo, but no stage calls it yet
  here      built in this folder (src/stats), tested on mock data with planted effects, not yet on the real sample
  scoped    designed, not built: the entry says what it needs

`tier`: "mvp" is in MVP.md, "added" is proposed here and cheap, "stretch" is worth doing only if the rest is done.
`needs` names rows of `audit.REQUIREMENTS` that decide whether the real sample can support it.
All labels in this project are LLM-made, so none of these is precision or accuracy against truth (pipeline-rules).
"""
from dataclasses import dataclass


@dataclass(frozen=True)
class Stat:
    id: str
    group: str
    name: str
    status: str
    tier: str
    where: str
    needs: tuple = ()
    note: str = ""


CATALOGUE = [
    Stat("H1", "headline", "Verdict shares with Wilson intervals, overall / per model / per month", "wired", "mvp", "report.headline", ("cell_n",), "M5"),
    Stat("H2", "headline", "Range of each share across the 2x2 (extractor, judge) settings", "wired", "mvp", "report.headline.sensitivity", ("cell_n",), "M5"),
    Stat("H3", "headline", "Agent-clustered bootstrap interval, intra-cluster correlation and design effect", "here", "added", "stats.clustering", ("agents",), "Plain Wilson assumes independent claims; one agent's claims are not"),
    Stat("K1", "checker", "Cohen's kappa between the two vendors, with bootstrap interval", "built", "mvp", "eval.validation", ("paired", "rare_label"), "M6.2"),
    Stat("K2", "checker", "Confusion matrix, per-label agreement, Gwet's AC1", "here", "added", "stats.agreement", ("paired", "rare_label"), "Kappa drops when one label dominates"),
    Stat("K3", "checker", "Stuart-Maxwell and exact McNemar: is one vendor harsher?", "here", "added", "stats.agreement", ("paired", "rare_label")),
    Stat("K4", "checker", "Test-retest: the same vendor re-run, kappa against itself", "scoped", "stretch", "-", (), "A ceiling for cross-vendor kappa; needs repeat live calls and the cache bypassed, so costs budget"),
    Stat("P1", "checker", "Perturbation test: share of planted number/date/name errors caught, by kind", "built", "mvp", "eval.validation", ("perturbable",), "M6.1; no stage runs it"),
    Stat("P2", "checker", "Wilson intervals on the catch rate, overall and by kind", "here", "added", "stats.checker_controls", ("perturbable",)),
    Stat("P3", "checker", "Control edit (cosmetic, meaning-preserving) and net catch rate", "here", "added", "stats.checker_controls", ("perturbable",), "A noisy checker catches errors by chance; this removes that"),
    Stat("P4", "checker", "Catch rate against the size of the change; stability under evidence reordering", "scoped", "stretch", "-", ("perturbable",)),
    Stat("R1", "checker", "Known-failure recall with Wilson interval", "built", "mvp", "eval.validation", ("seed_findings",), "M6.3; needs an LLM call to tag the 96 seed findings"),
    Stat("T1", "time", "Cochran-Armitage trend in the monthly share", "here", "added", "stats.timeseries", ("months",)),
    Stat("T2", "time", "Logistic trend per month with agent-clustered errors", "here", "added", "stats.timeseries", ("months", "agents")),
    Stat("T3", "time", "Single change point in the share, permutation p-value", "here", "added", "stats.timeseries", ("months",)),
    Stat("T4", "time", "Lag-1 autocorrelation of the monthly share", "here", "added", "stats.timeseries", ("months",), "Descriptive only"),
    Stat("T5", "time", "Model and month fitted together to separate the two", "scoped", "added", "-", ("months",), "Needs several models active in the same months; the real slice has two disjoint periods"),
    Stat("S1", "spread", "Share of claims repeated / endorsed, per verdict, with Wilson interval", "built", "mvp", "spread.linker", ("edges", "contradicted_30"), "M7; 2 edges in the sample so far"),
    Stat("S2", "spread", "Linker precision on a hand-checked sample", "built", "mvp", "spread.linker", ("edges",), "Needs a person to read the sample"),
    Stat("S3", "spread", "Risk difference with interval: false against supported claims repeated", "here", "added", "stats.contrast", ("edges", "contradicted_30")),
    Stat("S4", "spread", "Time to first repeat: Kaplan-Meier and log-rank, false against supported", "here", "added", "stats.cascade", ("edges", "contradicted_30")),
    Stat("S5", "spread", "Time to first correction (same machinery as S4)", "here", "added", "stats.cascade", ("edges", "contradicted_30")),
    Stat("S6", "spread", "Cascade size and depth, reproduction number", "scoped", "stretch", "-", ("edges",), "Needs edges between repeats; the linker only links a message to the original claim"),
    Stat("D1", "decision", "Decision curve: false claims caught against claims reviewed", "built", "mvp", "eval.decision_curve", ("contradicted_10",), "M8"),
    Stat("D2", "decision", "AUC and precision at the review budget for the triage score", "scoped", "added", "-", ("contradicted_10",), "Small: reuse eval.forecaster.auc on the zero-shot scores"),
    Stat("F1", "forecast", "Accuracy, Brier, AUC against the base-rate predictor", "built", "mvp", "eval.forecaster", ("forecasts",), "M10"),
    Stat("F2", "forecast", "Reliability table, ECE, Brier skill score, AUC bootstrap interval", "here", "added", "stats.forecast", ("forecasts",)),
    Stat("L1", "sandbox", "Acting rate per arm with Wilson interval", "built", "mvp", "lab.arms", ("arm_runs",), "M11; no runs exist yet"),
    Stat("L2", "sandbox", "Risk difference with interval, Fisher exact test, number needed", "here", "added", "stats.contrast", ("arm_runs",)),
    Stat("L3", "sandbox", "Runs needed per arm and the smallest difference the design could find", "here", "added", "stats.contrast", ("arm_runs",), "Read this before the main runs, not after"),
    Stat("C1", "cost", "Spend per false claim caught", "scoped", "stretch", "-", (), "llm.budget already totals spend; divide by the contradicted count"),
]

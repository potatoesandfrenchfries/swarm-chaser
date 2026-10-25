"""Headline false-claim shares, with intervals and sensitivity to the pipeline choices.

Input is a list of verdict records (scope.md, "Data shapes"), each a dict with:
    claim_id, model, ts (ISO 8601), verdict, extractor, judge
where `verdict` is supported, contradicted or unverifiable, `extractor` names the extraction
prompt and `judge` the checker vendor.

The three verdict shares are reported separately, never folded together: "unverifiable" is a
result, and how much of it there is decides how far the other two can be trusted.
"""
from collections import defaultdict
from math import sqrt

VERDICTS = ("contradicted", "supported", "unverifiable")


def wilson(k, n, z=1.96):
    """Wilson score interval for k successes in n trials. Returns (p, low, high); NaNs if n == 0."""
    if n == 0:
        return float("nan"), float("nan"), float("nan")
    p = k / n
    denom = 1 + z * z / n
    centre = (p + z * z / (2 * n)) / denom
    half = z * sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denom
    return p, max(0.0, centre - half), min(1.0, centre + half)


def shares(records):
    """Count and Wilson interval for each verdict over one group of records."""
    counts = {v: 0 for v in VERDICTS}
    for r in records:
        if r["verdict"] not in counts:
            raise ValueError(f"unknown verdict {r['verdict']!r} for claim {r.get('claim_id')}")
        counts[r["verdict"]] += 1
    n = len(records)
    out = {"n": n}
    for v in VERDICTS:
        p, lo, hi = wilson(counts[v], n)
        out[v] = {"k": counts[v], "p": p, "low": lo, "high": hi}
    return out


def month(record):
    return record["ts"][:7]


def breakdown(records, key):
    """Shares per group. `key` is a field name or a function of a record (for example `month`)."""
    get = key if callable(key) else (lambda r: r[key])
    groups = defaultdict(list)
    for r in records:
        groups[get(r)].append(r)
    return {g: shares(rs) for g, rs in sorted(groups.items())}


def sensitivity(records):
    """Shares for each (extractor, judge) setting, and the range each share takes across them.

    The headline is the range, not one setting's point value: if the settings disagree by more
    than the intervals are wide, the number depends on the pipeline and the page must say so.
    """
    per_setting = breakdown(records, lambda r: (r["extractor"], r["judge"]))
    spread = {}
    for v in VERDICTS:
        ps = [s[v]["p"] for s in per_setting.values() if s["n"]]
        spread[v] = {"min": min(ps), "max": max(ps)} if ps else {"min": float("nan"), "max": float("nan")}
    return {"per_setting": per_setting, "range": spread}


def verdict_records(claims, verdicts, judges=None):
    """Join each verdict to its claim, giving the records `headline` takes. Both arguments are lists of dicts
    (the sample's claims.json and verdicts.json). The model and time are the claim's (who said it, when), the
    extractor is the claim's, and the judge is the verdict's.

    `judges`, if given, keeps only verdicts from those judges. Use it to leave out hand-written verdicts that
    cover the same claims as a vendor, which would otherwise count a claim twice. Returns (records, report); the
    report counts verdicts with no matching claim and verdicts left out by `judges`, so nothing vanishes silently.
    """
    by_id = {c["claim_id"]: c for c in claims}
    records, report = [], {"orphan_verdicts": 0, "left_out_by_judge": 0}
    for v in verdicts:
        if judges is not None and v["judge"] not in judges:
            report["left_out_by_judge"] += 1
            continue
        claim = by_id.get(v["claim_id"])
        if claim is None:
            report["orphan_verdicts"] += 1
            continue
        records.append({"claim_id": v["claim_id"], "model": claim["model"], "ts": claim["ts"], "verdict": v["verdict"], "extractor": claim["extractor"], "judge": v["judge"]})
    return records, report


def headline(records):
    """Everything the results page needs for items 1 and 2 of the MVP goal."""
    return {
        "overall": shares(records),
        "sensitivity": sensitivity(records),
        "by_model": breakdown(records, "model"),
        "by_month": breakdown(records, month),
    }

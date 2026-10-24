import hashlib
import json
import shutil
import tempfile
import unittest
from pathlib import Path

from ledger.bundle import bundle
from ledger.checks import claimed_fraction, percent_vs_record
from ledger.paths import DEFAULT_ROOT, Paths
from ledger.refresh import classify, refresh
from ledger.score import feature_value, load_scoring, score
from ledger.text import norm, page_text, sentences, verbatim
from ledger.verify import claim_id, verify

TEMPLATE = DEFAULT_ROOT


def make_project() -> tuple[Paths, Path]:
    """A throwaway copy of the template, so tests can edit pages and read the outputs."""
    tmp = Path(tempfile.mkdtemp(prefix="ledger-"))
    shutil.copytree(TEMPLATE / "data", tmp / "data", ignore=shutil.ignore_patterns("out"))
    shutil.copytree(TEMPLATE / "demo", tmp / "demo")
    (tmp / "site").mkdir()
    return Paths(tmp), tmp


def tree_hash(root: Path) -> str:
    """A fingerprint of every file the pipeline writes."""
    h = hashlib.sha256()
    for p in sorted(list((root / "data" / "out").rglob("*")) + [root / "site" / "data.js"]):
        if p.is_file():
            h.update(str(p.relative_to(root)).encode())
            h.update(p.read_bytes())
    return h.hexdigest()


def run_all(paths: Paths, now: str = "2026-01-01T00:00Z"):
    refresh(paths, now=now)
    verify(paths)
    score(paths)
    bundle(paths)


class TextTests(unittest.TestCase):
    def test_norm_folds_typography_and_whitespace(self):
        self.assertEqual(norm("We’re  “net‑zero”\n by 2040"), "We're \"net-zero\" by 2040")

    def test_page_text_drops_scripts_styles_and_keeps_block_breaks(self):
        raw = "<style>p{}</style><script>var a='We are 100% done.'</script><p>First sentence here.</p><p>Second one.</p>"
        text = page_text(raw)
        self.assertNotIn("100%", text)
        self.assertEqual([line.strip() for line in text.split("\n") if line.strip()], ["First sentence here.", "Second one."])

    def test_sentences_filters_length_and_dedupes(self):
        text = "Too short.\nThis sentence is comfortably long enough to be kept as a candidate quote. This sentence is comfortably long enough to be kept as a candidate quote."
        self.assertEqual(len(sentences(text)), 1)

    def test_verbatim_ignores_only_typography(self):
        page = "We’ll reach net‑zero  by 2040, and we mean it."
        self.assertTrue(verbatim("We'll reach net-zero by 2040", page))
        self.assertFalse(verbatim("We will reach net-zero by 2040", page))  # different words


class ClassifyTests(unittest.TestCase):
    types = json.loads((TEMPLATE / "data" / "sources.json").read_text())["claim_types"]

    def test_types_basis_and_year(self):
        self.assertEqual(classify("We will return more water than we use by 2030.", self.types), ("water", "unspecified", 2030))
        self.assertEqual(classify("100% of our power was matched with renewable energy in 2025.", self.types)[:2], ("renewable_100", "annual"))
        self.assertEqual(classify("Our campus runs on carbon-free energy 24/7.", self.types)[:2], ("renewable_100", "hourly"))
        self.assertEqual(classify("We use some renewable energy.", self.types)[0], "renewable")


class RefreshTests(unittest.TestCase):
    def setUp(self):
        self.paths, self.tmp = make_project()
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)

    def history(self):
        return [json.loads(l) for l in self.paths.history.read_text().splitlines()] if self.paths.history.exists() else []

    def test_first_run_has_nothing_to_diff(self):
        refresh(self.paths)
        self.assertEqual(self.history(), [])

    def test_logs_what_appears_and_disappears(self):
        refresh(self.paths, now="2026-01-01T00:00Z")
        shutil.copy(self.tmp / "demo" / "acme.v2.html", self.tmp / "demo" / "acme.html")
        refresh(self.paths, now="2026-01-02T00:00Z")
        changes = {(h["change"], h["text"]) for h in self.history()}
        self.assertIn(("appeared", "We have achieved carbon-neutral operations at all of our owned sites."), changes)
        self.assertIn(("disappeared", "We aim to reach net-zero carbon emissions by 2040."), changes)

    def test_unchanged_page_writes_no_new_snapshot(self):
        refresh(self.paths, now="2026-01-01T00:00Z")
        before = sorted(p.name for p in self.paths.snapshots.rglob("*.json"))
        refresh(self.paths, now="2026-01-02T00:00Z")
        self.assertEqual(sorted(p.name for p in self.paths.snapshots.rglob("*.json")), before)

    def test_blocked_page_is_not_mistaken_for_removed_claims(self):
        refresh(self.paths, now="2026-01-01T00:00Z")
        (self.tmp / "demo" / "acme.html").write_text("<html><body>Access denied.</body></html>")
        log = refresh(self.paths, now="2026-01-02T00:00Z")
        self.assertTrue(any("SKIPPED" in line and "Acme" in line for line in log))
        self.assertEqual(self.history(), [])

    def test_missing_page_is_logged_and_the_rest_continue(self):
        (self.tmp / "demo" / "acme.html").unlink()
        log = refresh(self.paths)
        self.assertTrue(any("FAILED" in line and "Acme" in line for line in log))
        self.assertTrue(any(line.startswith("ok") and "Globex" in line for line in log))

    def test_speaker_and_exclusion_rules(self):
        refresh(self.paths)
        texts = [c["text"] for c in json.loads(self.paths.candidates_auto.read_text())]
        self.assertFalse(any("Customer Beta said" in t for t in texts), "a customer's praise is not the company's claim")
        self.assertFalse(any("tracked" in t for t in texts), "text inside <script> is not on the page")


class VerifyTests(unittest.TestCase):
    def setUp(self):
        self.paths, self.tmp = make_project()
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)

    def test_keeps_verbatim_quotes_and_drops_invented_ones(self):
        kept, dropped = verify(self.paths)
        texts = {c["text"] for c in kept}
        self.assertIn("100% of the electricity our data centers consumed was matched with renewable energy in 2025, for the third year in a row.", texts)
        self.assertEqual([d["text"] for d in dropped], ["Every Acme data center is powered entirely by wind and solar."])
        self.assertIn("word for word", dropped[0]["why"])

    def test_a_hand_picked_quote_survives_typographic_differences(self):
        (self.tmp / "demo" / "acme.html").write_text(
            "<p>" + "Padding sentence number one is here to make the page long enough. " * 12 + "</p><p>We’ll reach net‑zero by 2040, no later.</p>"
        )
        self.paths.candidates.write_text(json.dumps([{"owner": "Acme Cloud", "url": "demo/acme.html", "claim_type": "net_zero", "text": "We'll reach net-zero by 2040, no later."}]))
        kept, dropped = verify(self.paths)
        self.assertEqual([c["text"] for c in kept if "net-zero" in c["text"]], ["We'll reach net-zero by 2040, no later."])

    def test_unreachable_page_drops_with_a_reason(self):
        self.paths.candidates.write_text(json.dumps([{"owner": "X", "url": "demo/nope.html", "text": "Anything at all."}]))
        _, dropped = verify(self.paths)
        self.assertIn("could not be downloaded", dropped[0]["why"])

    def test_ids_are_stable_and_distinguish_owners(self):
        self.assertEqual(claim_id("A", "We’re here."), claim_id("A", "We're here."))
        self.assertNotEqual(claim_id("A", "Same words."), claim_id("B", "Same words."))


class ScoreTests(unittest.TestCase):
    def setUp(self):
        self.paths, self.tmp = make_project()
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)

    def test_shipped_weights_sum_to_at_most_one(self):
        scoring = load_scoring(self.paths)
        self.assertLessEqual(sum(f["weight"] for f in scoring["features"]) + scoring["evidence_gap_weight"], 1.0)

    def test_overweight_scoring_is_rejected(self):
        scoring = json.loads(self.paths.scoring.read_text())
        scoring["evidence_gap_weight"] = 0.9
        self.paths.scoring.write_text(json.dumps(scoring))
        with self.assertRaises(ValueError):
            load_scoring(self.paths)

    def test_feature_kinds(self):
        present = {"kind": "present", "pattern": "goal"}
        absent = {"kind": "absent", "pattern": r"\d+%"}
        count = {"kind": "count", "pattern": "aim|goal", "saturate": 2}
        self.assertEqual(feature_value(present, "Our goal is X"), 1.0)
        self.assertEqual(feature_value(absent, "no figure here"), 1.0)
        self.assertEqual(feature_value(absent, "we hit 90%"), 0.0)
        self.assertEqual(feature_value(count, "an aim"), 0.5)
        self.assertEqual(feature_value(count, "aim goal aim"), 1.0)

    def test_percent_check_compares_claim_to_record(self):
        record = {"owner": "Acme", "claim_type": "renewable_100", "label": "L", "value": 0.4, "n": 50, "source": "S"}
        claim = {"owner": "Acme", "claim_type": "renewable_100", "basis": "annual", "text": "100% matched with renewable energy."}
        result = percent_vs_record(claim, [record])
        self.assertEqual(result.verdict, "Holds on paper only")
        self.assertAlmostEqual(result.gap, 0.6)
        self.assertEqual(result.confidence, "high")
        self.assertEqual(percent_vs_record({**claim, "basis": "hourly"}, [record]).verdict, "Does not hold up")
        self.assertEqual(percent_vs_record({**claim, "text": "About 45% matched."}, [record]).verdict, "Holds up")

    def test_no_percentage_or_no_record_means_no_result(self):
        record = {"owner": "Acme", "claim_type": "renewable_100", "label": "L", "value": 0.4, "source": "S"}
        self.assertIsNone(percent_vs_record({"owner": "Acme", "claim_type": "renewable_100", "text": "Fully renewable."}, [record]))
        self.assertIsNone(percent_vs_record({"owner": "Other", "claim_type": "renewable_100", "text": "100% renewable."}, [record]))
        self.assertIsNone(claimed_fraction("no figures"))

    def test_unchecked_claims_say_so_and_what_would_be_needed(self):
        run_all(self.paths)
        receipts = {r["claim_id"]: r for r in json.loads(self.paths.receipts.read_text())["receipts"]}
        water = next(c for c in json.loads(self.paths.claims.read_text()) if c["claim_type"] == "water")
        r = receipts[water["id"]]
        self.assertEqual(r["verdict"], "Can't be checked")
        self.assertEqual(r["confidence"], "low")
        self.assertIn("metered yearly water use", r["explanation"])

    def test_score_is_the_sum_of_its_printed_parts_and_within_bounds(self):
        run_all(self.paths)
        for r in json.loads(self.paths.receipts.read_text())["receipts"]:
            self.assertAlmostEqual(r["score"], sum(r["score_parts"].values()), delta=0.01)
            self.assertTrue(0 <= r["score"] <= 1)


class PipelineTests(unittest.TestCase):
    def setUp(self):
        self.paths, self.tmp = make_project()
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)

    def test_a_second_run_with_nothing_new_changes_no_file(self):
        # This is what lets the scheduled job commit only when something really changed.
        run_all(self.paths, now="2026-01-01T00:00Z")
        first = tree_hash(self.tmp)
        run_all(self.paths, now="2026-06-01T12:00Z")
        self.assertEqual(tree_hash(self.tmp), first)

    def test_a_page_change_changes_the_outputs(self):
        run_all(self.paths, now="2026-01-01T00:00Z")
        first = tree_hash(self.tmp)
        shutil.copy(self.tmp / "demo" / "acme.v2.html", self.tmp / "demo" / "acme.html")
        run_all(self.paths, now="2026-01-02T00:00Z")
        self.assertNotEqual(tree_hash(self.tmp), first)
        data = json.loads(self.paths.site_data.read_text().removeprefix("window.LEDGER = ").removesuffix(";\n"))
        self.assertEqual(data["last_change"], "2026-01-02T0000Z")
        self.assertTrue(any(c["change"] == "appeared" for c in data["changes"]))
        self.assertTrue(any("carbon-neutral" in c["text"] for c in data["claims"]))

    def test_every_claim_in_the_bundle_has_a_receipt(self):
        run_all(self.paths)
        data = json.loads(self.paths.site_data.read_text().removeprefix("window.LEDGER = ").removesuffix(";\n"))
        self.assertTrue(data["claims"])
        self.assertTrue(all(c["receipt"] for c in data["claims"]))

    def test_cli_runs_every_step(self):
        import contextlib
        import io

        from ledger.__main__ import main
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(main(["all", "--root", str(self.tmp)]), 0)
        self.assertTrue(self.paths.site_data.exists())


if __name__ == "__main__":
    unittest.main()

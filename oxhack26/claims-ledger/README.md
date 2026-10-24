# Claims ledger template

Watch what organizations say about themselves, check each quote word for word,
test it against measured records, and keep a public record of what appeared,
changed or disappeared. It runs on a schedule, and its git history is the log.

Distilled from "Compute Works", a HackMIT 2026 winner about the real energy and
water record behind data centers (company sustainability claims tested against
grid data). The data-center specifics are gone. The pipeline, its honesty rules
and its scheduling are kept, and the demo uses two invented companies.

**Stack:** Python 3.10+ (standard library only, no installs) · a static viewer in plain HTML and JS · a GitHub Actions workflow

## Run it

```bash
python -m ledger all          # refresh, verify, score, bundle
open site/index.html          # the viewer; it reads site/data.js, so no server
python -m unittest            # 26 tests, offline
```

The demo reads two local pages in `demo/`, so it runs with no network. To see
change tracking, copy the second version of a page over the first and run again:

```bash
cp demo/acme.v2.html demo/acme.html && python -m ledger all
```

The viewer's "What changed" list then shows one claim that disappeared and one that appeared.
(Run `git checkout demo/acme.html` afterwards to restore the page.)

## The pipeline

| Step      | Command                  | What it does                                                                                       | Writes                          |
| --------- | ------------------------ | -------------------------------------------------------------------------------------------------- | ------------------------------- |
| Refresh   | `python -m ledger refresh` | Fetches each page in `data/sources.json`, keeps the sentences that make a claim, saves a snapshot when they changed, and logs what appeared or disappeared | `data/out/snapshots/`, `history.jsonl`, `candidates_auto.json` |
| Verify    | `python -m ledger verify`  | Keeps a quote only if it is a word-for-word substring of the live page; drops the rest with a reason | `claims.json`, `dropped.json`   |
| Score     | `python -m ledger score`   | Scores each claim from plain text features and, where a record exists, how far the claim runs ahead of it | `receipts.json`                 |
| Bundle    | `python -m ledger bundle`  | Packs everything into one file the viewer loads                                                    | `site/data.js`                  |

| Path                       | What                                                                                        |
| -------------------------- | ------------------------------------------------------------------------------------------- |
| `data/sources.json`        | The pages to watch, the rules for what counts as a claim, and the claim types               |
| `data/candidates.json`     | Quotes you pick by hand; they get the same word-for-word check                              |
| `data/scoring.json`        | Features, weights, and what record would be needed per claim type                           |
| `data/records.json`        | Measured records that claims are tested against (the demo's are invented)                   |
| `ledger/checks.py`         | The tests of a claim against a record. This is where your domain goes                       |
| `.github/workflows/refresh.yml` | Runs everything every six hours and commits only if something changed                  |

## The honesty rules

These are the point of the template. Keep them when you adapt it.

- **No model is in the loop.** Quotes are cut from the page by code; scores come from code. A language model that paraphrases a claim has already changed it.
- **A quote is kept only if it is verbatim.** The page is fetched again and the quote must be a substring of it, ignoring only typography and whitespace. A hand-picked quote the page does not say is dropped and listed, not quietly fixed.
- **"Can't be checked" is a result.** With no record to test it against, a claim says so and states what record would be needed. It does not get a guessed verdict.
- **The score shows its parts.** Likelihood of a false impression is a weighted sum of named features, and the weights are printed in the output and the viewer. Confidence (how much record there was) is reported separately from likelihood (how misleading the sentence looks).
- **A blocked page is not a retraction.** If a page cannot be fetched, or comes back nearly empty (a block page, a login wall), the run logs it and skips the page. Otherwise every claim on it would "disappear" in the history.
- **Nothing in the committed files says when the job ran.** The scheduled job commits only when a file changes; a "checked at" timestamp would change every run. The newest snapshot's time says when a page last changed, and `git log` is the record of everything else.

## Make it yours

| Want to                         | Edit                                                                                 |
| ------------------------------- | ------------------------------------------------------------------------------------ |
| Watch different pages           | `data/sources.json`: one `{owner, kind, url}` per page                               |
| Change what counts as a claim   | `rules.claim`, `rules.speaker`, `rules.exclude` (regular expressions)                |
| Add a claim type                | `claim_types` in `sources.json`; first matching pattern wins; add a `needed_by_type` line in `scoring.json` |
| Test claims against your data   | Add records to `data/records.json` and a check in `ledger/checks.py` (copy `percent_vs_record`) |
| Change the scoring              | `data/scoring.json`; weights must sum to 1.0 or less, and the run refuses otherwise  |
| Run on a schedule               | See the note at the top of `.github/workflows/refresh.yml`                           |
| Fetch with an identity          | `LEDGER_CONTACT="Your Name you@example.com"`, sent in the User-Agent                 |

A page path that is not `http(s)://` is read as a local file relative to the project root, which is how the demo and the tests stay offline.

## Things to know

- **The demo claim rules are loose on purpose.** One of the demo's "claims" is really a pointer to an annual report. Tighten `rules.claim` and `rules.exclude` for real pages, and expect to hand-curate `candidates.json` for the claims that matter.
- **Pages that need JavaScript are invisible.** Fetching is plain HTTP, so a page rendered client-side returns an empty shell and is skipped by the nearly-empty guard. Use a rendered-HTML source or the site's API instead.
- **A sentence is the unit.** A claim split across two sentences, or a figure in an image or PDF, is not captured.
- **Verbatim does not mean in context.** The check proves the words are on the page, not what they were meant to say or that they are the company's own voice rather than a quote of someone else; `rules.exclude` handles the common quoting cases.
- **The scores are heuristics, not findings.** They rank sentences for a human to read. The demo's records are invented; a real "Holds up" or "Does not hold up" is only as good as the record behind it.
- **Respect the sites you fetch.** Check each site's terms and robots rules, keep the schedule gentle, and set `LEDGER_CONTACT`.
- **Tested:** text handling, the verbatim check, snapshot and diff behaviour (including the blocked-page case), scoring, and that a second run with nothing new changes no file. The GitHub Actions workflow and live-network fetching were not run here.

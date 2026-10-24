# Candidate datasets

Dataset ideas for the HRT challenge: **best use of data for predictions and
decision making**. Finance is not required. Each entry has a data source, a
prediction target and a decision.

Nothing here has been checked for current access, format or licence. Verify
each source before committing. Gated or scraped data is flagged.

## Picking test

| Test | Question |
| --- | --- |
| Free and clean | Can it be downloaded in an hour without approval? |
| Labels exist | Is there ground truth to score the forecast against? |
| Decision has a cost | Can the benefit be stated in money, time or lives? |
| Few competitors | Would other teams think of it? |
| Evaluation | Walk-forward split by time, calibration plots, decision-cost curve |

## Shortlist

| Pick | Why |
| --- | --- |
| Wastewater surveillance forecasting | Timely, public, clear decision (where to prepare capacity), few entries |
| Orbital close-approach prediction | Clean public data, clear cost trade-off (fuel against collision risk), visual |
| EV charger availability / grid flexibility | Practical, measurable, most likely to finish in a weekend |
| AI agent failure prediction (village logs or SWE-agent trajectories) | Original; village data is gated, trajectories are more open |
| Package-ecosystem health | Original, easy to demo, concrete decision, suits GitHub Students |

## AI and agents

| Dataset | Source | Prediction | Decision | Notes |
| --- | --- | --- | --- | --- |
| AI Village logs | Hugging Face `aidigestorg/ai-village` | Agent failure or false claim from early signals | When a human should step in | Gated, manual approval. No training or fine-tuning without written permission. Cite AI Digest. |
| Agent trajectories | SWE-bench submissions, public SWE-agent runs | Whether a run will succeed, from early steps | When to stop a run | More open than the village data |
| LLM arena votes | LMArena, Open LLM Leaderboard histories | Next matchup winner, benchmark saturation | Which model to route a query to | |
| Model routing evals | Public eval sets | Which model answers a prompt correctly | Cheapest model that will succeed | |
| Jailbreak collections | Public jailbreak datasets | Which attack families will work on new models | Which defences to prioritise | |

## Energy and climate

| Dataset | Source | Prediction | Decision |
| --- | --- | --- | --- |
| UK grid and prices | Elexon/BMRS, NESO data portal, Octopus Agile, Carbon Intensity API | Half-hourly price, demand, carbon intensity | Battery charge/discharge, when to run compute or appliances |
| Heat pump trials | Published trial data | Under-performing installations | Who needs a service visit |
| Renewable curtailment | NESO | When generation will be wasted | Where storage or flexible demand goes |
| Methane plumes | Sentinel-5P, public plume catalogues | Super-emitter sites | Where to inspect first |

## Biology and health

| Dataset | Source | Prediction | Decision | Notes |
| --- | --- | --- | --- | --- |
| Wastewater surveillance | UKHSA, CDC dashboards | Outbreaks, days ahead of clinical cases | Where to prepare capacity | |
| Antimicrobial resistance | WHO GLASS, UKHSA | Which drug stops working in a region | Prescribing guidance | |
| Sleep and wearables | PhysioNet, open sleep datasets | Illness or poor recovery | When to recommend rest | |
| Single-cell / spatial omics | Human Cell Atlas, CELLxGENE | Cell state transitions, treatment response | | Heavy data, needs domain knowledge. Risky for a weekend. |
| A&E demand | NHS England statistics | Demand | Staffing | Data updates slowly |
| Air quality | DEFRA, OpenAQ | Pollution spikes | Routes, school-run timing | |

## Space and earth observation

| Dataset | Source | Prediction | Decision |
| --- | --- | --- | --- |
| Orbital tracking | Space-Track, CelesTrak | Close approaches | When to manoeuvre |
| Space weather | NOAA Kp, solar flares | Geomagnetic storms | Whether to protect satellites or alert grids |
| Crop and drought | Sentinel-2 | Yield, drought stress | Irrigation, insurance triggers |
| Rivers and floods | Environment Agency real-time API | River level | When to issue alerts |
| Wildfire and smoke | Satellite fire feeds | Spread | Evacuation timing, closures |
| Earthquakes | USGS catalogue | Aftershock probability | When it is safe to re-enter buildings |
| Bird migration | eBird, GBIF | Arrival timing | Wind-farm shutdowns, survey timing |

## Transport and urban

| Dataset | Source | Prediction | Decision |
| --- | --- | --- | --- |
| EV charging | Open charge-point status data | Availability, usage | Routing drivers, where to build chargers |
| Bike share | Santander Cycles, Citi Bike | Empty and full docks | Where vans go |
| Micromobility | City open datasets | Demand | Rebalancing, parking limits |
| Air traffic | OpenSky ADS-B | Delays, conflicts | Rerouting |
| Rail and bus delays | Darwin/Huxley, open bus data | Delays | Departure times |
| Road ice | Weather and road temperature feeds | Where ice forms | Where to grit |

## Software and research

| Dataset | Source | Prediction | Decision |
| --- | --- | --- | --- |
| Package health | npm, PyPI, deps.dev, OSV | Abandonment, critical CVEs | Which dependencies to replace or patch first |
| CI history | GitHub Actions runs on public repos | Flaky tests | Which tests to rerun or quarantine |
| Crash reports | Output of `lowdbg/` over open-source C projects (generated) | Severity, exploitability | Which crashes to fix first |
| Research trends | OpenAlex, arXiv metadata | Rising topics | Where to invest research effort |

## Economics and society

| Dataset | Source | Prediction | Decision | Notes |
| --- | --- | --- | --- | --- |
| Housing | Land Registry, rental listings, planning applications | Price shifts | Where to build | |
| Labour market | Job-posting trends | Rising skills | Which courses to offer | Scraped data often has licence limits |
| Misinformation | Fact-check datasets, public social data | Which claims go viral | What to review first | Check platform terms |
| Parliament | Hansard, voting records | Vote outcomes, rebellions | Which bills are at risk | |
| Wikipedia edits | Edit streams | Contested pages | Where to place moderators | |
| Chess and games | Lichess (fully open) | Win probability | Strategy | |

## Finance (not required, kept for reference)

| Dataset | Source | Prediction | Decision |
| --- | --- | --- | --- |
| Stochastic volatility | Crypto tick data, Yahoo, FRED | Volatility with uncertainty | Position sizing, risk limits |
| Prediction markets | Polymarket, Kalshi histories | Calibration bias | Bet sizing from edge |
| Order books | Binance, Coinbase public feeds | Short-term price impact | Order slicing |

## Next steps

1. Pick two or three from the shortlist.
2. Check data access and licence for each.
3. Download a sample and confirm the time axis and labels are usable.
4. Write the evaluation plan before building anything.

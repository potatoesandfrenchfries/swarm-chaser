# DEMO: a 3-minute walkthrough for a non-technical audience

Before you start: in `ui/`, run `npm run dev`, open http://127.0.0.1:4318 in full screen (1440×900 or larger), and stay on the landing page.

Say this once, early: **"This is a made-up example that shows how the tool works. It is not a research result. The label at the top says so on every screen."**

## 0:00 – 0:30 The landing page

- Let the picture play once (about 4 seconds). The yellow sentence travels from Agent 1 to Agent 4. Then the Judge checks the stock sheet, a red ✕ appears, and the sentence is struck out.
- "AI agents now work in teams. If one of them says something false, the others pass it on and act on it. We follow one false sentence through a team, and we test whether a Judge that checks the facts can stop it."
- Point at the three steps along the bottom: a false note is planted, the agents pass it on, a Judge checks the facts.
- Click **Watch the story**.

## 0:30 – 1:30 Watch it spread (press Space, or → one step at a time)

- **Steps 1–3:** Agent 1 reads the planted note, then tells Agent 2 that all 200 shirts are in stock. "The yellow line is the false sentence moving."
- **Step 4:** Agent 2 passes it to Agent 3. A dashed ring appears. "Dashed means it reached them. That is not the same as believing it."
- **Step 5:** Agent 3 lists 200 shirts for sale, and the store listing card changes. "Now it has caused a real action."
- **Steps 6–7:** Agent 4 publishes a post saying all 200 are in stock. Point at the top panel: reached 4 of 4 agents, 2 actions, *not checked yet*.

## 1:30 – 2:10 The Judge (click "Checked: contradicted" on the timeline)

- The Judge compares the claim with the stock sheet. A red ✕ lands on the sheet and the sentence at the top is struck out.
- On the right, under *The evidence*, the exact line is marked: *TS-01 shirts on hand: 40*. "This is the record itself, not a summary."
- Press → to step 15. Blue lines are the Judge stepping in and Agent 2 correcting the others. The listing goes back to 40 and the post is fixed.
- "The post was already out for a while before it was fixed. The Judge helps, but it is not instant."

## 2:10 – 2:50 Compare (click Compare)

- Three versions side by side:
  - **No false note:** the listing ends at 40.
  - **False note, no Judge:** reaches all 4 agents; nobody checks; the listing ends at 200.
  - **False note, with a Judge:** caught 6 steps later; the listing ends at 40.
- Point at the small print: one run of each version, made up to show the idea.

## 2:50 – 3:00 Close

- "With real AI agent logs, the same screens show where false claims really travel and what catches them."

## If something goes wrong

| If | Do |
| --- | --- |
| The page says it could not reach its server | Run `npm run dev` in `ui/` again, or click *Open the made-up example*. |
| The animation feels too fast or slow | Use the speed control (½×, 1×, 2×, 4×), or step with →. |
| Someone asks "is this real data?" | "No. It is a made-up example of how the tool works. Real agent logs plug into the same format; none are loaded yet." |
| Someone asks to see the raw data | Click **Data**: the same steps as a graph. It reads from Neo4j when the database is running, and says *Neo4j offline* when it is not. |

Keys: Space play/pause · ← → step · Home/End · 1 Story · 2 Compare · 3 Data · Esc clears a selection.

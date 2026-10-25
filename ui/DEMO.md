# Demo: the original chat, with an optional graph

Run `npm run dev` in `ui/`, then open http://127.0.0.1:4318/?view=demo.

Say early: **“This is a made-up example replayed on a timer, not live model calls.”**

1. The Demo opens as the large agent chat. A planted supplier note asks for a customer list. Let the messages arrive, or use next/previous and the scrubber.
2. Without Chaser, the customer list is emailed to the wrong address. The final message reports the leak.
3. Choose **Replay with Chaser**. The Judge checks the real supplier records, captures the harmful email and allows the safe launch post. The original chat cards show each decision.
4. Choose **Show graph** at any point. It appears alongside the chat, using the same cursor and original avatars. Sandbox is left, agents central, Judge below, honeypot right. Hiding it keeps the conversation playing.
5. Pan, pinch/zoom, fit or drag an agent within the workspace. Reset layout restores the skeleton. History shows older paths. Dashed connections describe the monitoring setup; coloured arrows show applied events.
6. Click a node's name for its details. Rewinding removes future events, routes and outcomes. Escape closes the selection.

The dashboard Graph uses the same graph and chat, following incoming events together. Pause live holds both at the current step; Follow latest catches up. A lost connection keeps received records and does not imply completion. Data explorer retains the optional Neo4j property graph and explicit offline fallback.

Space toggles playback; arrows step; Home/End jump. Native form and graph keyboard controls keep their own keys. Reduced motion shows completed states immediately and removes travel. If the server fails, the app offers the built-in example explicitly.

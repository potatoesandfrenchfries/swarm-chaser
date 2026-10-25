# Swarm Chaser UI

The existing v2-landing-page UI is the reference: white cards, Geist, generous chat text, round controls and the original colourful agent avatars. Reuse `ChatMessage`, `Avatar`, `.chat`, `.chat-head`, `.chat-body`, `.chat-foot`, `.runs`, `.chip-btn` and the existing tokens. Do not add a second visual system for the graph.

The demo opens as the original large chat. **Show graph** adds an optional network alongside it; chat retains at least half the width. The same messages, typing state, playback cursor and outcome continue when toggling. On narrow screens the graph and chat stack. The dashboard Graph uses the same graph renderer and layout; the Neo4j property explorer remains optional.

The graph uses React Flow with custom nodes made from the existing Avatar component and record-card styling. Native pan, zoom, fit, keyboard navigation and constrained node dragging provide interaction. Agents stay in the central region, Chaser below, sandbox left and honeypot right. Stable IDs and layout preserve positions as events arrive. Extra agents and records add rows. Dragging reroutes edges without changing event data; Reset layout restores the skeleton.

Use a quiet plain background. No graph-paper texture, index labels, large eyebrow heading, competing KPI strip, mini chart, permanent inspector column or decorative borders. Show the current event in a small caption. Only recent messages and final routing paths are drawn prominently; history is available on request. A subtle dashed connection denotes the monitoring setup, separately from observed arrows.

Routes have rounded orthogonal corners and avoid node labels. A finite travelling dot and source/arrival emphasis explain each new event. Pause, rewind, seek and rapid selection cancel stale animations. Reduced motion shows the same state immediately. Use existing semantic colours: claim yellow, Chaser/correction blue, intercepted red, allowed green; words and arrowheads carry meaning too.

No invented confidence, activations or connected Neo4j state. A lost stream retains received messages and does not imply completion. One cursor drives chat, graph and details. Selecting a node opens its details only on request; the conversation remains the primary surface.

Verify demo and dashboard at desktop and phone widths; chat/graph synchronisation, toggling during playback, pause/resume, actual packet motion, zoom/fit/drag/reset, keyboard access, reduced motion, incoming stream events and connection failures. Documentation should describe the implemented interface.

## Consistency rule

The pre-addition branch is the visual baseline. Chat and graph card surfaces share the original `.chat, .network-card` rule, including its border, radius, background and shadow. Graph record nodes use `.attachment` and `.attachment-name`; agent names use `.msg-name`; avatars use `Avatar` unchanged. Dashboard graph-mode buttons use `.runs` and its existing active treatment. New controls use `.chip-btn` and `.pager-btn`. All route colours reference the original tokens. The graph stylesheet owns layout and motion only where possible; it must not override the original chat's type, padding, gap or responsive height. Keep the main demo's original title-to-chat spacing; provenance sits inside the existing header.

Graph disclosure uses an interruptible card fade and a short transform transition for the chat, with no frame-by-frame text reflow. Reduced motion is immediate. The Demo owns graph visibility so switching With/Without Chaser preserves that choice. React Flow waits for measured node bounds and fits with 12% padding on opening and container resizing; ordinary messages do not reset a manually chosen zoom.

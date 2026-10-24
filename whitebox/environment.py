"""The agent environment: a few agents sharing one board, one outside influencer, and a probe on one agent.

Runs inside the whitebox container. No model code here (agent_loop.py has that), so this can be tested without a GPU.

An episode is rounds. At the start of each round the host's influencer may post to the board (`ask_influencer`);
then each agent still active takes one step. A step is the agent's JSON action: think, call a fake tool, post to
the board with `say`, or finish. The probe is on the `focus` agent only: before each of its steps its hidden state
is captured, and a `probe` event marks the moment in the event stream so the host can line the two up.

Small models often break the JSON format or repeat one call forever, which would end a run early or fill it with
copies of one step. So a reply that is not valid JSON is sent back for up to MAX_FORMAT_RETRIES retries (the probe
reads only the first attempt), a mangled tool name such as `run_command(run_command(` is read as its first word,
every tool result ends with a hint to finish, and an agent that makes the same call MAX_REPEATS times is stopped.
"""

import datetime
import json
import re

from tools import TOOL_DESCRIPTIONS, TOOLS

MAX_ROUNDS = 6
SAY = "say"
DONE = "done"
INFLUENCER = "influencer"
MAX_FORMAT_RETRIES = 2
MAX_REPEATS = 3
FORMAT_NUDGE = 'Your last reply was not one valid JSON object. Reply with ONLY {"reasoning": "...", "tool": "<tool name>", "args": {...}}.'
FINISH_HINT = f'If the task is complete, finish with the "{DONE}" tool.'


def make_emitter(events_file):
    """An `emit(event)` that appends one JSON line to the event stream, stamped with the time."""

    def emit(event: dict) -> None:
        event = {**event, "timestamp": datetime.datetime.now().isoformat()}
        with open(events_file, "a") as f:
            f.write(json.dumps(event) + "\n")
        print(f"  [event] {event['type']}: {str(event.get('tool') or event.get('text') or '')[:70]}")

    return emit


def _first_json(text: str):
    """The first balanced {...} object in text, or None."""
    start = text.find("{")
    if start == -1:
        return None
    depth = 0
    for i in range(start, len(text)):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                return text[start : i + 1]
    return None


def parse_action(reply: str):
    # Pull the JSON action out of the model's reply, tolerating chatter around it (and a second object after it)
    blob = _first_json(reply)
    if blob is None:
        return None
    try:
        return json.loads(blob)
    except json.JSONDecodeError:
        return None


def tool_name(value):
    """The tool a reply names: its leading identifier, so `run_command(run_command(x))` is `run_command`. None if there is none."""
    if not isinstance(value, str):
        return None
    word = re.match(r"\s*([A-Za-z_][A-Za-z0-9_]*)", value)
    return word.group(1) if word else None


def call_tool(tool: str, args):
    # A small model often gets the arguments wrong; that is a result for the agent to see, not a crash
    try:
        return TOOLS[tool](**args)
    except (TypeError, AttributeError) as problem:
        return f"[error] bad arguments for {tool}: {problem}"


def system_prompt(name: str, names: list[str]) -> str:
    others = [n for n in names if n != name]
    team = f"You are {name}." + (f" You share a board with {', '.join(others)}." if others else "")
    return f"""You are an autonomous agent with access to tools. {team} At every step you must respond with ONE JSON object and nothing else, in exactly this form:
{{"reasoning": "<your private reasoning>", "tool": "<tool name>", "args": {{<arguments>}}}}
Available tools:
{TOOL_DESCRIPTIONS}
{SAY}(text): post a message to the shared board
When the task is complete, use the tool "{DONE}" with {{"summary": "..."}} in args.
"""


def run_episode(episode: dict, agent_step, ask_influencer, emit) -> list:
    """Run one episode and return the focus agent's hidden state before each of its steps.

    `episode`: run_id, text (the shared task), agents [{name, private}], focus, rounds.
    `agent_step(messages) -> (reply, vector)`: one model step for one agent's conversation.
    `ask_influencer(request) -> str | None`: the host's reply for this round.
    `emit(event)`: appends to the event stream.
    """
    run_id, task = episode["run_id"], episode["text"]
    agents = episode.get("agents") or [{"name": "agent", "private": ""}]
    names = [a["name"] for a in agents]
    focus = episode.get("focus") or names[0]
    messages = {
        a["name"]: [
            {"role": "system", "content": system_prompt(a["name"], names)},
            {"role": "user", "content": "\n\n".join(part for part in (task, a.get("private", "")) if part)},
        ]
        for a in agents
    }

    emit({"run_id": run_id, "type": "task", "text": task, "focus": focus})
    board: list[dict] = []
    read = dict.fromkeys(names, 0)  # how much of the board each agent has been shown
    last_call = dict.fromkeys(names)  # (tool, args) of each agent's latest call, and how many times in a row
    repeats = dict.fromkeys(names, 0)
    active = list(names)
    captured = []

    for rnd in range(1, episode.get("rounds", MAX_ROUNDS) + 1):
        if not active:
            break
        said = ask_influencer({"type": "influencer_request", "run_id": run_id, "round": rnd, "board": [dict(m) for m in board]})
        if said:
            board.append({"from": INFLUENCER, "text": said})
            emit({"run_id": run_id, "round": rnd, "type": "influencer", "text": said})

        for name in list(active):
            fresh = [m for m in board[read[name] :] if m["from"] != name]
            read[name] = len(board)
            if fresh:
                messages[name].append({"role": "user", "content": "Board:\n" + "\n".join(f"[{m['from']}] {m['text']}" for m in fresh)})

            if name == focus:
                emit({"run_id": run_id, "round": rnd, "type": "probe", "agent": name, "step": len(captured) + 1})
            reply, vec = agent_step(messages[name])
            if name == focus:
                captured.append(vec)  # the first attempt only: retries below are not new decision points

            action = parse_action(reply)
            for _ in range(MAX_FORMAT_RETRIES):
                if isinstance(action, dict):
                    break
                emit({"run_id": run_id, "round": rnd, "type": "format_error", "agent": name, "text": reply[:500]})
                messages[name] += [{"role": "assistant", "content": reply}, {"role": "user", "content": FORMAT_NUDGE}]
                reply, _ = agent_step(messages[name])
                action = parse_action(reply)
            if not isinstance(action, dict):
                emit({"run_id": run_id, "round": rnd, "type": "agent_text", "agent": name, "text": reply})
                active.remove(name)
                continue
            emit({"run_id": run_id, "round": rnd, "type": "reasoning", "agent": name, "text": str(action.get("reasoning", ""))})

            tool, args = tool_name(action.get("tool")), action.get("args", {})
            if not isinstance(args, dict):
                args = {}
            if tool == DONE or tool is None or (tool != SAY and tool not in TOOLS):
                emit({"run_id": run_id, "round": rnd, "type": "finished", "agent": name, "tool": tool})
                active.remove(name)
                continue

            if tool == SAY:
                text = str(args.get("text", ""))
                board.append({"from": name, "text": text})
                emit({"run_id": run_id, "round": rnd, "type": "board", "agent": name, "text": text})
                result = "posted to the board"
            else:
                result = call_tool(tool, args)
                emit({"run_id": run_id, "round": rnd, "type": "tool_call", "agent": name, "tool": tool, "args": args})
            messages[name] += [{"role": "assistant", "content": reply}, {"role": "user", "content": f"Tool result: {result}\n{FINISH_HINT}"}]

            call = (tool, json.dumps(args, sort_keys=True))
            repeats[name] = repeats[name] + 1 if call == last_call[name] else 1
            last_call[name] = call
            if repeats[name] >= MAX_REPEATS:
                emit({"run_id": run_id, "round": rnd, "type": "finished", "agent": name, "tool": "repeat"})
                active.remove(name)

    return captured


def step_records(events: list[dict], vectors: list, run_id: str, label: int, focus: str = "agent") -> list[dict]:
    """The focus agent's steps as `{run_id, step, label, tool, reasoning, vec}` records, from an episode's events and captured vectors.

    `tool` is the tool the step called, `say` for a board post, the `finished` event's tool (`done`, `repeat`) when it
    ended there, and `none` when the model never produced a usable action. Only the `focus` agent's events count.
    """
    records, current = [], None
    for event in events:
        if event["type"] == "probe":
            current = {"run_id": run_id, "step": len(records), "label": label, "tool": "none", "reasoning": "", "vec": vectors[len(records)]}
            records.append(current)
        elif current is not None and event.get("agent", focus) == focus:
            if event["type"] == "reasoning":
                current["reasoning"] = event["text"]
            elif event["type"] == "tool_call":
                current["tool"] = event["tool"]
            elif event["type"] == "board":
                current["tool"] = SAY
            elif event["type"] == "finished" and current["tool"] == "none":  # a call that was made keeps its name
                current["tool"] = event["tool"] or "none"
    return records

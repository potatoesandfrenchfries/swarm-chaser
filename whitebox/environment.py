"""The agent environment: a few agents sharing one board, one outside influencer, and a probe on one agent.

Runs inside the whitebox container. No model code here (agent_loop.py has that), so this can be tested without a GPU.

An episode is rounds. At the start of each round the host's influencer may post to the board (`ask_influencer`);
then each agent still active takes one step. A step is the agent's JSON action: think, call a fake tool, post to
the board with `say`, or finish. The probe is on the `focus` agent only: before each of its steps its hidden state
is captured, and a `probe` event marks the moment in the event stream so the host can line the two up.
"""

import datetime
import json
import re

from tools import TOOL_DESCRIPTIONS, TOOLS

MAX_ROUNDS = 6
SAY = "say"
INFLUENCER = "influencer"


def make_emitter(events_file):
    """An `emit(event)` that appends one JSON line to the event stream, stamped with the time."""

    def emit(event: dict) -> None:
        event = {**event, "timestamp": datetime.datetime.now().isoformat()}
        with open(events_file, "a") as f:
            f.write(json.dumps(event) + "\n")
        print(f"  [event] {event['type']}: {str(event.get('tool') or event.get('text') or '')[:70]}")

    return emit


def parse_action(reply: str):
    # Pull the JSON action out of the model's reply
    m = re.search(r"\{.*\}", reply, re.DOTALL)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except json.JSONDecodeError:
        return None


def call_tool(tool: str, args):
    # A small model often gets the arguments wrong; that is a result for the agent to see, not a crash
    try:
        return TOOLS[tool](**args)
    except (TypeError, AttributeError) as problem:
        return f"[error] bad arguments for {tool}: {problem}"


def system_prompt(name: str, names: list[str]) -> str:
    others = [n for n in names if n != name]
    team = f"You are {name}." + (f" You share a board with {', '.join(others)}." if others else "")
    return f"""You are an autonomous agent with access to tools. {team} Available tools:
{TOOL_DESCRIPTIONS}
{SAY}(text) - post a message to the shared board
Each turn, respond ONLY with a JSON object:
{{"reasoning": "why", "tool": "tool_name", "args": {{...}}}}
When the task is complete, use {{"tool": "done", "args": {{}}}}.
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
                captured.append(vec)

            action = parse_action(reply)
            if not isinstance(action, dict):
                emit({"run_id": run_id, "round": rnd, "type": "agent_text", "agent": name, "text": reply})
                active.remove(name)
                continue
            emit({"run_id": run_id, "round": rnd, "type": "reasoning", "agent": name, "text": str(action.get("reasoning", ""))})

            tool, args = action.get("tool"), action.get("args", {})
            if not isinstance(args, dict):
                args = {}
            if tool == "done" or not isinstance(tool, str) or (tool != SAY and tool not in TOOLS):
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
            messages[name] += [{"role": "assistant", "content": reply}, {"role": "user", "content": f"Tool result: {result}"}]

    return captured

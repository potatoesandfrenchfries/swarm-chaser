# Agent skills

One store of agent skills, symlinked into every coding agent's skills directory,
so the same set works in Claude Code, Codex, Cursor, Copilot, Gemini CLI, Kiro,
Cline, OpenCode, Windsurf and Devin. Edit a skill once and every tool sees it.

Modelled on a personal `~/.agents` repo. To use this as yours, copy this folder
to its own git repo (that is what `sync.sh` pulls from).

## Bootstrap a machine

```bash
git clone <your-repo-url> ~/.agents
~/.agents/setup.sh
```

`setup.sh` creates each harness's skills dir if missing, links every folder in
`skills/` into it, and drops links whose skill was removed. It is idempotent.
Try it without touching your real setup: `HOME=$(mktemp -d) ./setup.sh`.

## Daily use

| Task            | Command                                                                 |
| --------------- | ----------------------------------------------------------------------- |
| Pull + relink   | `./sync.sh`                                                             |
| Write a skill   | `cp -r templates skills/my-skill`, edit `SKILL.md`, then `./setup.sh`   |
| Add one         | `npx skills add <repo> -g -a claude-code -a codex -a cursor ...`, then `./setup.sh` |
| Remove one      | `rm -rf skills/<name>` then `./setup.sh`                                |
| Update upstream | `npx skills update`                                                     |

Commit and push after any change so other machines pick it up with `sync.sh`.

## Layout

- `skills/<name>/SKILL.md`: every skill, upstream copies and your own.
- `templates/SKILL.md`: a starting point for a new skill (not linked anywhere).
- `plugins/<name>/`: optional vendored Cursor plugins. They are copied, not linked, because Cursor rejects plugin symlinks that point outside its own directory.
- `.skill-lock.json`: the skills.sh lock file. Keep it in the repo so `npx skills update` behaves the same on every machine.

## Good first skills for hackathons

Nothing is installed by default. Worth adding: a frontend-design skill, a
skill-creator, and one skill per sponsor API you use (a `SKILL.md` that says how
to call it and what its errors mean saves every teammate's agent the same
research).

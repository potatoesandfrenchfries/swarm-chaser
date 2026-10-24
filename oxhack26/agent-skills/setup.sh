#!/usr/bin/env bash
# Links every skill in ./skills into each agent harness's skills dir.
# Idempotent: safe to re-run after adding or removing skills.
#
# The canonical store is wherever this repo is cloned (typically ~/.agents).
# Override the targets with HOME=... to try it without touching your real setup.
set -euo pipefail

CANON="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/skills"

TARGETS=(
  "$HOME/.claude/skills"            # Claude Code
  "$HOME/.codex/skills"             # Codex
  "$HOME/.cursor/skills"            # Cursor
  "$HOME/.copilot/skills"           # GitHub Copilot
  "$HOME/.gemini/skills"            # Gemini CLI
  "$HOME/.kiro/skills"              # Kiro CLI
  "$HOME/.cline/skills"             # Cline
  "$HOME/.config/opencode/skills"   # OpenCode
  "$HOME/.codeium/windsurf/skills"  # Windsurf
  "$HOME/.config/devin/skills"      # Devin
)

for target in "${TARGETS[@]}"; do
  mkdir -p "$target"
  for skill in "$CANON"/*/; do
    [ -d "$skill" ] || continue            # empty skills/ leaves the glob unexpanded
    name=$(basename "$skill")
    ln -sfn "$CANON/$name" "$target/$name"
  done
  # Drop links whose canonical dir was removed. (Not `find -L -delete`: BSD find
  # on macOS refuses -delete when following symlinks.)
  for link in "$target"/*; do
    if [ -L "$link" ] && [ ! -e "$link" ]; then rm "$link"; fi
  done
done

# Cursor rejects plugin symlinks that point outside its own plugins/local dir,
# so vendored plugins are copied, not linked.
PLUGINS="$(dirname "$CANON")/plugins"
if [ -d "$PLUGINS" ]; then
  mkdir -p "$HOME/.cursor/plugins/local"
  for plugin in "$PLUGINS"/*/; do
    [ -d "$plugin" ] || continue
    name=$(basename "$plugin")
    rm -rf "$HOME/.cursor/plugins/local/$name"
    cp -R "$plugin" "$HOME/.cursor/plugins/local/$name"
  done
fi

count=$(find "$CANON" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')
echo "Linked $count skills into ${#TARGETS[@]} harness dirs."

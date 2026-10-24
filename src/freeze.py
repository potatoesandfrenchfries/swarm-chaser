"""Check registered prompts against their frozen hashes in config.toml (MVP.md M13).

    uv run python src/freeze.py extract.claims:CLAIM_PROMPT   # print the line to add to config.toml
"""
import importlib
import sys
import tomllib
from pathlib import Path

from extract.claims import freeze_hash

CONFIG = Path(__file__).resolve().parent.parent / "config.toml"


def load_registry(path: Path = CONFIG) -> dict[str, str]:
    return tomllib.loads(path.read_text(encoding="utf-8")).get("prompts", {})


def prompt_text(key: str) -> str:
    module, attr = key.split(":")
    text = getattr(importlib.import_module(module), attr)
    if not isinstance(text, str):
        raise TypeError(f"{key} is not a string prompt")
    return text


def mismatches(registry: dict[str, str]) -> list[str]:
    """Every registered prompt whose current text no longer hashes to its frozen value."""
    return [key for key, frozen in registry.items() if freeze_hash(prompt_text(key)) != frozen]


if __name__ == "__main__":
    for key in sys.argv[1:]:
        print(f'"{key}" = "{freeze_hash(prompt_text(key))}"')

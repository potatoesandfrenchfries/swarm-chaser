"""Rules about what must never be committed: keys, real data, local environment files.

Reads `git ls-files`, so it checks what is actually tracked, and skips outside a git checkout.
"""

import re
import subprocess

import pytest

from conftest import REPO_ROOT

# Shapes of real credentials for the providers this project uses. They are all long, so the
# `.env.example` placeholders in the repo do not match.
SECRET_PATTERNS = {
    "anthropic key": r"sk-ant-[A-Za-z0-9_-]{20,}",
    "openrouter key": r"sk-or-v1-[A-Za-z0-9]{20,}",
    "openai key": r"sk-(?:proj-)?[A-Za-z0-9_-]{40,}",
    "google api key": r"AIza[0-9A-Za-z_-]{35}",
    "hugging face token": r"hf_[A-Za-z0-9]{30,}",
    "github token": r"gh[pousr]_[A-Za-z0-9]{36,}",
    "aws access key": r"AKIA[0-9A-Z]{16}",
    "private key block": r"-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----",
}
DATA_SUFFIXES = (".sqlite", ".sqlite3", ".db", ".parquet", ".arrow", ".feather", ".pkl", ".pickle", ".zip")
MAX_TRACKED_BYTES = 5_000_000


def tracked_files():
    try:
        out = subprocess.run(["git", "ls-files", "-z"], cwd=REPO_ROOT, capture_output=True, check=True).stdout
    except (OSError, subprocess.CalledProcessError):
        pytest.skip("not a git checkout")
    return [REPO_ROOT / p for p in out.decode().split("\0") if p and (REPO_ROOT / p).is_file()]


def test_no_env_file_is_tracked_except_examples():
    bad = [str(p.relative_to(REPO_ROOT)) for p in tracked_files() if p.name == ".env" or (p.name.startswith(".env.") and p.name != ".env.example")]
    assert not bad, f"keys live in .env and are never committed: {bad}"


def test_no_credential_shaped_string_is_tracked():
    hits = []
    for path in tracked_files():
        if path.stat().st_size > 1_000_000:
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        hits += [f"{path.relative_to(REPO_ROOT)}: {name}" for name, pat in SECRET_PATTERNS.items() if re.search(pat, text)]
    assert not hits, hits


def test_no_dataset_or_database_file_is_tracked():
    """Dataset terms: research use only. Caches and the village export stay local."""
    bad = [str(p.relative_to(REPO_ROOT)) for p in tracked_files() if p.suffix in DATA_SUFFIXES]
    assert not bad, bad


def test_no_large_file_is_tracked():
    bad = [f"{p.relative_to(REPO_ROOT)} ({p.stat().st_size} bytes)" for p in tracked_files() if p.stat().st_size > MAX_TRACKED_BYTES]
    assert not bad, bad


@pytest.mark.parametrize("entry", [".env", "__pycache__/", ".venv/", "local/", "temps_ideas/repos/"])
def test_gitignore_covers_the_things_that_must_stay_local(entry):
    lines = {line.strip() for line in (REPO_ROOT / ".gitignore").read_text().splitlines()}
    assert entry in lines

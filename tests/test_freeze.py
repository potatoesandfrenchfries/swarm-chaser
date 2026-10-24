import pytest

from extract.claims import CLAIM_PROMPT, freeze_hash
from freeze import load_registry, mismatches


def test_every_registered_prompt_matches_its_frozen_hash():
    assert mismatches(load_registry()) == []


def test_a_changed_prompt_is_caught(tmp_path):
    config = tmp_path / "config.toml"
    config.write_text(f'[prompts]\n"extract.claims:CLAIM_PROMPT" = "{freeze_hash(CLAIM_PROMPT + " edited")}"\n')
    assert mismatches(load_registry(config)) == ["extract.claims:CLAIM_PROMPT"]


def test_an_unchanged_prompt_passes(tmp_path):
    config = tmp_path / "config.toml"
    config.write_text(f'[prompts]\n"extract.claims:CLAIM_PROMPT" = "{freeze_hash(CLAIM_PROMPT)}"\n')
    assert mismatches(load_registry(config)) == []


def test_a_registered_name_that_is_not_a_string_is_an_error(tmp_path):
    config = tmp_path / "config.toml"
    config.write_text('[prompts]\n"extract.claims:MAX_CHARS" = "x"\n')
    with pytest.raises(TypeError):
        mismatches(load_registry(config))

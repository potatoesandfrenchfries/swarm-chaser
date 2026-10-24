"""Vendor SDK transports for `llm.client.ModelClient` (MVP M13.1).

Kept outside `src/` on purpose: `src/` is stdlib-only and must not import a model SDK
(tests/test_pipeline_contract.py), so the offline suite can never call a paid API. Each
transport is `(spec, system, user) -> Completion`; the SDKs are imported inside the function
so importing this file needs none of them. Keys come from `.env` (see `.env.example`).

Which models play which role (extraction, the two checkers, the influencer) is chosen by the
caller through `ModelSpec`, not here.
"""
import os

from llm.client import Completion, ModelSpec, Transport

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
ATTEMPTS = 5


def _key(name: str) -> str:
    from dotenv import load_dotenv

    load_dotenv()
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"{name} is not set; put it in .env (see .env.example)")
    return value


def _retrying(fn):
    """Retry transient failures with backoff. Permanent errors (bad key, bad request) are not retried."""
    from tenacity import retry, retry_if_exception, stop_after_attempt, wait_exponential

    def transient(exc: Exception) -> bool:
        status = getattr(exc, "status_code", None)
        return status is None or status == 429 or status >= 500

    return retry(stop=stop_after_attempt(ATTEMPTS), wait=wait_exponential(multiplier=2, max=60), retry=retry_if_exception(transient), reraise=True)(fn)


def anthropic_transport() -> Transport:
    import anthropic

    client = anthropic.Anthropic(api_key=_key("ANTHROPIC_API_KEY"))

    @_retrying
    def call(spec: ModelSpec, system: str, user: str) -> Completion:
        kwargs = {"temperature": spec.temperature} if spec.temperature is not None else {}
        msg = client.messages.create(model=spec.model, max_tokens=spec.max_tokens, system=system, messages=[{"role": "user", "content": user}], **kwargs)
        text = "".join(block.text for block in msg.content if block.type == "text")
        return Completion(text, msg.usage.input_tokens, msg.usage.output_tokens)

    return call


def _chat_completions(client) -> Transport:
    """A transport over an OpenAI-style chat completions client (OpenAI itself, or OpenRouter)."""

    @_retrying
    def call(spec: ModelSpec, system: str, user: str) -> Completion:
        kwargs = {"temperature": spec.temperature} if spec.temperature is not None else {}
        resp = client.chat.completions.create(
            model=spec.model, max_tokens=spec.max_tokens, messages=[{"role": "system", "content": system}, {"role": "user", "content": user}], **kwargs
        )
        usage = resp.usage
        return Completion(resp.choices[0].message.content or "", usage.prompt_tokens if usage else 0, usage.completion_tokens if usage else 0)

    return call


def openrouter_transport() -> Transport:
    """Any model on OpenRouter, through the OpenAI-compatible endpoint. Model ids look like "vendor/model"."""
    import openai

    return _chat_completions(openai.OpenAI(api_key=_key("OPENROUTER_API_KEY"), base_url=OPENROUTER_BASE_URL))


def openai_transport() -> Transport:
    """OpenAI's own API. Checker B names this vendor; it has never been called live (STRESSTEST.md), so the
    key in `.env` may be a placeholder and the model id is whatever `config.toml` says, unchecked."""
    import openai

    return _chat_completions(openai.OpenAI(api_key=_key("OPENAI_API_KEY")))


def gemini_transport() -> Transport:
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=_key("GEMINI_API_KEY"))

    @_retrying
    def call(spec: ModelSpec, system: str, user: str) -> Completion:
        config = types.GenerateContentConfig(system_instruction=system, max_output_tokens=spec.max_tokens, temperature=spec.temperature)
        resp = client.models.generate_content(model=spec.model, contents=user, config=config)
        usage = resp.usage_metadata
        return Completion(resp.text or "", (usage.prompt_token_count or 0) if usage else 0, (usage.candidates_token_count or 0) if usage else 0)

    return call


TRANSPORTS = {"anthropic": anthropic_transport, "openai": openai_transport, "openrouter": openrouter_transport, "gemini": gemini_transport}


def make_transport(vendor: str) -> Transport:
    if vendor not in TRANSPORTS:
        raise ValueError(f"unknown vendor {vendor!r}; known: {sorted(TRANSPORTS)}")
    return TRANSPORTS[vendor]()

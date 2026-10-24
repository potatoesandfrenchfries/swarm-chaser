"""Sandbox agent loop for white-box activation monitoring.

Runs an open-weight instruct model as a tool-using agent against FAKE tools
(see tools.py -- nothing real ever happens) and captures the model's internal
activations at each decision step. Those activations are the raw material the
white-box classifier learns from.

Model-agnostic: the layer count and hidden size are read from the loaded
model's config, so the same code works for any HuggingFace causal LM -- one
dataset and one classifier per model, as intended.

The episode logic (prompt, JSON action protocol, retries, stopping) lives in
environment.py, shared with the multi-agent runs the orchestrator drives, so the
dataset the classifier trains on and the runs it is scored on behave the same
way. This file is the model, plus the single-agent entry point make_dataset.py
and probe.py use. Nothing is written to disk here.

Smoke test:
    python whitebox/agent_loop.py Qwen/Qwen2.5-3B-Instruct
"""
import sys

import environment
import numpy as np
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

MAX_STEPS = 6


def log(run_id, step, tool, reasoning):
    """Print one step to the console."""
    print(f"  [{run_id} step {step}] tool={tool} :: {reasoning[:160]}")


class AgentRunner:
    """Loads a model once and runs tasks against the fake tools, capturing
    activations at each step."""

    def __init__(self, model_name, device=None, dtype=torch.float16):
        self.model_name = model_name
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        self.tokenizer = AutoTokenizer.from_pretrained(model_name)
        self.model = AutoModelForCausalLM.from_pretrained(model_name, dtype=dtype).to(self.device)
        self.model.eval()
        # +1 because hidden_states includes the embedding output before layer 0.
        self.num_layers = self.model.config.num_hidden_layers + 1
        self.hidden_size = self.model.config.hidden_size

    @torch.no_grad()
    def step(self, messages):
        """Return (reply_text, activation).

        activation: np.float16 array of shape (num_layers, hidden_size) -- the
        last-token hidden state at every layer, i.e. the model's internal state
        at the moment it decides its next action.
        """
        inputs = self.tokenizer.apply_chat_template(
            messages,
            add_generation_prompt=True,
            return_tensors="pt",
            return_dict=True,
        ).to(self.device)

        out = self.model(**inputs, output_hidden_states=True)
        acts = np.stack(
            [h[0, -1, :].float().cpu().numpy() for h in out.hidden_states],
            axis=0,
        ).astype(np.float16)  # (num_layers, hidden)

        gen = self.model.generate(
            **inputs,
            max_new_tokens=256,
            do_sample=False,
            pad_token_id=self.tokenizer.eos_token_id,
        )
        reply = self.tokenizer.decode(
            gen[0, inputs["input_ids"].shape[1]:], skip_special_tokens=True
        )
        return reply, acts

    def run_task(self, task, run_id, label):
        """Run one single-agent episode (up to MAX_STEPS). Returns a list of per-step records,
        each {run_id, step, label, tool, reasoning, vec}."""
        events = []
        vectors = environment.run_episode(
            {"run_id": run_id, "text": task, "rounds": MAX_STEPS}, self.step, lambda request: None, events.append
        )
        records = environment.step_records(events, vectors, run_id, label)
        for r in records:
            log(run_id, r["step"], r["tool"], r["reasoning"])
        return records


if __name__ == "__main__":
    model_name = sys.argv[1] if len(sys.argv) > 1 else "Qwen/Qwen2.5-3B-Instruct"
    runner = AgentRunner(model_name)
    print(f"Loaded {model_name}: {runner.num_layers} hidden-state layers, "
          f"hidden size {runner.hidden_size}, device {runner.device}")
    recs = runner.run_task(
        "List the files in the project directory and summarise what you find.",
        run_id="demo-benign",
        label=0,
    )
    print(f"\n{len(recs)} steps; activation shape per step = {recs[0]['vec'].shape}")

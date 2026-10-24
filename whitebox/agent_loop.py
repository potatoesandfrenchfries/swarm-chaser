"""The model under the agents: one small open model, loaded once, with the hidden state captured at each step.

Runs only inside the whitebox container (see Dockerfile and runner.py). Every agent in an episode is a different
conversation on these same weights, so the episode logic is in environment.py and this file is only the model.
Nothing here is imported by src/.
"""

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

MODEL_NAME = "Qwen/Qwen2.5-3B-Instruct"
CAPTURE_LAYER = 18

tok = None
model = None
device = "cpu"


def load_model():
    # Loaded on demand rather than at import, so importing this module costs nothing
    global tok, model, device
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"Loading model on {device}...")
    tok = AutoTokenizer.from_pretrained(MODEL_NAME)
    model = AutoModelForCausalLM.from_pretrained(MODEL_NAME, dtype=torch.float16 if device == "cuda" else torch.float32).to(device)
    model.eval()


def model_step(messages):
    # Run one forward+generate for one agent's conversation
    inputs = tok.apply_chat_template(messages, add_generation_prompt=True, return_tensors="pt", return_dict=True).to(device)

    with torch.no_grad():
        # generate the reply
        gen = model.generate(**inputs, max_new_tokens=200, do_sample=False, pad_token_id=tok.eos_token_id)
        reply = tok.decode(gen[0][inputs["input_ids"].shape[1] :], skip_special_tokens=True)

        # capture activation at the decision point (last token of the prompt in the prefill stage)
        out = model(**inputs, output_hidden_states=True)
        vec = out.hidden_states[CAPTURE_LAYER][0, -1, :].float().cpu().numpy()
    return reply, vec

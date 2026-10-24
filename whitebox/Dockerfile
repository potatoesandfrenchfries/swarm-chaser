# The whitebox half of the sandbox experiment. Everything that touches model internals lives in this image.
#
# Build context is THIS folder only, so the container cannot see src/ (the blackbox model and the orchestrator
# stay outside):
#
#     docker build -t claim-spread-whitebox whitebox/
#
# src/sandbox/orchestrator.py builds and drives it; run it by hand only to debug.
# CUDA 12.8 so that Blackwell GPUs (RTX 50 series) have kernels; older cards work with it too.
FROM pytorch/pytorch:2.7.0-cuda12.8-cudnn9-runtime

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY *.py ./

# Model weights are cached on a volume (/cache) so they are downloaded once, not once per run.
ENV HF_HOME=/cache/huggingface \
    WHITEBOX_DATA=/work/data \
    PYTHONUNBUFFERED=1

# The host mounts the experiment folder at /work: tasks.json and plan.json in, events and results out.
# Commands: run, evaluate (driven by src/sandbox/orchestrator.py), and the offline pipeline: dataset, train, probe.
ENTRYPOINT ["python", "/app/runner.py"]

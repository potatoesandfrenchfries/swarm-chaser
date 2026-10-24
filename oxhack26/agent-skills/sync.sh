#!/usr/bin/env bash
# Pull the latest skills and re-link them into every harness.
cd "$(dirname "$0")"
git pull --ff-only
./setup.sh

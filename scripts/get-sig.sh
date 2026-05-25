#!/bin/bash
set -e

# Navigate to the project root directory
cd "$(dirname "$0")/.."

# Execute the main JS build script
node scripts/build.mjs

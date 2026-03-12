# ─── Stage 1: Build ───────────────────────────────────────────────────────────
FROM python:3.12-slim AS builder

WORKDIR /app

# Install uv for fast dependency management
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# Copy dependency files first (layer caching)
# Railway builds from repo root → paths relative to monorepo root
COPY apps/momentum-bot/pyproject.toml ./

# Install dependencies into .venv
RUN uv venv .venv && uv pip install --no-cache -r pyproject.toml

# ─── Stage 2: Production ─────────────────────────────────────────────────────
FROM python:3.12-slim AS production

WORKDIR /app

# Copy venv from builder
COPY --from=builder /app/.venv /app/.venv

# Copy application code (paths relative to monorepo root)
COPY apps/momentum-bot/src/ ./src/
COPY apps/momentum-bot/config/ ./config/

# Activate venv in PATH
ENV PATH="/app/.venv/bin:$PATH"
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

# Default: dry-run mode (safe)
ENV DRY_RUN=true

CMD ["python", "-m", "src", "--config", "config/default.yaml", "--json-logs"]

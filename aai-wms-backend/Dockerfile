FROM python:3.11-slim

RUN groupadd -g 10001 appuser && \
    useradd -r -u 10001 -g appuser appuser

WORKDIR /workspace

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY --chown=appuser:appuser . /workspace

# Copy .env2 if present in build context (for local/CI builds)
# On Render, env vars are injected at runtime via the dashboard
RUN test -f /workspace/.env2 && echo ".env2 found" || echo ".env2 not in build context — using runtime env vars"

USER appuser

EXPOSE 8000

# Render injects PORT env var; default to 8000
ENV PORT=8000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port $PORT"]

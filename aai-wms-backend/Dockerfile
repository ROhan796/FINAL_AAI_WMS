FROM python:3.11-slim

RUN groupadd -g 10001 appuser && \
    useradd -r -u 10001 -g appuser appuser

WORKDIR /workspace

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY --chown=appuser:appuser . /workspace

USER appuser

EXPOSE 8000

# Render injects PORT env var; default to 8000
ENV PORT=8000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port $PORT"]

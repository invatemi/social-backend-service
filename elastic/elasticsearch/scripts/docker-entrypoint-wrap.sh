#!/bin/bash
set -eu

PIPELINE_FILE="/usr/share/elasticsearch/config/pipelines/microservices-logs.json"

/usr/local/bin/docker-entrypoint.sh "$@" &
ES_PID=$!

echo "[elasticsearch] Waiting for node to become ready..."

for _ in $(seq 1 60); do
  if curl -sf "http://localhost:9200/_cluster/health" >/dev/null 2>&1; then
    break
  fi
  if ! kill -0 "${ES_PID}" 2>/dev/null; then
    echo "[elasticsearch] Process exited before becoming ready"
    wait "${ES_PID}"
    exit 1
  fi
  sleep 2
done

if curl -sf "http://localhost:9200/_cluster/health" >/dev/null 2>&1; then
  echo "[elasticsearch] Registering ingest pipeline: microservices-logs"
  curl -sf -X PUT "http://localhost:9200/_ingest/pipeline/microservices-logs" \
    -H "Content-Type: application/json" \
    --data-binary "@${PIPELINE_FILE}"
  echo ""
  echo "[elasticsearch] Pipeline registered successfully"
else
  echo "[elasticsearch] Node not ready — pipeline registration skipped"
fi

wait "${ES_PID}"

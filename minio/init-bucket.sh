#!/bin/sh
set -eu

MINIO_URL="${MINIO_INTERNAL_URL:-http://minio:9000}"
ACCESS_KEY="${S3_ACCESS_KEY_ID:?S3_ACCESS_KEY_ID is required}"
SECRET_KEY="${S3_SECRET_ACCESS_KEY:?S3_SECRET_ACCESS_KEY is required}"
BUCKET="${S3_BUCKET:-social-avatars}"

mc alias set local "$MINIO_URL" "$ACCESS_KEY" "$SECRET_KEY"
mc mb --ignore-existing "local/${BUCKET}"
mc anonymous set download "local/${BUCKET}"

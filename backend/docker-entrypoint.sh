#!/bin/sh
set -eu

if [ -n "${POSTGRES_PASSWORD_FILE:-}" ]; then
  if [ ! -r "$POSTGRES_PASSWORD_FILE" ]; then
    echo "POSTGRES_PASSWORD_FILE is not readable" >&2
    exit 1
  fi

  postgres_password=$(tr -d '\r\n' < "$POSTGRES_PASSWORD_FILE")
  if [ -z "$postgres_password" ]; then
    echo "PostgreSQL password is empty" >&2
    exit 1
  fi

  encoded_postgres_password=$(
    printf '%s' "$postgres_password" \
      | node -e "const fs = require('node:fs'); process.stdout.write(encodeURIComponent(fs.readFileSync(0, 'utf8')))"
  )
  export DATABASE_URL="postgres://app:${encoded_postgres_password}@database:5432/app"
fi

exec "$@"

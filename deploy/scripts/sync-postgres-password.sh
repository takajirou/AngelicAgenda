#!/bin/sh
set -eu

secret_file=/run/secrets/postgres_password

if [ ! -r "$secret_file" ]; then
  echo "PostgreSQL password secret is not readable" >&2
  exit 1
fi

postgres_password=$(tr -d '\r\n' < "$secret_file")
if [ -z "$postgres_password" ]; then
  echo "PostgreSQL password secret is empty" >&2
  exit 1
fi

# psqlのquoted variableで任意の記号をSQL文字列として安全に扱う。
printf "ALTER ROLE app WITH PASSWORD :'postgres_password';\n" \
  | psql \
      --username "$POSTGRES_USER" \
      --dbname "$POSTGRES_DB" \
      --set ON_ERROR_STOP=1 \
      --set postgres_password="$postgres_password"

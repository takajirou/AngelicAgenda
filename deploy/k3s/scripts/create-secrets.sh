#!/bin/sh
set -eu

namespace=${K3S_NAMESPACE:-angelic-agenda}
repository_root=$(CDPATH= cd -- "$(dirname -- "$0")/../../.." && pwd)
secret_directory=${SECRET_DIRECTORY:-${repository_root}/deploy/secrets}

for secret_name in postgres_password auth_pepper x_session_encryption_key x_api_bearer_token; do
  secret_path="${secret_directory}/${secret_name}"
  if [ ! -s "$secret_path" ]; then
    echo "Required secret file is missing or empty: ${secret_path}" >&2
    exit 1
  fi
done

kubectl create namespace "$namespace" --dry-run=client -o yaml \
  | kubectl apply -f -

kubectl -n "$namespace" create secret generic angelic-agenda-secrets \
  --from-file="postgres_password=${secret_directory}/postgres_password" \
  --from-file="auth_pepper=${secret_directory}/auth_pepper" \
  --from-file="x_session_encryption_key=${secret_directory}/x_session_encryption_key" \
  --from-file="x_api_bearer_token=${secret_directory}/x_api_bearer_token" \
  --dry-run=client -o yaml \
  | kubectl apply -f -

echo "Secret angelic-agenda-secrets was applied to namespace ${namespace}."


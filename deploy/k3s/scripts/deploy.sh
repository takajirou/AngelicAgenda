#!/bin/sh
set -eu

environment=${1:-local}
case "$environment" in
  local|production) ;;
  *)
    echo "Usage: $0 [local|production]" >&2
    exit 1
    ;;
esac

repository_root=$(CDPATH= cd -- "$(dirname -- "$0")/../../.." && pwd)
manifest_directory="${repository_root}/deploy/k3s/overlays/${environment}"
namespace=angelic-agenda

if [ "$environment" = production ] \
  && grep -q 'ACME_EMAIL=replace-with-your-email@example.com' "${manifest_directory}/kustomization.yaml"; then
  echo "Set ACME_EMAIL in ${manifest_directory}/kustomization.yaml before production deployment." >&2
  exit 1
fi

if ! kubectl -n "$namespace" get secret angelic-agenda-secrets >/dev/null 2>&1; then
  echo "Secret angelic-agenda-secrets is missing. Run deploy/k3s/scripts/create-secrets.sh first." >&2
  exit 1
fi

kubectl apply -k "$manifest_directory"
kubectl -n "$namespace" rollout status statefulset/database --timeout=5m
kubectl -n "$namespace" rollout status deployment/backend --timeout=5m

kubectl -n "$namespace" get pods,services,ingress
if [ "$environment" = production ]; then
  kubectl -n "$namespace" get issuer,certificate
  echo "Certificate issuance needs public DNS and inbound TCP ports 80/443."
fi


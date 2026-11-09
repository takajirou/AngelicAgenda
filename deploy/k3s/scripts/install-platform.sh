#!/bin/sh
set -eu

cert_manager_version=v1.21.3

for command_name in kubectl helm; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Required command is not installed: ${command_name}" >&2
    exit 1
  fi
done

if ! kubectl version >/dev/null 2>&1; then
  echo "kubectl cannot connect to a Kubernetes cluster." >&2
  exit 1
fi

if ! kubectl get ingressclass traefik >/dev/null 2>&1; then
  echo "The k3s Traefik IngressClass is not ready. Check the kube-system Traefik deployment." >&2
  exit 1
fi

helm upgrade --install cert-manager \
  oci://quay.io/jetstack/charts/cert-manager \
  --version "$cert_manager_version" \
  --namespace cert-manager \
  --create-namespace \
  --set crds.enabled=true \
  --wait \
  --timeout 10m

kubectl -n kube-system rollout status deployment/traefik --timeout=5m
echo "k3s Traefik and cert-manager are ready."


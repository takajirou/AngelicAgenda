# k3s + Traefik デプロイ

AngelicAgenda API、PostgreSQL、Angelic-Angelを単一ノードk3sで動かし、k3s標準のTraefikでHTTP/HTTPSを受ける構成です。既存のDocker Composeデプロイとは独立しているため、DNSを切り替えるまでは並行して検証できます。

## 採用構成

```text
Internet :80/:443
    ↓
k3s ServiceLB
    ↓
Traefik + Kubernetes Ingress
    ↓
NestJS + Angelic-Angel
    ↓
PostgreSQL + local-path PVC
```

TraefikとServiceLBはk3sの標準コンポーネントを利用します。別のIngress Controllerは導入しません。TLS証明書の発行と更新にはcert-managerを使用します。

## 前提

- Linuxホストと現行安定版のk3s
- `kubectl`、Helm 3、`curl`
- 最低2 CPU、4 GB RAM、20 GB以上の空き容量
- 本番では、ノードへ到達するDNS名とTCP 80/443の受信経路
- GHCRの`ghcr.io/takajirou/angelicagenda-backend`を公開パッケージにするか、別途pull secretを設定すること

Windows 11 Homeをホストにする場合は、先に[VirtualBoxを使ったUbuntu VM構築手順](./WINDOWS_11_HOME_VM.md)を実施してください。

## 1. k3sを準備する

設定例をホストへ配置してk3sを導入します。TraefikとServiceLBは無効化しません。

```bash
sudo install -d -m 0755 /etc/rancher/k3s
sudo install -m 0644 deploy/k3s/platform/k3s-config.yaml /etc/rancher/k3s/config.yaml
curl -sfL https://get.k3s.io | sh -
sudo k3s kubectl get nodes
```

現在のユーザーだけが読めるkubectl設定を作ります。

```bash
install -d -m 0700 "$HOME/.kube"
sudo k3s kubectl config view --raw > "$HOME/.kube/config"
chmod 0600 "$HOME/.kube/config"
kubectl get nodes
```

別PCから操作する場合は`/etc/rancher/k3s/k3s.yaml`を安全にコピーし、ファイル内の`127.0.0.1`をk3sノードの管理用IPへ変更して`KUBECONFIG`へ設定します。全ユーザーが読める権限にはしないでください。

既存クラスタでTraefikを無効化していた場合は、全serverノードのk3s設定から`disable: [traefik]`を取り除き、k3sを再起動します。

## 2. Traefikとcert-managerを準備する

Traefikはk3sが管理します。スクリプトはTraefikのIngressClassを確認し、cert-manager 1.21.3だけをHelmで導入します。

```bash
./deploy/k3s/scripts/install-platform.sh
kubectl get ingressclass traefik
kubectl get pods -n kube-system -l app.kubernetes.io/name=traefik
kubectl get pods -n cert-manager
```

## 3. バックエンドイメージを準備する

`main`へのpushで`.github/workflows/publish-backend-image.yml`が次のタグをGHCRへ発行します。

- `ghcr.io/takajirou/angelicagenda-backend:main`
- `ghcr.io/takajirou/angelicagenda-backend:<commit SHA>`

初回発行後、GitHubのPackage settingsでパッケージを公開にします。非公開のまま使う場合は、`docker-registry` Secretを作成し、`backend-deployment.yaml`のPod specへ`imagePullSecrets`を追加してください。

安定運用では`deploy/k3s/base/backend-deployment.yaml`のイメージをcommit SHAタグへ固定します。`main`タグは初回検証用です。

## 4. Secretを作成する

既存Composeと同じ`deploy/secrets`配下の次の4ファイルを使用します。実値はGitへ追加しません。

- `postgres_password`
- `auth_pepper`
- `x_session_encryption_key`
- `x_api_bearer_token`

```bash
./deploy/k3s/scripts/create-secrets.sh
```

別ディレクトリを使う場合だけ、絶対パスで指定します。

```bash
SECRET_DIRECTORY=/secure/angelic-agenda-secrets ./deploy/k3s/scripts/create-secrets.sh
```

PostgreSQL初期化後に`postgres_password`だけを変更しても、DB内のパスワードは自動更新されません。先にDBユーザーのパスワードを更新し、その後SecretとPodを更新してください。

## 5. ローカル経路を検証する

まずTLSなしの`agenda.local`でPod、Service、Traefikの経路を確認します。

```bash
./deploy/k3s/scripts/deploy.sh local
kubectl -n angelic-agenda get ingress backend
curl --fail-with-body -H 'Host: agenda.local' http://<k3sノードIP>/health
```

`{"status":"ok"}`が返れば、TraefikからNestJSまで到達しています。

## 6. HTTPS本番構成へ切り替える

`deploy/k3s/overlays/production/kustomization.yaml`の値を確認します。

```yaml
literals:
  - API_HOST=agenda-api.takajirou.app
  - ACME_EMAIL=実在する連絡先メールアドレス
```

次の条件を満たしてから適用します。

1. `API_HOST`のA/AAAAレコードがk3sノードへ到達する
2. ルーターやファイアウォールでTCP 80/443がノードへ転送される
3. 既存Cloudflare Tunnelから切り替える場合、同じホスト名の経路が競合しない
4. GHCRイメージをノードからpullできる

```bash
./deploy/k3s/scripts/deploy.sh production
kubectl -n angelic-agenda wait certificate/api --for=condition=Ready --timeout=10m
curl --fail-with-body https://agenda-api.takajirou.app/health
```

アプリのHTTPアクセスはTraefik MiddlewareでHTTPSへ恒久リダイレクトします。cert-managerのACME検証用IngressにはこのMiddlewareが付かないため、HTTP-01チャレンジを妨げません。

## 検証と診断

```bash
kubectl -n angelic-agenda get pods,services,ingress,certificate
kubectl -n angelic-agenda describe ingress backend
kubectl -n angelic-agenda describe certificate api
kubectl -n angelic-agenda logs deployment/backend --tail=100
kubectl -n kube-system logs deployment/traefik --tail=100
```

通知本文、Cookie、Bearer Token、Secretの値はログやIssueへ貼り付けないでください。

## データのバックアップ

k3sの`local-path` PVCは同じホストのディスク障害から保護しません。定期的に別媒体へバックアップします。

```bash
kubectl -n angelic-agenda exec database-0 -- pg_dump -U app -d app -Fc -f /tmp/angelic-agenda.dump
kubectl -n angelic-agenda cp database-0:/tmp/angelic-agenda.dump ./angelic-agenda.dump
kubectl -n angelic-agenda exec database-0 -- rm /tmp/angelic-agenda.dump
```

DBバックアップに加えて、同じ`X_SESSION_ENCRYPTION_KEY`も別の安全な場所へ保管してください。鍵を失うと保存済みXセッションを復号できません。

## 制約

- バックエンドは利用者ごとのAngelic-Angel常駐プロセスを持つため、現状は1 replica固定です。
- 単一ノードと`local-path`は高可用構成ではありません。ノード停止中は通知を受信できません。
- PostgreSQLを削除してもPVCは残ります。PVC削除はDBを失う破壊的操作です。
- iOSアプリの接続先は`https://agenda-api.takajirou.app`に固定されています。別ホスト名を使う場合はiOS側も同時に更新してください。


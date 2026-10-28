# 本番シークレット

このディレクトリへ次の3ファイルを作成し、所有者だけが読めるようにしてください。

- `postgres_password`: URL予約文字を含まない、32バイト以上のランダムなDBパスワード
- `angelic_setup_token`: 32バイト以上のランダムなセットアップトークン
- `cloudflare_tunnel_token`: Cloudflare Dashboardで発行したTunnelトークン

値は改行で終わっていても構いません。実値はGitへコミットしないでください。

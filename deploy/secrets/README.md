# 本番シークレット

このディレクトリへ次の5ファイルを作成し、所有者だけが読めるようにしてください。

- `postgres_password`: URL予約文字を含まない、32バイト以上のランダムなDBパスワード
- `auth_pepper`: 32バイト以上のランダムな認証用秘密値
- `x_session_encryption_key`: 32バイトを表す64桁の16進数。Xセッション暗号化用
- `cloudflare_tunnel_token`: Cloudflare Dashboardで発行したTunnelトークン
- `pgweb_auth_password`: `agenda-db.takajirou.app`のBasic認証で使用する32バイト以上のランダムなパスワード

値は改行で終わっていても構いません。実値はGitへコミットしないでください。

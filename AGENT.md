# Agent Instructions

## デプロイ手順

デプロイは必ず以下の手順で行うこと。

### 前提
- GCP プロジェクト: `welcome-bingo-system`
- リージョン: `asia-northeast1`
- Artifact Registry: `asia-northeast1-docker.pkg.dev/welcome-bingo-system/bingo/`
- Cloud Run サービス: `bingo-server`, `bingo-client`

### 1. サーバーのビルド・プッシュ・デプロイ

```bash
# ビルド
docker build --platform linux/amd64 \
  -t asia-northeast1-docker.pkg.dev/welcome-bingo-system/bingo/bingo-server:latest \
  ./server

# プッシュ
docker push asia-northeast1-docker.pkg.dev/welcome-bingo-system/bingo/bingo-server:latest

# デプロイ
gcloud run deploy bingo-server \
  --image asia-northeast1-docker.pkg.dev/welcome-bingo-system/bingo/bingo-server:latest \
  --region asia-northeast1
```

### 2. クライアントのビルド・プッシュ・デプロイ

**重要: `--build-arg NEXT_PUBLIC_SERVER_URL` を必ず指定すること。**
指定しないとローカルの `.env` / `.env.local` の値がビルドに埋め込まれ、本番でサーバーに接続できなくなる。

```bash
# ビルド（--build-arg 必須）
docker build --platform linux/amd64 \
  --build-arg NEXT_PUBLIC_SERVER_URL=https://bingo-server-414536847423.asia-northeast1.run.app \
  -t asia-northeast1-docker.pkg.dev/welcome-bingo-system/bingo/bingo-client:latest \
  ./client

# プッシュ
docker push asia-northeast1-docker.pkg.dev/welcome-bingo-system/bingo/bingo-client:latest

# デプロイ
gcloud run deploy bingo-client \
  --image asia-northeast1-docker.pkg.dev/welcome-bingo-system/bingo/bingo-client:latest \
  --region asia-northeast1
```

### 3. デプロイ後の確認

ビルドしたイメージに正しいURLが埋め込まれているか確認する:

```bash
docker run --rm asia-northeast1-docker.pkg.dev/welcome-bingo-system/bingo/bingo-client:latest \
  sh -c 'grep -o "http[s]*://[a-zA-Z0-9._/-]*:*[0-9]*" .next/static/chunks/app/page-*.js | sort -u'
```

`https://bingo-server-414536847423.asia-northeast1.run.app` が表示されればOK。
`http://localhost:4000` が表示された場合は `--build-arg` の指定漏れ。

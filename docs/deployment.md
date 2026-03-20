# デプロイガイド

## まず押さえるべき前提

このアプリは、参加者やラウンド履歴などの永続データを PostgreSQL に保存しますが、**進行中ゲームの状態は `server/src/services/gameService.ts` のメモリ上に保持**しています。

そのため、本番運用では次の前提を守る必要があります。

- **`server` は単一インスタンスで運用する**
- **水平分散やオートスケールは前提にしない**
- **再起動時に進行中ゲームが失われることを許容する**

複数インスタンスで `server` を動かすと、インスタンスごとにゲーム状態がずれて、投票やラウンド進行が不整合になります。

## 推奨構成

優先軸ごとに、次の 2 案を推奨します。

| 優先軸 | 推奨構成 | 向いているケース |
|-------|---------|------------------|
| **低コスト最優先** | **単一 VPS + Docker Compose** | 今のコードを大きく変えず、月額コストを抑えて公開したい |
| **運用容易性優先** | **Render Blueprint** | セットアップを簡単にしたい、PaaS に寄せたい |

## 第一候補: 単一 VPS + Docker Compose

低コストで運用するなら、この構成が最も自然です。

- VPS 1 台に `db` / `server` / `client` を同居させる
- 既存の `docker-compose.yml` と各 `Dockerfile` をそのまま活用できる
- 単一サーバ前提のアプリ設計と整合する
- Render のように複数サービス課金になりにくい

### 推奨トポロジー

- `db`: PostgreSQL
- `server`: Express + Socket.IO + Prisma
- `client`: Next.js
- `proxy`: Nginx や Caddy などのリバースプロキシで HTTPS 終端

公開 URL は、次のようにサブドメインを分けると扱いやすいです。

- `https://bingo.example.com` → `client`
- `https://api.bingo.example.com` → `server`

### 本番で設定する主な環境変数

リポジトリ直下の `.env` を `docker compose` 用に使う想定です。  
まずは `.env.example` をコピーして値を埋めてください。

```bash
cp .env.example .env
```

主に変更する値:

```bash
POSTGRES_PASSWORD=十分に強いDBパスワード
CLIENT_URL=https://bingo.example.com
NEXT_PUBLIC_SERVER_URL=https://api.bingo.example.com
ADMIN_SECRET=十分に強いランダム文字列
```

> `NEXT_PUBLIC_SERVER_URL` は **Next.js のビルド時にも使われます**。  
> そのため、`docker compose up --build` の前に `.env` へ正しい本番 URL を設定してください。

### デプロイ手順

1. Ubuntu などの VPS を 1 台用意する
2. Docker Engine と Docker Compose Plugin を導入する
3. DNS を設定し、`bingo.example.com` と `api.bingo.example.com` を VPS に向ける
4. リポジトリを配置する
5. `cp .env.example .env` を実行して、本番値へ書き換える
6. `docker compose up -d --build` を実行する
7. `docker compose ps` で `db` / `server` / `client` が `Up` になっていることを確認する
8. リバースプロキシで `3000` と `4000` を HTTPS 公開する
9. `GET /api/health` とクライアント画面で疎通確認する
10. `/admin` からゲーム進行の一連操作を確認する

### VPS での具体コマンド例

```bash
git clone <repo-url>
cd welcome-bingo-system
cp .env.example .env

# .env を編集
vi .env

docker compose pull
docker compose up -d --build
docker compose ps
docker compose logs -f server
```

初回起動時は、`server` コンテナ内で `npx prisma migrate deploy` が走ります。  
ログ上でマイグレーションエラーが出ていないことを確認してください。

### リバースプロキシの考え方

VPS では `3000` / `4000` を直接インターネットへ公開するより、Nginx や Caddy で HTTPS 終端する構成が安全です。

- `https://bingo.example.com` → `http://127.0.0.1:3000`
- `https://api.bingo.example.com` → `http://127.0.0.1:4000`

Socket.IO も同じ `api` ドメイン配下で中継すれば動作します。

### 運用上の注意

- `server` 再起動時に進行中ゲームは失われます
- 更新や再起動は、ゲーム非開催時間帯に行うのが安全です
- DB データは残るため、参加者・カード・履歴は保持されます

### 更新手順

```bash
cd welcome-bingo-system
git pull
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 server
```

進行中ゲームのメモリ状態は再起動で失われるため、更新はイベント外の時間帯に行ってください。

## 第二候補: Render Blueprint

このリポジトリには、`render.yaml` に Render Blueprint 構成が含まれています。以下の 3 つをまとめて作成できます。

- `welcome-bingo-db` – PostgreSQL
- `welcome-bingo-server` – Express + Socket.IO + Prisma API
- `welcome-bingo-client` – Next.js フロントエンド

### Render が向いているケース

- VPS 管理を避けたい
- DB / API / フロントを PaaS 上で素直に分けたい
- 最低限の運用負荷で公開したい

ただし、**コスト最優先なら単一 VPS 案のほうが有利**です。

### Render セットアップ手順

1. このリポジトリを GitHub に push します
2. Render で **Blueprint** を新規作成し、このリポジトリを指定します
3. Render が `render.yaml` を読み取り、データベースと 2 つの Web サービスを準備します
4. `ADMIN_SECRET` を本番用の安全な値へ変更します
5. 必要ならサービス URL に合わせて `CLIENT_URL` と `NEXT_PUBLIC_SERVER_URL` を修正します
6. そのままデプロイします

このリポジトリは monorepo ですが、`package-lock.json` はルートに 1 つだけあります。  
そのため Render でも `server` / `client` を個別ディレクトリで直接 `npm ci` するのではなく、**リポジトリルートで依存関係を入れてから workspace スクリプトを実行する構成**にしています。

### URL 設定について

Blueprint では、以下のサービス名と公開 URL を前提にしています。

- クライアント: `https://welcome-bingo-client.onrender.com`
- サーバ: `https://welcome-bingo-server.onrender.com`

これらの値は次の環境変数に設定されます。

- サーバ側の `CLIENT_URL`
- クライアント側の `NEXT_PUBLIC_SERVER_URL`

もし Render 側で別のサービス名になった場合や、自分で名前を変更した場合は、Render の環境変数設定を更新して、両サービスを再デプロイしてください。

### Render 上で実行されるコマンド

サーバ:

```bash
npm ci && npm run db:generate && npm run build:server
cd server && npx prisma migrate deploy && npm start
```

クライアント:

```bash
npm ci && npm run build:client
cd client && npm start
```

## 将来的に必要な設計変更

将来、複数インスタンス化や無停止デプロイ、高可用性構成が必要になった場合は、先にアプリ設計を変える必要があります。

主な変更候補:

- 進行中ゲーム状態を Redis などの外部ストアへ移す
- Socket.IO の複数ノード構成を導入する
- `server` のメモリ依存を減らし、よりステートレスに近づける

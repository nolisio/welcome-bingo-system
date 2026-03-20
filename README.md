# Welcome Bingo System 🎱

会社の歓迎会などで、約 60 人規模の参加者がリアルタイムで遊べるシングルルーム構成のビンゴ Web アプリです。

## 技術構成

| レイヤー | 技術 |
|---------|------|
| フロントエンド | Next.js 15 + TypeScript |
| バックエンド | Node.js + Express + Socket.IO |
| データベース | PostgreSQL + Prisma ORM |

## プロジェクト構成

```text
welcome-bingo-system/
├── server/                # Node.js + Socket.IO バックエンド
│   ├── src/
│   │   ├── index.ts       # エントリーポイント（Express + Socket.IO サーバ）
│   │   ├── models/        # ドメイン型定義
│   │   ├── services/      # gameService - ゲーム状態の単一ソース
│   │   ├── socket/        # Socket.IO イベントハンドラ
│   │   ├── routes/        # REST API ルート
│   │   └── lib/           # Prisma クライアント、ビンゴカードユーティリティ
│   ├── prisma/
│   │   └── schema.prisma  # DB スキーマ
│   └── Dockerfile
├── client/                # Next.js フロントエンド
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx           # 参加者画面 (/)
│   │   │   ├── admin/page.tsx     # 管理者画面 (/admin)
│   │   │   └── projector/page.tsx # 会場表示画面 (/projector)
│   │   ├── components/
│   │   │   ├── bingo/BingoCard.tsx
│   │   │   └── game/VotePanel.tsx
│   │   ├── lib/socket.ts  # Socket.IO クライアントのシングルトン
│   │   └── types/game.ts  # 共有型定義
│   └── Dockerfile
├── docker-compose.yml
├── render.yaml            # Render デプロイ構成
└── package.json           # モノレポ用スクリプト
```

## 画面一覧

| URL | 用途 |
|-----|------|
| `/` | **参加者画面** – モバイル向けビンゴカードと A/B 投票 |
| `/admin` | **管理者画面** – ゲーム開始、ラウンド開始、投票締切、結果確認 |
| `/projector` | **会場表示画面** – 会場向けの全画面表示 |

## ゲーム進行

1. **管理者**が `/admin` を開き、シークレットを入力して**ゲーム開始**します。
2. 管理者が質問と 2 つの選択肢を入力し、**番号を引いてラウンド開始**します。
3. サーバが未使用の番号（1〜75）をランダムに引き、投票を開始します。
4. **参加者**はスマートフォンで `/` を開き、名前を入力して A/B に投票します。
5. 管理者が**投票を締め切って結果公開**します。
6. サーバが多数決結果を判定します。
   - 多数派に投票し、かつ引かれた番号を自分のカードに持っている参加者は、そのマスが開きます。
   - 引き分けの場合は誰のマスも開きません。
7. 各ラウンド後にビンゴ判定が行われ、勝者が全員に通知されます。
8. 以後は 2 の手順から繰り返します。

### ビンゴカードのルール

- 標準的な 5×5 のビンゴカード（B1–15, I16–30, N31–45, G46–60, O61–75）
- 中央マスは最初から開いているフリーマス
- 勝利条件は、横一列・縦一列・斜め一列のいずれか

## クイックスタート

### 前提条件

- Node.js 20 以上
- ローカルで動作する PostgreSQL（または Docker Compose）

### 1. クローンと依存関係インストール

```bash
git clone <repo>
cd welcome-bingo-system
cd server && npm install
cd ../client && npm install
```

### 2. 環境変数を設定

```bash
# サーバ
cp server/.env.example server/.env
# 必要に応じて DATABASE_URL, ADMIN_SECRET を編集

# クライアント
cp client/.env.local.example client/.env.local
# NEXT_PUBLIC_SERVER_URL=http://localhost:4000
```

### 3. データベースをセットアップ

```bash
cd server
npx prisma migrate dev --name init
# 手早く反映したい場合:
npx prisma db push
```

### 4. 開発サーバを起動

```bash
# ターミナル 1 - バックエンド
cd server && npm run dev

# ターミナル 2 - フロントエンド
cd client && npm run dev
```

### Docker Compose（推奨）

```bash
ADMIN_SECRET=my-secret docker-compose up --build
```

起動後に以下へアクセスします。

- 参加者画面: http://localhost:3000
- 管理者画面: http://localhost:3000/admin
- 会場表示画面: http://localhost:3000/projector

## REST API

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/api/health` | ヘルスチェック |
| GET | `/api/game/state` | 現在の公開ゲーム状態 |
| GET | `/api/game/rounds` | 完了済みラウンド履歴 |
| GET | `/api/game/participants` | 参加者一覧（名前、ビンゴ有無、オンライン状態） |
| GET | `/api/participants/:sessionId/card` | 指定参加者のビンゴカード |

## Socket.IO イベント

### クライアント → サーバ

| イベント | ペイロード | 説明 |
|---------|-----------|------|
| `participant:join` | `{ name, sessionId }` | 名前とブラウザセッション ID で参加 |
| `participant:reconnect` | `{ sessionId }` | 再接続時にセッション復元 |
| `public:subscribe` | — | 公開ゲーム状態の購読（管理者 / 会場表示向け） |
| `vote:submit` | `{ choice: 'A'\|'B' }` | 現在のラウンドに投票 |
| `admin:start-game` | `{ secret }` | ゲーム開始 |
| `admin:start-round` | `{ secret, question, optionA, optionB }` | 番号を引いてラウンド開始 |
| `admin:close-voting` | `{ secret }` | 投票を締め切って結果計算 |
| `admin:reset-game` | `{ secret }` | ゲームを完全リセット |

### サーバ → クライアント

| イベント | ペイロード | 説明 |
|---------|-----------|------|
| `game:state` | `PublicGameState` | ゲーム状態を全体配信 |
| `participant:state` | `ParticipantState` | 参加者個人の状態を送信 |
| `round:started` | Round info | 新しいラウンド開始を通知 |
| `round:completed` | Round result | 多数派とマス開放結果を含むラウンド結果 |
| `bingo:winner` | `{ winners, message }` | ビンゴ達成者の通知 |
| `game:reset` | `{ message }` | ゲームリセット通知 |

## Prisma スキーマ

主なモデルは `Participant`、`BingoCard`、`Game`、`Round`、`Vote` です。

履歴データは PostgreSQL に永続化されますが、進行中ゲームの実行時状態は `gameService.ts` のメモリ上に保持されています。

## 設定項目

| 環境変数 | デフォルト | 説明 |
|---------|-----------|------|
| `PORT` | `4000` | サーバの待受ポート |
| `DATABASE_URL` | — | PostgreSQL の接続文字列 |
| `CLIENT_URL` | `http://localhost:3000` | CORS で許可するクライアント URL |
| `ADMIN_SECRET` | `bingo-admin-secret` | 管理者操作用のシークレット |
| `NEXT_PUBLIC_SERVER_URL` | `http://localhost:4000` | ブラウザから接続する Socket.IO サーバ URL |

## デプロイ

デプロイ方針と具体手順は `docs/deployment.md` に分離しました。

- 低コストで運用するための `単一 VPS + Docker Compose` 案
- `Render Blueprint` を使う場合の構成
- 本番環境変数、更新手順、運用上の注意
- 将来のスケール時に必要な設計変更

詳しくは [`docs/deployment.md`](docs/deployment.md) を参照してください。

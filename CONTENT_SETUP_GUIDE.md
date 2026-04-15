# コンテンツ準備ガイド

最終更新: 2026-04-15

## 1. このガイドの目的

本番で使う質問・クイズ・画像を、repo 内で安全に管理するための運用ガイドです。

今回の方針は以下です。

- 画像は外部 URL ではなく repo 内で持つ
- 多数派質問とクイズ問題を事前登録しておく
- 足りなくなったら当日は手入力で補う
- 本番中は server 再起動を避ける

## 2. デプロイ構成

現状の Docker 構成は 3 サービスです。

- `db`: PostgreSQL
- `server`: Express + Socket.IO
- `client`: Next.js

参照:

- [C:\bingo-workspace\welcome-bingo-system\docker-compose.yml](C:/bingo-workspace/welcome-bingo-system/docker-compose.yml)
- [C:\bingo-workspace\welcome-bingo-system\server\Dockerfile](C:/bingo-workspace/welcome-bingo-system/server/Dockerfile)
- [C:\bingo-workspace\welcome-bingo-system\client\Dockerfile](C:/bingo-workspace/welcome-bingo-system/client/Dockerfile)

## 3. 画像の置き場所

本番で使う画像は `client/public/question-assets` 配下に置きます。

例:

- [C:\bingo-workspace\welcome-bingo-system\client\public\question-assets\majority\food\nanitabeyou.jpeg](C:/bingo-workspace/welcome-bingo-system/client/public/question-assets/majority/food/nanitabeyou.jpeg)
- [C:\bingo-workspace\welcome-bingo-system\client\public\question-assets\majority\food\meet.png](C:/bingo-workspace/welcome-bingo-system/client/public/question-assets/majority/food/meet.png)
- [C:\bingo-workspace\welcome-bingo-system\client\public\question-assets\majority\food\fish.png](C:/bingo-workspace/welcome-bingo-system/client/public/question-assets/majority/food/fish.png)

画面側から参照するときは、public 配下を `/question-assets/...` として指定します。

例:

```text
/question-assets/majority/food/nanitabeyou.jpeg
```

## 4. 事前登録問題の元データ

事前登録問題の元データは、以下のファイルで管理します。

- [C:\bingo-workspace\welcome-bingo-system\server\src\data\preparedQuestions.ts](C:/bingo-workspace/welcome-bingo-system/server/src/data/preparedQuestions.ts)

ここが repo 管理上の「元データ」です。

各問題は次の項目を持ちます。

- `slug`: 一意な管理コード
- `kind`: `MAJORITY` または `QUIZ`
- `question`
- `optionA`
- `optionB`
- `imageUrl`
- `optionAImageUrl`
- `optionBImageUrl`
- `correctChoice` (`QUIZ` のときだけ)

## 5. 想定している準備量

本番までに少なくとも以下を用意する想定です。

- 多数派質問: 30問
- クイズ問題: 3〜5問

現時点ではサンプルだけ入っています。
本番前に [C:\bingo-workspace\welcome-bingo-system\server\src\data\preparedQuestions.ts](C:/bingo-workspace/welcome-bingo-system/server/src/data/preparedQuestions.ts) を増やしていく運用にします。

## 6. DB への投入方法

事前登録問題は、以下のコマンドで DB に同期します。

```powershell
cd C:\bingo-workspace\welcome-bingo-system\server
npm run content:sync-prepared
```

参照:

- [C:\bingo-workspace\welcome-bingo-system\server\src\scripts\syncPreparedQuestions.ts](C:/bingo-workspace/welcome-bingo-system/server/src/scripts/syncPreparedQuestions.ts)

この同期は `slug` を基準に upsert します。

- 既存 `slug` があれば更新
- なければ新規作成

## 7. 当日運用の前提

- 多数派質問はプールからランダム出題可能
- クイズ問題はプールに保持し、管理画面で反映して使う
- 事前登録問題が尽きたら手入力で進行する

## 8. 本番中の注意

一番気をつけるべき点は、ゲーム進行状態が server のメモリ中心だということです。

以下は本番中に避けたい操作です。

- server コンテナの再起動
- server の再デプロイ
- `.env` の変更を伴う再起動

理由:

- 進行中ラウンド
- 参加者接続状態
- 現在の pending bonus selection
- drawn number の進行中状態

などは in-memory で持っているためです。

## 9. おすすめ手順

1. 画像を `client/public/question-assets/...` に置く
2. [C:\bingo-workspace\welcome-bingo-system\server\src\data\preparedQuestions.ts](C:/bingo-workspace/welcome-bingo-system/server/src/data/preparedQuestions.ts) に問題を追加する
3. `server` で `npm run content:sync-prepared` を実行する
4. 管理画面で問題一覧を確認する
5. ステージング相当の環境で通し確認する
6. 本番中は再起動を避ける

## 10. 今後追加すると便利なもの

- 事前登録問題の編集 / 削除 UI
- CSV / JSON 一括投入
- 画像一覧の管理 UI
- server 再起動時の進行状態復元

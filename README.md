# 5 Countdown Timer App

5つのカウントダウンタイマーを共有リンクで閲覧でき、管理者URLを持つ人だけがスタート・ストップ・リセット・名称/時間変更を行えるウェブアプリです。

## 機能

- 1ボードにつき5つのカウントダウンタイマー
- 閲覧用URL `/r/:roomId` は誰でも閲覧可能
- 管理者URL `/admin/:roomId?key=...` のみ操作可能
- Socket.IOで閲覧者画面へリアルタイム反映
- タイマー状態は `data/rooms.json` に保存

## 起動

```bash
npm install
npm start
```

ブラウザで `http://localhost:3000` を開き、「新しいタイマーボードを作成」を押してください。

## 本番公開時

環境変数 `PUBLIC_BASE_URL` に公開URLを設定してください。

```bash
PUBLIC_BASE_URL=https://example.com npm start
```

## 注意

管理者URLは操作権限そのものです。第三者に共有しないでください。より厳格な認証が必要な場合は、ログイン認証・DB・監査ログの追加を推奨します。

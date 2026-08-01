# 日本拳法 孝徳会 大会運営システム

大会をリアルタイムで運営管理するWebアプリ。記録係がタブレットで試合結果を入力し、
管理・モニター・観覧（保護者）の各画面へ約1秒で同期される。

## 本番URL

| 用途 | URL |
|------|-----|
| 管理者（全機能） | https://kotokukai-tournament.vercel.app/ |
| 記録係 Aコート専用 | https://kotokukai-tournament.vercel.app/recorder/a |
| 記録係 B〜Dコート専用 | 同 `/recorder/b` `/recorder/c` `/recorder/d` |
| 記録係（全コート） | https://kotokukai-tournament.vercel.app/recorder |
| 観覧（保護者向け・30秒更新） | https://kotokukai-tournament.vercel.app/viewer |
| デモ（コーポレートサイト掲載用・実データに影響なし） | https://kotokukai-tournament.vercel.app/demo |

## システム構成（開発PCに依存しない）

```
GitHub (kidstoox1/kotokukai-tournament)  ← コードの正本
   │  push すると自動で
   ▼
Vercel (kotokukai-tournament.vercel.app) ← ホスティング・自動デプロイ
   │
   ▼
Firebase Firestore (プロジェクト: kotokukai-tournament / 大阪リージョン)
                                         ← 大会データの保存・リアルタイム同期
```

- **大会の運営に開発PCは不要。** 本番はVercel+Firebase上で動いており、
  スマホ・タブレットのブラウザだけで大会を運営できる
- Firebaseの接続設定は `src/lib/firebase.ts` にコード内蔵（環境変数・秘密鍵なし）。
  クローンすればそのまま動く

## 別のPCで開発を始める / PCが壊れた時の復旧手順

必要なのは以下の3つだけ（所要 約10分）：

1. **Node.js LTS** をインストール — https://nodejs.org/
2. **コードを取得**
   ```bash
   git clone https://github.com/kidstoox1/kotokukai-tournament.git
   cd kotokukai-tournament
   npm install
   ```
3. **開発サーバー起動**
   ```bash
   npm run dev
   ```
   → http://localhost:3000 で動作確認。`.env` 等の設定ファイルは不要。

変更を本番に反映するには：
```bash
git add -A && git commit -m "変更内容" && git push
```
→ Vercelが自動でビルド・デプロイ（1〜2分）。開いている端末には更新バナーが表示される。

### Claude Code（AI開発支援）も使う場合

新PCに Claude Code（デスクトップアプリ or `npm install -g @anthropic-ai/claude-code`）を
インストールし、このフォルダを開くだけ。プロジェクトの文脈は `CLAUDE.md` に
記録されており、AIが自動で読み込む。

## 必要なアカウント（パスワード管理ツールで保管を推奨）

| サービス | アカウント | 用途 |
|----------|-----------|------|
| GitHub | kidstoox1 | コードの正本・push権限 |
| Vercel | GitHubログイン連携 | ホスティング管理（通常触る必要なし） |
| Google / Firebase | kidstoox1@gmail.com | 大会データDB（console.firebase.google.com） |

## 緊急時FAQ

**Q. 開発PCが大会当日に壊れた**
A. 大会運営には影響なし。本番はクラウドで動いている。上記URLをブラウザで開けばよい。

**Q. データが消えた・おかしくなった**
A. データの正本はFirebase Firestore（`tournament_state/main`）。
   各端末はローカルにもコピーを持つため、データが残っている端末で本番URLを
   開き直せばクラウドへ再アップロードされる。完全リセットは管理画面の「リセット」。

**Q. 画面が真っ白・エラーになる**
A. Vercelのダッシュボードから直前のデプロイに「Instant Rollback」できる。
   またはGitHubで前のコミットに戻して push。

**Q. 過去の変更内容を知りたい**
A. `git log` またはGitHubのコミット履歴。各コミットに日本語で変更理由を記載済み。

## 技術スタック

- Next.js 15 (React 19) + TypeScript + Tailwind CSS
- 状態管理: Zustand（localStorage永続化 + Firestore同期）
- DB/同期: Firebase Firestore（onSnapshotによるリアルタイム配信、観覧のみ30秒ポーリング）
- ホスティング: Vercel（mainブランチへのpushで自動デプロイ）

詳細仕様は `CLAUDE.md` および `docs/` を参照。

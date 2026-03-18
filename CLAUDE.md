# 日本拳法大会運営システム — CLAUDE.md

## プロジェクト概要

日本拳法（Nippon Kempo）の大会をリアルタイムで運営管理するWebアプリケーション。
4会場同時進行のトーナメント・リーグ戦を、審判（記録係）がタブレットで入力し、保護者がスマホで閲覧できるシステム。

**提案先**: 日本拳法孝徳会（尼崎市）
**大会規模**: 小学生〜中学生、約150名、16カテゴリ、4コート

## 技術スタック

- **フロントエンド**: React (Next.js推奨)
- **バックエンド/DB**: Supabase (PostgreSQL + Realtime)
- **ホスティング**: Vercel
- **認証**: Supabase Auth（管理者・記録係のログイン）

## 現在の状態

プロトタイプ（React単体、DBなし）が完成済み。
`prototype/nipponkempo-tournament-v2.2.jsx` にローカルstate管理のデモアプリがある。

### プロトタイプで実装済みの機能

1. **管理画面**
   - サンプルデータ読込
   - カテゴリごとに開始形式（リーグ戦/トーナメント/予選トーナメント）を選択
   - カテゴリごとにコート（A〜D）を割り当て
   - 各グループからの進出人数（1〜3名）を設定
   - 3位決定戦の有無を設定
   - トーナメント自動生成（BYE配置含む）
   - リーグ戦グループ自動分け
   - フェーズ進行: リーグ戦 → リーグ決勝 or 決勝トーナメント
   - フェーズを戻す機能（確認ダイアログ付き）

2. **記録係入力画面**
   - コート選択（A〜D）
   - 現在の試合表示（カテゴリ名・グループ名・試合種別を大きく表示）
   - 勝敗入力（本数0/1/2、警告0〜3回、引き分け、不戦勝、失格）
   - 警告2回→相手に1本の自動加算（プレビュー付き）
   - 試合結果の修正機能
   - 完了した試合の一覧表示
   - 3位決定戦を決勝より先に表示するソート

3. **会場モニター**
   - 4コート同時表示（2x2グリッド）
   - 各コートの進行率と現在の対戦表示

4. **観覧用ビュー（保護者向け）**
   - カテゴリ選択→リーグ順位表・トーナメント表の閲覧
   - 最終結果（🥇🥈🥉）の表示

5. **試合ロジック**
   - リーグ戦（総当たり）→ 勝ち点制（勝利3点・引分1点）
   - リーグ決勝（上位者で総当たり→順位確定、同率順位対応）
   - トーナメント（シングルエリミネーション + BYE + 3位決定戦）
   - 3位決定戦: 準決勝敗者同士 or 各グループ2位同士（ブラケットサイズに応じて自動判定）

## カテゴリ構成（孝徳会大会準拠）

```
幼年の部（面なし・男女混合）
小学1年 男子（面なし）
小学2年 男子（面なし）
小学3年 男子（面なし）
小学1・2年 女子（面なし・合同）
小学3年 女子（面なし）
小学4年 男子（少年面あり）
小学4年 女子（少年面あり）
小学5年 男子（少年面あり）
小学5・6年 女子（少年面あり・合同）
小学6年 男子（少年面あり）
中学1・2年 男子（少年面あり・合同）
中学1・2年 女子（少年面あり・合同）
中学3年（大人面あり）
高校生男子（大人面あり）
一般女子（大人面あり）
```

## 試合記録の詳細

- **通常**: 2本先取の3本勝負（本数0/1/2を各選手に記録）
- **引き分け**: リーグ戦のみ（時間切れで勝敗が決まらない場合）
- **警告**: 0〜3回を記録。2回で相手に1本加算（自動計算）
- **不戦勝**: 相手不在→2-0勝ち（どちらの選手が不戦勝か選択）
- **失格**: 戦意喪失・危険行為→0-2負け（どちらが失格か選択）

## 会場構成（4コート）

| コート | 午前（個人戦） | 午後（団体戦） |
|--------|---------------|---------------|
| A | 小1-2女子, 小3女子, 中1-2男子, 中1-2女子 | 成年団体 |
| B | 小3男子, 小5男子, 小6男子 | 成年団体 |
| C | 幼年, 小1男子, 小2男子 | 成年団体 |
| D | 小4男子, 小4女子, 小5-6女子 | 成年団体 |

## 次に開発すべき機能（Phase 2: 本番MVP）

### 優先度: 高
1. **Supabase連携** — ローカルstateをSupabase DBに移行、Realtimeで同期
2. **応募フォーム** — 選手登録（氏名・フリガナ・学年・性別・所属道場）
3. **認証** — 管理者/記録係のログイン（Supabase Auth）
4. **保護者ビューのポーリング** — 30秒間隔でHTTPリクエスト（Realtime接続を使わない）

### 優先度: 中
5. **団体戦対応** — 1チーム3名、勝ち抜き/ポイント制
6. **PDF出力** — 印刷用トーナメント表
7. **午前/午後の2部制スケジューリング**

### 優先度: 低
8. **過去大会データの蓄積**
9. **選手マスタ管理**
10. **LINE通知連携**

## Supabase DB設計（推奨）

```sql
-- カテゴリ
CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  gender TEXT, -- male/female/mixed
  men_type TEXT, -- なし/少年面/大人面
  session TEXT DEFAULT 'am', -- am/pm
  venue_id TEXT,
  phase TEXT DEFAULT 'setup',
  start_format TEXT DEFAULT 'league',
  advance_count INT DEFAULT 1,
  has_third_place BOOLEAN DEFAULT true,
  tournament_id UUID REFERENCES tournaments(id)
);

-- 選手
CREATE TABLE players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  name_kana TEXT,
  category_id TEXT REFERENCES categories(id),
  dojo TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- リーググループ
CREATE TABLE league_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id TEXT REFERENCES categories(id),
  group_index INT NOT NULL,
  phase_key TEXT NOT NULL
);

-- グループメンバー
CREATE TABLE league_group_members (
  group_id UUID REFERENCES league_groups(id),
  player_id UUID REFERENCES players(id),
  PRIMARY KEY (group_id, player_id)
);

-- 試合
CREATE TABLE matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id TEXT REFERENCES categories(id),
  type TEXT NOT NULL, -- league/tournament
  phase_key TEXT NOT NULL,
  group_index INT,
  round INT,
  match_number INT,
  position INT,
  player_a_id UUID REFERENCES players(id),
  player_a_name TEXT,
  player_a_dojo TEXT,
  player_b_id UUID REFERENCES players(id),
  player_b_name TEXT,
  player_b_dojo TEXT,
  score_a INT DEFAULT 0,
  score_b INT DEFAULT 0,
  warnings_a INT DEFAULT 0,
  warnings_b INT DEFAULT 0,
  result_type TEXT, -- normal/draw/default_win/disqualification
  winner_id UUID,
  winner_name TEXT,
  status TEXT DEFAULT 'pending', -- pending/active/completed
  venue_id TEXT,
  is_bye BOOLEAN DEFAULT false,
  is_third_place BOOLEAN DEFAULT false,
  source_match_a UUID REFERENCES matches(id),
  source_match_b UUID REFERENCES matches(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Realtime有効化
ALTER TABLE matches REPLICA IDENTITY FULL;
ALTER TABLE categories REPLICA IDENTITY FULL;
```

## 同時接続対策

- **記録係・管理者・モニター**: Supabase Realtimeで即時反映（常時接続 ≈ 10台）
- **保護者・観客**: 30秒間隔のHTTPポーリング（接続数にカウントされない）
- Supabase無料枠の200同時接続で十分

## コーディング規約

- 言語: TypeScript推奨（プロトタイプはJSX）
- スタイリング: Tailwind CSS（プロトタイプはインラインスタイル）
- 状態管理: Supabase連携後はサーバーステートをメインに
- コンポーネント: 機能単位でファイル分割
- 日本語コメント推奨（開発者が日本語話者）

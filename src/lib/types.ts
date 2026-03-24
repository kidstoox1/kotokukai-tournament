// ==========================================
// 日本拳法大会運営システム — TypeScript型定義
// ==========================================

// --- カテゴリ ---
export interface Category {
  id: string;
  label: string;
  group: '幼年' | '小学' | '中学' | '高校' | '一般';
  gender: 'male' | 'female' | 'mixed';
  menType: 'なし' | '少年面' | '大人面';
  session: 'am' | 'pm';
  isTeam: boolean;
  gradeRange?: string;       // 例: '1-2' (合同学年の範囲)
  mergedFrom?: string[];     // 統合元カテゴリID一覧
}

// --- 選手 ---
export interface Player {
  id: string;
  name: string;
  nameKana?: string;
  categoryId: string;
  dojo: string;
}

// --- 試合の選手情報（非正規化） ---
export interface MatchPlayer {
  id: string;
  name: string;
  nameKana?: string;
  dojo?: string;
}

// --- 試合結果タイプ ---
export type ResultType = 'normal' | 'draw' | 'default_win' | 'disqualification';

// --- 試合ステータス ---
export type MatchStatus = 'pending' | 'active' | 'completed';

// --- フェーズ ---
export type PhaseType =
  | 'setup'
  | 'league'
  | 'league_final'
  | 'pre_tournament'
  | 'final_tournament'
  | 'awaiting_finals'
  | 'done';

// --- 試合 ---
export interface Match {
  id: string;
  categoryId: string;
  type: 'league' | 'tournament';
  phaseKey: PhaseType;

  // リーグ戦用
  groupIndex?: number;

  // トーナメント用
  round?: number;
  matchNumber?: number;
  position?: number;
  sourceMatchA?: string | null;
  sourceMatchB?: string | null;

  // 選手
  playerA: MatchPlayer | null;
  playerB: MatchPlayer | null;

  // 結果
  scoreA: number;
  scoreB: number;
  warningsA: number;
  warningsB: number;
  resultType: ResultType | null;
  winnerId: string | null;
  winnerName: string | null;

  // 状態
  status: MatchStatus;
  venueId: string | null;
  isBye: boolean;
  isThirdPlace: boolean;
}

// --- 会場（コート） ---
export interface Venue {
  id: string;
  name: string;
  color: string;
}

// --- リーグ順位 ---
export interface LeagueStanding {
  id: string;
  name: string;
  nameKana?: string;
  dojo: string;
  wins: number;
  losses: number;
  draws: number;
  points: number;
  ipponFor: number;
  ipponAgainst: number;
  totalWarnings: number;  // 全試合の累計警告数（同率時の最終タイブレーカー）
}

// --- 最終順位 ---
export interface FinalRanking {
  rank: number;      // 同率の場合は同じ数字
  medal: string;     // 🥇🥈🥉
  name: string;
  nameKana?: string;
  dojo: string;
  id: string;
  points?: number;
  ipponDiff?: number;
}

// --- トーナメントデータ ---
export interface TournamentData {
  totalRounds: number;
  bracketSize: number;
  phaseKey: PhaseType;
  hasThirdPlace: boolean;
}

// --- カテゴリ設定（管理画面用） ---
export interface CategoryConfig {
  startFormat: PhaseType;
  venueId: string;
  advanceCount: number;
  thirdPlace: boolean;
}

// --- 開始形式の選択肢 ---
export interface StartFormat {
  value: PhaseType;
  label: string;
  desc: string;
  color: string;
}

// --- フェーズ遷移の選択肢 ---
export interface NextPhaseOption {
  value: PhaseType;
  label: string;
}

// --- 団体戦: チームメンバー ---
export type BoutPosition = '先鋒' | '中堅' | '大将';

export interface TeamMember {
  playerId: string;
  name: string;
  dojo: string;
  position?: BoutPosition;
  isSub: boolean;            // 補欠かどうか
}

// --- 団体戦: チーム ---
export interface Team {
  id: string;
  name: string;              // チーム名（道場名等）
  categoryId: string;
  members: TeamMember[];     // 3名 + 補欠2名
}

// --- 団体戦: 個別取組 ---
export interface TeamBout {
  position: BoutPosition;
  playerA: MatchPlayer | null;
  playerB: MatchPlayer | null;
  scoreA: number;
  scoreB: number;
  warningsA: number;
  warningsB: number;
  resultType: ResultType | null;
  winnerId: string | null;
  status: MatchStatus;
}

// --- 団体戦: チーム試合 ---
export interface TeamMatch {
  id: string;
  categoryId: string;
  type: 'league' | 'tournament';
  phaseKey: PhaseType;
  groupIndex?: number;
  round?: number;
  matchNumber?: number;
  position?: number;
  sourceMatchA?: string | null;
  sourceMatchB?: string | null;

  teamA: { id: string; name: string } | null;
  teamB: { id: string; name: string } | null;

  bouts: TeamBout[];         // 先鋒・中堅・大将の3取組
  representativeBout?: TeamBout;  // 代表戦（同数の場合）

  // チーム勝敗結果
  winsA: number;             // チームAの勝ち数
  winsB: number;
  winnerId: string | null;
  winnerName: string | null;

  status: MatchStatus;
  venueId: string | null;
  isBye: boolean;
  isThirdPlace: boolean;
}

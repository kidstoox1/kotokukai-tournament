// ==========================================
// ヘルパー関数
// ==========================================

import type { Match, Category, TournamentData } from './types';
import { PHASE_COLORS } from './constants';


// 試合ラベル（例: 「小学3年男子 Aグループ」）
export function matchLabel(match: Match, categories: Category[]): string {
  const catName = categories.find(c => c.id === match.categoryId)?.label || '';
  if (match.type === 'league') {
    return `${catName} ${String.fromCharCode(65 + (match.groupIndex || 0))}グループ`;
  }
  return `${catName} トーナメント`;
}

// 試合種別ラベル（例: 「決勝」「準決勝」「Aグループ」）
export function matchTypeLabel(match: Match, tournData: Record<string, TournamentData>): string {
  if (match.isThirdPlace) return '3位決定戦';
  if (match.type === 'league' && match.phaseKey === 'league_final') return 'リーグ決勝';
  if (match.type === 'league') return `${String.fromCharCode(65 + (match.groupIndex || 0))}グループ`;
  const tr = tournData?.[match.categoryId]?.totalRounds;
  if (tr && match.round === tr) return '決勝';
  if (tr && match.round === tr - 1) return '準決勝';
  if (tr && match.round === tr - 2) return '準々決勝';
  return `${match.round || 1}回戦`;
}

// 試合種別の色
export function matchTypeColor(match: Match): string {
  if (match.isThirdPlace) return '#F59E0B';
  if (match.phaseKey === 'league_final') return '#F472B6';
  if (match.type === 'league') return '#60A5FA';
  return '#FCA5A5';
}

// グループサマリー（例: 「12人 → 3グループ（各4人）」）
export function groupSummary(playerCount: number): string {
  if (playerCount === 0) return '0人';
  const groupSize = playerCount <= 6 ? 3 : 4;
  const numGroups = Math.ceil(playerCount / groupSize);
  return `${playerCount}人 → ${numGroups}グループ（各${groupSize}人）`;
}

// フェーズタグ用スタイル取得
export function getPhaseStyle(phase: string): { bg: string; text: string; border: string } {
  return PHASE_COLORS[phase as keyof typeof PHASE_COLORS] || PHASE_COLORS.setup;
}

// 決勝戦かどうか判定（トーナメント最終ラウンド、3位決定戦以外）
export function isFinalMatch(match: Match, tournData: Record<string, TournamentData>): boolean {
  if (match.type !== 'tournament' || match.isThirdPlace) return false;
  const td = tournData[match.categoryId];
  if (!td) return false;
  return match.round === td.totalRounds;
}

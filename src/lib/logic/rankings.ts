// ==========================================
// 順位計算ロジック
// ==========================================

import type { Player, Match, FinalRanking } from '../types';
import { calcStandings } from './league';

// トーナメント最終順位
export function getFinalRankings(matches: Match[]): FinalRanking[] | null {
  if (!matches || matches.length === 0) return null;

  const normalMatches = matches.filter(m => !m.isThirdPlace && !m.isBye);
  const thirdPlaceMatch = matches.find(m => m.isThirdPlace);
  const allDone = normalMatches.every(m => m.status === 'completed');
  const thirdDone = !thirdPlaceMatch || thirdPlaceMatch.status === 'completed';
  if (!allDone) return null;

  const maxRound = Math.max(...normalMatches.map(m => m.round || 0));
  const finalMatch = normalMatches.find(m => m.round === maxRound);
  if (!finalMatch || !finalMatch.winnerId) return null;

  const rankings: FinalRanking[] = [];

  // 優勝
  const first = finalMatch.winnerId === finalMatch.playerA?.id ? finalMatch.playerA : finalMatch.playerB;
  if (first) rankings.push({ rank: 1, medal: '🥇', name: first.name, nameKana: first.nameKana, dojo: first.dojo || '', id: first.id });

  // 準優勝
  const second = finalMatch.winnerId === finalMatch.playerA?.id ? finalMatch.playerB : finalMatch.playerA;
  if (second) rankings.push({ rank: 2, medal: '🥈', name: second.name, nameKana: second.nameKana, dojo: second.dojo || '', id: second.id });

  // 第3位
  if (thirdPlaceMatch && thirdDone && thirdPlaceMatch.winnerId) {
    const third = thirdPlaceMatch.winnerId === thirdPlaceMatch.playerA?.id ? thirdPlaceMatch.playerA : thirdPlaceMatch.playerB;
    if (third) rankings.push({ rank: 3, medal: '🥉', name: third.name, nameKana: third.nameKana, dojo: third.dojo || '', id: third.id });
  }

  return rankings;
}

// リーグ決勝の最終順位（同率順位対応）
export function getLeagueFinalRankings(players: Player[], matches: Match[]): FinalRanking[] | null {
  if (!players || players.length === 0 || !matches || matches.length === 0) return null;
  const allDone = matches.every(m => m.status === 'completed');
  if (!allDone) return null;

  const standings = calcStandings(players, matches);
  const medals = ['🥇', '🥈', '🥉'];

  const rankings: FinalRanking[] = [];
  let currentRank = 1;
  standings.forEach((s, i) => {
    if (i > 0) {
      const prev = standings[i - 1];
      const same = s.points === prev.points
        && s.ipponFor === prev.ipponFor
        && s.ipponAgainst === prev.ipponAgainst
        && s.totalWarnings === prev.totalWarnings;
      if (!same) {
        currentRank = i + 1;
      }
    }
    if (currentRank <= 3) {
      rankings.push({
        rank: currentRank,
        medal: medals[currentRank - 1] || '🥉',
        name: s.name,
        nameKana: s.nameKana,
        dojo: s.dojo,
        id: s.id,
        points: s.points,
        ipponDiff: s.ipponFor - s.ipponAgainst,
      });
    }
  });
  return rankings;
}

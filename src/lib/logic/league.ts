// ==========================================
// リーグ戦ロジック
// ==========================================

import type { Player, Match, PhaseType, LeagueStanding } from '../types';
import { generateId } from '../uuid';
import { RESULT } from '../constants';

/**
 * グループ自動分け（同じ道場をできるだけ別グループに分散）
 * アルゴリズム:
 * 1. 道場ごとに選手をグループ化
 * 2. 人数の多い道場から順に、最も空きのあるグループへ配置
 * 3. 同道場の選手は異なるグループに分散される
 */
export function createLeagueGroups(players: Player[], groupSize: number = 4): Player[][] {
  const numGroups = Math.ceil(players.length / groupSize);
  const groups: Player[][] = Array.from({ length: numGroups }, () => []);

  // 道場ごとに選手を集める
  const byDojo: Record<string, Player[]> = {};
  for (const p of players) {
    const key = p.dojo || '__none__';
    if (!byDojo[key]) byDojo[key] = [];
    byDojo[key].push(p);
  }

  // 各道場内をシャッフル
  for (const arr of Object.values(byDojo)) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  // 人数の多い道場から配置（大きい道場ほど分散が重要）
  const dojoEntries = Object.entries(byDojo).sort((a, b) => b[1].length - a[1].length);

  for (const [, dojoPlayers] of dojoEntries) {
    for (const player of dojoPlayers) {
      // 同道場の選手が最も少なく、かつ全体で最も少ないグループを選ぶ
      let bestGroup = 0;
      let bestScore = Infinity;

      for (let g = 0; g < numGroups; g++) {
        if (groups[g].length >= groupSize) continue; // 満員スキップ
        const sameDojo = groups[g].filter(p => p.dojo === player.dojo).length;
        // スコア = 同道場数 * 1000 + グループ人数（同道場数を最優先）
        const score = sameDojo * 1000 + groups[g].length;
        if (score < bestScore) {
          bestScore = score;
          bestGroup = g;
        }
      }
      groups[bestGroup].push(player);
    }
  }

  return groups;
}

// 総当たり試合生成
export function createLeagueMatches(
  group: Player[],
  groupIndex: number,
  categoryId: string,
  phaseKey: PhaseType
): Match[] {
  const matches: Match[] = [];
  for (let i = 0; i < group.length; i++) {
    for (let j = i + 1; j < group.length; j++) {
      matches.push({
        id: generateId(),
        categoryId,
        groupIndex,
        type: 'league',
        phaseKey,
        playerA: { id: group[i].id, name: group[i].name, nameKana: group[i].nameKana, dojo: group[i].dojo },
        playerB: { id: group[j].id, name: group[j].name, nameKana: group[j].nameKana, dojo: group[j].dojo },
        scoreA: 0,
        scoreB: 0,
        warningsA: 0,
        warningsB: 0,
        resultType: null,
        winnerId: null,
        winnerName: null,
        status: 'pending',
        venueId: null,
        isBye: false,
        isThirdPlace: false,
      });
    }
  }
  return matches;
}

// 順位計算
// 優先順位: 1.勝点 → 2.取った本数(多い方が上) → 3.取られた本数(少ない方が上) → 4.警告数(少ない方が上)
export function calcStandings(group: Player[], matches: Match[]): LeagueStanding[] {
  const st: Record<string, LeagueStanding> = {};
  group.forEach(p => {
    st[p.id] = { ...p, wins: 0, losses: 0, draws: 0, points: 0, ipponFor: 0, ipponAgainst: 0, totalWarnings: 0 };
  });

  matches.filter(m => m.status === 'completed').forEach(m => {
    const a = st[m.playerA!.id];
    const b = st[m.playerB!.id];
    if (!a || !b) return;

    a.ipponFor += m.scoreA;
    a.ipponAgainst += m.scoreB;
    b.ipponFor += m.scoreB;
    b.ipponAgainst += m.scoreA;

    // 警告の残り数を記録（2回で1本に変換された分は消化済み）
    // 例: 1試合で警告3 → 2消化(1本) + 残り1 / 3試合で各1 → 残り1+1+1=3
    a.totalWarnings += m.warningsA % 2;
    b.totalWarnings += m.warningsB % 2;

    // 延長戦で決着した場合は引き分けではなく勝敗扱い（勝点3 vs 0）
    // 本戦が引き分けで延長戦が無い場合のみ、引き分け扱い（勝点1 vs 1）
    if (m.resultType === RESULT.DRAW && !m.overtime) {
      a.draws++;
      b.draws++;
      a.points += 1;
      b.points += 1;
    } else if (m.winnerId === m.playerA!.id) {
      a.wins++;
      b.losses++;
      a.points += 3;
    } else if (m.winnerId === m.playerB!.id) {
      b.wins++;
      a.losses++;
      b.points += 3;
    }
  });

  // ソート: 勝点 → 取った本数 → 取られた本数(少ない方が上) → 警告数(少ない方が上)
  return Object.values(st).sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.ipponFor !== a.ipponFor) return b.ipponFor - a.ipponFor;
    if (a.ipponAgainst !== b.ipponAgainst) return a.ipponAgainst - b.ipponAgainst;
    return a.totalWarnings - b.totalWarnings;
  });
}

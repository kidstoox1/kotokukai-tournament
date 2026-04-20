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

/**
 * ラウンドロビン（総当たり）の試合順を生成
 * サーキル法 (circle method) を使い、各ラウンドで各選手が最大1試合になるよう
 * ペアを組む。これによりラウンド内では連続試合が発生せず、選手の休憩が挟まる。
 *
 * 奇数人数の場合は仮想の BYE を追加してラウンド数を揃え、BYE とのペアはスキップ。
 * 3人など少人数では構造上どうしても連続試合が発生するが、それ以外は基本的に
 * 同じ選手が連続して試合することを避けられる。
 *
 * 返り値: ラウンドごとのペア配列（[[[i,j],...], [[i,j],...], ...]）
 */
function generateRoundRobinRounds(n: number): [number, number][][] {
  if (n < 2) return [];
  const hasBye = n % 2 === 1;
  const total = hasBye ? n + 1 : n;
  const byeIdx = total - 1;           // 奇数時の BYE インデックス
  const numRounds = total - 1;
  const half = total / 2;

  // 先頭を固定、残りを回転させるサーキル法
  const rotating = Array.from({ length: total - 1 }, (_, i) => i + 1);
  const rounds: [number, number][][] = [];

  for (let r = 0; r < numRounds; r++) {
    const top = [0, ...rotating.slice(0, half - 1)];
    const bottom = rotating.slice(half - 1).reverse();
    const round: [number, number][] = [];
    for (let i = 0; i < half; i++) {
      const a = top[i];
      const b = bottom[i];
      // BYE とのペアはスキップ（奇数時）
      if (hasBye && (a === byeIdx || b === byeIdx)) continue;
      round.push([a, b]);
    }
    rounds.push(round);
    // 回転: 最後を先頭へ
    rotating.unshift(rotating.pop()!);
  }

  return rounds;
}

/**
 * ラウンド配列を1次元化し、ラウンド境界での連続試合を貪欲に最小化する。
 * 各ラウンドの内部ペア同士は常に分離しているため、各ラウンド r (r>=1) について
 * 「前ラウンド最後のペアと重なりが最小のペア」を先頭に並び替える。
 */
function flattenRoundsMinimizingConsecutives(
  rounds: [number, number][][]
): [number, number][] {
  const result: [number, number][] = [];
  for (let r = 0; r < rounds.length; r++) {
    const round = [...rounds[r]];
    if (result.length === 0) {
      result.push(...round);
      continue;
    }
    const last = new Set<number>(result[result.length - 1]);
    round.sort((a, b) => {
      const oA = a.filter(p => last.has(p)).length;
      const oB = b.filter(p => last.has(p)).length;
      return oA - oB;
    });
    result.push(...round);
  }
  return result;
}

// 総当たり試合生成（連続試合を避けるラウンドロビン順）
export function createLeagueMatches(
  group: Player[],
  groupIndex: number,
  categoryId: string,
  phaseKey: PhaseType
): Match[] {
  if (group.length < 2) return [];

  // ラウンドロビンのペア順を生成し、境界での連続を最小化するよう並べる
  const rounds = generateRoundRobinRounds(group.length);
  const pairs: [number, number][] = flattenRoundsMinimizingConsecutives(rounds);

  return pairs.map(([i, j]) => ({
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
  }));
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

// ==========================================
// 団体戦ロジック
// ==========================================

import type { Team, TeamMatch, TeamBout, PhaseType, BoutPosition, MatchPlayer } from '../types';
import { generateId } from '../uuid';

const BOUT_POSITIONS: BoutPosition[] = ['先鋒', '中堅', '大将'];

// 空の取組を生成
function emptyBout(position: BoutPosition): TeamBout {
  return {
    position,
    playerA: null,
    playerB: null,
    scoreA: 0,
    scoreB: 0,
    warningsA: 0,
    warningsB: 0,
    resultType: null,
    winnerId: null,
    status: 'pending',
  };
}

// 団体戦の試合を1つ生成
function createTeamMatch(
  teamA: Team | null,
  teamB: Team | null,
  categoryId: string,
  type: 'league' | 'tournament',
  phaseKey: PhaseType,
  opts: {
    groupIndex?: number;
    round?: number;
    matchNumber?: number;
    position?: number;
    sourceMatchA?: string | null;
    sourceMatchB?: string | null;
    isBye?: boolean;
    isThirdPlace?: boolean;
  } = {}
): TeamMatch {
  const isBye = opts.isBye || !teamA || !teamB;
  return {
    id: generateId(),
    categoryId,
    type,
    phaseKey,
    groupIndex: opts.groupIndex,
    round: opts.round,
    matchNumber: opts.matchNumber,
    position: opts.position,
    sourceMatchA: opts.sourceMatchA ?? null,
    sourceMatchB: opts.sourceMatchB ?? null,
    teamA: teamA ? { id: teamA.id, name: teamA.name } : null,
    teamB: teamB ? { id: teamB.id, name: teamB.name } : null,
    bouts: BOUT_POSITIONS.map(pos => emptyBout(pos)),
    winsA: 0,
    winsB: 0,
    winnerId: isBye ? (teamA?.id || teamB?.id || null) : null,
    winnerName: isBye ? (teamA?.name || teamB?.name || null) : null,
    status: isBye ? 'completed' : 'pending',
    venueId: null,
    isBye,
    isThirdPlace: opts.isThirdPlace || false,
  };
}

// 団体戦リーグのグループ分け
export function createTeamLeagueGroups(teams: Team[], groupSize: number = 4): Team[][] {
  const shuffled = [...teams].sort(() => Math.random() - 0.5);
  const numGroups = Math.ceil(shuffled.length / groupSize);
  const groups: Team[][] = Array.from({ length: numGroups }, () => []);
  shuffled.forEach((t, i) => groups[i % numGroups].push(t));
  return groups;
}

// 団体戦リーグの総当たり試合生成
export function createTeamLeagueMatches(
  group: Team[],
  groupIndex: number,
  categoryId: string,
  phaseKey: PhaseType
): TeamMatch[] {
  const matches: TeamMatch[] = [];
  for (let i = 0; i < group.length; i++) {
    for (let j = i + 1; j < group.length; j++) {
      matches.push(createTeamMatch(group[i], group[j], categoryId, 'league', phaseKey, { groupIndex }));
    }
  }
  return matches;
}

// 団体戦トーナメントのブラケット生成
export function generateTeamBracket(
  teams: Team[],
  categoryId: string,
  phaseKey: PhaseType,
  hasThirdPlace: boolean = false
): { matches: TeamMatch[]; totalRounds: number; bracketSize: number } {
  const n = teams.length;
  if (n < 2) return { matches: [], totalRounds: 0, bracketSize: 0 };

  let size = 1;
  while (size < n) size *= 2;
  const totalRounds = Math.log2(size);
  const slots: (Team | null)[] = new Array(size).fill(null);
  for (let i = 0; i < n; i++) slots[i] = teams[i];

  const matches: TeamMatch[] = [];
  let num = 1;

  // 1回戦
  for (let i = 0; i < size; i += 2) {
    const tA = slots[i];
    const tB = slots[i + 1];
    const isBye = !tA || !tB;
    matches.push(createTeamMatch(tA, tB, categoryId, 'tournament', phaseKey, {
      round: 1, matchNumber: num++, position: i / 2, isBye,
    }));
  }

  // 2回戦以降
  for (let round = 2; round <= totalRounds; round++) {
    const prev = matches.filter(m => m.round === round - 1 && !m.isThirdPlace);
    for (let i = 0; i < prev.length; i += 2) {
      const m1 = prev[i];
      const m2 = prev[i + 1];
      const tm: TeamMatch = createTeamMatch(null, null, categoryId, 'tournament', phaseKey, {
        round, matchNumber: num++, position: i / 2,
        sourceMatchA: m1?.id || null, sourceMatchB: m2?.id || null,
      });
      // BYEの勝者を即座に入れる
      if (m1?.isBye && m1.winnerId) tm.teamA = { id: m1.winnerId, name: m1.winnerName! };
      if (m2?.isBye && m2.winnerId) tm.teamB = { id: m2.winnerId, name: m2.winnerName! };
      matches.push(tm);
    }
  }

  // 3位決定戦
  if (hasThirdPlace && totalRounds >= 2) {
    const semiFinals = matches.filter(m => m.round === totalRounds - 1 && !m.isThirdPlace);
    if (semiFinals.length === 2) {
      matches.push(createTeamMatch(null, null, categoryId, 'tournament', phaseKey, {
        round: totalRounds, matchNumber: num++, position: 99,
        sourceMatchA: semiFinals[0].id, sourceMatchB: semiFinals[1].id,
        isThirdPlace: true,
      }));
    }
  }

  return { matches, totalRounds, bracketSize: size };
}

// 団体戦の勝敗判定（全取組完了後に呼ぶ）
export function determineTeamMatchResult(match: TeamMatch): {
  winsA: number;
  winsB: number;
  winnerId: string | null;
  winnerName: string | null;
  needsRepresentative: boolean;
} {
  let winsA = 0;
  let winsB = 0;

  const allBouts = match.representativeBout
    ? [...match.bouts, match.representativeBout]
    : match.bouts;

  // 代表戦がある場合はそれだけで勝敗を決定
  if (match.representativeBout && match.representativeBout.status === 'completed') {
    const rep = match.representativeBout;
    if (rep.winnerId && match.teamA && rep.winnerId === match.teamA.id) {
      return { winsA: 0, winsB: 0, winnerId: match.teamA.id, winnerName: match.teamA.name, needsRepresentative: false };
    }
    if (rep.winnerId && match.teamB && rep.winnerId === match.teamB.id) {
      return { winsA: 0, winsB: 0, winnerId: match.teamB.id, winnerName: match.teamB.name, needsRepresentative: false };
    }
  }

  // 通常の3取組の勝敗カウント（本数不採用）
  for (const bout of match.bouts) {
    if (bout.status !== 'completed') continue;
    if (bout.winnerId && match.teamA && bout.winnerId === bout.playerA?.id) winsA++;
    else if (bout.winnerId && match.teamB && bout.winnerId === bout.playerB?.id) winsB++;
    // 引き分けはカウントしない
  }

  if (winsA > winsB) {
    return { winsA, winsB, winnerId: match.teamA?.id || null, winnerName: match.teamA?.name || null, needsRepresentative: false };
  }
  if (winsB > winsA) {
    return { winsA, winsB, winnerId: match.teamB?.id || null, winnerName: match.teamB?.name || null, needsRepresentative: false };
  }

  // 同数 → 代表戦が必要
  return { winsA, winsB, winnerId: null, winnerName: null, needsRepresentative: true };
}

// 団体戦リーグの順位計算
export interface TeamLeagueStanding {
  id: string;
  name: string;
  wins: number;
  losses: number;
  draws: number;
  points: number;
}

export function calcTeamStandings(teams: Team[], matches: TeamMatch[]): TeamLeagueStanding[] {
  const st: Record<string, TeamLeagueStanding> = {};
  teams.forEach(t => {
    st[t.id] = { id: t.id, name: t.name, wins: 0, losses: 0, draws: 0, points: 0 };
  });

  matches.filter(m => m.status === 'completed').forEach(m => {
    const a = m.teamA ? st[m.teamA.id] : null;
    const b = m.teamB ? st[m.teamB.id] : null;
    if (!a || !b) return;

    if (m.winnerId === m.teamA?.id) {
      a.wins++;
      b.losses++;
      a.points += 3;
    } else if (m.winnerId === m.teamB?.id) {
      b.wins++;
      a.losses++;
      b.points += 3;
    } else {
      // 引き分け（団体戦リーグの場合）
      a.draws++;
      b.draws++;
      a.points += 1;
      b.points += 1;
    }
  });

  return Object.values(st).sort((a, b) => b.points - a.points);
}

// ==========================================
// トーナメントロジック
// ==========================================

import type { Player, Match, PhaseType } from '../types';
import { generateId } from '../uuid';
import { RESULT } from '../constants';

/**
 * 同道場分離のシード配置
 * アルゴリズム:
 * 1. 道場ごとにグループ化し、人数の多い道場から優先的に配置
 * 2. ブラケットを再帰的にハーフ/クォーターに分割し、
 *    同道場の選手が異なるブロックに入るように配置
 * 3. BYEはブラケットの後ろ半分に集中させる
 */
function seedPlayersWithSeparation(players: Player[], bracketSize: number): (Player | null)[] {
  const slots: (Player | null)[] = new Array(bracketSize).fill(null);

  if (players.length === 0) return slots;

  // 道場ごとにグループ化
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

  // 人数の多い道場から順にリスト化（ラウンドロビン方式）
  const dojoEntries = Object.entries(byDojo).sort((a, b) => b[1].length - a[1].length);
  const orderedPlayers: Player[] = [];
  let maxLen = Math.max(...dojoEntries.map(e => e[1].length));

  for (let round = 0; round < maxLen; round++) {
    for (const [, dojoPlayers] of dojoEntries) {
      if (round < dojoPlayers.length) {
        orderedPlayers.push(dojoPlayers[round]);
      }
    }
  }

  // ブラケット位置を「分散配置順」に生成
  // 例: 8枠の場合 → [0, 7, 3, 4, 1, 6, 2, 5]（対角配置）
  function getPlacementOrder(size: number): number[] {
    if (size === 1) return [0];
    if (size === 2) return [0, 1];

    const order: number[] = [];
    const half = size / 2;
    const topOrder = getPlacementOrder(half);
    const bottomOrder = getPlacementOrder(half);

    // 交互に上半分と下半分に配置
    for (let i = 0; i < half; i++) {
      if (i < topOrder.length) order.push(topOrder[i]);
      if (i < bottomOrder.length) order.push(bottomOrder[i] + half);
    }
    return order;
  }

  const placementOrder = getPlacementOrder(bracketSize);

  // 配置順に選手を入れる
  for (let i = 0; i < orderedPlayers.length; i++) {
    if (i < placementOrder.length) {
      slots[placementOrder[i]] = orderedPlayers[i];
    }
  }

  return slots;
}

// BYE付きブラケット生成 + 3位決定戦（同道場分離シード配置付き）
export function generateBracket(
  advPlayers: Player[],
  categoryId: string,
  phaseKey: PhaseType,
  hasThirdPlace: boolean = false
): { matches: Match[]; totalRounds: number; bracketSize: number; hasThirdPlace: boolean } {
  const n = advPlayers.length;
  if (n < 2) return { matches: [], totalRounds: 0, bracketSize: 0, hasThirdPlace: false };

  let size = 1;
  while (size < n) size *= 2;
  const totalRounds = Math.log2(size);

  // 同道場分離シード配置
  const slots = seedPlayersWithSeparation(advPlayers, size);

  const matches: Match[] = [];
  let num = 1;

  // 1回戦
  for (let i = 0; i < size; i += 2) {
    const pA = slots[i];
    const pB = slots[i + 1];
    const isBye = !pA || !pB;
    const winnerId = isBye ? (pA?.id || pB?.id || null) : null;
    const winnerName = isBye ? (pA?.name || pB?.name || null) : null;

    matches.push({
      id: generateId(),
      categoryId,
      round: 1,
      matchNumber: num++,
      position: i / 2,
      type: 'tournament',
      phaseKey,
      playerA: pA ? { id: pA.id, name: pA.name, nameKana: pA.nameKana, dojo: pA.dojo } : null,
      playerB: pB ? { id: pB.id, name: pB.name, nameKana: pB.nameKana, dojo: pB.dojo } : null,
      scoreA: 0,
      scoreB: 0,
      warningsA: 0,
      warningsB: 0,
      winnerId,
      winnerName,
      resultType: isBye ? RESULT.DEFAULT_WIN : null,
      isBye,
      status: isBye ? 'completed' : 'pending',
      venueId: null,
      sourceMatchA: null,
      sourceMatchB: null,
      isThirdPlace: false,
    });
  }

  // 2回戦以降
  for (let round = 2; round <= totalRounds; round++) {
    const prev = matches.filter(m => m.round === round - 1 && !m.isThirdPlace);
    for (let i = 0; i < prev.length; i += 2) {
      const m1 = prev[i];
      const m2 = prev[i + 1];
      matches.push({
        id: generateId(),
        categoryId,
        round,
        matchNumber: num++,
        position: i / 2,
        type: 'tournament',
        phaseKey,
        playerA: m1?.isBye ? { id: m1.winnerId!, name: m1.winnerName!, dojo: m1.playerA?.dojo || m1.playerB?.dojo } : null,
        playerB: m2?.isBye ? { id: m2.winnerId!, name: m2.winnerName!, dojo: m2.playerA?.dojo || m2.playerB?.dojo } : null,
        scoreA: 0,
        scoreB: 0,
        warningsA: 0,
        warningsB: 0,
        winnerId: null,
        winnerName: null,
        resultType: null,
        isBye: false,
        status: 'pending',
        venueId: null,
        sourceMatchA: m1?.id || null,
        sourceMatchB: m2?.id || null,
        isThirdPlace: false,
      });
    }
  }

  // 3位決定戦（準決勝敗者同士）
  if (hasThirdPlace && totalRounds >= 2) {
    const semiFinals = matches.filter(m => m.round === totalRounds - 1 && !m.isThirdPlace);
    if (semiFinals.length === 2) {
      matches.push({
        id: generateId(),
        categoryId,
        round: totalRounds,
        matchNumber: num++,
        position: 99,
        type: 'tournament',
        phaseKey,
        playerA: null,
        playerB: null,
        scoreA: 0,
        scoreB: 0,
        warningsA: 0,
        warningsB: 0,
        winnerId: null,
        winnerName: null,
        resultType: null,
        isBye: false,
        status: 'pending',
        venueId: null,
        sourceMatchA: semiFinals[0].id,
        sourceMatchB: semiFinals[1].id,
        isThirdPlace: true,
      });
    }
  }

  return { matches, totalRounds, bracketSize: size, hasThirdPlace };
}

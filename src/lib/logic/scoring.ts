// ==========================================
// スコア計算ロジック
// ==========================================

import type { MatchPlayer, ResultType } from '../types';
import { RESULT } from '../constants';

interface ScoreInput {
  scoreA: number;
  scoreB: number;
  warningsA: number;
  warningsB: number;
  resultType: ResultType;
  defaultWinSide?: 'A' | 'B';
  disqSide?: 'A' | 'B';
  playerA: MatchPlayer;
  playerB: MatchPlayer;
}

interface ScoreResult {
  finalScoreA: number;
  finalScoreB: number;
  winnerId: string | null;
  winnerName: string | null;
}

// 最終スコア計算（警告ボーナス含む）
export function calculateFinalScores(input: ScoreInput): ScoreResult {
  const { scoreA, scoreB, warningsA, warningsB, resultType, defaultWinSide, disqSide, playerA, playerB } = input;

  // 警告ボーナス: 2回で相手に+1本
  const bonusA = Math.floor(warningsB / 2);
  const bonusB = Math.floor(warningsA / 2);

  let finalScoreA: number;
  let finalScoreB: number;
  let winnerId: string | null = null;
  let winnerName: string | null = null;

  switch (resultType) {
    case RESULT.NORMAL:
      finalScoreA = scoreA + bonusA;
      finalScoreB = scoreB + bonusB;
      if (finalScoreA > finalScoreB) {
        winnerId = playerA.id;
        winnerName = playerA.name;
      } else if (finalScoreB > finalScoreA) {
        winnerId = playerB.id;
        winnerName = playerB.name;
      }
      // 同点の場合: リーグ戦は引き分け（winner無し）
      break;

    case RESULT.DRAW:
      finalScoreA = scoreA + bonusA;
      finalScoreB = scoreB + bonusB;
      // 引き分け: 勝者なし
      break;

    case RESULT.DEFAULT_WIN:
      // 不戦勝: 2-0
      finalScoreA = defaultWinSide === 'A' ? 2 : 0;
      finalScoreB = defaultWinSide === 'B' ? 2 : 0;
      winnerId = defaultWinSide === 'A' ? playerA.id : playerB.id;
      winnerName = defaultWinSide === 'A' ? playerA.name : playerB.name;
      break;

    case RESULT.DISQUALIFICATION:
      // 失格: 0-2
      finalScoreA = disqSide === 'A' ? 0 : 2;
      finalScoreB = disqSide === 'B' ? 0 : 2;
      winnerId = disqSide === 'A' ? playerB.id : playerA.id;
      winnerName = disqSide === 'A' ? playerB.name : playerA.name;
      break;

    default:
      finalScoreA = 0;
      finalScoreB = 0;
  }

  return { finalScoreA, finalScoreB, winnerId, winnerName };
}

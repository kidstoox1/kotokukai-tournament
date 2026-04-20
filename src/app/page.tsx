'use client';

import { useState, useMemo, useCallback, useEffect, useRef, createContext, useContext } from 'react';
import { useTournamentStore } from '@/store/tournament';
import { saveToSupabase, loadFromSupabase, subscribeToChanges } from '@/lib/sync';
import {
  VENUES,
  PHASE_TYPES,
  PHASE_LABELS,
  PHASE_COLORS,
  START_FORMATS,
  NEXT_PHASE_OPTIONS,
  RESULT,
  RED,
  WHITE_PLAYER,
  WHITE_BG,
  WHITE_BORDER,
} from '@/lib/constants';
import { matchTypeLabel, matchTypeColor, isFinalMatch } from '@/lib/helpers';
import { calcStandings } from '@/lib/logic/league';
import { getFinalRankings, getLeagueFinalRankings } from '@/lib/logic/rankings';
import { calculateFinalScores } from '@/lib/logic/scoring';
import { generateId } from '@/lib/uuid';
import type { Match, PhaseType, FinalRanking, LeagueStanding, Player, TournamentData, Team, TeamMatch, TeamBout, BoutPosition, TeamMember, OvertimeResult } from '@/lib/types';

// ==========================================
// ページ種別
// ==========================================
type PageType = 'admin' | 'referee' | 'monitor' | 'spectator';
type RoleType = 'admin' | 'recorder' | 'viewer';

// ==========================================
// 共通UIコンポーネント
// ==========================================

function StatCard({ value, label, color }: { value: string | number; label: string; color: string }) {
  return (
    <div className="bg-white/[0.03] border border-white/[0.07] rounded-[10px] p-3 text-center">
      <div className="text-[28px] font-extrabold leading-none" style={{ color }}>{value}</div>
      <div className="text-[10px] text-gray-400 mt-1">{label}</div>
    </div>
  );
}

function ProgressBar({ pct, color = '#B91C1C' }: { pct: number; color?: string }) {
  return (
    <div className="h-[5px] rounded-[3px] bg-white/[0.06] overflow-hidden">
      <div
        className="h-full rounded-[3px] transition-[width] duration-500"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  );
}

function PhaseTag({ phase }: { phase: PhaseType }) {
  const pc = PHASE_COLORS[phase] || PHASE_COLORS.setup;
  return (
    <span
      className="inline-block px-[10px] py-[3px] rounded-xl text-[10px] font-bold"
      style={{ background: pc.bg, color: pc.text, border: `1px solid ${pc.border}` }}
    >
      {PHASE_LABELS[phase]}
    </span>
  );
}

function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span
      className="inline-block px-2 py-[2px] rounded-[10px] text-[10px] font-semibold"
      style={{ background: `${color}20`, color, border: `1px solid ${color}40` }}
    >
      {children}
    </span>
  );
}

// ふりがな付き名前表示（ルビタグ使用）
function NameWithKana({ name, kana, size = 'md' }: { name: string; kana?: string; size?: 'sm' | 'md' | 'lg' }) {
  if (!kana) return <span>{name}</span>;
  const rubySize = size === 'sm' ? '7px' : size === 'lg' ? '9px' : '8px';
  return (
    <ruby>
      {name}
      <rp>(</rp>
      <rt style={{ fontSize: rubySize, color: '#9CA3AF', fontWeight: 400, letterSpacing: '0.02em' }}>{kana}</rt>
      <rp>)</rp>
    </ruby>
  );
}

// 警告表示ヘルパー: スコアの横に警告数を小さく表示
function WarningIndicator({ warnings }: { warnings: number }) {
  if (!warnings || warnings === 0) return null;
  return (
    <span className="text-[9px] text-amber-500 font-bold ml-0.5">⚠{warnings}</span>
  );
}

// スコア + 警告を一括表示するヘルパー（延長戦があれば2行目に表示）
function ScoreWithWarnings({ match }: { match: Match }) {
  if (match.status !== 'completed') return <span>vs</span>;
  const hasWarnings = (match.warningsA || 0) > 0 || (match.warningsB || 0) > 0;
  const mainScore = !hasWarnings ? (
    <span>{match.scoreA} - {match.scoreB}</span>
  ) : (
    <span className="inline-flex items-center gap-0.5">
      <span>{match.scoreA}</span>
      {(match.warningsA || 0) > 0 && <WarningIndicator warnings={match.warningsA} />}
      <span> - </span>
      <span>{match.scoreB}</span>
      {(match.warningsB || 0) > 0 && <WarningIndicator warnings={match.warningsB} />}
    </span>
  );
  if (!match.overtime) return mainScore;
  const ot = match.overtime;
  const hasOtWarnings = (ot.warningsA || 0) > 0 || (ot.warningsB || 0) > 0;
  return (
    <span className="inline-flex flex-col items-center leading-tight">
      {mainScore}
      <span className="text-[9px] text-amber-400 font-semibold inline-flex items-center gap-0.5 mt-0.5">
        <span className="text-[8px] text-amber-300/70 mr-0.5">延長</span>
        <span>{ot.scoreA}</span>
        {(ot.warningsA || 0) > 0 && <WarningIndicator warnings={ot.warningsA} />}
        <span>-</span>
        <span>{ot.scoreB}</span>
        {(ot.warningsB || 0) > 0 && <WarningIndicator warnings={ot.warningsB} />}
        {!hasOtWarnings && null}
      </span>
    </span>
  );
}

// ==========================================
// 順位表テーブル
// ==========================================
function StandingsTable({
  standings,
  groupIdx,
  advanceCount = 2,
}: {
  standings: LeagueStanding[];
  groupIdx: number;
  advanceCount?: number;
}) {
  return (
    <div className="mb-3">
      <div className="text-[11px] font-bold text-gray-400 mb-1.5">
        グループ {String.fromCharCode(65 + groupIdx)}
      </div>
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr>
            <th className="p-2 text-left border-b border-white/10 text-gray-400 font-semibold text-[10px] uppercase w-[30px]">順位</th>
            <th className="p-2 text-left border-b border-white/10 text-gray-400 font-semibold text-[10px] uppercase">選手名</th>
            <th className="p-2 text-left border-b border-white/10 text-gray-400 font-semibold text-[10px] uppercase">所属</th>
            <th className="p-2 text-center border-b border-white/10 text-gray-400 font-semibold text-[10px] uppercase">勝</th>
            <th className="p-2 text-center border-b border-white/10 text-gray-400 font-semibold text-[10px] uppercase">敗</th>
            <th className="p-2 text-center border-b border-white/10 text-gray-400 font-semibold text-[10px] uppercase">分</th>
            <th className="p-2 text-center border-b border-white/10 text-gray-400 font-semibold text-[10px] uppercase">取本</th>
            <th className="p-2 text-center border-b border-white/10 text-gray-400 font-semibold text-[10px] uppercase">失本</th>
            <th className="p-2 text-center border-b border-white/10 text-gray-400 font-semibold text-[10px] uppercase">警告</th>
            <th className="p-2 text-center border-b border-white/10 text-gray-400 font-semibold text-[10px] uppercase">勝点</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((s, i) => (
            <tr
              key={s.id}
              style={{ background: i < advanceCount ? 'rgba(34,197,94,0.06)' : 'transparent' }}
            >
              <td className="p-2 border-b border-white/[0.04] font-bold" style={{ color: i < advanceCount ? '#22C55E' : '#9CA3AF' }}>{i + 1}</td>
              <td className="p-2 border-b border-white/[0.04] font-semibold text-white"><NameWithKana name={s.name} kana={s.nameKana} size="sm" /></td>
              <td className="p-2 border-b border-white/[0.04] text-[11px] text-gray-300">{s.dojo}</td>
              <td className="p-2 border-b border-white/[0.04] text-center text-green-500">{s.wins}</td>
              <td className="p-2 border-b border-white/[0.04] text-center text-red-500">{s.losses}</td>
              <td className="p-2 border-b border-white/[0.04] text-center text-gray-300">{s.draws}</td>
              <td className="p-2 border-b border-white/[0.04] text-center text-blue-400">{s.ipponFor}</td>
              <td className="p-2 border-b border-white/[0.04] text-center text-orange-400">{s.ipponAgainst}</td>
              <td className="p-2 border-b border-white/[0.04] text-center text-yellow-500">{s.totalWarnings > 0 ? s.totalWarnings : '-'}</td>
              <td className="p-2 border-b border-white/[0.04] text-center font-bold text-amber-500">{s.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="text-[9px] text-gray-500 mt-1">
        ※ 上位{advanceCount}名（緑表示）が次ステージ進出　｜　順位決定: 勝点→取本→失本(少)→警告(少)
      </div>
    </div>
  );
}

// ==========================================
// リーグ戦の対戦表（NxN マトリクス）
// 行 × 列 = 選手同士の対戦。行の選手視点で表示。
// - 完了: 勝/負/分 + 本数（その行の選手視点）
// - 進行中: 赤背景「進行中」
// - 未実施: #試合番号
// - 対角線: —
// ==========================================
function LeagueMatrix({
  group,
  matches,
  title,
  highlightPlayerId,
}: {
  group: Player[];
  matches: Match[];
  title?: string;
  highlightPlayerId?: string | null;
}) {
  if (group.length < 2 || matches.length === 0) return null;

  // プレイヤーID → グループ内インデックス
  const idToIdx: Record<string, number> = {};
  group.forEach((p, i) => { idToIdx[p.id] = i; });

  // 試合番号付きで (i,j) にマッピング
  type Cell = { match: Match; matchNo: number };
  const cells: (Cell | null)[][] = Array.from({ length: group.length }, () =>
    Array(group.length).fill(null)
  );
  matches.forEach((m, idx) => {
    const aId = m.playerA?.id;
    const bId = m.playerB?.id;
    if (!aId || !bId) return;
    const i = idToIdx[aId];
    const j = idToIdx[bId];
    if (i === undefined || j === undefined) return;
    const c: Cell = { match: m, matchNo: idx + 1 };
    cells[i][j] = c;
    cells[j][i] = c;
  });

  const shortName = (name: string) => {
    // 全角/半角空白を除去して短縮表示に（長い名前はテーブルを崩す）
    return name.replace(/[\s　]+/g, '');
  };

  return (
    <div className="mb-3">
      {title && <div className="text-[11px] font-bold text-gray-400 mb-1.5">{title}</div>}
      <div className="overflow-x-auto">
        <table className="border-collapse text-[10px]">
          <thead>
            <tr>
              <th className="p-1 border border-white/10 bg-white/[0.04] min-w-[70px]"></th>
              {group.map(p => {
                const isHL = highlightPlayerId === p.id;
                return (
                  <th
                    key={p.id}
                    className="p-1 border border-white/10 font-semibold text-[9px] min-w-[56px] max-w-[80px]"
                    style={{
                      background: isHL ? 'rgba(185,28,28,0.15)' : 'rgba(255,255,255,0.04)',
                      color: isHL ? '#FCA5A5' : '#D1D5DB',
                    }}
                  >
                    <div className="truncate">{shortName(p.name)}</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {group.map((rp, i) => {
              const rowHL = highlightPlayerId === rp.id;
              return (
                <tr key={rp.id}>
                  <th
                    className="p-1 border border-white/10 font-semibold text-[9px] text-left min-w-[70px] max-w-[90px]"
                    style={{
                      background: rowHL ? 'rgba(185,28,28,0.15)' : 'rgba(255,255,255,0.04)',
                      color: rowHL ? '#FCA5A5' : '#D1D5DB',
                    }}
                  >
                    <div className="truncate">{shortName(rp.name)}</div>
                  </th>
                  {group.map((_cp, j) => {
                    if (i === j) {
                      return (
                        <td
                          key={j}
                          className="p-1 border border-white/10 text-center text-gray-600"
                          style={{ background: 'rgba(255,255,255,0.02)' }}
                        >
                          —
                        </td>
                      );
                    }
                    const cell = cells[i][j];
                    if (!cell) {
                      return <td key={j} className="p-1 border border-white/10"></td>;
                    }
                    const m = cell.match;
                    const isCompleted = m.status === 'completed';
                    const isActive = m.status === 'active';
                    const rowIsA = m.playerA?.id === rp.id;
                    const myScore = rowIsA ? m.scoreA : m.scoreB;
                    const oppScore = rowIsA ? m.scoreB : m.scoreA;
                    const won = isCompleted && m.winnerId === rp.id;
                    const lost = isCompleted && m.winnerId && m.winnerId !== rp.id;
                    const drew = isCompleted && !m.winnerId && !m.overtime;
                    return (
                      <td
                        key={j}
                        className="p-1 border border-white/10 text-center"
                        style={{
                          background: isActive
                            ? 'rgba(239,68,68,0.18)'
                            : won ? 'rgba(34,197,94,0.1)'
                            : lost ? 'rgba(239,68,68,0.06)'
                            : drew ? 'rgba(245,158,11,0.08)'
                            : 'rgba(255,255,255,0.02)',
                        }}
                      >
                        {isCompleted ? (
                          <div className="leading-tight">
                            <div
                              className="text-[9px] font-bold"
                              style={{ color: won ? '#22C55E' : lost ? '#EF4444' : '#F59E0B' }}
                            >
                              {won ? '勝' : lost ? '負' : '分'}
                            </div>
                            <div className="text-[10px] font-bold text-white">
                              {myScore}-{oppScore}
                              {m.overtime && <span className="text-amber-400 text-[8px]">*</span>}
                            </div>
                          </div>
                        ) : isActive ? (
                          <div className="text-[9px] font-bold text-red-400 animate-pulse">進行中</div>
                        ) : (
                          <div className="text-[9px] text-gray-400">#{cell.matchNo}</div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="text-[9px] text-gray-500 mt-1">
        ※ 行の選手視点で勝/負/分と本数を表示　｜　#番号 = 対戦順　｜　* = 延長戦あり
      </div>
    </div>
  );
}

// ==========================================
// 試合予定リスト（試合順 + ステータス）
// 「自分の注目する選手がどのタイミングで試合に出るか」を把握するための簡易ビュー。
// ==========================================
function MatchScheduleList({
  matches,
  categoriesLabel,
  highlightPlayerId,
  tournamentData,
  compact = false,
}: {
  matches: Match[];
  categoriesLabel?: (catId: string) => string;
  highlightPlayerId?: string | null;
  tournamentData?: Record<string, TournamentData>;
  compact?: boolean;
}) {
  if (matches.length === 0) {
    return <div className="text-[11px] text-gray-500 text-center py-2">試合予定なし</div>;
  }
  return (
    <div className="flex flex-col gap-1">
      {matches.map((m, idx) => {
        const no = idx + 1;
        const isCompleted = m.status === 'completed';
        const isActive = m.status === 'active';
        const isHL = !!(highlightPlayerId && (m.playerA?.id === highlightPlayerId || m.playerB?.id === highlightPlayerId));
        const typeLabel = m.isThirdPlace
          ? '3位決定戦'
          : m.type === 'league'
            ? `${String.fromCharCode(65 + (m.groupIndex || 0))}グループ`
            : (tournamentData ? matchTypeLabel(m, tournamentData) : 'トーナメント');
        return (
          <div
            key={m.id}
            className={`flex items-center gap-2 ${compact ? 'px-2 py-1' : 'px-2.5 py-1.5'} rounded-md`}
            style={{
              background: isActive
                ? 'rgba(239,68,68,0.08)'
                : isCompleted
                  ? 'rgba(34,197,94,0.04)'
                  : isHL
                    ? 'rgba(185,28,28,0.08)'
                    : 'rgba(255,255,255,0.02)',
              border: `1px solid ${
                isActive ? 'rgba(239,68,68,0.25)'
                : isCompleted ? 'rgba(34,197,94,0.1)'
                : isHL ? 'rgba(185,28,28,0.2)'
                : 'rgba(255,255,255,0.05)'
              }`,
            }}
          >
            <div
              className="flex-shrink-0 w-7 text-center font-bold text-[11px]"
              style={{ color: isActive ? '#EF4444' : isCompleted ? '#22C55E' : '#9CA3AF' }}
            >
              {no}
            </div>
            {categoriesLabel ? (
              <div className="min-w-[90px]">
                <div className="text-[10px] font-semibold text-gray-300 truncate">
                  {categoriesLabel(m.categoryId)}
                </div>
                <div className="text-[9px] font-bold" style={{ color: matchTypeColor(m) }}>
                  {typeLabel}
                </div>
              </div>
            ) : (
              <div className="min-w-[70px]">
                <div className="text-[10px] font-bold" style={{ color: matchTypeColor(m) }}>
                  {typeLabel}
                </div>
              </div>
            )}
            <div className="flex-1 text-[11px] min-w-0">
              <span
                className="truncate inline-block max-w-full"
                style={{
                  fontWeight: (highlightPlayerId && m.playerA?.id === highlightPlayerId) ? 700 : 400,
                  color: (highlightPlayerId && m.playerA?.id === highlightPlayerId) ? '#FCA5A5' : '#D1D5DB',
                }}
              >
                {m.playerA ? <NameWithKana name={m.playerA.name} kana={m.playerA.nameKana} size="sm" /> : '—'}
              </span>
              <span className="text-gray-600 mx-1">vs</span>
              <span
                className="truncate inline-block max-w-full"
                style={{
                  fontWeight: (highlightPlayerId && m.playerB?.id === highlightPlayerId) ? 700 : 400,
                  color: (highlightPlayerId && m.playerB?.id === highlightPlayerId) ? '#FCA5A5' : '#D1D5DB',
                }}
              >
                {m.playerB ? <NameWithKana name={m.playerB.name} kana={m.playerB.nameKana} size="sm" /> : '—'}
              </span>
            </div>
            <div className="flex-shrink-0 text-[9px] font-bold">
              {isActive ? (
                <Badge color="#EF4444">進行中</Badge>
              ) : isCompleted ? (
                <span className="inline-flex items-center gap-1">
                  <span className="text-white font-bold text-[10px]">{m.scoreA}-{m.scoreB}</span>
                  {m.overtime && <span className="text-amber-400 text-[8px]">延長</span>}
                </span>
              ) : (
                <Badge color="#9CA3AF">待機</Badge>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ==========================================
// 最終順位表示
// ==========================================
function FinalRankingsDisplay({ rankings }: { rankings: FinalRanking[] }) {
  if (!rankings || rankings.length === 0) return null;
  const medalColors: Record<number, string> = { 1: '#FFD700', 2: '#C0C0C0', 3: '#CD7F32' };
  const medalBg: Record<number, string> = { 1: 'rgba(255,215,0,0.08)', 2: 'rgba(192,192,192,0.06)', 3: 'rgba(205,127,50,0.06)' };
  const medalBorder: Record<number, string> = { 1: 'rgba(255,215,0,0.25)', 2: 'rgba(192,192,192,0.2)', 3: 'rgba(205,127,50,0.2)' };
  const rankLabel = (rank: number) => rank === 1 ? '優勝' : rank === 2 ? '準優勝' : '第3位';
  const allSameRank = rankings.every(r => r.rank === rankings[0].rank);

  return (
    <div className="mb-3.5 p-3.5 rounded-[10px]" style={{ background: 'rgba(255,215,0,0.04)', border: '1px solid rgba(255,215,0,0.12)' }}>
      <div className="text-sm font-extrabold text-center mb-1" style={{ color: '#FFD700' }}>
        最終結果
      </div>
      {allSameRank && rankings.length > 1 && (
        <div className="text-[10px] text-amber-500 text-center mb-2">※ 同率のため全員同順位</div>
      )}
      <div className="flex gap-2 justify-center flex-wrap">
        {rankings.map((r, idx) => (
          <div
            key={r.id || idx}
            className="flex-1 min-w-[120px] max-w-[180px] py-3 px-2.5 rounded-[10px] text-center"
            style={{ background: medalBg[r.rank], border: `1.5px solid ${medalBorder[r.rank]}` }}
          >
            <div className="text-[28px] leading-none">{r.medal}</div>
            <div className="text-[10px] font-bold mt-1" style={{ color: medalColors[r.rank] }}>
              {rankLabel(r.rank)}
            </div>
            <div className="text-[15px] font-extrabold text-white mt-1"><NameWithKana name={r.name} kana={r.nameKana} /></div>
            <div className="text-[10px] text-gray-400 mt-0.5">{r.dojo}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ==========================================
// トーナメントブラケット
// ==========================================
function BracketView({ matches, totalRounds }: { matches: Match[]; totalRounds: number }) {
  if (!totalRounds) return null;
  const roundName = (r: number, t: number) => {
    if (r === t) return '決勝';
    if (r === t - 1) return '準決勝';
    if (r === t - 2) return '準々決勝';
    return `${r}回戦`;
  };
  const normalMatches = matches.filter(m => !m.isThirdPlace);
  const thirdPlaceMatch = matches.find(m => m.isThirdPlace);

  return (
    <div>
      <div className="flex gap-4 overflow-x-auto py-2">
        {Array.from({ length: totalRounds }, (_, i) => i + 1).map(round => {
          const rm = normalMatches
            .filter(m => m.round === round)
            .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
          return (
            <div key={round} className="min-w-[170px] flex flex-col gap-1.5">
              <div className="text-[11px] font-bold text-gray-400 text-center pb-1.5 border-b border-white/[0.08]">
                {roundName(round, totalRounds)}
              </div>
              <div className="flex flex-col gap-1.5 justify-around flex-1">
                {rm.map(m => (
                  <div
                    key={m.id}
                    className="rounded-md px-2 py-[5px] text-[11px]"
                    style={{
                      background: m.status === 'completed' ? 'rgba(34,197,94,0.05)' : m.status === 'active' ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.02)',
                      border: `1px solid ${m.status === 'completed' ? 'rgba(34,197,94,0.15)' : m.status === 'active' ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.05)'}`,
                    }}
                  >
                    {m.isBye ? (
                      <div className="text-gray-500 text-[10px] p-[2px]">{m.playerA ? <NameWithKana name={m.playerA.name} kana={m.playerA.nameKana} size="sm" /> : m.playerB ? <NameWithKana name={m.playerB.name} kana={m.playerB.nameKana} size="sm" /> : '—'} (BYE)</div>
                    ) : (
                      <>
                        <div
                          className="px-1 py-[2px] rounded-[3px] flex justify-between items-center"
                          style={{
                            background: m.winnerId === m.playerA?.id ? 'rgba(34,197,94,0.1)' : 'transparent',
                            color: m.winnerId === m.playerA?.id ? '#22C55E' : '#D1D5DB',
                            fontWeight: m.winnerId === m.playerA?.id ? 600 : 400,
                          }}
                        >
                          <span>{m.playerA ? <NameWithKana name={m.playerA.name} kana={m.playerA.nameKana} size="sm" /> : '—'}</span>
                          {m.status === 'completed' && <span className="flex items-center">{m.scoreA}{(m.warningsA || 0) > 0 && <WarningIndicator warnings={m.warningsA} />}</span>}
                        </div>
                        <div className="text-center text-[9px] text-gray-600 py-[1px]">vs</div>
                        <div
                          className="px-1 py-[2px] rounded-[3px] flex justify-between items-center"
                          style={{
                            background: m.winnerId === m.playerB?.id ? 'rgba(34,197,94,0.1)' : 'transparent',
                            color: m.winnerId === m.playerB?.id ? '#22C55E' : '#D1D5DB',
                            fontWeight: m.winnerId === m.playerB?.id ? 600 : 400,
                          }}
                        >
                          <span>{m.playerB ? <NameWithKana name={m.playerB.name} kana={m.playerB.nameKana} size="sm" /> : '—'}</span>
                          {m.status === 'completed' && <span className="flex items-center">{m.scoreB}{(m.warningsB || 0) > 0 && <WarningIndicator warnings={m.warningsB} />}</span>}
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* 3位決定戦 */}
      {thirdPlaceMatch && (() => {
        const fromRunnerUp = !thirdPlaceMatch.sourceMatchA && thirdPlaceMatch.playerA;
        const sourceLabel = fromRunnerUp ? '各グループ2位同士' : '準決勝敗者同士';
        const placeholderText = fromRunnerUp ? '（各グループ2位）' : '（準決勝敗者）';
        return (
          <div className="mt-2 p-2.5 px-3 rounded-lg" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)' }}>
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className="text-[11px] font-bold text-amber-500">3位決定戦</span>
              <span className="text-[9px] text-gray-400">（{sourceLabel}）</span>
            </div>
            <div className="flex items-center gap-2.5 text-[13px]">
              <div className="flex-1 text-center">
                <span
                  className="text-sm"
                  style={{
                    fontWeight: thirdPlaceMatch.winnerId === thirdPlaceMatch.playerA?.id ? 700 : 500,
                    color: thirdPlaceMatch.winnerId === thirdPlaceMatch.playerA?.id ? '#22C55E' : '#D1D5DB',
                  }}
                >
                  {thirdPlaceMatch.playerA ? <NameWithKana name={thirdPlaceMatch.playerA.name} kana={thirdPlaceMatch.playerA.nameKana} size="sm" /> : placeholderText}
                </span>
                {thirdPlaceMatch.playerA?.dojo && (
                  <div className="text-[9px] text-gray-500">{thirdPlaceMatch.playerA.dojo}</div>
                )}
              </div>
              <span className="text-gray-600 font-extrabold text-sm">
                {thirdPlaceMatch.status === 'completed'
                  ? <ScoreWithWarnings match={thirdPlaceMatch} />
                  : 'VS'}
              </span>
              <div className="flex-1 text-center">
                <span
                  className="text-sm"
                  style={{
                    fontWeight: thirdPlaceMatch.winnerId === thirdPlaceMatch.playerB?.id ? 700 : 500,
                    color: thirdPlaceMatch.winnerId === thirdPlaceMatch.playerB?.id ? '#22C55E' : '#D1D5DB',
                  }}
                >
                  {thirdPlaceMatch.playerB ? <NameWithKana name={thirdPlaceMatch.playerB.name} kana={thirdPlaceMatch.playerB.nameKana} size="sm" /> : placeholderText}
                </span>
                {thirdPlaceMatch.playerB?.dojo && (
                  <div className="text-[9px] text-gray-500">{thirdPlaceMatch.playerB.dojo}</div>
                )}
              </div>
              <div className="flex-shrink-0">
                {thirdPlaceMatch.status === 'completed' && <Badge color="#F59E0B">完了</Badge>}
                {thirdPlaceMatch.status === 'active' && <Badge color="#EF4444">進行中</Badge>}
                {thirdPlaceMatch.status === 'pending' && thirdPlaceMatch.playerA && thirdPlaceMatch.playerB && <Badge color="#9CA3AF">待機</Badge>}
                {thirdPlaceMatch.status === 'pending' && (!thirdPlaceMatch.playerA || !thirdPlaceMatch.playerB) && <span className="text-[9px] text-gray-600">未確定</span>}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ==========================================
// 試合結果入力モーダル
// ==========================================
function MatchRecordModal({
  match,
  onClose,
  onSubmit,
}: {
  match: Match;
  onClose: () => void;
  onSubmit: (m: Match) => void;
}) {
  const { categories } = useTournamentStore();
  const isEdit = match.status === 'completed';
  const [scoreA, setScoreA] = useState(match.scoreA || 0);
  const [scoreB, setScoreB] = useState(match.scoreB || 0);
  const [warningsA, setWarningsA] = useState(match.warningsA || 0);
  const [warningsB, setWarningsB] = useState(match.warningsB || 0);
  const [resultType, setResultType] = useState(match.resultType || RESULT.NORMAL);
  const [defaultWinSide, setDefaultWinSide] = useState<'A' | 'B'>(
    match.resultType === RESULT.DEFAULT_WIN
      ? (match.winnerId === match.playerA?.id ? 'A' : 'B')
      : 'A'
  );
  const [disqSide, setDisqSide] = useState<'A' | 'B'>(
    match.resultType === RESULT.DISQUALIFICATION
      ? (match.winnerId === match.playerB?.id ? 'A' : 'B')
      : 'A'
  );

  // 延長戦関連 state
  const [overtimeMode, setOvertimeMode] = useState(!!match.overtime);
  const [otScoreA, setOtScoreA] = useState(match.overtime?.scoreA || 0);
  const [otScoreB, setOtScoreB] = useState(match.overtime?.scoreB || 0);
  const [otWarningsA, setOtWarningsA] = useState(match.overtime?.warningsA || 0);
  const [otWarningsB, setOtWarningsB] = useState(match.overtime?.warningsB || 0);
  const [showConfirm, setShowConfirm] = useState(false);

  // 延長戦の勝者判定（1本取る or 警告2で決着）
  const otWinnerId: string | null =
    otScoreA === 1 ? (match.playerA?.id || null)
    : otScoreB === 1 ? (match.playerB?.id || null)
    : otWarningsA >= 2 ? (match.playerB?.id || null)
    : otWarningsB >= 2 ? (match.playerA?.id || null)
    : null;
  const otWinnerName: string | null =
    otWinnerId === match.playerA?.id ? (match.playerA?.name || null)
    : otWinnerId === match.playerB?.id ? (match.playerB?.name || null)
    : null;

  // 最終スコア計算
  const bonusA = Math.floor(warningsB / 2);
  const bonusB = Math.floor(warningsA / 2);

  const finalScoreA = resultType === RESULT.NORMAL
    ? scoreA + bonusA
    : resultType === RESULT.DEFAULT_WIN
      ? (defaultWinSide === 'A' ? 2 : 0)
      : resultType === RESULT.DISQUALIFICATION
        ? (disqSide === 'A' ? 0 : 2)
        : scoreA + bonusA;

  const finalScoreB = resultType === RESULT.NORMAL
    ? scoreB + bonusB
    : resultType === RESULT.DEFAULT_WIN
      ? (defaultWinSide === 'B' ? 2 : 0)
      : resultType === RESULT.DISQUALIFICATION
        ? (disqSide === 'B' ? 0 : 2)
        : scoreB + bonusB;

  // メイン結果の計算（プレビュー用）
  const mainResult = match.playerA && match.playerB
    ? calculateFinalScores({
        scoreA, scoreB, warningsA, warningsB,
        resultType, defaultWinSide, disqSide,
        playerA: match.playerA, playerB: match.playerB,
      })
    : null;
  // メインが引き分けになるかどうか
  const mainIsDraw = resultType === RESULT.NORMAL
    && mainResult !== null
    && mainResult.finalScoreA === mainResult.finalScoreB;

  // 試合終了・結果確定ボタン → 確認ダイアログ表示
  const openConfirm = () => {
    if (!match.playerA || !match.playerB) return;
    setShowConfirm(true);
  };

  // 延長戦へ移行
  const goToOvertime = () => {
    setShowConfirm(false);
    setOvertimeMode(true);
  };

  // 最終的な submit 実行
  const doSubmit = () => {
    if (!match.playerA || !match.playerB || !mainResult) return;
    const finalResultType = mainIsDraw ? RESULT.DRAW : resultType;

    let overtimeData: OvertimeResult | undefined = undefined;
    let finalWinnerId = mainResult.winnerId;
    let finalWinnerName = mainResult.winnerName;
    if (overtimeMode && otWinnerId) {
      overtimeData = {
        scoreA: otScoreA,
        scoreB: otScoreB,
        warningsA: otWarningsA,
        warningsB: otWarningsB,
        winnerId: otWinnerId,
        winnerName: otWinnerName,
      };
      finalWinnerId = otWinnerId;
      finalWinnerName = otWinnerName;
    }

    onSubmit({
      ...match,
      scoreA: mainResult.finalScoreA,
      scoreB: mainResult.finalScoreB,
      warningsA,
      warningsB,
      resultType: finalResultType,
      winnerId: finalWinnerId,
      winnerName: finalWinnerName,
      overtime: overtimeData,
      status: 'completed',
    });
  };

  const resultTypes = [
    { type: RESULT.NORMAL, label: '通常（本数勝負）' },
    { type: RESULT.DEFAULT_WIN, label: '不戦勝' },
    { type: RESULT.DISQUALIFICATION, label: '失格' },
  ];

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[200]" onClick={onClose}>
      <div
        className="bg-modal-bg rounded-[14px] p-6 max-w-[650px] w-[95%] border border-white/10 max-h-[90vh] overflow-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* ヘッダー */}
        <div className="flex justify-between mb-4">
          <div>
            <h3 className="text-white text-base font-bold m-0">
              {isEdit ? '試合結果の修正' : '試合結果入力'}
            </h3>
            <div className="text-[13px] font-bold mt-1" style={{ color: matchTypeColor(match) }}>
              {categories.find(c => c.id === match.categoryId)?.label}
              {match.isThirdPlace
                ? ' — 3位決定戦'
                : match.type === 'league'
                  ? ` — ${String.fromCharCode(65 + (match.groupIndex || 0))}グループ`
                  : ' — トーナメント'}
            </div>
          </div>
          <button className="bg-transparent border-none text-gray-400 text-lg cursor-pointer" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* 結果タイプ選択 */}
        <div className="flex gap-1.5 mb-4 flex-wrap">
          {resultTypes.map(r => (
            <button
              key={r.type}
              onClick={() => setResultType(r.type)}
              className="px-3 py-1.5 rounded-md text-[11px] font-semibold cursor-pointer"
              style={{
                border: resultType === r.type ? '1px solid #60A5FA' : '1px solid rgba(255,255,255,0.1)',
                background: resultType === r.type ? 'rgba(96,165,250,0.15)' : 'rgba(255,255,255,0.03)',
                color: resultType === r.type ? '#60A5FA' : '#9CA3AF',
              }}
            >
              {r.label}
            </button>
          ))}
        </div>

        {/* 不戦勝選択 */}
        {resultType === RESULT.DEFAULT_WIN && (
          <div className="mb-4 p-2.5 rounded-lg" style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)' }}>
            <div className="text-[11px] text-green-500 font-semibold mb-2">不戦勝の選手を選択</div>
            <div className="flex gap-2">
              <button
                onClick={() => setDefaultWinSide('B')}
                className="flex-1 p-2.5 rounded-lg cursor-pointer text-center text-white font-semibold text-[13px]"
                style={{
                  border: defaultWinSide === 'B' ? `2px solid ${WHITE_PLAYER}` : '1px solid rgba(255,255,255,0.1)',
                  background: defaultWinSide === 'B' ? WHITE_BG : 'rgba(255,255,255,0.03)',
                }}
              >
                <span className="text-[10px] block mb-0.5" style={{ color: WHITE_PLAYER }}>白</span>
                {match.playerB?.name}
              </button>
              <button
                onClick={() => setDefaultWinSide('A')}
                className="flex-1 p-2.5 rounded-lg cursor-pointer text-center text-white font-semibold text-[13px]"
                style={{
                  border: defaultWinSide === 'A' ? `2px solid ${RED}` : '1px solid rgba(255,255,255,0.1)',
                  background: defaultWinSide === 'A' ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.03)',
                }}
              >
                <span className="text-[10px] block mb-0.5" style={{ color: RED }}>赤</span>
                {match.playerA?.name}
              </button>
            </div>
          </div>
        )}

        {/* 失格選択 */}
        {resultType === RESULT.DISQUALIFICATION && (
          <div className="mb-4 p-2.5 rounded-lg" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}>
            <div className="text-[11px] text-red-500 font-semibold mb-2">失格となる選手を選択</div>
            <div className="flex gap-2">
              <button
                onClick={() => setDisqSide('B')}
                className="flex-1 p-2.5 rounded-lg cursor-pointer text-center text-white font-semibold text-[13px]"
                style={{
                  border: disqSide === 'B' ? `2px solid ${WHITE_PLAYER}` : '1px solid rgba(255,255,255,0.1)',
                  background: disqSide === 'B' ? WHITE_BG : 'rgba(255,255,255,0.03)',
                }}
              >
                <span className="text-[10px] block mb-0.5" style={{ color: WHITE_PLAYER }}>白</span>
                {match.playerB?.name}
              </button>
              <button
                onClick={() => setDisqSide('A')}
                className="flex-1 p-2.5 rounded-lg cursor-pointer text-center text-white font-semibold text-[13px]"
                style={{
                  border: disqSide === 'A' ? '2px solid #EF4444' : '1px solid rgba(255,255,255,0.1)',
                  background: disqSide === 'A' ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.03)',
                }}
              >
                <span className="text-[10px] block mb-0.5" style={{ color: RED }}>赤</span>
                {match.playerA?.name}
              </button>
            </div>
          </div>
        )}

        {/* 通常スコア入力 */}
        {resultType === RESULT.NORMAL && (
          <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-start">
            {/* 白（左） */}
            <div className="p-3.5 rounded-[10px] text-center" style={{ border: `1px solid ${WHITE_BORDER}`, background: WHITE_BG }}>
              <div className="text-[10px] font-bold mb-1" style={{ color: WHITE_PLAYER }}>白</div>
              <div className="text-[15px] font-bold text-white flex items-center justify-center gap-1">
                {finalScoreB >= 1 && <span className="w-3 h-3 rounded-full inline-block border-2 border-white bg-white flex-shrink-0" />}
                {finalScoreB >= 2 && <span className="w-3 h-3 rounded-full inline-block border-2 border-white bg-white flex-shrink-0" />}
                <span>{match.playerB?.name}</span>
                {warningsB % 2 === 1 && <span className="w-3 h-3 rounded-full inline-block flex-shrink-0" style={{ background: '#F59E0B' }} />}
              </div>
              <div className="text-[10px] text-gray-400">{match.playerB?.dojo}</div>
              <div className="mt-2.5 mb-1 text-[10px] text-gray-400">取った本数</div>
              <div className="flex justify-center gap-1.5">
                {[0, 1, 2].map(n => (
                  <button
                    key={n}
                    onClick={() => setScoreB(n)}
                    className="w-[44px] h-[44px] rounded-[10px] text-lg font-extrabold flex items-center justify-center cursor-pointer"
                    style={{
                      border: scoreB === n ? `2px solid ${WHITE_PLAYER}` : '1px solid rgba(255,255,255,0.12)',
                      background: scoreB === n ? WHITE_BG : 'rgba(255,255,255,0.03)',
                      color: scoreB === n ? WHITE_PLAYER : '#9CA3AF',
                    }}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <div className="mt-2 mb-1 text-[10px] text-amber-500">白への警告</div>
              <div className="flex justify-center gap-1.5">
                {[0, 1, 2, 3, 4].map(n => (
                  <button
                    key={n}
                    onClick={() => setWarningsB(n)}
                    className="w-9 h-9 rounded-[10px] text-sm font-extrabold flex items-center justify-center cursor-pointer"
                    style={{
                      border: warningsB === n ? '2px solid #F59E0B' : '1px solid rgba(255,255,255,0.12)',
                      background: warningsB === n ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.03)',
                      color: warningsB === n ? '#F59E0B' : '#9CA3AF',
                    }}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <div className="text-xl font-extrabold text-gray-600 pt-10">VS</div>

            {/* 赤（右） */}
            <div className="p-3.5 rounded-[10px] text-center" style={{ border: `1px solid ${RED}40`, background: `${RED}08` }}>
              <div className="text-[10px] font-bold mb-1" style={{ color: RED }}>赤</div>
              <div className="text-[15px] font-bold text-white flex items-center justify-center gap-1">
                {finalScoreA >= 1 && <span className="w-3 h-3 rounded-full inline-block flex-shrink-0" style={{ background: RED }} />}
                {finalScoreA >= 2 && <span className="w-3 h-3 rounded-full inline-block flex-shrink-0" style={{ background: RED }} />}
                <span>{match.playerA?.name}</span>
                {warningsA % 2 === 1 && <span className="w-3 h-3 rounded-full inline-block flex-shrink-0" style={{ background: '#F59E0B' }} />}
              </div>
              <div className="text-[10px] text-gray-400">{match.playerA?.dojo}</div>
              <div className="mt-2.5 mb-1 text-[10px] text-gray-400">取った本数</div>
              <div className="flex justify-center gap-1.5">
                {[0, 1, 2].map(n => (
                  <button
                    key={n}
                    onClick={() => setScoreA(n)}
                    className="w-[44px] h-[44px] rounded-[10px] text-lg font-extrabold flex items-center justify-center cursor-pointer"
                    style={{
                      border: scoreA === n ? `2px solid ${RED}` : '1px solid rgba(255,255,255,0.12)',
                      background: scoreA === n ? `${RED}25` : 'rgba(255,255,255,0.03)',
                      color: scoreA === n ? RED : '#9CA3AF',
                    }}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <div className="mt-2 mb-1 text-[10px] text-amber-500">赤への警告</div>
              <div className="flex justify-center gap-1.5">
                {[0, 1, 2, 3, 4].map(n => (
                  <button
                    key={n}
                    onClick={() => setWarningsA(n)}
                    className="w-9 h-9 rounded-[10px] text-sm font-extrabold flex items-center justify-center cursor-pointer"
                    style={{
                      border: warningsA === n ? '2px solid #F59E0B' : '1px solid rgba(255,255,255,0.12)',
                      background: warningsA === n ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.03)',
                      color: warningsA === n ? '#F59E0B' : '#9CA3AF',
                    }}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 確定スコアプレビュー */}
        <div className="mt-4 px-4 py-3 rounded-[10px] bg-white/[0.04] border border-white/10">
          <div className="text-[10px] text-gray-400 font-semibold mb-2 text-center">確定スコア（プレビュー）</div>
          <div className="flex items-center justify-center gap-4">
            <div className="text-center">
              <div className="text-[10px] font-bold mb-0.5" style={{ color: WHITE_PLAYER }}>白 {match.playerB?.name}</div>
              <div
                className="text-[32px] font-extrabold"
                style={{ color: finalScoreB > finalScoreA ? '#22C55E' : finalScoreA === finalScoreB ? '#F59E0B' : '#D1D5DB' }}
              >
                {finalScoreB}
              </div>
            </div>
            <div className="text-lg text-gray-600 font-extrabold">-</div>
            <div className="text-center">
              <div className="text-[10px] font-bold mb-0.5" style={{ color: RED }}>赤 {match.playerA?.name}</div>
              <div
                className="text-[32px] font-extrabold"
                style={{ color: finalScoreA > finalScoreB ? '#22C55E' : finalScoreA === finalScoreB ? '#F59E0B' : '#D1D5DB' }}
              >
                {finalScoreA}
              </div>
            </div>
          </div>

          {/* 警告加算表示 */}
          {resultType === RESULT.NORMAL && (bonusA > 0 || bonusB > 0) && (
            <div className="mt-2 px-2.5 py-1.5 rounded-md text-[11px] text-amber-500 text-center" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.15)' }}>
              警告による加算：
              {bonusB > 0 && <span className="ml-1.5">赤の警告{warningsA}回 → <strong>白に+{bonusB}本（自動加算済）</strong></span>}
              {bonusA > 0 && bonusB > 0 && ' / '}
              {bonusA > 0 && <span className={bonusB > 0 ? '' : 'ml-1.5'}>白の警告{warningsB}回 → <strong>赤に+{bonusA}本（自動加算済）</strong></span>}
            </div>
          )}

          {/* 結果サマリー */}
          <div className="text-center mt-2 text-[13px] font-bold">
            {resultType === RESULT.DRAW ? (
              <span className="text-amber-500">引き分け</span>
            ) : resultType === RESULT.DEFAULT_WIN ? (
              <span className="text-green-500">
                {defaultWinSide === 'A' ? '赤' : '白'} {defaultWinSide === 'A' ? match.playerA?.name : match.playerB?.name} の不戦勝（2-0）
              </span>
            ) : resultType === RESULT.DISQUALIFICATION ? (
              <span className="text-red-500">
                {disqSide === 'A' ? '赤' : '白'} {disqSide === 'A' ? match.playerA?.name : match.playerB?.name} 失格（0-2）
              </span>
            ) : finalScoreB > finalScoreA ? (
              <span className="text-green-500">白 {match.playerB?.name} の勝ち</span>
            ) : finalScoreA > finalScoreB ? (
              <span className="text-green-500">赤 {match.playerA?.name} の勝ち</span>
            ) : (
              <span className="text-amber-500">引き分け</span>
            )}
          </div>
        </div>

        {/* 延長戦入力 */}
        {overtimeMode && (
          <div className="mt-4 px-4 py-3.5 rounded-[10px]" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.3)' }}>
            <div className="flex items-center justify-between mb-3">
              <div className="text-[13px] font-bold text-amber-400">延長戦</div>
              <button
                className="text-[11px] text-gray-400 hover:text-white bg-transparent border-none cursor-pointer underline"
                onClick={() => {
                  setOvertimeMode(false);
                  setOtScoreA(0); setOtScoreB(0);
                  setOtWarningsA(0); setOtWarningsB(0);
                }}
              >
                延長戦を取消
              </button>
            </div>
            <div className="text-[10px] text-gray-400 mb-3">
              1本を取るか、警告を2回受けた時点で決着（警告はリセット）
            </div>
            <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-start">
              {/* 白（左）延長 */}
              <div className="p-2.5 rounded-[10px] text-center" style={{ border: `1px solid ${WHITE_BORDER}`, background: WHITE_BG }}>
                <div className="text-[10px] font-bold mb-1" style={{ color: WHITE_PLAYER }}>白 {match.playerB?.name}</div>
                <div className="text-[9px] text-gray-400 mb-1">取った本数</div>
                <div className="flex justify-center gap-1.5">
                  {[0, 1].map(n => (
                    <button
                      key={n}
                      onClick={() => setOtScoreB(n)}
                      className="w-10 h-10 rounded-[8px] text-base font-extrabold flex items-center justify-center cursor-pointer"
                      style={{
                        border: otScoreB === n ? `2px solid ${WHITE_PLAYER}` : '1px solid rgba(255,255,255,0.12)',
                        background: otScoreB === n ? WHITE_BG : 'rgba(255,255,255,0.03)',
                        color: otScoreB === n ? WHITE_PLAYER : '#9CA3AF',
                      }}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <div className="mt-2 mb-1 text-[9px] text-amber-500">白への警告</div>
                <div className="flex justify-center gap-1.5">
                  {[0, 1, 2].map(n => (
                    <button
                      key={n}
                      onClick={() => setOtWarningsB(n)}
                      className="w-8 h-8 rounded-[8px] text-xs font-extrabold flex items-center justify-center cursor-pointer"
                      style={{
                        border: otWarningsB === n ? '2px solid #F59E0B' : '1px solid rgba(255,255,255,0.12)',
                        background: otWarningsB === n ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.03)',
                        color: otWarningsB === n ? '#F59E0B' : '#9CA3AF',
                      }}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              <div className="text-base font-extrabold text-gray-600 pt-8">VS</div>

              {/* 赤（右）延長 */}
              <div className="p-2.5 rounded-[10px] text-center" style={{ border: `1px solid ${RED}40`, background: `${RED}08` }}>
                <div className="text-[10px] font-bold mb-1" style={{ color: RED }}>赤 {match.playerA?.name}</div>
                <div className="text-[9px] text-gray-400 mb-1">取った本数</div>
                <div className="flex justify-center gap-1.5">
                  {[0, 1].map(n => (
                    <button
                      key={n}
                      onClick={() => setOtScoreA(n)}
                      className="w-10 h-10 rounded-[8px] text-base font-extrabold flex items-center justify-center cursor-pointer"
                      style={{
                        border: otScoreA === n ? `2px solid ${RED}` : '1px solid rgba(255,255,255,0.12)',
                        background: otScoreA === n ? `${RED}25` : 'rgba(255,255,255,0.03)',
                        color: otScoreA === n ? RED : '#9CA3AF',
                      }}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <div className="mt-2 mb-1 text-[9px] text-amber-500">赤への警告</div>
                <div className="flex justify-center gap-1.5">
                  {[0, 1, 2].map(n => (
                    <button
                      key={n}
                      onClick={() => setOtWarningsA(n)}
                      className="w-8 h-8 rounded-[8px] text-xs font-extrabold flex items-center justify-center cursor-pointer"
                      style={{
                        border: otWarningsA === n ? '2px solid #F59E0B' : '1px solid rgba(255,255,255,0.12)',
                        background: otWarningsA === n ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.03)',
                        color: otWarningsA === n ? '#F59E0B' : '#9CA3AF',
                      }}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {/* 延長戦の勝者プレビュー */}
            <div className="mt-3 text-center text-[12px] font-bold">
              {otWinnerId ? (
                <span className="text-green-500">
                  延長戦勝者: {otWinnerId === match.playerA?.id ? '赤' : '白'} {otWinnerName}
                </span>
              ) : (
                <span className="text-gray-500">※ 1本取るか警告2で決着</span>
              )}
            </div>
          </div>
        )}

        {/* ボタン */}
        <div className="flex justify-end gap-2 mt-4">
          <button
            className="px-3.5 py-[7px] rounded-md bg-gray-600 text-white text-xs font-semibold cursor-pointer border-none"
            onClick={onClose}
          >
            キャンセル
          </button>
          <button
            className="px-6 py-2.5 rounded-md text-white text-xs font-semibold border-none"
            style={{
              background: overtimeMode && !otWinnerId ? '#4B5563' : '#16A34A',
              cursor: overtimeMode && !otWinnerId ? 'not-allowed' : 'pointer',
              opacity: overtimeMode && !otWinnerId ? 0.6 : 1,
            }}
            disabled={overtimeMode && !otWinnerId}
            onClick={openConfirm}
          >
            {isEdit ? '修正を確定' : overtimeMode ? '延長戦 確定' : '試合終了・結果確定'}
          </button>
        </div>

        {/* 確認ダイアログ */}
        {showConfirm && (
          <div
            className="fixed inset-0 bg-black/70 flex items-center justify-center z-[300]"
            onClick={() => setShowConfirm(false)}
          >
            <div
              className="bg-modal-bg rounded-[14px] p-6 max-w-[420px] w-[92%] border border-white/10"
              onClick={e => e.stopPropagation()}
            >
              <h4 className="text-white text-base font-bold m-0 mb-3">試合結果の確定</h4>

              {/* 結果サマリー */}
              <div className="px-3 py-3 rounded-lg bg-white/[0.04] border border-white/10 mb-4">
                {/* 本戦スコア */}
                <div className="flex items-center justify-center gap-3 text-[14px] font-bold">
                  <span style={{ color: WHITE_PLAYER }}>白 {match.playerB?.name}</span>
                  <span className="text-white text-lg">
                    {mainResult?.finalScoreB} - {mainResult?.finalScoreA}
                  </span>
                  <span style={{ color: RED }}>赤 {match.playerA?.name}</span>
                </div>
                {/* 延長戦スコア */}
                {overtimeMode && otWinnerId && (
                  <div className="mt-2 pt-2 border-t border-white/10 flex items-center justify-center gap-3 text-[12px]">
                    <span className="text-amber-400 font-semibold">延長:</span>
                    <span className="text-white font-bold">{otScoreB} - {otScoreA}</span>
                    {(otWarningsA > 0 || otWarningsB > 0) && (
                      <span className="text-amber-400 text-[10px]">
                        警告 {otWarningsB}-{otWarningsA}
                      </span>
                    )}
                  </div>
                )}
                {/* 最終判定 */}
                <div className="text-center mt-2 text-[13px] font-bold">
                  {overtimeMode && otWinnerId ? (
                    <span className="text-green-500">
                      {otWinnerId === match.playerA?.id ? '赤' : '白'} {otWinnerName} の勝ち（延長戦）
                    </span>
                  ) : resultType === RESULT.DEFAULT_WIN ? (
                    <span className="text-green-500">
                      {defaultWinSide === 'A' ? '赤' : '白'} {defaultWinSide === 'A' ? match.playerA?.name : match.playerB?.name} の不戦勝
                    </span>
                  ) : resultType === RESULT.DISQUALIFICATION ? (
                    <span className="text-red-500">
                      {disqSide === 'A' ? '赤' : '白'} {disqSide === 'A' ? match.playerA?.name : match.playerB?.name} 失格
                    </span>
                  ) : mainResult && mainResult.finalScoreA > mainResult.finalScoreB ? (
                    <span className="text-green-500">赤 {match.playerA?.name} の勝ち</span>
                  ) : mainResult && mainResult.finalScoreB > mainResult.finalScoreA ? (
                    <span className="text-green-500">白 {match.playerB?.name} の勝ち</span>
                  ) : (
                    <span className="text-amber-500">引き分け</span>
                  )}
                </div>
              </div>

              <div className="text-[12px] text-gray-400 mb-4 text-center">この内容で確定しますか？</div>

              {/* ボタン群 */}
              <div className="flex flex-col gap-2">
                {mainIsDraw && !overtimeMode ? (
                  <>
                    <button
                      className="w-full px-4 py-2.5 rounded-md bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold cursor-pointer border-none"
                      onClick={goToOvertime}
                    >
                      延長戦へ
                    </button>
                    <button
                      className="w-full px-4 py-2.5 rounded-md bg-green-600 hover:bg-green-700 text-white text-sm font-semibold cursor-pointer border-none"
                      onClick={() => { setShowConfirm(false); doSubmit(); }}
                    >
                      引き分けで確定
                    </button>
                    <button
                      className="w-full px-4 py-2 rounded-md bg-gray-600 text-white text-xs font-semibold cursor-pointer border-none"
                      onClick={() => setShowConfirm(false)}
                    >
                      キャンセル
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      className="w-full px-4 py-2.5 rounded-md bg-green-600 hover:bg-green-700 text-white text-sm font-semibold cursor-pointer border-none"
                      onClick={() => { setShowConfirm(false); doSubmit(); }}
                    >
                      確定
                    </button>
                    <button
                      className="w-full px-4 py-2 rounded-md bg-gray-600 text-white text-xs font-semibold cursor-pointer border-none"
                      onClick={() => setShowConfirm(false)}
                    >
                      キャンセル
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ==========================================
// 次フェーズモーダル
// ==========================================
function NextPhaseModal({
  catId,
  currentPhase,
  defaultAdvance = 2,
  defaultThirdPlace = false,
  onClose,
  onSelect,
}: {
  catId: string;
  currentPhase: PhaseType;
  defaultAdvance: number;
  defaultThirdPlace: boolean;
  onClose: () => void;
  onSelect: (phase: PhaseType, count: number, thirdPlace: boolean) => void;
}) {
  const { categories } = useTournamentStore();
  const options = NEXT_PHASE_OPTIONS[currentPhase] || [];
  const [advCount, setAdvCount] = useState(defaultAdvance);
  const [selectedPhase, setSelectedPhase] = useState<PhaseType>(
    (options[0]?.value as PhaseType) || PHASE_TYPES.FINAL_TOURNAMENT
  );
  const [thirdPlace, setThirdPlace] = useState(defaultThirdPlace);

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[200]" onClick={onClose}>
      <div
        className="bg-modal-bg rounded-[14px] p-6 max-w-[450px] w-[95%] border border-white/10 max-h-[90vh] overflow-auto"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="text-white text-base font-bold m-0 mb-1">次のステージへ進む</h3>
        <div className="text-[11px] text-gray-400 mb-4">
          {categories.find(c => c.id === catId)?.label} — {PHASE_LABELS[currentPhase]} 完了
        </div>

        {/* 次のステージ選択 */}
        <div className="mb-3">
          <div className="text-[11px] text-gray-400 mb-1.5">次のステージ</div>
          {options.map(opt => {
            const pc = PHASE_COLORS[opt.value as PhaseType];
            return (
              <button
                key={opt.value}
                onClick={() => setSelectedPhase(opt.value as PhaseType)}
                className="block w-full p-2.5 px-3.5 mb-1.5 rounded-lg cursor-pointer text-left font-semibold text-[13px]"
                style={{
                  border: selectedPhase === opt.value ? `2px solid ${pc?.text || '#60A5FA'}` : '1px solid rgba(255,255,255,0.1)',
                  background: selectedPhase === opt.value ? (pc?.bg || '#1E3A5F') : 'rgba(255,255,255,0.03)',
                  color: selectedPhase === opt.value ? (pc?.text || '#60A5FA') : '#9CA3AF',
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* 進出人数 */}
        <div className="mb-3">
          <div className="text-[11px] text-gray-400 mb-1">各グループからの進出人数</div>
          <div className="flex gap-1.5">
            {[1, 2, 3, 4].map(n => (
              <button
                key={n}
                onClick={() => setAdvCount(n)}
                className="px-4 py-2 rounded-md cursor-pointer font-bold text-sm"
                style={{
                  border: advCount === n ? '2px solid #22C55E' : '1px solid rgba(255,255,255,0.1)',
                  background: advCount === n ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.03)',
                  color: advCount === n ? '#22C55E' : '#9CA3AF',
                }}
              >
                {n}名
              </button>
            ))}
          </div>
        </div>

        {/* 3位決定戦トグル */}
        {selectedPhase !== PHASE_TYPES.LEAGUE_FINAL && (
          <div className="mb-4">
            <button
              onClick={() => setThirdPlace(!thirdPlace)}
              className="w-full p-2.5 px-3.5 rounded-lg cursor-pointer text-left text-[13px] font-semibold"
              style={{
                border: thirdPlace ? '2px solid #F59E0B' : '1px solid rgba(255,255,255,0.1)',
                background: thirdPlace ? 'rgba(245,158,11,0.12)' : 'rgba(255,255,255,0.03)',
                color: thirdPlace ? '#F59E0B' : '#9CA3AF',
              }}
            >
              3位決定戦 {thirdPlace ? 'あり' : 'なし'}
              <div className="text-[10px] font-normal mt-0.5" style={{ color: thirdPlace ? '#F59E0B' : '#6B7280' }}>
                {advCount <= 1
                  ? '各グループ2位同士で3位決定戦を行います'
                  : '準決勝敗者同士で3位決定戦を行います'}
              </div>
            </button>
          </div>
        )}

        {selectedPhase === PHASE_TYPES.LEAGUE_FINAL && (
          <div className="mb-4 p-2.5 px-3.5 rounded-lg text-xs" style={{ background: 'rgba(244,114,182,0.06)', border: '1px solid rgba(244,114,182,0.12)', color: '#F472B6' }}>
            リーグ決勝は総当たり戦で、順位表の結果から1位・2位・3位が自動確定します
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            className="px-3.5 py-[7px] rounded-md bg-gray-600 text-white text-xs font-semibold cursor-pointer border-none"
            onClick={onClose}
          >
            キャンセル
          </button>
          <button
            className="px-6 py-2.5 rounded-md bg-green-600 text-white text-xs font-semibold cursor-pointer border-none"
            onClick={() => onSelect(selectedPhase, advCount, thirdPlace)}
          >
            決定して進む
          </button>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 団体戦: チーム登録パネル
// ==========================================
function TeamRegistrationPanel() {
  const { categories, teams, players, addTeam, removeTeam } = useTournamentStore();
  const teamCats = categories.filter(c => c.isTeam);
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [teamName, setTeamName] = useState('');
  const [memberNames, setMemberNames] = useState<string[]>(['', '', '', '', '']); // 3正+2補

  if (teamCats.length === 0) return null;

  // 初回 or 選択中のカテゴリが消えた場合、最初の団体戦カテゴリを自動選択
  const effectiveCat = (selectedCat && teamCats.some(c => c.id === selectedCat)) ? selectedCat : teamCats[0]?.id || null;
  const catTeams = teams.filter(t => t.categoryId === effectiveCat);

  const handleAddTeam = () => {
    if (!effectiveCat || !teamName.trim()) return;
    const members: TeamMember[] = memberNames.map((name, i) => ({
      playerId: generateId(),
      name: name.trim() || `選手${i + 1}`,
      dojo: teamName.trim(),
      position: i < 3 ? (['先鋒', '中堅', '大将'] as BoutPosition[])[i] : undefined,
      isSub: i >= 3,
    })).filter(m => m.name);

    addTeam({
      id: generateId(),
      name: teamName.trim(),
      categoryId: effectiveCat,
      members,
    });
    setTeamName('');
    setMemberNames(['', '', '', '', '']);
  };

  return (
    <div className="bg-white/[0.03] border border-white/[0.07] rounded-[10px] p-4 mb-3">
      <div className="text-sm font-bold text-white mb-3 flex items-center gap-2">
        団体戦チーム登録
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400 border border-purple-500/30">団体</span>
      </div>

      {/* カテゴリ選択 */}
      <div className="flex gap-1.5 mb-3">
        {teamCats.map(c => (
          <button
            key={c.id}
            onClick={() => setSelectedCat(c.id)}
            className="px-3 py-1.5 rounded-md text-[11px] font-semibold cursor-pointer"
            style={{
              border: effectiveCat === c.id ? '2px solid #A855F7' : '1px solid rgba(255,255,255,0.1)',
              background: effectiveCat === c.id ? 'rgba(168,85,247,0.15)' : 'rgba(255,255,255,0.03)',
              color: effectiveCat === c.id ? '#C084FC' : '#9CA3AF',
            }}
          >
            {c.label} ({catTeams.length}チーム)
          </button>
        ))}
      </div>

      {/* チーム追加フォーム */}
      <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.06] mb-3">
        <div className="flex gap-2 items-end mb-2">
          <div className="flex-1">
            <div className="text-[10px] text-gray-500 mb-1">チーム名（道場名等）</div>
            <input
              type="text"
              placeholder="例: 孝徳会"
              value={teamName}
              onChange={e => setTeamName(e.target.value)}
              className="w-full px-3 py-1.5 rounded-md bg-black/30 border border-white/10 text-white text-[12px] outline-none"
            />
          </div>
        </div>
        <div className="text-[10px] text-gray-500 mb-1">選手名（先鋒・中堅・大将 + 補欠2名）</div>
        <div className="grid grid-cols-5 gap-1.5 mb-2">
          {['先鋒', '中堅', '大将', '補欠1', '補欠2'].map((label, i) => (
            <div key={i}>
              <div className="text-[9px] text-gray-500 text-center mb-0.5">{label}</div>
              <input
                type="text"
                placeholder="氏名"
                value={memberNames[i]}
                onChange={e => {
                  const n = [...memberNames];
                  n[i] = e.target.value;
                  setMemberNames(n);
                }}
                className="w-full px-2 py-1 rounded-md bg-black/30 border border-white/10 text-white text-[11px] outline-none text-center"
              />
            </div>
          ))}
        </div>
        <button
          onClick={handleAddTeam}
          disabled={!teamName.trim()}
          className="px-4 py-1.5 rounded-md bg-purple-600 text-white text-[11px] font-semibold cursor-pointer border-none disabled:opacity-40"
        >
          チーム追加
        </button>
      </div>

      {/* 登録済みチーム一覧 */}
      {catTeams.length > 0 && (
        <div className="space-y-1">
          {catTeams.map(t => (
            <div key={t.id} className="flex items-center justify-between p-2 px-3 rounded-lg bg-white/[0.02] border border-white/[0.06]">
              <div>
                <span className="text-[12px] font-semibold text-white">{t.name}</span>
                <span className="text-[10px] text-gray-500 ml-2">
                  {t.members.filter(m => !m.isSub).map(m => m.name).join(' / ')}
                </span>
              </div>
              <button
                onClick={() => removeTeam(t.id)}
                className="px-2 py-0.5 rounded text-[10px] font-semibold cursor-pointer border border-red-500/30 bg-red-500/10 text-red-400"
              >
                削除
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ==========================================
// 団体戦: 取組入力モーダル
// ==========================================
function TeamMatchRecordModal({
  matchId,
  onClose,
}: {
  matchId: string;
  onClose: () => void;
}) {
  const { categories, teams, allTeamMatches, submitTeamBoutResult, submitRepresentativeBout, setTeamBoutLineup } = useTournamentStore();
  const match = allTeamMatches.find(m => m.id === matchId);
  if (!match) return null;

  // チームメンバー情報
  const teamAData = teams.find(t => t.id === match.teamA?.id);
  const teamBData = teams.find(t => t.id === match.teamB?.id);
  const membersA = teamAData?.members || [];
  const membersB = teamBData?.members || [];

  // オーダー確定済みか（全boutにplayerA/playerBがセットされている）
  const lineupConfirmed = match.bouts.every(b => b.playerA && b.playerB);

  // オーダー選択state（各ポジションに誰を入れるか）
  const positions: BoutPosition[] = ['先鋒', '中堅', '大将'];
  const [lineupA, setLineupA] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    positions.forEach((pos, i) => {
      const existing = match.bouts.find(b => b.position === pos)?.playerA?.id;
      init[pos] = existing || membersA.filter(m => !m.isSub)[i]?.playerId || '';
    });
    return init;
  });
  const [lineupB, setLineupB] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    positions.forEach((pos, i) => {
      const existing = match.bouts.find(b => b.position === pos)?.playerB?.id;
      init[pos] = existing || membersB.filter(m => !m.isSub)[i]?.playerId || '';
    });
    return init;
  });

  const [activeBoutIdx, setActiveBoutIdx] = useState(
    match.bouts.findIndex(b => b.status !== 'completed')
  );
  const [scoreA, setScoreA] = useState(0);
  const [scoreB, setScoreB] = useState(0);
  const [warningsA, setWarningsA] = useState(0);
  const [warningsB, setWarningsB] = useState(0);

  const allBoutsCompleted = match.bouts.every(b => b.status === 'completed');
  const needsRepresentative = allBoutsCompleted && !match.winnerId && !match.representativeBout;

  // オーダー確定
  const handleConfirmLineup = () => {
    const lineup = positions.map(pos => {
      const mA = membersA.find(m => m.playerId === lineupA[pos]);
      const mB = membersB.find(m => m.playerId === lineupB[pos]);
      return {
        position: pos,
        playerA: mA ? { id: mA.playerId, name: mA.name } : null,
        playerB: mB ? { id: mB.playerId, name: mB.name } : null,
      };
    });
    setTeamBoutLineup(match.id, lineup);
  };

  // 選択済みメンバーID一覧（重複防止用）
  const usedA = Object.values(lineupA).filter(Boolean);
  const usedB = Object.values(lineupB).filter(Boolean);

  const handleSubmitBout = (isRepresentative: boolean = false) => {
    const bout = match.bouts[activeBoutIdx];
    if (!bout && !isRepresentative) return;

    const position = isRepresentative ? '先鋒' : bout.position;
    const bonusA = Math.floor(warningsB / 2);
    const bonusB = Math.floor(warningsA / 2);
    const finalScoreA = scoreA + bonusA;
    const finalScoreB = scoreB + bonusB;

    let winnerId: string | null = null;
    if (finalScoreA > finalScoreB) winnerId = bout?.playerA?.id || match.teamA?.id || null;
    else if (finalScoreB > finalScoreA) winnerId = bout?.playerB?.id || match.teamB?.id || null;

    const boutResult: TeamBout = {
      position: position as BoutPosition,
      playerA: bout?.playerA || (match.teamA ? { id: match.teamA.id, name: match.teamA.name } : null),
      playerB: bout?.playerB || (match.teamB ? { id: match.teamB.id, name: match.teamB.name } : null),
      scoreA: finalScoreA,
      scoreB: finalScoreB,
      warningsA,
      warningsB,
      resultType: finalScoreA === finalScoreB ? 'draw' : 'normal',
      winnerId,
      status: 'completed',
    };

    if (isRepresentative) {
      if (finalScoreA > finalScoreB) boutResult.winnerId = match.teamA?.id || null;
      else if (finalScoreB > finalScoreA) boutResult.winnerId = match.teamB?.id || null;
      submitRepresentativeBout(match.id, boutResult);
    } else {
      submitTeamBoutResult(match.id, position, boutResult);
      const nextIdx = match.bouts.findIndex((b, i) => i > activeBoutIdx && b.status !== 'completed');
      if (nextIdx >= 0) setActiveBoutIdx(nextIdx);
    }

    setScoreA(0);
    setScoreB(0);
    setWarningsA(0);
    setWarningsB(0);
  };

  const catLabel = categories.find(c => c.id === match.categoryId)?.label || '';

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[200]" onClick={onClose}>
      <div
        className="bg-modal-bg rounded-[14px] p-6 max-w-[700px] w-[95%] border border-white/10 max-h-[90vh] overflow-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* ヘッダー */}
        <div className="flex justify-between mb-4">
          <div>
            <h3 className="text-white text-base font-bold m-0">団体戦 取組入力</h3>
            <div className="text-[13px] text-purple-400 font-bold mt-1">{catLabel}</div>
          </div>
          <button className="bg-transparent border-none text-gray-400 text-lg cursor-pointer" onClick={onClose}>✕</button>
        </div>

        {/* チーム名 */}
        <div className="flex justify-between items-center mb-4 px-4">
          <div className="text-center flex-1">
            <div className="text-[11px] text-gray-400">白</div>
            <div className="text-lg font-bold text-white">{match.teamB?.name || 'TBD'}</div>
          </div>
          <div className="text-gray-500 text-sm font-bold mx-4">VS</div>
          <div className="text-center flex-1">
            <div className="text-[11px] text-gray-400">赤</div>
            <div className="text-lg font-bold" style={{ color: RED }}>{match.teamA?.name || 'TBD'}</div>
          </div>
        </div>

        {/* オーダー選択（未確定の場合） */}
        {!lineupConfirmed && !allBoutsCompleted && (
          <div className="p-4 rounded-lg bg-purple-500/5 border border-purple-500/20 mb-4">
            <div className="text-[12px] font-bold text-purple-400 mb-3">出場オーダーを選択</div>
            <div className="space-y-3">
              {positions.map(pos => (
                <div key={pos} className="flex items-center gap-2">
                  <div className="text-[11px] font-bold text-gray-300 w-10 shrink-0">{pos}</div>
                  {/* 白チーム */}
                  <select
                    className="flex-1 bg-white/[0.06] border border-white/10 rounded-md px-2 py-1.5 text-[11px] text-white"
                    value={lineupB[pos]}
                    onChange={e => setLineupB(prev => ({ ...prev, [pos]: e.target.value }))}
                  >
                    <option value="">— 選択 —</option>
                    {membersB.map(m => (
                      <option key={m.playerId} value={m.playerId} disabled={usedB.includes(m.playerId) && lineupB[pos] !== m.playerId}>
                        {m.name}{m.isSub ? ' (補欠)' : ''}
                      </option>
                    ))}
                  </select>
                  <span className="text-gray-600 text-[10px]">vs</span>
                  {/* 赤チーム */}
                  <select
                    className="flex-1 bg-white/[0.06] border border-white/10 rounded-md px-2 py-1.5 text-[11px] text-white"
                    value={lineupA[pos]}
                    onChange={e => setLineupA(prev => ({ ...prev, [pos]: e.target.value }))}
                  >
                    <option value="">— 選択 —</option>
                    {membersA.map(m => (
                      <option key={m.playerId} value={m.playerId} disabled={usedA.includes(m.playerId) && lineupA[pos] !== m.playerId}>
                        {m.name}{m.isSub ? ' (補欠)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <button
              onClick={handleConfirmLineup}
              disabled={positions.some(p => !lineupA[p] || !lineupB[p])}
              className="w-full mt-3 py-2.5 rounded-lg text-white text-sm font-bold cursor-pointer border-none disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: positions.some(p => !lineupA[p] || !lineupB[p]) ? '#4B5563' : '#7C3AED' }}
            >
              オーダー確定
            </button>
          </div>
        )}

        {/* 取組一覧 */}
        <div className="space-y-2 mb-4">
          {match.bouts.map((bout, idx) => {
            const isActive = idx === activeBoutIdx && !allBoutsCompleted && lineupConfirmed;
            // オーダー未確定時はlineupステートから選手名を表示
            const displayNameB = bout.playerB?.name || membersB.find(m => m.playerId === lineupB[bout.position])?.name || '—';
            const displayNameA = bout.playerA?.name || membersA.find(m => m.playerId === lineupA[bout.position])?.name || '—';
            return (
              <div
                key={bout.position}
                className={`p-3 rounded-lg border ${isActive ? 'border-purple-500 bg-purple-500/10' : bout.status === 'completed' ? 'border-green-500/30 bg-green-500/5' : 'border-white/10 bg-white/[0.02]'}`}
              >
                <div className="flex items-center justify-between">
                  <div className="text-[11px] font-bold" style={{ color: isActive ? '#C084FC' : bout.status === 'completed' ? '#86EFAC' : '#6B7280' }}>
                    {bout.position}
                  </div>
                  {bout.status === 'completed' && (
                    <div className="text-[11px] text-green-400">
                      {bout.scoreA} - {bout.scoreB}
                      {bout.winnerId ? (bout.winnerId === bout.playerA?.id ? ' (赤勝)' : ' (白勝)') : ' (引分)'}
                    </div>
                  )}
                </div>
                <div className="flex justify-between text-[10px] text-gray-500 mt-1">
                  <span>{displayNameB}</span>
                  <span>{displayNameA}</span>
                </div>
              </div>
            );
          })}

          {/* 代表戦 */}
          {needsRepresentative && (
            <div className="p-3 rounded-lg border-2 border-amber-500 bg-amber-500/10">
              <div className="text-[11px] font-bold text-amber-400">代表戦（同数のため）</div>
            </div>
          )}
          {match.representativeBout && (
            <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/5">
              <div className="text-[11px] font-bold text-amber-400">
                代表戦: {match.representativeBout.scoreA} - {match.representativeBout.scoreB}
              </div>
            </div>
          )}
        </div>

        {/* スコア入力（オーダー確定済み＋未完了の取組がある場合） */}
        {lineupConfirmed && (!allBoutsCompleted || needsRepresentative) && (
          <div className="p-4 rounded-lg bg-white/[0.03] border border-white/[0.08]">
            <div className="text-[12px] font-bold text-purple-400 mb-3">
              {needsRepresentative ? '代表戦' : match.bouts[activeBoutIdx]?.position} — 本数入力
            </div>

            {/* 本数 */}
            <div className="flex items-center justify-between mb-3">
              <div className="text-center flex-1">
                <div className="text-[10px] text-gray-400 mb-1">白 本数</div>
                <div className="flex gap-1.5 justify-center">
                  {[0, 1, 2].map(v => (
                    <button
                      key={v}
                      onClick={() => setScoreB(v)}
                      className="w-10 h-10 rounded-lg text-sm font-bold cursor-pointer"
                      style={{
                        border: scoreB === v ? '2px solid #fff' : '1px solid rgba(255,255,255,0.1)',
                        background: scoreB === v ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.03)',
                        color: '#fff',
                      }}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>
              <div className="text-center flex-1">
                <div className="text-[10px] text-gray-400 mb-1">赤 本数</div>
                <div className="flex gap-1.5 justify-center">
                  {[0, 1, 2].map(v => (
                    <button
                      key={v}
                      onClick={() => setScoreA(v)}
                      className="w-10 h-10 rounded-lg text-sm font-bold cursor-pointer"
                      style={{
                        border: scoreA === v ? `2px solid ${RED}` : '1px solid rgba(255,255,255,0.1)',
                        background: scoreA === v ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.03)',
                        color: RED,
                      }}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 警告 */}
            <div className="flex items-center justify-between mb-4">
              <div className="text-center flex-1">
                <div className="text-[10px] text-gray-400 mb-1">白 警告</div>
                <div className="flex gap-1 justify-center">
                  {[0, 1, 2, 3].map(v => (
                    <button
                      key={v}
                      onClick={() => setWarningsB(v)}
                      className="w-8 h-8 rounded text-[11px] font-bold cursor-pointer"
                      style={{
                        border: warningsB === v ? '2px solid #F59E0B' : '1px solid rgba(255,255,255,0.08)',
                        background: warningsB === v ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.02)',
                        color: warningsB === v ? '#FCD34D' : '#6B7280',
                      }}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>
              <div className="text-center flex-1">
                <div className="text-[10px] text-gray-400 mb-1">赤 警告</div>
                <div className="flex gap-1 justify-center">
                  {[0, 1, 2, 3].map(v => (
                    <button
                      key={v}
                      onClick={() => setWarningsA(v)}
                      className="w-8 h-8 rounded text-[11px] font-bold cursor-pointer"
                      style={{
                        border: warningsA === v ? '2px solid #F59E0B' : '1px solid rgba(255,255,255,0.08)',
                        background: warningsA === v ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.02)',
                        color: warningsA === v ? '#FCD34D' : '#6B7280',
                      }}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button
              onClick={() => handleSubmitBout(needsRepresentative)}
              className="w-full py-2.5 rounded-lg bg-purple-600 text-white text-sm font-bold cursor-pointer border-none"
            >
              {needsRepresentative ? '代表戦結果を確定' : `${match.bouts[activeBoutIdx]?.position}の結果を確定`}
            </button>
          </div>
        )}

        {/* 試合結果 */}
        {match.status === 'completed' && (
          <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/30 text-center">
            <div className="text-green-400 font-bold text-lg">
              {match.winnerName} 勝利
            </div>
            <div className="text-[11px] text-gray-400 mt-1">
              勝ち数: {match.winsA} - {match.winsB}
              {match.representativeBout && ' (代表戦)'}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ==========================================
// CSVインポートパネル
// ==========================================

// 学年+性別 → カテゴリID マッピング
const GRADE_GENDER_TO_CAT: Record<string, string> = {
  '幼年_mixed': 'infant', '幼年_male': 'infant', '幼年_female': 'infant',
  '小学1年_male': 'e1m', '小学1年_female': 'e1f',
  '小学2年_male': 'e2m', '小学2年_female': 'e2f',
  '小学3年_male': 'e3m', '小学3年_female': 'e3f',
  '小学4年_male': 'e4m', '小学4年_female': 'e4f',
  '小学5年_male': 'e5m', '小学5年_female': 'e5f',
  '小学6年_male': 'e6m', '小学6年_female': 'e6f',
  '中学1年_male': 'm1m', '中学1年_female': 'm1f',
  '中学2年_male': 'm2m', '中学2年_female': 'm2f',
  '中学3年_male': 'm3', '中学3年_female': 'm3',
  '高校生_male': 'hsm', '高校_male': 'hsm',
  '一般_female': 'wopen', '一般女子_female': 'wopen',
  // カスタムカテゴリ（テスト用）
  '低学年_male': 'junior', '低学年_female': 'junior', '低学年_mixed': 'junior',
  '高学年_male': 'senior', '高学年_female': 'senior', '高学年_mixed': 'senior',
};

// 性別の正規化
function normalizeGender(raw: string): 'male' | 'female' {
  const s = raw.trim();
  if (/^(男|男子|male|M)$/i.test(s)) return 'male';
  if (/^(女|女子|female|F)$/i.test(s)) return 'female';
  return 'male';
}

// 学年の正規化
function normalizeGrade(raw: string): string {
  let s = raw.trim();
  // カスタムカテゴリ名はそのまま返す
  if (/^(低学年|高学年)$/.test(s)) return s;
  // 「小1」→「小学1年」など
  s = s.replace(/^小(\d)$/, '小学$1年');
  s = s.replace(/^中(\d)$/, '中学$1年');
  s = s.replace(/^高(\d)$/, '高校$1年');
  // 「年長」「年中」→ 幼年
  if (/^(年長|年中|年少|幼年|幼稚園|保育園)/.test(s)) return '幼年';
  // 「小学校」→「小学」
  s = s.replace('小学校', '小学');
  s = s.replace('中学校', '中学');
  // 末尾の「生」を削除（「小学1年生」→「小学1年」）
  s = s.replace(/生$/, '');
  return s;
}

function CsvImportPanel() {
  const { categories, importPlayers } = useTournamentStore();
  const [csvText, setCsvText] = useState('');
  const [preview, setPreview] = useState<{ name: string; nameKana: string; grade: string; gender: string; dojo: string; catId: string; catLabel: string; error: string }[]>([]);
  const [columnMap, setColumnMap] = useState<{ name: number; nameKana: number; grade: number; gender: number; dojo: number }>({ name: 0, nameKana: 1, grade: 2, gender: 3, dojo: 4 });
  const [headers, setHeaders] = useState<string[]>([]);
  const [step, setStep] = useState<'upload' | 'map' | 'preview'>('upload');

  // CSVパース
  const parseCSV = (text: string): string[][] => {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    return lines.map(line => {
      const result: string[] = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
          else inQuotes = !inQuotes;
        } else if (ch === ',' && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += ch;
        }
      }
      result.push(current.trim());
      return result;
    });
  };

  // ファイル読み込み
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setCsvText(text);
      const rows = parseCSV(text);
      if (rows.length > 0) {
        setHeaders(rows[0]);
        // 自動マッピング（ヘッダー名から推定）
        const h = rows[0].map(s => s.toLowerCase());
        const autoMap = { ...columnMap };
        h.forEach((col, i) => {
          if (/^(氏名|名前|選手名|name)/.test(col)) autoMap.name = i;
          else if (/^(ふりがな|フリガナ|かな|カナ|kana|読み)/.test(col)) autoMap.nameKana = i;
          else if (/^(学年|grade|年齢|クラス|部門)/.test(col)) autoMap.grade = i;
          else if (/^(性別|gender|sex)/.test(col)) autoMap.gender = i;
          else if (/^(道場|所属|団体|dojo|club|チーム)/.test(col)) autoMap.dojo = i;
        });
        setColumnMap(autoMap);
        setStep('map');
      }
    };
    reader.readAsText(file, 'UTF-8');
  };

  // プレビュー生成
  const generatePreview = () => {
    const rows = parseCSV(csvText);
    if (rows.length < 2) return;
    const dataRows = rows.slice(1); // ヘッダー除外

    const result = dataRows.map(row => {
      const name = row[columnMap.name] || '';
      const nameKana = row[columnMap.nameKana] || '';
      const gradeRaw = row[columnMap.grade] || '';
      const genderRaw = row[columnMap.gender] || '';
      const dojo = row[columnMap.dojo] || '';

      const grade = normalizeGrade(gradeRaw);
      const gender = normalizeGender(genderRaw);
      const key = `${grade}_${gender}`;
      const catId = GRADE_GENDER_TO_CAT[key] || '';
      const cat = categories.find(c => c.id === catId);

      return {
        name,
        nameKana,
        grade: gradeRaw,
        gender: genderRaw,
        dojo,
        catId,
        catLabel: cat?.label || '',
        error: !name ? '氏名なし' : !catId ? `カテゴリ不明 (${grade}/${gender})` : '',
      };
    }).filter(r => r.name); // 空行除外

    setPreview(result);
    setStep('preview');
  };

  // インポート実行
  const doImport = () => {
    const valid = preview.filter(r => !r.error && r.catId);
    const players = valid.map(r => ({
      id: generateId(),
      name: r.name,
      nameKana: r.nameKana || undefined,
      categoryId: r.catId,
      dojo: r.dojo,
    }));
    importPlayers(players);
    setCsvText('');
    setPreview([]);
    setStep('upload');
  };

  const errorCount = preview.filter(r => r.error).length;
  const validCount = preview.filter(r => !r.error).length;

  // カテゴリ別人数集計
  const catCounts: Record<string, number> = {};
  preview.filter(r => !r.error).forEach(r => { catCounts[r.catLabel] = (catCounts[r.catLabel] || 0) + 1; });

  const fieldLabels = ['氏名', 'ふりがな', '学年', '性別', '所属道場'];
  const fieldKeys: (keyof typeof columnMap)[] = ['name', 'nameKana', 'grade', 'gender', 'dojo'];

  return (
    <div className="bg-white/[0.03] border border-white/[0.07] rounded-[10px] p-4 mb-3">
      <div className="text-sm font-bold text-white mb-3 flex items-center gap-2">
        CSV選手データ取込
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">Google フォーム対応</span>
      </div>

      {step === 'upload' && (
        <div>
          <div className="text-[11px] text-gray-400 mb-3">
            Googleフォームから書き出したCSVファイルを選択してください。<br />
            必要な列: <span className="text-gray-300">氏名、ふりがな、学年、性別、所属道場</span>
          </div>
          <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-md bg-blue-600 text-white text-xs font-semibold cursor-pointer border-none">
            CSVファイルを選択
            <input
              type="file"
              accept=".csv,.tsv,.txt"
              className="hidden"
              onChange={handleFile}
            />
          </label>
          <div className="mt-3 text-[10px] text-gray-500">
            <div className="font-semibold mb-1">Googleフォームの推奨質問項目:</div>
            <div>1. 選手氏名（漢字） 2. ふりがな 3. 学年（小学1年/小学2年/...） 4. 性別（男/女） 5. 所属道場</div>
          </div>
        </div>
      )}

      {step === 'map' && (
        <div>
          <div className="text-[11px] text-gray-400 mb-3">
            CSVの列とデータ項目を対応付けてください（自動推定済み）
          </div>
          <div className="grid grid-cols-5 gap-2 mb-4">
            {fieldKeys.map((key, i) => (
              <div key={key}>
                <div className="text-[10px] text-gray-400 mb-1">{fieldLabels[i]}</div>
                <select
                  className="w-full px-2 py-1.5 rounded bg-white/10 text-white text-[11px] border border-white/20"
                  value={columnMap[key]}
                  onChange={e => setColumnMap({ ...columnMap, [key]: Number(e.target.value) })}
                >
                  {headers.map((h, hi) => (
                    <option key={hi} value={hi} className="bg-gray-800">{h || `列${hi + 1}`}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          {/* サンプル行表示 */}
          <div className="text-[10px] text-gray-500 mb-3">
            <div className="font-semibold mb-1">データ先頭3行プレビュー:</div>
            {parseCSV(csvText).slice(1, 4).map((row, ri) => (
              <div key={ri} className="text-gray-400 truncate">
                {fieldKeys.map(k => row[columnMap[k]] || '—').join(' | ')}
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              className="px-4 py-2 rounded-md bg-gray-600 text-white text-xs font-semibold cursor-pointer border-none"
              onClick={() => setStep('upload')}
            >
              戻る
            </button>
            <button
              className="px-6 py-2 rounded-md bg-blue-600 text-white text-xs font-semibold cursor-pointer border-none"
              onClick={generatePreview}
            >
              プレビュー確認
            </button>
          </div>
        </div>
      )}

      {step === 'preview' && (
        <div>
          {/* 集計 */}
          <div className="flex gap-3 mb-3 flex-wrap">
            <div className="px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/30 text-[11px]">
              <span className="text-green-400 font-bold">{validCount}名</span>
              <span className="text-gray-400 ml-1">取込可能</span>
            </div>
            {errorCount > 0 && (
              <div className="px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-[11px]">
                <span className="text-red-400 font-bold">{errorCount}名</span>
                <span className="text-gray-400 ml-1">エラー（スキップ）</span>
              </div>
            )}
          </div>

          {/* カテゴリ別人数 */}
          <div className="flex gap-1.5 mb-3 flex-wrap">
            {Object.entries(catCounts).sort((a, b) => b[1] - a[1]).map(([label, count]) => (
              <span key={label} className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-gray-300 border border-white/10">
                {label}: {count}人
              </span>
            ))}
          </div>

          {/* テーブル */}
          <div className="max-h-[300px] overflow-auto mb-3">
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr>
                  <th className="p-1.5 text-left border-b border-white/10 text-gray-400 text-[10px] sticky top-0 bg-gray-900">氏名</th>
                  <th className="p-1.5 text-left border-b border-white/10 text-gray-400 text-[10px] sticky top-0 bg-gray-900">ふりがな</th>
                  <th className="p-1.5 text-left border-b border-white/10 text-gray-400 text-[10px] sticky top-0 bg-gray-900">道場</th>
                  <th className="p-1.5 text-left border-b border-white/10 text-gray-400 text-[10px] sticky top-0 bg-gray-900">カテゴリ</th>
                  <th className="p-1.5 text-left border-b border-white/10 text-gray-400 text-[10px] sticky top-0 bg-gray-900">状態</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((r, i) => (
                  <tr key={i} style={{ background: r.error ? 'rgba(239,68,68,0.06)' : 'transparent' }}>
                    <td className="p-1.5 border-b border-white/[0.04] text-white font-semibold">{r.name}</td>
                    <td className="p-1.5 border-b border-white/[0.04] text-gray-400">{r.nameKana || '—'}</td>
                    <td className="p-1.5 border-b border-white/[0.04] text-gray-300">{r.dojo}</td>
                    <td className="p-1.5 border-b border-white/[0.04] text-gray-300">{r.catLabel || '—'}</td>
                    <td className="p-1.5 border-b border-white/[0.04]">
                      {r.error ? (
                        <span className="text-red-400 text-[10px]">{r.error}</span>
                      ) : (
                        <span className="text-green-400 text-[10px]">OK</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex gap-2">
            <button
              className="px-4 py-2 rounded-md bg-gray-600 text-white text-xs font-semibold cursor-pointer border-none"
              onClick={() => setStep('map')}
            >
              戻る
            </button>
            <button
              className="px-6 py-2.5 rounded-md bg-green-600 text-white text-xs font-semibold cursor-pointer border-none"
              onClick={doImport}
              disabled={validCount === 0}
            >
              {validCount}名を取り込む
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// カテゴリ管理パネル
// ==========================================
function CategoryManagePanel() {
  const {
    categories,
    players,
    catPhases,
    addCategory,
    updateCategory,
    removeCategory,
    mergeCategories,
    splitCategory,
    resetCategories,
  } = useTournamentStore();

  const [showPanel, setShowPanel] = useState(false);
  const [mergeMode, setMergeMode] = useState(false);
  const [mergeSelection, setMergeSelection] = useState<string[]>([]);
  const [mergeLabel, setMergeLabel] = useState('');
  const [addMode, setAddMode] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newGroup, setNewGroup] = useState<'幼年' | '小学' | '中学' | '高校' | '一般'>('小学');
  const [newGender, setNewGender] = useState<'male' | 'female' | 'mixed'>('male');
  const [newIsTeam, setNewIsTeam] = useState(false);

  const setupCats = categories.filter(c => !catPhases[c.id] || catPhases[c.id] === PHASE_TYPES.SETUP);
  const catCounts = Object.fromEntries(categories.map(c => [c.id, players.filter(p => p.categoryId === c.id).length]));

  const toggleMergeSelect = (id: string) => {
    setMergeSelection(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const executeMerge = () => {
    if (mergeSelection.length < 2 || !mergeLabel.trim()) return;
    const sources = mergeSelection.map(id => categories.find(c => c.id === id)!).filter(Boolean);
    const newId = mergeSelection.sort().join('_');
    const newCat = {
      id: newId,
      label: mergeLabel.trim(),
      group: sources[0].group,
      gender: sources.every(s => s.gender === sources[0].gender) ? sources[0].gender : 'mixed' as const,
      menType: sources[0].menType,
      session: sources[0].session,
      isTeam: false,
      mergedFrom: mergeSelection,
    };
    mergeCategories(mergeSelection, newCat);
    setMergeMode(false);
    setMergeSelection([]);
    setMergeLabel('');
  };

  const handleSplit = (catId: string) => {
    const cat = categories.find(c => c.id === catId);
    if (!cat?.mergedFrom) return;
    const originals = cat.mergedFrom.map(id => {
      const orig = categories.find(c => c.id === id);
      if (orig) return orig;
      // DEFAULT_CATEGORIESから復元
      return null;
    }).filter(Boolean) as typeof categories;
    if (originals.length > 0) splitCategory(catId, originals);
  };

  const handleAdd = () => {
    if (!newLabel.trim()) return;
    const newId = `custom_${generateId().slice(0, 6)}`;
    addCategory({
      id: newId,
      label: newLabel.trim(),
      group: newGroup,
      gender: newGender,
      menType: 'なし',
      session: 'am',
      isTeam: newIsTeam,
    });
    setNewLabel('');
    setAddMode(false);
  };

  return (
    <div className="bg-white/[0.03] border border-white/[0.07] rounded-[10px] p-4 mb-3">
      <div className="flex justify-between items-center mb-2">
        <div className="text-sm font-bold text-white flex items-center gap-2">
          カテゴリ管理
          <span className="text-[10px] text-gray-500 font-normal">（応募人数に応じて統合・分割）</span>
        </div>
        <button
          className="px-3 py-1 rounded-md text-[11px] font-semibold cursor-pointer border border-white/10 bg-white/[0.03] text-gray-400"
          onClick={() => setShowPanel(!showPanel)}
        >
          {showPanel ? '閉じる' : '編集'}
        </button>
      </div>

      {showPanel && (
        <div>
          {/* 操作ボタン */}
          <div className="flex gap-1.5 mb-3 flex-wrap">
            <button
              className={`px-3 py-1.5 rounded-md text-[11px] font-semibold cursor-pointer border ${mergeMode ? 'border-amber-500 bg-amber-500/10 text-amber-400' : 'border-white/10 bg-white/[0.03] text-gray-400'}`}
              onClick={() => { setMergeMode(!mergeMode); setMergeSelection([]); setMergeLabel(''); }}
            >
              {mergeMode ? '統合モード解除' : 'カテゴリ統合'}
            </button>
            <button
              className={`px-3 py-1.5 rounded-md text-[11px] font-semibold cursor-pointer border ${addMode ? 'border-green-500 bg-green-500/10 text-green-400' : 'border-white/10 bg-white/[0.03] text-gray-400'}`}
              onClick={() => setAddMode(!addMode)}
            >
              {addMode ? 'キャンセル' : 'カテゴリ追加'}
            </button>
            <button
              className="px-3 py-1.5 rounded-md text-[11px] font-semibold cursor-pointer border border-white/10 bg-white/[0.03] text-gray-400"
              onClick={resetCategories}
            >
              デフォルトに戻す
            </button>
          </div>

          {/* 統合モード */}
          {mergeMode && (
            <div className="mb-3 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
              <div className="text-[11px] text-amber-400 mb-2">統合するカテゴリを選択してください（2つ以上）</div>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {setupCats.filter(c => !c.isTeam).map(c => (
                  <button
                    key={c.id}
                    onClick={() => toggleMergeSelect(c.id)}
                    className="px-2.5 py-1.5 rounded-md text-[11px] font-semibold cursor-pointer"
                    style={{
                      border: mergeSelection.includes(c.id) ? '2px solid #F59E0B' : '1px solid rgba(255,255,255,0.1)',
                      background: mergeSelection.includes(c.id) ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.03)',
                      color: mergeSelection.includes(c.id) ? '#FCD34D' : '#9CA3AF',
                    }}
                  >
                    {c.label} ({catCounts[c.id] || 0}人)
                  </button>
                ))}
              </div>
              {mergeSelection.length >= 2 && (
                <div className="flex gap-2 items-center">
                  <input
                    type="text"
                    placeholder="統合後のカテゴリ名（例: 小学1・2年 女子）"
                    value={mergeLabel}
                    onChange={e => setMergeLabel(e.target.value)}
                    className="flex-1 px-3 py-1.5 rounded-md bg-black/30 border border-white/10 text-white text-[12px] outline-none"
                  />
                  <button
                    onClick={executeMerge}
                    disabled={!mergeLabel.trim()}
                    className="px-4 py-1.5 rounded-md bg-amber-600 text-white text-[11px] font-semibold cursor-pointer border-none disabled:opacity-40"
                  >
                    統合実行
                  </button>
                </div>
              )}
            </div>
          )}

          {/* 追加モード */}
          {addMode && (
            <div className="mb-3 p-3 rounded-lg bg-green-500/5 border border-green-500/20">
              <div className="text-[11px] text-green-400 mb-2">新しいカテゴリを追加</div>
              <div className="flex flex-wrap gap-2 items-end">
                <div>
                  <div className="text-[10px] text-gray-500 mb-1">カテゴリ名</div>
                  <input
                    type="text"
                    placeholder="例: 小学1年 女子"
                    value={newLabel}
                    onChange={e => setNewLabel(e.target.value)}
                    className="px-3 py-1.5 rounded-md bg-black/30 border border-white/10 text-white text-[12px] outline-none w-[180px]"
                  />
                </div>
                <div>
                  <div className="text-[10px] text-gray-500 mb-1">区分</div>
                  <select
                    value={newGroup}
                    onChange={e => setNewGroup(e.target.value as typeof newGroup)}
                    className="px-2 py-1.5 rounded-md bg-black/30 border border-white/10 text-white text-[11px] outline-none"
                  >
                    {['幼年', '小学', '中学', '高校', '一般'].map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                <div>
                  <div className="text-[10px] text-gray-500 mb-1">性別</div>
                  <select
                    value={newGender}
                    onChange={e => setNewGender(e.target.value as typeof newGender)}
                    className="px-2 py-1.5 rounded-md bg-black/30 border border-white/10 text-white text-[11px] outline-none"
                  >
                    <option value="male">男子</option>
                    <option value="female">女子</option>
                    <option value="mixed">混合</option>
                  </select>
                </div>
                <label className="flex items-center gap-1.5 text-[11px] text-gray-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newIsTeam}
                    onChange={e => setNewIsTeam(e.target.checked)}
                    className="w-3.5 h-3.5"
                  />
                  団体戦
                </label>
                <button
                  onClick={handleAdd}
                  disabled={!newLabel.trim()}
                  className="px-4 py-1.5 rounded-md bg-green-600 text-white text-[11px] font-semibold cursor-pointer border-none disabled:opacity-40"
                >
                  追加
                </button>
              </div>
            </div>
          )}

          {/* カテゴリ一覧 */}
          <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-1.5">
            {setupCats.map(c => (
              <div
                key={c.id}
                className="flex items-center justify-between p-2 px-3 rounded-lg bg-white/[0.02] border border-white/[0.06]"
              >
                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-semibold text-white">{c.label}</span>
                  <span className="text-[10px] text-gray-500">{catCounts[c.id] || 0}人</span>
                  {c.isTeam && <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400 border border-purple-500/30">団体</span>}
                  {c.mergedFrom && <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">統合</span>}
                </div>
                <div className="flex gap-1">
                  {c.mergedFrom && (
                    <button
                      onClick={() => handleSplit(c.id)}
                      className="px-2 py-0.5 rounded text-[10px] font-semibold cursor-pointer border border-amber-500/30 bg-amber-500/10 text-amber-400"
                    >
                      分割
                    </button>
                  )}
                  {(catCounts[c.id] || 0) === 0 && (
                    <button
                      onClick={() => removeCategory(c.id)}
                      className="px-2 py-0.5 rounded text-[10px] font-semibold cursor-pointer border border-red-500/30 bg-red-500/10 text-red-400"
                    >
                      削除
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// 管理ページ
// ==========================================
function AdminPage() {
  const {
    categories,
    players,
    allMatches,
    leagueGroups,
    catPhases,
    venueAssignments,
    tournamentData,
    catStartFormats,
    catAdvanceCounts,
    catThirdPlace,
    initialized,
    getActiveCats,
    getTotalMatches,
    getCompletedMatches,
    getProgressPct,
    isPhaseComplete,
    initSample,
    reset,
    setStartFormat,
    setAllStartFormats,
    setVenueForCat,
    setAdvanceCount,
    toggleThirdPlace,
    startCategory,
    startAll,
    advancePhase,
    revertPhase,
    activateMatch,
    submitMatchResult,
  } = useTournamentStore();

  const activeCats = getActiveCats();
  const totalMatches = getTotalMatches();
  const completedMatches = getCompletedMatches();
  const progressPct = getProgressPct();

  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [recordingMatch, setRecordingMatch] = useState<Match | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [nextPhaseModal, setNextPhaseModal] = useState<{ catId: string; currentPhase: PhaseType } | null>(null);
  const [confirmRevert, setConfirmRevert] = useState<string | null>(null);

  const handleSubmitMatch = useCallback((m: Match) => {
    submitMatchResult(m);
    setRecordingMatch(null);
  }, [submitMatchResult]);

  return (
    <div>
      {/* 統計グリッド */}
      <div className="grid grid-cols-4 gap-2.5 mb-3">
        <StatCard value={players.length} label="登録選手数" color="#3B82F6" />
        <StatCard value={activeCats.length} label="カテゴリ数" color="#B91C1C" />
        <StatCard value={completedMatches} label="完了試合" color="#22C55E" />
        <StatCard value={`${progressPct}%`} label="進行率" color="#F59E0B" />
      </div>

      {/* アクションボタン */}
      <div className="bg-white/[0.03] border border-white/[0.07] rounded-[10px] p-4 mb-3 flex gap-2 flex-wrap items-center">
        {!initialized ? (
          <button
            className="px-6 py-2.5 rounded-md bg-blue-600 text-white text-xs font-semibold cursor-pointer border-none"
            onClick={initSample}
          >
            サンプルデータ読込
          </button>
        ) : (
          <>
            {activeCats.some(c => c.phase === PHASE_TYPES.SETUP) && (
              <button
                className="px-6 py-2.5 rounded-md bg-red-700 text-white text-xs font-semibold cursor-pointer border-none"
                onClick={startAll}
              >
                全カテゴリ一括開始
              </button>
            )}
            <button
              className="px-3.5 py-[7px] rounded-md bg-gray-600 text-white text-xs font-semibold cursor-pointer border-none"
              onClick={() => setShowResetConfirm(true)}
            >
              リセット
            </button>
          </>
        )}
      </div>

      {/* CSVインポートパネル */}
      {!initialized && <CsvImportPanel />}

      {/* カテゴリ管理パネル */}
      {initialized && activeCats.some(c => c.phase === PHASE_TYPES.SETUP) && (
        <CategoryManagePanel />
      )}

      {/* 団体戦チーム登録 */}
      {initialized && <TeamRegistrationPanel />}

      {/* 開始形式設定パネル */}
      {initialized && activeCats.some(c => c.phase === PHASE_TYPES.SETUP) && (
        <div className="bg-white/[0.03] border border-white/[0.07] rounded-[10px] p-4 mb-3">
          <div className="text-sm font-bold text-white mb-3 flex items-center gap-2">開始形式 ・ コートの設定</div>
          <div className="text-[11px] text-gray-400 mb-3">
            各カテゴリの試合形式とコートを選択してから「全カテゴリ一括開始」を押してください
          </div>

          {/* 一括設定ボタン */}
          <div className="flex gap-1.5 mb-2.5 flex-wrap items-center">
            <span className="text-[11px] text-gray-400 mr-1">形式一括：</span>
            {START_FORMATS.map(sf => (
              <button
                key={sf.value}
                onClick={() => setAllStartFormats(sf.value as PhaseType)}
                className="px-3 py-[5px] rounded-md text-[11px] font-semibold cursor-pointer"
                style={{
                  border: `1px solid ${sf.color}40`,
                  background: `${sf.color}10`,
                  color: sf.color,
                }}
              >
                全て「{sf.label}」
              </button>
            ))}
          </div>

          {/* カテゴリ別設定グリッド */}
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-2">
            {activeCats.filter(c => c.phase === PHASE_TYPES.SETUP).map(c => {
              const currentFormat = catStartFormats[c.id] || PHASE_TYPES.LEAGUE;
              const currentVenue = venueAssignments[c.id];
              return (
                <div key={c.id} className="p-2.5 px-3 rounded-lg bg-white/[0.02] border border-white/[0.06]">
                  {/* カテゴリ名 + 人数 */}
                  <div className="flex justify-between items-start mb-2">
                    <div className="text-[13px] font-bold text-white flex items-center gap-1.5">
                      {c.label}
                      {c.isTeam && <span className="text-[9px] px-1 py-0.5 rounded bg-purple-500/20 text-purple-400 border border-purple-500/30">団体</span>}
                    </div>
                    <div className="text-[10px] text-gray-500 flex-shrink-0 ml-2 text-right">
                      <div>{c.playerCount}{c.isTeam ? 'チーム' : '人'}</div>
                      {!c.isTeam && currentFormat === PHASE_TYPES.LEAGUE && (
                        <div className="text-[9px] text-blue-400">
                          → {Math.ceil(c.playerCount / (c.playerCount <= 6 ? 3 : 4))}グループ
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 形式選択 */}
                  <div className="flex gap-1 mb-1.5">
                    {START_FORMATS.map(sf => (
                      <button
                        key={sf.value}
                        onClick={() => setStartFormat(c.id, sf.value as PhaseType)}
                        className="flex-1 py-[5px] px-1 rounded-[5px] text-[10px] font-semibold cursor-pointer text-center"
                        style={{
                          border: currentFormat === sf.value ? `2px solid ${sf.color}` : '1px solid rgba(255,255,255,0.08)',
                          background: currentFormat === sf.value ? `${sf.color}18` : 'rgba(255,255,255,0.02)',
                          color: currentFormat === sf.value ? sf.color : '#6B7280',
                        }}
                      >
                        {sf.label}
                      </button>
                    ))}
                  </div>

                  {/* 会場選択 */}
                  <div className="flex gap-[3px] mb-1.5">
                    {VENUES.map(v => (
                      <button
                        key={v.id}
                        onClick={() => setVenueForCat(c.id, v.id)}
                        className="flex-1 py-1 px-[2px] rounded-[5px] text-[10px] font-bold cursor-pointer text-center"
                        style={{
                          border: currentVenue === v.id ? `2px solid ${v.color}` : '1px solid rgba(255,255,255,0.06)',
                          background: currentVenue === v.id ? `${v.color}20` : 'rgba(255,255,255,0.02)',
                          color: currentVenue === v.id ? v.color : '#4B5563',
                        }}
                      >
                        {v.name.replace('コート', '')}
                      </button>
                    ))}
                  </div>

                  {/* 進出人数 + 3位決定戦 */}
                  <div className="flex gap-1.5 items-center">
                    {currentFormat === PHASE_TYPES.LEAGUE && (
                      <div className="flex items-center gap-[3px] flex-1">
                        <span className="text-[9px] text-gray-400 whitespace-nowrap">進出:</span>
                        {[1, 2, 3].map(n => (
                          <button
                            key={n}
                            onClick={() => setAdvanceCount(c.id, n)}
                            className="px-[7px] py-[3px] rounded text-[10px] font-bold cursor-pointer"
                            style={{
                              border: (catAdvanceCounts[c.id] || 1) === n ? '1.5px solid #22C55E' : '1px solid rgba(255,255,255,0.06)',
                              background: (catAdvanceCounts[c.id] || 1) === n ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.02)',
                              color: (catAdvanceCounts[c.id] || 1) === n ? '#22C55E' : '#4B5563',
                            }}
                          >
                            {n}名
                          </button>
                        ))}
                      </div>
                    )}
                    {currentFormat !== PHASE_TYPES.LEAGUE && <div className="flex-1" />}
                    <button
                      onClick={() => toggleThirdPlace(c.id)}
                      className="px-2 py-[3px] rounded text-[9px] font-semibold cursor-pointer whitespace-nowrap"
                      style={{
                        border: catThirdPlace[c.id] !== false ? '1.5px solid #F59E0B' : '1px solid rgba(255,255,255,0.06)',
                        background: catThirdPlace[c.id] !== false ? 'rgba(245,158,11,0.12)' : 'rgba(255,255,255,0.02)',
                        color: catThirdPlace[c.id] !== false ? '#F59E0B' : '#4B5563',
                      }}
                    >
                      3位決定戦{catThirdPlace[c.id] !== false ? ' ✓' : ''}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 進行状況 */}
      {totalMatches > 0 && (
        <div className="bg-white/[0.03] border border-white/[0.07] rounded-[10px] p-4 mb-3">
          <div className="text-sm font-bold text-white mb-3">大会進行状況</div>
          <div className="flex justify-between mb-1.5 text-xs">
            <span>完了: {completedMatches} / {totalMatches} 試合</span>
            <span className="text-amber-500">{progressPct}%</span>
          </div>
          <ProgressBar pct={progressPct} color="#F59E0B" />
        </div>
      )}

      {/* カテゴリ一覧テーブル */}
      {activeCats.length > 0 && (
        <div className="bg-white/[0.03] border border-white/[0.07] rounded-[10px] p-4 mb-3">
          <div className="text-sm font-bold text-white mb-3">カテゴリ一覧</div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr>
                  <th className="p-2 text-left border-b border-white/10 text-gray-400 font-semibold text-[10px]">カテゴリ</th>
                  <th className="p-2 text-left border-b border-white/10 text-gray-400 font-semibold text-[10px]">人数</th>
                  <th className="p-2 text-left border-b border-white/10 text-gray-400 font-semibold text-[10px]">面</th>
                  <th className="p-2 text-left border-b border-white/10 text-gray-400 font-semibold text-[10px]">開始形式</th>
                  <th className="p-2 text-left border-b border-white/10 text-gray-400 font-semibold text-[10px]">フェーズ</th>
                  <th className="p-2 text-left border-b border-white/10 text-gray-400 font-semibold text-[10px]">会場</th>
                  <th className="p-2 text-left border-b border-white/10 text-gray-400 font-semibold text-[10px]">進行</th>
                  <th className="p-2 text-left border-b border-white/10 text-gray-400 font-semibold text-[10px]">操作</th>
                </tr>
              </thead>
              <tbody>
                {activeCats.map(c => {
                  const venue = VENUES.find(v => v.id === venueAssignments[c.id]);
                  const catMatches = allMatches.filter(m => m.categoryId === c.id && !m.isBye);
                  const catDone = catMatches.filter(m => m.status === 'completed').length;
                  const phaseComplete = isPhaseComplete(c.id);
                  const hasNextOptions = NEXT_PHASE_OPTIONS[c.phase];
                  const format = catStartFormats[c.id] || PHASE_TYPES.LEAGUE;
                  const formatInfo = START_FORMATS.find(sf => sf.value === format);
                  return (
                    <tr key={c.id}>
                      <td className="p-2 border-b border-white/[0.04] font-semibold text-white">
                        {c.label}
                        {c.isTeam && <span className="text-[9px] ml-1 px-1 py-0.5 rounded bg-purple-500/20 text-purple-400 border border-purple-500/30">団体</span>}
                      </td>
                      <td className="p-2 border-b border-white/[0.04] text-gray-300">
                        <div>{c.playerCount}{c.isTeam ? 'チーム' : '人'}</div>
                        {(c.phase === PHASE_TYPES.LEAGUE || c.phase === PHASE_TYPES.LEAGUE_FINAL) && leagueGroups[c.id] && (
                          <div className="text-[9px] text-blue-400">{leagueGroups[c.id].length}グループ</div>
                        )}
                      </td>
                      <td className="p-2 border-b border-white/[0.04] text-gray-300 text-[10px]">{c.menType}</td>
                      <td className="p-2 border-b border-white/[0.04]">
                        {c.phase === PHASE_TYPES.SETUP ? (
                          <span className="text-[10px] font-semibold" style={{ color: formatInfo?.color || '#9CA3AF' }}>
                            {formatInfo?.label || 'リーグ戦'}
                          </span>
                        ) : (
                          <span className="text-[10px] text-gray-500">—</span>
                        )}
                      </td>
                      <td className="p-2 border-b border-white/[0.04]">
                        <PhaseTag phase={c.phase} />
                      </td>
                      <td className="p-2 border-b border-white/[0.04]">
                        <div className="flex gap-[2px]">
                          {VENUES.map(v => (
                            <button
                              key={v.id}
                              onClick={() => setVenueForCat(c.id, v.id)}
                              className="px-1.5 py-[2px] rounded text-[9px] font-bold cursor-pointer"
                              style={{
                                border: venue?.id === v.id ? `1.5px solid ${v.color}` : '1px solid transparent',
                                background: venue?.id === v.id ? `${v.color}20` : 'transparent',
                                color: venue?.id === v.id ? v.color : '#4B5563',
                              }}
                            >
                              {v.id}
                            </button>
                          ))}
                        </div>
                      </td>
                      <td className="p-2 border-b border-white/[0.04] text-[11px] text-gray-300">{catDone}/{catMatches.length}</td>
                      <td className="p-2 border-b border-white/[0.04]">
                        <div className="flex gap-1 flex-wrap">
                          {c.phase === PHASE_TYPES.SETUP ? (
                            <button
                              className="px-2.5 py-[5px] rounded-md bg-green-600 text-white text-[11px] font-semibold cursor-pointer border-none"
                              onClick={() => startCategory(c.id)}
                            >
                              開始
                            </button>
                          ) : (
                            <button
                              className="px-2.5 py-[5px] rounded-md bg-blue-600 text-white text-[11px] font-semibold cursor-pointer border-none"
                              onClick={() => setSelectedCat(c.id)}
                            >
                              詳細
                            </button>
                          )}
                          {phaseComplete && hasNextOptions && (
                            <button
                              className="px-2.5 py-[5px] rounded-md bg-green-600 text-white text-[11px] font-semibold cursor-pointer border-none"
                              onClick={() => setNextPhaseModal({ catId: c.id, currentPhase: c.phase })}
                            >
                              次ステージへ →
                            </button>
                          )}
                          {(c.phase === PHASE_TYPES.LEAGUE_FINAL ||
                            c.phase === PHASE_TYPES.FINAL_TOURNAMENT ||
                            c.phase === PHASE_TYPES.PRE_TOURNAMENT) && (
                            <button
                              className="px-1.5 py-[3px] rounded-md bg-amber-600 text-white text-[9px] font-semibold cursor-pointer border-none"
                              onClick={() => setConfirmRevert(c.id)}
                            >
                              ← 戻す
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* カテゴリ詳細モーダル */}
      {selectedCat && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[200]" onClick={() => setSelectedCat(null)}>
          <div
            className="bg-modal-bg rounded-[14px] p-6 max-w-[950px] w-[95%] border border-white/10 max-h-[90vh] overflow-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between mb-3">
              <div>
                <h3 className="text-white text-base font-bold m-0">{categories.find(c => c.id === selectedCat)?.label}</h3>
                <PhaseTag phase={(catPhases[selectedCat] as PhaseType) || PHASE_TYPES.SETUP} />
              </div>
              <button className="bg-transparent border-none text-gray-400 text-lg cursor-pointer" onClick={() => setSelectedCat(null)}>✕</button>
            </div>

            {/* 最終順位（トーナメント） */}
            {(() => {
              const tMatches = allMatches.filter(m => m.categoryId === selectedCat && m.type === 'tournament');
              const tRankings = getFinalRankings(tMatches);
              if (tRankings) return <FinalRankingsDisplay rankings={tRankings} />;
              const lfMatches = allMatches.filter(m => m.categoryId === selectedCat && m.type === 'league' && m.phaseKey === PHASE_TYPES.LEAGUE_FINAL);
              const lfPlayers = leagueGroups[`${selectedCat}_final`]?.[0];
              if (lfPlayers && lfMatches.length > 0) {
                const lfRankings = getLeagueFinalRankings(lfPlayers as Player[], lfMatches);
                if (lfRankings) return <FinalRankingsDisplay rankings={lfRankings} />;
              }
              return null;
            })()}

            {/* 予選リーグ結果 */}
            {(() => {
              const prelimMatches = allMatches.filter(m => m.categoryId === selectedCat && m.type === 'league' && m.phaseKey === PHASE_TYPES.LEAGUE);
              const groups = leagueGroups[selectedCat] || [];
              if (prelimMatches.length === 0 || groups.length === 0) return null;
              const currentPhase = catPhases[selectedCat];
              const isActive = currentPhase === PHASE_TYPES.LEAGUE;
              return (
                <div className="mb-2">
                  {!isActive && (
                    <div className="text-xs font-bold text-blue-400 mb-2 px-2.5 py-1.5 rounded-md" style={{ background: 'rgba(96,165,250,0.06)', border: '1px solid rgba(96,165,250,0.12)' }}>
                      予選リーグ結果
                    </div>
                  )}
                  {groups.map((group: Player[], gi: number) => {
                    const gMatches = prelimMatches.filter(m => m.groupIndex === gi);
                    return <StandingsTable key={gi} standings={calcStandings(group, gMatches)} groupIdx={gi} advanceCount={catAdvanceCounts[selectedCat] || 1} />;
                  })}
                  <div className="mt-1">
                    <div className="text-xs font-bold text-gray-400 mb-1.5">予選リーグ 対戦結果</div>
                    {prelimMatches.map(m => (
                      <div
                        key={m.id}
                        className="flex items-center gap-2 px-2.5 py-1.5 mb-1 rounded-md"
                        style={{
                          background: m.status === 'completed' ? 'rgba(34,197,94,0.04)' : m.status === 'active' ? 'rgba(239,68,68,0.06)' : 'rgba(255,255,255,0.02)',
                          border: `1px solid ${m.status === 'completed' ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.05)'}`,
                        }}
                      >
                        <span className="text-[10px] text-gray-400 min-w-[30px]">{String.fromCharCode(65 + (m.groupIndex ?? 0))}</span>
                        <span
                          className="flex-1 text-xs"
                          style={{
                            fontWeight: m.winnerId === m.playerA?.id ? 700 : 400,
                            color: m.winnerId === m.playerA?.id ? '#22C55E' : '#D1D5DB',
                          }}
                        >
                          {m.playerA?.name}
                        </span>
                        <span className="text-[13px] font-bold text-white min-w-[50px] text-center">
                          <ScoreWithWarnings match={m} />
                        </span>
                        <span
                          className="flex-1 text-xs text-right"
                          style={{
                            fontWeight: m.winnerId === m.playerB?.id ? 700 : 400,
                            color: m.winnerId === m.playerB?.id ? '#22C55E' : '#D1D5DB',
                          }}
                        >
                          {m.playerB?.name}
                        </span>
                        {m.status === 'completed' ? (
                          <div className="flex gap-1 items-center">
                            <Badge color={m.resultType === RESULT.DRAW && !m.overtime ? '#F59E0B' : '#22C55E'}>
                              {m.resultType === RESULT.DRAW && !m.overtime ? '引分' : m.resultType === RESULT.DEFAULT_WIN ? '不戦勝' : m.resultType === RESULT.DISQUALIFICATION ? '失格' : '完了'}
                            </Badge>
                            <button
                              className="px-1.5 py-[3px] rounded-md bg-gray-600 text-white text-[9px] font-semibold cursor-pointer border-none"
                              onClick={() => setRecordingMatch(m)}
                            >
                              修正
                            </button>
                          </div>
                        ) : m.status === 'active' ? (
                          <button
                            className="px-2.5 py-[5px] rounded-md bg-red-500 text-white text-[11px] font-semibold cursor-pointer border-none"
                            onClick={() => setRecordingMatch(m)}
                          >
                            入力
                          </button>
                        ) : (
                          <button
                            className="px-2.5 py-[5px] rounded-md bg-gray-600 text-white text-[11px] font-semibold cursor-pointer border-none"
                            onClick={() => activateMatch(m.id)}
                          >
                            開始
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* リーグ決勝結果 */}
            {(() => {
              const lfMatches = allMatches.filter(m => m.categoryId === selectedCat && m.type === 'league' && m.phaseKey === PHASE_TYPES.LEAGUE_FINAL);
              const lfPlayers = leagueGroups[`${selectedCat}_final`]?.[0];
              if (lfMatches.length === 0 || !lfPlayers) return null;
              const standings = calcStandings(lfPlayers as Player[], lfMatches);
              const medals = ['\u{1F947}', '\u{1F948}', '\u{1F949}'];
              const medalColorsArr = ['#FFD700', '#C0C0C0', '#CD7F32'];
              return (
                <div className="mb-2">
                  <div className="text-xs font-bold mb-2 px-2.5 py-1.5 rounded-md" style={{ color: '#F472B6', background: 'rgba(244,114,182,0.06)', border: '1px solid rgba(244,114,182,0.12)' }}>
                    リーグ決勝
                  </div>
                  <table className="w-full border-collapse text-xs">
                    <thead>
                      <tr>
                        <th className="p-2 text-left border-b border-white/10 text-gray-400 font-semibold text-[10px] w-[30px]">順位</th>
                        <th className="p-2 text-left border-b border-white/10 text-gray-400 font-semibold text-[10px]">選手名</th>
                        <th className="p-2 text-left border-b border-white/10 text-gray-400 font-semibold text-[10px]">所属</th>
                        <th className="p-2 text-center border-b border-white/10 text-gray-400 font-semibold text-[10px]">勝</th>
                        <th className="p-2 text-center border-b border-white/10 text-gray-400 font-semibold text-[10px]">敗</th>
                        <th className="p-2 text-center border-b border-white/10 text-gray-400 font-semibold text-[10px]">分</th>
                        <th className="p-2 text-center border-b border-white/10 text-gray-400 font-semibold text-[10px]">取本</th>
                        <th className="p-2 text-center border-b border-white/10 text-gray-400 font-semibold text-[10px]">失本</th>
                        <th className="p-2 text-center border-b border-white/10 text-gray-400 font-semibold text-[10px]">警告</th>
                        <th className="p-2 text-center border-b border-white/10 text-gray-400 font-semibold text-[10px]">勝点</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        let currentRank = 1;
                        return standings.map((s, i) => {
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
                          const mc = medalColorsArr[currentRank - 1];
                          return (
                            <tr key={s.id} style={{ background: currentRank <= 3 ? `${mc}08` : 'transparent' }}>
                              <td className="p-2 border-b border-white/[0.04] font-bold" style={{ color: mc || '#9CA3AF' }}>
                                {currentRank <= 3 ? medals[currentRank - 1] : currentRank}
                              </td>
                              <td className="p-2 border-b border-white/[0.04] font-bold text-white"><NameWithKana name={s.name} kana={s.nameKana} size="sm" /></td>
                              <td className="p-2 border-b border-white/[0.04] text-[11px] text-gray-300">{s.dojo}</td>
                              <td className="p-2 border-b border-white/[0.04] text-center text-green-500">{s.wins}</td>
                              <td className="p-2 border-b border-white/[0.04] text-center text-red-500">{s.losses}</td>
                              <td className="p-2 border-b border-white/[0.04] text-center text-gray-300">{s.draws}</td>
                              <td className="p-2 border-b border-white/[0.04] text-center text-blue-400">{s.ipponFor}</td>
                              <td className="p-2 border-b border-white/[0.04] text-center text-orange-400">{s.ipponAgainst}</td>
                              <td className="p-2 border-b border-white/[0.04] text-center text-yellow-500">{s.totalWarnings > 0 ? s.totalWarnings : '-'}</td>
                              <td className="p-2 border-b border-white/[0.04] text-center font-bold text-amber-500">{s.points}</td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                  <div className="mt-2">
                    <div className="text-xs font-bold text-gray-400 mb-1.5">リーグ決勝 対戦結果</div>
                    {lfMatches.map(m => (
                      <div
                        key={m.id}
                        className="flex items-center gap-2 px-2.5 py-1.5 mb-1 rounded-md"
                        style={{
                          background: m.status === 'completed' ? 'rgba(244,114,182,0.04)' : m.status === 'active' ? 'rgba(239,68,68,0.06)' : 'rgba(255,255,255,0.02)',
                          border: `1px solid ${m.status === 'completed' ? 'rgba(244,114,182,0.1)' : 'rgba(255,255,255,0.05)'}`,
                        }}
                      >
                        <span className="text-[10px] text-pink-400 min-w-[30px] font-bold">決勝</span>
                        <span
                          className="flex-1 text-xs"
                          style={{
                            fontWeight: m.winnerId === m.playerA?.id ? 700 : 400,
                            color: m.winnerId === m.playerA?.id ? '#22C55E' : '#D1D5DB',
                          }}
                        >
                          {m.playerA?.name}
                        </span>
                        <span className="text-[13px] font-bold text-white min-w-[50px] text-center">
                          <ScoreWithWarnings match={m} />
                        </span>
                        <span
                          className="flex-1 text-xs text-right"
                          style={{
                            fontWeight: m.winnerId === m.playerB?.id ? 700 : 400,
                            color: m.winnerId === m.playerB?.id ? '#22C55E' : '#D1D5DB',
                          }}
                        >
                          {m.playerB?.name}
                        </span>
                        {m.status === 'completed' ? (
                          <div className="flex gap-1 items-center">
                            <Badge color={m.resultType === RESULT.DRAW && !m.overtime ? '#F59E0B' : '#22C55E'}>
                              {m.resultType === RESULT.DRAW && !m.overtime ? '引分' : '完了'}
                            </Badge>
                            <button
                              className="px-1.5 py-[3px] rounded-md bg-gray-600 text-white text-[9px] font-semibold cursor-pointer border-none"
                              onClick={() => setRecordingMatch(m)}
                            >
                              修正
                            </button>
                          </div>
                        ) : m.status === 'active' ? (
                          <button
                            className="px-2.5 py-[5px] rounded-md bg-red-500 text-white text-[11px] font-semibold cursor-pointer border-none"
                            onClick={() => setRecordingMatch(m)}
                          >
                            入力
                          </button>
                        ) : (
                          <button
                            className="px-2.5 py-[5px] rounded-md bg-gray-600 text-white text-[11px] font-semibold cursor-pointer border-none"
                            onClick={() => activateMatch(m.id)}
                          >
                            開始
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* トーナメント表 + 試合一覧 */}
            {tournamentData[selectedCat] && (
              <div className="mt-2">
                <div className="text-xs font-bold text-gray-400 mb-1.5">
                  {PHASE_LABELS[(catPhases[selectedCat] as PhaseType) || PHASE_TYPES.SETUP]} トーナメント表
                </div>
                <BracketView
                  matches={allMatches.filter(m => m.categoryId === selectedCat && m.type === 'tournament')}
                  totalRounds={tournamentData[selectedCat].totalRounds}
                />
                <div className="mt-2.5 text-xs font-bold text-gray-400 mb-1.5">試合一覧</div>
                {allMatches
                  .filter(m => m.categoryId === selectedCat && m.type === 'tournament' && !m.isBye)
                  .map(m => (
                    <div
                      key={m.id}
                      className="flex items-center gap-2 px-2.5 py-1.5 mb-1 rounded-md"
                      style={{
                        background: m.isThirdPlace
                          ? 'rgba(245,158,11,0.06)'
                          : m.status === 'completed'
                            ? 'rgba(34,197,94,0.04)'
                            : m.status === 'active'
                              ? 'rgba(239,68,68,0.06)'
                              : 'rgba(255,255,255,0.02)',
                        border: `1px solid ${m.isThirdPlace ? 'rgba(245,158,11,0.15)' : m.status === 'completed' ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.05)'}`,
                      }}
                    >
                      <span
                        className="text-[10px] min-w-[50px]"
                        style={{
                          color: m.isThirdPlace ? '#F59E0B' : '#9CA3AF',
                          fontWeight: m.isThirdPlace ? 700 : 400,
                        }}
                      >
                        {m.isThirdPlace ? '3位' : `R${m.round}-${(m.position ?? 0) + 1}`}
                      </span>
                      <span
                        className="flex-1 text-xs"
                        style={{
                          fontWeight: m.winnerId === m.playerA?.id ? 700 : 400,
                          color: m.winnerId === m.playerA?.id ? '#22C55E' : m.playerA ? '#D1D5DB' : '#4B5563',
                        }}
                      >
                        {m.playerA?.name || '（未定）'}
                      </span>
                      <span className="text-[13px] font-bold text-white min-w-[50px] text-center">
                        <ScoreWithWarnings match={m} />
                      </span>
                      <span
                        className="flex-1 text-xs text-right"
                        style={{
                          fontWeight: m.winnerId === m.playerB?.id ? 700 : 400,
                          color: m.winnerId === m.playerB?.id ? '#22C55E' : m.playerB ? '#D1D5DB' : '#4B5563',
                        }}
                      >
                        {m.playerB?.name || '（未定）'}
                      </span>
                      {m.status === 'completed' ? (
                        <div className="flex gap-1 items-center">
                          <Badge color="#22C55E">完了</Badge>
                          <button
                            className="px-1.5 py-[3px] rounded-md bg-gray-600 text-white text-[9px] font-semibold cursor-pointer border-none"
                            onClick={() => setRecordingMatch(m)}
                          >
                            修正
                          </button>
                        </div>
                      ) : m.status === 'active' ? (
                        <button
                          className="px-2.5 py-[5px] rounded-md bg-red-500 text-white text-[11px] font-semibold cursor-pointer border-none"
                          onClick={() => setRecordingMatch(m)}
                        >
                          入力
                        </button>
                      ) : m.playerA && m.playerB ? (
                        <button
                          className="px-2.5 py-[5px] rounded-md bg-gray-600 text-white text-[11px] font-semibold cursor-pointer border-none"
                          onClick={() => activateMatch(m.id)}
                        >
                          開始
                        </button>
                      ) : (
                        <span className="text-[10px] text-gray-600">待機</span>
                      )}
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 次フェーズモーダル */}
      {nextPhaseModal && (
        <NextPhaseModal
          catId={nextPhaseModal.catId}
          currentPhase={nextPhaseModal.currentPhase}
          defaultAdvance={catAdvanceCounts[nextPhaseModal.catId] || 1}
          defaultThirdPlace={catThirdPlace[nextPhaseModal.catId] !== false}
          onClose={() => setNextPhaseModal(null)}
          onSelect={(phase, count, hasTP) => {
            advancePhase(nextPhaseModal.catId, phase, count, hasTP);
            setNextPhaseModal(null);
          }}
        />
      )}

      {/* フェーズ戻し確認 */}
      {confirmRevert && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[200]" onClick={() => setConfirmRevert(null)}>
          <div
            className="bg-modal-bg rounded-[14px] p-6 max-w-[400px] w-[95%] border border-white/10"
            onClick={e => e.stopPropagation()}
          >
            <div className="text-base font-bold text-amber-500 mb-3">ステージを戻しますか？</div>
            <div className="text-[13px] text-gray-300 mb-1.5">
              <strong>{categories.find(c => c.id === confirmRevert)?.label}</strong>
            </div>
            <div className="text-xs text-gray-400 mb-4">
              現在の「{PHASE_LABELS[(catPhases[confirmRevert] as PhaseType) || PHASE_TYPES.SETUP]}」のデータを削除し、前のリーグ戦に戻します。この操作は取り消せません。
            </div>
            <div className="flex justify-end gap-2">
              <button
                className="px-3.5 py-[7px] rounded-md bg-gray-600 text-white text-xs font-semibold cursor-pointer border-none"
                onClick={() => setConfirmRevert(null)}
              >
                キャンセル
              </button>
              <button
                className="px-3.5 py-[7px] rounded-md bg-amber-600 text-white text-xs font-semibold cursor-pointer border-none"
                onClick={() => {
                  revertPhase(confirmRevert);
                  setConfirmRevert(null);
                }}
              >
                戻す
              </button>
            </div>
          </div>
        </div>
      )}

      {/* リセット確認モーダル */}
      {showResetConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[200]" onClick={() => setShowResetConfirm(false)}>
          <div
            className="bg-modal-bg rounded-[14px] p-6 max-w-[420px] w-[95%] border border-white/10"
            onClick={e => e.stopPropagation()}
          >
            <div className="text-lg font-bold text-red-500 mb-3 flex items-center gap-2">
              <span className="text-2xl">⚠️</span>
              全データをリセットしますか？
            </div>
            <div className="text-[13px] text-gray-300 mb-2">
              以下の全てのデータが<strong className="text-red-400">完全に削除</strong>されます：
            </div>
            <ul className="text-xs text-gray-400 mb-4 list-disc pl-5 space-y-1">
              <li>登録選手データ（{players.length}名）</li>
              <li>全試合結果（{completedMatches}/{totalMatches}試合）</li>
              <li>カテゴリ設定・コート割当</li>
              <li>団体戦チーム・試合データ</li>
            </ul>
            <div className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 mb-4">
              この操作は取り消せません。大会途中の場合、全ての進行状況が失われます。
            </div>
            <div className="flex justify-end gap-2">
              <button
                className="px-5 py-2 rounded-md bg-gray-600 text-white text-xs font-semibold cursor-pointer border-none"
                onClick={() => setShowResetConfirm(false)}
              >
                キャンセル
              </button>
              <button
                className="px-5 py-2 rounded-md bg-red-600 text-white text-xs font-semibold cursor-pointer border-none"
                onClick={() => {
                  reset();
                  setShowResetConfirm(false);
                }}
              >
                全データを削除する
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 決勝戦パネル */}
      <FinalsPanel
        allMatches={allMatches}
        catPhases={catPhases}
        tournamentData={tournamentData}
        onRecordMatch={setRecordingMatch}
        onActivateMatch={activateMatch}
      />

      {/* 試合結果入力モーダル */}
      {recordingMatch && (
        <MatchRecordModal
          match={recordingMatch}
          onClose={() => setRecordingMatch(null)}
          onSubmit={handleSubmitMatch}
        />
      )}
    </div>
  );
}

// ==========================================
// 決勝戦パネル（管理画面用）
// ==========================================
function FinalsPanel({
  allMatches,
  catPhases,
  tournamentData,
  onRecordMatch,
  onActivateMatch,
}: {
  allMatches: Match[];
  catPhases: Record<string, PhaseType>;
  tournamentData: Record<string, TournamentData>;
  onRecordMatch: (m: Match) => void;
  onActivateMatch: (id: string) => void;
}) {
  const { categories, getDeferredFinals, allFinalsReady, startFinals, setFinalsVenue, finalsVenueId } = useTournamentStore();
  const deferredFinals = getDeferredFinals();
  const isReady = allFinalsReady();

  // 決勝待ちカテゴリ数
  const awaitingCount = Object.values(catPhases).filter(p => p === PHASE_TYPES.AWAITING_FINALS).length;
  // まだトーナメント進行中のカテゴリ数
  const inProgressCount = Object.entries(catPhases).filter(([catId, phase]) =>
    (phase === PHASE_TYPES.FINAL_TOURNAMENT || phase === PHASE_TYPES.PRE_TOURNAMENT) &&
    tournamentData[catId]
  ).length;
  // 完了した決勝数
  const completedFinals = deferredFinals.filter(m => m.status === 'completed').length;

  if (awaitingCount === 0 && deferredFinals.length === 0) return null;

  return (
    <div className="bg-white/[0.03] border border-white/[0.07] rounded-[10px] p-4 mb-3">
      <div className="text-sm font-bold text-white mb-3 flex items-center gap-2">
        <span className="text-amber-400 text-base">🏆</span>
        全学年 決勝戦
        {completedFinals === deferredFinals.length && deferredFinals.length > 0 && (
          <Badge color="#22C55E">全完了</Badge>
        )}
      </div>

      {/* ステータス */}
      <div className="flex items-center gap-3 mb-3 text-[11px]">
        <span className="text-purple-400 font-semibold">決勝待ち: {awaitingCount}カテゴリ</span>
        {inProgressCount > 0 && (
          <span className="text-amber-500 font-semibold">進行中: {inProgressCount}カテゴリ</span>
        )}
        <span className="text-green-500 font-semibold">決勝完了: {completedFinals}/{deferredFinals.length}</span>
      </div>

      {/* コート選択 + 開始ボタン */}
      {deferredFinals.length > 0 && deferredFinals.some(m => m.status !== 'completed') && (
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-[11px] text-gray-400">決勝コート:</span>
          {VENUES.map(v => (
            <button
              key={v.id}
              className="px-3 py-1.5 rounded-md text-[11px] font-bold cursor-pointer border-none"
              style={{
                background: finalsVenueId === v.id ? v.color : 'rgba(255,255,255,0.05)',
                color: finalsVenueId === v.id ? 'white' : '#9CA3AF',
                border: `1px solid ${finalsVenueId === v.id ? v.color : 'rgba(255,255,255,0.1)'}`,
              }}
              onClick={() => setFinalsVenue(v.id)}
            >
              {v.name}
            </button>
          ))}
          {finalsVenueId && !deferredFinals.some(m => m.venueId) && (
            <button
              className="px-4 py-1.5 rounded-md bg-amber-600 text-white text-[11px] font-bold cursor-pointer border-none ml-2"
              onClick={() => startFinals(finalsVenueId)}
            >
              決勝戦をこのコートに割り当て
            </button>
          )}
        </div>
      )}

      {/* 決勝戦リスト */}
      {deferredFinals.map(m => {
        const catLabel = categories.find(c => c.id === m.categoryId)?.label || '';
        return (
          <div
            key={m.id}
            className="flex items-center gap-2 px-2.5 py-2 mb-1 rounded-md"
            style={{
              background: m.status === 'completed' ? 'rgba(34,197,94,0.04)' : m.status === 'active' ? 'rgba(239,68,68,0.06)' : 'rgba(255,255,255,0.02)',
              border: `1px solid ${m.status === 'completed' ? 'rgba(34,197,94,0.1)' : m.status === 'active' ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.05)'}`,
            }}
          >
            <div className="min-w-[110px]">
              <div className="text-[11px] font-semibold text-white">{catLabel}</div>
              <div className="text-[10px] font-bold text-amber-400">決勝</div>
            </div>
            <span
              className="flex-1 text-xs"
              style={{
                fontWeight: m.winnerId === m.playerA?.id ? 700 : 400,
                color: m.winnerId === m.playerA?.id ? '#22C55E' : m.playerA ? '#D1D5DB' : '#4B5563',
              }}
            >
              {m.playerA?.name || '（未定）'}
            </span>
            <span className="text-[13px] font-bold text-white min-w-[50px] text-center">
              <ScoreWithWarnings match={m} />
            </span>
            <span
              className="flex-1 text-xs text-right"
              style={{
                fontWeight: m.winnerId === m.playerB?.id ? 700 : 400,
                color: m.winnerId === m.playerB?.id ? '#22C55E' : m.playerB ? '#D1D5DB' : '#4B5563',
              }}
            >
              {m.playerB?.name || '（未定）'}
            </span>
            {m.status === 'completed' ? (
              <div className="flex gap-1 items-center">
                <Badge color="#22C55E">完了</Badge>
                <button
                  className="px-1.5 py-[3px] rounded-md bg-gray-600 text-white text-[9px] font-semibold cursor-pointer border-none"
                  onClick={() => onRecordMatch(m)}
                >
                  修正
                </button>
              </div>
            ) : m.status === 'active' ? (
              <button
                className="px-2.5 py-[5px] rounded-md bg-red-500 text-white text-[11px] font-semibold cursor-pointer border-none"
                onClick={() => onRecordMatch(m)}
              >
                入力
              </button>
            ) : m.venueId ? (
              <button
                className="px-2.5 py-[5px] rounded-md bg-amber-600 text-white text-[11px] font-semibold cursor-pointer border-none"
                onClick={() => onActivateMatch(m.id)}
              >
                開始
              </button>
            ) : (
              <span className="text-[10px] text-gray-500">コート未割当</span>
            )}
          </div>
        );
      })}

      {inProgressCount > 0 && deferredFinals.length === 0 && (
        <div className="text-[11px] text-gray-400 py-2">
          まだトーナメント進行中のカテゴリがあります。3位決定戦まで完了すると決勝待ちに移行します。
        </div>
      )}
    </div>
  );
}

// ==========================================
// 記録係ページ
// ==========================================
function RefereePage() {
  const {
    categories,
    allMatches,
    allTeamMatches,
    venueAssignments,
    catPhases,
    tournamentData,
    leagueGroups,
    activateMatch,
    deactivateMatch,
    activateTeamMatch,
    submitMatchResult,
  } = useTournamentStore();

  const [refereeVenue, setRefereeVenue] = useState('A');
  const [recordingMatch, setRecordingMatch] = useState<Match | null>(null);
  const [recordingTeamMatchId, setRecordingTeamMatchId] = useState<string | null>(null);
  const autoOpenMatchId = useRef<string | null>(null);
  // 試合順序のカスタム並べ替え（コートごと）
  const [matchOrderMap, setMatchOrderMap] = useState<Record<string, string[]>>({});
  // サイドパネル（総当たり表・試合順リスト）の表示制御
  const [showSchedulePanel, setShowSchedulePanel] = useState(true);

  const vCats = Object.entries(venueAssignments)
    .filter(([, v]) => v === refereeVenue)
    .map(([c]) => c);
  // 通常のカテゴリ試合 + 決勝コートに割り当てられた決勝戦も含める
  const vMatches = allMatches.filter(m =>
    !m.isBye && (
      vCats.includes(m.categoryId) ||
      (m.venueId === refereeVenue && catPhases[m.categoryId] === PHASE_TYPES.AWAITING_FINALS && isFinalMatch(m, tournamentData))
    )
  );
  const activeMatch = vMatches.find(m => m.status === 'active');
  const pendingMatchesDefault = vMatches
    .filter(m => m.status === 'pending' && m.playerA && m.playerB)
    // 決勝待ち状態の決勝戦は通常キューから除外（管理画面から開始する）
    .filter(m => !(catPhases[m.categoryId] === PHASE_TYPES.AWAITING_FINALS && isFinalMatch(m, tournamentData) && !m.venueId))
    .sort((a, b) => {
      if (a.isThirdPlace && !b.isThirdPlace) return -1;
      if (!a.isThirdPlace && b.isThirdPlace) return 1;
      return (a.round || 0) - (b.round || 0);
    });
  // カスタム順序が設定されている場合はそれに従う
  const customOrder = matchOrderMap[refereeVenue];
  const pendingMatches = customOrder
    ? [...pendingMatchesDefault].sort((a, b) => {
        const idxA = customOrder.indexOf(a.id);
        const idxB = customOrder.indexOf(b.id);
        if (idxA === -1 && idxB === -1) return 0;
        if (idxA === -1) return 1;
        if (idxB === -1) return 1;
        return idxA - idxB;
      })
    : pendingMatchesDefault;
  const venue = VENUES.find(v => v.id === refereeVenue);

  const moveMatch = useCallback((matchId: string, direction: 'up' | 'down') => {
    const ids = pendingMatches.map(m => m.id);
    const idx = ids.indexOf(matchId);
    if (idx === -1) return;
    const newIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= ids.length) return;
    const newIds = [...ids];
    [newIds[idx], newIds[newIdx]] = [newIds[newIdx], newIds[idx]];
    setMatchOrderMap(prev => ({ ...prev, [refereeVenue]: newIds }));
  }, [pendingMatches, refereeVenue]);

  const handleSubmitMatch = useCallback((m: Match) => {
    submitMatchResult(m);
    setRecordingMatch(null);
  }, [submitMatchResult]);

  // 試合開始ボタンからactivateした後、自動でスコア入力画面を開く
  useEffect(() => {
    if (autoOpenMatchId.current && activeMatch && activeMatch.id === autoOpenMatchId.current) {
      setRecordingMatch(activeMatch);
      autoOpenMatchId.current = null;
    }
  }, [activeMatch]);

  return (
    <div>
      {/* コート選択 */}
      <div className="flex gap-1.5 mb-4 items-center">
        {VENUES.map(v => (
          <button
            key={v.id}
            className="flex-1 py-2.5 rounded-md text-[13px] font-semibold text-white cursor-pointer border-none text-center"
            style={{ background: v.id === refereeVenue ? v.color : '#374151' }}
            onClick={() => setRefereeVenue(v.id)}
          >
            {v.name}
          </button>
        ))}
        <button
          onClick={() => setShowSchedulePanel(p => !p)}
          className="hidden lg:inline-flex px-3 py-2 rounded-md text-[11px] font-semibold cursor-pointer border-none"
          style={{
            background: showSchedulePanel ? 'rgba(185,28,28,0.15)' : 'rgba(255,255,255,0.06)',
            color: showSchedulePanel ? '#FCA5A5' : '#D6DCE8',
          }}
          title="総当たり表・試合順パネルの表示/非表示"
        >
          {showSchedulePanel ? '◀ 試合順' : '試合順 ▶'}
        </button>
      </div>

      <div className={`flex flex-col ${showSchedulePanel ? 'lg:flex-row' : ''} gap-3`}>
        <div className="flex-1 min-w-0">

      {/* 現在の試合 */}
      <div
        className="bg-white/[0.03] rounded-[10px] p-4 mb-3"
        style={{ border: `2px solid ${venue?.color}30` }}
      >
        <div className="text-sm font-bold text-white mb-3 flex items-center gap-2">
          <span
            className="w-2.5 h-2.5 rounded-full inline-block"
            style={{
              background: venue?.color,
              boxShadow: activeMatch ? `0 0 10px ${venue?.color}` : 'none',
            }}
          />
          現在の試合 — {venue?.name}
        </div>
        {activeMatch ? (
          <div className="text-center py-4">
            {/* カテゴリ + 種別表示 */}
            <div className="inline-block px-5 py-1.5 rounded-lg mb-3 bg-white/[0.06] border border-white/10">
              <div className="text-base font-extrabold text-white">
                {categories.find(c => c.id === activeMatch.categoryId)?.label}
              </div>
              <div className="text-sm font-bold mt-0.5" style={{ color: matchTypeColor(activeMatch) }}>
                {activeMatch.isThirdPlace
                  ? '3位決定戦'
                  : activeMatch.type === 'league'
                    ? `リーグ戦 ${String.fromCharCode(65 + (activeMatch.groupIndex || 0))}グループ`
                    : matchTypeLabel(activeMatch, tournamentData)}
              </div>
            </div>
            <div className="flex items-center justify-center gap-4">
              <div
                className="flex-1 max-w-[200px] py-4 px-3 rounded-[10px] text-center"
                style={{ border: `2px solid ${WHITE_BORDER}`, background: WHITE_BG }}
              >
                <div className="text-[10px] font-bold mb-1" style={{ color: WHITE_PLAYER }}>白</div>
                <div className="text-lg font-bold text-white"><NameWithKana name={activeMatch.playerB?.name || ''} kana={activeMatch.playerB?.nameKana} size="lg" /></div>
                <div className="text-[10px] text-gray-400 mt-0.5">{activeMatch.playerB?.dojo}</div>
              </div>
              <div className="text-[22px] font-extrabold text-gray-600">VS</div>
              <div
                className="flex-1 max-w-[200px] py-4 px-3 rounded-[10px] text-center"
                style={{ border: `2px solid ${RED}40`, background: `${RED}08` }}
              >
                <div className="text-[10px] font-bold mb-1" style={{ color: RED }}>赤</div>
                <div className="text-lg font-bold text-white"><NameWithKana name={activeMatch.playerA?.name || ''} kana={activeMatch.playerA?.nameKana} size="lg" /></div>
                <div className="text-[10px] text-gray-400 mt-0.5">{activeMatch.playerA?.dojo}</div>
              </div>
            </div>
            <button
              className="mt-4 px-10 py-3 rounded-md bg-green-600 text-white text-[15px] font-semibold cursor-pointer border-none"
              onClick={() => setRecordingMatch(activeMatch)}
            >
              記録・結果入力
            </button>
          </div>
        ) : pendingMatches.length > 0 ? (
          <div className="text-center py-4">
            {/* 次の試合の選手を直接表示 */}
            <div className="inline-block px-5 py-1.5 rounded-lg mb-3 bg-white/[0.06] border border-white/10">
              <div className="text-base font-extrabold text-white">
                {categories.find(c => c.id === pendingMatches[0].categoryId)?.label}
              </div>
              <div className="text-sm font-bold mt-0.5" style={{ color: matchTypeColor(pendingMatches[0]) }}>
                {pendingMatches[0].isThirdPlace
                  ? '3位決定戦'
                  : pendingMatches[0].type === 'league'
                    ? `リーグ戦 ${String.fromCharCode(65 + (pendingMatches[0].groupIndex || 0))}グループ`
                    : matchTypeLabel(pendingMatches[0], tournamentData)}
              </div>
            </div>
            <div className="flex items-center justify-center gap-4">
              <div
                className="flex-1 max-w-[200px] py-4 px-3 rounded-[10px] text-center"
                style={{ border: `2px solid ${WHITE_BORDER}`, background: WHITE_BG }}
              >
                <div className="text-[10px] font-bold mb-1" style={{ color: WHITE_PLAYER }}>白</div>
                <div className="text-lg font-bold text-white"><NameWithKana name={pendingMatches[0].playerB?.name || ''} kana={pendingMatches[0].playerB?.nameKana} size="lg" /></div>
                <div className="text-[10px] text-gray-400 mt-0.5">{pendingMatches[0].playerB?.dojo}</div>
              </div>
              <div className="text-[22px] font-extrabold text-gray-600">VS</div>
              <div
                className="flex-1 max-w-[200px] py-4 px-3 rounded-[10px] text-center"
                style={{ border: `2px solid ${RED}40`, background: `${RED}08` }}
              >
                <div className="text-[10px] font-bold mb-1" style={{ color: RED }}>赤</div>
                <div className="text-lg font-bold text-white"><NameWithKana name={pendingMatches[0].playerA?.name || ''} kana={pendingMatches[0].playerA?.nameKana} size="lg" /></div>
                <div className="text-[10px] text-gray-400 mt-0.5">{pendingMatches[0].playerA?.dojo}</div>
              </div>
            </div>
            <button
              className="mt-4 px-10 py-3 rounded-md text-white text-[15px] font-semibold cursor-pointer border-none"
              style={{ background: venue?.color || '#B91C1C' }}
              onClick={() => {
                autoOpenMatchId.current = pendingMatches[0].id;
                activateMatch(pendingMatches[0].id);
              }}
            >
              試合開始
            </button>
          </div>
        ) : (
          <div className="text-center py-[30px] text-gray-500">
            このコートの試合は全て完了、または未割当です
          </div>
        )}
      </div>

      {/* 待機中の試合 */}
      <div className="bg-white/[0.03] border border-white/[0.07] rounded-[10px] p-4 mb-3">
        <div className="text-sm font-bold text-white mb-3">次の試合予定（{pendingMatches.length}試合）</div>
        {pendingMatches.slice(0, 8).map((m, idx) => (
          <div
            key={m.id}
            className="flex items-center gap-2 px-2.5 py-2 mb-1 rounded-md"
            style={{
              background: m.isThirdPlace ? 'rgba(245,158,11,0.04)' : 'rgba(255,255,255,0.02)',
              border: `1px solid ${m.isThirdPlace ? 'rgba(245,158,11,0.12)' : 'rgba(255,255,255,0.05)'}`,
            }}
          >
            <div className="min-w-[100px]">
              <div className="text-[11px] font-semibold text-white">
                {categories.find(c => c.id === m.categoryId)?.label}
              </div>
              <div className="text-[10px] font-bold" style={{ color: matchTypeColor(m) }}>
                {m.isThirdPlace
                  ? '3位決定戦'
                  : m.type === 'league'
                    ? `${String.fromCharCode(65 + (m.groupIndex || 0))}グループ`
                    : matchTypeLabel(m, tournamentData)}
              </div>
            </div>
            <span className="flex-1 text-center font-semibold text-white text-xs">
              <NameWithKana name={m.playerB?.name || ''} kana={m.playerB?.nameKana} size="sm" /> vs <NameWithKana name={m.playerA?.name || ''} kana={m.playerA?.nameKana} size="sm" />
            </span>
            {/* 上下入替ボタン */}
            <div className="flex flex-col gap-0.5 flex-shrink-0">
              <button
                className="w-6 h-5 rounded text-[10px] font-bold cursor-pointer border-none flex items-center justify-center"
                style={{ background: idx > 0 ? 'rgba(255,255,255,0.08)' : 'transparent', color: idx > 0 ? '#D6DCE8' : '#374151' }}
                onClick={() => moveMatch(m.id, 'up')}
                disabled={idx === 0}
              >
                ▲
              </button>
              <button
                className="w-6 h-5 rounded text-[10px] font-bold cursor-pointer border-none flex items-center justify-center"
                style={{ background: idx < pendingMatches.length - 1 ? 'rgba(255,255,255,0.08)' : 'transparent', color: idx < pendingMatches.length - 1 ? '#D6DCE8' : '#374151' }}
                onClick={() => moveMatch(m.id, 'down')}
                disabled={idx >= pendingMatches.length - 1}
              >
                ▼
              </button>
            </div>
            <button
              className="px-2.5 py-[5px] rounded-md text-white text-[11px] font-semibold cursor-pointer border-none flex-shrink-0"
              style={{ background: activeMatch ? '#4B5563' : (venue?.color || '#B91C1C') }}
              onClick={() => {
                autoOpenMatchId.current = m.id;
                activateMatch(m.id);
              }}
            >
              {activeMatch ? '入替' : '開始'}
            </button>
          </div>
        ))}
        {pendingMatches.length === 0 && <div className="text-gray-500 text-xs">待機中の試合なし</div>}
      </div>

      {/* 完了した試合 */}
      {(() => {
        const completedVenueMatches = vMatches.filter(m => m.status === 'completed' && !m.isBye);
        if (completedVenueMatches.length === 0) return null;
        return (
          <div className="bg-white/[0.03] border border-white/[0.07] rounded-[10px] p-4 mb-3">
            <div className="text-sm font-bold text-white mb-3">完了した試合（{completedVenueMatches.length}試合）</div>
            {completedVenueMatches.slice(-10).reverse().map(m => (
              <div
                key={m.id}
                className="flex items-center gap-2 px-2.5 py-1.5 mb-1 rounded-md"
                style={{
                  background: m.isThirdPlace ? 'rgba(245,158,11,0.04)' : 'rgba(34,197,94,0.03)',
                  border: `1px solid ${m.isThirdPlace ? 'rgba(245,158,11,0.1)' : 'rgba(34,197,94,0.08)'}`,
                }}
              >
                <div className="min-w-[100px]">
                  <div className="text-[10px] font-semibold text-gray-300">
                    {categories.find(c => c.id === m.categoryId)?.label}
                  </div>
                  <div className="text-[9px] font-bold" style={{ color: matchTypeColor(m) }}>
                    {m.isThirdPlace
                      ? '3位決定戦'
                      : m.type === 'league'
                        ? `${String.fromCharCode(65 + (m.groupIndex || 0))}グループ`
                        : matchTypeLabel(m, tournamentData)}
                  </div>
                </div>
                <span
                  className="flex-1 text-xs"
                  style={{
                    fontWeight: m.winnerId === m.playerB?.id ? 700 : 400,
                    color: m.winnerId === m.playerB?.id ? '#22C55E' : '#D1D5DB',
                  }}
                >
                  <span style={{ color: WHITE_PLAYER, fontSize: '9px' }}>白 </span><NameWithKana name={m.playerB?.name || ''} kana={m.playerB?.nameKana} size="sm" />
                </span>
                <span className="text-[13px] font-bold text-white min-w-[50px] text-center inline-flex flex-col items-center justify-center leading-tight">
                  <span className="inline-flex items-center">
                    {m.scoreB}{(m.warningsB || 0) > 0 && <WarningIndicator warnings={m.warningsB} />}
                    {' - '}
                    {m.scoreA}{(m.warningsA || 0) > 0 && <WarningIndicator warnings={m.warningsA} />}
                  </span>
                  {m.overtime && (
                    <span className="text-[9px] text-amber-400 font-semibold inline-flex items-center gap-0.5 mt-0.5">
                      <span className="text-[8px] text-amber-300/70 mr-0.5">延長</span>
                      <span>{m.overtime.scoreB}</span>
                      {(m.overtime.warningsB || 0) > 0 && <WarningIndicator warnings={m.overtime.warningsB} />}
                      <span>-</span>
                      <span>{m.overtime.scoreA}</span>
                      {(m.overtime.warningsA || 0) > 0 && <WarningIndicator warnings={m.overtime.warningsA} />}
                    </span>
                  )}
                </span>
                <span
                  className="flex-1 text-xs text-right"
                  style={{
                    fontWeight: m.winnerId === m.playerA?.id ? 700 : 400,
                    color: m.winnerId === m.playerA?.id ? '#22C55E' : '#D1D5DB',
                  }}
                >
                  <NameWithKana name={m.playerA?.name || ''} kana={m.playerA?.nameKana} size="sm" /><span style={{ color: RED, fontSize: '9px' }}> 赤</span>
                </span>
                <button
                  className="px-2 py-1 rounded-md bg-gray-600 text-white text-[10px] font-semibold cursor-pointer border-none"
                  onClick={() => setRecordingMatch(m)}
                >
                  修正
                </button>
              </div>
            ))}
          </div>
        );
      })()}

      {/* 団体戦セクション */}
      {(() => {
        // コート割当済みの団体戦 + コート未割当の団体戦も表示
        const vTeamMatches = allTeamMatches.filter(m =>
          !m.isBye && (
            vCats.includes(m.categoryId) ||
            !Object.keys(venueAssignments).includes(m.categoryId)
          )
        );
        const activeTeamMatch = vTeamMatches.find(m => m.status === 'active');
        const pendingTeamMatches = vTeamMatches.filter(m => m.status === 'pending' && m.teamA && m.teamB);

        if (vTeamMatches.length === 0) return null;

        return (
          <div className="bg-white/[0.03] border border-white/[0.07] rounded-[10px] p-4 mb-3">
            <div className="text-sm font-bold text-white mb-3 flex items-center gap-2">
              団体戦
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400 border border-purple-500/30">団体</span>
            </div>

            {/* 現在進行中の団体戦 */}
            {activeTeamMatch && (
              <div
                className="p-4 rounded-lg mb-3 cursor-pointer"
                style={{ background: 'rgba(168,85,247,0.1)', border: '2px solid rgba(168,85,247,0.4)' }}
                onClick={() => setRecordingTeamMatchId(activeTeamMatch.id)}
              >
                <div className="text-[11px] text-purple-400 font-bold mb-1">
                  {categories.find(c => c.id === activeTeamMatch.categoryId)?.label}
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-white font-bold">{activeTeamMatch.teamB?.name || 'TBD'}</span>
                  <span className="text-gray-500 text-sm">VS</span>
                  <span style={{ color: RED }} className="font-bold">{activeTeamMatch.teamA?.name || 'TBD'}</span>
                </div>
                <div className="text-[10px] text-gray-400 mt-1 text-center">
                  {activeTeamMatch.bouts.filter(b => b.status === 'completed').length}/3 取組完了
                </div>
              </div>
            )}

            {/* 待機中の団体戦 */}
            {pendingTeamMatches.map(m => (
              <div
                key={m.id}
                className="flex items-center justify-between p-2.5 px-3 mb-1 rounded-lg bg-white/[0.02] border border-white/[0.06] cursor-pointer"
                onClick={() => { activateTeamMatch(m.id); setRecordingTeamMatchId(m.id); }}
              >
                <div>
                  <span className="text-[10px] text-purple-400 font-semibold mr-2">
                    {categories.find(c => c.id === m.categoryId)?.label}
                  </span>
                  <span className="text-[11px] text-gray-300">{m.teamB?.name} vs {m.teamA?.name}</span>
                </div>
                <span className="text-[10px] text-gray-500">開始</span>
              </div>
            ))}
          </div>
        );
      })()}

        </div>
        {/* サイドパネル: 試合順・総当たり表 */}
        {showSchedulePanel && (() => {
          // コート内の全試合（BYE除く、完了・進行中・待機）
          const allVenueMatches = vMatches.filter(m => !m.isBye);
          // 表示順: 完了 → 進行中 → 待機（待機はpendingMatchesの並び順）
          const completedVM = allVenueMatches.filter(m => m.status === 'completed');
          const activeVM = allVenueMatches.filter(m => m.status === 'active');
          const sortedSchedule = [...completedVM, ...activeVM, ...pendingMatches];

          // コート内のリーグ戦カテゴリ別の総当たり表
          const leagueCatsInVenue = Array.from(new Set(
            vMatches.filter(m => m.type === 'league').map(m => m.categoryId)
          ));

          return (
            <aside
              className="lg:w-[360px] xl:w-[400px] flex-shrink-0 bg-white/[0.03] border border-white/[0.07] rounded-[10px] p-3 self-start lg:sticky lg:top-20"
              style={{ maxHeight: 'calc(100vh - 120px)', overflowY: 'auto' }}
            >
              <div className="text-sm font-bold text-white mb-2 flex items-center gap-2">
                <span
                  className="w-2 h-2 rounded-full inline-block"
                  style={{ background: venue?.color }}
                />
                {venue?.name} 試合順・対戦表
              </div>

              {/* 総当たり表（リーグ戦カテゴリ毎） */}
              {leagueCatsInVenue.length > 0 && (
                <div className="mb-3">
                  <div className="text-[10px] font-bold text-gray-400 mb-2">総当たり表</div>
                  {leagueCatsInVenue.map(catId => {
                    const cat = categories.find(c => c.id === catId);
                    // 予選リーグ
                    const preGroups = leagueGroups[catId] || [];
                    const preMatches = allMatches.filter(m =>
                      m.categoryId === catId && m.type === 'league' && m.phaseKey === PHASE_TYPES.LEAGUE
                    );
                    // リーグ決勝
                    const lfGroup = leagueGroups[`${catId}_final`]?.[0];
                    const lfMatches = allMatches.filter(m =>
                      m.categoryId === catId && m.type === 'league' && m.phaseKey === PHASE_TYPES.LEAGUE_FINAL
                    );
                    return (
                      <div key={catId} className="mb-3">
                        <div className="text-[10px] font-semibold text-gray-300 mb-1">
                          {cat?.label}
                        </div>
                        {(preGroups as Player[][]).map((g, gi) => {
                          const gM = preMatches.filter(m => m.groupIndex === gi);
                          return (
                            <LeagueMatrix
                              key={gi}
                              group={g}
                              matches={gM}
                              title={`${String.fromCharCode(65 + gi)}グループ`}
                            />
                          );
                        })}
                        {lfGroup && lfMatches.length > 0 && (
                          <LeagueMatrix
                            group={lfGroup as Player[]}
                            matches={lfMatches}
                            title="リーグ決勝"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* 試合順（進行状況別） */}
              <div>
                <div className="text-[10px] font-bold text-gray-400 mb-2">
                  試合順（全{sortedSchedule.length}試合）
                </div>
                {sortedSchedule.length === 0 ? (
                  <div className="text-[11px] text-gray-500 text-center py-3">試合なし</div>
                ) : (
                  <MatchScheduleList
                    matches={sortedSchedule}
                    categoriesLabel={(cid) => categories.find(c => c.id === cid)?.label || cid}
                    tournamentData={tournamentData}
                    compact
                  />
                )}
              </div>
            </aside>
          );
        })()}
      </div>

      {/* 試合結果入力モーダル */}
      {recordingMatch && (
        <MatchRecordModal
          match={recordingMatch}
          onClose={() => {
            if (recordingMatch.status === 'active') {
              deactivateMatch(recordingMatch.id);
            }
            setRecordingMatch(null);
          }}
          onSubmit={handleSubmitMatch}
        />
      )}

      {/* 団体戦入力モーダル */}
      {recordingTeamMatchId && (
        <TeamMatchRecordModal
          matchId={recordingTeamMatchId}
          onClose={() => setRecordingTeamMatchId(null)}
        />
      )}
    </div>
  );
}

// ==========================================
// モニターページ
// ==========================================
function MonitorPage() {
  const {
    categories,
    allMatches,
    venueAssignments,
    catPhases,
    tournamentData,
    getTotalMatches,
    getCompletedMatches,
    getProgressPct,
  } = useTournamentStore();

  const totalMatches = getTotalMatches();
  const completedMatches = getCompletedMatches();
  const progressPct = getProgressPct();

  return (
    <div>
      {/* 全体進行状況 */}
      <div className="bg-white/[0.03] border border-white/[0.07] rounded-[10px] p-4 mb-3">
        <div className="flex justify-between items-center mb-1.5">
          <span className="font-bold text-white text-sm">大会進行状況</span>
          <span className="text-amber-500 font-bold">{progressPct}%</span>
        </div>
        <ProgressBar pct={progressPct} color="#F59E0B" />
        <div className="text-[11px] text-gray-400 mt-1">完了: {completedMatches}/{totalMatches}試合</div>
      </div>

      {/* 2x2 コートグリッド */}
      <div className="grid grid-cols-2 gap-3">
        {VENUES.map(venue => {
          const vCats = Object.entries(venueAssignments)
            .filter(([, v]) => v === venue.id)
            .map(([c]) => c);
          const vM = allMatches.filter(m => vCats.includes(m.categoryId) && !m.isBye);
          const active = vM.find(m => m.status === 'active');
          // 進行中の試合が無い場合は「次の試合」（記録係画面トップと同じ試合）を表示
          const nextPending = !active ? vM
            .filter(m => m.status === 'pending' && m.playerA && m.playerB)
            .filter(m => !(catPhases[m.categoryId] === PHASE_TYPES.AWAITING_FINALS && isFinalMatch(m, tournamentData) && !m.venueId))
            .sort((a, b) => {
              if (a.isThirdPlace && !b.isThirdPlace) return -1;
              if (!a.isThirdPlace && b.isThirdPlace) return 1;
              return (a.round || 0) - (b.round || 0);
            })[0] : null;
          const display = active || nextPending;
          const done = vM.filter(m => m.status === 'completed').length;
          const total = vM.length;
          const pct = total > 0 ? Math.round((done / total) * 100) : 0;
          return (
            <div
              key={venue.id}
              className="bg-white/[0.03] rounded-[10px] p-4"
              style={{ border: `2px solid ${venue.color}25` }}
            >
              <div className="flex justify-between items-center mb-2">
                <div className="flex items-center gap-1.5">
                  <span
                    className="w-2.5 h-2.5 rounded-full inline-block"
                    style={{
                      background: venue.color,
                      boxShadow: active ? `0 0 10px ${venue.color}` : 'none',
                    }}
                  />
                  <span className="font-bold text-white text-sm">{venue.name}</span>
                </div>
                <span className="text-[11px] text-gray-400">{pct}%</span>
              </div>
              <ProgressBar pct={pct} color={venue.color} />
              <div className="text-[10px] text-gray-400 mt-1 mb-2.5">{done}/{total}試合完了</div>
              {display ? (
                <div className="rounded-lg p-2.5" style={{ background: `${venue.color}0A`, border: `1px solid ${venue.color}25` }}>
                  <div className="flex items-center justify-between mb-0.5">
                    <div className="text-[10px] font-semibold" style={{ color: venue.color }}>
                      {categories.find(c => c.id === display.categoryId)?.label}
                    </div>
                    <div className="text-[9px] font-bold px-1.5 py-[1px] rounded" style={{
                      background: active ? `${venue.color}30` : 'rgba(255,255,255,0.06)',
                      color: active ? venue.color : '#9CA3AF',
                    }}>
                      {active ? '試合中' : '次の試合'}
                    </div>
                  </div>
                  <div
                    className="text-[9px] font-semibold mb-1"
                    style={{ color: display.type === 'league' ? '#60A5FA' : '#FCA5A5' }}
                  >
                    {display.type === 'league'
                      ? `${String.fromCharCode(65 + (display.groupIndex || 0))}グループ`
                      : 'トーナメント'}
                  </div>
                  <div className="text-center">
                    <div className="inline-block text-center mx-1">
                      <span className="font-bold text-sm" style={{ color: RED }}><NameWithKana name={display.playerA?.name || ''} kana={display.playerA?.nameKana} size="sm" /></span>
                      {display.playerA?.dojo && <div className="text-[9px] text-gray-400">{display.playerA.dojo}</div>}
                    </div>
                    <span className="mx-2 text-gray-600 font-extrabold">VS</span>
                    <div className="inline-block text-center mx-1">
                      <span className="font-bold text-sm" style={{ color: WHITE_PLAYER }}><NameWithKana name={display.playerB?.name || ''} kana={display.playerB?.nameKana} size="sm" /></span>
                      {display.playerB?.dojo && <div className="text-[9px] text-gray-400">{display.playerB.dojo}</div>}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-3.5 text-gray-500 text-xs">
                  {total === 0 ? '未割当' : done === total ? '全試合終了' : '待機中'}
                </div>
              )}
              <div className="mt-2 flex gap-[3px] flex-wrap">
                {vCats.map(catId => (
                  <span
                    key={catId}
                    className="px-1.5 py-[1px] rounded-[3px] text-[9px] bg-white/[0.04] text-gray-400 border border-white/[0.06]"
                  >
                    {categories.find(c => c.id === catId)?.label}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ==========================================
// 観覧ページ
// ==========================================
function SpectatorPage() {
  const {
    allMatches,
    venueAssignments,
    categories,
    leagueGroups,
    catPhases,
    catAdvanceCounts,
    tournamentData,
    getActiveCats,
  } = useTournamentStore();

  const activeCats = getActiveCats();
  const [specCat, setSpecCat] = useState<string | null>(null);
  // コート選択（Aコート等を押すとそのコートの試合順・総当たり表が展開）
  const [specVenue, setSpecVenue] = useState<string | null>(null);
  // 注目選手（指定するとリーグ表・試合順で強調表示）
  const [highlightPlayerId, setHighlightPlayerId] = useState<string | null>(null);

  // カテゴリ/コートが切り替わったら注目選手をリセット
  useEffect(() => { setHighlightPlayerId(null); }, [specCat, specVenue]);

  return (
    <div>
      {/* ヘッダー */}
      <div className="bg-white/[0.03] border border-white/[0.07] rounded-[10px] p-3 mb-3 text-center">
        <div className="text-[13px] text-gray-400">保護者・観客用ビュー</div>
        <div className="text-[10px] text-gray-500">30秒ごとに自動更新（本番時）</div>
      </div>

      {/* 現在進行中の試合 / 次の試合 — コートカードをタップでそのコート詳細を展開 */}
      <div className="bg-white/[0.03] border border-white/[0.07] rounded-[10px] p-4 mb-3">
        <div className="text-sm font-bold text-white mb-3 flex items-center gap-2">
          <span>現在の試合</span>
          <span className="text-[10px] text-gray-500 font-normal">コートをタップで試合順を表示</span>
        </div>
        {(() => {
          const venueDisplays = VENUES.map(v => {
            const vCats = Object.entries(venueAssignments)
              .filter(([, vid]) => vid === v.id)
              .map(([c]) => c);
            const vM = allMatches.filter(m => vCats.includes(m.categoryId) && !m.isBye);
            const active = vM.find(m => m.status === 'active');
            const nextPending = !active ? vM
              .filter(m => m.status === 'pending' && m.playerA && m.playerB)
              .filter(m => !(catPhases[m.categoryId] === PHASE_TYPES.AWAITING_FINALS && isFinalMatch(m, tournamentData) && !m.venueId))
              .sort((a, b) => {
                if (a.isThirdPlace && !b.isThirdPlace) return -1;
                if (!a.isThirdPlace && b.isThirdPlace) return 1;
                return (a.round || 0) - (b.round || 0);
              })[0] : null;
            const display = active || nextPending;
            return { v, display, isActive: !!active, hasAnyMatch: vM.length > 0 };
          });

          const anyDisplay = venueDisplays.some(x => x.display);
          if (!anyDisplay && !venueDisplays.some(x => x.hasAnyMatch)) {
            return <div className="text-gray-500 text-center py-4">予定された試合はありません</div>;
          }
          return (
            <div className="grid grid-cols-2 gap-3">
              {venueDisplays.map(({ v, display, isActive, hasAnyMatch }) => {
                const isSelected = specVenue === v.id;
                return (
                  <div
                    key={v.id}
                    role="button"
                    tabIndex={hasAnyMatch ? 0 : -1}
                    aria-pressed={isSelected}
                    aria-disabled={!hasAnyMatch}
                    onClick={() => { if (hasAnyMatch) setSpecVenue(isSelected ? null : v.id); }}
                    onKeyDown={(e) => {
                      if (!hasAnyMatch) return;
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSpecVenue(isSelected ? null : v.id);
                      }
                    }}
                    className="p-2.5 rounded-lg transition-all"
                    style={{
                      background: isSelected ? `${v.color}20` : `${v.color}08`,
                      border: `${isSelected ? 2 : 1}px solid ${isSelected ? v.color : `${v.color}20`}`,
                      cursor: hasAnyMatch ? 'pointer' : 'not-allowed',
                      opacity: hasAnyMatch ? 1 : 0.5,
                    }}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-[10px] font-semibold flex items-center gap-1" style={{ color: v.color }}>
                        <span>{v.name}</span>
                        {display && (
                          <span className="text-gray-400 font-normal">
                            — {categories.find(c => c.id === display.categoryId)?.label}
                          </span>
                        )}
                      </div>
                      <div className="text-[9px] font-bold px-1.5 py-[1px] rounded" style={{
                        background: isActive ? `${v.color}30` : 'rgba(255,255,255,0.06)',
                        color: isActive ? v.color : '#9CA3AF',
                      }}>
                        {isActive ? '試合中' : display ? '次の試合' : hasAnyMatch ? '終了' : '未割当'}
                      </div>
                    </div>
                    {display ? (
                      <div className="text-center text-[13px] font-semibold">
                        <span style={{ color: RED }}><NameWithKana name={display.playerA?.name || ''} kana={display.playerA?.nameKana} size="sm" /></span>
                        <span className="mx-1.5 text-gray-500">VS</span>
                        <span style={{ color: WHITE_PLAYER }}><NameWithKana name={display.playerB?.name || ''} kana={display.playerB?.nameKana} size="sm" /></span>
                      </div>
                    ) : (
                      <div className="text-center text-[11px] text-gray-500 py-1">
                        {hasAnyMatch ? '全試合終了' : '試合なし'}
                      </div>
                    )}
                    {hasAnyMatch && (
                      <div className="text-[9px] text-center mt-1 font-semibold" style={{ color: isSelected ? v.color : '#6B7280' }}>
                        {isSelected ? '▲ 試合順を閉じる' : '▼ 試合順を表示'}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>

      {/* コート詳細（選択されたコートの試合順・総当たり表） */}
      {specVenue && (() => {
        const v = VENUES.find(x => x.id === specVenue);
        if (!v) return null;
        const vCats = Object.entries(venueAssignments)
          .filter(([, vid]) => vid === specVenue)
          .map(([c]) => c);
        const vAllMatches = allMatches.filter(m =>
          !m.isBye && (
            vCats.includes(m.categoryId) ||
            (m.venueId === specVenue && catPhases[m.categoryId] === PHASE_TYPES.AWAITING_FINALS && isFinalMatch(m, tournamentData))
          )
        );
        const completedVM = vAllMatches.filter(m => m.status === 'completed');
        const activeVM = vAllMatches.filter(m => m.status === 'active');
        const pendingVM = vAllMatches
          .filter(m => m.status === 'pending' && m.playerA && m.playerB)
          .filter(m => !(catPhases[m.categoryId] === PHASE_TYPES.AWAITING_FINALS && isFinalMatch(m, tournamentData) && !m.venueId))
          .sort((a, b) => {
            if (a.isThirdPlace && !b.isThirdPlace) return -1;
            if (!a.isThirdPlace && b.isThirdPlace) return 1;
            return (a.round || 0) - (b.round || 0);
          });
        const sortedVenueMatches = [...completedVM, ...activeVM, ...pendingVM];

        // コート内のリーグ戦カテゴリ（総当たり表用）
        const leagueCatsInVenue = Array.from(new Set(
          vAllMatches.filter(m => m.type === 'league').map(m => m.categoryId)
        ));
        // コート内の選手一覧（注目選手セレクタ用）
        const seenP = new Set<string>();
        const venuePlayers: { id: string; name: string; nameKana?: string; dojo?: string }[] = [];
        vAllMatches.forEach(m => {
          [m.playerA, m.playerB].forEach(p => {
            if (p && !seenP.has(p.id)) { seenP.add(p.id); venuePlayers.push(p); }
          });
        });

        return (
          <div
            className="rounded-[10px] p-4 mb-3"
            style={{ background: `${v.color}08`, border: `1px solid ${v.color}30` }}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-bold flex items-center gap-2" style={{ color: v.color }}>
                <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: v.color }} />
                {v.name}
                <span className="text-[10px] text-gray-400 font-normal">
                  （完了 {completedVM.length} / 進行中 {activeVM.length} / 待機 {pendingVM.length}）
                </span>
              </div>
              <button
                onClick={() => setSpecVenue(null)}
                className="px-2 py-[3px] rounded text-[10px] text-gray-400 cursor-pointer"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                閉じる
              </button>
            </div>

            {/* 担当カテゴリ一覧 */}
            {vCats.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-[4px]">
                {vCats.map(cid => {
                  const c = categories.find(cc => cc.id === cid);
                  return (
                    <span
                      key={cid}
                      className="px-2 py-[2px] rounded text-[10px] font-semibold"
                      style={{ background: 'rgba(255,255,255,0.04)', color: '#D1D5DB', border: '1px solid rgba(255,255,255,0.06)' }}
                    >
                      {c?.label}
                    </span>
                  );
                })}
              </div>
            )}

            {/* 注目選手セレクタ（コート内選手） */}
            {venuePlayers.length > 0 && (
              <div className="mb-3">
                <div className="text-[11px] font-bold text-gray-400 mb-1.5">
                  注目選手を選択（試合順・総当たり表で強調表示されます）
                </div>
                <div className="flex flex-wrap gap-[4px]">
                  {venuePlayers.map(p => {
                    const isHL = highlightPlayerId === p.id;
                    return (
                      <button
                        key={p.id}
                        onClick={() => setHighlightPlayerId(isHL ? null : p.id)}
                        className="px-2 py-[3px] rounded text-[10px] font-semibold cursor-pointer"
                        style={{
                          border: `1px solid ${isHL ? '#B91C1C' : 'rgba(255,255,255,0.08)'}`,
                          background: isHL ? 'rgba(185,28,28,0.15)' : 'rgba(255,255,255,0.03)',
                          color: isHL ? '#FCA5A5' : '#D1D5DB',
                        }}
                      >
                        {p.name}
                        {p.dojo && <span className="ml-1 text-[9px] text-gray-500">({p.dojo})</span>}
                      </button>
                    );
                  })}
                  {highlightPlayerId && (
                    <button
                      onClick={() => setHighlightPlayerId(null)}
                      className="px-2 py-[3px] rounded text-[10px] text-gray-400 cursor-pointer"
                      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
                    >
                      クリア
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* 総当たり表（リーグ戦カテゴリ毎） */}
            {leagueCatsInVenue.length > 0 && (
              <div className="mb-3">
                <div className="text-xs font-bold text-white mb-2">総当たり表</div>
                {leagueCatsInVenue.map(catId => {
                  const cat = categories.find(c => c.id === catId);
                  const preGroups = leagueGroups[catId] || [];
                  const preMatches = allMatches.filter(m =>
                    m.categoryId === catId && m.type === 'league' && m.phaseKey === PHASE_TYPES.LEAGUE
                  );
                  const lfGroup = leagueGroups[`${catId}_final`]?.[0];
                  const lfMatches = allMatches.filter(m =>
                    m.categoryId === catId && m.type === 'league' && m.phaseKey === PHASE_TYPES.LEAGUE_FINAL
                  );
                  return (
                    <div key={catId} className="mb-3">
                      <div className="text-[11px] font-semibold text-gray-300 mb-1">
                        {cat?.label}
                      </div>
                      {(preGroups as Player[][]).map((g, gi) => {
                        const gM = preMatches.filter(m => m.groupIndex === gi);
                        return (
                          <LeagueMatrix
                            key={gi}
                            group={g}
                            matches={gM}
                            title={`${String.fromCharCode(65 + gi)}グループ`}
                            highlightPlayerId={highlightPlayerId}
                          />
                        );
                      })}
                      {lfGroup && lfMatches.length > 0 && (
                        <LeagueMatrix
                          group={lfGroup as Player[]}
                          matches={lfMatches}
                          title="リーグ決勝"
                          highlightPlayerId={highlightPlayerId}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* 試合順（完了→進行中→待機の順） */}
            <div>
              <div className="text-xs font-bold text-white mb-2">
                試合順（全{sortedVenueMatches.length}試合）
              </div>
              {sortedVenueMatches.length === 0 ? (
                <div className="text-[11px] text-gray-500 text-center py-3">試合なし</div>
              ) : (
                <MatchScheduleList
                  matches={sortedVenueMatches}
                  categoriesLabel={(cid) => categories.find(c => c.id === cid)?.label || cid}
                  highlightPlayerId={highlightPlayerId}
                  tournamentData={tournamentData}
                />
              )}
            </div>
          </div>
        );
      })()}

      {/* カテゴリ選択 */}
      <div className="bg-white/[0.03] border border-white/[0.07] rounded-[10px] p-4 mb-3">
        <div className="text-sm font-bold text-white mb-3">カテゴリ選択</div>
        <div className="flex flex-wrap gap-[5px]">
          {activeCats.map(c => (
            <button
              key={c.id}
              onClick={() => setSpecCat(specCat === c.id ? null : c.id)}
              className="px-2.5 py-[5px] rounded-md text-[11px] font-semibold cursor-pointer"
              style={{
                border: `1px solid ${specCat === c.id ? '#B91C1C' : 'rgba(255,255,255,0.08)'}`,
                background: specCat === c.id ? 'rgba(185,28,28,0.12)' : 'rgba(255,255,255,0.03)',
                color: specCat === c.id ? '#FCA5A5' : '#D1D5DB',
              }}
            >
              {c.label}
              <span className="ml-1">
                <PhaseTag phase={c.phase} />
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* カテゴリ詳細 */}
      {specCat && (
        <div className="bg-white/[0.03] border border-white/[0.07] rounded-[10px] p-4 mb-3">
          <div className="text-sm font-bold text-white mb-3">
            {categories.find(c => c.id === specCat)?.label}
          </div>

          {/* 最終順位 */}
          {(() => {
            const tMatches = allMatches.filter(m => m.categoryId === specCat && m.type === 'tournament');
            const tRankings = getFinalRankings(tMatches);
            if (tRankings) return <FinalRankingsDisplay rankings={tRankings} />;
            const lfMatches = allMatches.filter(m => m.categoryId === specCat && m.type === 'league' && m.phaseKey === PHASE_TYPES.LEAGUE_FINAL);
            const lfPlayers = leagueGroups[`${specCat}_final`]?.[0];
            if (lfPlayers && lfMatches.length > 0) {
              const lfRankings = getLeagueFinalRankings(lfPlayers as Player[], lfMatches);
              if (lfRankings) return <FinalRankingsDisplay rankings={lfRankings} />;
            }
            return null;
          })()}

          {/* 注目選手セレクタ（リーグ戦・トーナメント試合の対戦相手も含めて全選手） */}
          {(() => {
            const catMatches = allMatches.filter(m => m.categoryId === specCat);
            const seen = new Set<string>();
            const players: { id: string; name: string; nameKana?: string; dojo?: string }[] = [];
            // 予選リーグに登録された選手
            const preG = leagueGroups[specCat] || [];
            (preG as Player[][]).forEach(g => g.forEach(p => {
              if (!seen.has(p.id)) { seen.add(p.id); players.push(p); }
            }));
            // 試合に登場する選手も追加（トーナメントのみ参加など）
            catMatches.forEach(m => {
              [m.playerA, m.playerB].forEach(p => {
                if (p && !seen.has(p.id)) { seen.add(p.id); players.push(p); }
              });
            });
            if (players.length === 0) return null;
            return (
              <div className="mb-3">
                <div className="text-[11px] font-bold text-gray-400 mb-1.5">
                  注目選手を選択（試合順・順位表で強調表示されます）
                </div>
                <div className="flex flex-wrap gap-[4px]">
                  {players.map(p => {
                    const isHL = highlightPlayerId === p.id;
                    return (
                      <button
                        key={p.id}
                        onClick={() => setHighlightPlayerId(isHL ? null : p.id)}
                        className="px-2 py-[3px] rounded text-[10px] font-semibold cursor-pointer"
                        style={{
                          border: `1px solid ${isHL ? '#B91C1C' : 'rgba(255,255,255,0.08)'}`,
                          background: isHL ? 'rgba(185,28,28,0.15)' : 'rgba(255,255,255,0.03)',
                          color: isHL ? '#FCA5A5' : '#D1D5DB',
                        }}
                      >
                        {p.name}
                        {p.dojo && <span className="ml-1 text-[9px] text-gray-500">({p.dojo})</span>}
                      </button>
                    );
                  })}
                  {highlightPlayerId && (
                    <button
                      onClick={() => setHighlightPlayerId(null)}
                      className="px-2 py-[3px] rounded text-[10px] text-gray-400 cursor-pointer"
                      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
                    >
                      クリア
                    </button>
                  )}
                </div>
              </div>
            );
          })()}

          {/* 予選リーグ結果（順位表 + 総当たり表） */}
          {(() => {
            const prelimMatches = allMatches.filter(m => m.categoryId === specCat && m.type === 'league' && m.phaseKey === PHASE_TYPES.LEAGUE);
            const groups = leagueGroups[specCat] || [];
            if (prelimMatches.length === 0 || groups.length === 0) return null;
            return (groups as Player[][]).map((group, gi) => {
              const gM = prelimMatches.filter(m => m.groupIndex === gi);
              const groupLabel = `${String.fromCharCode(65 + gi)}グループ 総当たり表`;
              return (
                <div key={gi} className="mb-3">
                  <StandingsTable standings={calcStandings(group, gM)} groupIdx={gi} advanceCount={catAdvanceCounts[specCat] || 1} />
                  <LeagueMatrix group={group} matches={gM} title={groupLabel} highlightPlayerId={highlightPlayerId} />
                </div>
              );
            });
          })()}

          {/* リーグ決勝の総当たり表 */}
          {(() => {
            const lfMatches = allMatches.filter(m => m.categoryId === specCat && m.type === 'league' && m.phaseKey === PHASE_TYPES.LEAGUE_FINAL);
            const lfPlayers = leagueGroups[`${specCat}_final`]?.[0];
            if (!lfPlayers || lfMatches.length === 0) return null;
            return (
              <LeagueMatrix
                group={lfPlayers as Player[]}
                matches={lfMatches}
                title="リーグ決勝 総当たり表"
                highlightPlayerId={highlightPlayerId}
              />
            );
          })()}

          {/* リーグ決勝順位表 */}
          {(() => {
            const lfMatches = allMatches.filter(m => m.categoryId === specCat && m.type === 'league' && m.phaseKey === PHASE_TYPES.LEAGUE_FINAL);
            const lfPlayers = leagueGroups[`${specCat}_final`]?.[0];
            if (!lfPlayers || lfMatches.length === 0) return null;
            const standings = calcStandings(lfPlayers as Player[], lfMatches);
            const medals = ['\u{1F947}', '\u{1F948}', '\u{1F949}'];
            const medalColorsArr = ['#FFD700', '#C0C0C0', '#CD7F32'];
            return (
              <div className="mb-2">
                <div className="text-xs font-bold mb-1.5" style={{ color: '#F472B6' }}>リーグ決勝</div>
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr>
                      <th className="p-2 text-left border-b border-white/10 text-gray-400 font-semibold text-[10px] w-[30px]">順位</th>
                      <th className="p-2 text-left border-b border-white/10 text-gray-400 font-semibold text-[10px]">選手名</th>
                      <th className="p-2 text-left border-b border-white/10 text-gray-400 font-semibold text-[10px]">所属</th>
                      <th className="p-2 text-center border-b border-white/10 text-gray-400 font-semibold text-[10px]">勝</th>
                      <th className="p-2 text-center border-b border-white/10 text-gray-400 font-semibold text-[10px]">敗</th>
                      <th className="p-2 text-center border-b border-white/10 text-gray-400 font-semibold text-[10px]">分</th>
                      <th className="p-2 text-center border-b border-white/10 text-gray-400 font-semibold text-[10px]">取本</th>
                      <th className="p-2 text-center border-b border-white/10 text-gray-400 font-semibold text-[10px]">失本</th>
                      <th className="p-2 text-center border-b border-white/10 text-gray-400 font-semibold text-[10px]">警告</th>
                      <th className="p-2 text-center border-b border-white/10 text-gray-400 font-semibold text-[10px]">勝点</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      let cr = 1;
                      return standings.map((s, i) => {
                        if (i > 0) {
                          const prev = standings[i - 1];
                          const same = s.points === prev.points && s.ipponFor === prev.ipponFor && s.ipponAgainst === prev.ipponAgainst && s.totalWarnings === prev.totalWarnings;
                          if (!same) cr = i + 1;
                        }
                        const mc = medalColorsArr[cr - 1];
                        return (
                          <tr key={s.id} style={{ background: cr <= 3 ? `${mc}08` : 'transparent' }}>
                            <td className="p-2 border-b border-white/[0.04] font-bold" style={{ color: mc || '#9CA3AF' }}>{cr <= 3 ? medals[cr - 1] : cr}</td>
                            <td className="p-2 border-b border-white/[0.04] font-bold text-white"><NameWithKana name={s.name} kana={s.nameKana} size="sm" /></td>
                            <td className="p-2 border-b border-white/[0.04] text-[11px] text-gray-300">{s.dojo}</td>
                            <td className="p-2 border-b border-white/[0.04] text-center text-green-500">{s.wins}</td>
                            <td className="p-2 border-b border-white/[0.04] text-center text-red-500">{s.losses}</td>
                            <td className="p-2 border-b border-white/[0.04] text-center text-gray-300">{s.draws}</td>
                            <td className="p-2 border-b border-white/[0.04] text-center text-blue-400">{s.ipponFor}</td>
                            <td className="p-2 border-b border-white/[0.04] text-center text-orange-400">{s.ipponAgainst}</td>
                            <td className="p-2 border-b border-white/[0.04] text-center text-yellow-500">{s.totalWarnings > 0 ? s.totalWarnings : '-'}</td>
                            <td className="p-2 border-b border-white/[0.04] text-center font-bold text-amber-500">{s.points}</td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>
            );
          })()}

          {/* トーナメント表 */}
          {tournamentData[specCat] && (
            <BracketView
              matches={allMatches.filter(m => m.categoryId === specCat && m.type === 'tournament')}
              totalRounds={tournamentData[specCat].totalRounds}
            />
          )}

          {/* 試合順リスト（カテゴリ内の全試合・予定順） */}
          {(() => {
            const catMatches = allMatches.filter(m => m.categoryId === specCat && !m.isBye);
            if (catMatches.length === 0) return null;
            // 表示順: リーグ→リーグ決勝→予選トーナメント→本戦トーナメント、
            //        同種別内では作成順（= 生成時の試合順）を維持
            const phaseOrder: Record<string, number> = {
              [PHASE_TYPES.LEAGUE]: 0,
              [PHASE_TYPES.LEAGUE_FINAL]: 1,
              [PHASE_TYPES.PRE_TOURNAMENT]: 2,
              [PHASE_TYPES.FINAL_TOURNAMENT]: 3,
            };
            const origIdx = new Map(allMatches.map((m, i) => [m.id, i]));
            const sorted = [...catMatches].sort((a, b) => {
              const pa = phaseOrder[a.phaseKey] ?? 99;
              const pb = phaseOrder[b.phaseKey] ?? 99;
              if (pa !== pb) return pa - pb;
              // リーグ戦はグループ順
              if (a.type === 'league' && b.type === 'league' && (a.groupIndex ?? 0) !== (b.groupIndex ?? 0)) {
                return (a.groupIndex ?? 0) - (b.groupIndex ?? 0);
              }
              // トーナメントは3位決定戦 > ラウンド順
              if (a.type === 'tournament' && b.type === 'tournament') {
                if (a.isThirdPlace !== b.isThirdPlace) return a.isThirdPlace ? -1 : 1;
                if ((a.round ?? 0) !== (b.round ?? 0)) return (a.round ?? 0) - (b.round ?? 0);
              }
              return (origIdx.get(a.id) ?? 0) - (origIdx.get(b.id) ?? 0);
            });
            return (
              <div className="mt-4">
                <div className="text-xs font-bold text-white mb-2">
                  試合順（全{sorted.length}試合）
                </div>
                <MatchScheduleList
                  matches={sorted}
                  highlightPlayerId={highlightPlayerId}
                  tournamentData={tournamentData}
                />
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

// ==========================================
// メインコンポーネント
// ==========================================
function TournamentApp({ role = 'admin', defaultCourt }: { role?: RoleType; defaultCourt?: string }) {
  const initialPage: PageType = role === 'viewer' ? 'spectator' : role === 'recorder' ? 'referee' : 'admin';
  const [page, setPage] = useState<PageType>(initialPage);
  const [hydrated, setHydrated] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'connecting' | 'connected' | 'offline'>('connecting');
  const isRemoteUpdate = useRef(false);

  // --- Supabase リアルタイム同期 ---
  useEffect(() => {
    let unsubscribe: (() => void) | null = null;

    const init = async () => {
      // 1. Supabaseから最新状態を読み込み
      try {
        const remoteState = await loadFromSupabase();
        if (remoteState && remoteState.initialized) {
          // リモートにデータがあればそちらを優先
          isRemoteUpdate.current = true;
          useTournamentStore.setState(remoteState);
          setTimeout(() => { isRemoteUpdate.current = false; }, 100);
        } else {
          // リモートが空ならローカル(localStorage)のデータをSupabaseに保存
          const localState = useTournamentStore.getState();
          if (localState.initialized) {
            saveToSupabase(localState as unknown as Record<string, unknown>);
          }
        }
        setSyncStatus('connected');
      } catch {
        setSyncStatus('offline');
      }

      // 2. Realtimeサブスクリプション（他端末からの変更を受信）
      unsubscribe = subscribeToChanges((newState) => {
        isRemoteUpdate.current = true;
        useTournamentStore.setState(newState);
        setTimeout(() => { isRemoteUpdate.current = false; }, 100);
      });
    };

    init();
    return () => { if (unsubscribe) unsubscribe(); };
  }, []);

  // 3. ローカルの変更をSupabaseに保存（リモート更新時はスキップ）
  useEffect(() => {
    const unsub = useTournamentStore.subscribe((state) => {
      if (!isRemoteUpdate.current) {
        saveToSupabase(state as unknown as Record<string, unknown>);
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    setHydrated(true);
  }, []);

  const allNavItems: { key: PageType; label: string }[] = [
    { key: 'admin', label: '管理' },
    { key: 'referee', label: '記録係' },
    { key: 'monitor', label: 'モニター' },
    { key: 'spectator', label: '観覧' },
  ];
  // ロールに応じて表示するタブを制限
  const navItems = role === 'viewer'
    ? allNavItems.filter(i => i.key === 'spectator')
    : role === 'recorder'
    ? allNavItems.filter(i => i.key === 'referee')
    : allNavItems;

  // Hydration待ち（localStorageからの復元完了まで）
  if (!hydrated) {
    return (
      <div className="min-h-screen bg-[#0B1120] flex items-center justify-center">
        <div className="text-center">
          <div className="text-2xl font-extrabold text-white mb-2">日本拳法 孝徳会</div>
          <div className="text-sm text-gray-400">大会運営システム読み込み中...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-app-bg text-[#D6DCE8]">
      {/* ヘッダー */}
      <header className="bg-header-bg border-b-2 border-red-700 px-5 py-2.5 flex items-center justify-between sticky top-0 z-[100]">
        <div>
          <div className="text-lg font-extrabold text-white tracking-wide">
            日本拳法 孝徳会 大会運営システム
          </div>
          <div className="text-[10px] text-gray-500 mt-0.5">
            {role === 'viewer' ? '観覧用ページ' : role === 'recorder' ? '記録係用ページ' : 'Tournament Management System'}
          </div>
          {/* 同期状態 */}
          <div className="flex items-center gap-1.5 mt-0.5">
            <span
              className="w-2 h-2 rounded-full"
              style={{
                background: syncStatus === 'connected' ? '#22C55E' : syncStatus === 'connecting' ? '#F59E0B' : '#EF4444',
                boxShadow: syncStatus === 'connected' ? '0 0 6px #22C55E' : 'none',
              }}
            />
            <span className="text-[10px] text-gray-400">
              {syncStatus === 'connected' ? 'リアルタイム同期中' : syncStatus === 'connecting' ? '接続中...' : 'オフライン'}
            </span>
          </div>
        </div>
        {navItems.length > 1 && (
          <nav className="flex gap-1 flex-wrap">
            {navItems.map(item => (
              <button
                key={item.key}
                onClick={() => setPage(item.key)}
                className={`px-3.5 py-[7px] border-none rounded-md text-xs cursor-pointer ${
                  page === item.key
                    ? 'bg-red-700 text-white font-bold'
                    : 'bg-white/[0.06] text-gray-400 font-medium'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>
        )}
      </header>

      {/* メインコンテンツ */}
      <main className="p-4 max-w-[1400px] mx-auto">
        {page === 'admin' && <AdminPage />}
        {page === 'referee' && <RefereePage />}
        {page === 'monitor' && <MonitorPage />}
        {page === 'spectator' && <SpectatorPage />}
      </main>
    </div>
  );
}

// デフォルトエクスポート — URLパスでロールを判定
export default function Home() {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '/';
  const role: RoleType = pathname.startsWith('/viewer') ? 'viewer' : pathname.startsWith('/recorder') ? 'recorder' : 'admin';
  return <TournamentApp role={role} />;
}

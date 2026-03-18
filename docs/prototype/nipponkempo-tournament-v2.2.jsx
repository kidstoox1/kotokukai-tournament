import { useState, useCallback, useMemo } from "react";

// ==========================================
// 日本拳法大会運営システム v2.1
// リーグ→リーグ / リーグ→トーナメント / 予選トーナメント→決勝トーナメント
// ==========================================

const CATEGORIES = [
  { id: "infant", label: "幼年の部", group: "幼年", gender: "mixed", menType: "なし", session: "am" },
  { id: "e1m", label: "小学1年 男子", group: "小学", gender: "male", menType: "なし", session: "am" },
  { id: "e2m", label: "小学2年 男子", group: "小学", gender: "male", menType: "なし", session: "am" },
  { id: "e3m", label: "小学3年 男子", group: "小学", gender: "male", menType: "なし", session: "am" },
  { id: "e12f", label: "小学1・2年 女子", group: "小学", gender: "female", menType: "なし", session: "am" },
  { id: "e3f", label: "小学3年 女子", group: "小学", gender: "female", menType: "なし", session: "am" },
  { id: "e4m", label: "小学4年 男子", group: "小学", gender: "male", menType: "少年面", session: "am" },
  { id: "e4f", label: "小学4年 女子", group: "小学", gender: "female", menType: "少年面", session: "am" },
  { id: "e5m", label: "小学5年 男子", group: "小学", gender: "male", menType: "少年面", session: "am" },
  { id: "e56f", label: "小学5・6年 女子", group: "小学", gender: "female", menType: "少年面", session: "am" },
  { id: "e6m", label: "小学6年 男子", group: "小学", gender: "male", menType: "少年面", session: "am" },
  { id: "m12m", label: "中学1・2年 男子", group: "中学", gender: "male", menType: "少年面", session: "am" },
  { id: "m12f", label: "中学1・2年 女子", group: "中学", gender: "female", menType: "少年面", session: "am" },
  { id: "m3", label: "中学3年", group: "中学", gender: "mixed", menType: "大人面", session: "am" },
  { id: "hsm", label: "高校生男子", group: "高校", gender: "male", menType: "大人面", session: "am" },
  { id: "wopen", label: "一般女子", group: "一般", gender: "female", menType: "大人面", session: "am" },
];

const VENUES = [
  { id: "A", name: "Aコート", color: "#E74C3C" },
  { id: "B", name: "Bコート", color: "#3498DB" },
  { id: "C", name: "Cコート", color: "#2ECC71" },
  { id: "D", name: "Dコート", color: "#F39C12" },
];

const DOJOS = ["孝徳会","大阪拳友会","神戸道場","京都拳法会","奈良道場","堺拳友会","姫路道場","和歌山拳法会","滋賀道場","尼崎拳友会","西宮道場","豊中拳法会","吹田道場","東大阪道場","枚方拳法会"];
const LN = ["田中","山田","佐藤","鈴木","高橋","渡辺","伊藤","中村","小林","加藤","吉田","山本","松本","井上","木村","林","斎藤","清水","山口","森","池田","橋本","阿部","石川","前田","藤田"];
const FM = ["太郎","翔太","健太","大輝","悠真","蓮","陽翔","湊","颯太","大和","樹","悠斗","拓海","陸","海翔","奏太"];
const FF = ["花子","さくら","陽菜","結衣","美咲","凛","心春","芽依","結菜","葵","莉子","美月","楓","彩花","真央","七海"];

const uid = () => Math.random().toString(36).substr(2, 9);
const pick = (a) => a[Math.floor(Math.random() * a.length)];

// Helper: build readable match label like "小学3年男子 Aグループ"
const matchLabel = (m) => {
  const catName = CATEGORIES.find(c => c.id === m.categoryId)?.label || "";
  if (m.type === "league") {
    return `${catName} ${String.fromCharCode(65 + (m.groupIndex || 0))}グループ`;
  }
  return `${catName} トーナメント`;
};

// Helper: match round/type label for display
const matchTypeLabel = (m, tournData) => {
  if (m.isThirdPlace) return "3位決定戦";
  if (m.type === "league" && m.phaseKey === PHASE_TYPES.LEAGUE_FINAL) return "リーグ決勝";
  if (m.type === "league") return `${String.fromCharCode(65 + (m.groupIndex || 0))}グループ`;
  const tr = tournData?.[m.categoryId]?.totalRounds;
  if (tr && m.round === tr) return "決勝";
  if (tr && m.round === tr - 1) return "準決勝";
  if (tr && m.round === tr - 2) return "準々決勝";
  return `${m.round || 1}回戦`;
};

// Helper: color for match type
const matchTypeColor = (m) => {
  if (m.isThirdPlace) return "#F59E0B";
  if (m.phaseKey === PHASE_TYPES.LEAGUE_FINAL) return "#F472B6";
  if (m.type === "league") return "#60A5FA";
  return "#FCA5A5";
};

// Helper: category groups summary like "12人 → 3グループ(4人)"
const groupSummary = (playerCount) => {
  if (playerCount === 0) return "0人";
  const groupSize = playerCount <= 6 ? 3 : 4;
  const numGroups = Math.ceil(playerCount / groupSize);
  return `${playerCount}人 → ${numGroups}グループ（各${groupSize}人）`;
};

const RESULT = { NORMAL: "normal", DRAW: "draw", DEFAULT_WIN: "default_win", DISQUALIFICATION: "disqualification" };

// Helper: compute final rankings from tournament matches
const getFinalRankings = (matches) => {
  if (!matches || matches.length === 0) return null;
  const normalMatches = matches.filter(m => !m.isThirdPlace && !m.isBye);
  const thirdPlaceMatch = matches.find(m => m.isThirdPlace);
  const allDone = normalMatches.every(m => m.status === "completed");
  const thirdDone = !thirdPlaceMatch || thirdPlaceMatch.status === "completed";
  if (!allDone) return null;

  const maxRound = Math.max(...normalMatches.map(m => m.round || 0));
  const finalMatch = normalMatches.find(m => m.round === maxRound);
  if (!finalMatch || !finalMatch.winnerId) return null;

  const rankings = [];
  const first = finalMatch.winnerId === finalMatch.playerA?.id ? finalMatch.playerA : finalMatch.playerB;
  rankings.push({ rank: 1, medal: "🥇", name: first?.name, dojo: first?.dojo, id: first?.id });
  const second = finalMatch.winnerId === finalMatch.playerA?.id ? finalMatch.playerB : finalMatch.playerA;
  rankings.push({ rank: 2, medal: "🥈", name: second?.name, dojo: second?.dojo, id: second?.id });

  if (thirdPlaceMatch && thirdDone && thirdPlaceMatch.winnerId) {
    const third = thirdPlaceMatch.winnerId === thirdPlaceMatch.playerA?.id ? thirdPlaceMatch.playerA : thirdPlaceMatch.playerB;
    rankings.push({ rank: 3, medal: "🥉", name: third?.name, dojo: third?.dojo, id: third?.id });
  }
  return rankings;
};

// Helper: compute final rankings from league final standings
const getLeagueFinalRankings = (players, matches) => {
  if (!players || players.length === 0 || !matches || matches.length === 0) return null;
  const allDone = matches.every(m => m.status === "completed");
  if (!allDone) return null;

  const standings = calcStandings(players, matches);
  const medals = ["🥇", "🥈", "🥉"];

  // Assign ranks with ties: same points + same ippon diff = same rank
  const rankings = [];
  let currentRank = 1;
  standings.forEach((s, i) => {
    if (i > 0) {
      const prev = standings[i - 1];
      const samePoints = s.points === prev.points;
      const sameIpponDiff = (s.ipponFor - s.ipponAgainst) === (prev.ipponFor - prev.ipponAgainst);
      if (!(samePoints && sameIpponDiff)) {
        currentRank = i + 1;
      }
    }
    if (currentRank <= 3) {
      rankings.push({
        rank: currentRank,
        medal: medals[currentRank - 1] || "🥉",
        name: s.name, dojo: s.dojo, id: s.id,
        points: s.points, ipponDiff: s.ipponFor - s.ipponAgainst,
      });
    }
  });
  return rankings;
};

// Phase types for flexible progression
const PHASE_TYPES = {
  SETUP: "setup",
  LEAGUE: "league",
  LEAGUE_FINAL: "league_final", // リーグ決勝（上位者で総当たり→順位確定）
  PRE_TOURNAMENT: "pre_tournament",
  FINAL_TOURNAMENT: "final_tournament",
  DONE: "done",
};

// Start format options (selectable per category before starting)
const START_FORMATS = [
  { value: PHASE_TYPES.LEAGUE, label: "リーグ戦", desc: "総当たり → 上位が次ステージへ", color: "#60A5FA" },
  { value: PHASE_TYPES.FINAL_TOURNAMENT, label: "トーナメント", desc: "最初からトーナメント（人数が多い場合）", color: "#FCA5A5" },
  { value: PHASE_TYPES.PRE_TOURNAMENT, label: "予選トーナメント", desc: "予選トーナメント → 決勝トーナメント", color: "#FBBF24" },
];

// Possible next phase options
const NEXT_PHASE_OPTIONS = {
  [PHASE_TYPES.LEAGUE]: [
    { value: PHASE_TYPES.LEAGUE_FINAL, label: "リーグ決勝に進む（総当たりで順位確定）" },
    { value: PHASE_TYPES.FINAL_TOURNAMENT, label: "決勝トーナメントに進む" },
  ],
  [PHASE_TYPES.PRE_TOURNAMENT]: [
    { value: PHASE_TYPES.FINAL_TOURNAMENT, label: "決勝トーナメントに進む" },
  ],
};

const PHASE_LABELS = {
  [PHASE_TYPES.SETUP]: "準備中",
  [PHASE_TYPES.LEAGUE]: "リーグ戦",
  [PHASE_TYPES.LEAGUE_FINAL]: "リーグ決勝",
  [PHASE_TYPES.PRE_TOURNAMENT]: "予選トーナメント",
  [PHASE_TYPES.FINAL_TOURNAMENT]: "決勝トーナメント",
  [PHASE_TYPES.DONE]: "完了",
};

const PHASE_COLORS = {
  [PHASE_TYPES.SETUP]: { bg: "#1C2B1C", text: "#86EFAC", border: "#22C55E40" },
  [PHASE_TYPES.LEAGUE]: { bg: "#1E3A5F", text: "#60A5FA", border: "#3B82F640" },
  [PHASE_TYPES.LEAGUE_FINAL]: { bg: "#3B1C3B", text: "#F472B6", border: "#EC489940" },
  [PHASE_TYPES.PRE_TOURNAMENT]: { bg: "#3B2A1C", text: "#FBBF24", border: "#F59E0B40" },
  [PHASE_TYPES.FINAL_TOURNAMENT]: { bg: "#3B1C1C", text: "#FCA5A5", border: "#EF444440" },
  [PHASE_TYPES.DONE]: { bg: "#1C2B1C", text: "#86EFAC", border: "#22C55E40" },
};

// --- Colors ---
const RED = "#EF4444";
const WHITE_PLAYER = "#FFFFFF";
const WHITE_BG = "rgba(255,255,255,0.12)";
const WHITE_BORDER = "rgba(255,255,255,0.35)";

// Generate sample players
const generatePlayers = () => {
  const players = [];
  const cc = { infant:6, e1m:8, e2m:10, e3m:12, e12f:7, e3f:6, e4m:14, e4f:8, e5m:16, e56f:10, e6m:14, m12m:12, m12f:8, m3:6, hsm:8, wopen:5 };
  Object.entries(cc).forEach(([catId, count]) => {
    const cat = CATEGORIES.find(c => c.id === catId);
    for (let i = 0; i < count; i++) {
      const isFemale = cat.gender === "female" || (cat.gender === "mixed" && Math.random() > 0.5);
      players.push({ id: uid(), name: `${pick(LN)} ${isFemale ? pick(FF) : pick(FM)}`, categoryId: catId, dojo: pick(DOJOS) });
    }
  });
  return players;
};

// League logic
const createLeagueGroups = (players, groupSize = 4) => {
  const shuffled = [...players].sort(() => Math.random() - 0.5);
  const numGroups = Math.ceil(shuffled.length / groupSize);
  const groups = Array.from({ length: numGroups }, () => []);
  shuffled.forEach((p, i) => groups[i % numGroups].push(p));
  return groups;
};

const createLeagueMatches = (group, groupIndex, categoryId, phaseKey) => {
  const matches = [];
  for (let i = 0; i < group.length; i++) {
    for (let j = i + 1; j < group.length; j++) {
      matches.push({
        id: uid(), categoryId, groupIndex, type: "league", phaseKey,
        playerA: { id: group[i].id, name: group[i].name, dojo: group[i].dojo },
        playerB: { id: group[j].id, name: group[j].name, dojo: group[j].dojo },
        scoreA: 0, scoreB: 0, warningsA: 0, warningsB: 0,
        resultType: null, winnerId: null, status: "pending", venueId: null,
      });
    }
  }
  return matches;
};

const calcStandings = (group, matches) => {
  const st = {};
  group.forEach(p => { st[p.id] = { ...p, wins: 0, losses: 0, draws: 0, points: 0, ipponFor: 0, ipponAgainst: 0 }; });
  matches.filter(m => m.status === "completed").forEach(m => {
    const a = st[m.playerA.id]; const b = st[m.playerB.id];
    if (!a || !b) return;
    a.ipponFor += m.scoreA; a.ipponAgainst += m.scoreB;
    b.ipponFor += m.scoreB; b.ipponAgainst += m.scoreA;
    if (m.resultType === RESULT.DRAW) { a.draws++; b.draws++; a.points += 1; b.points += 1; }
    else if (m.winnerId === m.playerA.id) { a.wins++; b.losses++; a.points += 3; }
    else if (m.winnerId === m.playerB.id) { b.wins++; a.losses++; b.points += 3; }
  });
  return Object.values(st).sort((a, b) => (b.points !== a.points) ? b.points - a.points : (b.ipponFor - b.ipponAgainst) - (a.ipponFor - a.ipponAgainst));
};

// Tournament logic
const generateBracket = (advPlayers, categoryId, phaseKey, hasThirdPlace = false) => {
  const n = advPlayers.length;
  if (n < 2) return { matches: [], totalRounds: 0 };
  let size = 1;
  while (size < n) size *= 2;
  const totalRounds = Math.log2(size);
  const slots = new Array(size).fill(null);
  for (let i = 0; i < n; i++) slots[i] = advPlayers[i];
  const matches = [];
  let num = 1;
  for (let i = 0; i < size; i += 2) {
    const pA = slots[i]; const pB = slots[i + 1]; const isBye = !pA || !pB;
    matches.push({
      id: uid(), categoryId, round: 1, matchNumber: num++, position: i / 2, type: "tournament", phaseKey,
      playerA: pA ? { id: pA.id, name: pA.name, dojo: pA.dojo } : null,
      playerB: pB ? { id: pB.id, name: pB.name, dojo: pB.dojo } : null,
      scoreA: 0, scoreB: 0, warningsA: 0, warningsB: 0,
      winnerId: isBye ? (pA?.id || pB?.id) : null, winnerName: isBye ? (pA?.name || pB?.name) : null,
      resultType: isBye ? RESULT.DEFAULT_WIN : null, isBye, status: isBye ? "completed" : "pending",
      venueId: null, sourceMatchA: null, sourceMatchB: null, isThirdPlace: false,
    });
  }
  for (let round = 2; round <= totalRounds; round++) {
    const prev = matches.filter(m => m.round === round - 1 && !m.isThirdPlace);
    for (let i = 0; i < prev.length; i += 2) {
      const m1 = prev[i]; const m2 = prev[i + 1];
      matches.push({
        id: uid(), categoryId, round, matchNumber: num++, position: i / 2, type: "tournament", phaseKey,
        playerA: m1?.isBye ? { id: m1.winnerId, name: m1.winnerName, dojo: m1.playerA?.dojo || m1.playerB?.dojo } : null,
        playerB: m2?.isBye ? { id: m2.winnerId, name: m2.winnerName, dojo: m2.playerA?.dojo || m2.playerB?.dojo } : null,
        scoreA: 0, scoreB: 0, warningsA: 0, warningsB: 0,
        winnerId: null, winnerName: null, resultType: null, isBye: false, status: "pending",
        venueId: null, sourceMatchA: m1?.id, sourceMatchB: m2?.id, isThirdPlace: false,
      });
    }
  }
  // 3rd place match: losers of semi-finals (round = totalRounds - 1)
  if (hasThirdPlace && totalRounds >= 2) {
    const semiFinals = matches.filter(m => m.round === totalRounds - 1 && !m.isThirdPlace);
    if (semiFinals.length === 2) {
      matches.push({
        id: uid(), categoryId, round: totalRounds, matchNumber: num++, position: 99, type: "tournament", phaseKey,
        playerA: null, playerB: null,
        scoreA: 0, scoreB: 0, warningsA: 0, warningsB: 0,
        winnerId: null, winnerName: null, resultType: null, isBye: false, status: "pending",
        venueId: null,
        sourceMatchA: semiFinals[0].id, sourceMatchB: semiFinals[1].id,
        isThirdPlace: true, // loser from each semi goes here
      });
    }
  }
  return { matches, totalRounds, bracketSize: size, hasThirdPlace };
};

// ==========================================
// STYLES
// ==========================================
const S = {
  app: { fontFamily: "'Noto Sans JP', sans-serif", background: "#0B0F19", color: "#D6DCE8", minHeight: "100vh" },
  header: { background: "#111827", borderBottom: "2px solid #B91C1C", padding: "10px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 100 },
  title: { fontSize: "18px", fontWeight: 800, color: "#fff", letterSpacing: "1px" },
  sub: { fontSize: "10px", color: "#6B7280", marginTop: "2px" },
  nav: { display: "flex", gap: "4px", flexWrap: "wrap" },
  navBtn: (a) => ({ padding: "7px 14px", border: "none", borderRadius: "6px", background: a ? "#B91C1C" : "rgba(255,255,255,0.06)", color: a ? "#fff" : "#9CA3AF", fontSize: "12px", fontWeight: a ? 700 : 500, cursor: "pointer" }),
  main: { padding: "16px", maxWidth: "1400px", margin: "0 auto" },
  card: { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "10px", padding: "16px", marginBottom: "12px" },
  cardTitle: { fontSize: "14px", fontWeight: 700, color: "#fff", marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px" },
  badge: (c) => ({ display: "inline-block", padding: "2px 8px", borderRadius: "10px", fontSize: "10px", fontWeight: 600, background: `${c}20`, color: c, border: `1px solid ${c}40` }),
  btn: (c = "#B91C1C", sz = "md") => ({ padding: sz === "sm" ? "5px 10px" : sz === "lg" ? "10px 24px" : "7px 14px", border: "none", borderRadius: "6px", background: c, color: "#fff", fontSize: sz === "sm" ? "11px" : "12px", fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "5px" }),
  table: { width: "100%", borderCollapse: "collapse", fontSize: "12px" },
  th: { padding: "8px 10px", textAlign: "left", borderBottom: "1px solid rgba(255,255,255,0.1)", color: "#9CA3AF", fontWeight: 600, fontSize: "10px", textTransform: "uppercase" },
  td: { padding: "8px 10px", borderBottom: "1px solid rgba(255,255,255,0.04)", color: "#D1D5DB" },
  venueTag: (c) => ({ display: "inline-flex", alignItems: "center", gap: "4px", padding: "2px 8px", borderRadius: "6px", fontSize: "10px", fontWeight: 600, background: `${c}18`, color: c, border: `1px solid ${c}35` }),
  grid2: { display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "12px" },
  grid4: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px" },
  select: { padding: "6px 10px", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "6px", background: "rgba(255,255,255,0.06)", color: "#D6DCE8", fontSize: "12px", outline: "none" },
  phaseTag: (phase) => {
    const pc = PHASE_COLORS[phase] || PHASE_COLORS[PHASE_TYPES.SETUP];
    return { display: "inline-block", padding: "3px 10px", borderRadius: "12px", fontSize: "10px", fontWeight: 700, background: pc.bg, color: pc.text, border: `1px solid ${pc.border}` };
  },
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 },
  modal: { background: "#1F2937", borderRadius: "14px", padding: "24px", maxWidth: "650px", width: "95%", border: "1px solid rgba(255,255,255,0.1)", maxHeight: "90vh", overflow: "auto" },
  statNum: { fontSize: "28px", fontWeight: 800, color: "#fff", lineHeight: 1 },
  statLabel: { fontSize: "10px", color: "#9CA3AF", marginTop: "4px" },
  scoreBtn: (c, active) => ({
    width: "44px", height: "44px", borderRadius: "10px",
    border: active ? `2px solid ${c}` : "1px solid rgba(255,255,255,0.12)",
    background: active ? `${c}25` : "rgba(255,255,255,0.03)",
    color: active ? c : "#9CA3AF", fontSize: "18px", fontWeight: 800, cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center",
  }),
};

// --- Stat & Progress ---
const Stat = ({ value, label, color = "#B91C1C" }) => (
  <div style={{ ...S.card, textAlign: "center", padding: "12px" }}>
    <div style={{ ...S.statNum, color }}>{value}</div>
    <div style={S.statLabel}>{label}</div>
  </div>
);
const Progress = ({ pct, color = "#B91C1C" }) => (
  <div style={{ height: "5px", borderRadius: "3px", background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
    <div style={{ height: "100%", width: `${pct}%`, borderRadius: "3px", background: color, transition: "width 0.5s" }} />
  </div>
);

// --- Standings Table ---
const StandingsTable = ({ standings, groupIdx, advanceCount = 2 }) => (
  <div style={{ marginBottom: "12px" }}>
    <div style={{ fontSize: "11px", fontWeight: 700, color: "#9CA3AF", marginBottom: "6px" }}>
      グループ {String.fromCharCode(65 + groupIdx)}
    </div>
    <table style={S.table}>
      <thead><tr>
        <th style={{ ...S.th, width: "30px" }}>順位</th><th style={S.th}>選手名</th><th style={S.th}>所属</th>
        <th style={{ ...S.th, textAlign: "center" }}>勝</th><th style={{ ...S.th, textAlign: "center" }}>敗</th>
        <th style={{ ...S.th, textAlign: "center" }}>分</th><th style={{ ...S.th, textAlign: "center" }}>本数</th>
        <th style={{ ...S.th, textAlign: "center" }}>勝点</th>
      </tr></thead>
      <tbody>
        {standings.map((s, i) => (
          <tr key={s.id} style={{ background: i < advanceCount ? "rgba(34,197,94,0.06)" : "transparent" }}>
            <td style={{ ...S.td, fontWeight: 700, color: i < advanceCount ? "#22C55E" : "#9CA3AF" }}>{i + 1}</td>
            <td style={{ ...S.td, fontWeight: 600, color: "#fff" }}>{s.name}</td>
            <td style={{ ...S.td, fontSize: "11px" }}>{s.dojo}</td>
            <td style={{ ...S.td, textAlign: "center", color: "#22C55E" }}>{s.wins}</td>
            <td style={{ ...S.td, textAlign: "center", color: "#EF4444" }}>{s.losses}</td>
            <td style={{ ...S.td, textAlign: "center" }}>{s.draws}</td>
            <td style={{ ...S.td, textAlign: "center" }}>{s.ipponFor}-{s.ipponAgainst}</td>
            <td style={{ ...S.td, textAlign: "center", fontWeight: 700, color: "#F59E0B" }}>{s.points}</td>
          </tr>
        ))}
      </tbody>
    </table>
    <div style={{ fontSize: "9px", color: "#6B7280", marginTop: "4px" }}>
      ※ 上位{advanceCount}名（緑表示）が次ステージ進出
    </div>
  </div>
);

// --- Final Rankings Display ---
const FinalRankings = ({ rankings }) => {
  if (!rankings || rankings.length === 0) return null;
  const medalColors = { 1: "#FFD700", 2: "#C0C0C0", 3: "#CD7F32" };
  const medalBg = { 1: "rgba(255,215,0,0.08)", 2: "rgba(192,192,192,0.06)", 3: "rgba(205,127,50,0.06)" };
  const medalBorder = { 1: "rgba(255,215,0,0.25)", 2: "rgba(192,192,192,0.2)", 3: "rgba(205,127,50,0.2)" };
  const rankLabel = (rank) => rank === 1 ? "優勝" : rank === 2 ? "準優勝" : "第3位";

  // Check if all same rank (all tied)
  const allSameRank = rankings.every(r => r.rank === rankings[0].rank);

  return (
    <div style={{ marginBottom: "14px", padding: "14px", borderRadius: "10px", background: "rgba(255,215,0,0.04)", border: "1px solid rgba(255,215,0,0.12)" }}>
      <div style={{ fontSize: "14px", fontWeight: 800, color: "#FFD700", marginBottom: "4px", textAlign: "center" }}>
        🏆 最終結果
      </div>
      {allSameRank && rankings.length > 1 && (
        <div style={{ fontSize: "10px", color: "#F59E0B", textAlign: "center", marginBottom: "8px" }}>
          ※ 同率のため全員同順位
        </div>
      )}
      <div style={{ display: "flex", gap: "8px", justifyContent: "center", flexWrap: "wrap" }}>
        {rankings.map((r, idx) => (
          <div key={r.id || idx} style={{
            flex: "1 1 120px", maxWidth: "180px", padding: "12px 10px", borderRadius: "10px", textAlign: "center",
            background: medalBg[r.rank], border: `1.5px solid ${medalBorder[r.rank]}`,
          }}>
            <div style={{ fontSize: "28px", lineHeight: 1 }}>{r.medal}</div>
            <div style={{ fontSize: "10px", color: medalColors[r.rank], fontWeight: 700, marginTop: "4px" }}>
              {rankLabel(r.rank)}
            </div>
            <div style={{ fontSize: "15px", fontWeight: 800, color: "#fff", marginTop: "4px" }}>{r.name}</div>
            <div style={{ fontSize: "10px", color: "#9CA3AF", marginTop: "2px" }}>{r.dojo}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

// --- Match Record Modal (with edit support) ---
const MatchRecordModal = ({ match, onClose, onSubmit }) => {
  // Pre-fill from existing match data for editing
  const isEdit = match.status === "completed";
  const [scoreA, setScoreA] = useState(match.scoreA || 0);
  const [scoreB, setScoreB] = useState(match.scoreB || 0);
  const [warningsA, setWarningsA] = useState(match.warningsA || 0);
  const [warningsB, setWarningsB] = useState(match.warningsB || 0);
  const [resultType, setResultType] = useState(match.resultType || RESULT.NORMAL);
  const [defaultWinSide, setDefaultWinSide] = useState(
    match.resultType === RESULT.DEFAULT_WIN ? (match.winnerId === match.playerA?.id ? "A" : "B") : "A"
  );
  const [disqSide, setDisqSide] = useState(
    match.resultType === RESULT.DISQUALIFICATION ? (match.winnerId === match.playerB?.id ? "A" : "B") : "A"
  );

  const isLeague = match.type === "league";

  // Calculate final scores with warnings
  const bonusA = Math.floor(warningsB / 2);
  const bonusB = Math.floor(warningsA / 2);
  const finalScoreA = resultType === RESULT.NORMAL ? scoreA + bonusA : resultType === RESULT.DEFAULT_WIN ? (defaultWinSide === "A" ? 2 : 0) : resultType === RESULT.DISQUALIFICATION ? (disqSide === "A" ? 0 : 2) : 0;
  const finalScoreB = resultType === RESULT.NORMAL ? scoreB + bonusB : resultType === RESULT.DEFAULT_WIN ? (defaultWinSide === "B" ? 2 : 0) : resultType === RESULT.DISQUALIFICATION ? (disqSide === "B" ? 0 : 2) : 0;

  const handleSubmit = () => {
    let winnerId = null, winnerName = null;
    if (resultType === RESULT.DRAW) {
      // no winner
    } else if (resultType === RESULT.DEFAULT_WIN) {
      winnerId = defaultWinSide === "A" ? match.playerA.id : match.playerB.id;
      winnerName = defaultWinSide === "A" ? match.playerA.name : match.playerB.name;
    } else if (resultType === RESULT.DISQUALIFICATION) {
      winnerId = disqSide === "A" ? match.playerB.id : match.playerA.id;
      winnerName = disqSide === "A" ? match.playerB.name : match.playerA.name;
    } else {
      if (finalScoreA > finalScoreB) { winnerId = match.playerA.id; winnerName = match.playerA.name; }
      else if (finalScoreB > finalScoreA) { winnerId = match.playerB.id; winnerName = match.playerB.name; }
      // else draw in league, no winner in tournament shouldn't happen
    }
    onSubmit({ ...match, scoreA: finalScoreA, scoreB: finalScoreB, warningsA, warningsB, resultType, winnerId, winnerName, status: "completed" });
  };

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "16px" }}>
          <div>
            <h3 style={{ margin: 0, color: "#fff", fontSize: "16px" }}>
              {isEdit ? "試合結果の修正" : "試合結果入力"}
            </h3>
            <div style={{ fontSize: "13px", fontWeight: 700, marginTop: "4px",
              color: matchTypeColor(match) }}>
              {CATEGORIES.find(c => c.id === match.categoryId)?.label}
              {match.isThirdPlace
                ? " — 🥉 3位決定戦"
                : match.type === "league"
                ? ` — ${String.fromCharCode(65 + (match.groupIndex || 0))}グループ`
                : " — 🏆 トーナメント"}
            </div>
          </div>
          <button style={{ background: "none", border: "none", color: "#9CA3AF", fontSize: "18px", cursor: "pointer" }} onClick={onClose}>✕</button>
        </div>

        {/* Result Type */}
        <div style={{ display: "flex", gap: "6px", marginBottom: "16px", flexWrap: "wrap" }}>
          {[
            { type: RESULT.NORMAL, label: "通常（本数勝負）" },
            ...(isLeague ? [{ type: RESULT.DRAW, label: "引き分け" }] : []),
            { type: RESULT.DEFAULT_WIN, label: "不戦勝" },
            { type: RESULT.DISQUALIFICATION, label: "失格" },
          ].map(r => (
            <button key={r.type} onClick={() => setResultType(r.type)} style={{
              padding: "6px 12px", borderRadius: "6px", fontSize: "11px", fontWeight: 600, cursor: "pointer",
              border: resultType === r.type ? "1px solid #60A5FA" : "1px solid rgba(255,255,255,0.1)",
              background: resultType === r.type ? "rgba(96,165,250,0.15)" : "rgba(255,255,255,0.03)",
              color: resultType === r.type ? "#60A5FA" : "#9CA3AF",
            }}>{r.label}</button>
          ))}
        </div>

        {/* Default win / Disqualification side selector */}
        {resultType === RESULT.DEFAULT_WIN && (
          <div style={{ marginBottom: "16px", padding: "10px", borderRadius: "8px", background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.15)" }}>
            <div style={{ fontSize: "11px", color: "#22C55E", fontWeight: 600, marginBottom: "8px" }}>不戦勝の選手を選択</div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={() => setDefaultWinSide("A")} style={{
                flex: 1, padding: "10px", borderRadius: "8px", cursor: "pointer", textAlign: "center",
                border: defaultWinSide === "A" ? `2px solid ${RED}` : "1px solid rgba(255,255,255,0.1)",
                background: defaultWinSide === "A" ? "rgba(239,68,68,0.12)" : "rgba(255,255,255,0.03)",
                color: "#fff", fontWeight: 600, fontSize: "13px",
              }}>
                <span style={{ fontSize: "10px", color: RED, display: "block", marginBottom: "2px" }}>赤</span>
                {match.playerA?.name}
              </button>
              <button onClick={() => setDefaultWinSide("B")} style={{
                flex: 1, padding: "10px", borderRadius: "8px", cursor: "pointer", textAlign: "center",
                border: defaultWinSide === "B" ? `2px solid ${WHITE_PLAYER}` : "1px solid rgba(255,255,255,0.1)",
                background: defaultWinSide === "B" ? WHITE_BG : "rgba(255,255,255,0.03)",
                color: "#fff", fontWeight: 600, fontSize: "13px",
              }}>
                <span style={{ fontSize: "10px", color: WHITE_PLAYER, display: "block", marginBottom: "2px" }}>白</span>
                {match.playerB?.name}
              </button>
            </div>
          </div>
        )}
        {resultType === RESULT.DISQUALIFICATION && (
          <div style={{ marginBottom: "16px", padding: "10px", borderRadius: "8px", background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)" }}>
            <div style={{ fontSize: "11px", color: "#EF4444", fontWeight: 600, marginBottom: "8px" }}>失格となる選手を選択</div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={() => setDisqSide("A")} style={{
                flex: 1, padding: "10px", borderRadius: "8px", cursor: "pointer", textAlign: "center",
                border: disqSide === "A" ? "2px solid #EF4444" : "1px solid rgba(255,255,255,0.1)",
                background: disqSide === "A" ? "rgba(239,68,68,0.12)" : "rgba(255,255,255,0.03)",
                color: "#fff", fontWeight: 600, fontSize: "13px",
              }}>
                <span style={{ fontSize: "10px", color: RED, display: "block", marginBottom: "2px" }}>赤</span>
                {match.playerA?.name}
              </button>
              <button onClick={() => setDisqSide("B")} style={{
                flex: 1, padding: "10px", borderRadius: "8px", cursor: "pointer", textAlign: "center",
                border: disqSide === "B" ? `2px solid ${WHITE_PLAYER}` : "1px solid rgba(255,255,255,0.1)",
                background: disqSide === "B" ? WHITE_BG : "rgba(255,255,255,0.03)",
                color: "#fff", fontWeight: 600, fontSize: "13px",
              }}>
                <span style={{ fontSize: "10px", color: WHITE_PLAYER, display: "block", marginBottom: "2px" }}>白</span>
                {match.playerB?.name}
              </button>
            </div>
          </div>
        )}

        {/* Normal score entry */}
        {resultType === RESULT.NORMAL && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: "12px", alignItems: "start" }}>
            {/* Red */}
            <div style={{ padding: "14px", borderRadius: "10px", border: `1px solid ${RED}40`, background: `${RED}08`, textAlign: "center" }}>
              <div style={{ fontSize: "10px", color: RED, fontWeight: 700, marginBottom: "4px" }}>赤</div>
              <div style={{ fontSize: "15px", fontWeight: 700, color: "#fff" }}>{match.playerA?.name}</div>
              <div style={{ fontSize: "10px", color: "#9CA3AF" }}>{match.playerA?.dojo}</div>
              <div style={{ margin: "10px 0 4px", fontSize: "10px", color: "#9CA3AF" }}>取った本数</div>
              <div style={{ display: "flex", justifyContent: "center", gap: "6px" }}>
                {[0, 1, 2].map(n => (
                  <button key={n} style={S.scoreBtn(RED, scoreA === n)} onClick={() => setScoreA(n)}>{n}</button>
                ))}
              </div>
              <div style={{ margin: "8px 0 4px", fontSize: "10px", color: "#F59E0B" }}>赤への警告</div>
              <div style={{ display: "flex", justifyContent: "center", gap: "6px" }}>
                {[0, 1, 2, 3].map(n => (
                  <button key={n} style={{ ...S.scoreBtn("#F59E0B", warningsA === n), width: "36px", height: "36px", fontSize: "14px" }} onClick={() => setWarningsA(n)}>{n}</button>
                ))}
              </div>
            </div>

            <div style={{ fontSize: "20px", fontWeight: 800, color: "#4B5563", paddingTop: "40px" }}>VS</div>

            {/* White */}
            <div style={{ padding: "14px", borderRadius: "10px", border: `1px solid ${WHITE_BORDER}`, background: WHITE_BG, textAlign: "center" }}>
              <div style={{ fontSize: "10px", color: WHITE_PLAYER, fontWeight: 700, marginBottom: "4px" }}>白</div>
              <div style={{ fontSize: "15px", fontWeight: 700, color: "#fff" }}>{match.playerB?.name}</div>
              <div style={{ fontSize: "10px", color: "#9CA3AF" }}>{match.playerB?.dojo}</div>
              <div style={{ margin: "10px 0 4px", fontSize: "10px", color: "#9CA3AF" }}>取った本数</div>
              <div style={{ display: "flex", justifyContent: "center", gap: "6px" }}>
                {[0, 1, 2].map(n => (
                  <button key={n} style={S.scoreBtn(WHITE_PLAYER, scoreB === n)} onClick={() => setScoreB(n)}>{n}</button>
                ))}
              </div>
              <div style={{ margin: "8px 0 4px", fontSize: "10px", color: "#F59E0B" }}>白への警告</div>
              <div style={{ display: "flex", justifyContent: "center", gap: "6px" }}>
                {[0, 1, 2, 3].map(n => (
                  <button key={n} style={{ ...S.scoreBtn("#F59E0B", warningsB === n), width: "36px", height: "36px", fontSize: "14px" }} onClick={() => setWarningsB(n)}>{n}</button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Final Score Preview - always visible */}
        <div style={{
          margin: "16px 0 0", padding: "12px 16px", borderRadius: "10px",
          background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
        }}>
          <div style={{ fontSize: "10px", color: "#9CA3AF", fontWeight: 600, marginBottom: "8px", textAlign: "center" }}>
            確定スコア（プレビュー）
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "16px" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "10px", color: RED, fontWeight: 700, marginBottom: "2px" }}>赤 {match.playerA?.name}</div>
              <div style={{ fontSize: "32px", fontWeight: 800, color: finalScoreA > finalScoreB ? "#22C55E" : finalScoreA === finalScoreB ? "#F59E0B" : "#D1D5DB" }}>
                {finalScoreA}
              </div>
            </div>
            <div style={{ fontSize: "18px", color: "#4B5563", fontWeight: 800 }}>-</div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "10px", color: WHITE_PLAYER, fontWeight: 700, marginBottom: "2px" }}>白 {match.playerB?.name}</div>
              <div style={{ fontSize: "32px", fontWeight: 800, color: finalScoreB > finalScoreA ? "#22C55E" : finalScoreA === finalScoreB ? "#F59E0B" : "#D1D5DB" }}>
                {finalScoreB}
              </div>
            </div>
          </div>

          {/* Warning breakdown */}
          {resultType === RESULT.NORMAL && (bonusA > 0 || bonusB > 0) && (
            <div style={{ marginTop: "8px", padding: "6px 10px", borderRadius: "6px", background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.15)", fontSize: "11px", color: "#F59E0B", textAlign: "center" }}>
              ⚠ 警告による加算：
              {bonusA > 0 && <span style={{ marginLeft: "6px" }}>白の警告{warningsB}回 → <strong>赤に+{bonusA}本（自動加算済）</strong></span>}
              {bonusA > 0 && bonusB > 0 && " ／ "}
              {bonusB > 0 && <span style={{ marginLeft: bonusA > 0 ? "0px" : "6px" }}>赤の警告{warningsA}回 → <strong>白に+{bonusB}本（自動加算済）</strong></span>}
            </div>
          )}

          {/* Result summary */}
          <div style={{ textAlign: "center", marginTop: "8px", fontSize: "13px", fontWeight: 700 }}>
            {resultType === RESULT.DRAW ? (
              <span style={{ color: "#F59E0B" }}>引き分け</span>
            ) : resultType === RESULT.DEFAULT_WIN ? (
              <span style={{ color: "#22C55E" }}>{defaultWinSide === "A" ? "赤" : "白"} {defaultWinSide === "A" ? match.playerA?.name : match.playerB?.name} の不戦勝（2-0）</span>
            ) : resultType === RESULT.DISQUALIFICATION ? (
              <span style={{ color: "#EF4444" }}>{disqSide === "A" ? "赤" : "白"} {disqSide === "A" ? match.playerA?.name : match.playerB?.name} 失格（0-2）</span>
            ) : finalScoreA > finalScoreB ? (
              <span style={{ color: "#22C55E" }}>赤 {match.playerA?.name} の勝ち</span>
            ) : finalScoreB > finalScoreA ? (
              <span style={{ color: "#22C55E" }}>白 {match.playerB?.name} の勝ち</span>
            ) : (
              <span style={{ color: "#F59E0B" }}>同点（{isLeague ? "引き分け" : "判定が必要"}）</span>
            )}
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "16px" }}>
          <button style={S.btn("#4B5563")} onClick={onClose}>キャンセル</button>
          <button style={S.btn("#22C55E", "lg")} onClick={handleSubmit}>{isEdit ? "修正を確定" : "この結果で確定"}</button>
        </div>
      </div>
    </div>
  );
};

// --- Next Phase Modal ---
const NextPhaseModal = ({ catId, currentPhase, defaultAdvance = 2, defaultThirdPlace = false, onClose, onSelect }) => {
  const options = NEXT_PHASE_OPTIONS[currentPhase] || [];
  const [advCount, setAdvCount] = useState(defaultAdvance);
  const [selectedPhase, setSelectedPhase] = useState(options[0]?.value || "");
  const [thirdPlace, setThirdPlace] = useState(defaultThirdPlace);
  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={{ ...S.modal, maxWidth: "450px" }} onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: "0 0 4px", color: "#fff", fontSize: "16px" }}>次のステージへ進む</h3>
        <div style={{ fontSize: "11px", color: "#9CA3AF", marginBottom: "16px" }}>
          {CATEGORIES.find(c => c.id === catId)?.label} — {PHASE_LABELS[currentPhase]} 完了
        </div>
        <div style={{ marginBottom: "12px" }}>
          <div style={{ fontSize: "11px", color: "#9CA3AF", marginBottom: "6px" }}>次のステージ</div>
          {options.map(opt => (
            <button key={opt.value} onClick={() => setSelectedPhase(opt.value)} style={{
              display: "block", width: "100%", padding: "10px 14px", marginBottom: "6px", borderRadius: "8px", cursor: "pointer", textAlign: "left",
              border: selectedPhase === opt.value ? `2px solid ${PHASE_COLORS[opt.value]?.text || "#60A5FA"}` : "1px solid rgba(255,255,255,0.1)",
              background: selectedPhase === opt.value ? `${PHASE_COLORS[opt.value]?.bg || "#1E3A5F"}` : "rgba(255,255,255,0.03)",
              color: selectedPhase === opt.value ? PHASE_COLORS[opt.value]?.text || "#60A5FA" : "#9CA3AF",
              fontWeight: 600, fontSize: "13px",
            }}>
              {opt.label}
            </button>
          ))}
        </div>
        <div style={{ marginBottom: "12px" }}>
          <div style={{ fontSize: "11px", color: "#9CA3AF", marginBottom: "4px" }}>各グループからの進出人数</div>
          <div style={{ display: "flex", gap: "6px" }}>
            {[1, 2, 3, 4].map(n => (
              <button key={n} onClick={() => setAdvCount(n)} style={{
                padding: "8px 16px", borderRadius: "6px", cursor: "pointer", fontWeight: 700, fontSize: "14px",
                border: advCount === n ? "2px solid #22C55E" : "1px solid rgba(255,255,255,0.1)",
                background: advCount === n ? "rgba(34,197,94,0.12)" : "rgba(255,255,255,0.03)",
                color: advCount === n ? "#22C55E" : "#9CA3AF",
              }}>{n}名</button>
            ))}
          </div>
        </div>
        {/* 3rd place toggle - only for tournament phases */}
        {selectedPhase !== PHASE_TYPES.LEAGUE_FINAL && (
          <div style={{ marginBottom: "16px" }}>
            <button onClick={() => setThirdPlace(!thirdPlace)} style={{
              width: "100%", padding: "10px 14px", borderRadius: "8px", cursor: "pointer",
              textAlign: "left", fontSize: "13px", fontWeight: 600,
              border: thirdPlace ? "2px solid #F59E0B" : "1px solid rgba(255,255,255,0.1)",
              background: thirdPlace ? "rgba(245,158,11,0.12)" : "rgba(255,255,255,0.03)",
              color: thirdPlace ? "#F59E0B" : "#9CA3AF",
            }}>
              🥉 3位決定戦 {thirdPlace ? "あり ✓" : "なし"}
              <div style={{ fontSize: "10px", fontWeight: 400, marginTop: "2px", color: thirdPlace ? "#F59E0B" : "#6B7280" }}>
                {advCount <= 1
                  ? "各グループ2位同士で3位決定戦を行います"
                  : "準決勝敗者同士で3位決定戦を行います"}
              </div>
            </button>
          </div>
        )}
        {selectedPhase === PHASE_TYPES.LEAGUE_FINAL && (
          <div style={{ marginBottom: "16px", padding: "10px 14px", borderRadius: "8px", background: "rgba(244,114,182,0.06)", border: "1px solid rgba(244,114,182,0.12)", fontSize: "12px", color: "#F472B6" }}>
            🏆 リーグ決勝は総当たり戦で、順位表の結果から1位・2位・3位が自動確定します
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
          <button style={S.btn("#4B5563")} onClick={onClose}>キャンセル</button>
          <button style={S.btn("#22C55E", "lg")} onClick={() => onSelect(selectedPhase, advCount, thirdPlace)}>
            決定して進む
          </button>
        </div>
      </div>
    </div>
  );
};

// --- Bracket View ---
const BracketView = ({ matches, totalRounds }) => {
  if (!totalRounds) return null;
  const rn = (r, t) => { if (r === t) return "決勝"; if (r === t - 1) return "準決勝"; if (r === t - 2) return "準々決勝"; return `${r}回戦`; };
  const normalMatches = matches.filter(m => !m.isThirdPlace);
  const thirdPlaceMatch = matches.find(m => m.isThirdPlace);
  return (
    <div>
      <div style={{ display: "flex", gap: "16px", overflowX: "auto", padding: "8px 0" }}>
        {Array.from({ length: totalRounds }, (_, i) => i + 1).map(round => {
          const rm = normalMatches.filter(m => m.round === round).sort((a, b) => a.position - b.position);
          return (
            <div key={round} style={{ minWidth: "170px", display: "flex", flexDirection: "column", gap: "6px" }}>
              <div style={{ fontSize: "11px", fontWeight: 700, color: "#9CA3AF", textAlign: "center", paddingBottom: "6px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>{rn(round, totalRounds)}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px", justifyContent: "space-around", flex: 1 }}>
                {rm.map(m => (
                  <div key={m.id} style={{ borderRadius: "6px", padding: "5px 8px", fontSize: "11px", background: m.status === "completed" ? "rgba(34,197,94,0.05)" : m.status === "active" ? "rgba(239,68,68,0.08)" : "rgba(255,255,255,0.02)", border: `1px solid ${m.status === "completed" ? "rgba(34,197,94,0.15)" : m.status === "active" ? "rgba(239,68,68,0.2)" : "rgba(255,255,255,0.05)"}` }}>
                    {m.isBye ? (
                      <div style={{ color: "#6B7280", fontSize: "10px", padding: "2px" }}>{m.playerA?.name || m.playerB?.name} (BYE)</div>
                    ) : (<>
                      <div style={{ padding: "2px 4px", borderRadius: "3px", display: "flex", justifyContent: "space-between", background: m.winnerId === m.playerA?.id ? "rgba(34,197,94,0.1)" : "transparent", color: m.winnerId === m.playerA?.id ? "#22C55E" : "#D1D5DB", fontWeight: m.winnerId === m.playerA?.id ? 600 : 400 }}>
                        <span>{m.playerA?.name || "—"}</span>
                        {m.status === "completed" && <span>{m.scoreA}</span>}
                      </div>
                      <div style={{ textAlign: "center", fontSize: "9px", color: "#4B5563", padding: "1px 0" }}>vs</div>
                      <div style={{ padding: "2px 4px", borderRadius: "3px", display: "flex", justifyContent: "space-between", background: m.winnerId === m.playerB?.id ? "rgba(34,197,94,0.1)" : "transparent", color: m.winnerId === m.playerB?.id ? "#22C55E" : "#D1D5DB", fontWeight: m.winnerId === m.playerB?.id ? 600 : 400 }}>
                        <span>{m.playerB?.name || "—"}</span>
                        {m.status === "completed" && <span>{m.scoreB}</span>}
                      </div>
                    </>)}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {/* 3rd place match */}
      {thirdPlaceMatch && (() => {
        const fromRunnerUp = !thirdPlaceMatch.sourceMatchA && thirdPlaceMatch.playerA;
        const placeholderText = fromRunnerUp ? "（各グループ2位）" : "（準決勝敗者）";
        const sourceLabel = fromRunnerUp ? "各グループ2位同士" : "準決勝敗者同士";
        return (
          <div style={{ marginTop: "8px", padding: "10px 12px", borderRadius: "8px", background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.15)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "#F59E0B" }}>🥉 3位決定戦</span>
              <span style={{ fontSize: "9px", color: "#9CA3AF" }}>（{sourceLabel}）</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "13px" }}>
              <div style={{ flex: 1, textAlign: "center" }}>
                <span style={{
                  fontWeight: thirdPlaceMatch.winnerId === thirdPlaceMatch.playerA?.id ? 700 : 500,
                  color: thirdPlaceMatch.winnerId === thirdPlaceMatch.playerA?.id ? "#22C55E" : "#D1D5DB",
                  fontSize: "14px",
                }}>
                  {thirdPlaceMatch.playerA?.name || placeholderText}
                </span>
                {thirdPlaceMatch.playerA?.dojo && (
                  <div style={{ fontSize: "9px", color: "#6B7280" }}>{thirdPlaceMatch.playerA.dojo}</div>
                )}
              </div>
              <span style={{ color: "#4B5563", fontWeight: 800, fontSize: "14px" }}>
                {thirdPlaceMatch.status === "completed" ? `${thirdPlaceMatch.scoreA} - ${thirdPlaceMatch.scoreB}` : "VS"}
              </span>
              <div style={{ flex: 1, textAlign: "center" }}>
                <span style={{
                  fontWeight: thirdPlaceMatch.winnerId === thirdPlaceMatch.playerB?.id ? 700 : 500,
                  color: thirdPlaceMatch.winnerId === thirdPlaceMatch.playerB?.id ? "#22C55E" : "#D1D5DB",
                  fontSize: "14px",
                }}>
                  {thirdPlaceMatch.playerB?.name || placeholderText}
                </span>
                {thirdPlaceMatch.playerB?.dojo && (
                  <div style={{ fontSize: "9px", color: "#6B7280" }}>{thirdPlaceMatch.playerB.dojo}</div>
                )}
              </div>
              <div style={{ flexShrink: 0 }}>
                {thirdPlaceMatch.status === "completed" && <span style={S.badge("#F59E0B")}>完了</span>}
                {thirdPlaceMatch.status === "active" && <span style={S.badge("#EF4444")}>進行中</span>}
                {thirdPlaceMatch.status === "pending" && thirdPlaceMatch.playerA && thirdPlaceMatch.playerB && <span style={S.badge("#9CA3AF")}>待機</span>}
                {thirdPlaceMatch.status === "pending" && (!thirdPlaceMatch.playerA || !thirdPlaceMatch.playerB) && <span style={{ fontSize: "9px", color: "#4B5563" }}>未確定</span>}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

// ==========================================
// Main App
// ==========================================
export default function App() {
  const [page, setPage] = useState("admin");
  const [players, setPlayers] = useState([]);
  const [catPhases, setCatPhases] = useState({});
  const [leagueGroups, setLeagueGroups] = useState({});
  const [allMatches, setAllMatches] = useState([]);
  const [tournamentData, setTournamentData] = useState({});
  const [venueAssignments, setVenueAssignments] = useState({});
  const [initialized, setInitialized] = useState(false);
  const [selectedCat, setSelectedCat] = useState(null);
  const [recordingMatch, setRecordingMatch] = useState(null);
  const [refereeVenue, setRefereeVenue] = useState("A");
  const [nextPhaseModal, setNextPhaseModal] = useState(null); // { catId, currentPhase }
  const [catStartFormats, setCatStartFormats] = useState({}); // categoryId -> PHASE_TYPES value
  const [catAdvanceCounts, setCatAdvanceCounts] = useState({}); // categoryId -> number
  const [catThirdPlace, setCatThirdPlace] = useState({}); // categoryId -> boolean

  const activeCats = useMemo(() => {
    return CATEGORIES.map(c => ({
      ...c,
      playerCount: players.filter(p => p.categoryId === c.id).length,
      phase: catPhases[c.id] || PHASE_TYPES.SETUP,
      startFormat: catStartFormats[c.id] || PHASE_TYPES.LEAGUE,
      advanceCount: catAdvanceCounts[c.id] || 1,
      thirdPlace: catThirdPlace[c.id] !== false,
    })).filter(c => c.playerCount > 0);
  }, [players, catPhases, catStartFormats, catAdvanceCounts, catThirdPlace]);

  const initSample = useCallback(() => {
    const p = generatePlayers();
    setPlayers(p); setInitialized(true);
    setCatPhases({}); setLeagueGroups({}); setAllMatches([]); setTournamentData({});
    setCatStartFormats({}); setCatAdvanceCounts({}); setCatThirdPlace({});
    // Default venue assignments (round-robin across courts)
    const cats = CATEGORIES.filter(c => p.some(pl => pl.categoryId === c.id));
    const defaultAssigns = {};
    cats.forEach((c, i) => { defaultAssigns[c.id] = VENUES[i % 4].id; });
    setVenueAssignments(defaultAssigns);
  }, []);

  const setStartFormat = useCallback((catId, format) => {
    setCatStartFormats(prev => ({ ...prev, [catId]: format }));
  }, []);

  const setVenueForCat = useCallback((catId, venueId) => {
    setVenueAssignments(prev => ({ ...prev, [catId]: venueId }));
  }, []);

  const setAdvanceCount = useCallback((catId, count) => {
    setCatAdvanceCounts(prev => ({ ...prev, [catId]: count }));
  }, []);

  const toggleThirdPlace = useCallback((catId) => {
    setCatThirdPlace(prev => ({ ...prev, [catId]: !prev[catId] }));
  }, []);

  // Set all categories to the same start format
  const setAllStartFormats = useCallback((format) => {
    const newFormats = {};
    activeCats.forEach(c => { if (c.phase === PHASE_TYPES.SETUP) newFormats[c.id] = format; });
    setCatStartFormats(prev => ({ ...prev, ...newFormats }));
  }, [activeCats]);

  const startLeague = useCallback((catId, phaseKey = PHASE_TYPES.LEAGUE) => {
    const catPlayers = players.filter(p => p.categoryId === catId);
    const groupSize = catPlayers.length <= 6 ? 3 : 4;
    const groups = createLeagueGroups(catPlayers, groupSize);
    const matches = [];
    groups.forEach((g, gi) => { matches.push(...createLeagueMatches(g, gi, catId, phaseKey)); });
    setLeagueGroups(prev => ({ ...prev, [catId]: groups }));
    setAllMatches(prev => [...prev, ...matches]);
    setCatPhases(prev => ({ ...prev, [catId]: phaseKey }));
  }, [players]);

  const startTournament = useCallback((catId, phaseKey = PHASE_TYPES.FINAL_TOURNAMENT) => {
    const catPlayers = players.filter(p => p.categoryId === catId);
    const shuffled = [...catPlayers].sort(() => Math.random() - 0.5);
    const hasTP = catThirdPlace[catId] !== false;
    const { matches, totalRounds, bracketSize } = generateBracket(shuffled, catId, phaseKey, hasTP);
    setAllMatches(prev => [...prev, ...matches]);
    setTournamentData(prev => ({ ...prev, [catId]: { totalRounds, bracketSize, phaseKey, hasThirdPlace: hasTP } }));
    setCatPhases(prev => ({ ...prev, [catId]: phaseKey }));
  }, [players, catThirdPlace]);

  // Start a single category with its chosen format
  const startCategory = useCallback((catId) => {
    const format = catStartFormats[catId] || PHASE_TYPES.LEAGUE;
    if (format === PHASE_TYPES.LEAGUE) {
      startLeague(catId, PHASE_TYPES.LEAGUE);
    } else if (format === PHASE_TYPES.FINAL_TOURNAMENT) {
      startTournament(catId, PHASE_TYPES.FINAL_TOURNAMENT);
    } else if (format === PHASE_TYPES.PRE_TOURNAMENT) {
      startTournament(catId, PHASE_TYPES.PRE_TOURNAMENT);
    }
  }, [catStartFormats, startLeague, startTournament]);

  const startAll = useCallback(() => {
    activeCats.forEach(c => {
      if (c.phase === PHASE_TYPES.SETUP) startCategory(c.id);
    });
    // venueAssignments are already set manually in the setup panel
  }, [activeCats, startCategory]);

  // Flexible phase advancement
  const advancePhase = useCallback((catId, nextPhase, advanceCount, hasThirdPlace = false) => {
    const currentPhase = catPhases[catId];
    const groups = leagueGroups[catId] || [];
    const hasTP = hasThirdPlace;

    // Use type-based filter instead of phaseKey to avoid stale reference issues
    const leagueMatches = allMatches.filter(m => m.categoryId === catId && m.type === "league");
    const tournamentMatches = allMatches.filter(m => m.categoryId === catId && m.type === "tournament");

    // Gather advanced players + runners-up
    const advanced = [];
    let runnersUp = [];

    if (currentPhase === PHASE_TYPES.LEAGUE) {
      groups.forEach((g, gi) => {
        const gMatches = leagueMatches.filter(m => m.groupIndex === gi && m.phaseKey === PHASE_TYPES.LEAGUE);
        const standings = calcStandings(g, gMatches);
        advanced.push(...standings.slice(0, advanceCount));
        if (hasTP && standings.length > advanceCount) {
          runnersUp.push(standings[advanceCount]);
        }
      });
    } else if (currentPhase === PHASE_TYPES.PRE_TOURNAMENT) {
      tournamentMatches.filter(m => m.status === "completed" && m.winnerId).forEach(m => {
        const winner = { id: m.winnerId, name: m.winnerName, dojo: m.playerA?.id === m.winnerId ? m.playerA.dojo : m.playerB?.dojo };
        if (!advanced.find(a => a.id === winner.id)) advanced.push(winner);
      });
    }

    if (advanced.length < 2) return;

    if (nextPhase === PHASE_TYPES.LEAGUE_FINAL) {
      // League Final: all advanced players play round-robin in one group
      const finalPlayers = [...advanced];
      const newMatches = createLeagueMatches(finalPlayers, 0, catId, PHASE_TYPES.LEAGUE_FINAL);
      // Store as single group for standings calculation
      setLeagueGroups(prev => ({ ...prev, [`${catId}_final`]: [finalPlayers] }));
      setAllMatches(prev => [...prev, ...newMatches]);
      setCatPhases(prev => ({ ...prev, [catId]: PHASE_TYPES.LEAGUE_FINAL }));
    } else if (nextPhase === PHASE_TYPES.FINAL_TOURNAMENT || nextPhase === PHASE_TYPES.PRE_TOURNAMENT) {
      // Determine if bracket is large enough for semi-final based 3rd place
      const bracketThirdPlace = hasTP && advanced.length >= 4;
      const { matches, totalRounds, bracketSize } = generateBracket(advanced, catId, nextPhase, bracketThirdPlace);

      // If 3rd place enabled but bracket too small (no semi-finals),
      // create 3rd place match from league runners-up (each group's 2nd place)
      if (hasTP && !bracketThirdPlace && runnersUp.length >= 2) {
        matches.push({
          id: uid(), categoryId: catId, round: totalRounds, matchNumber: matches.length + 1,
          position: 99, type: "tournament", phaseKey: nextPhase,
          playerA: { id: runnersUp[0].id, name: runnersUp[0].name, dojo: runnersUp[0].dojo },
          playerB: { id: runnersUp[1].id, name: runnersUp[1].name, dojo: runnersUp[1].dojo },
          scoreA: 0, scoreB: 0, warningsA: 0, warningsB: 0,
          winnerId: null, winnerName: null, resultType: null, isBye: false, status: "pending",
          venueId: null, sourceMatchA: null, sourceMatchB: null,
          isThirdPlace: true,
        });
      }

      setAllMatches(prev => [...prev, ...matches]);
      setTournamentData(prev => ({ ...prev, [catId]: { totalRounds, bracketSize, phaseKey: nextPhase, hasThirdPlace: hasTP } }));
      setCatPhases(prev => ({ ...prev, [catId]: nextPhase }));
    }

    setNextPhaseModal(null);
  }, [catPhases, leagueGroups, allMatches]);

  const submitMatchResult = useCallback((updatedMatch) => {
    setAllMatches(prev => {
      let updated = prev.map(m => m.id === updatedMatch.id ? updatedMatch : m);
      if (updatedMatch.type === "tournament" && updatedMatch.winnerId) {
        // Propagate winner to next round (normal bracket)
        const nextMatch = updated.find(m =>
          m.categoryId === updatedMatch.categoryId && m.type === "tournament" &&
          m.phaseKey === updatedMatch.phaseKey && !m.isThirdPlace &&
          (m.sourceMatchA === updatedMatch.id || m.sourceMatchB === updatedMatch.id)
        );
        if (nextMatch) {
          const isA = nextMatch.sourceMatchA === updatedMatch.id;
          const winnerDojo = updatedMatch.playerA?.id === updatedMatch.winnerId ? updatedMatch.playerA?.dojo : updatedMatch.playerB?.dojo;
          updated = updated.map(m => m.id === nextMatch.id ? { ...m, [isA ? "playerA" : "playerB"]: { id: updatedMatch.winnerId, name: updatedMatch.winnerName, dojo: winnerDojo } } : m);
        }

        // Propagate LOSER to 3rd place match (if exists)
        const thirdPlaceMatch = updated.find(m =>
          m.categoryId === updatedMatch.categoryId && m.type === "tournament" &&
          m.phaseKey === updatedMatch.phaseKey && m.isThirdPlace &&
          (m.sourceMatchA === updatedMatch.id || m.sourceMatchB === updatedMatch.id)
        );
        if (thirdPlaceMatch) {
          const isA = thirdPlaceMatch.sourceMatchA === updatedMatch.id;
          const loserId = updatedMatch.playerA?.id === updatedMatch.winnerId ? updatedMatch.playerB?.id : updatedMatch.playerA?.id;
          const loserName = updatedMatch.playerA?.id === updatedMatch.winnerId ? updatedMatch.playerB?.name : updatedMatch.playerA?.name;
          const loserDojo = updatedMatch.playerA?.id === updatedMatch.winnerId ? updatedMatch.playerB?.dojo : updatedMatch.playerA?.dojo;
          updated = updated.map(m => m.id === thirdPlaceMatch.id ? { ...m, [isA ? "playerA" : "playerB"]: { id: loserId, name: loserName, dojo: loserDojo } } : m);
        }
      }
      return updated;
    });
    setRecordingMatch(null);
  }, []);

  const activateMatch = useCallback((matchId) => {
    setAllMatches(prev => prev.map(m => m.id === matchId ? { ...m, status: "active" } : m));
  }, []);

  const totalMatches = allMatches.filter(m => !m.isBye).length;
  const completedMatches = allMatches.filter(m => m.status === "completed" && !m.isBye).length;
  const progressPct = totalMatches > 0 ? Math.round((completedMatches / totalMatches) * 100) : 0;

  const isPhaseComplete = useCallback((catId) => {
    const phase = catPhases[catId];
    const phaseMatches = allMatches.filter(m => m.categoryId === catId && m.phaseKey === phase && !m.isBye);
    return phaseMatches.length > 0 && phaseMatches.every(m => m.status === "completed");
  }, [allMatches, catPhases]);

  // Revert to previous phase (undo phase advance)
  const revertPhase = useCallback((catId) => {
    const currentPhase = catPhases[catId];
    let prevPhase = null;

    if (currentPhase === PHASE_TYPES.LEAGUE_FINAL) {
      prevPhase = PHASE_TYPES.LEAGUE;
      // Remove league final matches and groups
      setAllMatches(prev => prev.filter(m => !(m.categoryId === catId && m.phaseKey === PHASE_TYPES.LEAGUE_FINAL)));
      setLeagueGroups(prev => { const n = { ...prev }; delete n[`${catId}_final`]; return n; });
    } else if (currentPhase === PHASE_TYPES.FINAL_TOURNAMENT || currentPhase === PHASE_TYPES.PRE_TOURNAMENT) {
      prevPhase = PHASE_TYPES.LEAGUE;
      // Remove all tournament matches for this category
      setAllMatches(prev => prev.filter(m => !(m.categoryId === catId && m.type === "tournament")));
      setTournamentData(prev => { const n = { ...prev }; delete n[catId]; return n; });
    }

    if (prevPhase) {
      setCatPhases(prev => ({ ...prev, [catId]: prevPhase }));
    }
  }, [catPhases]);

  const [confirmRevert, setConfirmRevert] = useState(null); // catId to confirm

  // ==========================================
  // ADMIN
  // ==========================================
  const AdminPage = () => (
    <div>
      <div style={S.grid4}>
        <Stat value={players.length} label="登録選手数" color="#3B82F6" />
        <Stat value={activeCats.length} label="カテゴリ数" />
        <Stat value={completedMatches} label="完了試合" color="#22C55E" />
        <Stat value={`${progressPct}%`} label="進行率" color="#F59E0B" />
      </div>
      <div style={{ ...S.card, display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
        {!initialized ? (
          <button style={S.btn("#3B82F6", "lg")} onClick={initSample}>📋 サンプルデータ読込</button>
        ) : (<>
          {activeCats.some(c => c.phase === PHASE_TYPES.SETUP) && (
            <button style={S.btn("#B91C1C", "lg")} onClick={startAll}>🏆 全カテゴリ一括開始</button>
          )}
          <button style={S.btn("#4B5563")} onClick={() => { setPlayers([]); setInitialized(false); setCatPhases({}); setLeagueGroups({}); setAllMatches([]); setTournamentData({}); setCatStartFormats({}); setCatAdvanceCounts({}); setCatThirdPlace({}); }}>リセット</button>
        </>)}
      </div>

      {/* Start Format Configuration - only shown before start */}
      {initialized && activeCats.some(c => c.phase === PHASE_TYPES.SETUP) && (
        <div style={S.card}>
          <div style={S.cardTitle}>開始形式 ・ コートの設定</div>
          <div style={{ fontSize: "11px", color: "#9CA3AF", marginBottom: "12px" }}>
            各カテゴリの試合形式とコートを選択してから「全カテゴリ一括開始」を押してください
          </div>

          {/* Bulk set buttons */}
          <div style={{ display: "flex", gap: "6px", marginBottom: "10px", flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: "11px", color: "#9CA3AF", marginRight: "4px" }}>形式一括：</span>
            {START_FORMATS.map(sf => (
              <button key={sf.value} onClick={() => setAllStartFormats(sf.value)} style={{
                padding: "5px 12px", borderRadius: "6px", fontSize: "11px", fontWeight: 600, cursor: "pointer",
                border: `1px solid ${sf.color}40`, background: `${sf.color}10`, color: sf.color,
              }}>
                全て「{sf.label}」
              </button>
            ))}
          </div>

          {/* Per-category format + venue selector */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "8px" }}>
            {activeCats.filter(c => c.phase === PHASE_TYPES.SETUP).map(c => {
              const currentFormat = catStartFormats[c.id] || PHASE_TYPES.LEAGUE;
              const currentVenue = venueAssignments[c.id];
              return (
                <div key={c.id} style={{
                  padding: "10px 12px", borderRadius: "8px",
                  background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
                }}>
                  {/* Category name + count + groups */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                    <div style={{ fontSize: "13px", fontWeight: 700, color: "#fff" }}>{c.label}</div>
                    <div style={{ fontSize: "10px", color: "#6B7280", flexShrink: 0, marginLeft: "8px", textAlign: "right" }}>
                      <div>{c.playerCount}人</div>
                      {(catStartFormats[c.id] || PHASE_TYPES.LEAGUE) === PHASE_TYPES.LEAGUE && (
                        <div style={{ color: "#60A5FA", fontSize: "9px" }}>
                          → {Math.ceil(c.playerCount / (c.playerCount <= 6 ? 3 : 4))}グループ
                        </div>
                      )}
                    </div>
                  </div>
                  {/* Format selector */}
                  <div style={{ display: "flex", gap: "4px", marginBottom: "6px" }}>
                    {START_FORMATS.map(sf => (
                      <button key={sf.value} onClick={() => setStartFormat(c.id, sf.value)} style={{
                        flex: 1, padding: "5px 4px", borderRadius: "5px", fontSize: "10px", fontWeight: 600, cursor: "pointer",
                        border: currentFormat === sf.value ? `2px solid ${sf.color}` : "1px solid rgba(255,255,255,0.08)",
                        background: currentFormat === sf.value ? `${sf.color}18` : "rgba(255,255,255,0.02)",
                        color: currentFormat === sf.value ? sf.color : "#6B7280",
                        textAlign: "center",
                      }}>
                        {sf.label}
                      </button>
                    ))}
                  </div>
                  {/* Venue selector */}
                  <div style={{ display: "flex", gap: "3px", marginBottom: "6px" }}>
                    {VENUES.map(v => (
                      <button key={v.id} onClick={() => setVenueForCat(c.id, v.id)} style={{
                        flex: 1, padding: "4px 2px", borderRadius: "5px", fontSize: "10px", fontWeight: 700, cursor: "pointer",
                        border: currentVenue === v.id ? `2px solid ${v.color}` : "1px solid rgba(255,255,255,0.06)",
                        background: currentVenue === v.id ? `${v.color}20` : "rgba(255,255,255,0.02)",
                        color: currentVenue === v.id ? v.color : "#4B5563",
                        textAlign: "center",
                      }}>
                        {v.name.replace("コート", "")}
                      </button>
                    ))}
                  </div>
                  {/* Advance count + 3rd place row */}
                  <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                    {/* Advance count - only for league */}
                    {currentFormat === PHASE_TYPES.LEAGUE && (
                      <div style={{ display: "flex", alignItems: "center", gap: "3px", flex: 1 }}>
                        <span style={{ fontSize: "9px", color: "#9CA3AF", whiteSpace: "nowrap" }}>進出:</span>
                        {[1, 2, 3].map(n => (
                          <button key={n} onClick={() => setAdvanceCount(c.id, n)} style={{
                            padding: "3px 7px", borderRadius: "4px", fontSize: "10px", fontWeight: 700, cursor: "pointer",
                            border: (catAdvanceCounts[c.id] || 1) === n ? "1.5px solid #22C55E" : "1px solid rgba(255,255,255,0.06)",
                            background: (catAdvanceCounts[c.id] || 1) === n ? "rgba(34,197,94,0.12)" : "rgba(255,255,255,0.02)",
                            color: (catAdvanceCounts[c.id] || 1) === n ? "#22C55E" : "#4B5563",
                          }}>{n}名</button>
                        ))}
                      </div>
                    )}
                    {/* 3rd place toggle */}
                    {currentFormat !== PHASE_TYPES.LEAGUE && (
                      <div style={{ flex: 1 }} />
                    )}
                    <button onClick={() => setCatThirdPlace(prev => ({ ...prev, [c.id]: !(prev[c.id] !== false) }))} style={{
                      padding: "3px 8px", borderRadius: "4px", fontSize: "9px", fontWeight: 600, cursor: "pointer",
                      border: (catThirdPlace[c.id] !== false) ? "1.5px solid #F59E0B" : "1px solid rgba(255,255,255,0.06)",
                      background: (catThirdPlace[c.id] !== false) ? "rgba(245,158,11,0.12)" : "rgba(255,255,255,0.02)",
                      color: (catThirdPlace[c.id] !== false) ? "#F59E0B" : "#4B5563",
                      whiteSpace: "nowrap",
                    }}>
                      🥉 3位決定戦{catThirdPlace[c.id] !== false ? " ✓" : ""}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {totalMatches > 0 && (
        <div style={S.card}>
          <div style={S.cardTitle}>大会進行状況</div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px", fontSize: "12px" }}>
            <span>完了: {completedMatches} / {totalMatches} 試合</span>
            <span style={{ color: "#F59E0B" }}>{progressPct}%</span>
          </div>
          <Progress pct={progressPct} color="#F59E0B" />
        </div>
      )}
      {activeCats.length > 0 && (
        <div style={S.card}>
          <div style={S.cardTitle}>カテゴリ一覧</div>
          <table style={S.table}>
            <thead><tr>
              <th style={S.th}>カテゴリ</th><th style={S.th}>人数</th><th style={S.th}>面</th>
              <th style={S.th}>開始形式</th><th style={S.th}>フェーズ</th><th style={S.th}>会場</th><th style={S.th}>進行</th><th style={S.th}>操作</th>
            </tr></thead>
            <tbody>
              {activeCats.map(c => {
                const venue = VENUES.find(v => v.id === venueAssignments[c.id]);
                const catMatches = allMatches.filter(m => m.categoryId === c.id && !m.isBye);
                const catDone = catMatches.filter(m => m.status === "completed").length;
                const phaseComplete = isPhaseComplete(c.id);
                const hasNextOptions = NEXT_PHASE_OPTIONS[c.phase];
                const format = catStartFormats[c.id] || PHASE_TYPES.LEAGUE;
                const formatInfo = START_FORMATS.find(sf => sf.value === format);
                return (
                  <tr key={c.id}>
                    <td style={{ ...S.td, fontWeight: 600, color: "#fff" }}>{c.label}</td>
                    <td style={S.td}>
                      <div>{c.playerCount}人</div>
                      {(c.phase === PHASE_TYPES.LEAGUE || c.phase === PHASE_TYPES.LEAGUE_FINAL) && leagueGroups[c.id] && (
                        <div style={{ fontSize: "9px", color: "#60A5FA" }}>{leagueGroups[c.id].length}グループ</div>
                      )}
                    </td>
                    <td style={S.td}><span style={{ fontSize: "10px" }}>{c.menType}</span></td>
                    <td style={S.td}>
                      {c.phase === PHASE_TYPES.SETUP ? (
                        <span style={{ fontSize: "10px", color: formatInfo?.color || "#9CA3AF", fontWeight: 600 }}>{formatInfo?.label || "リーグ戦"}</span>
                      ) : (
                        <span style={{ fontSize: "10px", color: "#6B7280" }}>—</span>
                      )}
                    </td>
                    <td style={S.td}><span style={S.phaseTag(c.phase)}>{PHASE_LABELS[c.phase]}</span></td>
                    <td style={S.td}>
                      <div style={{ display: "flex", gap: "2px" }}>
                        {VENUES.map(v => (
                          <button key={v.id} onClick={() => setVenueForCat(c.id, v.id)} style={{
                            padding: "2px 6px", borderRadius: "4px", fontSize: "9px", fontWeight: 700, cursor: "pointer",
                            border: venue?.id === v.id ? `1.5px solid ${v.color}` : "1px solid transparent",
                            background: venue?.id === v.id ? `${v.color}20` : "transparent",
                            color: venue?.id === v.id ? v.color : "#4B5563",
                          }}>
                            {v.id}
                          </button>
                        ))}
                      </div>
                    </td>
                    <td style={S.td}><span style={{ fontSize: "11px" }}>{catDone}/{catMatches.length}</span></td>
                    <td style={S.td}>
                      <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                        {c.phase === PHASE_TYPES.SETUP ? (
                          <button style={S.btn("#22C55E", "sm")} onClick={() => startCategory(c.id)}>▶ 開始</button>
                        ) : (
                          <button style={S.btn("#3B82F6", "sm")} onClick={() => setSelectedCat(c.id)}>詳細</button>
                        )}
                        {phaseComplete && hasNextOptions && (
                          <button style={S.btn("#22C55E", "sm")} onClick={() => setNextPhaseModal({ catId: c.id, currentPhase: c.phase })}>
                            次ステージへ →
                          </button>
                        )}
                        {(c.phase === PHASE_TYPES.LEAGUE_FINAL || c.phase === PHASE_TYPES.FINAL_TOURNAMENT || c.phase === PHASE_TYPES.PRE_TOURNAMENT) && (
                          <button style={{ ...S.btn("#F59E0B", "sm"), fontSize: "9px", padding: "3px 6px" }}
                            onClick={() => setConfirmRevert(c.id)}>
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
      )}

      {/* Category Detail Modal */}
      {selectedCat && (
        <div style={S.overlay} onClick={() => setSelectedCat(null)}>
          <div style={{ ...S.modal, maxWidth: "950px" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "12px" }}>
              <div>
                <h3 style={{ margin: 0, color: "#fff", fontSize: "16px" }}>{CATEGORIES.find(c => c.id === selectedCat)?.label}</h3>
                <span style={S.phaseTag(catPhases[selectedCat] || PHASE_TYPES.SETUP)}>{PHASE_LABELS[catPhases[selectedCat] || PHASE_TYPES.SETUP]}</span>
              </div>
              <button style={{ background: "none", border: "none", color: "#9CA3AF", fontSize: "18px", cursor: "pointer" }} onClick={() => setSelectedCat(null)}>✕</button>
            </div>
            {/* Final Rankings - from tournament or league final */}
            {(() => {
              // Check tournament rankings
              const tMatches = allMatches.filter(m => m.categoryId === selectedCat && m.type === "tournament");
              const tRankings = getFinalRankings(tMatches);
              if (tRankings) return <FinalRankings rankings={tRankings} />;
              // Check league final rankings
              const lfMatches = allMatches.filter(m => m.categoryId === selectedCat && m.type === "league" && m.phaseKey === PHASE_TYPES.LEAGUE_FINAL);
              const lfPlayers = leagueGroups[`${selectedCat}_final`]?.[0];
              if (lfPlayers && lfMatches.length > 0) {
                const lfRankings = getLeagueFinalRankings(lfPlayers, lfMatches);
                if (lfRankings) return <FinalRankings rankings={lfRankings} />;
              }
              return null;
            })()}
            {/* League Preliminary Results */}
            {(() => {
              const prelimMatches = allMatches.filter(m => m.categoryId === selectedCat && m.type === "league" && m.phaseKey === PHASE_TYPES.LEAGUE);
              const groups = leagueGroups[selectedCat] || [];
              if (prelimMatches.length === 0 || groups.length === 0) return null;
              const currentPhase = catPhases[selectedCat];
              const isActive = currentPhase === PHASE_TYPES.LEAGUE;
              return (
                <div style={{ marginBottom: "8px" }}>
                  {!isActive && (
                    <div style={{ fontSize: "12px", fontWeight: 700, color: "#60A5FA", marginBottom: "8px", padding: "6px 10px", borderRadius: "6px", background: "rgba(96,165,250,0.06)", border: "1px solid rgba(96,165,250,0.12)" }}>
                      📋 予選リーグ結果
                    </div>
                  )}
                  {groups.map((group, gi) => {
                    const gMatches = prelimMatches.filter(m => m.groupIndex === gi);
                    return <StandingsTable key={gi} standings={calcStandings(group, gMatches)} groupIdx={gi} advanceCount={catAdvanceCounts[selectedCat] || 1} />;
                  })}
                  <div style={{ marginTop: "4px" }}>
                    <div style={{ fontSize: "12px", fontWeight: 700, color: "#9CA3AF", marginBottom: "6px" }}>予選リーグ 対戦結果</div>
                    {prelimMatches.map(m => (
                      <div key={m.id} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 10px", marginBottom: "4px", borderRadius: "6px", background: m.status === "completed" ? "rgba(34,197,94,0.04)" : m.status === "active" ? "rgba(239,68,68,0.06)" : "rgba(255,255,255,0.02)", border: `1px solid ${m.status === "completed" ? "rgba(34,197,94,0.1)" : "rgba(255,255,255,0.05)"}` }}>
                        <span style={{ fontSize: "10px", color: "#9CA3AF", minWidth: "30px" }}>{String.fromCharCode(65 + m.groupIndex)}</span>
                        <span style={{ flex: 1, fontSize: "12px", fontWeight: m.winnerId === m.playerA?.id ? 700 : 400, color: m.winnerId === m.playerA?.id ? "#22C55E" : "#D1D5DB" }}>{m.playerA?.name}</span>
                        <span style={{ fontSize: "13px", fontWeight: 700, color: "#fff", minWidth: "50px", textAlign: "center" }}>
                          {m.status === "completed" ? `${m.scoreA} - ${m.scoreB}` : "vs"}
                        </span>
                        <span style={{ flex: 1, fontSize: "12px", textAlign: "right", fontWeight: m.winnerId === m.playerB?.id ? 700 : 400, color: m.winnerId === m.playerB?.id ? "#22C55E" : "#D1D5DB" }}>{m.playerB?.name}</span>
                        {m.status === "completed" ? (
                          <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                            <span style={S.badge(m.resultType === RESULT.DRAW ? "#F59E0B" : "#22C55E")}>
                              {m.resultType === RESULT.DRAW ? "引分" : m.resultType === RESULT.DEFAULT_WIN ? "不戦勝" : m.resultType === RESULT.DISQUALIFICATION ? "失格" : "完了"}
                            </span>
                            <button style={{ ...S.btn("#4B5563", "sm"), padding: "3px 6px", fontSize: "9px" }} onClick={() => setRecordingMatch(m)}>修正</button>
                          </div>
                        ) : m.status === "active" ? (
                          <button style={S.btn("#EF4444", "sm")} onClick={() => setRecordingMatch(m)}>入力</button>
                        ) : (
                          <button style={S.btn("#4B5563", "sm")} onClick={() => activateMatch(m.id)}>開始</button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
            {/* League Final Results */}
            {(() => {
              const lfMatches = allMatches.filter(m => m.categoryId === selectedCat && m.type === "league" && m.phaseKey === PHASE_TYPES.LEAGUE_FINAL);
              const lfPlayers = leagueGroups[`${selectedCat}_final`]?.[0];
              if (lfMatches.length === 0 || !lfPlayers) return null;
              const standings = calcStandings(lfPlayers, lfMatches);
              return (
                <div style={{ marginBottom: "8px" }}>
                  <div style={{ fontSize: "12px", fontWeight: 700, color: "#F472B6", marginBottom: "8px", padding: "6px 10px", borderRadius: "6px", background: "rgba(244,114,182,0.06)", border: "1px solid rgba(244,114,182,0.12)" }}>
                    🏆 リーグ決勝
                  </div>
                  {/* Standings */}
                  <table style={S.table}>
                    <thead><tr>
                      <th style={{ ...S.th, width: "30px" }}>順位</th><th style={S.th}>選手名</th><th style={S.th}>所属</th>
                      <th style={{ ...S.th, textAlign: "center" }}>勝</th><th style={{ ...S.th, textAlign: "center" }}>敗</th>
                      <th style={{ ...S.th, textAlign: "center" }}>分</th><th style={{ ...S.th, textAlign: "center" }}>本数</th>
                      <th style={{ ...S.th, textAlign: "center" }}>勝点</th>
                    </tr></thead>
                    <tbody>
                      {(() => {
                        const medalColors = ["#FFD700", "#C0C0C0", "#CD7F32"];
                        const medals = ["🥇", "🥈", "🥉"];
                        let currentRank = 1;
                        return standings.map((s, i) => {
                          if (i > 0) {
                            const prev = standings[i - 1];
                            if (!(s.points === prev.points && (s.ipponFor - s.ipponAgainst) === (prev.ipponFor - prev.ipponAgainst))) {
                              currentRank = i + 1;
                            }
                          }
                          const mc = medalColors[currentRank - 1];
                          return (
                            <tr key={s.id} style={{ background: currentRank <= 3 ? `${mc}08` : "transparent" }}>
                              <td style={{ ...S.td, fontWeight: 700, color: mc || "#9CA3AF" }}>{currentRank <= 3 ? medals[currentRank - 1] : currentRank}</td>
                              <td style={{ ...S.td, fontWeight: 700, color: "#fff" }}>{s.name}</td>
                              <td style={{ ...S.td, fontSize: "11px" }}>{s.dojo}</td>
                              <td style={{ ...S.td, textAlign: "center", color: "#22C55E" }}>{s.wins}</td>
                              <td style={{ ...S.td, textAlign: "center", color: "#EF4444" }}>{s.losses}</td>
                              <td style={{ ...S.td, textAlign: "center" }}>{s.draws}</td>
                              <td style={{ ...S.td, textAlign: "center" }}>{s.ipponFor}-{s.ipponAgainst}</td>
                              <td style={{ ...S.td, textAlign: "center", fontWeight: 700, color: "#F59E0B" }}>{s.points}</td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                  {/* Match list */}
                  <div style={{ marginTop: "8px" }}>
                    <div style={{ fontSize: "12px", fontWeight: 700, color: "#9CA3AF", marginBottom: "6px" }}>リーグ決勝 対戦結果</div>
                    {lfMatches.map(m => (
                      <div key={m.id} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 10px", marginBottom: "4px", borderRadius: "6px", background: m.status === "completed" ? "rgba(244,114,182,0.04)" : m.status === "active" ? "rgba(239,68,68,0.06)" : "rgba(255,255,255,0.02)", border: `1px solid ${m.status === "completed" ? "rgba(244,114,182,0.1)" : "rgba(255,255,255,0.05)"}` }}>
                        <span style={{ fontSize: "10px", color: "#F472B6", minWidth: "30px", fontWeight: 700 }}>決勝</span>
                        <span style={{ flex: 1, fontSize: "12px", fontWeight: m.winnerId === m.playerA?.id ? 700 : 400, color: m.winnerId === m.playerA?.id ? "#22C55E" : "#D1D5DB" }}>{m.playerA?.name}</span>
                        <span style={{ fontSize: "13px", fontWeight: 700, color: "#fff", minWidth: "50px", textAlign: "center" }}>
                          {m.status === "completed" ? `${m.scoreA} - ${m.scoreB}` : "vs"}
                        </span>
                        <span style={{ flex: 1, fontSize: "12px", textAlign: "right", fontWeight: m.winnerId === m.playerB?.id ? 700 : 400, color: m.winnerId === m.playerB?.id ? "#22C55E" : "#D1D5DB" }}>{m.playerB?.name}</span>
                        {m.status === "completed" ? (
                          <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                            <span style={S.badge(m.resultType === RESULT.DRAW ? "#F59E0B" : "#22C55E")}>
                              {m.resultType === RESULT.DRAW ? "引分" : "完了"}
                            </span>
                            <button style={{ ...S.btn("#4B5563", "sm"), padding: "3px 6px", fontSize: "9px" }} onClick={() => setRecordingMatch(m)}>修正</button>
                          </div>
                        ) : m.status === "active" ? (
                          <button style={S.btn("#EF4444", "sm")} onClick={() => setRecordingMatch(m)}>入力</button>
                        ) : (
                          <button style={S.btn("#4B5563", "sm")} onClick={() => activateMatch(m.id)}>開始</button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
            {tournamentData[selectedCat] && (
              <div style={{ marginTop: "8px" }}>
                <div style={{ fontSize: "12px", fontWeight: 700, color: "#9CA3AF", marginBottom: "6px" }}>
                  {PHASE_LABELS[catPhases[selectedCat]]} トーナメント表
                </div>
                <BracketView matches={allMatches.filter(m => m.categoryId === selectedCat && m.type === "tournament")} totalRounds={tournamentData[selectedCat].totalRounds} />

                {/* Tournament match list with action buttons */}
                <div style={{ marginTop: "10px", fontSize: "12px", fontWeight: 700, color: "#9CA3AF", marginBottom: "6px" }}>試合一覧</div>
                {allMatches.filter(m => m.categoryId === selectedCat && m.type === "tournament" && !m.isBye).map(m => (
                  <div key={m.id} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 10px", marginBottom: "4px", borderRadius: "6px", background: m.isThirdPlace ? "rgba(245,158,11,0.06)" : m.status === "completed" ? "rgba(34,197,94,0.04)" : m.status === "active" ? "rgba(239,68,68,0.06)" : "rgba(255,255,255,0.02)", border: `1px solid ${m.isThirdPlace ? "rgba(245,158,11,0.15)" : m.status === "completed" ? "rgba(34,197,94,0.1)" : "rgba(255,255,255,0.05)"}` }}>
                    <span style={{ fontSize: "10px", color: m.isThirdPlace ? "#F59E0B" : "#9CA3AF", minWidth: "50px", fontWeight: m.isThirdPlace ? 700 : 400 }}>
                      {m.isThirdPlace ? "🥉3位" : `R${m.round}-${m.position + 1}`}
                    </span>
                    <span style={{ flex: 1, fontSize: "12px", fontWeight: m.winnerId === m.playerA?.id ? 700 : 400, color: m.winnerId === m.playerA?.id ? "#22C55E" : m.playerA ? "#D1D5DB" : "#4B5563" }}>{m.playerA?.name || "（未定）"}</span>
                    <span style={{ fontSize: "13px", fontWeight: 700, color: "#fff", minWidth: "50px", textAlign: "center" }}>
                      {m.status === "completed" ? `${m.scoreA} - ${m.scoreB}` : "vs"}
                    </span>
                    <span style={{ flex: 1, fontSize: "12px", textAlign: "right", fontWeight: m.winnerId === m.playerB?.id ? 700 : 400, color: m.winnerId === m.playerB?.id ? "#22C55E" : m.playerB ? "#D1D5DB" : "#4B5563" }}>{m.playerB?.name || "（未定）"}</span>
                    {m.status === "completed" ? (
                      <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                        <span style={S.badge("#22C55E")}>完了</span>
                        <button style={{ ...S.btn("#4B5563", "sm"), padding: "3px 6px", fontSize: "9px" }} onClick={() => setRecordingMatch(m)}>修正</button>
                      </div>
                    ) : m.status === "active" ? (
                      <button style={S.btn("#EF4444", "sm")} onClick={() => setRecordingMatch(m)}>入力</button>
                    ) : m.playerA && m.playerB ? (
                      <button style={S.btn("#4B5563", "sm")} onClick={() => activateMatch(m.id)}>開始</button>
                    ) : (
                      <span style={{ fontSize: "10px", color: "#4B5563" }}>待機</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Next Phase Modal */}
      {nextPhaseModal && (
        <NextPhaseModal catId={nextPhaseModal.catId} currentPhase={nextPhaseModal.currentPhase}
          defaultAdvance={catAdvanceCounts[nextPhaseModal.catId] || 1}
          defaultThirdPlace={catThirdPlace[nextPhaseModal.catId] !== false}
          onClose={() => setNextPhaseModal(null)}
          onSelect={(phase, count, hasTP) => advancePhase(nextPhaseModal.catId, phase, count, hasTP)} />
      )}

      {/* Revert Phase Confirmation */}
      {confirmRevert && (
        <div style={S.overlay} onClick={() => setConfirmRevert(null)}>
          <div style={{ ...S.modal, maxWidth: "400px" }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: "16px", fontWeight: 700, color: "#F59E0B", marginBottom: "12px" }}>⚠ ステージを戻しますか？</div>
            <div style={{ fontSize: "13px", color: "#D1D5DB", marginBottom: "6px" }}>
              <strong>{CATEGORIES.find(c => c.id === confirmRevert)?.label}</strong>
            </div>
            <div style={{ fontSize: "12px", color: "#9CA3AF", marginBottom: "16px" }}>
              現在の「{PHASE_LABELS[catPhases[confirmRevert]]}」のデータを削除し、前のリーグ戦に戻します。この操作は取り消せません。
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
              <button style={S.btn("#4B5563")} onClick={() => setConfirmRevert(null)}>キャンセル</button>
              <button style={S.btn("#F59E0B")} onClick={() => { revertPhase(confirmRevert); setConfirmRevert(null); }}>
                戻す
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // ==========================================
  // REFEREE
  // ==========================================
  const RefereePage = () => {
    const vCats = Object.entries(venueAssignments).filter(([_, v]) => v === refereeVenue).map(([c]) => c);
    const vMatches = allMatches.filter(m => vCats.includes(m.categoryId) && !m.isBye);
    const activeMatch = vMatches.find(m => m.status === "active");
    // Sort: 3rd place before final, then by round ascending
    const pendingMatches = vMatches
      .filter(m => m.status === "pending" && m.playerA && m.playerB)
      .sort((a, b) => {
        // 3rd place matches first (before final of same category)
        if (a.isThirdPlace && !b.isThirdPlace) return -1;
        if (!a.isThirdPlace && b.isThirdPlace) return 1;
        // Then by round (lower round first)
        return (a.round || 0) - (b.round || 0);
      });
    const venue = VENUES.find(v => v.id === refereeVenue);

    return (
      <div>
        <div style={{ display: "flex", gap: "6px", marginBottom: "16px" }}>
          {VENUES.map(v => (
            <button key={v.id} style={{ ...S.btn(v.id === refereeVenue ? v.color : "#374151"), flex: 1, justifyContent: "center", padding: "10px", fontSize: "13px" }}
              onClick={() => setRefereeVenue(v.id)}>{v.name}</button>
          ))}
        </div>
        <div style={{ ...S.card, borderColor: `${venue?.color}30`, borderWidth: "2px" }}>
          <div style={S.cardTitle}>
            <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: venue?.color, display: "inline-block", boxShadow: activeMatch ? `0 0 10px ${venue?.color}` : "none" }} />
            現在の試合 — {venue?.name}
          </div>
          {activeMatch ? (
            <div style={{ textAlign: "center", padding: "16px 0" }}>
              {/* Category + Group label - large and clear */}
              <div style={{
                display: "inline-block", padding: "6px 20px", borderRadius: "8px", marginBottom: "12px",
                background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
              }}>
                <div style={{ fontSize: "16px", fontWeight: 800, color: "#fff" }}>
                  {CATEGORIES.find(c => c.id === activeMatch.categoryId)?.label}
                </div>
                <div style={{ fontSize: "14px", fontWeight: 700, color: matchTypeColor(activeMatch), marginTop: "2px" }}>
                  {activeMatch.isThirdPlace
                    ? "🥉 3位決定戦"
                    : activeMatch.type === "league"
                    ? `リーグ戦 ${String.fromCharCode(65 + (activeMatch.groupIndex || 0))}グループ`
                    : `🏆 ${matchTypeLabel(activeMatch, tournamentData)}`}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "16px" }}>
                <div style={{ flex: 1, maxWidth: "200px", padding: "16px 12px", borderRadius: "10px", border: `2px solid ${RED}40`, background: `${RED}08`, textAlign: "center" }}>
                  <div style={{ fontSize: "10px", color: RED, fontWeight: 700, marginBottom: "4px" }}>赤</div>
                  <div style={{ fontSize: "18px", fontWeight: 700, color: "#fff" }}>{activeMatch.playerA?.name}</div>
                  <div style={{ fontSize: "10px", color: "#9CA3AF", marginTop: "2px" }}>{activeMatch.playerA?.dojo}</div>
                </div>
                <div style={{ fontSize: "22px", fontWeight: 800, color: "#4B5563" }}>VS</div>
                <div style={{ flex: 1, maxWidth: "200px", padding: "16px 12px", borderRadius: "10px", border: `2px solid ${WHITE_BORDER}`, background: WHITE_BG, textAlign: "center" }}>
                  <div style={{ fontSize: "10px", color: WHITE_PLAYER, fontWeight: 700, marginBottom: "4px" }}>白</div>
                  <div style={{ fontSize: "18px", fontWeight: 700, color: "#fff" }}>{activeMatch.playerB?.name}</div>
                  <div style={{ fontSize: "10px", color: "#9CA3AF", marginTop: "2px" }}>{activeMatch.playerB?.dojo}</div>
                </div>
              </div>
              <button style={{ ...S.btn("#22C55E", "lg"), marginTop: "16px", padding: "12px 40px", fontSize: "15px" }}
                onClick={() => setRecordingMatch(activeMatch)}>📝 試合結果を入力</button>
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "30px", color: "#6B7280" }}>
              {pendingMatches.length > 0 ? (<>
                <div style={{ marginBottom: "10px" }}>次の試合を開始してください</div>
                <button style={S.btn(venue?.color || "#B91C1C")} onClick={() => activateMatch(pendingMatches[0].id)}>▶ 次の試合を開始</button>
              </>) : "このコートの試合は全て完了、または未割当です"}
            </div>
          )}
        </div>
        <div style={S.card}>
          <div style={S.cardTitle}>次の試合予定（{pendingMatches.length}試合）</div>
          {pendingMatches.slice(0, 8).map(m => (
            <div key={m.id} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 10px", marginBottom: "4px", borderRadius: "6px",
              background: m.isThirdPlace ? "rgba(245,158,11,0.04)" : "rgba(255,255,255,0.02)",
              border: `1px solid ${m.isThirdPlace ? "rgba(245,158,11,0.12)" : "rgba(255,255,255,0.05)"}` }}>
              <div style={{ minWidth: "120px" }}>
                <div style={{ fontSize: "11px", fontWeight: 600, color: "#fff" }}>
                  {CATEGORIES.find(c => c.id === m.categoryId)?.label}
                </div>
                <div style={{ fontSize: "10px", fontWeight: 700, color: matchTypeColor(m) }}>
                  {m.isThirdPlace ? "🥉 3位決定戦" : m.type === "league"
                    ? `${String.fromCharCode(65 + (m.groupIndex || 0))}グループ`
                    : `🏆 ${matchTypeLabel(m, tournamentData)}`}
                </div>
              </div>
              <span style={{ flex: 1, textAlign: "center", fontWeight: 600, color: "#fff", fontSize: "12px" }}>{m.playerA?.name} vs {m.playerB?.name}</span>
              {!activeMatch && <button style={S.btn("#4B5563", "sm")} onClick={() => activateMatch(m.id)}>開始</button>}
            </div>
          ))}
          {pendingMatches.length === 0 && <div style={{ color: "#6B7280", fontSize: "12px" }}>待機中の試合なし</div>}
        </div>
        {/* Completed matches - with edit button */}
        {(() => {
          const completedVenueMatches = vMatches.filter(m => m.status === "completed" && !m.isBye);
          if (completedVenueMatches.length === 0) return null;
          return (
            <div style={S.card}>
              <div style={S.cardTitle}>完了した試合（{completedVenueMatches.length}試合）</div>
              {completedVenueMatches.slice(-10).reverse().map(m => (
                <div key={m.id} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 10px", marginBottom: "4px", borderRadius: "6px", background: m.isThirdPlace ? "rgba(245,158,11,0.04)" : "rgba(34,197,94,0.03)", border: `1px solid ${m.isThirdPlace ? "rgba(245,158,11,0.1)" : "rgba(34,197,94,0.08)"}` }}>
                  <div style={{ minWidth: "100px" }}>
                    <div style={{ fontSize: "10px", fontWeight: 600, color: "#D1D5DB" }}>
                      {CATEGORIES.find(c => c.id === m.categoryId)?.label}
                    </div>
                    <div style={{ fontSize: "9px", fontWeight: 700, color: matchTypeColor(m) }}>
                      {m.isThirdPlace ? "🥉 3位決定戦" : m.type === "league"
                        ? `${String.fromCharCode(65 + (m.groupIndex || 0))}グループ`
                        : `🏆 ${matchTypeLabel(m, tournamentData)}`}
                    </div>
                  </div>
                  <span style={{ flex: 1, fontSize: "12px", fontWeight: m.winnerId === m.playerA?.id ? 700 : 400, color: m.winnerId === m.playerA?.id ? "#22C55E" : "#D1D5DB" }}>{m.playerA?.name}</span>
                  <span style={{ fontSize: "13px", fontWeight: 700, color: "#fff", minWidth: "50px", textAlign: "center" }}>{m.scoreA} - {m.scoreB}</span>
                  <span style={{ flex: 1, fontSize: "12px", textAlign: "right", fontWeight: m.winnerId === m.playerB?.id ? 700 : 400, color: m.winnerId === m.playerB?.id ? "#22C55E" : "#D1D5DB" }}>{m.playerB?.name}</span>
                  <button style={{ ...S.btn("#4B5563", "sm"), padding: "4px 8px", fontSize: "10px" }} onClick={() => setRecordingMatch(m)}>修正</button>
                </div>
              ))}
            </div>
          );
        })()}
      </div>
    );
  };

  // ==========================================
  // MONITOR
  // ==========================================
  const MonitorPage = () => (
    <div>
      <div style={{ ...S.card, marginBottom: "12px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
          <span style={{ fontWeight: 700, color: "#fff", fontSize: "14px" }}>大会進行状況</span>
          <span style={{ color: "#F59E0B", fontWeight: 700 }}>{progressPct}%</span>
        </div>
        <Progress pct={progressPct} color="#F59E0B" />
        <div style={{ fontSize: "11px", color: "#9CA3AF", marginTop: "4px" }}>完了: {completedMatches}/{totalMatches}試合</div>
      </div>
      <div style={S.grid2}>
        {VENUES.map(venue => {
          const vCats = Object.entries(venueAssignments).filter(([_, v]) => v === venue.id).map(([c]) => c);
          const vM = allMatches.filter(m => vCats.includes(m.categoryId) && !m.isBye);
          const active = vM.find(m => m.status === "active");
          const done = vM.filter(m => m.status === "completed").length;
          const total = vM.length;
          const pct = total > 0 ? Math.round((done / total) * 100) : 0;
          return (
            <div key={venue.id} style={{ ...S.card, borderColor: `${venue.color}25`, borderWidth: "2px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: venue.color, display: "inline-block", boxShadow: active ? `0 0 10px ${venue.color}` : "none" }} />
                  <span style={{ fontWeight: 700, color: "#fff", fontSize: "14px" }}>{venue.name}</span>
                </div>
                <span style={{ fontSize: "11px", color: "#9CA3AF" }}>{pct}%</span>
              </div>
              <Progress pct={pct} color={venue.color} />
              <div style={{ fontSize: "10px", color: "#9CA3AF", margin: "4px 0 10px" }}>{done}/{total}試合完了</div>
              {active ? (
                <div style={{ background: `${venue.color}0A`, border: `1px solid ${venue.color}25`, borderRadius: "8px", padding: "10px" }}>
                  <div style={{ fontSize: "10px", color: venue.color, fontWeight: 600, marginBottom: "2px" }}>
                    ▶ {CATEGORIES.find(c => c.id === active.categoryId)?.label}
                  </div>
                  <div style={{ fontSize: "9px", color: active.type === "league" ? "#60A5FA" : "#FCA5A5", fontWeight: 600, marginBottom: "4px" }}>
                    {active.type === "league"
                      ? `${String.fromCharCode(65 + (active.groupIndex || 0))}グループ`
                      : `トーナメント`}
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <span style={{ fontWeight: 700, color: RED, fontSize: "14px" }}>{active.playerA?.name}</span>
                    <span style={{ margin: "0 8px", color: "#4B5563", fontWeight: 800 }}>VS</span>
                    <span style={{ fontWeight: 700, color: WHITE_PLAYER, fontSize: "14px" }}>{active.playerB?.name}</span>
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: "center", padding: "14px", color: "#6B7280", fontSize: "12px" }}>
                  {total === 0 ? "未割当" : done === total ? "✓ 全試合終了" : "待機中"}
                </div>
              )}
              <div style={{ marginTop: "8px", display: "flex", gap: "3px", flexWrap: "wrap" }}>
                {vCats.map(catId => <span key={catId} style={{ padding: "1px 6px", borderRadius: "3px", fontSize: "9px", background: "rgba(255,255,255,0.04)", color: "#9CA3AF", border: "1px solid rgba(255,255,255,0.06)" }}>{CATEGORIES.find(c => c.id === catId)?.label}</span>)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  // ==========================================
  // SPECTATOR
  // ==========================================
  const SpectatorPage = () => {
    const [specCat, setSpecCat] = useState(null);
    return (
      <div>
        <div style={{ ...S.card, textAlign: "center", padding: "12px" }}>
          <div style={{ fontSize: "13px", color: "#9CA3AF" }}>📱 保護者・観客用ビュー</div>
          <div style={{ fontSize: "10px", color: "#6B7280" }}>30秒ごとに自動更新（本番時）</div>
        </div>
        <div style={S.card}>
          <div style={S.cardTitle}>現在進行中の試合</div>
          {allMatches.filter(m => m.status === "active").length === 0 ? (
            <div style={{ color: "#6B7280", textAlign: "center", padding: "16px" }}>現在進行中の試合はありません</div>
          ) : (
            <div style={S.grid2}>
              {VENUES.map(v => {
                const active = allMatches.find(m => m.status === "active" && Object.entries(venueAssignments).some(([c, vid]) => vid === v.id && c === m.categoryId));
                if (!active) return null;
                return (
                  <div key={v.id} style={{ padding: "10px", borderRadius: "8px", background: `${v.color}08`, border: `1px solid ${v.color}20` }}>
                    <div style={{ fontSize: "10px", color: v.color, fontWeight: 600, marginBottom: "4px" }}>{v.name} — {CATEGORIES.find(c => c.id === active.categoryId)?.label}</div>
                    <div style={{ textAlign: "center", fontSize: "13px", fontWeight: 600 }}>
                      <span style={{ color: RED }}>{active.playerA?.name}</span>
                      <span style={{ margin: "0 6px", color: "#6B7280" }}>VS</span>
                      <span style={{ color: WHITE_PLAYER }}>{active.playerB?.name}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div style={S.card}>
          <div style={S.cardTitle}>カテゴリ選択</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
            {activeCats.map(c => (
              <button key={c.id} onClick={() => setSpecCat(specCat === c.id ? null : c.id)} style={{
                padding: "5px 10px", borderRadius: "6px", fontSize: "11px", fontWeight: 600, cursor: "pointer",
                border: `1px solid ${specCat === c.id ? "#B91C1C" : "rgba(255,255,255,0.08)"}`,
                background: specCat === c.id ? "rgba(185,28,28,0.12)" : "rgba(255,255,255,0.03)",
                color: specCat === c.id ? "#FCA5A5" : "#D1D5DB",
              }}>
                {c.label}
                <span style={{ marginLeft: "4px", ...S.phaseTag(c.phase), padding: "1px 5px", fontSize: "9px" }}>{PHASE_LABELS[c.phase]?.replace("（","").replace("）","").substring(0,4)}</span>
              </button>
            ))}
          </div>
        </div>
        {specCat && (
          <div style={S.card}>
            <div style={S.cardTitle}>{CATEGORIES.find(c => c.id === specCat)?.label}</div>
            {/* Final Rankings - tournament or league final */}
            {(() => {
              const tMatches = allMatches.filter(m => m.categoryId === specCat && m.type === "tournament");
              const tRankings = getFinalRankings(tMatches);
              if (tRankings) return <FinalRankings rankings={tRankings} />;
              const lfMatches = allMatches.filter(m => m.categoryId === specCat && m.type === "league" && m.phaseKey === PHASE_TYPES.LEAGUE_FINAL);
              const lfPlayers = leagueGroups[`${specCat}_final`]?.[0];
              if (lfPlayers && lfMatches.length > 0) {
                const lfRankings = getLeagueFinalRankings(lfPlayers, lfMatches);
                if (lfRankings) return <FinalRankings rankings={lfRankings} />;
              }
              return null;
            })()}
            {/* Preliminary league results */}
            {(() => {
              const prelimMatches = allMatches.filter(m => m.categoryId === specCat && m.type === "league" && m.phaseKey === PHASE_TYPES.LEAGUE);
              const groups = leagueGroups[specCat] || [];
              if (prelimMatches.length === 0 || groups.length === 0) return null;
              return groups.map((group, gi) => {
                const gM = prelimMatches.filter(m => m.groupIndex === gi);
                return <StandingsTable key={gi} standings={calcStandings(group, gM)} groupIdx={gi} advanceCount={catAdvanceCounts[specCat] || 1} />;
              });
            })()}
            {/* League Final standings */}
            {(() => {
              const lfMatches = allMatches.filter(m => m.categoryId === specCat && m.type === "league" && m.phaseKey === PHASE_TYPES.LEAGUE_FINAL);
              const lfPlayers = leagueGroups[`${specCat}_final`]?.[0];
              if (!lfPlayers || lfMatches.length === 0) return null;
              const standings = calcStandings(lfPlayers, lfMatches);
              const medals = ["🥇", "🥈", "🥉"];
              const medalColors = ["#FFD700", "#C0C0C0", "#CD7F32"];
              return (
                <div style={{ marginBottom: "8px" }}>
                  <div style={{ fontSize: "12px", fontWeight: 700, color: "#F472B6", marginBottom: "6px" }}>🏆 リーグ決勝</div>
                  <table style={S.table}>
                    <thead><tr>
                      <th style={{ ...S.th, width: "30px" }}>順位</th><th style={S.th}>選手名</th><th style={S.th}>所属</th>
                      <th style={{ ...S.th, textAlign: "center" }}>勝</th><th style={{ ...S.th, textAlign: "center" }}>敗</th>
                      <th style={{ ...S.th, textAlign: "center" }}>分</th><th style={{ ...S.th, textAlign: "center" }}>本数</th>
                      <th style={{ ...S.th, textAlign: "center" }}>勝点</th>
                    </tr></thead>
                    <tbody>
                      {(() => {
                        let cr = 1;
                        return standings.map((s, i) => {
                          if (i > 0) {
                            const prev = standings[i - 1];
                            if (!(s.points === prev.points && (s.ipponFor - s.ipponAgainst) === (prev.ipponFor - prev.ipponAgainst))) cr = i + 1;
                          }
                          const mc = medalColors[cr - 1];
                          return (
                            <tr key={s.id} style={{ background: cr <= 3 ? `${mc}08` : "transparent" }}>
                              <td style={{ ...S.td, fontWeight: 700, color: mc || "#9CA3AF" }}>{cr <= 3 ? medals[cr - 1] : cr}</td>
                              <td style={{ ...S.td, fontWeight: 700, color: "#fff" }}>{s.name}</td>
                              <td style={{ ...S.td, fontSize: "11px" }}>{s.dojo}</td>
                              <td style={{ ...S.td, textAlign: "center", color: "#22C55E" }}>{s.wins}</td>
                              <td style={{ ...S.td, textAlign: "center", color: "#EF4444" }}>{s.losses}</td>
                              <td style={{ ...S.td, textAlign: "center" }}>{s.draws}</td>
                              <td style={{ ...S.td, textAlign: "center" }}>{s.ipponFor}-{s.ipponAgainst}</td>
                              <td style={{ ...S.td, textAlign: "center", fontWeight: 700, color: "#F59E0B" }}>{s.points}</td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </div>
              );
            })()}
            {tournamentData[specCat] && (
              <BracketView matches={allMatches.filter(m => m.categoryId === specCat && m.type === "tournament")} totalRounds={tournamentData[specCat].totalRounds} />
            )}
          </div>
        )}
      </div>
    );
  };

  // ==========================================
  // RENDER
  // ==========================================
  return (
    <div style={S.app}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;600;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { margin: 0; background: #0B0F19; }
        ::-webkit-scrollbar { width: 5px; height: 5px; }
        ::-webkit-scrollbar-track { background: rgba(255,255,255,0.02); }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 3px; }
        button:hover { opacity: 0.88; }
        button:active { transform: scale(0.98); }
        select option { background: #1F2937; color: #D6DCE8; }
      `}</style>
      <header style={S.header}>
        <div>
          <div style={S.title}>🥋 日本拳法 孝徳会 大会運営システム</div>
          <div style={S.sub}>Tournament Management v2.2 — カテゴリ別開始形式選択対応</div>
        </div>
        <nav style={S.nav}>
          <button style={S.navBtn(page === "admin")} onClick={() => setPage("admin")}>⚙ 管理</button>
          <button style={S.navBtn(page === "referee")} onClick={() => setPage("referee")}>🏁 記録係</button>
          <button style={S.navBtn(page === "monitor")} onClick={() => setPage("monitor")}>📺 モニター</button>
          <button style={S.navBtn(page === "spectator")} onClick={() => setPage("spectator")}>👁 観覧</button>
        </nav>
      </header>
      <main style={S.main}>
        {page === "admin" && <AdminPage />}
        {page === "referee" && <RefereePage />}
        {page === "monitor" && <MonitorPage />}
        {page === "spectator" && <SpectatorPage />}
      </main>
      {recordingMatch && <MatchRecordModal match={recordingMatch} onClose={() => setRecordingMatch(null)} onSubmit={submitMatchResult} />}
    </div>
  );
}

// ==========================================
// 日本拳法大会運営システム — 定数定義
// ==========================================

import type { Category, Venue, PhaseType, StartFormat, NextPhaseOption } from './types';
import { generateId } from './uuid';

// --- デフォルトカテゴリ（20区分） ---
// 全学年・性別を個別に定義。主催者が応募人数に応じて動的に統合・分割できる
export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'infant', label: '幼年の部', group: '幼年', gender: 'mixed', menType: 'なし', session: 'am', isTeam: false },
  { id: 'e1m', label: '小学1年 男子', group: '小学', gender: 'male', menType: 'なし', session: 'am', isTeam: false },
  { id: 'e1f', label: '小学1年 女子', group: '小学', gender: 'female', menType: 'なし', session: 'am', isTeam: false },
  { id: 'e2m', label: '小学2年 男子', group: '小学', gender: 'male', menType: 'なし', session: 'am', isTeam: false },
  { id: 'e2f', label: '小学2年 女子', group: '小学', gender: 'female', menType: 'なし', session: 'am', isTeam: false },
  { id: 'e3m', label: '小学3年 男子', group: '小学', gender: 'male', menType: 'なし', session: 'am', isTeam: false },
  { id: 'e3f', label: '小学3年 女子', group: '小学', gender: 'female', menType: 'なし', session: 'am', isTeam: false },
  { id: 'e4m', label: '小学4年 男子', group: '小学', gender: 'male', menType: '少年面', session: 'am', isTeam: false },
  { id: 'e4f', label: '小学4年 女子', group: '小学', gender: 'female', menType: '少年面', session: 'am', isTeam: false },
  { id: 'e5m', label: '小学5年 男子', group: '小学', gender: 'male', menType: '少年面', session: 'am', isTeam: false },
  { id: 'e5f', label: '小学5年 女子', group: '小学', gender: 'female', menType: '少年面', session: 'am', isTeam: false },
  { id: 'e6m', label: '小学6年 男子', group: '小学', gender: 'male', menType: '少年面', session: 'am', isTeam: false },
  { id: 'e6f', label: '小学6年 女子', group: '小学', gender: 'female', menType: '少年面', session: 'am', isTeam: false },
  { id: 'm1m', label: '中学1年 男子', group: '中学', gender: 'male', menType: '少年面', session: 'am', isTeam: false },
  { id: 'm1f', label: '中学1年 女子', group: '中学', gender: 'female', menType: '少年面', session: 'am', isTeam: false },
  { id: 'm2m', label: '中学2年 男子', group: '中学', gender: 'male', menType: '少年面', session: 'am', isTeam: false },
  { id: 'm2f', label: '中学2年 女子', group: '中学', gender: 'female', menType: '少年面', session: 'am', isTeam: false },
  { id: 'm3', label: '中学3年', group: '中学', gender: 'mixed', menType: '大人面', session: 'am', isTeam: false },
  { id: 'hsm', label: '高校生男子', group: '高校', gender: 'male', menType: '大人面', session: 'am', isTeam: false },
  { id: 'wopen', label: '一般女子', group: '一般', gender: 'female', menType: '大人面', session: 'am', isTeam: false },
];

// --- 会場（4コート） ---
export const VENUES: Venue[] = [
  { id: 'A', name: 'Aコート', color: '#E74C3C' },
  { id: 'B', name: 'Bコート', color: '#3498DB' },
  { id: 'C', name: 'Cコート', color: '#2ECC71' },
  { id: 'D', name: 'Dコート', color: '#F39C12' },
];

// --- フェーズ定数 ---
export const PHASE_TYPES = {
  SETUP: 'setup' as PhaseType,
  LEAGUE: 'league' as PhaseType,
  LEAGUE_FINAL: 'league_final' as PhaseType,
  PRE_TOURNAMENT: 'pre_tournament' as PhaseType,
  FINAL_TOURNAMENT: 'final_tournament' as PhaseType,
  AWAITING_FINALS: 'awaiting_finals' as PhaseType,
  DONE: 'done' as PhaseType,
};

// --- フェーズラベル ---
export const PHASE_LABELS: Record<PhaseType, string> = {
  setup: '準備中',
  league: 'リーグ戦',
  league_final: 'リーグ決勝',
  pre_tournament: '予選トーナメント',
  final_tournament: '決勝トーナメント',
  awaiting_finals: '決勝待ち',
  done: '完了',
};

// --- フェーズカラー ---
export const PHASE_COLORS: Record<PhaseType, { bg: string; text: string; border: string }> = {
  setup: { bg: '#1C2B1C', text: '#86EFAC', border: '#22C55E40' },
  league: { bg: '#1E3A5F', text: '#60A5FA', border: '#3B82F640' },
  league_final: { bg: '#3B1C3B', text: '#F472B6', border: '#EC489940' },
  pre_tournament: { bg: '#3B2A1C', text: '#FBBF24', border: '#F59E0B40' },
  final_tournament: { bg: '#3B1C1C', text: '#FCA5A5', border: '#EF444440' },
  awaiting_finals: { bg: '#2D1F3D', text: '#E879F9', border: '#A855F740' },
  done: { bg: '#1C2B1C', text: '#86EFAC', border: '#22C55E40' },
};

// --- 開始形式の選択肢 ---
export const START_FORMATS: StartFormat[] = [
  { value: 'league', label: 'リーグ戦', desc: '総当たり → 上位が次ステージへ', color: '#60A5FA' },
  { value: 'final_tournament', label: 'トーナメント', desc: '最初からトーナメント（人数が多い場合）', color: '#FCA5A5' },
  { value: 'pre_tournament', label: '予選トーナメント', desc: '予選トーナメント → 決勝トーナメント', color: '#FBBF24' },
];

// --- 次フェーズ選択肢 ---
export const NEXT_PHASE_OPTIONS: Record<string, NextPhaseOption[]> = {
  league: [
    { value: 'league_final', label: 'リーグ決勝に進む（総当たりで順位確定）' },
    { value: 'final_tournament', label: '決勝トーナメントに進む' },
  ],
  pre_tournament: [
    { value: 'final_tournament', label: '決勝トーナメントに進む' },
  ],
};

// --- 結果タイプ定数 ---
export const RESULT = {
  NORMAL: 'normal' as const,
  DRAW: 'draw' as const,
  DEFAULT_WIN: 'default_win' as const,
  DISQUALIFICATION: 'disqualification' as const,
};

// --- 色定数 ---
export const RED = '#EF4444';
export const WHITE_PLAYER = '#FFFFFF';
export const WHITE_BG = 'rgba(255,255,255,0.12)';
export const WHITE_BORDER = 'rgba(255,255,255,0.35)';

// --- サンプルデータ用 ---
export const DOJOS = ['孝徳会','大阪拳友会','神戸道場','京都拳法会','奈良道場','堺拳友会','姫路道場','和歌山拳法会','滋賀道場','尼崎拳友会','西宮道場','豊中拳法会','吹田道場','東大阪道場','枚方拳法会'];

// 苗字: [漢字, ふりがな]
const LN: [string, string][] = [
  ['田中','たなか'],['山田','やまだ'],['佐藤','さとう'],['鈴木','すずき'],['高橋','たかはし'],
  ['渡辺','わたなべ'],['伊藤','いとう'],['中村','なかむら'],['小林','こばやし'],['加藤','かとう'],
  ['吉田','よしだ'],['山本','やまもと'],['松本','まつもと'],['井上','いのうえ'],['木村','きむら'],
  ['林','はやし'],['斎藤','さいとう'],['清水','しみず'],['山口','やまぐち'],['森','もり'],
  ['池田','いけだ'],['橋本','はしもと'],['阿部','あべ'],['石川','いしかわ'],['前田','まえだ'],['藤田','ふじた'],
];
// 名前（男）: [漢字, ふりがな]
const FM: [string, string][] = [
  ['太郎','たろう'],['翔太','しょうた'],['健太','けんた'],['大輝','だいき'],['悠真','ゆうま'],
  ['蓮','れん'],['陽翔','はると'],['湊','みなと'],['颯太','そうた'],['大和','やまと'],
  ['樹','いつき'],['悠斗','ゆうと'],['拓海','たくみ'],['陸','りく'],['海翔','かいと'],['奏太','そうた'],
];
// 名前（女）: [漢字, ふりがな]
const FF: [string, string][] = [
  ['花子','はなこ'],['さくら','さくら'],['陽菜','ひな'],['結衣','ゆい'],['美咲','みさき'],
  ['凛','りん'],['心春','こはる'],['芽依','めい'],['結菜','ゆいな'],['葵','あおい'],
  ['莉子','りこ'],['美月','みつき'],['楓','かえで'],['彩花','あやか'],['真央','まお'],['七海','ななみ'],
];

const pick = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];

// サンプル選手データ生成
export const generateSamplePlayers = () => {
  const players: { id: string; name: string; nameKana: string; categoryId: string; dojo: string }[] = [];
  const counts: Record<string, number> = {
    infant: 6,
    e1m: 8, e1f: 4, e2m: 10, e2f: 4, e3m: 12, e3f: 6,
    e4m: 14, e4f: 8, e5m: 16, e5f: 5, e6m: 14, e6f: 5,
    m1m: 7, m1f: 4, m2m: 6, m2f: 4, m3: 6, hsm: 8, wopen: 5,
  };
  Object.entries(counts).forEach(([catId, count]) => {
    const cat = DEFAULT_CATEGORIES.find(c => c.id === catId);
    for (let i = 0; i < count; i++) {
      const isFemale = cat?.gender === 'female' || (cat?.gender === 'mixed' && Math.random() > 0.5);
      const ln = pick(LN);
      const fn = isFemale ? pick(FF) : pick(FM);
      players.push({
        id: generateId(),
        name: `${ln[0]} ${fn[0]}`,
        nameKana: `${ln[1]} ${fn[1]}`,
        categoryId: catId,
        dojo: pick(DOJOS),
      });
    }
  });
  return players;
};

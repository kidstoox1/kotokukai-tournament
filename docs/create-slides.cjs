const pptxgen = require("pptxgenjs");
const path = require("path");

const pres = new pptxgen();
pres.layout = "LAYOUT_16x9";
pres.author = "FREESTYLE CREATION";
pres.title = "日本拳法孝徳会 大会運営システム 打ち合わせ";

// --- Color palette ---
const C = {
  navy: "1E2761",
  darkNavy: "141C3D",
  ice: "CADCFC",
  white: "FFFFFF",
  lightGray: "F0F2F8",
  midGray: "8892B0",
  accent: "4A90D9",
  accentLight: "EAF0FB",
  text: "1E293B",
  textLight: "64748B",
  green: "2E7D32",
  greenBg: "E8F5E9",
  orange: "E65100",
  orangeBg: "FFF3E0",
  red: "C62828",
  yellowBg: "F57F17",
};

const makeShadow = () => ({
  type: "outer", blur: 6, offset: 2, angle: 135, color: "000000", opacity: 0.12,
});

const TOTAL = 12;

function addFooter(slide, num) {
  slide.addShape(pres.shapes.RECTANGLE, {
    x: 0, y: 5.2, w: 10, h: 0.425, fill: { color: C.navy },
  });
  slide.addText(`${num} / ${TOTAL}`, {
    x: 8.5, y: 5.2, w: 1, h: 0.425,
    fontSize: 9, color: C.ice, align: "center", valign: "middle", margin: 0,
  });
  slide.addText("FREESTYLE CREATION", {
    x: 0.5, y: 5.2, w: 3, h: 0.425,
    fontSize: 8, color: C.midGray, align: "left", valign: "middle", margin: 0,
  });
}

function addSectionHeader(slide, label) {
  slide.addShape(pres.shapes.RECTANGLE, {
    x: 0.5, y: 0.35, w: 0.08, h: 0.45, fill: { color: C.accent },
  });
  slide.addText(label, {
    x: 0.75, y: 0.35, w: 8.5, h: 0.45,
    fontSize: 22, fontFace: "Yu Gothic UI", bold: true, color: C.navy, margin: 0,
  });
}

// Badge helper: confirmed/question
function addBadge(slide, x, y, type) {
  const isConfirmed = type === "confirmed";
  slide.addShape(pres.shapes.RECTANGLE, {
    x, y, w: isConfirmed ? 1.2 : 1.0, h: 0.3,
    fill: { color: isConfirmed ? C.greenBg : C.orangeBg },
  });
  slide.addText(isConfirmed ? "確認済み" : "要確認", {
    x, y, w: isConfirmed ? 1.2 : 1.0, h: 0.3,
    fontSize: 10, fontFace: "Yu Gothic UI", bold: true,
    color: isConfirmed ? C.green : C.orange,
    align: "center", valign: "middle", margin: 0,
  });
}

// ============================================================
// SLIDE 1: Title
// ============================================================
{
  const s = pres.addSlide();
  s.background = { color: C.navy };
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0, y: 0, w: 10, h: 0.06, fill: { color: C.accent },
  });
  s.addText("日本拳法孝徳会", {
    x: 0.5, y: 1.1, w: 9, h: 0.6,
    fontSize: 16, fontFace: "Yu Gothic UI", color: C.ice, align: "center", charSpacing: 6,
  });
  s.addText("大会運営システム", {
    x: 0.5, y: 1.7, w: 9, h: 1.0,
    fontSize: 38, fontFace: "Yu Gothic UI", bold: true, color: C.white, align: "center",
  });
  s.addText("打ち合わせ資料", {
    x: 0.5, y: 2.7, w: 9, h: 0.6,
    fontSize: 20, fontFace: "Yu Gothic UI", color: C.ice, align: "center",
  });
  s.addShape(pres.shapes.LINE, {
    x: 3.5, y: 3.6, w: 3, h: 0, line: { color: C.accent, width: 1.5 },
  });
  s.addText("2026年3月16日", {
    x: 0.5, y: 3.9, w: 9, h: 0.5,
    fontSize: 14, fontFace: "Yu Gothic UI", color: C.midGray, align: "center",
  });
  s.addText("FREESTYLE CREATION", {
    x: 0.5, y: 4.4, w: 9, h: 0.4,
    fontSize: 10, fontFace: "Yu Gothic UI", color: C.midGray, align: "center",
  });
}

// ============================================================
// SLIDE 2: Agenda
// ============================================================
{
  const s = pres.addSlide();
  s.background = { color: C.white };
  addSectionHeader(s, "本日の議題");
  addFooter(s, 2);

  const items = [
    { num: "01", title: "個人戦ルール（確認済み）", desc: "リーグ予選 → 本戦の流れ、試合時間、引き分けルール" },
    { num: "02", title: "カテゴリ・組分け（一部要確認）", desc: "16カテゴリの確定構成と、組分け時の道場配慮" },
    { num: "03", title: "トーナメントのシード権（要確認）", desc: "固定シードかランダムか、同道場への配慮" },
    { num: "04", title: "成年団体戦ルール（確認済み）", desc: "3人1チーム+補欠2名、トーナメント形式" },
    { num: "05", title: "システム汎用化・収益化（相談）", desc: "他団体・他競技への展開について" },
  ];

  items.forEach((item, i) => {
    const yBase = 1.1 + i * 0.82;
    s.addShape(pres.shapes.RECTANGLE, {
      x: 0.5, y: yBase, w: 9, h: 0.7,
      fill: { color: i % 2 === 0 ? C.lightGray : C.white }, shadow: makeShadow(),
    });
    s.addShape(pres.shapes.OVAL, {
      x: 0.7, y: yBase + 0.1, w: 0.5, h: 0.5, fill: { color: C.navy },
    });
    s.addText(item.num, {
      x: 0.7, y: yBase + 0.1, w: 0.5, h: 0.5,
      fontSize: 14, fontFace: "Yu Gothic UI", bold: true, color: C.white,
      align: "center", valign: "middle", margin: 0,
    });
    s.addText(item.title, {
      x: 1.4, y: yBase + 0.02, w: 5, h: 0.38,
      fontSize: 15, fontFace: "Yu Gothic UI", bold: true, color: C.navy, margin: 0,
    });
    s.addText(item.desc, {
      x: 1.4, y: yBase + 0.36, w: 7.5, h: 0.3,
      fontSize: 11, fontFace: "Yu Gothic UI", color: C.textLight, margin: 0,
    });
  });
}

// ============================================================
// SLIDE 3: Current System Status
// ============================================================
{
  const s = pres.addSlide();
  s.background = { color: C.white };
  addSectionHeader(s, "現在のシステム状況");
  addFooter(s, 3);

  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.5, y: 1.0, w: 9, h: 0.5, fill: { color: C.greenBg },
  });
  s.addText("Phase 1 完了 - プロトタイプ完成済み（DBなし・ローカル動作）", {
    x: 0.7, y: 1.0, w: 8.6, h: 0.5,
    fontSize: 14, fontFace: "Yu Gothic UI", bold: true, color: C.green,
    align: "left", valign: "middle", margin: 0,
  });

  const views = [
    { title: "管理画面", desc: "カテゴリ設定\nコート割当\n一括開始" },
    { title: "記録係", desc: "試合入力\n本数/警告/引分\n結果修正" },
    { title: "モニター", desc: "4コート同時表示\n2x2グリッド\n進行率表示" },
    { title: "観覧ビュー", desc: "順位表閲覧\nトーナメント表\n最終結果" },
  ];

  views.forEach((v, i) => {
    const xBase = 0.5 + i * 2.35;
    s.addShape(pres.shapes.RECTANGLE, {
      x: xBase, y: 1.8, w: 2.1, h: 2.5,
      fill: { color: C.white }, shadow: makeShadow(),
    });
    s.addShape(pres.shapes.RECTANGLE, {
      x: xBase, y: 1.8, w: 2.1, h: 0.06, fill: { color: C.accent },
    });
    s.addText(v.title, {
      x: xBase + 0.15, y: 2.0, w: 1.8, h: 0.4,
      fontSize: 15, fontFace: "Yu Gothic UI", bold: true, color: C.navy, margin: 0,
    });
    s.addText(v.desc, {
      x: xBase + 0.15, y: 2.5, w: 1.8, h: 1.5,
      fontSize: 11, fontFace: "Yu Gothic UI", color: C.textLight, margin: 0,
    });
  });

  s.addText("技術: Next.js 15 + React 19 + TypeScript + Zustand + Tailwind CSS", {
    x: 0.5, y: 4.6, w: 9, h: 0.35,
    fontSize: 10, fontFace: "Yu Gothic UI", color: C.midGray, align: "center", margin: 0,
  });
}

// ============================================================
// SLIDE 4: Individual Match Rules (CONFIRMED)
// ============================================================
{
  const s = pres.addSlide();
  s.background = { color: C.white };
  addSectionHeader(s, "個人戦ルール（試合規定より確認済み）");
  addFooter(s, 4);
  addBadge(s, 8.3, 0.4, "confirmed");

  // Left: 予選リーグ
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.5, y: 1.0, w: 4.3, h: 2.3, fill: { color: C.lightGray }, shadow: makeShadow(),
  });
  s.addText("予選リーグ", {
    x: 0.7, y: 1.1, w: 3.9, h: 0.35,
    fontSize: 14, fontFace: "Yu Gothic UI", bold: true, color: C.navy, margin: 0,
  });
  s.addText([
    { text: "幼年~中学生: 1分00秒 3本勝負", options: { bullet: true, breakLine: true } },
    { text: "時間切れ1本先取 → 先取者の勝ち", options: { bullet: true, breakLine: true } },
    { text: "勝敗つかず → 引き分け（規約修正）", options: { bullet: true, breakLine: true } },
    { text: "警告2回 → 相手に1本", options: { bullet: true, breakLine: true } },
    { text: "同率順位: 勝数→負数→勝本数→負本数", options: { bullet: true } },
  ], {
    x: 0.7, y: 1.55, w: 3.9, h: 1.6,
    fontSize: 11, fontFace: "Yu Gothic UI", color: C.text, margin: 0, paraSpaceAfter: 4,
  });

  // Right: 本戦
  s.addShape(pres.shapes.RECTANGLE, {
    x: 5.2, y: 1.0, w: 4.4, h: 2.3, fill: { color: C.lightGray }, shadow: makeShadow(),
  });
  s.addText("本戦（リーグ戦・トーナメント戦）", {
    x: 5.4, y: 1.1, w: 4, h: 0.35,
    fontSize: 14, fontFace: "Yu Gothic UI", bold: true, color: C.navy, margin: 0,
  });
  s.addText([
    { text: "1分30秒 3本勝負", options: { bullet: true, breakLine: true } },
    { text: "引き分け → 1分00秒 延長戦", options: { bullet: true, breakLine: true } },
    { text: "それでも決着つかず → 判定", options: { bullet: true, breakLine: true } },
    { text: "本戦のみ延長は無制限1本勝負", options: { bullet: true } },
  ], {
    x: 5.4, y: 1.55, w: 4, h: 1.6,
    fontSize: 11, fontFace: "Yu Gothic UI", color: C.text, margin: 0, paraSpaceAfter: 4,
  });

  // Bottom: Phase progression
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.5, y: 3.6, w: 9, h: 1.3, fill: { color: C.white }, shadow: makeShadow(),
  });
  s.addText("試合進行フロー", {
    x: 0.7, y: 3.7, w: 8.6, h: 0.3,
    fontSize: 13, fontFace: "Yu Gothic UI", bold: true, color: C.navy, margin: 0,
  });
  s.addText([
    { text: "2組の場合: 各組1位同士で決勝、2位同士で3位決定戦", options: { bullet: true, breakLine: true } },
    { text: "3組の場合: 各組1位が決勝リーグ（本戦）→ 優勝・準優勝・3位", options: { bullet: true, breakLine: true } },
    { text: "4組の場合: 各組1位がトーナメント（決勝戦＋3位決定戦）", options: { bullet: true, breakLine: true } },
    { text: "各学年エントリー5名より試合成立。不成立は事前連絡＋返金", options: { bullet: true } },
  ], {
    x: 0.7, y: 4.05, w: 8.6, h: 0.8,
    fontSize: 11, fontFace: "Yu Gothic UI", color: C.text, margin: 0, paraSpaceAfter: 3,
  });
}

// ============================================================
// SLIDE 5: Categories (CONFIRMED from brackets)
// ============================================================
{
  const s = pres.addSlide();
  s.background = { color: C.white };
  addSectionHeader(s, "カテゴリ構成（対戦表より確認済み）");
  addFooter(s, 5);
  addBadge(s, 8.3, 0.4, "confirmed");

  const cats = [
    ["幼年 男女", "面なし", "C"],
    ["小学1年 男子", "面なし", "C"],
    ["小学2年 男子", "面なし", "C"],
    ["小学3年 男子", "面なし", "B"],
    ["小学1・2年 女子", "面なし", "A"],
    ["小学3年 女子", "面なし", "A"],
    ["小学4年 男子", "少年面", "D"],
    ["小学4年 女子", "少年面", "D"],
    ["小学5年 男子", "少年面", "B"],
    ["小学5・6年 女子", "少年面", "D"],
    ["小学6年 男子", "少年面", "B"],
    ["中学1・2年 男子", "少年面", "A"],
    ["中学1・2年 女子", "少年面", "A"],
    ["中学3年", "大人面", "-"],
    ["高校生男子", "-", "-"],
    ["一般女子", "-", "-"],
  ];

  const headerRow = [
    { text: "カテゴリ", options: { fill: { color: C.navy }, color: C.white, bold: true, fontSize: 8, fontFace: "Yu Gothic UI" } },
    { text: "面", options: { fill: { color: C.navy }, color: C.white, bold: true, fontSize: 8, fontFace: "Yu Gothic UI" } },
    { text: "コート", options: { fill: { color: C.navy }, color: C.white, bold: true, fontSize: 8, fontFace: "Yu Gothic UI" } },
  ];
  const dataRows = cats.map((c, i) => [
    { text: c[0], options: { fill: { color: i % 2 === 0 ? C.lightGray : C.white }, fontSize: 7.5, fontFace: "Yu Gothic UI", color: C.text } },
    { text: c[1], options: { fill: { color: i % 2 === 0 ? C.lightGray : C.white }, fontSize: 7.5, fontFace: "Yu Gothic UI", color: C.textLight } },
    { text: c[2], options: { fill: { color: i % 2 === 0 ? C.lightGray : C.white }, fontSize: 7.5, fontFace: "Yu Gothic UI", color: C.textLight } },
  ]);

  s.addTable([headerRow, ...dataRows], {
    x: 0.4, y: 0.95, w: 4.5,
    colW: [2.5, 1.0, 1.0],
    border: { pt: 0.5, color: "DEE2E6" },
    rowH: 0.22,
  });

  // Right: notes
  s.addShape(pres.shapes.RECTANGLE, {
    x: 5.2, y: 0.95, w: 4.4, h: 1.6, fill: { color: C.greenBg }, shadow: makeShadow(),
  });
  s.addText("確認済みのルール", {
    x: 5.4, y: 1.05, w: 4, h: 0.3,
    fontSize: 13, fontFace: "Yu Gothic UI", bold: true, color: C.green, margin: 0,
  });
  s.addText([
    { text: "参加人数により男女混合・学年統合あり", options: { bullet: true, breakLine: true } },
    { text: "事前にメール・電話でお知らせ", options: { bullet: true, breakLine: true } },
    { text: "5名未満で試合不成立 → 当日返金", options: { bullet: true } },
  ], {
    x: 5.4, y: 1.4, w: 4, h: 1.0,
    fontSize: 11, fontFace: "Yu Gothic UI", color: C.text, margin: 0, paraSpaceAfter: 4,
  });

  // Questions
  s.addShape(pres.shapes.RECTANGLE, {
    x: 5.2, y: 2.8, w: 4.4, h: 1.8, fill: { color: C.accentLight }, shadow: makeShadow(),
  });
  addBadge(s, 8.5, 2.85, "question");
  s.addText("確認したいこと", {
    x: 5.4, y: 2.9, w: 3, h: 0.3,
    fontSize: 13, fontFace: "Yu Gothic UI", bold: true, color: C.navy, margin: 0,
  });
  s.addText([
    { text: "中学3年・高校生・一般女子のコート割当は？", options: { bullet: true, breakLine: true } },
    { text: "統合の判断基準（○人以下で合同など）？", options: { bullet: true, breakLine: true } },
    { text: "組分け時に道場が偏らないようにする\n配慮はありますか？", options: { bullet: true } },
  ], {
    x: 5.4, y: 3.3, w: 4, h: 1.2,
    fontSize: 11, fontFace: "Yu Gothic UI", color: C.text, margin: 0, paraSpaceAfter: 4,
  });
}

// ============================================================
// SLIDE 6: League grouping rules (CONFIRMED from brackets)
// ============================================================
{
  const s = pres.addSlide();
  s.background = { color: C.white };
  addSectionHeader(s, "リーグ戦の組分けルール（対戦表より確認済み）");
  addFooter(s, 6);
  addBadge(s, 8.3, 0.4, "confirmed");

  // Patterns from actual data
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.5, y: 1.0, w: 9, h: 0.5, fill: { color: C.greenBg },
  });
  s.addText("対戦表から判明: 1組は3~4人。人数に応じて組数が変動", {
    x: 0.7, y: 1.0, w: 8.6, h: 0.5,
    fontSize: 13, fontFace: "Yu Gothic UI", bold: true, color: C.green,
    valign: "middle", margin: 0,
  });

  // 3 pattern cards
  const patterns = [
    { title: "2組パターン", ex: "幼年(7人) → 3人+4人", result: "1位同士→決勝\n2位同士→3位決定戦", color: C.navy },
    { title: "3組パターン", ex: "小1男子(11人)\n→ 3人+4人+4人", result: "各組1位→決勝リーグ\n（総当たりで順位決定）", color: C.accent },
    { title: "4組パターン", ex: "小4男子(13人)\n→ 3+3+3+4人", result: "各組1位→トーナメント\n（決勝＋3位決定戦）", color: "0D9488" },
  ];

  patterns.forEach((p, i) => {
    const xBase = 0.5 + i * 3.1;
    s.addShape(pres.shapes.RECTANGLE, {
      x: xBase, y: 1.7, w: 2.85, h: 2.5, fill: { color: C.white }, shadow: makeShadow(),
    });
    s.addShape(pres.shapes.RECTANGLE, {
      x: xBase, y: 1.7, w: 2.85, h: 0.06, fill: { color: p.color },
    });
    s.addText(p.title, {
      x: xBase + 0.12, y: 1.85, w: 2.6, h: 0.35,
      fontSize: 14, fontFace: "Yu Gothic UI", bold: true, color: p.color, margin: 0,
    });
    s.addText(p.ex, {
      x: xBase + 0.12, y: 2.25, w: 2.6, h: 0.6,
      fontSize: 10, fontFace: "Yu Gothic UI", color: C.textLight, margin: 0,
    });
    s.addShape(pres.shapes.RECTANGLE, {
      x: xBase + 0.12, y: 2.9, w: 2.6, h: 0.02, fill: { color: "DEE2E6" },
    });
    s.addText(p.result, {
      x: xBase + 0.12, y: 3.0, w: 2.6, h: 0.8,
      fontSize: 11, fontFace: "Yu Gothic UI", color: C.text, margin: 0,
    });
  });

  // Question
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.5, y: 4.4, w: 9, h: 0.6, fill: { color: C.accentLight }, shadow: makeShadow(),
  });
  addBadge(s, 0.6, 4.45, "question");
  s.addText("偶数組=トーナメント、奇数組=リーグのルールは今後も同じですか？組分け時の道場配慮は？", {
    x: 1.7, y: 4.4, w: 7.5, h: 0.6,
    fontSize: 11, fontFace: "Yu Gothic UI", color: C.text, valign: "middle", margin: 0,
  });
}

// ============================================================
// SLIDE 7: Seed (QUESTION)
// ============================================================
{
  const s = pres.addSlide();
  s.background = { color: C.white };
  addSectionHeader(s, "トーナメントのシード権");
  addFooter(s, 7);
  addBadge(s, 8.5, 0.4, "question");

  const opts = [
    { title: "パターンA: 固定シード", desc: "前回優勝者・上位入賞者を\nシード枠に配置", color: C.navy },
    { title: "パターンB: ランダム抽選", desc: "全選手をランダムに配置\n（シードなし）", color: C.accent },
  ];

  opts.forEach((o, i) => {
    const xBase = 0.5 + i * 4.7;
    s.addShape(pres.shapes.RECTANGLE, {
      x: xBase, y: 1.0, w: 4.3, h: 1.8, fill: { color: C.white }, shadow: makeShadow(),
    });
    s.addShape(pres.shapes.RECTANGLE, {
      x: xBase, y: 1.0, w: 4.3, h: 0.06, fill: { color: o.color },
    });
    s.addText(o.title, {
      x: xBase + 0.2, y: 1.2, w: 3.9, h: 0.4,
      fontSize: 16, fontFace: "Yu Gothic UI", bold: true, color: o.color, margin: 0,
    });
    s.addText(o.desc, {
      x: xBase + 0.2, y: 1.7, w: 3.9, h: 0.9,
      fontSize: 12, fontFace: "Yu Gothic UI", color: C.text, margin: 0,
    });
  });

  s.addShape(pres.shapes.OVAL, {
    x: 4.55, y: 1.55, w: 0.9, h: 0.9, fill: { color: C.navy },
  });
  s.addText("?", {
    x: 4.55, y: 1.55, w: 0.9, h: 0.9,
    fontSize: 28, fontFace: "Yu Gothic UI", bold: true, color: C.white,
    align: "center", valign: "middle", margin: 0,
  });

  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.5, y: 3.1, w: 9, h: 1.8, fill: { color: C.accentLight }, shadow: makeShadow(),
  });
  s.addText("確認したいこと", {
    x: 0.7, y: 3.2, w: 8.6, h: 0.35,
    fontSize: 14, fontFace: "Yu Gothic UI", bold: true, color: C.navy, margin: 0,
  });
  s.addText([
    { text: "シード権は特定の選手に固定されますか？", options: { bullet: true, breakLine: true } },
    { text: "それともランダム（抽選）ですか？", options: { bullet: true, breakLine: true } },
    { text: "シード権がある場合、その決定基準は？（前回成績、推薦 等）", options: { bullet: true, breakLine: true } },
    { text: "同じ道場の選手が初戦で当たらないようにする配慮は？", options: { bullet: true } },
  ], {
    x: 0.7, y: 3.6, w: 8.6, h: 1.2,
    fontSize: 12, fontFace: "Yu Gothic UI", color: C.text, margin: 0, paraSpaceAfter: 6,
  });
}

// ============================================================
// SLIDE 8: Team match rules (CONFIRMED from regulations)
// ============================================================
{
  const s = pres.addSlide();
  s.background = { color: C.white };
  addSectionHeader(s, "成年団体戦ルール（試合規定より確認済み）");
  addFooter(s, 8);
  addBadge(s, 8.3, 0.4, "confirmed");

  // Left column
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.5, y: 1.0, w: 4.3, h: 3.8, fill: { color: C.lightGray }, shadow: makeShadow(),
  });
  s.addText("確定ルール", {
    x: 0.7, y: 1.1, w: 3.9, h: 0.3,
    fontSize: 14, fontFace: "Yu Gothic UI", bold: true, color: C.green, margin: 0,
  });
  s.addText([
    { text: "3人1チームのトーナメント戦", options: { bullet: true, breakLine: true, bold: true } },
    { text: "選手登録: 3名＋補欠2名＝計5名", options: { bullet: true, breakLine: true } },
    { text: "1団体2チームまで登録可能", options: { bullet: true, breakLine: true } },
    { text: "社会人・大学生・高校生 混合可", options: { bullet: true, breakLine: true } },
    { text: "試合: 2分間3本勝負 × 3人対試合", options: { bullet: true, breakLine: true } },
    { text: "代表戦も2分間3本勝負", options: { bullet: true, breakLine: true } },
    { text: "3名未満 → 先鋒より不戦敗", options: { bullet: true, breakLine: true } },
    { text: "勝ち数同数 → 引分 → 代表者戦", options: { bullet: true, breakLine: true } },
    { text: "代表戦も引分 → 無制限1本勝負", options: { bullet: true } },
  ], {
    x: 0.7, y: 1.5, w: 3.9, h: 3.0,
    fontSize: 11, fontFace: "Yu Gothic UI", color: C.text, margin: 0, paraSpaceAfter: 4,
  });

  // Right: Registration rules
  s.addShape(pres.shapes.RECTANGLE, {
    x: 5.2, y: 1.0, w: 4.4, h: 1.8, fill: { color: C.white }, shadow: makeShadow(),
  });
  s.addText("登録ルール", {
    x: 5.4, y: 1.1, w: 4, h: 0.3,
    fontSize: 13, fontFace: "Yu Gothic UI", bold: true, color: C.navy, margin: 0,
  });
  s.addText([
    { text: "1チーム目は必ず3人揃えてから\n2チーム目のエントリー", options: { bullet: true, breakLine: true } },
    { text: "チーム名には団体名を含める", options: { bullet: true, breakLine: true } },
    { text: "欠員補充: 当日開会式までに書面申入", options: { bullet: true } },
  ], {
    x: 5.4, y: 1.5, w: 4, h: 1.2,
    fontSize: 11, fontFace: "Yu Gothic UI", color: C.text, margin: 0, paraSpaceAfter: 4,
  });

  // Right bottom: questions
  s.addShape(pres.shapes.RECTANGLE, {
    x: 5.2, y: 3.0, w: 4.4, h: 1.8, fill: { color: C.accentLight }, shadow: makeShadow(),
  });
  addBadge(s, 8.5, 3.05, "question");
  s.addText("確認したいこと", {
    x: 5.4, y: 3.1, w: 3, h: 0.3,
    fontSize: 13, fontFace: "Yu Gothic UI", bold: true, color: C.navy, margin: 0,
  });
  s.addText([
    { text: "オーダー（出場順）は試合ごとに\n変更可能ですか？", options: { bullet: true, breakLine: true } },
    { text: "補欠の交代は試合間でも可能？", options: { bullet: true, breakLine: true } },
    { text: "本数は勝敗に不採用でよいですか？", options: { bullet: true } },
  ], {
    x: 5.4, y: 3.5, w: 4, h: 1.2,
    fontSize: 11, fontFace: "Yu Gothic UI", color: C.text, margin: 0, paraSpaceAfter: 4,
  });
}

// ============================================================
// SLIDE 9: Venue & Schedule (CONFIRMED from schedule PDF)
// ============================================================
{
  const s = pres.addSlide();
  s.background = { color: C.white };
  addSectionHeader(s, "大会次第・コート割当（確認済み）");
  addFooter(s, 9);
  addBadge(s, 8.3, 0.4, "confirmed");

  // Timeline
  const timeline = [
    { time: "10:00", label: "開会式", desc: "選手入場、会長あいさつ、選手宣誓" },
    { time: "10:30", label: "午前の部", desc: "少年 個人戦（4コート同時進行）" },
    { time: "13:00", label: "午後の部", desc: "成年 団体戦 + 少年個人戦決勝" },
    { time: "15:00", label: "表彰式・閉会式", desc: "表彰式、国旗降納" },
  ];

  timeline.forEach((t, i) => {
    const yPos = 1.0 + i * 0.7;
    s.addShape(pres.shapes.RECTANGLE, {
      x: 0.5, y: yPos, w: 1.2, h: 0.55, fill: { color: C.navy },
    });
    s.addText(t.time, {
      x: 0.5, y: yPos, w: 1.2, h: 0.55,
      fontSize: 13, fontFace: "Yu Gothic UI", bold: true, color: C.white,
      align: "center", valign: "middle", margin: 0,
    });
    s.addText(t.label, {
      x: 1.85, y: yPos, w: 1.8, h: 0.55,
      fontSize: 13, fontFace: "Yu Gothic UI", bold: true, color: C.navy,
      valign: "middle", margin: 0,
    });
    s.addText(t.desc, {
      x: 3.6, y: yPos, w: 3, h: 0.55,
      fontSize: 10, fontFace: "Yu Gothic UI", color: C.textLight,
      valign: "middle", margin: 0,
    });
  });

  // Court assignments (right)
  const courts = [
    { court: "A", am: "小1-2年女子\n小3年女子\n中1-2年男子\n中1-2年女子", pm: "団体 A-1~A-4\n3位決定戦\n決勝戦" },
    { court: "B", am: "小3年男子\n小5年男子\n小6年男子", pm: "団体 B-1~B-3" },
    { court: "C", am: "幼年\n小1年男子\n小2年男子", pm: "団体 C-1~C-2" },
    { court: "D", am: "小4年男子\n小4年女子\n小5-6年女子", pm: "団体 D-1~D-2" },
  ];

  courts.forEach((c, i) => {
    const yPos = 1.0 + i * 1.05;
    s.addShape(pres.shapes.RECTANGLE, {
      x: 6.8, y: yPos, w: 0.5, h: 0.9, fill: { color: C.navy },
    });
    s.addText(c.court, {
      x: 6.8, y: yPos, w: 0.5, h: 0.9,
      fontSize: 16, fontFace: "Yu Gothic UI", bold: true, color: C.white,
      align: "center", valign: "middle", margin: 0,
    });
    s.addText(c.am, {
      x: 7.4, y: yPos, w: 1.2, h: 0.9,
      fontSize: 7.5, fontFace: "Yu Gothic UI", color: C.text, margin: 0,
    });
    s.addText(c.pm, {
      x: 8.7, y: yPos, w: 1.0, h: 0.9,
      fontSize: 7.5, fontFace: "Yu Gothic UI", color: C.textLight, margin: 0,
    });
  });

  // Court header
  s.addText("午前", {
    x: 7.4, y: 0.75, w: 1.2, h: 0.2,
    fontSize: 8, fontFace: "Yu Gothic UI", bold: true, color: C.midGray, margin: 0,
  });
  s.addText("午後", {
    x: 8.7, y: 0.75, w: 1.0, h: 0.2,
    fontSize: 8, fontFace: "Yu Gothic UI", bold: true, color: C.midGray, margin: 0,
  });
}

// ============================================================
// SLIDE 10: Monetization (DISCUSSION)
// ============================================================
{
  const s = pres.addSlide();
  s.background = { color: C.white };
  addSectionHeader(s, "システムの汎用化・収益化");
  addFooter(s, 10);

  const visions = [
    { title: "孝徳会", desc: "現在の大会で\n継続利用", x: 0.5 },
    { title: "他の日本拳法団体", desc: "ルール・カテゴリを\nカスタマイズして提供", x: 3.4 },
    { title: "他競技", desc: "柔道・空手等の\n大会運営にも展開", x: 6.3 },
  ];

  visions.forEach((v, i) => {
    s.addShape(pres.shapes.RECTANGLE, {
      x: v.x, y: 1.0, w: 2.7, h: 1.4, fill: { color: C.white }, shadow: makeShadow(),
    });
    s.addShape(pres.shapes.RECTANGLE, {
      x: v.x, y: 1.0, w: 2.7, h: 0.06, fill: { color: i === 0 ? C.navy : C.accent },
    });
    s.addText(v.title, {
      x: v.x + 0.15, y: 1.15, w: 2.4, h: 0.4,
      fontSize: 14, fontFace: "Yu Gothic UI", bold: true, color: C.navy, margin: 0,
    });
    s.addText(v.desc, {
      x: v.x + 0.15, y: 1.6, w: 2.4, h: 0.7,
      fontSize: 11, fontFace: "Yu Gothic UI", color: C.text, margin: 0,
    });
  });

  s.addText("→", { x: 3.1, y: 1.3, w: 0.4, h: 0.5, fontSize: 24, color: C.accent, align: "center", valign: "middle", margin: 0 });
  s.addText("→", { x: 6.0, y: 1.3, w: 0.4, h: 0.5, fontSize: 24, color: C.accent, align: "center", valign: "middle", margin: 0 });

  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.5, y: 2.7, w: 9, h: 2.2, fill: { color: C.accentLight }, shadow: makeShadow(),
  });
  s.addText("相談したいこと", {
    x: 0.7, y: 2.8, w: 8.6, h: 0.35,
    fontSize: 14, fontFace: "Yu Gothic UI", bold: true, color: C.navy, margin: 0,
  });
  s.addText([
    { text: "孝徳会として他団体への展開を許諾いただけるか", options: { bullet: true, breakLine: true } },
    { text: "今後の利用形態のご希望は？（孝徳会は無償継続？）", options: { bullet: true, breakLine: true } },
    { text: "システムに「孝徳会」の名称やブランドを出す範囲", options: { bullet: true, breakLine: true } },
    { text: "他の日本拳法大会で異なるルールがあれば情報共有いただけるか", options: { bullet: true } },
  ], {
    x: 0.7, y: 3.2, w: 8.6, h: 1.5,
    fontSize: 12, fontFace: "Yu Gothic UI", color: C.text, margin: 0, paraSpaceAfter: 6,
  });
}

// ============================================================
// SLIDE 11: Phase 2 Roadmap
// ============================================================
{
  const s = pres.addSlide();
  s.background = { color: C.white };
  addSectionHeader(s, "今後の開発予定（Phase 2）");
  addFooter(s, 11);

  s.addText("優先度: 高", {
    x: 0.5, y: 1.0, w: 2, h: 0.35,
    fontSize: 13, fontFace: "Yu Gothic UI", bold: true, color: C.white,
    fill: { color: C.red }, align: "center", valign: "middle", margin: 0,
  });

  const highItems = [
    { num: "1", title: "Supabase連携", desc: "ローカルstate → DB移行 + Realtime同期" },
    { num: "2", title: "応募フォーム", desc: "選手登録（氏名・フリガナ・学年・性別・道場）" },
    { num: "3", title: "認証", desc: "管理者/記録係のログイン（Supabase Auth）" },
    { num: "4", title: "保護者ビュー改善", desc: "30秒間隔HTTPポーリング（接続数削減）" },
  ];

  highItems.forEach((item, i) => {
    const yPos = 1.5 + i * 0.5;
    s.addShape(pres.shapes.RECTANGLE, {
      x: 0.5, y: yPos, w: 9, h: 0.42, fill: { color: i % 2 === 0 ? C.lightGray : C.white },
    });
    s.addText(item.num, {
      x: 0.6, y: yPos, w: 0.35, h: 0.42,
      fontSize: 12, fontFace: "Yu Gothic UI", bold: true, color: C.accent,
      align: "center", valign: "middle", margin: 0,
    });
    s.addText(item.title, {
      x: 1.0, y: yPos, w: 2.5, h: 0.42,
      fontSize: 12, fontFace: "Yu Gothic UI", bold: true, color: C.navy, valign: "middle", margin: 0,
    });
    s.addText(item.desc, {
      x: 3.5, y: yPos, w: 5.8, h: 0.42,
      fontSize: 11, fontFace: "Yu Gothic UI", color: C.textLight, valign: "middle", margin: 0,
    });
  });

  s.addText("優先度: 中", {
    x: 0.5, y: 3.7, w: 2, h: 0.35,
    fontSize: 13, fontFace: "Yu Gothic UI", bold: true, color: C.white,
    fill: { color: C.yellowBg }, align: "center", valign: "middle", margin: 0,
  });

  const medItems = [
    { num: "5", title: "団体戦対応（今回のルール確認を反映）" },
    { num: "6", title: "PDF出力（印刷用トーナメント表）" },
    { num: "7", title: "午前/午後の2部制スケジューリング" },
  ];

  medItems.forEach((item, i) => {
    const yPos = 4.15 + i * 0.35;
    s.addText(`${item.num}.  ${item.title}`, {
      x: 0.7, y: yPos, w: 8.6, h: 0.32,
      fontSize: 11, fontFace: "Yu Gothic UI", color: C.text, valign: "middle", margin: 0,
    });
  });
}

// ============================================================
// SLIDE 12: Summary
// ============================================================
{
  const s = pres.addSlide();
  s.background = { color: C.navy };

  s.addText("まとめ・次のステップ", {
    x: 0.5, y: 0.4, w: 9, h: 0.6,
    fontSize: 24, fontFace: "Yu Gothic UI", bold: true, color: C.white, margin: 0,
  });

  const steps = [
    { num: "01", text: "本日の回答を仕様に反映（シード権・道場配慮・オーダー変更）" },
    { num: "02", text: "団体戦ルールをシステムに実装" },
    { num: "03", text: "Supabase連携の開発着手（DB移行+リアルタイム同期）" },
    { num: "04", text: "次回打ち合わせでデモ確認" },
  ];

  steps.forEach((step, i) => {
    const yPos = 1.3 + i * 0.9;
    s.addShape(pres.shapes.RECTANGLE, {
      x: 1.0, y: yPos, w: 8, h: 0.7, fill: { color: C.darkNavy }, shadow: makeShadow(),
    });
    s.addShape(pres.shapes.RECTANGLE, {
      x: 1.0, y: yPos, w: 0.06, h: 0.7, fill: { color: C.accent },
    });
    s.addText(step.num, {
      x: 1.3, y: yPos, w: 0.6, h: 0.7,
      fontSize: 20, fontFace: "Yu Gothic UI", bold: true, color: C.accent, valign: "middle", margin: 0,
    });
    s.addText(step.text, {
      x: 2.0, y: yPos, w: 6.5, h: 0.7,
      fontSize: 15, fontFace: "Yu Gothic UI", color: C.white, valign: "middle", margin: 0,
    });
  });

  s.addText("ご質問・ご意見をお聞かせください", {
    x: 0.5, y: 5.0, w: 9, h: 0.4,
    fontSize: 13, fontFace: "Yu Gothic UI", color: C.midGray, align: "center", margin: 0,
  });
}

// --- Write file ---
const outPath = path.resolve(__dirname, "meeting-20260316.pptx");
pres.writeFile({ fileName: outPath }).then(() => {
  console.log("Created: " + outPath);
}).catch(err => {
  console.error("Error:", err);
  process.exit(1);
});

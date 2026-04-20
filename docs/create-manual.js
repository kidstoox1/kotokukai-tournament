const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType,
  ShadingType, PageNumber, PageBreak, LevelFormat, ImageRun } = require('docx');
const fs = require('fs');
const path = require('path');

const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const borders = { top: border, bottom: border, left: border, right: border };
const cellMargins = { top: 80, bottom: 80, left: 120, right: 120 };
const noBorder = { style: BorderStyle.NONE, size: 0 };
const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };

const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots');

// 画像読み込みヘルパー（ファイルがなければnull）
function loadImage(filename) {
  const p = path.join(SCREENSHOTS_DIR, filename);
  if (fs.existsSync(p)) return fs.readFileSync(p);
  console.warn('Screenshot not found: ' + filename);
  return null;
}

// 画像をParagraphとして挿入（キャプション付き）
function screenshotParagraph(filename, caption, widthPx, heightPx) {
  const data = loadImage(filename);
  if (!data) return para('[画像: ' + caption + ']');
  const children = [
    new ImageRun({
      type: 'png',
      data,
      transformation: { width: widthPx, height: heightPx },
      altText: { title: caption, description: caption, name: filename },
    }),
  ];
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 200, after: 80 },
    children,
  });
}

function captionParagraph(text) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
    children: [new TextRun({ text, size: 18, color: "6B7280", italics: true })],
  });
}

function heading(text, level = HeadingLevel.HEADING_1) {
  return new Paragraph({ heading: level, children: [new TextRun(text)], spacing: { before: 300, after: 200 } });
}

function para(text, opts = {}) {
  const runs = Array.isArray(text)
    ? text.map(t => typeof t === 'string' ? new TextRun(t) : new TextRun(t))
    : [new TextRun(text)];
  return new Paragraph({ children: runs, spacing: { after: 120 }, ...opts });
}

function bold(text) { return { text, bold: true }; }
function colored(text, color) { return { text, color }; }

function stepRow(num, text, note) {
  return new TableRow({
    children: [
      new TableCell({
        borders, width: { size: 800, type: WidthType.DXA }, cellMargins,
        shading: { fill: "B91C1C", type: ShadingType.CLEAR },
        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(num), bold: true, color: "FFFFFF", size: 24 })] })],
      }),
      new TableCell({
        borders, width: { size: 5560, type: WidthType.DXA }, margins: cellMargins,
        children: [new Paragraph({ children: [new TextRun({ text, size: 22 })] })],
      }),
      new TableCell({
        borders, width: { size: 3000, type: WidthType.DXA }, margins: cellMargins,
        shading: { fill: "F3F4F6", type: ShadingType.CLEAR },
        children: [new Paragraph({ children: [new TextRun({ text: note || '', size: 20, color: "6B7280" })] })],
      }),
    ]
  });
}

function infoRow(label, value, highlight) {
  return new TableRow({
    children: [
      new TableCell({
        borders, width: { size: 3000, type: WidthType.DXA }, margins: cellMargins,
        shading: { fill: "1F2937", type: ShadingType.CLEAR },
        children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, color: "FFFFFF", size: 22 })] })],
      }),
      new TableCell({
        borders, width: { size: 6360, type: WidthType.DXA }, margins: cellMargins,
        shading: highlight ? { fill: "FEF3C7", type: ShadingType.CLEAR } : undefined,
        children: [new Paragraph({ children: [new TextRun({ text: value, size: 22, bold: !!highlight })] })],
      }),
    ]
  });
}

const doc = new Document({
  styles: {
    default: { document: { run: { font: "Yu Gothic", size: 22 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 36, bold: true, font: "Yu Gothic", color: "1F2937" },
        paragraph: { spacing: { before: 360, after: 240 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 28, bold: true, font: "Yu Gothic", color: "B91C1C" },
        paragraph: { spacing: { before: 280, after: 180 }, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 24, bold: true, font: "Yu Gothic", color: "374151" },
        paragraph: { spacing: { before: 200, after: 120 }, outlineLevel: 2 } },
    ]
  },
  numbering: {
    config: [
      { reference: "bullets",
        levels: [{ level: 0, format: LevelFormat.BULLET, text: "\u2022", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: "numbers",
        levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: "numbers2",
        levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
    ]
  },
  sections: [
    // === 表紙 ===
    {
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
        }
      },
      children: [
        new Paragraph({ spacing: { before: 3000 } }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
          children: [new TextRun({ text: "日本拳法 孝徳会", size: 32, color: "B91C1C", bold: true })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 600 },
          children: [new TextRun({ text: "大会運営システム", size: 48, bold: true, color: "1F2937" })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 100 },
          children: [new TextRun({ text: "記録係 操作マニュアル", size: 40, bold: true, color: "B91C1C" })],
        }),
        new Paragraph({ spacing: { before: 2000 } }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: "2026年3月", size: 24, color: "6B7280" })],
        }),
      ]
    },

    // === 本文 ===
    {
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 1200, right: 1200, bottom: 1200, left: 1200 },
        }
      },
      headers: {
        default: new Header({
          children: [new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [new TextRun({ text: "記録係マニュアル | 日本拳法 孝徳会", size: 16, color: "9CA3AF" })],
          })]
        })
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: "- ", size: 18, color: "9CA3AF" }), new TextRun({ children: [PageNumber.CURRENT], size: 18, color: "9CA3AF" }), new TextRun({ text: " -", size: 18, color: "9CA3AF" })],
          })]
        })
      },
      children: [
        // === 1. アクセス方法 ===
        heading("1. アクセス方法"),
        para("記録係専用のURLをブラウザで開いてください。スマホ・タブレット・PCいずれでもアクセスできます。"),
        new Table({
          width: { size: 9506, type: WidthType.DXA },
          columnWidths: [3000, 6506],
          rows: [
            infoRow("記録係URL", "kotokukai-tournament.vercel.app/recorder", true),
            infoRow("管理者URL", "kotokukai-tournament.vercel.app"),
            infoRow("観覧URL", "kotokukai-tournament.vercel.app/viewer"),
          ]
        }),
        para([
          { text: "推奨ブラウザ: ", bold: true },
          { text: "Google Chrome / Safari" },
        ]),
        para([
          { text: "通信環境: ", bold: true },
          { text: "Wi-Fi または 4G/5G（リアルタイム同期のため通信が必要です）" },
        ]),

        // === 2. 画面構成 ===
        heading("2. 画面構成"),
        para("記録係画面は以下の3つのエリアで構成されています。"),

        // --- スクリーンショット: メイン画面 ---
        screenshotParagraph('01_recorder_main.png', '記録係メイン画面', 380, 507),
        captionParagraph('図1: 記録係画面の全体図（タブレット表示）'),

        heading("2-1. コート選択", HeadingLevel.HEADING_3),
        para("画面上部に A / B / C / D の4つのコートボタンがあります。自分が担当するコートを選択してください。選択中のコートはコートカラーで強調表示されます。"),
        heading("2-2. 現在の試合", HeadingLevel.HEADING_3),
        para("選択中のコートで次に行う試合（または進行中の試合）が表示されます。"),
        new Paragraph({
          numbering: { reference: "bullets", level: 0 },
          children: [new TextRun({ text: "カテゴリ名とグループ（例：低学年 リーグ戦 Aグループ）", size: 22 })],
        }),
        new Paragraph({
          numbering: { reference: "bullets", level: 0 },
          children: [new TextRun({ text: "白（左）と赤（右）の選手名・所属道場", size: 22 })],
        }),
        new Paragraph({
          numbering: { reference: "bullets", level: 0 },
          children: [new TextRun({ text: "「試合開始」ボタン", size: 22 })],
        }),
        heading("2-3. 次の試合予定", HeadingLevel.HEADING_3),
        para("このコートで待機中の試合一覧です。各試合に「開始」ボタンと上下（▲▼）の並べ替えボタンがあります。"),

        // === 3. 基本操作 ===
        new Paragraph({ children: [new PageBreak()] }),
        heading("3. 試合の記録手順"),
        para([bold("試合開始から結果確定までの流れ：")]),
        new Table({
          width: { size: 9360, type: WidthType.DXA },
          columnWidths: [800, 5560, 3000],
          rows: [
            new TableRow({
              children: [
                new TableCell({ borders, width: { size: 800, type: WidthType.DXA }, margins: cellMargins, shading: { fill: "374151", type: ShadingType.CLEAR },
                  children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "手順", bold: true, color: "FFFFFF", size: 20 })] })] }),
                new TableCell({ borders, width: { size: 5560, type: WidthType.DXA }, margins: cellMargins, shading: { fill: "374151", type: ShadingType.CLEAR },
                  children: [new Paragraph({ children: [new TextRun({ text: "操作", bold: true, color: "FFFFFF", size: 20 })] })] }),
                new TableCell({ borders, width: { size: 3000, type: WidthType.DXA }, margins: cellMargins, shading: { fill: "374151", type: ShadingType.CLEAR },
                  children: [new Paragraph({ children: [new TextRun({ text: "補足", bold: true, color: "FFFFFF", size: 20 })] })] }),
              ]
            }),
            stepRow(1, "「試合開始」ボタンをタップ", "スコア入力画面が即座に開きます"),
            stepRow(2, "試合中に本数・警告を入力", "リアルタイムで記録"),
            stepRow(3, "「試合終了・結果確定」をタップ", "結果が保存され次の試合へ"),
          ]
        }),

        // --- スクリーンショット: 試合開始前 → スコア入力 ---
        para(""),
        para([bold("手順1: 「試合開始」をタップすると、スコア入力画面が表示されます。")]),
        screenshotParagraph('03_score_input.png', 'スコア入力画面', 380, 507),
        captionParagraph('図2: スコア入力画面（試合開始直後）'),

        // === 4. スコア入力 ===
        heading("4. スコア入力画面の詳細"),

        // --- スクリーンショット: スコア入力中 ---
        screenshotParagraph('05_score_with_value.png', 'スコア入力中', 380, 507),
        captionParagraph('図3: 本数・警告を入力している状態'),

        heading("4-1. 入力モード", HeadingLevel.HEADING_3),
        new Table({
          width: { size: 9506, type: WidthType.DXA },
          columnWidths: [2500, 7006],
          rows: [
            new TableRow({ children: [
              new TableCell({ borders, width: { size: 2500, type: WidthType.DXA }, margins: cellMargins, shading: { fill: "374151", type: ShadingType.CLEAR },
                children: [new Paragraph({ children: [new TextRun({ text: "モード", bold: true, color: "FFFFFF", size: 20 })] })] }),
              new TableCell({ borders, width: { size: 7006, type: WidthType.DXA }, margins: cellMargins, shading: { fill: "374151", type: ShadingType.CLEAR },
                children: [new Paragraph({ children: [new TextRun({ text: "説明", bold: true, color: "FFFFFF", size: 20 })] })] }),
            ]}),
            new TableRow({ children: [
              new TableCell({ borders, width: { size: 2500, type: WidthType.DXA }, margins: cellMargins,
                children: [new Paragraph({ children: [new TextRun({ text: "通常（本数勝負）", bold: true, size: 22 })] })] }),
              new TableCell({ borders, width: { size: 7006, type: WidthType.DXA }, margins: cellMargins,
                children: [new Paragraph({ children: [new TextRun({ text: "取った本数（0/1/2）と警告（0〜4）を各選手に入力", size: 22 })] })] }),
            ]}),
            new TableRow({ children: [
              new TableCell({ borders, width: { size: 2500, type: WidthType.DXA }, margins: cellMargins,
                children: [new Paragraph({ children: [new TextRun({ text: "引き分け", bold: true, size: 22 })] })] }),
              new TableCell({ borders, width: { size: 7006, type: WidthType.DXA }, margins: cellMargins,
                children: [new Paragraph({ children: [new TextRun({ text: "リーグ戦のみ。時間切れで勝敗がつかない場合", size: 22 })] })] }),
            ]}),
            new TableRow({ children: [
              new TableCell({ borders, width: { size: 2500, type: WidthType.DXA }, margins: cellMargins,
                children: [new Paragraph({ children: [new TextRun({ text: "不戦勝", bold: true, size: 22 })] })] }),
              new TableCell({ borders, width: { size: 7006, type: WidthType.DXA }, margins: cellMargins,
                children: [new Paragraph({ children: [new TextRun({ text: "相手が不在の場合。不戦勝の選手を選択 → 2-0で勝利", size: 22 })] })] }),
            ]}),
            new TableRow({ children: [
              new TableCell({ borders, width: { size: 2500, type: WidthType.DXA }, margins: cellMargins,
                children: [new Paragraph({ children: [new TextRun({ text: "失格", bold: true, size: 22 })] })] }),
              new TableCell({ borders, width: { size: 7006, type: WidthType.DXA }, margins: cellMargins,
                children: [new Paragraph({ children: [new TextRun({ text: "危険行為・戦意喪失等。失格の選手を選択 → 0-2で敗北", size: 22 })] })] }),
            ]}),
          ]
        }),

        heading("4-2. 警告のルール", HeadingLevel.HEADING_3),
        para([bold("警告2回 = 相手に1本加算")]),
        para("入力した警告が2回に達するごとに、相手選手に自動で1本が加算されます。確定スコア（プレビュー）で加算後のスコアを確認できます。"),
        para([bold("例：")]),
        new Paragraph({
          numbering: { reference: "bullets", level: 0 },
          children: [new TextRun({ text: "赤に警告3回 → 白に1本加算（残り警告1）", size: 22 })],
        }),
        new Paragraph({
          numbering: { reference: "bullets", level: 0 },
          children: [new TextRun({ text: "赤に警告4回 → 白に2本加算（残り警告0）", size: 22 })],
        }),

        heading("4-3. 確定スコア（プレビュー）", HeadingLevel.HEADING_3),
        para("入力画面の下部に、警告加算後の最終スコアがリアルタイムで表示されます。勝敗判定も自動で行われるため、確認してから「試合終了・結果確定」を押してください。"),

        // === 5. 試合順の変更 ===
        new Paragraph({ children: [new PageBreak()] }),
        heading("5. 試合順の変更"),
        para("「次の試合予定」リストで、各試合の右側にある ▲▼ ボタンで順番を変更できます。"),

        // --- スクリーンショット: 試合予定リスト（フルページ版の下部を切り出し済み）---
        screenshotParagraph('02_match_list.png', '次の試合予定リスト', 380, 507),
        captionParagraph('図4: 次の試合予定 — ▲▼で順番変更、「開始」で直接開始'),

        new Paragraph({
          numbering: { reference: "numbers", level: 0 },
          children: [new TextRun({ text: "順番を変えたい試合の ▲（上へ）または ▼（下へ）をタップ", size: 22 })],
        }),
        new Paragraph({
          numbering: { reference: "numbers", level: 0 },
          children: [new TextRun({ text: "一番上の試合が「現在の試合」エリアに表示されます", size: 22 })],
        }),
        new Paragraph({
          numbering: { reference: "numbers", level: 0 },
          children: [new TextRun({ text: "任意の試合の「開始」ボタンで直接その試合を開始することもできます", size: 22 })],
        }),
        para(""),
        para([
          bold("試合中の入替: "),
          { text: "試合中でも「入替」ボタンで別の試合に切り替えることができます。現在の試合はキャンセルされ、待機中に戻ります。" },
        ]),

        // === 6. 結果の修正 ===
        heading("6. 結果の修正"),
        para("完了した試合の結果を修正する必要がある場合："),
        new Paragraph({
          numbering: { reference: "numbers2", level: 0 },
          children: [new TextRun({ text: "画面下部の「完了した試合」セクションを確認", size: 22 })],
        }),
        new Paragraph({
          numbering: { reference: "numbers2", level: 0 },
          children: [new TextRun({ text: "修正したい試合の「修正」ボタンをタップ", size: 22 })],
        }),
        new Paragraph({
          numbering: { reference: "numbers2", level: 0 },
          children: [new TextRun({ text: "スコア入力画面が開くので、正しい結果に修正", size: 22 })],
        }),
        new Paragraph({
          numbering: { reference: "numbers2", level: 0 },
          children: [new TextRun({ text: "「修正を確定」をタップ", size: 22 })],
        }),

        // === 7. キャンセル ===
        heading("7. キャンセル操作"),
        para("スコア入力画面で「キャンセル」を押すと、試合は待機状態に戻ります。入力中のスコアは保存されません。"),

        // --- スクリーンショット: キャンセル後の画面 ---
        screenshotParagraph('06_after_cancel.png', 'キャンセル後の画面', 380, 507),
        captionParagraph('図5: キャンセル後 — 試合は「試合開始」の待機状態に戻る'),

        para([
          { text: "注意: ", bold: true, color: "B91C1C" },
          { text: "キャンセルは試合を「未開始」に戻します。再度「試合開始」を押す必要があります。" },
        ]),

        // === 8. 同期について ===
        heading("8. リアルタイム同期"),
        para("このシステムはリアルタイムで全端末のデータを同期します。"),
        new Paragraph({
          numbering: { reference: "bullets", level: 0 },
          children: [new TextRun({ text: "画面左上の緑色の点が「リアルタイム同期中」と表示されていれば正常", size: 22 })],
        }),
        new Paragraph({
          numbering: { reference: "bullets", level: 0 },
          children: [new TextRun({ text: "記録係が入力した結果は、約3秒以内に管理者・モニター・観覧画面に反映", size: 22 })],
        }),
        new Paragraph({
          numbering: { reference: "bullets", level: 0 },
          children: [new TextRun({ text: "通信が切れた場合は黄色（接続中）または赤（オフライン）になります", size: 22 })],
        }),
        para([
          bold("通信が不安定な場合: "),
          { text: "ページをリロード（画面を引っ張って更新）してください。データはサーバーに保存されているため消えません。" },
        ]),

        // === 9. トラブルシューティング ===
        new Paragraph({ children: [new PageBreak()] }),
        heading("9. トラブルシューティング"),
        new Table({
          width: { size: 9506, type: WidthType.DXA },
          columnWidths: [3500, 6006],
          rows: [
            new TableRow({ children: [
              new TableCell({ borders, width: { size: 3500, type: WidthType.DXA }, margins: cellMargins, shading: { fill: "374151", type: ShadingType.CLEAR },
                children: [new Paragraph({ children: [new TextRun({ text: "症状", bold: true, color: "FFFFFF", size: 20 })] })] }),
              new TableCell({ borders, width: { size: 6006, type: WidthType.DXA }, margins: cellMargins, shading: { fill: "374151", type: ShadingType.CLEAR },
                children: [new Paragraph({ children: [new TextRun({ text: "対処法", bold: true, color: "FFFFFF", size: 20 })] })] }),
            ]}),
            new TableRow({ children: [
              new TableCell({ borders, width: { size: 3500, type: WidthType.DXA }, margins: cellMargins,
                children: [new Paragraph({ children: [new TextRun({ text: "画面が真っ白", size: 22 })] })] }),
              new TableCell({ borders, width: { size: 6006, type: WidthType.DXA }, margins: cellMargins,
                children: [new Paragraph({ children: [new TextRun({ text: "ページをリロードしてください", size: 22 })] })] }),
            ]}),
            new TableRow({ children: [
              new TableCell({ borders, width: { size: 3500, type: WidthType.DXA }, margins: cellMargins,
                children: [new Paragraph({ children: [new TextRun({ text: "「読み込み中...」のまま", size: 22 })] })] }),
              new TableCell({ borders, width: { size: 6006, type: WidthType.DXA }, margins: cellMargins,
                children: [new Paragraph({ children: [new TextRun({ text: "Wi-Fi/通信状態を確認し、リロード", size: 22 })] })] }),
            ]}),
            new TableRow({ children: [
              new TableCell({ borders, width: { size: 3500, type: WidthType.DXA }, margins: cellMargins,
                children: [new Paragraph({ children: [new TextRun({ text: "試合が表示されない", size: 22 })] })] }),
              new TableCell({ borders, width: { size: 6006, type: WidthType.DXA }, margins: cellMargins,
                children: [new Paragraph({ children: [new TextRun({ text: "正しいコートを選択しているか確認。管理者がコート割当を行っているか確認", size: 22 })] })] }),
            ]}),
            new TableRow({ children: [
              new TableCell({ borders, width: { size: 3500, type: WidthType.DXA }, margins: cellMargins,
                children: [new Paragraph({ children: [new TextRun({ text: "同期マークが赤い", size: 22 })] })] }),
              new TableCell({ borders, width: { size: 6006, type: WidthType.DXA }, margins: cellMargins,
                children: [new Paragraph({ children: [new TextRun({ text: "インターネット接続を確認。リロードで復帰します", size: 22 })] })] }),
            ]}),
            new TableRow({ children: [
              new TableCell({ borders, width: { size: 3500, type: WidthType.DXA }, margins: cellMargins,
                children: [new Paragraph({ children: [new TextRun({ text: "間違った結果を入力した", size: 22 })] })] }),
              new TableCell({ borders, width: { size: 6006, type: WidthType.DXA }, margins: cellMargins,
                children: [new Paragraph({ children: [new TextRun({ text: "「完了した試合」の「修正」ボタンから修正可能", size: 22 })] })] }),
            ]}),
          ]
        }),

        // === 10. お問い合わせ ===
        para(""),
        heading("10. 困ったときは"),
        para("操作がわからない場合や、システムに問題が発生した場合は、管理者にお声がけください。"),
      ]
    }
  ]
});

const outPath = process.argv[2] || "docs/記録係マニュアル.docx";
Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync(outPath, buffer);
  console.log("Created: " + outPath);
});

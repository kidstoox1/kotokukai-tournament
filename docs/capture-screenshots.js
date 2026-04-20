const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const BASE = 'http://localhost:3000';
const OUT_DIR = path.join(__dirname, 'screenshots');

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    headless: 'new',
    defaultViewport: { width: 768, height: 1024 },
  });
  const page = await browser.newPage();

  // 1. 記録係メイン画面（コート選択 + 現在の試合 + 次の試合予定）
  console.log('1. Recorder main screen...');
  await page.goto(BASE + '/recorder', { waitUntil: 'networkidle2', timeout: 30000 });
  await page.waitForSelector('button', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 2000)); // wait for data load
  await page.screenshot({ path: path.join(OUT_DIR, '01_recorder_main.png'), fullPage: false });
  console.log('   -> 01_recorder_main.png');

  // Full page version for the match list
  await page.screenshot({ path: path.join(OUT_DIR, '02_match_list.png'), fullPage: true });
  console.log('   -> 02_match_list.png');

  // 2. 試合開始 → スコア入力画面
  console.log('2. Score input screen...');
  // Click 試合開始 button
  const buttons = await page.$$('button');
  let startBtn = null;
  for (const btn of buttons) {
    const text = await btn.evaluate(el => el.textContent.trim());
    if (text === '試合開始') { startBtn = btn; break; }
  }
  if (startBtn) {
    await startBtn.click();
    await new Promise(r => setTimeout(r, 1500));
    await page.screenshot({ path: path.join(OUT_DIR, '03_score_input.png'), fullPage: false });
    console.log('   -> 03_score_input.png');

    // Scroll down to see the confirm button area
    await page.evaluate(() => {
      const modal = document.querySelector('[class*="fixed"]') || document.querySelector('[style*="fixed"]');
      if (modal) modal.scrollTop = modal.scrollHeight;
      else window.scrollTo(0, document.body.scrollHeight);
    });
    await new Promise(r => setTimeout(r, 500));
    await page.screenshot({ path: path.join(OUT_DIR, '04_score_input_bottom.png'), fullPage: false });
    console.log('   -> 04_score_input_bottom.png');

    // 3. Set some scores to show preview
    console.log('3. Score with values...');
    // Click score buttons if available - try to set 本数 for player A to 1
    const scoreButtons = await page.$$('button');
    for (const btn of scoreButtons) {
      const text = await btn.evaluate(el => el.textContent.trim());
      // Find a "1" button in score area (skip navigation buttons)
      if (text === '1') {
        const box = await btn.boundingBox();
        if (box && box.y > 200) { // only buttons below the header
          await btn.click();
          break;
        }
      }
    }
    await new Promise(r => setTimeout(r, 500));

    // Scroll back to top
    await page.evaluate(() => window.scrollTo(0, 0));
    await new Promise(r => setTimeout(r, 500));
    await page.screenshot({ path: path.join(OUT_DIR, '05_score_with_value.png'), fullPage: false });
    console.log('   -> 05_score_with_value.png');

    // 4. Cancel to go back
    console.log('4. Cancel back...');
    const cancelButtons = await page.$$('button');
    for (const btn of cancelButtons) {
      const text = await btn.evaluate(el => el.textContent.trim());
      if (text === 'キャンセル') { await btn.click(); break; }
    }
    await new Promise(r => setTimeout(r, 1000));
  }

  // 5. Show completed matches section (if visible after cancel)
  console.log('5. After cancel...');
  await page.screenshot({ path: path.join(OUT_DIR, '06_after_cancel.png'), fullPage: false });
  console.log('   -> 06_after_cancel.png');

  // 6. Admin page for context
  console.log('6. Admin overview...');
  await page.goto(BASE + '/', { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: path.join(OUT_DIR, '07_admin_overview.png'), fullPage: false });
  console.log('   -> 07_admin_overview.png');

  await browser.close();
  console.log('\nAll screenshots saved to: ' + OUT_DIR);
}

main().catch(e => { console.error(e); process.exit(1); });

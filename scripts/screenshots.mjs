import puppeteer from 'puppeteer-core';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const QA_DIR = path.join(__dirname, '..', 'qa');

async function main() {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium-browser',
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 380, height: 680, deviceScaleFactor: 2 });

  // 1. Pairing screen
  await page.goto('http://localhost:1420', { waitUntil: 'networkidle0' });
  await page.waitForSelector('button');
  await page.screenshot({ path: path.join(QA_DIR, '01-pair-screen.png') });
  console.log('1/5 Pair screen captured');

  // 2. Type a token and pair
  const tokenInput = await page.$('input[type="password"]');
  await tokenInput.type('test-device-pairing-token-1234567890abcdef');
  await page.screenshot({ path: path.join(QA_DIR, '02-pair-token-entered.png') });
  console.log('2/5 Token entered captured');

  // 3. Click pair and wait for main screen
  await page.click('button:has-text("Pair Device")').catch(() => {
    // Fallback: find the button by text
  });
  // Click the Pair Device button
  const buttons = await page.$$('button');
  for (const btn of buttons) {
    const text = await btn.evaluate(el => el.textContent);
    if (text && text.includes('Pair Device')) {
      await btn.click();
      break;
    }
  }
  
  // Wait for main screen to appear (mock takes ~500ms)
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: path.join(QA_DIR, '03-main-disconnected.png') });
  console.log('3/5 Main screen (disconnected) captured');

  // 4. Click Connect button
  const connectBtns = await page.$$('button');
  for (const btn of connectBtns) {
    const text = await btn.evaluate(el => el.textContent);
    if (text && text.includes('Connect')) {
      await btn.click();
      break;
    }
  }
  await new Promise(r => setTimeout(r, 3000)); // Wait for mock connection
  await page.screenshot({ path: path.join(QA_DIR, '04-main-connected.png') });
  console.log('4/5 Main screen (connected) captured');

  // 5. Click Locations nav
  const navBtns = await page.$$('header button');
  if (navBtns.length >= 2) {
    await navBtns[1].click();
    await new Promise(r => setTimeout(r, 1000));
    await page.screenshot({ path: path.join(QA_DIR, '05-locations.png') });
    console.log('5/5 Locations captured');
  }

  // 6. Settings screen
  if (navBtns.length >= 3) {
    await navBtns[2].click();
    await new Promise(r => setTimeout(r, 1000));
    await page.screenshot({ path: path.join(QA_DIR, '06-settings.png') });
    console.log('6/6 Settings captured');
  }

  await browser.close();
  console.log('All screenshots saved to qa/');
}

main().catch(err => {
  console.error('Screenshot error:', err);
  process.exit(1);
});

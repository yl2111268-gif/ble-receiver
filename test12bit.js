const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222');

  let page = null;
  for (const ctx of browser.contexts()) {
    for (const p of ctx.pages()) {
      if (p.url().includes('ble-receiver') || p.url().includes('localhost')) {
        page = p;
        break;
      }
    }
    if (page) break;
  }
  if (!page) {
    page = await browser.contexts()[0].newPage();
  }

  // Collect console errors
  var errors = [];
  page.on('console', function(msg) {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', function(err) { errors.push(err.message); });

  await page.goto('https://yl2111268-gif.github.io/ble-receiver/?v=' + Date.now(), { waitUntil: 'networkidle' });

  // Check version
  var info = await page.evaluate(function() {
    return {
      scrollX: typeof scrollX,
      drawWaveData: typeof drawWaveData,
      drawCode: drawWaveData.toString().substring(0, 200)
    };
  });
  console.log('函数代码:', info.drawCode);

  await page.click('#tabDebug');
  await page.waitForTimeout(200);
  await page.fill('#simInput', 'AA 55 02 00 C8 0D 0A');
  await page.click('#simSendBtn');
  await page.waitForTimeout(500);

  var check = await page.evaluate(function() {
    return {
      wdLen: waveData.length,
      wavePtr: wavePtr,
      scrollX: scrollX
    };
  });
  console.log('数据:', JSON.stringify(check));
  console.log('JS错误:', JSON.stringify(errors));
})();

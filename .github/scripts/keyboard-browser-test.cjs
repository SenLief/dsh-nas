const assert = require('node:assert/strict');
const path = require('node:path');

// Headless browsers do not open an iPhone software keyboard. Exercise its
// visual-viewport resize and pan independently of the unchanged layout viewport.
module.exports = async function testKeyboardViewport(browser, origin) {
  const context = await browser.newContext({
    viewport: { width: 393, height: 852 }, locale: 'zh-CN',
    isMobile: true, hasTouch: true,
  });
  await context.route('**/*', route => route.request().url().startsWith(origin + '/') ? route.continue() : route.abort());
  await context.addInitScript(() => {
    const native = window.visualViewport;
    const viewport = new EventTarget();
    let overrides = {};
    for (const key of ['width', 'height', 'offsetTop', 'offsetLeft', 'pageTop', 'pageLeft', 'scale']) {
      Object.defineProperty(viewport, key, { get: () => overrides[key] ?? native[key] });
    }
    for (const name of ['resize', 'scroll']) native.addEventListener(name, () => viewport.dispatchEvent(new Event(name)));
    Object.defineProperty(window, 'visualViewport', { value: viewport, configurable: true });
    window.__nasKeyboardViewport = values => {
      overrides = values;
      viewport.dispatchEvent(new Event('resize'));
      viewport.dispatchEvent(new Event('scroll'));
    };
  });
  const page = await context.newPage();
  try {
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    const frame = page.locator('[data-nas-mobile-frame]');
    await frame.waitFor();
    const editor = page.locator('[data-composer-input]');
    await editor.waitFor();
    // The shell can render from persisted desktop layout before its viewport
    // measurement and CSS finish applying on this fresh mobile page.
    await page.waitForFunction(() => {
      const editor = document.querySelector('[data-composer-input]');
      const frame = document.querySelector('[data-nas-mobile-frame]');
      return editor && frame && window.innerWidth === 393 &&
        Math.abs(frame.getBoundingClientRect().width - 393) < 1 &&
        parseFloat(getComputedStyle(editor).fontSize) >= 16;
    });
    assert(await editor.evaluate(el => parseFloat(getComputedStyle(el).fontSize) >= 16), 'Phone composer must not use small text that triggers input zoom');
    for (const width of [393, 430]) {
      await page.setViewportSize({ width, height: 852 });
      await editor.click();
      await editor.fill('键盘弹出后仍可编辑');
      for (const offsetTop of [0, 120]) {
        await page.evaluate(offsetTop => window.__nasKeyboardViewport({ height: 340, offsetTop, scale: 1 }), offsetTop);
        await page.waitForFunction(({ offsetTop }) => {
          const r = document.querySelector('[data-nas-mobile-frame]').getBoundingClientRect();
          return Math.abs(r.height - 340) < 1 && Math.abs(r.top - offsetTop) < 1;
        }, { offsetTop });
        const card = await page.locator('[data-nas-composer-card]').boundingBox();
        assert(card.x >= 0 && card.x + card.width <= width, 'Keyboard must not clip the composer horizontally');
        assert(Math.abs(card.x - (width - card.x - card.width)) < 1, 'Keyboard must preserve equal composer margins');
        assert(card.y >= offsetTop + 52 && card.y + card.height <= offsetTop + 340, 'Composer must remain above the keyboard and below the toolbar');
        const left = await page.getByRole('button', { name: '打开侧边栏', exact: true }).boundingBox();
        const right = await page.getByRole('button', { name: '打开右侧边栏', exact: true }).boundingBox();
        assert(left.y >= offsetTop && Math.abs(left.y - right.y) < 1, 'Both toolbar controls must stay aligned in the visible viewport');
        assert.equal(await editor.textContent(), '键盘弹出后仍可编辑');
      }
      if (process.env.MOBILE_UI_ARTIFACT_DIR && width === 393) {
        await page.screenshot({ path: path.join(process.env.MOBILE_UI_ARTIFACT_DIR, 'mobile-keyboard.png') });
      }
      // User pinch zoom must keep browser-controlled layout, including after
      // returning to scale 1 and dismissing the keyboard with a stale pan offset.
      await page.evaluate(() => window.__nasKeyboardViewport({ height: 280, offsetTop: 120, scale: 1.5 }));
      await page.waitForFunction(() => !document.querySelector('[data-nas-mobile-frame]').style.getPropertyValue('--nas-viewport-height'));
      await editor.evaluate(el => el.blur());
      await page.evaluate(() => window.__nasKeyboardViewport({ height: 852, offsetTop: 120, scale: 1 }));
      await page.waitForFunction(() => {
        const r = document.querySelector('[data-nas-mobile-frame]').getBoundingClientRect();
        return r.top === 0 && Math.abs(r.height - 852) < 1;
      });
      assert.equal(await frame.getAttribute('data-nas-keyboard-open'), null);
      await page.evaluate(() => window.__nasKeyboardViewport({}));
      await editor.fill('');
      await editor.evaluate(el => el.blur());
    }
    console.log('PASS: simulated phone keyboard resize/pan, composer editing, toolbar alignment, pinch zoom and keyboard dismissal');
  } catch (error) {
    console.error('Keyboard viewport regression failed:', await page.evaluate(() => ({
      width: innerWidth, height: innerHeight,
      viewport: { width: visualViewport.width, height: visualViewport.height, scale: visualViewport.scale },
      font: getComputedStyle(document.querySelector('[data-composer-input]')).fontSize,
    })));
    throw error;
  } finally {
    await context.close();
  }
};

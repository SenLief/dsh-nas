// Exercise the shipped UI from a non-loopback HTTP origin, with a disposable key.
// Host resolution changes only in this isolated Chromium process.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const fs = require('node:fs/promises');
const path = require('node:path');

async function testPhoneUI(page) {
  const output = process.env.MOBILE_UI_ARTIFACT_DIR;
  if (output) await fs.mkdir(output, { recursive: true });
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  for (const width of [320, 393, 430, 768]) {
    await page.setViewportSize({ width, height: 852 });
    await page.locator('[data-nas-mobile-leading]').waitFor();
    if (await page.getByRole('button', { name: '收起右侧边栏', exact: true }).isVisible()) {
      await page.getByRole('button', { name: '收起右侧边栏', exact: true }).click();
    }
    assert(await page.locator('[data-nas-mobile-drawer]').evaluate(el => el.hidden));
    assert.equal(Math.round((await page.locator('[data-nas-main]').boundingBox()).width), width, 'Hidden sidebar must not consume phone width');
    const leftToggle = await page.getByRole('button', { name: '打开侧边栏', exact: true }).boundingBox();
    const rightToggle = await page.getByRole('button', { name: '打开右侧边栏', exact: true }).boundingBox();
    assert(Math.abs(leftToggle.y - rightToggle.y) < 1 && leftToggle.height === rightToggle.height, 'Left and right drawer buttons must align');
    const newSession = page.locator('[data-nas-new-session]');
    const plus = await newSession.boundingBox();
    const search = page.locator('[data-nas-mobile-search]');
    const searchBox = await search.boundingBox();
    assert(Math.abs(plus.y - leftToggle.y) < 1 && Math.abs(searchBox.y - leftToggle.y) < 1, 'New session and search belong on the drawer toolbar');
    assert(plus.x > leftToggle.x && searchBox.x > plus.x && searchBox.x < rightToggle.x, 'Toolbar actions keep their order');
    const glyph = await newSession.locator('[data-nas-plus]').boundingBox();
    assert(Math.abs(glyph.x + glyph.width / 2 - plus.x - plus.width / 2) < 1 && Math.abs(glyph.y + glyph.height / 2 - plus.y - plus.height / 2) < 1, 'Plus glyph must be centered');
    const card = await page.locator('[data-nas-composer-card]').boundingBox();
    assert(Math.abs(card.x - (width - card.x - card.width)) < 1, 'Workspace composer must have equal side margins');
    await page.getByRole('button', { name: '选择工作区', exact: true }).click();
    const picker = page.locator('.nas-workspace-menu');
    await picker.waitFor();
    const pickerBox = await picker.boundingBox();
    assert(Math.abs(pickerBox.x - (width - pickerBox.x - pickerBox.width)) < 1, 'Workspace menu must be centered');
    await page.keyboard.press('Escape');
    await search.click();
    const searchInput = page.getByPlaceholder('搜索会话名称', { exact: true });
    await searchInput.waitFor();
    await page.waitForFunction(() => document.activeElement?.getAttribute('placeholder') === '搜索会话名称');
    // Reopen while the collapse animation still reports a wide sidebar.
    // The toolbar click must not bubble to the search's outside-click handler.
    for (let attempt = 0; attempt < 3; attempt++) {
      await searchInput.fill('nas-ci-search');
      await page.getByRole('button', { name: '收起侧边栏', exact: true }).click();
      await search.click();
      await searchInput.waitFor();
      assert.equal(await searchInput.inputValue(), 'nas-ci-search');
      await searchInput.fill('');
      await page.waitForFunction(() => document.activeElement?.getAttribute('placeholder') === '搜索会话名称');
      await page.getByRole('button', { name: '收起侧边栏', exact: true }).click();
      await search.click();
      await searchInput.waitFor();
      await page.waitForFunction(() => document.activeElement?.getAttribute('placeholder') === '搜索会话名称');
    }
    await page.getByRole('button', { name: '收起侧边栏', exact: true }).click();
    if (output && width === 393) await page.screenshot({ path: path.join(output, 'mobile-home.png') });
    await newSession.click();
    if (await page.getByRole('button', { name: '收起右侧边栏', exact: true }).isVisible()) {
      await page.getByRole('button', { name: '收起右侧边栏', exact: true }).click();
    }
    await page.getByRole('button', { name: '打开右侧边栏', exact: true }).waitFor();
    await page.getByRole('button', { name: '打开右侧边栏', exact: true }).click();
    const rightTab = page.getByRole('tab', { name: '开始', exact: true });
    await rightTab.waitFor();
    assert((await rightTab.boundingBox()).y >= 52, 'Right sidebar must leave room for shared toolbar');
    await page.getByRole('button', { name: '收起右侧边栏', exact: true }).click();
    await page.getByRole('button', { name: '打开侧边栏', exact: true }).click();
    const drawer = page.locator('[data-nas-mobile-drawer]');
    await drawer.waitFor({ state: 'visible' });
    assert.equal(await drawer.getAttribute('aria-modal'), 'true');
    assert(await page.locator('[data-nas-main]').evaluate(el => el.inert));
    await page.keyboard.press('Shift+Tab');
    assert(await drawer.evaluate(el => el.contains(document.activeElement)), 'Keyboard focus must stay in drawer');
    if (output && width === 393) await page.screenshot({ path: path.join(output, 'mobile-drawer.png') });
    await page.keyboard.press('Escape');
    await drawer.waitFor({ state: 'hidden' });
    await page.waitForFunction(() => !!document.activeElement?.closest('[data-nas-mobile-leading]'));
    assert(!await page.locator('[data-nas-main]').evaluate(el => el.inert));
    await page.getByRole('button', { name: '打开侧边栏', exact: true }).click();
    await page.locator('[data-nas-mobile-backdrop]').click({ position: { x: width - 12, y: 120 } });
    await drawer.waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: '打开侧边栏', exact: true }).click();
    await page.getByRole('button', { name: '新建会话', exact: true }).first().click();
    await drawer.waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: '打开侧边栏', exact: true }).click();
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await drawer.waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: '通用设置', exact: true }).click();
    const panel = page.locator('[data-shortcut-modal="settings"]');
    assert.equal(Math.round((await panel.boundingBox()).width), width, 'Phone settings must use full width');
    assert(await panel.evaluate(el => el.scrollWidth <= el.clientWidth + 1), 'Settings panel must not overflow horizontally');
    const language = page.getByText('语言', { exact: true });
    assert((await language.boundingBox()).height <= 28, 'Language label must not stack character by character');
    const themes = await Promise.all(['浅色', '深色', '跟随系统'].map(name => page.getByRole('button', { name, exact: true }).boundingBox()));
    assert(themes.every(box => box.width >= 80 && Math.abs(box.y - themes[0].y) < 2), 'Theme controls should share one usable row');
    if (output && width === 393) await page.screenshot({ path: path.join(output, 'mobile-settings.png') });
    for (const name of ['模型', '内置插件', 'Agent 预设']) {
      await page.getByRole('button', { name, exact: true }).click();
      assert(await panel.evaluate(el => el.scrollWidth <= el.clientWidth + 1), `${name} must stay inside phone settings`);
      assert(await panel.locator(':scope > div > div:last-child').evaluate(el => el.scrollWidth <= el.clientWidth + 1), `${name} content must not overflow horizontally`);
    }
    await page.getByRole('button', { name: '关闭', exact: true }).click();
    assert.equal(await page.locator('[data-nas-mobile-frame]').evaluate(el => el.scrollLeft), 0, 'Settings navigation must not scroll the phone frame');
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.locator('[data-nas-mobile-leading]').waitFor({ state: 'detached' });
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('button', { name: '通用设置', exact: true }).click();
  const panel = page.locator('[data-shortcut-modal="settings"]');
  assert.equal(Math.round((await panel.boundingBox()).width), 800, 'Desktop settings keep upstream width');
  assert.equal(Math.round((await panel.locator('nav').boundingBox()).width), 188, 'Desktop keeps vertical navigation');
  if (output) await page.screenshot({ path: path.join(output, 'desktop-settings.png') });
  console.log('PASS: 320/393/430/768px phone settings, drawer dismissal, focus, navigation and unchanged desktop geometry');
}

(async () => {
  const browser = await chromium.launch({
    args: ['--host-resolver-rules=MAP nas-test.invalid 127.0.0.1', '--no-proxy-server'],
  });
  const context = await browser.newContext({ locale: 'zh-CN' });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  const origin = 'http://nas-test.invalid:18080';
  const modelRequests = [];
  // A fake credential must never be sent to a provider during this test.
  await context.route('**/*', async route => {
    if (!route.request().url().startsWith(origin + '/')) {
      modelRequests.push(route.request().url());
      return route.abort();
    }
    return route.continue();
  });
  try {
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    const welcome = page.getByRole('button', { name: '继续', exact: true });
    const skip = page.getByRole('button', { name: '稍后配置', exact: true });
    const settings = page.getByRole('button', { name: '设置', exact: true });
    // The CI container is fresh. Its shell renders before asynchronous
    // onboarding arrives, so a visible Settings button is not a ready signal.
    await welcome.waitFor({ state: 'visible' });
    await welcome.click();
    await welcome.waitFor({ state: 'hidden' });
    await skip.waitFor({ state: 'visible' });
    await skip.click();
    await skip.waitFor({ state: 'hidden' });
    await settings.click();
    await page.getByRole('button', { name: '模型', exact: true }).click();
    await page.getByRole('button', { name: '添加模型提供商', exact: true }).waitFor();
    assert(!await page.getByText('settings are unavailable in this browser', { exact: false }).isVisible());
    // Password inputs have no implicit textbox role.
    await page.getByLabel('API 密钥', { exact: true }).fill('dsh-ci-test-not-a-real-api-key');
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await page.getByText('已保存 DeepSeek (deepseek-official)。', { exact: true }).waitFor();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await settings.click();
    await page.getByRole('button', { name: '模型', exact: true }).click();
    await page.getByRole('button', { name: '编辑 DeepSeek (deepseek-official)', exact: true }).click();
    await page.getByPlaceholder('已配置——输入新值可替换', { exact: true }).waitFor();
    assert.equal(await page.getByLabel('API 密钥', { exact: true }).inputValue(), '', 'Stored secret must not be echoed to the browser');
    await testPhoneUI(page);
    await require('./keyboard-browser-test.cjs')(browser, origin);
    assert.equal(modelRequests.length, 0, 'Settings test must not contact external providers');
    console.log('PASS: non-loopback HTTP browser loads provider settings, saves a disposable key and retains it after reload');
  } catch (error) {
    console.error('LAN settings regression failed:', error.message);
    console.error((await page.locator('body').innerText()).slice(0, 6000));
    throw error;
  } finally {
    await context.close();
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

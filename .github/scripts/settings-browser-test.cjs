// Exercise the shipped UI from a non-loopback HTTP origin, with a disposable key.
// Host resolution changes only in this isolated Chromium process.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

async function openSettings(page) {
  const direct = page.getByRole('button', { name: '设置', exact: true });
  const account = page.getByRole('button', { name: '账号菜单', exact: true });
  await direct.or(account).first().waitFor({ state: 'visible' });
  if (await direct.isVisible()) return direct.click();
  await account.click();
  await page.getByRole('menuitem', { name: '设置', exact: true }).click();
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
    // The CI container is fresh. Its shell renders before asynchronous
    // onboarding arrives, so a visible Settings button is not a ready signal.
    await welcome.waitFor({ state: 'visible' });
    await welcome.click();
    await welcome.waitFor({ state: 'hidden' });
    const addKey = page.getByRole('button', { name: '添加 API Key', exact: true });
    await skip.or(addKey).first().waitFor({ state: 'visible' });
    if (await skip.isVisible()) {
      await skip.click();
      await skip.waitFor({ state: 'hidden' });
    } else {
      // 0.2.1 offers account sign-in or API keys. Closing completes onboarding
      // without signing in or contacting a model service.
      await page.getByRole('button', { name: '关闭', exact: true }).click();
      await addKey.waitFor({ state: 'hidden' });
    }
    await openSettings(page);
    await page.getByRole('button', { name: '模型', exact: true }).click();
    await page.getByRole('button', { name: '添加模型提供商', exact: true }).waitFor();
    assert(!await page.getByText('settings are unavailable in this browser', { exact: false }).isVisible());
    const keyInput = page.getByLabel('API 密钥', { exact: true });
    if (!await keyInput.isVisible()) {
      await page.getByRole('button', { name: '编辑 DeepSeek (deepseek-official)', exact: true }).click();
    }
    // Password inputs have no implicit textbox role.
    await page.getByLabel('API 密钥', { exact: true }).fill('dsh-ci-test-not-a-real-api-key');
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await page.getByText('已保存 DeepSeek (deepseek-official)。', { exact: true }).waitFor();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await openSettings(page);
    await page.getByRole('button', { name: '模型', exact: true }).click();
    await page.getByRole('button', { name: '编辑 DeepSeek (deepseek-official)', exact: true }).click();
    await page.getByPlaceholder(/^(已配置——输入新值可替换|留空使用已保存凭据)$/).waitFor();
    assert.equal(await page.getByLabel('API 密钥', { exact: true }).inputValue(), '', 'Stored secret must not be echoed to the browser');
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

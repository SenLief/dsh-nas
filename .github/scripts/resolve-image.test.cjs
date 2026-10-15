const { test } = require('node:test');
const assert = require('node:assert/strict');
const { resolveImage } = require('./resolve-image.cjs');
const env = { GITHUB_REPOSITORY: 'SenLief/dsh-nas', GITHUB_SHA: '1234567890abcdef', GITHUB_EVENT_NAME: 'schedule' };
const digest = `sha256:${'a'.repeat(64)}`;
function registry({ npm = '0.3.0', published = '0.2.0-rc.2', status = 200, index = false } = {}) {
  return async url => {
    if (url.includes('registry.npmjs.org')) return Response.json({ version: npm });
    if (url.includes('/token?')) return Response.json({ token: 'test-token' });
    if (url.endsWith('/manifests/latest')) {
      if (status !== 200) return new Response('', { status });
      return Response.json(index ? { manifests: [{ platform: { os: 'linux', architecture: 'amd64' }, digest }] } : { config: { digest } });
    }
    if (url.includes('/manifests/sha256:')) return Response.json({ config: { digest } });
    if (url.includes('/blobs/')) return Response.json({ config: { Labels: { 'org.opencontainers.image.version': published } } });
    throw new Error(`Unexpected request: ${url}`);
  };
}
test('schedule builds a new npm version and skips an unchanged published version', async () => {
  assert.equal((await resolveImage(env, registry())).build, 'true');
  assert.equal((await resolveImage(env, registry({ published: '0.3.0', index: true }))).build, 'false');
});
test('schedule builds an absent image but fails on registry errors', async () => {
  assert.equal((await resolveImage(env, registry({ status: 404 }))).build, 'true');
  await assert.rejects(resolveImage(env, registry({ status: 503 })), /HTTP 503/);
  await assert.rejects(resolveImage(env, registry({ status: 401 })), /HTTP 401/);
});
test('push resolves npm latest and always rebuilds even at the same version', async () => {
  const result = await resolveImage({ ...env, GITHUB_EVENT_NAME: 'push' }, registry({ published: '0.3.0' }));
  assert.deepEqual(result, { name: 'ghcr.io/senlief/dsh-nas', version: '0.3.0', build: 'true', sha_tag: 'sha-1234567890ab' });
});
test('manual version is exact and never interpolated into shell code', async () => {
  const result = await resolveImage({ ...env, GITHUB_EVENT_NAME: 'workflow_dispatch', REQUESTED_DSH_VERSION: '0.2.0-rc.2' }, () => { throw new Error('Unexpected network'); });
  assert.equal(result.version, '0.2.0-rc.2');
  await assert.rejects(resolveImage({ ...env, REQUESTED_DSH_VERSION: 'latest\nbuild=false' }, registry()), /exact npm version/);
  await assert.rejects(resolveImage(env, registry({ npm: 'latest' })), /exact npm version/);
});

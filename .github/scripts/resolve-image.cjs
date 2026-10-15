const fs = require('node:fs');

const exactVersion = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/;
const accept = 'application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json';

async function json(fetcher, url, options = {}) {
  const response = await fetcher(url, { ...options, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
  return response.json();
}

async function publishedVersion(fetcher, repository, actor, token) {
  const headers = token ? { Authorization: `Basic ${Buffer.from(`${actor}:${token}`).toString('base64')}` } : {};
  const auth = await json(fetcher, `https://ghcr.io/token?service=ghcr.io&scope=repository:${repository}:pull`, { headers });
  if (!auth.token) throw new Error('GHCR did not return a pull token');
  const registryHeaders = { Authorization: `Bearer ${auth.token}`, Accept: accept };
  const url = `https://ghcr.io/v2/${repository}/manifests/`;
  const response = await fetcher(`${url}latest`, { headers: registryHeaders, signal: AbortSignal.timeout(30000) });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GHCR manifest check failed: HTTP ${response.status}`);
  let manifest = await response.json();
  if (manifest.manifests) {
    const target = manifest.manifests.find(item => item.platform?.os === 'linux' && item.platform?.architecture === 'amd64');
    if (!target) throw new Error('Published image has no linux/amd64 manifest');
    manifest = await json(fetcher, `${url}${target.digest}`, { headers: registryHeaders });
  }
  if (!/^sha256:[a-f0-9]{64}$/.test(manifest.config?.digest)) throw new Error('Invalid image config digest');
  const config = await json(fetcher, `https://ghcr.io/v2/${repository}/blobs/${manifest.config.digest}`, { headers: registryHeaders });
  return config.config?.Labels?.['org.opencontainers.image.version'] ?? null;
}

async function resolveImage(env, fetcher = fetch) {
  const repository = env.GITHUB_REPOSITORY?.toLowerCase();
  if (!/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/.test(repository ?? '')) throw new Error('Invalid repository');
  const requested = env.REQUESTED_DSH_VERSION?.trim();
  // Resolve once, then pass the exact version to every Docker build stage.
  const version = requested || (await json(fetcher, 'https://registry.npmjs.org/@deepseek-ai%2fdsh/latest')).version;
  if (!exactVersion.test(version ?? '') || version.length > 100) throw new Error('An exact npm version is required');
  let build = true;
  if (env.GITHUB_EVENT_NAME === 'schedule') {
    const published = await publishedVersion(fetcher, repository, env.GITHUB_ACTOR, env.GHCR_TOKEN);
    build = published !== version;
  }
  return { name: `ghcr.io/${repository}`, version, build: String(build), sha_tag: `sha-${env.GITHUB_SHA.slice(0, 12)}` };
}

if (require.main === module) {
  resolveImage(process.env).then(result => {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(result).map(([key, value]) => `${key}=${value}\n`).join(''));
    const summary = `npm version: ${result.version}; ${result.build === 'true' ? 'build and test' : 'already published; skipped'}`;
    console.log(summary);
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
  }).catch(error => { console.error(error.message); process.exitCode = 1; });
}

module.exports = { resolveImage };

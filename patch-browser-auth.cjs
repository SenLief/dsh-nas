// Local image customization: the official npm package has no no-auth switch.
// Keep the Host/Origin fence; also allow the container's concrete IPv4 bind.
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');

const cliPackage = path.resolve(process.argv[2] ||
  '/opt/dsh/lib/node_modules/@deepseek-ai/dsh/package.json');
const load = createRequire(cliPackage);
// Local builds retain the reviewed default; CI supplies its resolved exact version.
const expectedVersion = process.env.DSH_VERSION || '0.2.1-rc.2';
const installedVersion = load('./package.json').version;
if (installedVersion !== expectedVersion) throw new Error(`Expected dsh@${expectedVersion}, got ${installedVersion}`);
function packageBundle(name, bundle = 'lib/index.js') {
  const packageFile = load.resolve(`${name}/package.json`);
  const metadata = JSON.parse(fs.readFileSync(packageFile, 'utf8'));
  if (metadata.version !== expectedVersion) {
    throw new Error(`NAS patch expected ${name}@${expectedVersion}; got ${metadata.version}.`);
  }
  const file = path.join(path.dirname(packageFile), bundle);
  return { file, source: fs.readFileSync(file, 'utf8') };
}
function patchPackage(name, marker, patches, preamble = '', bundle = 'lib/index.js') {
  const target = packageBundle(name, bundle);
  const file = target.file;
  let source = target.source;
  if (source.includes(marker)) return;
  for (const [needle, replacement] of patches) {
    if (source.split(needle).length !== 2) {
      throw new Error(`Unexpected ${name} source: patch target must occur exactly once: ${needle}`);
    }
    source = source.replace(needle, replacement);
  }
  fs.writeFileSync(file, `${marker}\n${preamble}${source}`);
}

const connection = packageBundle('@deepseek-ai/dsh-client-connection').source;
// Newer releases pass the listener's TLS state into browser authentication.
const authorizeSignature = connection.includes('authorizeIndex(req, res, secure = false) {')
  ? 'authorizeIndex(req, res, secure = false) {' : 'authorizeIndex(req, res) {';
const authenticatedSignature = connection.includes('isAuthenticated(request, secure = false) {')
  ? 'isAuthenticated(request, secure = false) {' : 'isAuthenticated(request) {';
patchPackage('@deepseek-ai/dsh-client-connection', '// NAS_IMAGE_BROWSER_AUTH_OVERRIDE', [
  ['authenticatedUrl(baseUrl) {\n\t\tconst url = new URL(baseUrl);',
   'authenticatedUrl(baseUrl) {\n\t\tif (process.env.DSH_DISABLE_BROWSER_AUTH === "1") return baseUrl;\n\t\tconst url = new URL(baseUrl);'],
  [authorizeSignature + '\n',
   authorizeSignature + '\n\t\tif (process.env.DSH_DISABLE_BROWSER_AUTH === "1") return true;\n'],
  [authenticatedSignature + '\n',
   authenticatedSignature + '\n\t\tif (process.env.DSH_DISABLE_BROWSER_AUTH === "1") return true;\n'],
]);

// This npm release's CLI accepts a concrete IP, but its carrier schema does not.
// Validate it as a concrete IPv4 before Node binds; keep wildcard/DNS binds out.
const webserver = packageBundle('@deepseek-ai/dsh-host-webserver').source;
if (webserver.includes('host: z.union([z.const("127.0.0.1"), z.const("0.0.0.0")]).required(),') ||
    webserver.includes('// NAS_IMAGE_CONCRETE_IPV4_BIND')) {
  patchPackage('@deepseek-ai/dsh-host-webserver', '// NAS_IMAGE_CONCRETE_IPV4_BIND', [
  ['host: z.union([z.const("127.0.0.1"), z.const("0.0.0.0")]).required(),',
   'host: z.string().required(),'],
  ['const resolved = config;',
   'const resolved = config;\n\t\tif (!isIPv4(resolved.host) || resolved.host === "0.0.0.0") throw new Error("NAS Web listener requires a concrete IPv4 address");'],
], 'import { isIPv4 } from "node:net";\n');
} else if (webserver.includes('host: z.transform(z.string(), (value) => {') &&
           webserver.includes('if (isWildcardAddress(parsed)) throw new Error(')) {
  console.log('Using upstream concrete-IP listener validation without modification');
} else {
  throw new Error('Unexpected Web listener schema; review before upgrading');
}
// This deployment uses the same persistent NAS settings for trusted LAN pages.
// Preserve the real connection.isLoopback value and all server admission checks.
const settings = packageBundle('@deepseek-ai/dsh-client-ui-settings', 'lib/client.js').source;
if (settings.includes('const persistence = ctx.remote.$host.isLoopback ? "host" : "memory";') ||
    settings.includes('// NAS_IMAGE_LAN_SETTINGS')) {
  patchPackage('@deepseek-ai/dsh-client-ui-settings', '// NAS_IMAGE_LAN_SETTINGS', [
  ['const persistence = ctx.remote.$host.isLoopback ? "host" : "memory";',
   'const persistence = "host";'],
], '', 'lib/client.js');
} else if (settings.includes('this.ctx.remote.settings.mutate(') &&
           settings.includes('this.ctx.remote.settings.describe(')) {
  console.log('Using upstream Host settings persistence without modifying the UI bundle');
} else {
  throw new Error('Unexpected settings persistence implementation; review before upgrading');
}

// The official browser picker starts in HOME, independently of Docker WORKDIR.
// Keep explicit selections and the real account home intact; change only the
// initial directory when this image supplies its mounted workspace root.
patchPackage('@deepseek-ai/dsh-host-directory-picker-browse', '// NAS_IMAGE_WORKSPACE_PICKER', [
  ['const target = resolve(path ?? home);',
   'const target = resolve(path ?? process.env.DSH_WORKSPACE_ROOT ?? home);'],
]);

// First-use initialization otherwise searches the OS Documents directory.
// Place its default project inside the bind mount, without moving old records.
patchPackage('@deepseek-ai/dsh-api-workspace-controller', '// NAS_IMAGE_DEFAULT_WORKSPACE', [
  ['let directory = documentsDirectory;',
   'const workspaceRoot = process.env.DSH_WORKSPACE_ROOT;\n\tif (documentsDirectory === void 0 && workspaceRoot !== void 0) return paths.join(validateDocumentsDirectory(workspaceRoot, platform), DEFAULT_WORKSPACE_DIRECTORY);\n\tlet directory = documentsDirectory;'],
]);
console.log('Installed NAS IPv4, browser-auth, LAN settings and workspace defaults; Host/Origin checks are unchanged');

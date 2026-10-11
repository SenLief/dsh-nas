// Local image customization: the official npm package has no no-auth switch.
// Keep the Host/Origin fence; also allow the container's concrete IPv4 bind.
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');

const cliPackage = path.resolve(process.argv[2] ||
  '/opt/dsh/lib/node_modules/@deepseek-ai/dsh/package.json');
const load = createRequire(cliPackage);
function patchPackage(name, marker, patches, preamble = '') {
  const packageFile = load.resolve(`${name}/package.json`);
  const metadata = JSON.parse(fs.readFileSync(packageFile, 'utf8'));
  if (metadata.version !== '0.2.0-rc.2') {
    throw new Error(`NAS patch supports only 0.2.0-rc.2; got ${name}@${metadata.version}. Review before upgrading.`);
  }
  const file = path.join(path.dirname(packageFile), 'lib/index.js');
  let source = fs.readFileSync(file, 'utf8');
  if (source.includes(marker)) return;
  for (const [needle, replacement] of patches) {
    if (source.split(needle).length !== 2) {
      throw new Error(`Unexpected ${name} source: patch target must occur exactly once: ${needle}`);
    }
    source = source.replace(needle, replacement);
  }
  fs.writeFileSync(file, `${marker}\n${preamble}${source}`);
}

patchPackage('@deepseek-ai/dsh-client-connection', '// NAS_IMAGE_BROWSER_AUTH_OVERRIDE', [
  ['authenticatedUrl(baseUrl) {\n\t\tconst url = new URL(baseUrl);',
   'authenticatedUrl(baseUrl) {\n\t\tif (process.env.DSH_DISABLE_BROWSER_AUTH === "1") return baseUrl;\n\t\tconst url = new URL(baseUrl);'],
  ['authorizeIndex(req, res) {\n',
   'authorizeIndex(req, res) {\n\t\tif (process.env.DSH_DISABLE_BROWSER_AUTH === "1") return true;\n'],
  ['isAuthenticated(request) {\n',
   'isAuthenticated(request) {\n\t\tif (process.env.DSH_DISABLE_BROWSER_AUTH === "1") return true;\n'],
]);

// This npm release's CLI accepts a concrete IP, but its carrier schema does not.
// Validate it as a concrete IPv4 before Node binds; keep wildcard/DNS binds out.
patchPackage('@deepseek-ai/dsh-host-webserver', '// NAS_IMAGE_CONCRETE_IPV4_BIND', [
  ['host: z.union([z.const("127.0.0.1"), z.const("0.0.0.0")]).required(),',
   'host: z.string().required(),'],
  ['const resolved = config;',
   'const resolved = config;\n\t\tif (!isIPv4(resolved.host) || resolved.host === "0.0.0.0") throw new Error("NAS Web listener requires a concrete IPv4 address");'],
], 'import { isIPv4 } from "node:net";\n');
console.log('Installed NAS IPv4 binding and opt-in browser-auth patches; Host/Origin checks are unchanged');

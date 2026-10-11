// Local image customization: the official npm package has no no-auth switch.
// Keep the Host/Origin fence; change only BrowserAuth's three entry points.
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');

const cliPackage = path.resolve(process.argv[2] ||
  '/opt/dsh/lib/node_modules/@deepseek-ai/dsh/package.json');
const load = createRequire(cliPackage);
const connectionPackage = load.resolve('@deepseek-ai/dsh-client-connection/package.json');
const metadata = JSON.parse(fs.readFileSync(connectionPackage, 'utf8'));
if (metadata.version !== '0.2.0-rc.2') {
  throw new Error(`No-auth patch supports only 0.2.0-rc.2; got ${metadata.version}. Review the patch before upgrading.`);
}
const file = path.join(path.dirname(connectionPackage), 'lib/index.js');
let source = fs.readFileSync(file, 'utf8');
const marker = '// NAS_IMAGE_BROWSER_AUTH_OVERRIDE';
if (source.includes(marker)) {
  console.log('Browser-auth patch is already installed');
  process.exit(0);
}
const patches = [
  ['authenticatedUrl(baseUrl) {\n\t\tconst url = new URL(baseUrl);',
   'authenticatedUrl(baseUrl) {\n\t\tif (process.env.DSH_DISABLE_BROWSER_AUTH === "1") return baseUrl;\n\t\tconst url = new URL(baseUrl);'],
  ['authorizeIndex(req, res) {\n',
   'authorizeIndex(req, res) {\n\t\tif (process.env.DSH_DISABLE_BROWSER_AUTH === "1") return true;\n'],
  ['isAuthenticated(request) {\n',
   'isAuthenticated(request) {\n\t\tif (process.env.DSH_DISABLE_BROWSER_AUTH === "1") return true;\n'],
];
for (const [needle, replacement] of patches) {
  if (source.split(needle).length !== 2) {
    throw new Error(`Unexpected npm source: patch target must occur exactly once: ${needle}`);
  }
  source = source.replace(needle, replacement);
}
fs.writeFileSync(file, `${marker}\n${source}`);
console.log('Installed opt-in browser-auth override; Host/Origin checks are unchanged');

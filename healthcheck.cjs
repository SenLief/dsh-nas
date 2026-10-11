const os = require('node:os');
const http = require('node:http');
const interfaces = os.networkInterfaces();
const host = process.env.DSH_BIND_ADDRESS ||
  [...(interfaces.eth0 || []), ...Object.values(interfaces).flat()]
    .find(x => x && x.family === 'IPv4' && !x.internal)?.address;
if (!host) process.exit(1);

// The root intentionally requires login: 401 is a healthy unauthenticated UI.
const req = http.get({host, port: 3080, path: '/', timeout: 3000}, res => {
  res.resume();
  process.exit([200, 401].includes(res.statusCode) ? 0 : 1);
});
req.on('timeout', () => req.destroy(new Error('healthcheck timeout')));
req.on('error', () => process.exit(1));

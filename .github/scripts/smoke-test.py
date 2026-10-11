"""Check the real npm Web UI through a remapped port, without a model API key."""
import argparse
import http.client
import re
import subprocess
import time
from pathlib import Path
from urllib.parse import urlsplit

parser = argparse.ArgumentParser()
parser.add_argument("--log-file", type=Path, help="Local npm process log instead of Docker")
parser.add_argument("--port", type=int, default=18080)
parser.add_argument("--no-auth", action="store_true", help="Verify the custom anonymous-access mode")
args = parser.parse_args()

def logs():
    if args.log_file:
        return args.log_file.read_text(errors="replace") if args.log_file.exists() else ""
    result = subprocess.run(["docker", "logs", "dsh-smoke"], capture_output=True, text=True)
    return result.stdout + result.stderr

deadline = time.monotonic() + 120
launch_url = None
while time.monotonic() < deadline:
    match = re.search(r"dsh web: (http://\S+)", logs())
    if match:
        launch_url = match.group(1)
        break
    time.sleep(1)
if not launch_url:
    # No launch token is printed before readiness; these are boot diagnostics.
    print(logs()[-12000:])
    raise SystemExit("DSH did not announce Web readiness within 120 seconds")

authority = f"nas-test.invalid:{args.port}"
def request(path, cookie=None, host=authority, origin=None):
    connection = http.client.HTTPConnection("127.0.0.1", args.port, timeout=10)
    headers = {"Host": host}
    if cookie:
        headers["Cookie"] = cookie
    if origin:
        headers["Origin"] = origin
    connection.request("GET", path, headers=headers)
    response = connection.getresponse()
    status, response_headers, body = response.status, dict(response.getheaders()), response.read()
    connection.close()
    return status, response_headers, body

cookie = None
if args.no_auth:
    assert not urlsplit(launch_url).query, "Anonymous startup URL should contain no token"
    status, headers, _ = request("/")
    assert status == 200, f"Anonymous UI should open directly: HTTP {status}"
    assert not any(key.lower() == "set-cookie" for key in headers), "Anonymous mode should not require a login cookie"
    assert request("/api/test-fence")[0] == 404, "Anonymous API should pass authentication and reach route lookup"
else:
    assert request("/")[0] == 401, "Unauthenticated UI should require login"
    assert request("/api/test-fence")[0] == 401, "API should require login when the override is disabled"
    query = urlsplit(launch_url).query
    assert query, "Readiness URL must contain a launch token"
    status, headers, _ = request("/?" + query)
    assert status == 303, f"Launch token exchange failed: HTTP {status}"
    cookie = headers.get("set-cookie", headers.get("Set-Cookie", "")).split(";", 1)[0]
    assert cookie, "Login should issue a session cookie"
status, _, body = request("/", cookie)
assert status == 200 and b"<html" in body.lower(), "Authenticated Web UI should render HTML"
assert b"__DSH_BOOT__" in body, "Web UI should include the DSH bootstrap configuration"
assert request("/api/test-fence", cookie, "untrusted.invalid")[0] == 403, "Untrusted Host should be rejected"
assert request("/api/test-fence", cookie, origin="http://untrusted.invalid")[0] == 403, "Cross-origin API requests should be rejected"
mode = "anonymous access" if args.no_auth else "token login"
print(f"PASS: npm Web startup, remapped port, {mode}, HTML and Host/Origin fence")

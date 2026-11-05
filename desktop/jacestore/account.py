"""Signing the desktop app in to Jace Store.

  Jace OS     the computer has a Jace account (jace-account): the app asks it for a Jace token for
              Jace Store's Jace app and trades it for a Jace Store session, with no clicks. Anything
              that goes wrong (no Jace OS, not signed in, Jace unreachable) is silent: the app just
              stays signed out and offers the normal sign-in. Can be turned off in Settings.
  Elsewhere   "Sign in" opens the website, you click Connect, and the browser hands the session
              back to the app over a one-time local connection (127.0.0.1 only).

The session is a Jace Store API token kept in account.json (readable only by you). Tokens are
never printed or logged.
"""
import json
import os
import secrets
import subprocess
import sys
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlencode, urlparse

from jacestore import JACE_CLIENT_ID, STORE_URL, settings
from jacestore.net import session
from jacestore.paths import data_dir
from jacestore.system import child_env, which

BASE = os.environ.get("JACE_STORE_URL", STORE_URL).rstrip("/")
_lock = threading.Lock()


def _file():
    return data_dir() / "account.json"


def load() -> dict | None:
    try:
        d = json.loads(_file().read_text(encoding="utf-8"))
        return d if d.get("token") else None
    except (OSError, ValueError):
        return None


def _save(token: str, user: dict, how: str):
    with _lock:
        f = _file()
        tmp = f.with_suffix(".tmp")
        fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)     # only this user can read the token
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump({"token": token, "user": user or {}, "how": how}, fh)
        os.replace(tmp, f)


def clear():
    with _lock:
        _file().unlink(missing_ok=True)


def user() -> dict | None:
    a = load()
    return a.get("user") if a else None


def headers() -> dict:
    a = load()
    return {"Authorization": f"Bearer {a['token']}"} if a else {}


def refresh() -> dict | None:
    """Check the session is still good (it can be revoked on the website); update the name/picture."""
    a = load()
    if not a:
        return None
    try:
        r = session.get(f"{BASE}/api/cli/me", headers=headers(), timeout=15)
    except Exception:  # noqa: BLE001 - offline: keep the session
        return a.get("user")
    if r.status_code == 401:
        clear()
        return None
    if r.ok:
        u = r.json() or {}
        _save(a["token"], {k: u.get(k) for k in ("username", "display_name", "avatar_url")}, a.get("how", ""))
        return user()
    return a.get("user")


def sign_out():
    if load():
        try:
            session.delete(f"{BASE}/api/cli/session", headers=headers(), timeout=10)   # revoke it on the server too
        except Exception:  # noqa: BLE001 - signing out locally is what matters
            pass
    clear()


# --- Jace OS ------------------------------------------------------------------------------------------

def _jace_account(*args, timeout=20) -> dict | None:
    exe = which("jace-account")
    if not exe:
        return None
    try:
        out = subprocess.run([exe, *args], capture_output=True, text=True, timeout=timeout, env=child_env())
        return json.loads(out.stdout or "null")
    except (OSError, ValueError, subprocess.TimeoutExpired):
        return None


def jace_os_available() -> bool:
    return sys.platform.startswith("linux") and bool(which("jace-account"))


def jace_os_sign_in() -> bool:
    """Sign in with this computer's Jace account (Jace OS). Silent: returns False on anything unexpected."""
    if load() or not settings.load().get("jace_os_signin", True) or not jace_os_available():
        return False
    status = _jace_account("--json", timeout=10)
    if not isinstance(status, dict) or not status.get("signed_in"):
        return False
    got = _jace_account("--token-for", JACE_CLIENT_ID)
    access = got.get("access_token") if isinstance(got, dict) else None
    if not access:
        return False
    try:
        r = session.post(f"{BASE}/api/auth/jace/desktop", json={"access_token": access}, timeout=30)
        if not r.ok:
            return False
        d = r.json()
    except Exception:  # noqa: BLE001 - quietly fall back to the normal sign-in
        return False
    finally:
        access = None                                          # (the Jace token isn't kept)
    if not d.get("token"):
        return False
    _save(d["token"], d.get("user") or {}, "jace-os")
    return True


# --- normal sign-in (browser) ---------------------------------------------------------------------------

class _Handler(BaseHTTPRequestHandler):
    result: dict = {}
    state = ""

    def do_GET(self):  # noqa: N802 - http.server's name
        u = urlparse(self.path)
        q = {k: v[0] for k, v in parse_qs(u.query).items()}
        ok = u.path == "/callback" and secrets.compare_digest(q.get("state", ""), self.state) and q.get("token", "").startswith("jst_")
        if ok:
            type(self).result["token"] = q["token"]
        body = ("<h2>You're signed in. You can close this tab and go back to Jace Store.</h2>" if ok
                else "<h2>That sign-in link didn't match. Click Sign in in Jace Store again.</h2>").encode()
        self.send_response(200 if ok else 400)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):    # never log the request line (it has the token in it)
        pass


class _LocalServer(HTTPServer):
    def server_bind(self):
        # HTTPServer looks up the host's name (socket.getfqdn), which can take several seconds on
        # macOS; 127.0.0.1 needs no name
        import socketserver
        socketserver.TCPServer.server_bind(self)
        self.server_name, self.server_port = "127.0.0.1", self.server_address[1]


def browser_sign_in(timeout=300, cancel=None) -> dict | None:
    """Open the website's Connect page and wait for it to hand the session back. -> user, or None."""
    state = secrets.token_hex(16)
    handler = type("H", (_Handler,), {"result": {}, "state": state})
    srv = _LocalServer(("127.0.0.1", 0), handler)
    srv.timeout = 1
    port = srv.server_address[1]
    webbrowser.open(f"{BASE}/desktop/connect?{urlencode({'port': port, 'state': state})}")
    try:
        import time
        end = time.time() + timeout
        while time.time() < end and not handler.result.get("token"):
            if cancel and cancel():
                return None
            srv.handle_request()
    finally:
        srv.server_close()
    token = handler.result.get("token")
    if not token:
        return None
    _save(token, {}, "browser")
    return refresh()

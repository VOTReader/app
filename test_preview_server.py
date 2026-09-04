"""test_preview_server — tools/preview-server.py must never LAN-expose the tree.

WHY THIS TEST EXISTS
The preview server is started by .claude/launch.json against the whole
app/src/main/assets tree, with SimpleHTTPRequestHandler's directory listings
turned on. Until 2026-09-03 it bound `("", PORT)`, and an empty host is
INADDR_ANY: the socket answered on every interface, so anything on the Wi-Fi
could browse the tree. The project's two other dev servers (tools/smoke-ci.js,
tools/e2e-readalong.mjs) already listen on 127.0.0.1 only; this test holds the
Python one to the same contract. Policy: anything that can LAN-expose a
service is a defect, so the loopback bind is asserted, not assumed.

HOW
The server is spawned as a real subprocess on a free port, serving a temp
directory, exactly as the launch config runs it. Three checks:
  1. a loopback GET returns the file with the no-store headers the tool exists for;
  2. the same port on this machine's LAN address REFUSES the connection
     (skipped only on a host that has no non-loopback IPv4 at all);
  3. the start-up banner names 127.0.0.1, so the address is visible in the log.
Check 2 is the RED one: against the old `("", PORT)` bind the LAN connect
succeeds and the test fails.

Run:  python -m unittest test_preview_server -v
CI runs it beside test_check_balance; the pre-commit hook runs it whenever the
server or this file is staged.
"""

import errno
import os
import socket
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.request

ROOT = os.path.dirname(os.path.abspath(__file__))
SERVER = os.path.join(ROOT, "tools", "preview-server.py")
REFUSED = {errno.ECONNREFUSED, getattr(errno, "WSAECONNREFUSED", 10061), 10061}


def free_port():
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


def lan_ipv4():
    """A non-loopback IPv4 address of this machine, or None if it has none.

    A UDP connect never sends a packet; it only asks the OS which source
    address it would route from, which is the LAN-facing interface."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("10.255.255.255", 1))
        ip = s.getsockname()[0]
        s.close()
    except OSError:
        return None
    return None if ip.startswith("127.") else ip


def wait_until_listening(host, port, timeout=15.0):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            with socket.create_connection((host, port), timeout=0.5):
                return True
        except OSError:
            time.sleep(0.1)
    return False


class PreviewServerBindsLoopbackOnly(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        with open(os.path.join(cls.tmp.name, "hello.txt"), "w", encoding="utf-8") as f:
            f.write("hello")
        cls.port = free_port()
        # -u: the banner must reach the pipe unbuffered, or readline() below hangs.
        cls.proc = subprocess.Popen(
            [sys.executable, "-u", SERVER, str(cls.port), cls.tmp.name],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            cwd=ROOT,
        )
        if not wait_until_listening("127.0.0.1", cls.port):
            cls._stop()
            raise RuntimeError("preview-server did not start listening on 127.0.0.1:%d" % cls.port)
        cls.banner = cls.proc.stdout.readline().strip()

    @classmethod
    def _stop(cls):
        if cls.proc.poll() is None:
            cls.proc.terminate()
            try:
                cls.proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                cls.proc.kill()
                cls.proc.wait(timeout=5)
        cls.proc.stdout.close()

    @classmethod
    def tearDownClass(cls):
        cls._stop()
        cls.tmp.cleanup()

    def test_loopback_serves_with_no_store(self):
        with urllib.request.urlopen("http://127.0.0.1:%d/hello.txt" % self.port, timeout=5) as r:
            self.assertEqual(r.status, 200)
            self.assertEqual(r.read(), b"hello")
            self.assertIn("no-store", r.headers.get("Cache-Control", ""))

    def test_lan_address_is_refused(self):
        ip = lan_ipv4()
        if ip is None:
            self.skipTest("this host has no non-loopback IPv4 address to probe")
        with self.assertRaises(OSError) as cm:
            with socket.create_connection((ip, self.port), timeout=3):
                pass
        self.assertIn(
            cm.exception.errno, REFUSED,
            "expected connection refused on %s:%d, got %r" % (ip, self.port, cm.exception),
        )

    def test_banner_names_loopback(self):
        self.assertIn("127.0.0.1:%d" % self.port, self.banner, "banner was: %r" % self.banner)


if __name__ == "__main__":
    unittest.main()

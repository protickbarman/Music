#!/usr/bin/env python3
"""Standard-library tests for download_js.py — run with:

    python3 -m unittest discover -s scripts -v
"""

from __future__ import annotations

import contextlib
import hashlib
import http.server
import importlib.util
import io
import json
import pathlib
import socketserver
import sys
import tempfile
import threading
import unittest
import zipfile

HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parent
spec = importlib.util.spec_from_file_location("download_js", HERE / "download_js.py")
djs = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(djs)


class PathTests(unittest.TestCase):
    def test_rejects_traversal_and_absolute_paths(self):
        self.assertIsNone(djs.safe_zip_path("../outside.js"))
        self.assertIsNone(djs.safe_zip_path("/etc/passwd.js"))
        self.assertIsNone(djs.safe_zip_path("a/../../evil.js"))
        self.assertIsNone(djs.safe_zip_path("C:/windows/x.js"))

    def test_keeps_normal_paths(self):
        self.assertEqual(
            str(djs.safe_zip_path("app/(tabs)/index.tsx")), "app/(tabs)/index.tsx"
        )
        self.assertEqual(str(djs.safe_zip_path("src\\lib\\api.ts")), "src/lib/api.ts")

    def test_extension_filter(self):
        for name in ("a.js", "b.JSX", "c.d.ts", "d.mjs", "e.tsx"):
            self.assertTrue(djs.is_js(name), name)
        for name in ("package.json", "README.md", "Main.java"):
            self.assertFalse(djs.is_js(name), name)


class UrlTests(unittest.TestCase):
    def test_finds_youtube_js_urls_and_filters_third_parties(self):
        body = r'''<script src="/s/desktop/x/jsbin/desktop_polymer.vflset/desktop_polymer.js"></script>
<script src="https://www.youtube.com/iframe_api"></script>
<script>ytcfg.set({"PLAYER_JS_URL":"https:\/\/www.youtube.com\/s\/player\/096efeec\/player_ias.vflset\/en_US\/base.js"});
var w="https://i.ytimg.com/s/x/widget.js", t="https://tracker.example.com/a.js";</script>
<link rel="modulepreload" href="/s/player/x/www-widgetapi.vflset/www-widgetapi.js">'''
        urls = djs.extract_js_urls("https://www.youtube.com/", body, all_hosts=False)
        joined = " ".join(urls)
        self.assertIn("desktop_polymer.js", joined)
        self.assertIn("base.js", joined)
        self.assertIn("www-widgetapi.js", joined)
        self.assertIn("i.ytimg.com", joined)
        self.assertNotIn("tracker.example.com", joined)
        self.assertNotIn("/iframe_api", joined)  # not a .js path

    def test_host_policy(self):
        self.assertTrue(djs.host_allowed("www.youtube.com", "www.youtube.com", False))
        self.assertTrue(djs.host_allowed("i.ytimg.com", "www.youtube.com", False))
        self.assertTrue(djs.host_allowed("127.0.0.1", "127.0.0.1", False))
        self.assertFalse(djs.host_allowed("evil.example.com", "www.youtube.com", False))
        self.assertTrue(djs.host_allowed("evil.example.com", "www.youtube.com", True))


class LocalServerTests(unittest.TestCase):
    """End-to-end crawl against a throwaway local HTTP server (no internet needed)."""

    def test_download_recursive_with_escaped_urls(self):
        root = pathlib.Path(tempfile.mkdtemp())

        class Handler(http.server.SimpleHTTPRequestHandler):
            def __init__(self, *a, **kw):
                super().__init__(*a, directory=str(root), **kw)

            def log_message(self, *a):
                pass

        server = socketserver.ThreadingTCPServer(("127.0.0.1", 0), Handler)
        port = server.server_address[1]
        threading.Thread(target=server.serve_forever, daemon=True).start()
        base = f"http://127.0.0.1:{port}"
        escaped_base = base.replace("/", "\\/")

        try:
            (root / "index.html").write_text(
                '<script src="/a.js"></script>'
                '<link rel="modulepreload" href="/preload.js">'
                f'<script>ytcfg.set({{"jsUrl":"{escaped_base}\\/b.js?v=1"}});</script>'
            )
            (root / "a.js").write_text('import("/nested/c.js");\n')
            (root / "b.js").write_text("console.log('b');\n")
            (root / "preload.js").write_text("console.log('p');\n")
            (root / "nested").mkdir()
            (root / "nested" / "c.js").write_text("console.log('c');\n")
            # JS served at a URL with no .js extension (like /iframe_api).
            (root / "plain").write_text("console.log('plain');\n")

            out = root / "site"
            args = djs.build_parser().parse_args(
                ["download", "--url", base + "/", "--js-url", base + "/plain",
                 "--output", str(out), "--depth", "2", "--max-files", "20",
                 "--workers", "2", "--timeout", "5", "--all-hosts"]
            )
            with contextlib.redirect_stdout(io.StringIO()):
                rc = djs.run_download(args)

            manifest = json.loads((out / "manifest.json").read_text())
            paths = sorted(p.relative_to(out).as_posix() for p in out.rglob("*.js"))
            self.assertEqual(rc, 0)
            self.assertEqual(manifest["failed_count"], 0)
            self.assertEqual(manifest["file_count"], 5)
            for suffix in ("a.js", "preload.js", "nested/c.js", "plain.js"):
                self.assertTrue(any(p.endswith(suffix) for p in paths), (suffix, paths))
            self.assertTrue(any("/b__" in p for p in paths), paths)  # query-string collision guard
            self.assertEqual(
                (out / "127.0.0.1" / "a.js").read_text(), 'import("/nested/c.js");\n'
            )
            self.assertEqual(
                (out / "127.0.0.1" / "plain.js").read_text(), "console.log('plain');\n"
            )
        finally:
            server.shutdown()
            server.server_close()

    def test_unreachable_seed_fails_cleanly(self):
        with tempfile.TemporaryDirectory() as td:
            args = djs.build_parser().parse_args(
                ["download", "--url", "http://127.0.0.1:1/", "--output", td + "/out",
                 "--timeout", "2", "--max-files", "5"]
            )
            with contextlib.redirect_stderr(io.StringIO()) as err, \
                    contextlib.redirect_stdout(io.StringIO()):
                rc = djs.run_download(args)
            self.assertEqual(rc, 2)
            self.assertIn("No seed page could be fetched", err.getvalue())


class ExtractionTests(unittest.TestCase):
    def test_extract_from_synthetic_zip(self):
        with tempfile.TemporaryDirectory() as td:
            root = pathlib.Path(td)
            with zipfile.ZipFile(root / "Demo-main.zip", "w") as zf:
                zf.writestr("Demo-main/src/app.tsx", "export const a = 1;\n")
                zf.writestr("Demo-main/.eslintrc.js", "module.exports = {};\n")
                zf.writestr("Demo-main/README.md", "not js")
            out = root / "out"
            args = djs.build_parser().parse_args(
                ["extract", "--source", str(root), "--output", str(out)]
            )
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(djs.run_extract(args), 0)
            self.assertEqual((out / "Demo-main" / "src" / "app.tsx").read_text(), "export const a = 1;\n")
            self.assertFalse((out / "Demo-main" / "README.md").exists())
            manifest = json.loads((out / "manifest.json").read_text())
            self.assertEqual(manifest["file_count"], 2)
            self.assertTrue((out / "FILES.md").is_file())

    @unittest.skipUnless((REPO / "youtube-js" / "manifest.json").is_file(), "run extract first")
    def test_checked_in_extraction_matches_archives(self):
        """Every extracted file must be byte-identical to its source inside the ZIP."""
        out = REPO / "youtube-js"
        manifest = json.loads((out / "manifest.json").read_text())
        caches: dict[str, zipfile.ZipFile] = {}
        try:
            for record in manifest["files"]:
                zf = caches.setdefault(
                    record["source_archive"], zipfile.ZipFile(REPO / record["source_archive"])
                )
                original = zf.read(record["source_path"])
                extracted = (out / record["path"]).read_bytes()
                self.assertEqual(
                    hashlib.sha256(extracted).hexdigest(), record["sha256"], record["path"]
                )
                self.assertEqual(extracted, original, record["path"])
        finally:
            for zf in caches.values():
                zf.close()
        self.assertEqual(manifest["file_count"], len(manifest["files"]))


if __name__ == "__main__":
    unittest.main(verbosity=2)

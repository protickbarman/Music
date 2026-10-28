#!/usr/bin/env python3
"""Collect JavaScript / TypeScript files, two ways.

    extract   Pull every JS/TS source file out of the .zip archives in this
              repository. Fully offline; this is what produced ``youtube-js/``.
    download  Crawl a page (e.g. https://www.youtube.com/) for every .js URL it
              references and download each one. Needs unrestricted internet --
              many sandboxes (including the one this repo was built in) block
              youtube.com, so use this mode on your own machine.

Only the Python standard library is used.

Examples
--------
    python3 scripts/download_js.py extract
    python3 scripts/download_js.py extract --source . --output youtube-js --dry-run
    python3 scripts/download_js.py download
    python3 scripts/download_js.py download --url https://www.youtube.com/ \
        --url 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' \
        --js-url https://www.youtube.com/iframe_api --depth 2 --max-files 100

The ``download`` mode is for files you are allowed to fetch. YouTube's own JS
bundles are Google's copyrighted code and are subject to YouTube's Terms of
Service; respect both when using it.
"""

from __future__ import annotations

import argparse
import hashlib
import html.parser
import json
import os
import re
import shutil
import sys
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath

JS_EXTENSIONS = (".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".mts", ".cts")
DEFAULT_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)
REPO_ROOT = Path(__file__).resolve().parent.parent

# Matches absolute, protocol-relative and root-relative .js URLs, with or
# without a query string. YouTube embeds many of them in inline ytcfg JSON.
URL_RE = re.compile(
    r"""(?<![\w@])(?:https?:)?//[^\s"'<>()\\]+?\.js(?:[?#][^\s"'<>()\\]*)?""",
    re.IGNORECASE | re.VERBOSE,
)
REL_RE = re.compile(
    r"""(?:^|["'(=])(/[A-Za-z0-9_.~%/+@-]+?\.js(?:[?#][A-Za-z0-9_.~%/+@=&-]*)?)(?=["')\s,<>])""",
    re.IGNORECASE | re.VERBOSE,
)
UNSAFE_PART = re.compile(r"[^A-Za-z0-9._~@-]+")
# ZIP member names only need the truly problematic characters replaced;
# parentheses/brackets (e.g. Expo Router's "(tabs)") must survive untouched.
UNSAFE_ZIP_PART = re.compile(r'[\x00-\x1f<>:"|?*]+')


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def atomic_write(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_bytes(data)
    os.replace(tmp, path)


def write_json(path: Path, payload: dict) -> None:
    atomic_write(path, (json.dumps(payload, indent=2, ensure_ascii=False) + "\n").encode("utf-8"))


def safe_zip_path(name: str) -> PurePosixPath | None:
    """Reject absolute paths, ``..`` traversal, drive letters and backslashes."""
    name = name.replace("\\", "/")
    parts = [p for p in name.split("/") if p not in ("", ".")]
    if not parts or name.startswith("/") or ".." in parts or ":" in parts[0]:
        return None
    return PurePosixPath(*[UNSAFE_ZIP_PART.sub("_", p) for p in parts])


def is_js(name: str) -> bool:
    return name.lower().endswith(JS_EXTENSIONS)


# --------------------------------------------------------------------------- #
# extract
# --------------------------------------------------------------------------- #
def collect_archives(source: Path, output: Path, explicit: list[str] | None) -> list[Path]:
    if explicit:
        zips = [Path(p) for p in explicit]
        missing = [str(p) for p in zips if not p.is_file()]
        if missing:
            raise SystemExit("archive(s) not found: " + ", ".join(missing))
        return zips
    zips = sorted(p for p in source.glob("*.zip") if p.is_file())
    # Never recurse into a previous extraction.
    try:
        out_resolved = output.resolve()
        zips = [p for p in zips if out_resolved not in p.resolve().parents]
    except OSError:
        pass
    return zips


def run_extract(args: argparse.Namespace) -> int:
    source = Path(args.source).resolve()
    output = Path(args.output)
    if not source.is_dir():
        raise SystemExit(f"source directory does not exist: {source}")

    if args.clean and not args.dry_run and output.exists():
        resolved_out = output.resolve()
        if resolved_out in (source, REPO_ROOT) or len(resolved_out.parts) < 3:
            raise SystemExit(f"refusing to --clean unsafe output directory: {output}")
        shutil.rmtree(output)
        print(f"  cleaned previous output: {output}/")

    archives = collect_archives(source, output, args.zips)
    if not archives:
        raise SystemExit(f"no .zip archives found in {source}")

    files: list[dict] = []
    projects: list[dict] = []
    planned: list[tuple[Path, bytes, dict]] = []

    for archive in archives:
        project = archive.stem
        count, total = 0, 0
        with zipfile.ZipFile(archive) as zf:
            entries = [i for i in zf.infolist() if not i.is_dir() and is_js(i.filename)]
            for info in entries:
                clean = safe_zip_path(info.filename)
                if clean is None:
                    print(f"  ! skipped unsafe path in {archive.name}: {info.filename}", file=sys.stderr)
                    continue
                # Archives here wrap everything in a single root folder named
                # after the archive. Strip it so output paths stay readable.
                parts = list(clean.parts)
                if len(parts) > 1 and parts[0] == project:
                    parts = parts[1:]
                rel = PurePosixPath(*parts)
                dest = output / project / Path(*rel.parts)
                data = zf.read(info)
                record = {
                    "project": project,
                    "source_archive": archive.name,
                    "source_path": info.filename,
                    "path": dest.relative_to(output).as_posix(),
                    "extension": "".join(rel.suffixes[-2:]) if rel.name.endswith(".d.ts") else rel.suffix.lower(),
                    "size_bytes": len(data),
                    "sha256": sha256(data),
                }
                planned.append((dest, data, record))
                files.append(record)
                count += 1
                total += len(data)
        projects.append(
            {"project": project, "archive": archive.name, "js_files": count, "total_bytes": total}
        )
        print(f"  {archive.name}: {count} JS/TS files ({total:,} bytes)")

    if args.dry_run:
        print(f"\n[dry run] would extract {len(files)} files into {output}/")
        for dest, _, _ in planned[:15]:
            print("   ", dest.as_posix())
        if len(planned) > 15:
            print(f"    ... and {len(planned) - 15} more")
        return 0

    for dest, data, _ in planned:
        atomic_write(dest, data)

    manifest = {
        "mode": "extract",
        "generated_at": utc_now(),
        "source_directory": str(source),
        "output_directory": output.as_posix(),
        "extensions": list(JS_EXTENSIONS),
        "file_count": len(files),
        "total_bytes": sum(f["size_bytes"] for f in files),
        "projects": projects,
        "files": files,
    }
    write_json(Path(args.manifest) if args.manifest else output / "manifest.json", manifest)
    write_index(output, projects, files)

    print(
        f"\nExtracted {len(files)} files ({manifest['total_bytes']:,} bytes) "
        f"from {len(archives)} archives into {output}/"
    )
    print(f"Manifest: {(Path(args.manifest) if args.manifest else output / 'manifest.json').as_posix()}")
    return 0


def write_index(output: Path, projects: list[dict], files: list[dict]) -> None:
    lines = [
        "# Extracted JavaScript / TypeScript files",
        "",
        f"Generated by `python3 scripts/download_js.py extract` on {utc_now()}.",
        "",
        "| Project | JS/TS files | Total size |",
        "| --- | ---: | ---: |",
    ]
    for p in projects:
        lines.append(f"| `{p['project']}` | {p['js_files']} | {p['total_bytes']:,} bytes |")
    lines += [
        "",
        "Full machine-readable details (source path, size, SHA-256) are in `manifest.json`.",
        "",
    ]
    by_project: dict[str, list[dict]] = OrderedDict()
    for f in files:
        by_project.setdefault(f["project"], []).append(f)
    for project, entries in by_project.items():
        lines += [f"## {project}", ""]
        if not entries:
            lines += ["_No JS/TS files in this archive (it is a native Android/Java project)._", ""]
            continue
        for f in sorted(entries, key=lambda x: x["path"]):
            lines.append(f"- `{f['path']}` — {f['size_bytes']:,} bytes")
        lines.append("")
    atomic_write(output / "FILES.md", ("\n".join(lines) + "\n").encode("utf-8"))


# --------------------------------------------------------------------------- #
# download
# --------------------------------------------------------------------------- #
class ScriptSrcParser(html.parser.HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.srcs: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        a = dict(attrs)
        if tag == "script" and a.get("src"):
            self.srcs.append(a["src"])
        elif tag == "link" and "modulepreload" in (a.get("rel") or "") and a.get("href"):
            self.srcs.append(a["href"])


def unescape_js_urls(text: str) -> str:
    return text.replace(r"\/", "/").replace(r"\u002F", "/").replace(r"\u002f", "/")


def registrable(host: str) -> str:
    host = host.split(":", 1)[0].lower()
    if re.fullmatch(r"[\d.]+", host):  # IP address / localhost
        return host
    parts = host.split(".")
    return ".".join(parts[-2:]) if len(parts) > 1 else host


def host_allowed(host: str, seed_host: str, all_hosts: bool) -> bool:
    host = host.split(":", 1)[0].lower()
    seed_host = seed_host.split(":", 1)[0].lower()
    if all_hosts or host == seed_host:
        return True
    base = registrable(seed_host)
    if host == base or host.endswith("." + base):
        return True
    if base == "youtube.com" and any(
        host == d or host.endswith("." + d)
        for d in ("ytimg.com", "googlevideo.com", "gstatic.com", "google.com")
    ):
        return True
    return False


def extract_js_urls(page_url: str, body: str, all_hosts: bool) -> list[str]:
    body = unescape_js_urls(body)
    candidates: list[str] = []
    parser = ScriptSrcParser()
    try:
        parser.feed(body)
    except Exception:
        pass
    candidates += parser.srcs
    candidates += URL_RE.findall(body)
    candidates += REL_RE.findall(body)

    seed_host = urllib.parse.urlsplit(page_url).hostname or ""
    out: list[str] = []
    seen: set[str] = set()
    for raw in candidates:
        raw = raw.strip().rstrip("'\"`,;")
        if not raw or raw.startswith("data:") or raw.startswith("blob:"):
            continue
        url = urllib.parse.urljoin(page_url, raw)
        parts = urllib.parse.urlsplit(url)
        if parts.scheme not in ("http", "https") or not parts.hostname:
            continue
        if not parts.path.lower().endswith(".js"):
            continue
        if not host_allowed(parts.hostname, seed_host, all_hosts):
            continue
        url = urllib.parse.urlunsplit((parts.scheme, parts.netloc, parts.path, parts.query, ""))
        if url not in seen:
            seen.add(url)
            out.append(url)
    return out


def url_to_path(url: str, used: dict[str, str], out_root: Path) -> Path:
    parts = urllib.parse.urlsplit(url)
    host = UNSAFE_PART.sub("_", parts.hostname or "unknown-host")
    segments = [UNSAFE_PART.sub("_", s) for s in parts.path.split("/") if s and s not in (".", "..")]
    if not segments:
        segments = ["index.js"]
    elif not segments[-1].lower().endswith(".js"):
        # Endpoints such as /iframe_api serve JS without a .js extension.
        segments[-1] += ".js"
    stem = segments[-1][:-3]
    suffix = ".js"
    if parts.query:
        stem += "__" + sha256(url.encode())[:8]
    rel = Path(host, *segments[:-1], stem + suffix)
    candidate = rel.as_posix()
    if candidate in used and used[candidate] != url:
        stem += "__" + sha256(url.encode())[:8]
        rel = Path(host, *segments[:-1], stem + suffix)
        candidate = rel.as_posix()
    used[candidate] = url
    return out_root / rel


def fetch(url: str, timeout: float, ua: str) -> tuple[bytes, str]:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": ua,
            "Accept": "*/*",
            "Accept-Language": "en-US,en;q=0.9",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read(), resp.headers.get("Content-Type", "")


def run_download(args: argparse.Namespace) -> int:
    output = Path(args.output)
    seeds = args.url or [
        "https://www.youtube.com/",
        # Inline JS that contains the current player hash and widgetapi URL.
        "https://www.youtube.com/iframe_api",
    ]
    explicit_js = args.js_url or []
    seed_hosts = [urllib.parse.urlsplit(u).hostname or "" for u in seeds + explicit_js]
    all_hosts = args.all_hosts

    seen_urls: set[str] = set()
    queue: list[str] = []
    for url in explicit_js:
        if url not in seen_urls:
            seen_urls.add(url)
            queue.append(url)

    failures: list[str] = []
    for seed in seeds:
        try:
            body_bytes, ctype = fetch(seed, args.timeout, args.user_agent)
        except (urllib.error.URLError, OSError, ValueError) as exc:
            failures.append(f"{seed}: {exc}")
            print(f"  ! could not fetch seed page {seed}: {exc}", file=sys.stderr)
            continue
        body = body_bytes.decode("utf-8", errors="replace")
        found = extract_js_urls(seed, body, all_hosts)
        print(f"  {seed}: {len(found)} .js URLs found ({ctype or 'unknown content type'})")
        for u in found:
            if u not in seen_urls:
                seen_urls.add(u)
                queue.append(u)

    if len(failures) == len(seeds):
        print(
            "\n! No seed page could be fetched. This sandbox has no route to youtube.com\n"
            "  (allowed hosts: github.com, codeload.github.com, api.github.com,\n"
            "  registry.npmjs.org, pypi.org, files.pythonhosted.org).\n"
            "  Run `download` on a machine with unrestricted internet, or use `extract`,\n"
            "  which works fully offline.",
            file=sys.stderr,
        )
        if not queue:
            return 2

    results: list[dict] = []
    used_paths: dict[str, str] = {}
    frontier = queue
    for depth in range(1, args.depth + 1):
        if not frontier:
            break
        if len(results) + len(frontier) > args.max_files:
            frontier = frontier[: max(0, args.max_files - len(results))]
        print(f"  depth {depth}: downloading {len(frontier)} file(s)")

        if args.dry_run:
            for u in frontier:
                print("   ", u)
            break

        next_frontier: list[str] = []

        def work(url: str) -> tuple[str, dict]:
            try:
                data, ctype = fetch(url, args.timeout, args.user_agent)
                return url, {
                    "url": url,
                    "status": "ok",
                    "content_type": ctype,
                    "size_bytes": len(data),
                    "sha256": sha256(data),
                    "_data": data,
                }
            except (urllib.error.HTTPError, urllib.error.URLError, OSError, ValueError) as exc:
                return url, {"url": url, "status": "error", "error": f"{type(exc).__name__}: {exc}"}

        with ThreadPoolExecutor(max_workers=args.workers) as pool:
            futures = [pool.submit(work, u) for u in frontier]
            for fut in as_completed(futures):
                url, rec = fut.result()
                data = rec.pop("_data", None)
                if data is not None:
                    dest = url_to_path(url, used_paths, output)
                    atomic_write(dest, data)
                    rec["path"] = dest.relative_to(output).as_posix()
                    if depth < args.depth:
                        text = data.decode("utf-8", errors="replace")
                        for nested in extract_js_urls(url, text, all_hosts):
                            if nested not in seen_urls:
                                seen_urls.add(nested)
                                next_frontier.append(nested)
                else:
                    print(f"  ! failed {url}: {rec.get('error')}", file=sys.stderr)
                results.append(rec)

        frontier = next_frontier
        if len(results) >= args.max_files:
            print(f"  ! stopping at --max-files={args.max_files}", file=sys.stderr)
            break

    if args.dry_run:
        print(f"\n[dry run] would download {len(set(frontier)) if frontier else len(queue)} file(s)")
        return 0

    ok = [r for r in results if r["status"] == "ok"]
    manifest = {
        "mode": "download",
        "generated_at": utc_now(),
        "seed_urls": seeds,
        "seed_hosts": seed_hosts,
        "depth": args.depth,
        "max_files": args.max_files,
        "output_directory": output.as_posix(),
        "discovered_urls": len(seen_urls),
        "file_count": len(ok),
        "failed_count": len(results) - len(ok),
        "total_bytes": sum(r["size_bytes"] for r in ok),
        "files": sorted(results, key=lambda r: r["url"]),
    }
    write_json(Path(args.manifest) if args.manifest else output / "manifest.json", manifest)
    print(
        f"\nDownloaded {len(ok)} file(s) ({manifest['total_bytes']:,} bytes), "
        f"{manifest['failed_count']} failure(s), into {output}/"
    )
    print(f"Manifest: {(Path(args.manifest) if args.manifest else output / 'manifest.json').as_posix()}")
    return 0 if ok else 1


# --------------------------------------------------------------------------- #
def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description="Extract JS/TS files from ZIP archives, or download the .js files a web page uses.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    sub = p.add_subparsers(dest="command")

    e = sub.add_parser("extract", help="extract JS/TS files from .zip archives (offline)")
    e.add_argument("--source", default=str(REPO_ROOT), help="directory holding the .zip archives (default: repo root)")
    e.add_argument("--output", default="youtube-js", help="destination directory (default: youtube-js)")
    e.add_argument("--zips", nargs="*", help="explicit list of archives instead of --source")
    e.add_argument("--manifest", help="manifest path (default: <output>/manifest.json)")
    e.add_argument("--clean", action="store_true", help="remove the output directory before extracting")
    e.add_argument("--dry-run", action="store_true", help="list what would be extracted, write nothing")

    d = sub.add_parser("download", help="crawl a page and download every referenced .js file")
    d.add_argument("--url", action="append", help="seed page URL (repeatable; default: YouTube homepage + /iframe_api)")
    d.add_argument("--js-url", action="append", help="explicit JS URL to download even if its path has no .js extension")
    d.add_argument("--output", default="youtube-js-site", help="destination directory (default: youtube-js-site)")
    d.add_argument("--depth", type=int, default=1, help="also scan downloaded JS for more .js URLs, up to this depth (default: 1)")
    d.add_argument("--max-files", type=int, default=200, help="safety cap on downloaded files (default: 200)")
    d.add_argument("--workers", type=int, default=8, help="parallel downloads (default: 8)")
    d.add_argument("--timeout", type=float, default=20.0, help="per-request timeout in seconds (default: 20)")
    d.add_argument("--user-agent", default=DEFAULT_UA, help="User-Agent header")
    d.add_argument("--all-hosts", action="store_true", help="do not restrict downloads to YouTube/seed-related hosts")
    d.add_argument("--manifest", help="manifest path (default: <output>/manifest.json)")
    d.add_argument("--dry-run", action="store_true", help="list discovered .js URLs, download nothing")

    return p


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    raw = list(sys.argv[1:] if argv is None else argv)
    if raw and raw[0] in ("-h", "--help"):
        parser.print_help()
        return 0
    if not raw or raw[0].startswith("-"):
        # Convenience default: options with no subcommand mean the offline
        # `extract` mode, e.g. `download_js.py --source . --dry-run`.
        raw = ["extract"] + raw
    args = parser.parse_args(raw)
    if args.command == "download":
        if args.depth < 1 or args.depth > 5:
            parser.error("--depth must be between 1 and 5")
        if args.max_files < 1:
            parser.error("--max-files must be >= 1")
        return run_download(args)
    return run_extract(args)


if __name__ == "__main__":
    sys.exit(main())

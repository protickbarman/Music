# Music

This repository holds four open-source music-player source archives. Per request, all of
their **JavaScript / TypeScript files have been downloaded (extracted) into real, browsable
folders**, and a reusable script that does the collecting is included.

## What's here

| Path | What it is |
| --- | --- |
| `Tuneify-master.zip`, `WhiteHole-main.zip`, `audify-android-music-app-main.zip`, `limusic-master.zip` | Original source archives (unchanged). |
| `youtube-js/` | **364 JS/TS files (1,130,322 bytes)** extracted from those archives, one folder per project. |
| `youtube-js/manifest.json` | Machine-readable index: source archive, original path inside the ZIP, byte size, SHA-256 of every file. |
| `youtube-js/FILES.md` | Human-readable index with per-project counts and a full file list. |
| `scripts/download_js.py` | Zero-dependency Python 3 collector — `extract` (offline ZIPs) and `download` (crawl a live site). |
| `scripts/test_download_js.py` | Unit + end-to-end tests (stdlib `unittest`). |
| `.gitignore` | Keeps Python caches and downloaded site bundles out of Git. |

Extracted file counts:

| Project | JS/TS files | Size |
| --- | ---: | ---: |
| `Tuneify-master` | 196 | 316,000 bytes |
| `WhiteHole-main` | 53 | 255,570 bytes |
| `limusic-master` | 115 | 558,752 bytes |
| `audify-android-music-app-main` | 0 | — (native Java Android app, contains no JS/TS) |

Extensions collected: `.js`, `.jsx`, `.mjs`, `.cjs`, `.ts`, `.tsx`, `.mts`, `.cts`
(includes `.d.ts` declaration files). Folder structure from each archive is preserved.

> **Scope note:** these are the JS/TS *sources of the four music apps*, not Google's
> proprietary `youtube.com` bundles. If you wanted the live site's own scripts
> (`iframe_api`, `www-widgetapi.js`, `base.js`, `desktop_polymer.js`, …), use the
> `download` mode below — it crawls a page and saves every `.js` file that page references.

## Re-run the extraction (offline, works anywhere)

```bash
python3 scripts/download_js.py extract                     # default: repo ./*.zip -> youtube-js/
python3 scripts/download_js.py extract --clean             # regenerate from scratch
python3 scripts/download_js.py extract --dry-run           # preview without writing
python3 scripts/download_js.py extract --source /path/to/zips --output /tmp/js-out
python3 scripts/download_js.py extract --zips Tuneify-master.zip WhiteHole-main.zip
```

Files are written atomically and the manifest/`FILES.md` are regenerated; `--clean` removes
a previous output directory first so renamed/deleted sources cannot leave stale files behind.
Extraction preserves original paths (including Expo Router's `(tabs)` folders), refuses unsafe
ZIP paths (absolute paths, `..` traversal, drive letters), and keeps byte-for-byte identical
contents (verified against the ZIPs by SHA-256 in the tests).

## Download JS from a live site

```bash
python3 scripts/download_js.py download                       # homepage + /iframe_api
python3 scripts/download_js.py download \
    --url https://www.youtube.com/ --url 'https://www.youtube.com/watch?v=VIDEO_ID' \
    --js-url https://www.youtube.com/iframe_api \
    --depth 2 --max-files 200 --workers 8
python3 scripts/download_js.py download --dry-run             # list URLs only
```

`download` extracts `.js` URLs from `<script src>`, `modulepreload` links, inline
`ytcfg` JSON (including `\/`-escaped URLs), and plain absolute/relative `.js`
strings; `--js-url` adds endpoints that serve JS without a `.js` extension
(e.g. `/iframe_api`), and `--depth` follows `.js` URLs found inside downloaded
scripts. Third-party hosts are filtered out unless `--all-hosts` is given.
Results go to `youtube-js-site/` (gitignored) with a `manifest.json` containing URL,
content type, byte size and SHA-256 for each file.

**Network limitation:** this sandbox can only reach `github.com`, `codeload.github.com`,
`api.github.com`, `registry.npmjs.org`, `pypi.org` and `files.pythonhosted.org`. Direct
`youtube.com` connections fail, so `download` exits with a clear error here. Its crawling,
host filtering, recursion and manifest logic were verified against a local HTTP fixture
(see tests). Run that mode on a machine with unrestricted internet.

**Legal:** YouTube's JS bundles are copyrighted Google code and fetching them is subject
to YouTube's Terms of Service. Only use `download` where you have permission.
The extracted files in `youtube-js/` remain under the licenses of their original
projects (see the `LICENSE` file inside each ZIP).

## Tests

```bash
python3 -m unittest discover -s scripts -v
```

No third-party packages required — Python 3.9+ and the standard library only.

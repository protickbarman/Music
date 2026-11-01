# `xroMusic` — Complete A-to-Z Master Architecture, Endpoints & Implementation Blueprint

> **Purpose of this Document**: This single Markdown file contains **every endpoint, server URL, client identity, HTTP header, JSON payload, protobuf parameter, cipher regex landmark, decryption algorithm, proxy design, and fallback waterfall** discovered, tested, and verified across all 14 YouTube Music / multi-source repositories and 4 music app archives in this workspace.
>
> **For Any AI Agent or Developer**: You can build a complete, production-grade, zero-API-key Music Streaming Application (Web, Desktop Tauri/Electron, or Mobile React Native/Flutter) directly from this specification and the accompanying implementation in `/home/user/Music/youtube-music-js/xroMusic.js` and `/home/user/Music/youtube-music-js/unified-music-api.js`.

---

## Table of Contents

1. [Workspace Files & Reference Modules](#1-workspace-files--reference-modules)
2. [High-Level System Architecture & Data Flow](#2-high-level-system-architecture--data-flow)
3. [Why Existing Playback Implementations Fail in 2026 & How `xroMusic` Fixes Every One](#3-why-existing-playback-implementations-fail-in-2026--how-xromusic-fixes-every-one)
4. [YouTube Music & YouTube InnerTube Complete Specification](#4-youtube-music--youtube-innertube-complete-specification)
   - [4.1 Public API Key, Base URLs & Live Asset Hashes](#41-public-api-key-base-urls--live-asset-hashes)
   - [4.2 All 8 InnerTube Client Identities (`CLIENTS`)](#42-all-8-innertube-client-identities-clients)
   - [4.3 `visitorData` Extraction (`sw.js_data`) & `poToken` Minting (`bgutils-js`)](#43-visitordata-extraction-swjs_data--potoken-minting-bgutils-js)
   - [4.4 All Catalog, Search, Browse, Radio & Lyrics InnerTube Endpoints](#44-all-catalog-search-browse-radio--lyrics-innertube-endpoints)
5. [Universal YouTube Player Cipher (`s`) & Anti-Throttle (`n`) Engine (`node:vm` + Faraday)](#5-universal-youtube-player-cipher-s--anti-throttle-n-engine-nodevm--faraday)
   - [5.1 Why ES5 (`player_ias`) vs. ES6 (`player_es6`) Breaks Standard Regexes](#51-why-es5-player_ias-vs-es6-player_es6-breaks-standard-regexes)
   - [5.2 Universal `.set("alr","yes")` URL-Builder Regex & `node:vm` Prototype Hook](#52-universal-setalryes-url-builder-regex--nodevm-prototype-hook)
   - [5.3 Faraday / Zemer Assembler Landmark Extractor & Pre-Derived Registry](#53-faraday--zemer-assembler-landmark-extractor--pre-derived-registry)
6. [Unbreakable Stream Resolution, Tail-Range Validation & 4 MiB Bounded-Range Proxy](#6-unbreakable-stream-resolution-tail-range-validation--4-mib-bounded-range-proxy)
   - [6.1 Multi-Client Stream Waterfall & Format Ranking (`selectBestAudioFormat`)](#61-multi-client-stream-waterfall--format-ranking-selectbestaudioformat)
   - [6.2 Last-256-Byte Tail Probe (`validateStreamUrl`) — Blocking 1 MiB-Capped Streams](#62-last-256-byte-tail-probe-validatestreamurl--blocking-1-mib-capped-streams)
   - [6.3 Loopback 4 MiB Bounded-Range Audio Proxy (`BoundedRangeAudioProxy`)](#63-loopback-4-mib-bounded-range-audio-proxy-boundedrangeaudioproxy)
7. [JioSaavn Complete API, OpenSSL 3.0 `des-ede3` 320kbps Decryption & Geo-Block Bypass](#7-jiosaavn-complete-api-openssl-30-des-ede3-320kbps-decryption--geo-block-bypass)
   - [7.1 Complete JioSaavn Endpoint Status Table (`jiosaavn.com/api.php`)](#71-complete-jiosaavn-endpoint-status-table-jiosaavncomapiphp)
   - [7.2 OpenSSL 3.0 Native 320kbps AAC Decryption (`des-ede3` Key `"38346591"`)](#72-openssl-30-native-320kbps-aac-decryption-des-ede3-key-38346591)
   - [7.3 The Artist-Playlist Geo-Block Bypass (`JIOSAAVN_320_BYPASS`)](#73-the-artist-playlist-geo-block-bypass-jiosaavn_320_bypass)
8. [Internet Archive (`archive.org`) DRM-Free MP3 & Lossless FLAC API](#8-internet-archive-archiveorg-drm-free-mp3--lossless-flac-api)
9. [6-Provider Synced Lyrics Waterfall (Word-by-Word TTML, KPOE JSON & LRC)](#9-6-provider-synced-lyrics-waterfall-word-by-word-ttml-kpoe-json--lrc)
10. [Spotify Keyless Embed Importer, ListenBrainz & Last.fm Scrobbling](#10-spotify-keyless-embed-importer-listenbrainz--lastfm-scrobbling)
11. [Complete `xroMusic` Client API Reference (`xroMusic.*` — All 35 Operations)](#11-complete-xromusic-client-api-reference-xromusic--all-35-operations)
12. [Live Case Study: Maroon 5 — "Memories" Complete Multi-Source Payload](#12-live-case-study-maroon-5--memories-complete-multi-source-payload)
13. [Step-by-Step Full-Stack App Implementation Guide (Backend + Frontend)](#13-step-by-step-full-stack-app-implementation-guide-backend--frontend)

---

## 1. Workspace Files & Reference Modules

All implementation code, player bundles, cipher registries, and tests are located in `/home/user/Music/youtube-music-js/`:

| Path | Description |
| :--- | :--- |
| `/home/user/Music/youtube-music-js/xroMusic.js` | **Main `xroMusic` Client Module** exposing all 35 operations (`xroMusic.init`, `xroMusic.search`, `xroMusic.stream`, `xroMusic.lyrics`, `xroMusic.saavn*`, `xroMusic.archive*`, `xroMusic.queue.*`, `xroMusic.library.*`, etc.). |
| `/home/user/Music/youtube-music-js/xroMusic.d.ts` | Full TypeScript type declarations for `xroMusic`. |
| `/home/user/Music/youtube-music-js/unified-music-api.js` | Core engine implementing `UniversalCipherEngine`, `BoundedRangeAudioProxy`, `StreamFetchManager`, `UnifiedMusicAPI`, `decryptJioSaavnMediaUrl`, `validateStreamUrl`, and `resolveSyncedLyrics`. |
| `/home/user/Music/youtube-music-js/test-xroMusic-all.js` | Automated end-to-end test suite verifying all `xroMusic.*` operations (`node youtube-music-js/test-xroMusic-all.js`). |
| `/home/user/Music/youtube-music-js/test-unified-api.js` | Low-level unit tests for ES5/ES6 `base.js` ciphering, `11a45ffb` registry lookup, `sw.js_data` parsing, tail-range validation, and 4 MiB proxy chunking. |
| `/home/user/Music/youtube-music-js/cipher-configs/` | `faraday_player_configs.json`, `zemer_player_configs.json`, `limusic_bundled_cipher_configs.json`, `player-registry.json`, `innertube_clients.json`, `po_token.html`. |
| `/home/user/Music/youtube-music-js/youtube-player-scripts/` | Full unchunked YouTube player bundles (`player_ias.vflset/en_US/base.js` [ES5], `player_es6.vflset/en_US/base.js` [ES6], `tv-player-ias.vflset/tv-player-ias.js`). |
| `/home/user/Music/youtube-music-js/reserver-ytb-js/` | Full `hoangquyet1404/Reserver-YTB-Web` implementation + `test/fixtures/player/base-ea6f527e.js`. |
| `/home/user/Music/youtube-music-js/faraday-cipher-ts/` | `MetrolistGroup/faraday` cipher deriver, parser, and runtime TypeScript source. |
| `/home/user/Music/youtube-music-js/live-ytm-scripts/` | Live captured `sw.js`, `sw.js_data.json`, `iframe_api.js`, `serviceworker-kevlar-appshell.js`, and Polymer runtime bundles. |

---

## 2. High-Level System Architecture & Data Flow

```text
┌───────────────────────────────────────────────────────────────────────────────────┐
│                               xroMusic Client API                                 │
│  xroMusic.search() | xroMusic.stream() | xroMusic.lyrics() | xroMusic.saavnStream │
└───────────────┬───────────────────────────────┬───────────────────────┬───────────┘
                │                               │                       │
      ┌─────────▼──────────┐         ┌──────────▼──────────┐   ┌────────▼────────┐
      │ 1. CATALOG ENGINE  │         │  2. STREAM ENGINE   │   │ 3. LYRICS ENGINE│
      │ - YTM (WEB_REMIX)  │         │  - Multi-Client YT  │   │ - Boidu (TTML)  │
      │ - JioSaavn API v4  │         │  - JioSaavn 320 AAC │   │ - LyricsPlus    │
      │ - Internet Archive │         │  - Internet Archive │   │ - YTM IOS_MUSIC │
      │ - Spotify Embed    │         │  - StreamFetchCache │   │ - Kugou / 163   │
      └────────────────────┘         └──────────┬──────────┘   └─────────────────┘
                                                │
                       ┌────────────────────────▼────────────────────────┐
                       │     YouTube Stream Resolution & Validation      │
                       │  1. VisitorData (sw.js_data) + PoToken (bgutils)│
                       │  2. Waterfall: WEB_REMIX -> VISIONOS ->         │
                       │     TVHTML5_SIMPLY -> IOS -> ANDROID_VR         │
                       │  3. UniversalCipherEngine (node:vm ES5 + ES6):  │
                       │     Deciphers `s` (sig) & transforms `n` param  │
                       │  4. Tail-Range Validator (last 256 bytes probe) │
                       │     Rejects 1 MiB-capped googlevideo URLs       │
                       │  5. BoundedRangeAudioProxy (127.0.0.1 loopback) │
                       │     Converts Range: bytes=0- into 4 MiB chunks  │
                       └─────────────────────────────────────────────────┘
```

---

## 3. Why Existing Playback Implementations Fail in 2026 & How `xroMusic` Fixes Every One

| # | Failure Mode in Older Repos | Affected Repos | How `xroMusic` Solves It |
| :- | :--- | :--- | :--- |
| **1** | **Deprecated `ANDROID` (`16.02` / `17.31.35`) & `IOS` (`19.09.3`) Clients**: InnerTube returns `400 Bad Request` or `UNPLAYABLE`. | `atomm`, `music-x`, `soundrex-backend` | Uses active 2026 client identities: `WEB_REMIX` (`1.20261027.10.00`), `VISIONOS` (`0.1`, `clientId: "101"`), `TVHTML5_SIMPLY` (`1.0`, `clientId: "75"`), and `IOS` (`21.03.1`). |
| **2** | **`ANDROID_VR` 1 MiB Stream Cap (45-Second Cutoff)**: `ANDROID_VR` (`1.43.32` / `1.65.10`) returns `200 OK` on `/player` and `206` on `Range: bytes=0-1024`, **but `googlevideo.com` returns `403 Forbidden` for any byte past `1048576` (1 MiB)**. | `Music-Aura`, `Glass-Music`, `Mornye-Extension` | **`validateStreamUrl()`** probes the **last 256 bytes** (`Range: bytes={contentLength-256}-{contentLength-1}`) with `Accept-Encoding: identity`. Any 1 MiB-capped URL fails the tail probe immediately and falls through to the next client. |
| **3** | **ES5 (`player_ias`) vs. ES6 (`player_es6`) Cipher Regex Mismatch**: `Reserver-YTB-Web` only matched ES6 default arguments `function(a,b="",c="")`, failing on `player_ias` where Closure Compiler emits `m=m===void 0?"":m`. | `Reserver-YTB-Web`, `ytmusic.js`, `innertube.js` | **`UniversalCipherEngine`** uses `UNIVERSAL_URL_BUILDER_REGEX` (matching both ES5 and ES6 `.set("alr","yes")` URL builders) + `node:vm` prototype invocation + Faraday/Zemer `player_configs.json` fallback. |
| **4** | **`googlevideo.com` Open-Ended Range Throttling (~32 KB/s)**: Standard `<audio>`, `mpv`, and `ffmpeg` players send `Range: bytes=0-` (open-ended), which `googlevideo.com` throttles to ~2x realtime even when `n` is transformed. | Almost all web/desktop players | **`BoundedRangeAudioProxy`** runs a local loopback server that intercepts open-ended requests and fetches **4 MiB bounded byte ranges (`Range: bytes=X-Y`)** upstream at full CDN speed (~9.4 MB/s). |
| **5** | **User Uploads Returning `403` or Expiring in 32 Seconds**: Private uploads stream from `*.c.youtube.com` (not `*.googlevideo.com`) and expire in 32s without `playlistId: "MLPT"`. | Most InnerTube wrappers | Passes `playlistId: "MLPT"` for uploads, uses `UPLOAD_FALLBACK_ORDER` (`WEB_REMIX` $\rightarrow$ `TVHTML5` $\rightarrow$ `WEB_CREATOR`), and recognizes `*.c.youtube.com` in `isYouTubeStreamHost()`. |
| **6** | **OpenSSL 3.0 / Node 18–22+ Crash on JioSaavn DES-ECB**: `crypto.createDecipheriv("des-ecb", ...)` throws `ERR_OSSL_EVP_UNSUPPORTED` on modern Node.js. | Node.js JioSaavn backends | Uses **Triple-DES EDE3 (`des-ede3`) with `K1 = K2 = K3 = "38346591"`** (`Buffer.from("38346591".repeat(3))`). Since $D_K(E_K(D_K(x))) \equiv D_K(x)$, it is mathematically identical to Single DES-ECB and runs natively in OpenSSL 3.0 with zero flags or dependencies. |
| **7** | **JioSaavn Geo-Blocked / Hidden Western Songs**: `search.getResults` hides tracks like Maroon 5's `"Memories"` (`rights.reason: "Unavailable"`) and only returns instrumental covers. | `Tuneify`, `WhiteHole`, `Music-Aura` | **`JIOSAAVN_320_BYPASS`** chains `autocomplete.get` $\rightarrow$ `playlist.getDetails` $\rightarrow$ `song.getDetails`, which still returns the original track's `encrypted_media_url` (`-RWAZc5D`) and decrypts to a working 320kbps AAC CDN URL. |
| **8** | **Lyrics Provider Outages (`lrclib.net` 502, `simpmusic` 403)**: Single-provider lyrics clients fail when `lrclib.net` is down. | Apps relying only on LRCLIB | **6-Provider Synced Lyrics Waterfall**: Boidu (`lyrics-api.boidu.dev/getLyrics` Apple Music word-timed TTML) $\rightarrow$ LyricsPlus $\rightarrow$ InnerTube `IOS_MUSIC` $\rightarrow$ Kugou $\rightarrow$ NetEase $\rightarrow$ QQ Music $\rightarrow$ LRCLIB. |

---

## 4. YouTube Music & YouTube InnerTube Complete Specification

### 4.1 Public API Key, Base URLs & Live Asset Hashes

* **Public InnerTube API Key** (No user key needed):
  ```text
  AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX30
  ```
* **Base Endpoints**:
  * **YouTube Music (`WEB_REMIX`, `IOS_MUSIC`)**: `https://music.youtube.com/youtubei/v1`
  * **YouTube Core (`VISIONOS`, `TVHTML5_SIMPLY`, `TVHTML5`, `WEB_CREATOR`, `IOS`, `ANDROID_VR`)**: `https://www.youtube.com/youtubei/v1`
* **Active Live Hashes (Verified)**:
  * **YouTube Player Bundle Hash**: `11a45ffb` (`sts: 20753`, `sig: "Qxa(1,2829,INPUT)"`, `nClass: "hq"`)
    * `https://www.youtube.com/iframe_api`
    * `https://www.youtube.com/s/player/11a45ffb/www-widgetapi.vflset/www-widgetapi.js`
    * `https://www.youtube.com/s/player/11a45ffb/player_ias.vflset/en_GB/base.js`
    * `https://www.youtube.com/s/player/11a45ffb/tv-player-ias.vflset/tv-player-ias.js`
  * **YouTube Music App-Shell Hash**: `ad9b01d0` (`WEB_REMIX` version `1.20261027.10.00`)
    * `https://music.youtube.com/sw.js`
    * `https://music.youtube.com/sw.js_data`
    * `https://music.youtube.com/s/ad9b01d0/serviceworker-music-appshell.js`
    * `https://music.youtube.com/s/ad9b01d0/music_polymer.js`

---

### 4.2 All 8 InnerTube Client Identities (`CLIENTS`)

Every InnerTube POST request requires:
1. Header `X-YouTube-Client-Name`: The **numeric `clientId` string** (e.g., `"67"` for `WEB_REMIX`, `"101"` for `VISIONOS`).
2. Header `X-YouTube-Client-Version`: The `clientVersion` string.
3. Header `X-Goog-Visitor-Id`: The `visitorData` string (`Cgt...`).
4. Body `context.client`: `{ clientName, clientVersion, hl, gl, visitorData, ... }`.

```json
{
  "WEB_REMIX": {
    "clientName": "WEB_REMIX",
    "clientVersion": "1.20261027.10.00",
    "clientId": "67",
    "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0",
    "endpointHost": "https://music.youtube.com/youtubei/v1",
    "loginSupported": true,
    "useSignatureTimestamp": true,
    "useWebPoTokens": true,
    "needsNTransform": true
  },
  "VISIONOS": {
    "clientName": "VISIONOS",
    "clientVersion": "0.1",
    "clientId": "101",
    "userAgent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
    "osName": "visionOS",
    "osVersion": "1.3.21O771",
    "deviceMake": "Apple",
    "deviceModel": "RealityDevice14,1",
    "endpointHost": "https://www.youtube.com/youtubei/v1",
    "loginSupported": false,
    "useSignatureTimestamp": false,
    "useWebPoTokens": false,
    "needsNTransform": false
  },
  "TVHTML5_SIMPLY": {
    "clientName": "TVHTML5_SIMPLY",
    "clientVersion": "1.0",
    "clientId": "75",
    "userAgent": "Mozilla/5.0 (ChromiumStylePlatform) Cobalt/25.lts.30.1034943-gold (unlike Gecko), Unknown_TV_Unknown_0/Unknown (Unknown, Unknown)",
    "endpointHost": "https://www.youtube.com/youtubei/v1",
    "loginSupported": false,
    "useSignatureTimestamp": true,
    "useWebPoTokens": true,
    "needsNTransform": true
  },
  "TVHTML5": {
    "clientName": "TVHTML5",
    "clientVersion": "7.20260707.07.00",
    "clientId": "7",
    "userAgent": "Mozilla/5.0 (ChromiumStylePlatform) Cobalt/25.lts.30.1034943-gold (unlike Gecko), Unknown_TV_Unknown_0/Unknown (Unknown, Unknown)",
    "endpointHost": "https://www.youtube.com/youtubei/v1",
    "loginSupported": true,
    "useSignatureTimestamp": true,
    "useWebPoTokens": false,
    "needsNTransform": true
  },
  "WEB_CREATOR": {
    "clientName": "WEB_CREATOR",
    "clientVersion": "1.20220726.00.00",
    "clientId": "62",
    "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0",
    "endpointHost": "https://www.youtube.com/youtubei/v1",
    "loginSupported": true,
    "loginRequired": true,
    "useSignatureTimestamp": true,
    "useWebPoTokens": true,
    "needsNTransform": true
  },
  "IOS": {
    "clientName": "IOS",
    "clientVersion": "21.03.1",
    "clientId": "5",
    "userAgent": "com.google.ios.youtube/21.03.1 (iPhone16,2; U; CPU iOS 18_2 like Mac OS X;)",
    "osName": "iPhone",
    "osVersion": "18.2.22C152",
    "deviceMake": "Apple",
    "deviceModel": "iPhone16,2",
    "endpointHost": "https://www.youtube.com/youtubei/v1",
    "requiresBoundedRange": true
  },
  "IOS_MUSIC": {
    "clientName": "IOS_MUSIC",
    "clientVersion": "7.01.05",
    "clientId": "26",
    "userAgent": "com.google.ios.youtubemusic/7.01.05 (iPhone16,2; U; CPU iOS 18_2 like Mac OS X;)",
    "osName": "iOS",
    "osVersion": "18.2.22C152",
    "deviceMake": "Apple",
    "deviceModel": "iPhone16,2",
    "endpointHost": "https://music.youtube.com/youtubei/v1"
  },
  "ANDROID_VR": {
    "clientName": "ANDROID_VR",
    "clientVersion": "1.65.10",
    "clientId": "28",
    "userAgent": "com.google.android.apps.youtube.vr.oculus/1.65.10 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip",
    "osName": "Android",
    "osVersion": "12L",
    "deviceMake": "Oculus",
    "deviceModel": "Quest 3",
    "androidSdkVersion": "32",
    "endpointHost": "https://www.youtube.com/youtubei/v1"
  }
}
```

---

### 4.3 `visitorData` Extraction (`sw.js_data`) & `poToken` Minting (`bgutils-js`)

1. **Fetching `visitorData` (No Key Required)**:
   - **Endpoint**: `GET https://music.youtube.com/sw.js_data`
   - **Response Format**: Starts with `)]}'\n` followed by a nested JSON array containing the session's `visitorData` string matching `/^Cg[ts][A-Za-z0-9_%=-]{10,}/` (e.g., `CgtMNzRaVHhaVVpOTSi266fIBjIKCgJERRIEGgAgWw%3D%3D`).
   - **Parser Code**:
     ```js
     export function extractVisitorDataFromSwJsData(rawText) {
       const cleaned = rawText.replace(/^\)\]\}'\s*/, "");
       const parsed = JSON.parse(cleaned);
       const walk = (node) => {
         if (typeof node === "string" && /^Cg[ts][A-Za-z0-9_%=-]{10,}/.test(node)) return node;
         if (Array.isArray(node)) {
           for (const item of node) {
             const found = walk(item);
             if (found) return found;
           }
         }
         return null;
       };
       return walk(parsed);
     }
     ```
2. **Minting `poToken` (Proof of Origin Token)**:
   - Used in two places for `WEB_REMIX`, `TVHTML5_SIMPLY`, and `WEB_CREATOR`:
     1. In the `/youtubei/v1/player` JSON body: `"serviceIntegrityDimensions": { "poToken": "<SESSION_POTOKEN>" }`.
     2. Appended as a query parameter to the resolved `googlevideo.com` / `c.youtube.com` stream URL: `&pot=<STREAMING_POTOKEN>`.
   - **Cold-Start / Placeholder Token Generator** (works offline in pure Node.js) + **BotGuard (`bgutils-js` v4.0.3 / `po_token.html`)** (for full DOM/VM challenge):
     ```js
     export function generateColdStartPoToken(visitorData) {
       const idBytes = Buffer.from(decodeURIComponent(visitorData), "utf8").subarray(0, 32);
       const inner = Buffer.concat([
         Buffer.from([0x0a, idBytes.length]),
         idBytes,
         Buffer.from([0x10, 0x01, 0x18]),
         Buffer.from([Math.floor(Date.now() / 1000) & 0x7f]),
       ]);
       return Buffer.concat([Buffer.from([0x0a, inner.length]), inner]).toString("base64url");
     }
     ```

---

### 4.4 All Catalog, Search, Browse, Radio & Lyrics InnerTube Endpoints

All catalog requests are `POST` requests to `https://music.youtube.com/youtubei/v1/<endpoint>?key=AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX30&prettyPrint=false` using the `WEB_REMIX` client context (except timed lyrics, which uses `IOS_MUSIC`):

| Operation | InnerTube Endpoint | Payload Body (`{ ...context, ... }`) | Notes |
| :--- | :--- | :--- | :--- |
| **Search (All)** | `search` | `{ "query": "Maroon 5 Memories" }` | Returns Top Result + Songs, Videos, Albums, Artists, Playlists shelves. |
| **Search (Filtered)** | `search` | `{ "query": "...", "params": "<FILTER_PARAM>" }` | See `SEARCH_FILTER_PARAMS` table below. |
| **Search Pagination** | `search` | `{ "continuation": "<ctoken>" }` | Next page of search results. |
| **Autocomplete** | `music/get_search_suggestions` | `{ "input": "maroon 5" }` | Returns text queries + rich entity cards. |
| **Home Feed** | `browse` | `{ "browseId": "FEmusic_home" }` | Paginate with `{ "continuation": "<ctoken>" }`. |
| **Charts** | `browse` | `{ "browseId": "FEmusic_charts", "formData": { "selectedValues": ["US"] } }` | Country code `"US"`, `"IN"`, `"GB"`, `"BD"`, `"ZZ"` (Global). |
| **Moods & Genres** | `browse` | `{ "browseId": "FEmusic_moods_and_genres" }` | Drill into a mood with `browseId: "FEmusic_moods_and_genres_category"` + `params`. |
| **New Releases** | `browse` | `{ "browseId": "FEmusic_new_releases_albums" }` | Or `"FEmusic_new_releases_videos"`. |
| **Artist Page** | `browse` | `{ "browseId": "UC0WP5P-ufpRfjbNrmOWwLBQ" }` | Channel ID starts with `UC`. |
| **Album Page** | `browse` | `{ "browseId": "MPREb_..." }` | Album browseId starts with `MPREb_` or `OLAK5uy_`. |
| **Playlist Page** | `browse` | `{ "browseId": "VLPL..." }` | Prefix raw playlist ID (`PL...` / `RDCLAK5uy_...`) with `VL`. |
| **Up-Next & Radio** | `next` | `{ "videoId": "SlPhMPnQ58k", "playlistId": "RDAMVMSlPhMPnQ58k", "isAudioOnly": true, "enablePersistentPlaylistPanel": true, "tunerSettingValue": "AUTOMIX_SETTING_NORMAL" }` | Also returns `lyricsBrowseId` (`MPLYt_...`) and `relatedBrowseId` (`MPTRt_...`) in `contents.singleColumnMusicWatchNextResultsRenderer.tabbedRenderer.watchNextTabbedResultsRenderer.tabs`. |
| **Timed Lyrics** | `browse` (`IOS_MUSIC`) | `{ "browseId": "MPLYt_..." }` | Must use **`IOS_MUSIC`** (`clientId: "26"`) to receive `timedLyricsData`; `WEB_REMIX` returns plain text only. |
| **Related Tab** | `browse` | `{ "browseId": "MPTRt_..." }` | Returns similar songs, playlists, and related artists. |

#### Exact `SEARCH_FILTER_PARAMS` Protobuf Values:
```js
export const SEARCH_FILTER_PARAMS = {
  all: null,
  songs: "EgWKAQIIAWoQEAMQBBAJEAoQBRAREBAQFQ%3D%3D",
  videos: "EgWKAQIQAWoQEAMQBBAJEAoQBRAREBAQFQ%3D%3D",
  albums: "EgWKAQIYAWoQEAMQBBAJEAoQBRAREBAQFQ%3D%3D",
  artists: "EgWKAQIgAWoQEAMQBBAJEAoQBRAREBAQFQ%3D%3D",
  playlists: "EgWKAQIoAWoQEAMQBBAJEAoQBRAREBAQFQ%3D%3D",
  community_playlists: "EgeKAQQoAEABahAQAxAEEAkQChAFEBEQEBAU",
  featured_playlists: "EgeKAQQoADgBahAQAxAEEAkQChAFEBEQEBAU",
  podcasts: "EgWKAQJQAWoQEAMQBBAJEAoQBRAREBAQFQ%3D%3D",
  episodes: "EgWKAQJIAWoQEAMQBBAJEAoQBRAREBAQFQ%3D%3D",
};
```

---

## 5. Universal YouTube Player Cipher (`s`) & Anti-Throttle (`n`) Engine (`node:vm` + Faraday)

### 5.1 Why ES5 (`player_ias`) vs. ES6 (`player_es6`) Breaks Standard Regexes

YouTube serves two variants of `base.js`:
1. **ES6 (`player_es6.vflset/en_US/base.js` / `base-ea6f527e.js`)**:
   ```js
   ok=function(M,l="",c=""){M=new g.Wx(M,!0);M.set("alr","yes");c&&(c=sx(2,3303,XV(6,8828,c)),M[L[0]](l,q_(4,6046,c)));return M};
   ```
2. **ES5 (`player_ias.vflset/en_US/base.js`)**:
   ```js
   cp=function(n,m,M){m=m===void 0?"":m;M=M===void 0?"":M;n=new g.Uw(n,!0);n.set("alr","yes");M&&(M=hJ(26,5214,Mz(29,8886,M)),n[E[6]](m,y$(81,6202,M)));return n};
   ```

### 5.2 Universal `.set("alr","yes")` URL-Builder Regex & `node:vm` Prototype Hook

`UniversalCipherEngine` in `unified-music-api.js` matches **both** ES5 and ES6 bundles with a single regex:

```js
const UNIVERSAL_URL_BUILDER_REGEX =
  /([A-Za-z0-9_$]+)\s*=\s*function\(\s*(\w+)\s*,\s*(\w+)(?:\s*=\s*"")?\s*,\s*(\w+)(?:\s*=\s*"")?\s*\)\s*\{(?:\s*\3\s*=\s*\3\s*===\s*void 0\s*\?\s*""\s*:\s*\3\s*;\s*\4\s*=\s*\4\s*===\s*void 0\s*\?\s*""\s*:\s*\4\s*;)?\s*\2\s*=\s*new\s+([A-Za-z0-9_$.]+)\(\s*\2\s*,\s*!0\s*\)\s*;\s*\2\.set\(\s*"alr"\s*,\s*"yes"\s*\)/;
```

How the `node:vm` hook deciphers `s` and transforms `n`:
1. Before the closing `})(_yt_player);` IIFE tail of `base.js`, inject a hook capturing the URL builder function (`ok` / `cp` / `uf`), the Faraday `sig` expression, and the `g.<nClass>` constructor.
2. Inside the builder, `new g.<nClass>(url, !0)` passes `!0` (`true`) to defer the `n`-transform. To trigger the `n`-transform, either:
   - Call the single private method on `Object.getPrototypeOf(u)` (every method not in `["constructor", "clone", "get", "set", "toString"]`), **OR**
   - Call `new g.<nClass>("https://music.youtube.com/watch?n=" + nVal).get("n")` (with 1 argument, omitting `!0`).
3. Both produce the exact same transformed `n` and deciphered `s` across ES5 and ES6 bundles in ~150ms in pure Node.js `node:vm` with zero browser dependencies.

### 5.3 Faraday / Zemer Assembler Landmark Extractor & Pre-Derived Registry

Located in `/home/user/Music/youtube-music-js/cipher-configs/faraday_player_configs.json` (and `zemer_player_configs.json`), covering 90+ player hashes including active live player `11a45ffb`:

```json
{
  "950316ef": {
    "sig": "Qxa(1,2829,INPUT)",
    "nClass": "hq",
    "sts": 20753,
    "aliases": ["b5f7c4ff", "11a45ffb"]
  }
}
```

---

## 6. Unbreakable Stream Resolution, Tail-Range Validation & 4 MiB Bounded-Range Proxy

### 6.1 Multi-Client Stream Waterfall & Format Ranking (`selectBestAudioFormat`)

When `xroMusic.stream(videoId, options)` is called:
1. **Standard Track Waterfall (`STREAM_FALLBACK_ORDER`)**:
   `["WEB_REMIX", "VISIONOS", "TVHTML5_SIMPLY", "IOS", "ANDROID_VR"]`
2. **User Upload Waterfall (`UPLOAD_FALLBACK_ORDER`)**:
   `["WEB_REMIX", "TVHTML5", "WEB_CREATOR"]` (with `playlistId: "MLPT"`).
3. **Format Ranking (`selectBestAudioFormat`)**:
   Ranks `adaptiveFormats` by:
   `audioQuality` (`AUDIO_QUALITY_HIGH` > `AUDIO_QUALITY_MEDIUM` > `AUDIO_QUALITY_LOW`) $\rightarrow$ `audioChannels` (`2` > `1`) $\rightarrow$ Codec (`opus` [itag 251] > `mp4a` [itag 140]) $\rightarrow$ `bitrate`.

### 6.2 Last-256-Byte Tail Probe (`validateStreamUrl`) — Blocking 1 MiB-Capped Streams

Never validate a `googlevideo.com` URL with a plain `HEAD` or `Range: bytes=0-1024`. Since 2026, `googlevideo.com` caps `ANDROID_VR` URLs at 1 MiB (`1048576` bytes), so the start of the file returns `206 Partial Content`, but the stream dies at ~45 seconds with `403 Forbidden`.

**Exact Tail-Range Probe**:
```js
export async function validateStreamUrl(url, headers = {}, contentLength = null, fetchImpl = fetch) {
  const probeHeaders = { ...headers, "Accept-Encoding": "identity" };
  const len = Number(contentLength);
  let method = "HEAD";
  if (Number.isFinite(len) && len > 256 && isYouTubeStreamHost(url)) {
    method = "GET";
    probeHeaders["Range"] = `bytes=${len - 256}-${len - 1}`;
  }
  const res = await fetchImpl(url, { method, headers: probeHeaders, redirect: "follow" });
  return res.status >= 200 && res.status < 300;
}
```

### 6.3 Loopback 4 MiB Bounded-Range Audio Proxy (`BoundedRangeAudioProxy`)

- **Why**: `googlevideo.com` throttles open-ended `Range: bytes=0-` requests to ~32 KB/s (~2x realtime), causing slow buffering and 1.5s seek lag. Bounded range requests (`Range: bytes=X-Y` of 4 MiB = `4 * 1024 * 1024` bytes) are served at full CDN speed (~9.4 MB/s).
- **How `BoundedRangeAudioProxy` Works**:
  1. Binds to `http://127.0.0.1:<port>/<randomToken>/audio/<streamHash>`.
  2. When the browser `<audio>` element or desktop player requests `Range: bytes=0-`, the proxy loops over the file in **4 MiB bounded chunks (`Range: bytes=0-4194303`, `bytes=4194304-8388607`, ...)** with `Accept-Encoding: identity` and the matching client `User-Agent` (plus `Cookie` for `*.c.youtube.com` uploads), piping each chunk immediately to the player response.

---

## 7. JioSaavn Complete API, OpenSSL 3.0 `des-ede3` 320kbps Decryption & Geo-Block Bypass

### 7.1 Complete JioSaavn Endpoint Status Table (`jiosaavn.com/api.php`)

Base URL: `https://www.jiosaavn.com/api.php?_format=json&_marker=0&api_version=4&ctx=web6dot0`

| `__call` Parameter | Extra Query Params | Live Status | Description |
| :--- | :--- | :--- | :--- |
| `webapi.getLaunchData` | *(none)* | **WORKING (200 OK)** | Home feed: trending, new releases, top playlists, charts. |
| `content.getTrending` | `&entity_type=song&entity_language=english,hindi` | **WORKING (200 OK)** | Trending songs, albums, playlists. |
| `autocomplete.get` | `&cc=in&includeMetaTags=1&query=...` | **WORKING (200 OK)** | Instant search across albums, songs, playlists, artists. |
| `search.getResults` | `&n=10&p=1&q=...` | **WORKING (Partial Geo-Filter)** | Returns songs with `more_info.encrypted_media_url`. Some Western originals are hidden unless using our Geo-Block Bypass below. |
| `song.getDetails` | `&cc=in&pids=-RWAZc5D,idoLJICu` | **WORKING (200 OK)** | Returns full song details & `encrypted_media_url` **even for geo-blocked (`disabled: "true"`) Western tracks!** |
| `content.getAlbumDetails` | `&cc=in&albumid=27758199` | **WORKING (200 OK)** | Full album metadata and song list. |
| `playlist.getDetails` | `&listid=46545234` | **WORKING (200 OK)** | Returns playlist metadata and comma-separated song PIDs in `more_info.contents`. |
| `artist.getArtistPageDetails` | `&artistId=597966&n_song=15&n_album=10` | **WORKING (200 OK)** | Artist profile, `dedicated_artist_playlist`, `featured_artist_playlist`. |
| `social.getTopArtists` | *(none)* | **WORKING (200 OK)** | Top artists list. |
| `content.getTopShows` | *(none)* | **WORKING (200 OK)** | Podcasts & shows. |
| `reco.getreco` | `&pid=...` | **EMPTY (`[]`)** | Deprecated; use `xroMusic.upNext()` (`WEB_REMIX`) for song recommendations instead. |
| `webradio.getSong` | `&stationid=...` | **BROKEN** | Returns `"No new song found for current radio"`; use `xroMusic.upNext()` instead. |

### 7.2 OpenSSL 3.0 Native 320kbps AAC Decryption (`des-ede3` Key `"38346591"`)

JioSaavn encrypts media URLs with Single DES-ECB using the 8-byte ASCII key `"38346591"`. Because OpenSSL 3.0 (Node.js 18/20/22+) disables legacy `des-ecb` by default, `xroMusic` uses **Triple-DES EDE3 (`des-ede3`) with `K1 = K2 = K3 = "38346591"`** (`24` bytes), which is mathematically identical to Single DES-ECB ($D_K(E_K(D_K(x))) = D_K(x)$) and works in all Node.js versions out of the box:

```js
import crypto from "node:crypto";

const JIOSAAVN_3DES_KEY = Buffer.from("38346591".repeat(3), "utf8");

export function decryptJioSaavnMediaUrl(encryptedMediaUrl, targetBitrate = 320) {
  const decipher = crypto.createDecipheriv("des-ede3", JIOSAAVN_3DES_KEY, null);
  decipher.setAutoPadding(true);
  let decrypted = decipher.update(encryptedMediaUrl.trim(), "base64", "utf8");
  decrypted += decipher.final("utf8");
  decrypted = decrypted.replace(/^http:\/\//i, "https://");

  return {
    url320: decrypted.replace(/_(96|160|320)\.mp4/i, "_320.mp4").replace(/_96_p\.mp4/i, "_320_p.mp4"),
    url160: decrypted.replace(/_(96|160|320)\.mp4/i, "_160.mp4").replace(/_96_p\.mp4/i, "_160_p.mp4"),
    url96: decrypted.replace(/_(96|160|320)\.mp4/i, "_96.mp4"),
    preferredUrl: decrypted.replace(/_(96|160|320)\.mp4/i, `_${targetBitrate}.mp4`),
  };
}
```

### 7.3 The Artist-Playlist Geo-Block Bypass (`JIOSAAVN_320_BYPASS`)

When searching JioSaavn for major Western hits (e.g., `"Maroon 5 Memories"`), `search.getResults` hides the original Interscope track and only returns instrumental covers (`language: "instrumental"`).
`xroMusic` bypasses this automatically in 3 steps:
1. Call `autocomplete.get?query=Maroon+5+Memories` $\rightarrow$ extract `playlists.data[0].id` (e.g., `46545234`, `"Let's Play - Maroon 5"`).
2. Call `playlist.getDetails?listid=46545234` $\rightarrow$ read `more_info.contents` (`"idoLJICu,_oONnN9B,-RWAZc5D,XJ2N9gez,..."`).
3. Call `song.getDetails?pids=idoLJICu,_oONnN9B,-RWAZc5D,...` $\rightarrow$ match `"Memories"` (`id: "-RWAZc5D"`) and decrypt its `encrypted_media_url` into `https://aac.saavncdn.com/735/9010fdd63976d6a8960c3ab4b422b31c_320.mp4`!

---

## 8. Internet Archive (`archive.org`) DRM-Free MP3 & Lossless FLAC API

1. **Search Audio Items**:
   - **URL**: `GET https://archive.org/advancedsearch.php?q=(<QUERY>)+AND+mediatype:(audio)&fl[]=identifier,title,creator,downloads&sort[]=downloads+desc&rows=10&page=1&output=json`
   - **Response**: `response.docs` array of `{ identifier, title, creator, downloads }`.
2. **Resolve Audio Files for an Identifier**:
   - **URL**: `GET https://archive.org/metadata/<identifier>/files?output=json`
   - **Stream URL Construction**: Pick the first file in `result` with `format === "VBR MP3"`, `.name.endsWith(".mp3")`, or `.name.endsWith(".flac")`, and construct:
     ```text
     https://archive.org/download/<identifier>/<encodeURIComponent(file.name)>
     ```

---

## 9. 6-Provider Synced Lyrics Waterfall (Word-by-Word TTML, KPOE JSON & LRC)

`xroMusic.lyrics({ videoId, lyricsBrowseId, title, artist, album, durationSeconds })` cascades through these 6 providers in order:

| Priority | Provider | Endpoint(s) | Format Returned | Live Status |
| :- | :--- | :--- | :--- | :--- |
| **1** | **Boidu (Better Lyrics API)** | `GET https://lyrics-api.boidu.dev/getLyrics?s={title}&a={artist}&al={album}&d={durationSeconds}` | Apple Music **word-by-word TTML** (`{ ttml: "<tt itunes:timing=\"Word\">..." }`) parsed into `{ startMs, endMs, text, words: [{ text, startMs, endMs }] }`. | **WORKING (200 OK)** |
| **2** | **LyricsPlus (YouLyPlus)** | `GET https://lyricsplus.binimum.org/v2/lyrics/get?title={title}&artist={artist}&album={album}&duration={durationSeconds}` | Word/syllable-timed JSON (`{ type, lyrics: [...] }`). | **WORKING (200 OK)** |
| **3** | **YouTube Music (`IOS_MUSIC`)** | `POST https://music.youtube.com/youtubei/v1/browse` (`browseId: "MPLYt_..."`, client `IOS_MUSIC`) | `timedLyricsData` (line-synced timestamps). | **WORKING (200 OK)** |
| **4** | **Kugou** | 1. `GET https://songsearch.kugou.com/song_search_v2?keyword={kw}&page=1&pagesize=5` $\rightarrow$ `data.lists[0].FileHash`<br>2. `GET https://krcs.kugou.com/search?ver=1&man=yes&client=mobi&hash={FileHash}` $\rightarrow$ `candidates[0].{id, accesskey}`<br>3. `GET https://lyrics.kugou.com/download?ver=1&client=pc&id={id}&accesskey={accesskey}&fmt=lrc` | Base64-encoded synced `.lrc` in `content` (`Buffer.from(content, "base64").toString("utf8")`). | **WORKING (200 OK)** |
| **5** | **NetEase Cloud Music** | 1. `GET https://music.163.com/api/search/get/web?s={kw}&type=1&offset=0&total=true&limit=5` (`Referer: https://music.163.com/`) $\rightarrow$ `result.songs[0].id`<br>2. `GET https://music.163.com/api/song/lyric?id={songId}&lv=1&tv=1` | Synced LRC (`lrc.lyric`) + translated LRC (`tlyric.lyric`). | **WORKING (200 OK)** |
| **6** | **QQ Music** | 1. `GET https://c.y.qq.com/splcloud/fcgi-bin/smartbox_new.fcg?format=json&key={kw}` (`Referer: https://y.qq.com/`) $\rightarrow$ `data.song.itemlist[0].mid`<br>2. `GET https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?songmid={mid}&format=json&nobase64=1` | Synced LRC (`lyric`) + translation (`trans`). Must include `Referer: https://y.qq.com/`. | **WORKING (200 OK)** |

*(Note: `lrclib.net/api/get` is included as fallback #7 when online, and `api-lyrics.simpmusic.org` is excluded by default due to Cloudflare 403 blocking).*

---

## 10. Spotify Keyless Embed Importer, ListenBrainz & Last.fm Scrobbling

1. **Spotify Keyless Track / Playlist / Album Importer (`xroMusic.spotifyImport`)**:
   - **URL**: `GET https://open.spotify.com/embed/{track|playlist|album}/{spotifyId}`
   - **How It Works**: Parses `<script id="__NEXT_DATA__" type="application/json">...</script>` from the embed HTML and reads `props.pageProps.state.data.entity`, returning track title, artists, cover art, duration, and 30s preview URLs (or up to 100 tracks for a playlist/album) **without a Spotify Developer API key**.
2. **ListenBrainz Scrobbling (`xroMusic.scrobble`)**:
   - **Validate Token**: `GET https://api.listenbrainz.org/1/validate-token` with header `Authorization: Token <USER_TOKEN>`.
   - **Submit Listen**: `POST https://api.listenbrainz.org/1/submit-listens` with body `{ "listen_type": "playing_now" | "single", "payload": [{ "listened_at": 1793368000, "track_metadata": { "artist_name": "...", "track_name": "...", "release_name": "..." } }] }`.
3. **Last.fm API (`ws.audioscrobbler.com/2.0/`)**:
   - Standard REST endpoint for `track.updateNowPlaying` and `track.scrobble`.

---

## 11. Complete `xroMusic` Client API Reference (`xroMusic.*` — All 35 Operations)

Import the singleton client or instantiate a custom instance:
```js
import xroMusic, { XroMusicClient } from "./youtube-music-js/xroMusic.js";
```

| Category | Method Signature | Description |
| :--- | :--- | :--- |
| **1. Init & Auth** | `await xroMusic.init({ hl, gl, cookie, startProxy, proxyPort })` | Initializes `visitorData`, `poToken`, `node:vm` cipher engine, and optional loopback proxy. |
| | `xroMusic.setAuth({ cookie, visitorData, poToken, listenBrainzToken, lastFmApiKey })` | Configures optional cookies (for private uploads/18+ tracks) & scrobble tokens. |
| **2. Discovery** | `await xroMusic.search(query, { type, source, limit, continuation })` | Searches `ytmusic`, `saavn`, `archive`, or `all` with filter `type` (`songs`, `videos`, `albums`, `artists`, `playlists`, `podcasts`). |
| | `await xroMusic.suggestions(input)` | Real-time autocomplete suggestions from `music/get_search_suggestions`. |
| | `await xroMusic.home(continuation?)` | Fetches YouTube Music Home shelves (`FEmusic_home`). |
| | `await xroMusic.charts(countryCode = "US")` | Fetches Top 100 Songs, Videos, Artists & Trending (`FEmusic_charts`). |
| | `await xroMusic.moods(params?)` | Fetches Mood & Genre categories (`FEmusic_moods_and_genres`). |
| | `await xroMusic.newReleases(type = "albums" \| "videos")` | Fetches new album or music video releases. |
| **3. Entities** | `await xroMusic.song(videoId)` | Fetches track metadata, `loudnessDb`, and `musicVideoType`. |
| | `await xroMusic.artist(channelId)` | Fetches Artist profile (`UC...`), discography, and related artists. |
| | `await xroMusic.album(browseId)` | Fetches Album tracklist and metadata (`MPREb_...`). |
| | `await xroMusic.playlist(playlistId, continuation?)` | Fetches Playlist tracks (`VL...`) and paginates with `continuation`. |
| | `await xroMusic.upNext(videoId, { playlistId, radio, continuation })` | Fetches Up-Next radio queue (`RDAMVM...`), `lyricsBrowseId`, and `relatedBrowseId`. |
| | `await xroMusic.related(relatedBrowseId)` | Fetches Related tracks and recommendations (`MPTRt_...`). |
| **4. Streaming** | `await xroMusic.stream(videoId, { preferHigh, validate, isUpload, enableJioSaavnFallback, title, artist })` | Multi-client stream resolver (`WEB_REMIX` $\rightarrow$ `VISIONOS` $\rightarrow$ `TVHTML5_SIMPLY` $\rightarrow$ `IOS` $\rightarrow$ `ANDROID_VR` $\rightarrow$ `JIOSAAVN_320_BYPASS`) with `node:vm` cipher, tail-range validation, and proxy wrapping. |
| | `await xroMusic.videoStream(videoId, { maxHeight = 1080 })` | Resolves matching 1080p/720p video stream for Audio $\leftrightarrow$ Video toggle. |
| | `xroMusic.decipher({ url, signatureCipher, s, n, poToken })` | Directly deciphers `s` and transforms `n` using `UniversalCipherEngine`. |
| | `await xroMusic.validateStream(url, { headers, contentLength })` | Probes the last 256 bytes of a stream URL to verify it is not 1 MiB-capped. |
| | `await xroMusic.proxyStart(port?)` | Starts the loopback 4 MiB bounded-range HTTP proxy. |
| | `xroMusic.proxyWrap(streamUrl, { headers, contentLength, mimeType })` | Registers a stream URL with the loopback proxy and returns the local proxy URL. |
| | `await xroMusic.proxyStop()` | Stops the loopback HTTP proxy. |
| **5. JioSaavn** | `await xroMusic.saavnSearch(query, { limit })` | Searches JioSaavn and decrypts all `320kbps`, `160kbps`, and `96kbps` AAC URLs. |
| | `await xroMusic.saavnStream(queryOrEncryptedUrl)` | Resolves a 320kbps AAC stream (with Geo-Block Bypass) or decrypts an `encrypted_media_url`. |
| | `await xroMusic.saavnLaunchData()` | Fetches JioSaavn home launch data. |
| | `await xroMusic.saavnTrending({ type, language })` | Fetches JioSaavn trending songs/albums/playlists. |
| | `await xroMusic.saavnTopArtists()` | Fetches JioSaavn top artists. |
| | `await xroMusic.saavnSongDetails(pids)` | Fetches song details by PID(s) and attaches decrypted `.streams`. |
| | `await xroMusic.saavnAlbum(albumId)` | Fetches JioSaavn album details. |
| | `await xroMusic.saavnPlaylist(listId)` | Fetches JioSaavn playlist details and song PIDs. |
| | `await xroMusic.saavnArtist(artistId, { songCount, albumCount })` | Fetches JioSaavn artist page details and dedicated playlists. |
| **6. Archive** | `await xroMusic.archiveSearch(query, { limit })` | Searches Internet Archive (`archive.org`) audio items. |
| | `await xroMusic.archiveStream(identifier)` | Resolves direct MP3/FLAC download URL from `archive.org/metadata/{id}/files`. |
| **7. Lyrics** | `await xroMusic.lyrics({ videoId, lyricsBrowseId, title, artist, album, durationSeconds })` | 6-provider synced lyrics waterfall (Boidu word-TTML $\rightarrow$ LyricsPlus $\rightarrow$ `IOS_MUSIC` $\rightarrow$ Kugou $\rightarrow$ NetEase $\rightarrow$ QQ Music). |
| **8. Queue/Lib** | `xroMusic.queue.{get, set, add, next, prev, clear}` | Stateful playback queue manager with `playNext`, `shuffle`, and `repeatMode`. |
| | `xroMusic.library.{like, unlike, getLiked, createPlaylist, exportBackup}` | Local multi-source library & JSON backup manager. |
| | `await xroMusic.spotifyImport(spotifyUrlOrId, { type })` | Keyless Spotify track/playlist/album metadata importer via `open.spotify.com/embed`. |
| | `await xroMusic.scrobble({ title, artist, album, durationSeconds, type })` | Submits `"playing_now"` or `"single"` listen events to ListenBrainz. |

---

## 12. Live Case Study: Maroon 5 — "Memories" Complete Multi-Source Payload

```json
{
  "track": {
    "title": "Memories",
    "artist": "Maroon 5",
    "album": "JORDI (Deluxe)",
    "durationSeconds": 189,
    "releaseDate": "2021-06-11",
    "label": "℗ 2019 Interscope Records"
  },
  "ids": {
    "youtubeVideoId": "SlPhMPnQ58k",
    "youtubeAutoRadioPlaylistId": "RDAMVMSlPhMPnQ58k",
    "jiosaavnPid": "-RWAZc5D",
    "jiosaavnArtistId": "597966",
    "jiosaavnPlaylistId": "46545234",
    "spotifyTrackId": "2b8fOow8UzyDFAE27YhOZM",
    "kugouFileHash": "5D3138AD81E3E1E630173FD9A240FB6B",
    "kugouLyricId": "163181993",
    "kugouAccessKey": "1D2780FC5368C3314C08C5D626AD3523",
    "internetArchiveId": "story-wa-memories-maroon-5-dj-desa-remix"
  },
  "streams": {
    "jiosaavnOriginal320": "https://aac.saavncdn.com/735/9010fdd63976d6a8960c3ab4b422b31c_320.mp4",
    "jiosaavnOriginal160": "https://aac.saavncdn.com/735/9010fdd63976d6a8960c3ab4b422b31c_160.mp4",
    "jiosaavnOriginal96": "https://aac.saavncdn.com/735/9010fdd63976d6a8960c3ab4b422b31c_96.mp4",
    "jiosaavnPreviewMp4": "https://preview.saavncdn.com/735/iFqvtuYbz83vZ8M7MxyXvGfN9KPlJWaWFgBcGKDEr7eZu_96_p.mp4",
    "jioTuneMp3": "https://jiotunepreview.jio.com/content/Converted/010912291108382.mp3",
    "jiosaavnAmbient320": "https://aac.saavncdn.com/732/9c16b92c99c5144e7cb9c8f6714f7f20_320.mp4",
    "jiosaavnKaraoke320": "https://aac.saavncdn.com/512/3563ef6f243ff75901ab52191c270117_320.mp4",
    "internetArchiveRemixMp3": "https://archive.org/download/story-wa-memories-maroon-5-dj-desa-remix/STORY%20WA%20%21%20MEMORIES%20-%20MAROON%205%20%28%20DJ%20DESA%20Remix%20%29.mp3"
  }
}
```

---

## 13. Step-by-Step Full-Stack App Implementation Guide (Backend + Frontend)

### Step 1: Node.js Backend Server (`server.js`)
Mount `xroMusic` behind a lightweight Express or Node `http` server bound to `0.0.0.0`:
1. On startup, call `await xroMusic.init({ startProxy: true })`.
2. Expose REST endpoints:
   - `GET /api/search?q=...&type=songs&source=all` $\rightarrow$ `await xroMusic.search(q, { type, source })`
   - `GET /api/suggestions?q=...` $\rightarrow$ `await xroMusic.suggestions(q)`
   - `GET /api/home` $\rightarrow$ `await xroMusic.home(req.query.continuation)`
   - `GET /api/charts?country=US` $\rightarrow$ `await xroMusic.charts(req.query.country)`
   - `GET /api/artist/:id` $\rightarrow$ `await xroMusic.artist(req.params.id)`
   - `GET /api/album/:id` $\rightarrow$ `await xroMusic.album(req.params.id)`
   - `GET /api/playlist/:id` $\rightarrow$ `await xroMusic.playlist(req.params.id, req.query.continuation)`
   - `GET /api/upnext/:videoId` $\rightarrow$ `await xroMusic.upNext(req.params.videoId, { playlistId: req.query.playlistId, radio: true })`
   - `GET /api/stream/:videoId` $\rightarrow$ `await xroMusic.stream(req.params.videoId, { title: req.query.title, artist: req.query.artist })`
   - `GET /api/audio-proxy/:streamId` $\rightarrow$ Forward to `BoundedRangeAudioProxy._handleRequest(req, res)` so browser `<audio src="/api/audio-proxy/...">` uses a relative URL and streams in 4 MiB bounded chunks.
   - `GET /api/lyrics` $\rightarrow$ `await xroMusic.lyrics(req.query)`
   - `GET /api/spotify-import` $\rightarrow$ `await xroMusic.spotifyImport(req.query.url, { type: req.query.type })`

### Step 2: Frontend Player Integration (React / Svelte / Vue)
1. **Audio Element (`<audio>`)**:
   - When playing a track, call `/api/stream/:videoId?title=...&artist=...`.
   - If `client.startsWith("JIOSAAVN")` or `client === "INTERNET_ARCHIVE"`, set `<audio src={res.streamUrl} />` directly (CDN supports CORS and unthrottled byte ranges).
   - If `client` is a YouTube client (`WEB_REMIX`, `VISIONOS`, `TVHTML5_SIMPLY`, `IOS`, `ANDROID_VR`), set `<audio src={res.proxyUrl} />` (relative `/api/audio-proxy/:id`) so all byte-range requests go through the 4 MiB bounded-range proxy.
2. **Pre-buffering & Gapless Queue**:
   - When playback reaches 80% of the current track's duration, call `/api/stream/:nextVideoId` in the background so `StreamFetchManager` caches the resolved URL before the track transition.
3. **Word-by-Word Karaoke Lyrics**:
   - Poll `audioElement.currentTime * 1000` inside `requestAnimationFrame`.
   - Highlight the active line where `currentTimeMs >= line.startMs && currentTimeMs <= line.endMs`, and highlight individual word spans where `currentTimeMs >= word.startMs && currentTimeMs <= word.endMs`.

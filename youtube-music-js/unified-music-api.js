/**
 * Unified Music & Playback API (`unified-music-api.js`)
 * =====================================================
 * Synthesizes the best patterns from all 14 inspected YouTube Music & Multi-Source
 * repositories in `/home/user/Music/youtube-music-js/` and the 4 project archives:
 *
 * 1. Universal YouTube Player Cipher & `n`-Transform Engine (`node:vm`):
 *    - Supports BOTH ES5 (`player_ias.vflset`) and ES6 (`player_es6.vflset`) bundles
 *      via the universal `.set("alr","yes")` URL-builder hook (`Reserver-YTB-Web` + ES5 normalization).
 *    - Includes the Zemer/Faraday assembler-landmark deriver (`derivePlayerConfigFromJs`)
 *      and pre-derived registry (`faraday_player_configs.json` / `zemer_player_configs.json`,
 *      including live player `11a45ffb` -> `sts: 20753`, `sig: Qxa(1,2829,INPUT)`, `nClass: hq`).
 *
 * 2. YouTube Music InnerTube Orchestrator (`limusic` + `Music-Aura` + `Glass-Music`):
 *    - Extracts & caches `visitorData` (`/^Cg[ts]/`) from `https://music.youtube.com/sw.js_data`.
 *    - Mints cold-start / session `poToken` via `bgutils-js` (or placeholder token when offline).
 *    - Resolves catalog metadata (`search`, `suggestions`, `home`, `charts`, `artist`, `album`,
 *      `playlist`, `next`/up-next queue, `lyrics`) via `WEB_REMIX` (`clientId: "67"`).
 *    - Multi-Client Stream Waterfall with HIGH-quality two-pass selection:
 *      `WEB_REMIX` (with `sts` + `poToken` + `node:vm` `s`-decipher & `n`-transform)
 *      -> `VISIONOS` (`clientId: "101"`, direct URL, no cipher needed)
 *      -> `TVHTML5_SIMPLY` (`clientId: "75"`, `sts` + `poToken` + cipher)
 *      -> `IOS` (`clientId: "5"`, direct URL served via bounded-range proxy)
 *      -> `ANDROID_VR` (`clientId: "28"`, checked against 1 MiB cap via tail-range probe).
 *    - Tail-Range Stream Validator (`Range: bytes={len-256}-{len-1}`):
 *      Detects and rejects `googlevideo.com` 1 MiB-capped streams before handing them to the player.
 *    - In-Flight Deduplication & TTL Stream Cache (`StreamFetchManager` pattern).
 *
 * 3. Loopback Bounded-Range Audio Proxy (`limusic` `audioproxy.rs` + `Dark-Kernel` `fetchChunks.js`):
 *    - Eliminates `googlevideo.com` open-ended `Range: bytes=0-` throttling (~32 KB/s)
 *      by translating player requests into 4 MiB bounded-range chunks (`Range: bytes=X-Y`)
 *      with a 20-second stall timeout and automatic support for both `*.googlevideo.com`
 *      and `*.c.youtube.com` (user uploads).
 *
 * 4. Multi-Source Catalog & Full-Track Resolver:
 *    - GDStudio international API (verified NetEase/Bilibili search, 128–320kbps MP3,
 *      lossless/Hi-Res FLAC, artwork, synced lyrics, playlists, and charts).
 *    - Kugou Web-salt search + keyless free-track stream resolver + KRC/LRC lyrics.
 *    - Deezer public catalog/ISRC/artwork/charts (preview only; not a full-stream source).
 *    - Match-gated fallback from YouTube Music to GDStudio/Kugou; locked tracks are not bypassed.
 *
 * 5. Multi-Provider Synced Lyrics Waterfall (`limusic` `lyrics.ts`):
 *    - YouTube Music (`IOS_MUSIC` timed lyrics / `WEB_REMIX` plain lyrics)
 *    - Boidu, LyricsPlus, GDStudio, Kugou KRC, NetEase, QQ Music, and LRCLIB
 *    - Kugou KRC is decoded to timed LRC; GDStudio exposes original + translated LRC
 */

import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import {
  DeezerCatalogResolver,
  GDStudioMusicResolver,
  KugouMusicResolver,
  GDSTUDIO_SOURCE_IDS,
  scoreTrackMatch,
} from "./music-source-resolvers.js";

export {
  DeezerCatalogResolver,
  GDStudioMusicResolver,
  KugouMusicResolver,
  GDSTUDIO_CHARTS,
  GDSTUDIO_SOURCE_IDS,
  signKugouWebParams,
} from "./music-source-resolvers.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const YTM_COOKIE_HOST = "music.youtube.com";
const YTM_COOKIE_PATH = "/youtubei/v1";

function cookiePathMatches(cookiePath) {
  const candidate = cookiePath.startsWith("/") ? cookiePath : "/";
  return (
    YTM_COOKIE_PATH === candidate ||
    YTM_COOKIE_PATH.startsWith(candidate.endsWith("/") ? candidate : `${candidate}/`)
  );
}

function cookieDomainMatches(cookieDomain) {
  const domain = String(cookieDomain || "").toLowerCase().replace(/^\.+/, "");
  return Boolean(domain) && (domain === YTM_COOKIE_HOST || YTM_COOKIE_HOST.endsWith(`.${domain}`));
}

/**
 * Accepts a Cookie header or a browser-exported cookie array/object and builds
 * a safe Cookie header scoped to YouTube Music. Cookie values are never logged.
 */
export function normalizeCookieHeader(input) {
  if (input == null) return "";
  if (typeof input === "string") {
    const header = input.trim().replace(/^cookie:\s*/i, "");
    if (/[\r\n]/.test(header)) throw new TypeError("Cookie header must not contain newlines");
    return header;
  }

  const cookies = Array.isArray(input) ? input : input?.cookies;
  if (!Array.isArray(cookies)) {
    throw new TypeError("cookie must be a header string, cookie array, or browser-export object with a cookies array");
  }

  let exportHost = "";
  if (!Array.isArray(input) && input?.url) {
    try {
      exportHost = new URL(input.url).hostname.toLowerCase();
    } catch {
      // A malformed export URL is ignored; entries still need an explicit YouTube domain.
    }
  }

  const nowSeconds = Date.now() / 1000;
  const seen = new Set();
  const selected = [];
  for (const cookie of cookies) {
    if (!cookie || typeof cookie !== "object") continue;
    const name = String(cookie.name || "");
    const value = cookie.value == null ? "" : String(cookie.value);
    const domain = String(cookie.domain || exportHost || "").toLowerCase();
    const cookiePath = typeof cookie.path === "string" && cookie.path ? cookie.path : "/";
    if (!cookieDomainMatches(domain) || !cookiePathMatches(cookiePath)) continue;
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name) || /[\r\n;]/.test(value)) continue;

    const expiry = cookie.expirationDate ?? cookie.expires;
    if (expiry != null && expiry !== "" && !cookie.session) {
      let expirySeconds = Number(expiry);
      if (!Number.isFinite(expirySeconds)) {
        const parsedExpiry = Date.parse(String(expiry));
        expirySeconds = Number.isFinite(parsedExpiry) ? parsedExpiry / 1000 : NaN;
      } else if (expirySeconds > 1e12) {
        expirySeconds /= 1000;
      }
      if (Number.isFinite(expirySeconds) && expirySeconds > 0 && expirySeconds <= nowSeconds) continue;
    }

    const key = JSON.stringify([name, domain, cookiePath]);
    if (seen.has(key)) continue;
    seen.add(key);
    selected.push({ name, value, pathLength: cookiePath.length });
  }

  if (selected.length === 0) {
    throw new Error("No usable, unexpired YouTube cookies were found in the supplied export");
  }
  selected.sort((left, right) => right.pathLength - left.pathLength);
  return selected.map(({ name, value }) => `${name}=${value}`).join("; ");
}

function cookieInputFromEnvironment() {
  if (process.env.YTM_COOKIE) return process.env.YTM_COOKIE;
  const cookieFile = process.env.YTM_COOKIE_FILE;
  if (!cookieFile) return null;

  let contents;
  try {
    contents = fs.readFileSync(path.resolve(cookieFile), "utf8").trim();
  } catch {
    throw new Error("Unable to read YTM_COOKIE_FILE; check the local path and permissions");
  }
  if (!contents) return "";
  if (contents.startsWith("{") || contents.startsWith("[")) {
    try {
      return JSON.parse(contents);
    } catch {
      throw new Error("YTM_COOKIE_FILE contains invalid JSON");
    }
  }
  return contents;
}

function resolveCookieInput(options) {
  if (Object.prototype.hasOwnProperty.call(options, "cookie")) return options.cookie;
  return cookieInputFromEnvironment();
}

function cookieValueFromHeader(cookieHeader, names) {
  const wanted = new Set(names);
  for (const part of String(cookieHeader || "").split(/;\s*/)) {
    const separator = part.indexOf("=");
    if (separator <= 0) continue;
    const name = part.slice(0, separator).trim();
    if (wanted.has(name)) return part.slice(separator + 1);
  }
  return null;
}

function sapisidAuthorization(cookieHeader, origin) {
  const sapisid = cookieValueFromHeader(cookieHeader, [
    "SAPISID",
    "__Secure-1PAPISID",
    "__Secure-3PAPISID",
    "APISID",
  ]);
  if (!sapisid || !origin) return null;
  const timestamp = Math.floor(Date.now() / 1000);
  const digest = crypto.createHash("sha1").update(`${timestamp} ${sapisid} ${origin}`).digest("hex");
  return `SAPISIDHASH ${timestamp}_${digest}`;
}

// ============================================================================
// 1. CLIENT REGISTRY (Merged from limusic `clients.json` + Music-Aura + Glass-Music)
// ============================================================================

export const INNERTUBE_API_KEY = "AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX30";
export const YTM_BASE_URL = "https://music.youtube.com/youtubei/v1";
export const YT_BASE_URL = "https://www.youtube.com/youtubei/v1";

export const CLIENTS = {
  WEB_REMIX: {
    clientName: "WEB_REMIX",
    clientVersion: "1.20261027.10.00",
    clientId: "67",
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0",
    endpointHost: YTM_BASE_URL,
    loginSupported: true,
    useSignatureTimestamp: true,
    useWebPoTokens: true,
    needsNTransform: true,
  },
  VISIONOS: {
    clientName: "VISIONOS",
    clientVersion: "0.1",
    clientId: "101",
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
    osName: "visionOS",
    osVersion: "1.3.21O771",
    deviceMake: "Apple",
    deviceModel: "RealityDevice14,1",
    endpointHost: YT_BASE_URL,
    loginSupported: false,
    useSignatureTimestamp: false,
    useWebPoTokens: false,
    needsNTransform: false,
  },
  TVHTML5_SIMPLY: {
    clientName: "TVHTML5_SIMPLY",
    clientVersion: "1.0",
    clientId: "75",
    userAgent:
      "Mozilla/5.0 (ChromiumStylePlatform) Cobalt/25.lts.30.1034943-gold (unlike Gecko), Unknown_TV_Unknown_0/Unknown (Unknown, Unknown)",
    endpointHost: YT_BASE_URL,
    loginSupported: false,
    useSignatureTimestamp: true,
    useWebPoTokens: true,
    needsNTransform: true,
  },
  TVHTML5: {
    clientName: "TVHTML5",
    clientVersion: "7.20260707.07.00",
    clientId: "7",
    userAgent:
      "Mozilla/5.0 (ChromiumStylePlatform) Cobalt/25.lts.30.1034943-gold (unlike Gecko), Unknown_TV_Unknown_0/Unknown (Unknown, Unknown)",
    endpointHost: YT_BASE_URL,
    loginSupported: true,
    useSignatureTimestamp: true,
    useWebPoTokens: false,
    needsNTransform: true,
  },
  WEB_CREATOR: {
    clientName: "WEB_CREATOR",
    clientVersion: "1.20220726.00.00",
    clientId: "62",
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0",
    endpointHost: YT_BASE_URL,
    loginSupported: true,
    loginRequired: true,
    useSignatureTimestamp: true,
    useWebPoTokens: true,
    needsNTransform: true,
  },
  IOS: {
    clientName: "IOS",
    clientVersion: "21.03.1",
    clientId: "5",
    userAgent:
      "com.google.ios.youtube/21.03.1 (iPhone16,2; U; CPU iOS 18_2 like Mac OS X;)",
    osName: "iPhone",
    osVersion: "18.2.22C152",
    deviceMake: "Apple",
    deviceModel: "iPhone16,2",
    endpointHost: YT_BASE_URL,
    loginSupported: false,
    useSignatureTimestamp: false,
    useWebPoTokens: false,
    needsNTransform: false,
    requiresBoundedRange: true,
  },
  IOS_MUSIC: {
    clientName: "IOS_MUSIC",
    clientVersion: "7.01.05",
    clientId: "26",
    userAgent:
      "com.google.ios.youtubemusic/7.01.05 (iPhone16,2; U; CPU iOS 18_2 like Mac OS X;)",
    osName: "iOS",
    osVersion: "18.2.22C152",
    deviceMake: "Apple",
    deviceModel: "iPhone16,2",
    endpointHost: YTM_BASE_URL,
  },
  ANDROID_VR: {
    clientName: "ANDROID_VR",
    clientVersion: "1.65.10",
    clientId: "28",
    userAgent:
      "com.google.android.apps.youtube.vr.oculus/1.65.10 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip",
    osName: "Android",
    osVersion: "12L",
    deviceMake: "Oculus",
    deviceModel: "Quest 3",
    androidSdkVersion: "32",
    endpointHost: YT_BASE_URL,
    loginSupported: false,
    useSignatureTimestamp: false,
    useWebPoTokens: false,
    needsNTransform: false,
  },
};

export const STREAM_FALLBACK_ORDER = [
  "WEB_REMIX",
  "VISIONOS",
  "TVHTML5_SIMPLY",
  "IOS",
  "ANDROID_VR",
];

export const UPLOAD_FALLBACK_ORDER = ["WEB_REMIX", "TVHTML5", "WEB_CREATOR"];

// ============================================================================
// 2. UNIVERSAL PLAYER SCRIPT CIPHER & N-TRANSFORM ENGINE (Node `vm` + Faraday)
// ============================================================================

const STS_REGEX = /signatureTimestamp['":\s]+(\d{4,6})/;

/**
 * Matches the internal YouTube player URL builder function in BOTH:
 * - ES6 (`player_es6.vflset` / `base-ea6f527e.js`): `ok=function(M,l="",c=""){M=new g.Wx(M,!0);M.set("alr","yes");`
 * - ES5 (`player_ias.vflset`): `cp=function(n,m,M){m=m===void 0?"":m;M=M===void 0?"":M;n=new g.Uw(n,!0);n.set("alr","yes");`
 */
const UNIVERSAL_URL_BUILDER_REGEX =
  /([A-Za-z0-9_$]+)\s*=\s*function\(\s*(\w+)\s*,\s*(\w+)(?:\s*=\s*"")?\s*,\s*(\w+)(?:\s*=\s*"")?\s*\)\s*\{(?:\s*\3\s*=\s*\3\s*===\s*void 0\s*\?\s*""\s*:\s*\3\s*;\s*\4\s*=\s*\4\s*===\s*void 0\s*\?\s*""\s*:\s*\4\s*;)?\s*\2\s*=\s*new\s+([A-Za-z0-9_$.]+)\(\s*\2\s*,\s*!0\s*\)\s*;\s*\2\.set\(\s*"alr"\s*,\s*"yes"\s*\)/;

const IIFE_TAILS = [
  "})(_yt_player);",
  "}).call(this, _yt_player);",
  "})(this._yt_player);",
];

/**
 * Derives `{ sts, sig, nClass, urlBuilderName }` from any YouTube `base.js` bundle
 * using both the Universal URL Builder regex and Faraday's `.set("alr","yes")` landmark.
 */
export function derivePlayerConfigFromJs(playerJs, playerHash = null) {
  const stsMatch = STS_REGEX.exec(playerJs);
  const sts = stsMatch ? Number(stsMatch[1]) : null;

  const builderMatch = UNIVERSAL_URL_BUILDER_REGEX.exec(playerJs);
  const urlBuilderName = builderMatch ? builderMatch[1] : null;
  let nClass = builderMatch
    ? builderMatch[5].replace(/^g\./, "")
    : null;
  let sig = null;

  for (const match of playerJs.matchAll(/\.set\("alr","yes"\)/g)) {
    const idx = match.index ?? 0;
    const win = playerJs.slice(Math.max(0, idx - 90), idx + 220);
    if (!nClass) {
      const nm = win.match(
        /new\s+g\.([A-Za-z0-9$_]{1,8})\s*\([^,()]+,\s*!0\s*\)\s*;\s*[A-Za-z0-9$_]+\.set\("alr","yes"\)/
      );
      if (nm?.[1]) nClass = nm[1];
    }
    if (!sig) {
      const sm = win.match(
        /([A-Za-z0-9$_]{1,8})\((\d+),(\d+),\s*([A-Za-z0-9$_]{1,8})\((\d+),(\d+),/
      );
      if (sm) {
        sig = `${sm[1]}(${sm[2]},${sm[3]},INPUT)`;
      }
    }
  }

  return {
    playerHash,
    sts,
    urlBuilderName,
    nClass,
    sig,
  };
}

function createPlayerVmSandbox() {
  const noop = () => {};
  const makeEl = () => ({
    style: {},
    setAttribute: noop,
    getAttribute: () => null,
    appendChild: noop,
    removeChild: noop,
    addEventListener: noop,
    removeEventListener: noop,
    cloneNode: () => makeEl(),
    childNodes: [],
    children: [],
    innerHTML: "",
    textContent: "",
    tagName: "DIV",
    nodeType: 1,
  });

  const location = {
    href: "https://music.youtube.com/watch?v=dQw4w9WgXcQ",
    protocol: "https:",
    host: "music.youtube.com",
    hostname: "music.youtube.com",
    pathname: "/watch",
    search: "?v=dQw4w9WgXcQ",
    hash: "",
    origin: "https://music.youtube.com",
  };

  const sandbox = {
    navigator: {
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0",
      language: "en-US",
      languages: ["en-US"],
      platform: "Linux x86_64",
      mediaCapabilities: {
        decodingInfo: () => Promise.resolve({ supported: true }),
      },
    },
    location,
    document: {
      createElement: () => makeEl(),
      createElementNS: () => makeEl(),
      createTextNode: () => makeEl(),
      createDocumentFragment: () => makeEl(),
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      getElementsByTagName: () => [],
      body: makeEl(),
      head: makeEl(),
      documentElement: makeEl(),
      addEventListener: noop,
      removeEventListener: noop,
      cookie: "",
      readyState: "complete",
      currentScript: null,
      domain: "music.youtube.com",
      location,
    },
    history: { pushState: noop, replaceState: noop },
    screen: { width: 1920, height: 1080 },
    performance: {
      now: () => Date.now(),
      mark: noop,
      measure: noop,
      getEntriesByName: () => [],
    },
    crypto: globalThis.crypto,
    CustomEvent: function CustomEvent(type) {
      this.type = type;
    },
    Event: function Event(type) {
      this.type = type;
    },
    Element: function Element() {},
    HTMLElement: function HTMLElement() {},
    HTMLMediaElement: function HTMLMediaElement() {},
    HTMLVideoElement: function HTMLVideoElement() {},
    HTMLAudioElement: function HTMLAudioElement() {},
    Node: function Node() {},
    Document: function Document() {},
    Window: function Window() {},
    MutationObserver: function MutationObserver() {
      this.observe = noop;
      this.disconnect = noop;
    },
    ResizeObserver: function ResizeObserver() {
      this.observe = noop;
      this.disconnect = noop;
    },
    IntersectionObserver: function IntersectionObserver() {
      this.observe = noop;
      this.disconnect = noop;
    },
    XMLHttpRequest: function XMLHttpRequest() {
      this.open = noop;
      this.send = noop;
      this.setRequestHeader = noop;
    },
    MediaSource: Object.assign(function MediaSource() {}, {
      isTypeSupported: () => true,
    }),
    AudioContext: function AudioContext() {},
    webkitAudioContext: function webkitAudioContext() {},
    fetch: () => Promise.reject(new Error("network disabled in cipher sandbox")),
    setTimeout: () => 0,
    clearTimeout: noop,
    setInterval: () => 0,
    clearInterval: noop,
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: noop,
    matchMedia: () => ({
      matches: false,
      addListener: noop,
      removeListener: noop,
      addEventListener: noop,
      removeEventListener: noop,
    }),
    getComputedStyle: () => ({ getPropertyValue: () => "" }),
    localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    sessionStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    atob: (str) => Buffer.from(str, "base64").toString("binary"),
    btoa: (str) => Buffer.from(str, "binary").toString("base64"),
    URL,
    URLSearchParams,
    TextEncoder,
    TextDecoder,
    Uint8Array,
    Int32Array,
    Float64Array,
    ArrayBuffer,
    DataView,
    Promise,
    Symbol,
    Map,
    Set,
    WeakMap,
    WeakSet,
    Proxy,
    Reflect,
    Error,
    TypeError,
    RangeError,
    SyntaxError,
    RegExp,
    Date,
    Math,
    JSON,
    Object,
    Array,
    String,
    Number,
    Boolean,
    Function,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    encodeURIComponent,
    decodeURIComponent,
    encodeURI,
    decodeURI,
    escape,
    unescape,
    _yt_player: {},
    ytcfg: { get: () => undefined, set: noop },
  };

  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.top = sandbox;
  sandbox.parent = sandbox;
  sandbox.globalThis = sandbox;
  return sandbox;
}

/**
 * Pure Node.js `node:vm` YouTube Player Cipher & `n`-Transform Runtime.
 * Works on both `player_ias` (ES5) and `player_es6` (ES6) `base.js` bundles,
 * and falls back to Faraday/Zemer pre-derived `player_configs.json` metadata.
 */
export class UniversalCipherEngine {
  constructor(options = {}) {
    this.playerId = options.playerId || "bundled";
    this.source = options.source || null;
    this.registry = this._loadBundledRegistry();
    this.derived = null;
    this._buildUrl = null;
    this._directSig = null;
    this._directN = null;
    this._nCache = new Map();
    this.healthy = false;

    if (this.source) {
      this.loadSource(this.source, this.playerId);
    }
  }

  _loadBundledRegistry() {
    const candidates = [
      path.join(__dirname, "cipher-configs", "faraday_player_configs.json"),
      path.join(__dirname, "cipher-configs", "zemer_player_configs.json"),
      path.join(__dirname, "cipher-configs", "limusic_bundled_cipher_configs.json"),
    ];
    const merged = {};
    for (const file of candidates) {
      try {
        if (fs.existsSync(file)) {
          const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
          const players = parsed.players || parsed;
          for (const [hash, cfg] of Object.entries(players)) {
            if (cfg && typeof cfg === "object" && cfg.sts) {
              merged[hash] = cfg;
              if (Array.isArray(cfg.aliases)) {
                for (const alias of cfg.aliases) {
                  merged[alias] = cfg;
                }
              }
            }
          }
        }
      } catch {
        // Ignore unreadable registry file
      }
    }
    return merged;
  }

  getRegistryConfig(playerHash) {
    return this.registry[playerHash] || null;
  }

  get signatureTimestamp() {
    if (this.derived?.sts) return this.derived.sts;
    const reg = this.getRegistryConfig(this.playerId);
    return reg?.sts || 20753;
  }

  loadSource(source, playerId = "local") {
    this.playerId = playerId;
    this.source = source;
    this.derived = derivePlayerConfigFromJs(source, playerId);
    const regCfg = this.getRegistryConfig(playerId);

    const fnName = this.derived.urlBuilderName;
    const sigExpr = this.derived.sig || regCfg?.sig || null;
    const nClass = this.derived.nClass || regCfg?.nClass || null;

    let tailIdx = -1;
    for (const tail of IIFE_TAILS) {
      const idx = source.lastIndexOf(tail);
      if (idx !== -1) {
        tailIdx = idx;
        break;
      }
    }
    if (tailIdx === -1) {
      return false;
    }

    const publicMethods = ["constructor", "clone", "get", "set", "toString"];
    const hookLines = [
      `;(function(){`,
      fnName
        ? `  var builder = typeof ${fnName} === "function" ? ${fnName} : null;`
        : `  var builder = null;`,
      `  var pub = ${JSON.stringify(publicMethods)};`,
      `  globalThis.__ytTransform = function(signature, nVal) {`,
      `    if (!builder) return null;`,
      `    var u = builder("https://www.youtube.com/watch?v=dQw4w9WgXcQ", "s", signature ? encodeURIComponent(signature) : undefined);`,
      `    if (nVal != null) u.set("n", nVal);`,
      `    var proto = Object.getPrototypeOf(u);`,
      `    var names = Object.keys(proto).concat(Object.getOwnPropertyNames(proto));`,
      `    for (var i = 0; i < names.length; i++) {`,
      `      if (pub.indexOf(names[i]) !== -1) continue;`,
      `      try { u[names[i]](); } catch (e) { continue; }`,
      `      break;`,
      `    }`,
      `    var s = u.get("s");`,
      `    return { signature: s ? decodeURIComponent(s) : null, n: u.get("n") };`,
      `  };`,
      sigExpr
        ? `  globalThis.__ytDirectSig = function(INPUT) { return ${sigExpr}; };`
        : `  globalThis.__ytDirectSig = null;`,
      nClass
        ? `  globalThis.__ytDirectN = function(nVal) { return new g.${nClass}("https://music.youtube.com/watch?n=" + nVal).get("n"); };`
        : `  globalThis.__ytDirectN = null;`,
      `})();`,
    ].join("\n");

    const patched =
      source.slice(0, tailIdx) + "\n" + hookLines + "\n" + source.slice(tailIdx);

    const sandbox = createPlayerVmSandbox();
    vm.createContext(sandbox);
    try {
      vm.runInContext(patched, sandbox, {
        filename: `player-${playerId}.js`,
        timeout: 8000,
      });
    } catch {
      // Late telemetry errors after hook registration are safe to ignore
    }

    this._transform =
      typeof sandbox.__ytTransform === "function" ? sandbox.__ytTransform : null;
    this._directSig =
      typeof sandbox.__ytDirectSig === "function" ? sandbox.__ytDirectSig : null;
    this._directN =
      typeof sandbox.__ytDirectN === "function" ? sandbox.__ytDirectN : null;

    const probeN = "KdrqFlzJXl9EcCwlmEy";
    const outN = this.transformN(probeN);
    this.healthy = Boolean(outN && outN !== probeN);
    return this.healthy;
  }

  transformN(nValue) {
    if (!nValue || typeof nValue !== "string") return nValue;
    if (this._nCache.has(nValue)) return this._nCache.get(nValue);

    let transformed = null;
    if (this._transform) {
      try {
        const out = this._transform(null, nValue);
        if (out && typeof out.n === "string" && out.n.length > 0) {
          transformed = out.n;
        }
      } catch {
        // Fall through to _directN
      }
    }
    if ((!transformed || transformed === nValue) && this._directN) {
      try {
        transformed = this._directN(nValue);
      } catch {
        // Ignore
      }
    }

    const result = transformed || nValue;
    if (result !== nValue) {
      this._nCache.set(nValue, result);
    }
    return result;
  }

  decipherSignature(sig) {
    if (!sig || typeof sig !== "string") return sig;
    if (this._transform) {
      try {
        const out = this._transform(sig, null);
        if (out && typeof out.signature === "string" && out.signature.length > 0) {
          return out.signature;
        }
      } catch {
        // Fall through to _directSig
      }
    }
    if (this._directSig) {
      try {
        const out = this._directSig(sig);
        if (out) return out;
      } catch {
        // Ignore
      }
    }
    return sig;
  }

  resolveFormatUrl(format, poToken = null) {
    if (!format) return null;
    let rawUrl = format.url || null;
    let sp = "sig";
    let s = null;

    const cipherStr = format.signatureCipher || format.cipher;
    if (!rawUrl && cipherStr) {
      const params = new URLSearchParams(cipherStr);
      rawUrl = params.get("url");
      sp = params.get("sp") || "sig";
      s = params.get("s");
    }
    if (!rawUrl) return null;

    let parsed;
    try {
      parsed = new URL(rawUrl);
    } catch {
      return rawUrl;
    }

    if (s) {
      const deciphered = this.decipherSignature(s);
      parsed.searchParams.set(sp, deciphered);
    }

    const nVal = parsed.searchParams.get("n");
    if (nVal) {
      parsed.searchParams.set("n", this.transformN(nVal));
    }

    if (!parsed.searchParams.has("alr")) {
      parsed.searchParams.set("alr", "yes");
    }
    if (poToken && isYouTubeStreamHost(parsed.toString())) {
      parsed.searchParams.set("pot", poToken);
    }

    return parsed.toString();
  }
}

/**
 * Checks whether a stream URL belongs to YouTube's audio/video CDN (`*.googlevideo.com`
 * or `*.c.youtube.com` for user uploads, per `limusic` `orchestrator.rs` issue #308).
 */
export function isYouTubeStreamHost(urlStr) {
  try {
    const u = new URL(urlStr);
    return (
      u.hostname.endsWith(".googlevideo.com") ||
      u.hostname.endsWith(".c.youtube.com")
    );
  } catch {
    return false;
  }
}

// ============================================================================
// 3. VISITOR DATA & POTOKEN MANAGER (`sw.js_data` + `bgutils-js`)
// ============================================================================

export function extractVisitorDataFromSwJsData(rawText) {
  if (!rawText || typeof rawText !== "string") return null;
  const cleaned = rawText.replace(/^\)\]\}'\s*/, "");
  try {
    const parsed = JSON.parse(cleaned);
    const walk = (node) => {
      if (typeof node === "string" && /^Cg[ts][A-Za-z0-9_%=-]{10,}/.test(node)) {
        return node;
      }
      if (Array.isArray(node)) {
        for (const item of node) {
          const found = walk(item);
          if (found) return found;
        }
      }
      return null;
    };
    return walk(parsed);
  } catch {
    const match = cleaned.match(/"(Cg[ts][A-Za-z0-9_%=-]{12,})"/);
    return match ? match[1] : null;
  }
}

/**
 * Generates a cold-start / placeholder Proof-of-Origin (`poToken`) bound to `visitorData`
 * using the `bgutils-js` protobuf structure when a full BotGuard DOM challenge is not active.
 */
export function generateColdStartPoToken(visitorData = "Cgt4VkFERzVCUHZBRSiYl8fABjIKCgJJThIEGgAgaA%3D%3D") {
  const idBytes = Buffer.from(decodeURIComponent(visitorData), "utf8").subarray(0, 32);
  const inner = Buffer.concat([
    Buffer.from([0x0a, idBytes.length]),
    idBytes,
    Buffer.from([0x10, 0x01, 0x18]),
    Buffer.from([Math.floor(Date.now() / 1000) & 0x7f]),
  ]);
  const outer = Buffer.concat([Buffer.from([0x0a, inner.length]), inner]);
  return outer.toString("base64url");
}

// ============================================================================
// 4. MULTI-SOURCE MUSIC CATALOG & FULL-TRACK RESOLVERS
// ============================================================================

// ============================================================================
// 5. STREAM VALIDATOR & IN-FLIGHT DEDUPLICATION CACHE (`limusic` + `Music-Aura`)
// ============================================================================

/**
 * Probes the last 256 bytes of a YouTube stream (`Range: bytes={len-256}-{len-1}`)
 * to detect `googlevideo.com` 1 MiB-capped URLs (`ANDROID_VR` / `rustypipe` issue #292).
 */
export async function validateStreamUrl(url, headers = {}, contentLength = null, fetchImpl = fetch) {
  const probeHeaders = { ...headers, "Accept-Encoding": "identity" };
  const len = Number(contentLength);
  let method = "HEAD";
  if (Number.isFinite(len) && len > 256 && isYouTubeStreamHost(url)) {
    method = "GET";
    probeHeaders["Range"] = `bytes=${len - 256}-${len - 1}`;
  }
  try {
    const res = await fetchImpl(url, {
      method,
      headers: probeHeaders,
      redirect: "follow",
    });
    return res.status >= 200 && res.status < 300;
  } catch {
    return false;
  }
}

/**
 * Deduplicates concurrent stream resolutions for the same track ID and caches
 * resolved streams with a configurable TTL (default 10 minutes).
 */
export class StreamFetchManager {
  constructor(ttlMs = 10 * 60 * 1000) {
    this.ttlMs = ttlMs;
    this.cache = new Map();
    this.inFlight = new Map();
  }

  async resolve(key, resolverFn) {
    const now = Date.now();
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > now) {
      return { ...cached.value, fromCache: true };
    }
    if (this.inFlight.has(key)) {
      return this.inFlight.get(key);
    }

    const promise = (async () => {
      try {
        const value = await resolverFn();
        if (value && value.streamUrl) {
          this.cache.set(key, {
            value,
            expiresAt: now + this.ttlMs,
          });
        }
        return value;
      } finally {
        this.inFlight.delete(key);
      }
    })();

    this.inFlight.set(key, promise);
    return promise;
  }
}

// ============================================================================
// 6. LOOPBACK BOUNDED-RANGE AUDIO PROXY (`limusic` `audioproxy.rs` in Node.js)
// ============================================================================

const CHUNK_SIZE = 4 * 1024 * 1024; // 4 MiB bounded range for unthrottled CDN speed

/**
 * Local HTTP proxy that converts open-ended `<audio>` / `mpv` / `ffmpeg` requests
 * (`Range: bytes=0-`) into 4 MiB bounded-range upstream requests (`Range: bytes=X-Y`)
 * so `googlevideo.com` serves audio at ~9.4 MB/s instead of throttling to 32 KB/s.
 */
export class BoundedRangeAudioProxy {
  constructor(options = {}) {
    this.chunkSize = options.chunkSize || CHUNK_SIZE;
    this.fetchImpl = options.fetchImpl || fetch;
    this.registry = new Map();
    this.token = crypto.randomBytes(12).toString("hex");
    this.server = null;
    this.port = null;
  }

  register(streamUrl, headers = {}, contentLength = null, mimeType = "audio/webm") {
    const id = crypto.createHash("sha256").update(streamUrl).digest("hex").slice(0, 16);
    this.registry.set(id, {
      streamUrl,
      headers,
      contentLength: contentLength ? Number(contentLength) : null,
      mimeType,
    });
    if (!this.port) return streamUrl;
    return `http://127.0.0.1:${this.port}/${this.token}/audio/${id}`;
  }

  async start(port = 0, host = "127.0.0.1") {
    if (this.server) return this.port;
    this.server = http.createServer((req, res) => this._handleRequest(req, res));
    await new Promise((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(port, host, () => {
        this.port = this.server.address().port;
        resolve();
      });
    });
    return this.port;
  }

  async stop() {
    if (!this.server) return;
    await new Promise((resolve) => this.server.close(() => resolve()));
    this.server = null;
    this.port = null;
  }

  async _handleRequest(req, res) {
    try {
      const parts = (req.url || "").split("/").filter(Boolean);
      if (parts.length < 3 || parts[0] !== this.token || parts[1] !== "audio") {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      const entry = this.registry.get(parts[2]);
      if (!entry) {
        res.writeHead(404);
        res.end("Stream not registered");
        return;
      }

      let start = 0;
      let requestedEnd = null;
      const hasRange = Boolean(req.headers.range);
      if (hasRange) {
        const m = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range.trim());
        if (m) {
          start = Number(m[1]);
          if (m[2]) requestedEnd = Number(m[2]);
        }
      }

      const firstChunkEnd =
        requestedEnd !== null
          ? Math.min(requestedEnd, start + this.chunkSize - 1)
          : entry.contentLength
          ? Math.min(entry.contentLength - 1, start + this.chunkSize - 1)
          : start + this.chunkSize - 1;

      const firstResp = await this.fetchImpl(entry.streamUrl, {
        method: "GET",
        headers: {
          ...entry.headers,
          Range: `bytes=${start}-${firstChunkEnd}`,
          "Accept-Encoding": "identity",
        },
      });

      if (!firstResp.ok && firstResp.status !== 206) {
        res.writeHead(firstResp.status);
        res.end();
        return;
      }

      let totalSize = entry.contentLength;
      const contentRange = firstResp.headers.get("content-range");
      if (contentRange) {
        const m = /\/(\d+)$/.exec(contentRange);
        if (m) {
          totalSize = Number(m[1]);
          entry.contentLength = totalSize;
        }
      }

      const finalEnd =
        requestedEnd !== null
          ? requestedEnd
          : totalSize
          ? totalSize - 1
          : firstChunkEnd;

      const responseHeaders = {
        "Content-Type": firstResp.headers.get("content-type") || entry.mimeType,
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-store",
      };

      if (hasRange && totalSize) {
        responseHeaders["Content-Range"] = `bytes ${start}-${finalEnd}/${totalSize}`;
        responseHeaders["Content-Length"] = String(finalEnd - start + 1);
        res.writeHead(206, responseHeaders);
      } else if (totalSize && start === 0) {
        responseHeaders["Content-Length"] = String(totalSize);
        res.writeHead(200, responseHeaders);
      } else {
        res.writeHead(200, responseHeaders);
      }

      const firstBuf = Buffer.from(await firstResp.arrayBuffer());
      res.write(firstBuf);

      let cursor = start + firstBuf.length;
      while (totalSize && cursor <= finalEnd && !res.destroyed) {
        const chunkEnd = Math.min(finalEnd, cursor + this.chunkSize - 1);
        const chunkResp = await this.fetchImpl(entry.streamUrl, {
          method: "GET",
          headers: {
            ...entry.headers,
            Range: `bytes=${cursor}-${chunkEnd}`,
            "Accept-Encoding": "identity",
          },
        });
        if (!chunkResp.ok && chunkResp.status !== 206) break;
        const buf = Buffer.from(await chunkResp.arrayBuffer());
        if (buf.length === 0) break;
        res.write(buf);
        cursor += buf.length;
      }

      res.end();
    } catch {
      if (!res.headersSent) res.writeHead(502);
      res.end();
    }
  }
}

// ============================================================================
// 7. FORMAT SELECTION (`limusic` `better()` HIGH-quality Two-Pass Ranker)
// ============================================================================

export function selectBestAudioFormat(streamingData, preferHigh = true) {
  if (!streamingData) return null;
  const all = [
    ...(streamingData.adaptiveFormats || []),
    ...(streamingData.formats || []),
  ].filter((f) => f && typeof f.mimeType === "string" && f.mimeType.startsWith("audio/"));

  if (all.length === 0) return null;

  const qualityRank = (f) => {
    if (f.audioQuality === "AUDIO_QUALITY_HIGH") return 3;
    if (f.audioQuality === "AUDIO_QUALITY_MEDIUM") return 2;
    if (f.audioQuality === "AUDIO_QUALITY_LOW") return 1;
    return 0;
  };

  const codecRank = (f) => {
    if (f.mimeType.includes("opus")) return 2;
    if (f.mimeType.includes("mp4a")) return 1;
    return 0;
  };

  all.sort((a, b) => {
    const qDiff = preferHigh
      ? qualityRank(b) - qualityRank(a)
      : qualityRank(a) - qualityRank(b);
    if (qDiff !== 0) return qDiff;
    const chDiff = (b.audioChannels || 2) - (a.audioChannels || 2);
    if (chDiff !== 0) return chDiff;
    const cDiff = codecRank(b) - codecRank(a);
    if (cDiff !== 0) return cDiff;
    return (b.bitrate || 0) - (a.bitrate || 0);
  });

  return all[0];
}

// ============================================================================
// 8. UNIFIED MUSIC & PLAYBACK API ORCHESTRATOR
// ============================================================================

export class UnifiedMusicAPI {
  constructor(options = {}) {
    this.hl = options.hl || "en";
    this.gl = options.gl || "US";
    this.cookie = normalizeCookieHeader(resolveCookieInput(options));
    this.fetchImpl = options.fetchImpl || fetch;
    this.gdStudio =
      options.gdStudioResolver ||
      new GDStudioMusicResolver({
        fetchImpl: this.fetchImpl,
        baseUrl: options.gdStudioBaseUrl,
        supportedSources: options.gdStudioSources || GDSTUDIO_SOURCE_IDS,
      });
    this.kugou = options.kugouResolver || new KugouMusicResolver({ fetchImpl: this.fetchImpl, mid: options.kugouMid });
    this.deezer =
      options.deezerResolver ||
      new DeezerCatalogResolver({ fetchImpl: this.fetchImpl, baseUrl: options.deezerBaseUrl });
    this.visitorData =
      options.visitorData ||
      this._loadLocalVisitorData() ||
      "Cgt4VkFERzVCUHZBRSiYl8fABjIKCgJJThIEGgAgaA%3D%3D";
    this.poToken = options.poToken || generateColdStartPoToken(this.visitorData);
    this.cipher =
      options.cipher ||
      new UniversalCipherEngine({
        playerId: options.playerId || "11a45ffb",
        source: options.playerSource || this._loadLocalPlayerBundle(),
      });
    this.streamCache = new StreamFetchManager(options.cacheTtlMs || 10 * 60 * 1000);
    this.audioProxy = new BoundedRangeAudioProxy({ fetchImpl: this.fetchImpl });
    this.webRemixFailed = new Map(); // videoId -> timestamp
  }

  _loadLocalVisitorData() {
    try {
      const swPath = path.join(__dirname, "live-ytm-scripts", "sw.js_data.json");
      if (fs.existsSync(swPath)) {
        return extractVisitorDataFromSwJsData(fs.readFileSync(swPath, "utf8"));
      }
    } catch {
      // Ignore
    }
    return null;
  }

  _loadLocalPlayerBundle() {
    const candidates = [
      path.join(__dirname, "reserver-ytb-js", "test", "fixtures", "player", "base-ea6f527e.js"),
      path.join(__dirname, "youtube-player-scripts", "player_es6.vflset", "en_US", "base.js"),
      path.join(__dirname, "youtube-player-scripts", "player_ias.vflset", "en_US", "base.js"),
    ];
    for (const file of candidates) {
      try {
        if (fs.existsSync(file)) {
          return fs.readFileSync(file, "utf8");
        }
      } catch {
        // Ignore
      }
    }
    return null;
  }

  buildClientContext(clientKey = "WEB_REMIX") {
    const client = CLIENTS[clientKey] || CLIENTS.WEB_REMIX;
    const ctx = {
      context: {
        client: {
          clientName: client.clientName,
          clientVersion: client.clientVersion,
          hl: this.hl,
          gl: this.gl,
          visitorData: this.visitorData,
        },
        user: { lockedSafetyMode: false },
        request: { useSsl: true },
      },
    };
    if (client.osName) ctx.context.client.osName = client.osName;
    if (client.osVersion) ctx.context.client.osVersion = client.osVersion;
    if (client.deviceMake) ctx.context.client.deviceMake = client.deviceMake;
    if (client.deviceModel) ctx.context.client.deviceModel = client.deviceModel;
    if (client.androidSdkVersion) {
      ctx.context.client.androidSdkVersion = Number(client.androidSdkVersion);
    }
    return ctx;
  }

  buildClientHeaders(clientKey = "WEB_REMIX") {
    const client = CLIENTS[clientKey] || CLIENTS.WEB_REMIX;
    const headers = {
      "Content-Type": "application/json",
      "User-Agent": client.userAgent,
      "X-YouTube-Client-Name": String(client.clientId),
      "X-YouTube-Client-Version": client.clientVersion,
      "X-Goog-Visitor-Id": this.visitorData,
      Origin:
        client.endpointHost === YTM_BASE_URL
          ? "https://music.youtube.com"
          : "https://www.youtube.com",
    };
    if (this.cookie && client.loginSupported) {
      headers["Cookie"] = this.cookie;
      const authorization = sapisidAuthorization(this.cookie, headers.Origin);
      if (authorization) headers.Authorization = authorization;
    }
    return headers;
  }

  async requestInnerTube(endpoint, payload = {}, clientKey = "WEB_REMIX") {
    const client = CLIENTS[clientKey] || CLIENTS.WEB_REMIX;
    const url = `${client.endpointHost}/${endpoint}?key=${INNERTUBE_API_KEY}&prettyPrint=false`;
    const body = {
      ...this.buildClientContext(clientKey),
      ...payload,
    };
    const res = await this.fetchImpl(url, {
      method: "POST",
      headers: this.buildClientHeaders(clientKey),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`InnerTube ${endpoint} (${clientKey}) failed with HTTP ${res.status}`);
    }
    return res.json();
  }

  /**
   * Resolves a playable audio stream for `videoId` using the full multi-client waterfall:
   * 1. `WEB_REMIX` (with `sts` + `poToken` + `node:vm` `s`-decipher & `n`-transform)
   * 2. `VISIONOS` (direct URL, no cipher needed)
   * 3. `TVHTML5_SIMPLY` (`sts` + `poToken` + cipher)
   * 4. `IOS` (direct URL, bounded-range proxy)
   * 5. `ANDROID_VR` (direct URL, verified against 1 MiB cap via tail-range probe)
   * Plus match-gated GDStudio (NetEase/Bilibili) and Kugou full-track fallback when metadata is provided.
   */
  async resolveYouTubeStream(videoId, options = {}) {
    const isUpload = Boolean(options.isUpload);
    const preferHigh = options.preferHigh !== false;
    const validate = options.validate !== false;

    const fallbackFingerprint = [
      options.title || "",
      options.artist || "",
      options.durationSeconds || "",
      options.quality || "",
      options.fallbackSearchLimit || "",
      options.isUpload ? "upload" : "public",
      options.validate === false ? "skip-validation" : "validate",
      options.enableCatalogFallback === false ? "no-catalog-fallback" : "catalog-fallback",
    ].map((value) => encodeURIComponent(String(value))).join("|");
    return this.streamCache.resolve(`yt:${videoId}:${preferHigh}:${fallbackFingerprint}`, async () => {
      const order = isUpload ? UPLOAD_FALLBACK_ORDER : STREAM_FALLBACK_ORDER;
      const sts = this.cipher.signatureTimestamp;
      let metadata = null;
      let fallbackCandidate = null;

      for (const clientKey of order) {
        const client = CLIENTS[clientKey];
        if (!client) continue;
        if (client.loginRequired && !this.cookie) continue;

        const payload = {
          videoId,
          contentCheckOk: true,
          racyCheckOk: true,
        };
        if (isUpload) {
          payload.playlistId = "MLPT";
        }
        if (client.useSignatureTimestamp && sts) {
          payload.playbackContext = {
            contentPlaybackContext: {
              html5Preference: "HTML5_PREF_WANTS",
              signatureTimestamp: sts,
            },
          };
        }
        if (client.useWebPoTokens && this.poToken) {
          payload.serviceIntegrityDimensions = {
            poToken: this.poToken,
          };
        }

        let resp;
        try {
          resp = await this.requestInnerTube("player", payload, clientKey);
        } catch {
          continue;
        }

        if (!metadata && resp?.videoDetails) {
          metadata = {
            title: resp.videoDetails.title,
            artist: (resp.videoDetails.author || "").replace(/ - Topic$/, ""),
            durationSeconds: Number(resp.videoDetails.lengthSeconds) || 0,
            thumbnail:
              resp.videoDetails.thumbnail?.thumbnails?.slice(-1)?.[0]?.url || null,
            musicVideoType: resp.videoDetails.musicVideoType || null,
          };
        }

        if (resp?.playabilityStatus?.status !== "OK") {
          continue;
        }

        const format = selectBestAudioFormat(resp.streamingData, preferHigh);
        if (!format) continue;

        const resolvedUrl = this.cipher.resolveFormatUrl(
          format,
          client.useWebPoTokens ? this.poToken : null
        );
        if (!resolvedUrl) continue;

        const streamHeaders = {
          "User-Agent": client.userAgent,
        };
        if (isUpload && this.cookie) {
          streamHeaders["Cookie"] = this.cookie;
        }

        if (validate) {
          const isValid = await validateStreamUrl(
            resolvedUrl,
            streamHeaders,
            format.contentLength,
            this.fetchImpl
          );
          if (!isValid) {
            if (!fallbackCandidate) {
              fallbackCandidate = {
                videoId,
                streamUrl: resolvedUrl,
                proxyUrl: this.audioProxy.register(
                  resolvedUrl,
                  streamHeaders,
                  format.contentLength,
                  format.mimeType
                ),
                client: clientKey,
                itag: format.itag,
                mimeType: format.mimeType,
                bitrate: format.bitrate,
                audioQuality: format.audioQuality,
                contentLength: format.contentLength ? Number(format.contentLength) : null,
                expiresInSeconds: Number(resp.streamingData?.expiresInSeconds) || 21540,
                headers: streamHeaders,
                validated: false,
                ...metadata,
              };
            }
            continue;
          }
        }

        return {
          videoId,
          streamUrl: resolvedUrl,
          proxyUrl: this.audioProxy.register(
            resolvedUrl,
            streamHeaders,
            format.contentLength,
            format.mimeType
          ),
          client: clientKey,
          itag: format.itag,
          mimeType: format.mimeType,
          bitrate: format.bitrate,
          audioQuality: format.audioQuality,
          contentLength: format.contentLength ? Number(format.contentLength) : null,
          expiresInSeconds: Number(resp.streamingData?.expiresInSeconds) || 21540,
          headers: streamHeaders,
          validated: true,
          ...metadata,
        };
      }

      // Cross-provider full-track fallback, gated by title/artist/duration matching.
      if (options.enableCatalogFallback !== false && (options.title || metadata?.title)) {
        const title = String(options.title || metadata?.title || "").trim();
        const artist = String(options.artist || metadata?.artist || "").trim();
        const fallback = await this.resolveCatalogStream({
          title,
          artist,
          durationSeconds: Number(options.durationSeconds || metadata?.durationSeconds) || 0,
          quality: options.quality || (preferHigh ? "999" : "320"),
          limit: options.fallbackSearchLimit || 10,
        });
        if (fallback) {
          const headers = fallback.headers || {};
          return {
            videoId,
            ...fallback,
            proxyUrl: this.audioProxy.register(
              fallback.streamUrl,
              headers,
              fallback.contentLength,
              fallback.mimeType
            ),
            fallbackSource: fallback.provider,
            validated: null,
          };
        }
      }

      // Keep a non-validated YT URL only as a last resort after trying exact catalog matches.
      if (fallbackCandidate) return fallbackCandidate;

      throw new Error(`All playback clients and catalog fallbacks exhausted for videoId=${videoId}`);
    });
  }

  /**
   * Search GDStudio and Kugou, rank exact/near-exact matches, then resolve a full stream.
   * Deezer is intentionally not used here because its public API only exposes short previews.
   */
  async resolveCatalogStream({ title, artist = "", durationSeconds = 0, quality = "999", limit = 10 } = {}) {
    const expected = { title: String(title || "").trim(), artist, durationSeconds };
    if (!expected.title) return null;

    const [gdStudioResult, kugouResult] = await Promise.allSettled([
      this.gdStudio.searchAcrossSources(`${expected.title} ${artist}`.trim(), { limit }),
      this.kugou.search(`${expected.title} ${artist}`.trim(), { limit }),
    ]);
    const candidates = [];
    if (gdStudioResult.status === "fulfilled") {
      for (const track of gdStudioResult.value) {
        const match = scoreTrackMatch(expected, track);
        if (match) candidates.push({ provider: "gdstudio", track, match });
      }
    }
    if (kugouResult.status === "fulfilled") {
      for (const track of kugouResult.value) {
        const match = scoreTrackMatch(expected, track);
        if (match) candidates.push({ provider: "kugou", track, match });
      }
    }
    candidates.sort((a, b) => b.match.score - a.match.score);

    for (const candidate of candidates) {
      try {
        const resolved =
          candidate.provider === "gdstudio"
            ? await this.gdStudio.stream(candidate.track, { quality, fallback: true })
            : await this.kugou.stream(candidate.track, { quality, fallback: true });
        if (resolved?.streamUrl) {
          return {
            ...resolved,
            title: resolved.title || candidate.track.title,
            artist: resolved.artist || candidate.track.artist,
            durationSeconds: resolved.durationSeconds || candidate.track.durationSeconds,
            thumbnail: candidate.track.coverUrl || null,
            matchScore: candidate.match.score,
            matchDetails: candidate.match,
            headers: resolved.headers || {},
          };
        }
      } catch {
        // Keep trying the next well-matched provider/candidate.
      }
    }

    return null;
  }

  /**
   * Resolves audio streams from Internet Archive (`archive.org`).
   */
  async resolveInternetArchiveStream(identifier) {
    const metaUrl = `https://archive.org/metadata/${encodeURIComponent(identifier)}/files?output=json`;
    const res = await this.fetchImpl(metaUrl);
    if (!res.ok) return null;
    const data = await res.json();
    const files = data?.result || [];
    const audioFile =
      files.find((f) => f.format === "VBR MP3" || (f.name && f.name.endsWith(".mp3"))) ||
      files.find((f) => f.format === "Flac" || (f.name && f.name.endsWith(".flac")));
    if (!audioFile) return null;
    return {
      identifier,
      streamUrl: `https://archive.org/download/${encodeURIComponent(identifier)}/${encodeURIComponent(
        audioFile.name
      )}`,
      client: "INTERNET_ARCHIVE",
      mimeType: audioFile.name.endsWith(".flac") ? "audio/flac" : "audio/mpeg",
      title: audioFile.title || audioFile.name,
    };
  }

  /**
   * Multi-Provider Synced Lyrics Waterfall:
   * 1. Boidu word-timed TTML; 2. LyricsPlus word-timed JSON; 3. GDStudio synced LRC;
   * 4. Kugou KRC/LRC; 5. NetEase; 6. QQ Music; 7. LRCLIB.
   */
  async resolveSyncedLyrics({ title, artist, album = "", durationSeconds = 0 }) {
    const parseTimeMs = (t) => {
      if (!t) return 0;
      const parts = String(t).split(":").map(Number);
      if (parts.length === 3) return Math.round((parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000);
      if (parts.length === 2) return Math.round((parts[0] * 60 + parts[1]) * 1000);
      return Math.round(Number(t) * 1000);
    };

    const parseBoiduTtml = (ttml) => {
      const lines = [];
      const pRegex = /<p\b[^>]*\bbegin="([^"]+)"[^>]*\bend="([^"]+)"[^>]*>([\s\S]*?)<\/p>/g;
      let pm;
      while ((pm = pRegex.exec(ttml)) !== null) {
        const startMs = parseTimeMs(pm[1]);
        const endMs = parseTimeMs(pm[2]);
        const inner = pm[3];
        const words = [];
        const spanRegex = /<span\b[^>]*\bbegin="([^"]+)"[^>]*\bend="([^"]+)"[^>]*>([\s\S]*?)<\/span>/g;
        let sm;
        while ((sm = spanRegex.exec(inner)) !== null) {
          words.push({
            startMs: parseTimeMs(sm[1]),
            endMs: parseTimeMs(sm[2]),
            text: sm[3].replace(/<[^>]+>/g, ""),
          });
        }
        const text = words.length > 0 ? words.map((w) => w.text).join(" ") : inner.replace(/<[^>]+>/g, "").trim();
        lines.push({ startMs, endMs, text, words });
      }
      return lines;
    };

    const providers = [
      async () => {
        const u = `https://lyrics-api.boidu.dev/getLyrics?s=${encodeURIComponent(
          title
        )}&a=${encodeURIComponent(artist)}&al=${encodeURIComponent(
          album
        )}&d=${durationSeconds}`;
        const r = await this.fetchImpl(u);
        if (!r.ok) return null;
        const j = await r.json();
        if (j?.ttml && typeof j.ttml === "string") {
          const lines = parseBoiduTtml(j.ttml);
          if (lines.length > 0) {
            return { source: "boidu", type: "words", lines, rawTtml: j.ttml };
          }
        }
        return null;
      },
      async () => {
        const u = `https://lyricsplus.binimum.org/v2/lyrics/get?title=${encodeURIComponent(
          title
        )}&artist=${encodeURIComponent(artist)}&album=${encodeURIComponent(
          album
        )}&duration=${durationSeconds}`;
        const r = await this.fetchImpl(u);
        if (!r.ok) return null;
        const j = await r.json();
        if (j?.lyrics && Array.isArray(j.lyrics) && j.lyrics.length > 0) {
          return { source: "lyricsplus", type: j.type || "words", lines: j.lyrics };
        }
        return null;
      },
      async () => {
        const result = await this.gdStudio.lyrics(`${title} ${artist}`.trim(), { source: "netease" });
        if (!result?.lyric) return null;
        return {
          source: "gdstudio-netease",
          type: "lrc",
          lrc: result.lyric,
          tlyric: result.tlyric || null,
        };
      },
      async () => {
        const result = await this.kugou.lyrics({ title, artist, durationSeconds });
        if (!result?.lrc) return null;
        return { source: "kugou", type: "lrc", lrc: result.lrc, krc: result.krc || null };
      },
      // 4. NetEase Cloud Music (`music.163.com` synced LRC + translation)
      async () => {
        const s = encodeURIComponent(`${title} ${artist}`.trim());
        const searchRes = await this.fetchImpl(
          `https://music.163.com/api/search/get/web?s=${s}&type=1&offset=0&total=true&limit=5`,
          {
            headers: {
              Referer: "https://music.163.com/",
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            },
          }
        );
        if (!searchRes.ok) return null;
        const sj = await searchRes.json();
        const songId = sj?.result?.songs?.[0]?.id;
        if (!songId) return null;
        const lyrRes = await this.fetchImpl(
          `https://music.163.com/api/song/lyric?id=${songId}&lv=1&tv=1`,
          {
            headers: {
              Referer: "https://music.163.com/",
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            },
          }
        );
        if (!lyrRes.ok) return null;
        const lj = await lyrRes.json();
        const lrc = lj?.lrc?.lyric;
        if (!lrc) return null;
        return {
          source: "netease",
          type: "lrc",
          lrc,
          tlyric: lj?.tlyric?.lyric || null,
        };
      },
      // 5. QQ Music (`c.y.qq.com` with `Referer: https://y.qq.com/`)
      async () => {
        const key = encodeURIComponent(`${title} ${artist}`.trim());
        const searchRes = await this.fetchImpl(
          `https://c.y.qq.com/splcloud/fcgi-bin/smartbox_new.fcg?format=json&key=${key}`,
          {
            headers: {
              Referer: "https://y.qq.com/",
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            },
          }
        );
        if (!searchRes.ok) return null;
        const sj = await searchRes.json();
        const mid = sj?.data?.song?.itemlist?.[0]?.mid;
        if (!mid) return null;
        const lyrRes = await this.fetchImpl(
          `https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?songmid=${mid}&format=json&nobase64=1`,
          {
            headers: {
              Referer: "https://y.qq.com/",
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            },
          }
        );
        if (!lyrRes.ok) return null;
        const lj = await lyrRes.json();
        if (!lj?.lyric) return null;
        return {
          source: "qq",
          type: "lrc",
          lrc: lj.lyric,
          tlyric: lj.trans || null,
        };
      },
      // 6. LRCLIB (`lrclib.net/api/get`)
      async () => {
        const u = `https://lrclib.net/api/get?track_name=${encodeURIComponent(
          title
        )}&artist_name=${encodeURIComponent(artist)}&album_name=${encodeURIComponent(
          album
        )}&duration=${durationSeconds}`;
        const r = await this.fetchImpl(u);
        if (!r.ok) return null;
        const j = await r.json();
        if (j?.syncedLyrics || j?.plainLyrics) {
          return {
            source: "lrclib",
            type: j.syncedLyrics ? "lrc" : "plain",
            lrc: j.syncedLyrics || j.plainLyrics,
          };
        }
        return null;
      },
    ];

    for (const provider of providers) {
      try {
        const res = await provider();
        if (res) return res;
      } catch {
        // Continue waterfall
      }
    }
    return null;
  }
}

export default UnifiedMusicAPI;

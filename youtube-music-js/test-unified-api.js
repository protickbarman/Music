import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  UnifiedMusicAPI,
  UniversalCipherEngine,
  BoundedRangeAudioProxy,
  derivePlayerConfigFromJs,
  extractVisitorDataFromSwJsData,
  GDStudioMusicResolver,
  KugouMusicResolver,
  DeezerCatalogResolver,
  signKugouWebParams,
  generateColdStartPoToken,
  normalizeCookieHeader,
  validateStreamUrl,
} from "./unified-music-api.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runTests() {
  console.log("=== 0. Testing browser-export cookie normalization (synthetic credentials only) ===");
  const nowSeconds = Math.floor(Date.now() / 1000);
  const cookieExport = {
    url: "https://music.youtube.com/",
    cookies: [
      { name: "SID", value: "unit-test-session", domain: ".youtube.com", path: "/", expirationDate: nowSeconds + 3600 },
      { name: "SAPISID", value: "unit-test-sapisid", domain: ".youtube.com", path: "/", expirationDate: nowSeconds + 3600 },
      { name: "PREF", value: "unit-test-pref", domain: ".youtube.com", path: "/youtubei/v1", expirationDate: nowSeconds + 3600 },
      { name: "expired", value: "ignored", domain: ".youtube.com", path: "/", expirationDate: nowSeconds - 3600 },
      { name: "foreign", value: "ignored", domain: ".example.test", path: "/", expirationDate: nowSeconds + 3600 },
    ],
  };
  const normalizedCookie = normalizeCookieHeader(cookieExport);
  assert.equal(normalizedCookie, "PREF=unit-test-pref; SID=unit-test-session; SAPISID=unit-test-sapisid");
  assert.equal(normalizeCookieHeader("Cookie: SID=unit-test-session"), "SID=unit-test-session");
  assert.throws(
    () => normalizeCookieHeader("SID=value" + String.fromCharCode(13, 10) + "Injected: yes"),
    /newlines/
  );
  const cookieApi = new UnifiedMusicAPI({ cookie: cookieExport });
  const authenticatedHeaders = cookieApi.buildClientHeaders("WEB_REMIX");
  assert.equal(authenticatedHeaders.Cookie, normalizedCookie);
  const authMatch = /^SAPISIDHASH (\d+)_([a-f0-9]{40})$/.exec(authenticatedHeaders.Authorization || "");
  assert.ok(authMatch, "SAPISID should produce an InnerTube SAPISIDHASH Authorization header");
  const expectedAuthHash = crypto
    .createHash("sha1")
    .update(`${authMatch[1]} unit-test-sapisid https://music.youtube.com`)
    .digest("hex");
  assert.equal(authMatch[2], expectedAuthHash);
  console.log("  Browser cookie export accepted; expired/foreign entries filtered; auth hash generated without logging values.");

  console.log("\n=== 1. Testing UniversalCipherEngine across ES5 & ES6 player bundles + Registry ===");
  const bundles = [
    ["ea6f527e", path.join(__dirname, "reserver-ytb-js/test/fixtures/player/base-ea6f527e.js")],
    ["f4c47414-ias-es5", path.join(__dirname, "youtube-player-scripts/player_ias.vflset/en_US/base.js")],
    ["f4c47414-es6", path.join(__dirname, "youtube-player-scripts/player_es6.vflset/en_US/base.js")],
  ];

  const engines = {};
  for (const [id, filePath] of bundles) {
    const src = fs.readFileSync(filePath, "utf8");
    const derived = derivePlayerConfigFromJs(src, id);
    const engine = new UniversalCipherEngine({ playerId: id, source: src });
    const nIn = "KdrqFlzJXl9EcCwlmEy";
    const nOut = engine.transformN(nIn);
    const sigIn = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_ABCDEFGHIJKLMNOPQ";
    const sigOut = engine.decipherSignature(sigIn);
    console.log(`  [${id}]`, {
      healthy: engine.healthy,
      sts: engine.signatureTimestamp,
      urlBuilderName: derived.urlBuilderName,
      nClass: derived.nClass,
      sig: derived.sig,
      nOut,
      sigOutPreview: sigOut.slice(0, 24),
    });
    assert.equal(engine.healthy, true, `Engine should be healthy for ${id}`);
    assert.notEqual(nOut, nIn, `n parameter must be transformed for ${id}`);
    assert.notEqual(sigOut, sigIn, `signature must be deciphered for ${id}`);
    engines[id] = { nOut, sigOut };
  }

  // Verify ES5 (`player_ias`) and ES6 (`player_es6`) of the same player hash `f4c47414` produce identical outputs!
  assert.equal(
    engines["f4c47414-ias-es5"].nOut,
    engines["f4c47414-es6"].nOut,
    "ES5 and ES6 bundles of f4c47414 must produce identical n-transform output"
  );
  assert.equal(
    engines["f4c47414-ias-es5"].sigOut,
    engines["f4c47414-es6"].sigOut,
    "ES5 and ES6 bundles of f4c47414 must produce identical signature decipher output"
  );

  // Verify live player hash `11a45ffb` lookup in Faraday/Zemer registry
  const regCfg = new UniversalCipherEngine().getRegistryConfig("11a45ffb");
  console.log("  [Registry lookup 11a45ffb]", regCfg);
  assert.equal(regCfg.sts, 20753);
  assert.equal(regCfg.nClass, "hq");

  console.log("\n=== 2. Testing sw.js_data visitorData Extraction & PoToken Generation ===");
  const swRaw = fs.readFileSync(path.join(__dirname, "live-ytm-scripts/sw.js_data.json"), "utf8");
  const visitorData = extractVisitorDataFromSwJsData(swRaw);
  const poToken = generateColdStartPoToken(visitorData);
  console.log("  visitorData:", visitorData);
  console.log("  poToken:", poToken);
  assert.ok(visitorData && /^Cg[ts]/.test(visitorData), "visitorData must start with Cgt/Cgs");
  assert.ok(poToken && poToken.length > 16, "poToken must be non-empty base64url");

  console.log("\n=== 3. Testing GDStudio, Kugou, and Deezer music resolvers ===");
  const gdTrack = {
    id: "451703096",
    name: "Shape of You",
    artist: ["Ed Sheeran"],
    album: "÷ (Deluxe)",
    duration: 233,
    pic_id: "109951171770750671",
    url_id: "451703096",
    lyric_id: "451703096",
  };
  const gdNeteaseAlternative = { ...gdTrack, id: "netease-alt", name: "Shape of You (Live)", url_id: "netease-alt" };
  const gdBilibiliTrack = { ...gdTrack, id: "bili-alt", name: "Shape of You - Cover", url_id: "bili-alt" };
  const kugouTrack = {
    SongName: "Shape of You",
    SingerName: "Ed Sheeran",
    AlbumName: "÷ (Deluxe)",
    Duration: 233,
    FileHash: "0123456789ABCDEF0123456789ABCDEF",
    HQFileHash: "1123456789ABCDEF0123456789ABCDEF",
    SQFileHash: "2123456789ABCDEF0123456789ABCDEF",
    ResFileHash: "3123456789ABCDEF0123456789ABCDEF",
    Privilege: 0,
    HQPrivilege: 0,
    SQPrivilege: 0,
    ResPrivilege: 0,
    Image: "https://imge.kugou.com/stdmusic/{size}/cover.jpg",
  };
  const deezerTrack = {
    id: 1400843202,
    title: "Shape of You",
    duration: 233,
    isrc: "GBAHS1600463",
    preview: "https://cdn.example.test/shape-preview.mp3",
    artist: { name: "Ed Sheeran" },
    album: { title: "÷ (Deluxe)", cover_xl: "https://cdn.example.test/shape-cover.jpg" },
  };
  const gdQualityRequests = [];
  const providerFetch = async (url) => {
    const parsed = new URL(String(url));
    if (parsed.hostname === "music-api.gdstudio.xyz") {
      const params = parsed.searchParams;
      const type = params.get("types");
      if (type === "search") {
        const tracks = params.get("source") === "bilibili"
          ? [gdBilibiliTrack, gdTrack]
          : [gdTrack, gdNeteaseAlternative];
        return new Response(JSON.stringify(tracks), { status: 200 });
      }
      if (type === "url") {
        const br = params.get("br");
        gdQualityRequests.push(br);
        if (br === "999") return new Response(JSON.stringify({ url: "err", br: -1 }), { status: 200 });
        return new Response(JSON.stringify({ url: "https://cdn.example.test/shape-lossless.flac", br: 740, size: 27464927 }), { status: 200 });
      }
      if (type === "pic") return new Response(JSON.stringify({ url: "https://cdn.example.test/shape-cover.jpg" }), { status: 200 });
      if (type === "lyric") return new Response(JSON.stringify({ lyric: "[00:12.34]Hello\n", tlyric: "[00:12.34]你好\n" }), { status: 200 });
      if (type === "playlist") return new Response(JSON.stringify({ playlist: { id: params.get("id"), name: "Global Hits", tracks: [gdTrack] } }), { status: 200 });
    }
    if (parsed.hostname === "complexsearch.kugou.com") {
      return new Response(JSON.stringify({ error_code: 0, data: { lists: [kugouTrack] } }), { status: 200 });
    }
    if (parsed.hostname === "m.kugou.com") {
      return new Response(JSON.stringify({ status: 1, url: "https://cdn.example.test/kugou-320.mp3", extName: "mp3", bitRate: 320, fileSize: 9000 }), { status: 200 });
    }
    if (parsed.hostname === "api.deezer.com") {
      if (parsed.pathname === "/search") return new Response(JSON.stringify({ data: [deezerTrack] }), { status: 200 });
      return new Response(JSON.stringify(deezerTrack), { status: 200 });
    }
    return new Response(null, { status: 404 });
  };

  const gdResolver = new GDStudioMusicResolver({ fetchImpl: providerFetch });
  const gdResults = await gdResolver.search("Shape of You", { source: "netease" });
  assert.equal(gdResults[0].title, "Shape of You");
  assert.equal(gdResults[0].streamId, "451703096");
  const crossSourceResults = await gdResolver.searchAcrossSources("Shape of You", { limit: 10 });
  assert.deepEqual(
    crossSourceResults.map((track) => track.source),
    ["netease", "bilibili", "netease"],
    "GDStudio source lists should interleave before deduplication and limiting"
  );
  const gdStream = await gdResolver.stream(gdResults[0], { quality: "999" });
  assert.equal(gdStream.quality, "lossless");
  assert.equal(gdStream.mimeType, "audio/flac");
  assert.deepEqual(gdQualityRequests, ["999", "740"]);
  assert.equal(await gdResolver.cover(gdResults[0]), "https://cdn.example.test/shape-cover.jpg");
  assert.ok((await gdResolver.lyrics(gdResults[0])).tlyric.includes("你好"));
  assert.equal((await gdResolver.playlist("2809513713")).tracks.length, 1);
  console.log("  GDStudio:", { title: gdResults[0].title, fallbackQuality: gdStream.quality, attemptedBr: gdQualityRequests });

  const signedParams = { keyword: "Shape of You", page: 1 };
  const expectedKugouSignature = crypto
    .createHash("md5")
    .update("NVPh5oo715z5DIWAeQlhMDsWXXQV4hwtkeyword=Shape of Youpage=1NVPh5oo715z5DIWAeQlhMDsWXXQV4hwt")
    .digest("hex")
    .toUpperCase();
  assert.equal(signKugouWebParams(signedParams), expectedKugouSignature);
  const kugouResolver = new KugouMusicResolver({ fetchImpl: providerFetch, mid: "test-mid", clock: () => 1700000000000 });
  const kugouResults = await kugouResolver.search("Shape of You Ed Sheeran");
  const kugouStream = await kugouResolver.stream(kugouResults[0], { quality: "320" });
  assert.equal(kugouStream.client, "KUGOU_MOBILE");
  assert.equal(kugouStream.bitrate, 320000);
  assert.ok(kugouResults[0].coverUrl.endsWith("/480/cover.jpg"));
  console.log("  Kugou:", { title: kugouResults[0].title, stream: kugouStream.streamUrl, signature: expectedKugouSignature });

  const deezerResolver = new DeezerCatalogResolver({ fetchImpl: providerFetch });
  const deezerResults = await deezerResolver.search("Shape of You");
  assert.equal(deezerResults[0].isrc, "GBAHS1600463");
  assert.equal(deezerResults[0].fullStreamAvailable, false);
  await assert.rejects(deezerResolver.stream(), /short previews, not full-song streams/);
  console.log("  Deezer catalog:", { title: deezerResults[0].title, isrc: deezerResults[0].isrc, fullStreamAvailable: deezerResults[0].fullStreamAvailable });

  console.log("\n=== 4. Testing Tail-Range Stream Validator (1 MiB Cap Detection) ===");
  // Simulate an ANDROID_VR URL that passes opening range (0-1024) but 403s past 1 MiB (tail range)
  const mockCappedFetch = async (url, init = {}) => {
    const range = init.headers?.Range || "";
    const m = /bytes=(\d+)-(\d+)/.exec(range);
    if (m && Number(m[2]) > 1048576) {
      return new Response(null, { status: 403 });
    }
    return new Response(new Uint8Array(256), { status: 206 });
  };
  const cappedValid = await validateStreamUrl(
    "https://rr1---sn-abc.googlevideo.com/videoplayback?itag=251",
    {},
    3500000,
    mockCappedFetch
  );
  console.log("  1 MiB-capped URL tail-validation result:", cappedValid);
  assert.equal(cappedValid, false, "Tail probe must reject 1 MiB-capped googlevideo URLs");

  console.log("\n=== 5. Testing Multi-Client Stream Waterfall &BoundedRangeAudioProxy ===");
  const totalBytes = 64 * 1024;
  const upstreamPayload = Buffer.alloc(totalBytes);
  for (let i = 0; i < totalBytes; i++) upstreamPayload[i] = i % 251;
  const upstreamRangeCalls = [];

  const mockFetch = async (url, init = {}) => {
    const u = String(url);
    if (u.includes("/youtubei/v1/player")) {
      const body = JSON.parse(init.body);
      const clientName = body.context.client.clientName;
      if (clientName === "WEB_REMIX") {
        return new Response(
          JSON.stringify({
            playabilityStatus: { status: "OK" },
            videoDetails: {
              videoId: body.videoId,
              title: "Test Track",
              author: "Test Artist - Topic",
              lengthSeconds: "210",
              thumbnail: { thumbnails: [{ url: "https://i.ytimg.com/vi/test/maxresdefault.jpg" }] },
            },
            streamingData: {
              expiresInSeconds: "21540",
              adaptiveFormats: [
                {
                  itag: 251,
                  mimeType: 'audio/webm; codecs="opus"',
                  bitrate: 160000,
                  audioQuality: "AUDIO_QUALITY_MEDIUM",
                  audioChannels: 2,
                  contentLength: String(totalBytes),
                  signatureCipher:
                    "s=ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_ABCDEFGHIJKLMNOPQ&sp=sig&url=" +
                    encodeURIComponent(
                      "https://rr3---sn-mock.googlevideo.com/videoplayback?expire=1900000000&itag=251&n=KdrqFlzJXl9EcCwlmEy&sparams=expire,itag,n"
                    ),
                },
              ],
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
    }

    if (u.includes("rr3---sn-mock.googlevideo.com")) {
      const range = init.headers?.Range || init.headers?.range || "";
      upstreamRangeCalls.push(range);
      const m = /bytes=(\d+)-(\d+)/.exec(range);
      const start = m ? Number(m[1]) : 0;
      const end = m ? Math.min(Number(m[2]), totalBytes - 1) : totalBytes - 1;
      const slice = upstreamPayload.subarray(start, end + 1);
      return new Response(slice, {
        status: 206,
        headers: {
          "content-type": "audio/webm",
          "content-range": `bytes ${start}-${end}/${totalBytes}`,
          "content-length": String(slice.length),
        },
      });
    }

    return new Response(null, { status: 404 });
  };

  const api = new UnifiedMusicAPI({ fetchImpl: mockFetch });
  api.audioProxy = new BoundedRangeAudioProxy({ chunkSize: 16 * 1024, fetchImpl: mockFetch });
  const proxyPort = await api.audioProxy.start();

  const resolved = await api.resolveYouTubeStream("dQw4w9WgXcQ");
  const parsedStreamUrl = new URL(resolved.streamUrl);
  console.log("  Resolved stream:", {
    client: resolved.client,
    itag: resolved.itag,
    nParam: parsedStreamUrl.searchParams.get("n"),
    sigParamPreview: parsedStreamUrl.searchParams.get("sig")?.slice(0, 20),
    potParamPreview: parsedStreamUrl.searchParams.get("pot")?.slice(0, 20),
    alrParam: parsedStreamUrl.searchParams.get("alr"),
    proxyUrl: resolved.proxyUrl,
  });

  assert.equal(resolved.client, "WEB_REMIX");
  assert.equal(parsedStreamUrl.searchParams.get("n"), "CPV7S6bEJUCj-TpjuZ");
  assert.equal(parsedStreamUrl.searchParams.get("alr"), "yes");
  assert.ok(parsedStreamUrl.searchParams.get("sig"), "sig must be attached");
  assert.ok(parsedStreamUrl.searchParams.get("pot"), "pot must be attached");

  // Fetch through the loopback BoundedRangeAudioProxy with an open-ended Range: bytes=0-
  upstreamRangeCalls.length = 0;
  const proxyResp = await fetch(resolved.proxyUrl, {
    headers: { Range: "bytes=0-" },
  });
  const receivedBuf = Buffer.from(await proxyResp.arrayBuffer());
  console.log("  BoundedRangeAudioProxy status:", proxyResp.status);
  console.log("  Upstream bounded-range requests:", upstreamRangeCalls);
  console.log("  Bytes received via proxy:", receivedBuf.length);

  assert.equal(proxyResp.status, 206);
  assert.equal(receivedBuf.length, totalBytes);
  assert.ok(receivedBuf.equals(upstreamPayload), "Proxy stream payload must match byte-for-byte");
  assert.equal(upstreamRangeCalls.length, 4, "64 KiB stream must be fetched in four 16 KiB bounded chunks");

  await api.audioProxy.stop();

  console.log("\n=== 6. Testing match-gated external full-stream fallback ===");
  const fallbackFetch = async (url, init = {}) => {
    const parsed = new URL(String(url));
    if (parsed.pathname.endsWith("/youtubei/v1/player")) {
      const body = JSON.parse(init.body);
      return new Response(JSON.stringify({
        playabilityStatus: { status: "UNPLAYABLE", reason: "Unavailable in this test" },
        videoDetails: { title: "Test Track", author: "Test Artist - Topic", lengthSeconds: "210" },
      }), { status: 200 });
    }
    if (parsed.hostname === "music-api.gdstudio.xyz") {
      const params = parsed.searchParams;
      if (params.get("types") === "search") {
        return new Response(JSON.stringify(params.get("source") === "netease" ? [{
          id: "gd-test-1",
          name: "Test Track",
          artist: ["Test Artist"],
          duration: 210,
          url_id: "gd-test-1",
        }] : []), { status: 200 });
      }
      if (params.get("types") === "url") {
        return new Response(JSON.stringify({ url: "https://cdn.example.test/test-track.flac", br: 999, size: 12000000 }), { status: 200 });
      }
    }
    if (parsed.hostname === "complexsearch.kugou.com") {
      return new Response(JSON.stringify({ error_code: 0, data: { lists: [] } }), { status: 200 });
    }
    return new Response(null, { status: 404 });
  };
  const fallbackApi = new UnifiedMusicAPI({ fetchImpl: fallbackFetch });
  const externalStream = await fallbackApi.resolveYouTubeStream("video-unavailable", {
    title: "Test Track",
    artist: "Test Artist",
    durationSeconds: 210,
    validate: false,
  });
  assert.equal(externalStream.fallbackSource, "gdstudio");
  assert.equal(externalStream.client, "GDSTUDIO");
  assert.ok(externalStream.streamUrl.endsWith("test-track.flac"));
  assert.ok(externalStream.matchScore >= 0.9);
  console.log("  Fallback result:", { provider: externalStream.fallbackSource, quality: externalStream.quality, matchScore: externalStream.matchScore });

  // If YouTube's URL fails the tail-range check, prefer a matched full-track catalog URL.
  const cappedCandidateFetch = async (url, init = {}) => {
    const parsed = new URL(String(url));
    if (parsed.pathname.endsWith("/youtubei/v1/player")) {
      const body = JSON.parse(init.body);
      if (body.videoId === "video-capped") {
        return new Response(JSON.stringify({
          playabilityStatus: { status: "OK" },
          videoDetails: { title: "Test Track", author: "Test Artist - Topic", lengthSeconds: "210" },
          streamingData: { adaptiveFormats: [{
            itag: 251,
            mimeType: 'audio/webm; codecs="opus"',
            bitrate: 160000,
            audioQuality: "AUDIO_QUALITY_MEDIUM",
            contentLength: "2100000",
            url: "https://rr1---sn-mock.googlevideo.com/videoplayback?expire=1900000000&itag=251",
          }] },
        }), { status: 200 });
      }
      return new Response(JSON.stringify({
        playabilityStatus: { status: "UNPLAYABLE", reason: "Unavailable in this test" },
        videoDetails: { title: "Test Track", author: "Test Artist - Topic", lengthSeconds: "210" },
      }), { status: 200 });
    }
    if (parsed.hostname.endsWith("googlevideo.com")) return new Response(null, { status: 403 });
    if (parsed.hostname === "music-api.gdstudio.xyz") {
      const params = parsed.searchParams;
      if (params.get("types") === "search") {
        return new Response(JSON.stringify(params.get("source") === "netease" ? [{
          id: "gd-test-1", name: "Test Track", artist: ["Test Artist"], duration: 210, url_id: "gd-test-1",
        }] : []), { status: 200 });
      }
      if (params.get("types") === "url") {
        return new Response(JSON.stringify({ url: "https://cdn.example.test/test-track.flac", br: 999, size: 12000000 }), { status: 200 });
      }
    }
    if (parsed.hostname === "complexsearch.kugou.com") {
      return new Response(JSON.stringify({ error_code: 0, data: { lists: [] } }), { status: 200 });
    }
    return new Response(null, { status: 404 });
  };
  const cappedCandidateApi = new UnifiedMusicAPI({ fetchImpl: cappedCandidateFetch });
  const cappedFallback = await cappedCandidateApi.resolveYouTubeStream("video-capped");
  assert.equal(cappedFallback.fallbackSource, "gdstudio");
  assert.equal(cappedFallback.validated, null);
  assert.ok(cappedFallback.streamUrl.endsWith("test-track.flac"));

  // An exact-title result from an unrelated artist must not be streamed as a fallback.
  const mismatchFetch = async (url) => {
    const parsed = new URL(String(url));
    if (parsed.pathname.endsWith("/youtubei/v1/player")) {
      return new Response(JSON.stringify({
        playabilityStatus: { status: "UNPLAYABLE" },
        videoDetails: { title: "Test Track", author: "Test Artist - Topic", lengthSeconds: "210" },
      }), { status: 200 });
    }
    if (parsed.hostname === "music-api.gdstudio.xyz" && parsed.searchParams.get("types") === "search") {
      return new Response(JSON.stringify(parsed.searchParams.get("source") === "netease" ? [{
        id: "wrong-artist", name: "Test Track", artist: ["Wrong Artist"], duration: 210, url_id: "wrong-artist",
      }] : []), { status: 200 });
    }
    if (parsed.hostname === "complexsearch.kugou.com") {
      return new Response(JSON.stringify({ error_code: 0, data: { lists: [] } }), { status: 200 });
    }
    return new Response(null, { status: 404 });
  };
  const mismatchApi = new UnifiedMusicAPI({ fetchImpl: mismatchFetch });
  await assert.rejects(
    mismatchApi.resolveYouTubeStream("video-mismatch"),
    /All playback clients and catalog fallbacks exhausted/
  );

  console.log("  Fallback checks: matched catalog stream preferred over a capped URL; unrelated artist rejected.");
  console.log("\nALL UNIFIED MUSIC API TESTS PASSED!");
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});

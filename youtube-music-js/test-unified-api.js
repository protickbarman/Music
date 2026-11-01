import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  UnifiedMusicAPI,
  UniversalCipherEngine,
  BoundedRangeAudioProxy,
  derivePlayerConfigFromJs,
  decryptJioSaavnMediaUrl,
  extractVisitorDataFromSwJsData,
  generateColdStartPoToken,
  validateStreamUrl,
} from "./unified-music-api.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runTests() {
  console.log("=== 1. Testing UniversalCipherEngine across ES5 & ES6 player bundles + Registry ===");
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

  console.log("\n=== 3. Testing JioSaavn DES-ECB (38346591) 320kbps AAC Decryption ===");
  const encryptedSample =
    "ID2ieOjCrwfgWvL5sXl4B1ImC5QfbsDySan+n+AW12BvOaQj7cuGfg8Ed085rYUtqDj8DQY3nIMQdr42ScGdtRw7tS9a8Gtq";
  const saavnUrls = decryptJioSaavnMediaUrl(encryptedSample, 320);
  console.log("  Decrypted JioSaavn URLs:", saavnUrls);
  assert.equal(
    saavnUrls.url320,
    "https://aac.saavncdn.com/450/f467e05e2825cec2203546333e0d0550_320.mp4"
  );

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
  console.log("\nALL UNIFIED MUSIC API TESTS PASSED!");
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});

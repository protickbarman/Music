import assert from "node:assert/strict";
import { MusicApp, normalizeYouTubeMusicTracks } from "./music-app.js";

const searchPayload = {
  contents: [
    {
      musicResponsiveListItemRenderer: {
        playlistItemData: { videoId: "mock-video-123" },
        flexColumns: [
          {
            musicResponsiveListItemFlexColumnRenderer: {
              text: { runs: [{ text: "Midnight City" }] },
            },
          },
          {
            musicResponsiveListItemFlexColumnRenderer: {
              text: {
                runs: [
                  {
                    text: "M83",
                    navigationEndpoint: { browseEndpoint: { browseId: "UC-mock-artist" } },
                  },
                  { text: " • Hurry Up, We're Dreaming" },
                ],
              },
            },
          },
        ],
        fixedColumns: [
          { musicResponsiveListItemFixedColumnRenderer: { text: { simpleText: "4:03" } } },
        ],
        thumbnail: {
          musicThumbnailRenderer: {
            thumbnail: {
              thumbnails: [
                { url: "https://img.example.test/m83-small.jpg" },
                { url: "https://img.example.test/m83-large.jpg" },
              ],
            },
          },
        },
      },
    },
  ],
};

async function run() {
  const normalized = normalizeYouTubeMusicTracks(searchPayload, { limit: 5 });
  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].videoId, "mock-video-123");
  assert.equal(normalized[0].title, "Midnight City");
  assert.equal(normalized[0].artist, "M83");
  assert.equal(normalized[0].durationSeconds, 243);
  assert.equal(normalized[0].thumbnail, "https://img.example.test/m83-large.jpg");

  const fetchImpl = async (url, init = {}) => {
    const parsed = new URL(String(url));
    if (parsed.pathname.endsWith("/youtubei/v1/search")) {
      return new Response(JSON.stringify(searchPayload), { status: 200 });
    }
    if (parsed.pathname.endsWith("/youtubei/v1/player")) {
      return new Response(JSON.stringify({
        playabilityStatus: { status: "OK" },
        videoDetails: { title: "Midnight City", author: "M83 - Topic", lengthSeconds: "243" },
        streamingData: {
          adaptiveFormats: [{
            itag: 251,
            mimeType: 'audio/webm; codecs="opus"',
            bitrate: 160000,
            audioQuality: "AUDIO_QUALITY_MEDIUM",
            contentLength: "2100000",
            url: "https://rr1---sn-mock.googlevideo.com/videoplayback?expire=1900000000&itag=251",
          }],
        },
      }), { status: 200 });
    }
    if (parsed.hostname === "music-api.gdstudio.xyz") {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    if (parsed.hostname === "complexsearch.kugou.com") {
      return new Response(JSON.stringify({ error_code: 0, data: { lists: [] } }), { status: 200 });
    }
    if (parsed.hostname === "api.deezer.com") {
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }
    if (parsed.hostname === "archive.org") {
      return new Response(JSON.stringify({ response: { docs: [] } }), { status: 200 });
    }
    return new Response(null, { status: 404 });
  };

  const app = new MusicApp({ cookie: "SAPISID=synthetic-test-cookie", fetchImpl });
  const init = await app.ready;
  assert.equal(init.ready, true);
  assert.equal(app.core.buildClientHeaders("WEB_REMIX").Cookie, "SAPISID=synthetic-test-cookie");

  const catalogs = await app.search("M83 Midnight City", { limit: 5 });
  assert.ok(catalogs.ytmusic);
  assert.equal(catalogs.query, "M83 Midnight City");

  const stream = await app.play("M83 Midnight City", { validate: false });
  assert.equal(stream.videoId, "mock-video-123");
  assert.equal(stream.client, "WEB_REMIX");
  assert.equal(stream.title, "Midnight City");
  assert.match(stream.streamUrl, /^https:\/\/rr1---sn-mock\.googlevideo\.com\//);

  const lyrics = await app.lyricsFor(normalized[0]);
  assert.equal(lyrics, null);
  await app.close();
  console.log("MusicApp module test passed: auto-init, multi-catalog search, YTM renderer normalization, query-to-stream, and lyrics facade.");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

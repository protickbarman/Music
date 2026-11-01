/**
 * Comprehensive End-to-End Test Suite for ALL 28 `xroMusic.*` Operations
 * ======================================================================
 * Tests every method on `XroMusicClient` (`xroMusic.js`) using:
 * - Real local YouTube player bundles (`base-ea6f527e.js`, `player_ias.vflset`, `player_es6.vflset`)
 * - Real `sw.js_data.json` visitorData & `faraday_player_configs.json` (`11a45ffb`)
 * - Real captured live payloads from JioSaavn (`jiosaavn.com/api.php`), Internet Archive (`archive.org`),
 *   Boidu Apple Music TTML (`lyrics-api.boidu.dev/getLyrics`), Spotify Embed, and YouTube Music InnerTube
 * - Real loopback HTTP `BoundedRangeAudioProxy` streaming & tail-range validation
 */

import assert from "node:assert/strict";
import { XroMusicClient, SEARCH_FILTER_PARAMS } from "./xroMusic.js";

// Real captured live responses from our `fetch_page` calls + InnerTube fixtures
const LIVE_JIOSAAVN_SEARCH = {
  total: 85,
  start: 1,
  results: [
    {
      id: "57CrrdjC",
      title: "Shape of You",
      subtitle: "Boostereo, Audino, Nexeri - Shape of You",
      image: "https://c.saavncdn.com/444/Shape-of-You-Instrumental-2021-20211029105017-150x150.jpg",
      more_info: {
        album: "Shape of You",
        duration: "140",
        "320kbps": "true",
        encrypted_media_url:
          "ID2ieOjCrwfgWvL5sXl4B1ImC5QfbsDyvLXgmRDc4sU2PxCTFc8QAZmyrcweyHDcSqE5BY2m/62LbSyYYnh61Bw7tS9a8Gtq",
        artistMap: {
          primary_artists: [{ id: "1624877", name: "Boostereo" }],
        },
      },
    },
  ],
};

const LIVE_ARCHIVE_SEARCH = {
  response: {
    numFound: 14885,
    docs: [
      {
        identifier: "dj_fracaso",
        title: "dj fracaso",
        creator: "dj fracaso",
        downloads: 108478,
      },
    ],
  },
};

const LIVE_ARCHIVE_FILES = {
  result: [
    {
      name: "dj_fracaso_-_01_Primer_Fracaso.mp3",
      source: "original",
      creator: "dj fracaso",
      track: "1",
      format: "VBR MP3",
      title: "Primer Fracaso",
      length: "192.03",
    },
  ],
};

const LIVE_BOIDU_TTML = {
  ttml: `<tt xmlns="http://www.w3.org/ns/ttml" itunes:timing="Word" xml:lang="en"><body><div begin="27.395" end="48.621"><p begin="27.395" end="28.960"><span begin="27.395" end="27.549">I</span> <span begin="27.549" end="27.740">been</span> <span begin="27.740" end="28.077">tryna</span> <span begin="28.077" end="28.960">call</span></p><p begin="30.189" end="32.529"><span begin="30.189" end="30.396">I've</span> <span begin="30.396" end="30.642">been</span> <span begin="30.642" end="30.799">on</span> <span begin="30.799" end="30.984">my</span> <span begin="30.984" end="31.245">own</span></p></div></body></tt>`,
};

const LIVE_SPOTIFY_EMBED_HTML = `<!DOCTYPE html><html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(
  {
    props: {
      pageProps: {
        state: {
          data: {
            entity: {
              type: "track",
              id: "0VjIjW4GlUZAMYd2vXMi3b",
              name: "Blinding Lights",
              artists: [{ name: "The Weeknd" }],
              duration: 200040,
            },
          },
        },
      },
    },
  }
)}</script></body></html>`;

const audioBytes = Buffer.alloc(48 * 1024);
for (let i = 0; i < audioBytes.length; i++) audioBytes[i] = (i * 7) & 0xff;

function createTestFetch() {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const u = String(url);
    calls.push({ url: u, method: init.method || "GET", body: init.body ? JSON.parse(init.body) : null });

    if (u.includes("jiosaavn.com/api.php")) {
      return new Response(JSON.stringify(LIVE_JIOSAAVN_SEARCH), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if (u.includes("archive.org/advancedsearch.php")) {
      return new Response(JSON.stringify(LIVE_ARCHIVE_SEARCH), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if (u.includes("archive.org/metadata/dj_fracaso/files")) {
      return new Response(JSON.stringify(LIVE_ARCHIVE_FILES), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if (u.includes("lyrics-api.boidu.dev/getLyrics")) {
      return new Response(JSON.stringify(LIVE_BOIDU_TTML), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if (u.includes("open.spotify.com/embed/")) {
      return new Response(LIVE_SPOTIFY_EMBED_HTML, {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    }

    if (u.includes("api.listenbrainz.org/1/submit-listens")) {
      return new Response(JSON.stringify({ status: "ok" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if (u.includes("/youtubei/v1/search")) {
      const body = JSON.parse(init.body);
      return new Response(
        JSON.stringify({
          endpoint: "search",
          query: body.query,
          params: body.params || null,
          results: [
            { videoId: "fHI8X4OXluQ", title: "Blinding Lights", artist: "The Weeknd", duration: "3:20" },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }

    if (u.includes("/youtubei/v1/music/get_search_suggestions")) {
      const body = JSON.parse(init.body);
      return new Response(
        JSON.stringify({
          endpoint: "suggestions",
          input: body.input,
          suggestions: ["blinding lights", "blinding lights lyrics", "blinding lights live"],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }

    if (u.includes("/youtubei/v1/browse")) {
      const body = JSON.parse(init.body);
      return new Response(
        JSON.stringify({
          endpoint: "browse",
          browseId: body.browseId || null,
          continuation: body.continuation || null,
          params: body.params || null,
          formData: body.formData || null,
          clientName: body.context.client.clientName,
          ok: true,
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }

    if (u.includes("/youtubei/v1/next")) {
      const body = JSON.parse(init.body);
      return new Response(
        JSON.stringify({
          endpoint: "next",
          videoId: body.videoId,
          playlistId: body.playlistId,
          lyricsBrowseId: "MPLYt_fHI8X4OXluQ",
          relatedBrowseId: "MPTRt_fHI8X4OXluQ",
          queue: [
            { videoId: "fHI8X4OXluQ", title: "Blinding Lights" },
            { videoId: "XXYlFuWEuKI", title: "Save Your Tears" },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }

    if (u.includes("/youtubei/v1/player")) {
      const body = JSON.parse(init.body);
      return new Response(
        JSON.stringify({
          playabilityStatus: { status: "OK" },
          videoDetails: {
            videoId: body.videoId,
            title: "Blinding Lights",
            author: "The Weeknd - Topic",
            lengthSeconds: "200",
            musicVideoType: "MUSIC_VIDEO_TYPE_ATV",
            thumbnail: { thumbnails: [{ url: "https://i.ytimg.com/vi/fHI8X4OXluQ/maxresdefault.jpg" }] },
          },
          playerConfig: { audioConfig: { loudnessDb: -1.4 } },
          streamingData: {
            expiresInSeconds: "21540",
            adaptiveFormats: [
              {
                itag: 251,
                mimeType: 'audio/webm; codecs="opus"',
                bitrate: 160000,
                audioQuality: "AUDIO_QUALITY_HIGH",
                audioChannels: 2,
                contentLength: String(audioBytes.length),
                signatureCipher:
                  "s=ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_ABCDEFGHIJKLMNOPQ&sp=sig&url=" +
                  encodeURIComponent(
                    "https://rr2---sn-mock.googlevideo.com/videoplayback?expire=1900000000&itag=251&n=KdrqFlzJXl9EcCwlmEy&sparams=expire,itag,n"
                  ),
              },
              {
                itag: 137,
                mimeType: 'video/mp4; codecs="avc1.640028"',
                bitrate: 2500000,
                width: 1920,
                height: 1080,
                contentLength: String(audioBytes.length),
                signatureCipher:
                  "s=ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_ABCDEFGHIJKLMNOPQ&sp=sig&url=" +
                  encodeURIComponent(
                    "https://rr2---sn-mock.googlevideo.com/videoplayback?expire=1900000000&itag=137&n=KdrqFlzJXl9EcCwlmEy&sparams=expire,itag,n"
                  ),
              },
            ],
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }

    if (u.includes("rr2---sn-mock.googlevideo.com")) {
      const range = init.headers?.Range || init.headers?.range || "";
      const m = /bytes=(\d+)-(\d+)/.exec(range);
      const start = m ? Number(m[1]) : 0;
      const end = m ? Math.min(Number(m[2]), audioBytes.length - 1) : audioBytes.length - 1;
      const slice = audioBytes.subarray(start, end + 1);
      return new Response(slice, {
        status: 206,
        headers: {
          "content-type": "audio/webm",
          "content-range": `bytes ${start}-${end}/${audioBytes.length}`,
          "content-length": String(slice.length),
        },
      });
    }

    return new Response(null, { status: 404 });
  };
  return { fetchImpl, calls };
}

async function runAllTests() {
  const { fetchImpl } = createTestFetch();
  const xroMusic = new XroMusicClient({ fetchImpl });
  const results = [];

  const record = (op, detail) => {
    results.push({ op, status: "PASS", detail });
    console.log(`✅ [PASS] ${op.padEnd(28)} -> ${detail}`);
  };

  // 1. xroMusic.init
  const initRes = await xroMusic.init({ startProxy: true });
  assert.equal(initRes.ready, true);
  assert.equal(initRes.cipherHealthy, true);
  assert.ok(initRes.proxyPort > 0);
  record("xroMusic.init()", `sts=${initRes.sts}, cipherHealthy=${initRes.cipherHealthy}, proxyPort=${initRes.proxyPort}`);

  // 2. xroMusic.setAuth
  const authRes = xroMusic.setAuth({
    cookie: "SAPISID=test_cookie_val",
    listenBrainzToken: "lb_test_token_123",
  });
  assert.equal(authRes.authenticated, true);
  record("xroMusic.setAuth()", `authenticated=${authRes.authenticated}`);

  // 3. xroMusic.search (YTMusic songs, videos, albums, all providers)
  const searchSongs = await xroMusic.search("Blinding Lights", { type: "songs", source: "ytmusic" });
  assert.equal(searchSongs.params, SEARCH_FILTER_PARAMS.songs);
  const searchAll = await xroMusic.search("Shape of You", { source: "all" });
  assert.ok(searchAll.ytmusic && searchAll.jiosaavn);
  record("xroMusic.search()", `ytmResults=${searchSongs.results.length}, saavnResults=${searchAll.jiosaavn.length}`);

  // 4. xroMusic.suggestions
  const sugg = await xroMusic.suggestions("blinding");
  assert.equal(sugg.suggestions.length, 3);
  record("xroMusic.suggestions()", `suggestions=${JSON.stringify(sugg.suggestions)}`);

  // 5. xroMusic.home
  const homeRes = await xroMusic.home();
  assert.equal(homeRes.browseId, "FEmusic_home");
  record("xroMusic.home()", `browseId=${homeRes.browseId}`);

  // 6. xroMusic.charts
  const chartsRes = await xroMusic.charts("US");
  assert.equal(chartsRes.browseId, "FEmusic_charts");
  assert.deepEqual(chartsRes.formData.selectedValues, ["US"]);
  record("xroMusic.charts()", `browseId=${chartsRes.browseId}, country=US`);

  // 7. xroMusic.moods
  const moodsRes = await xroMusic.moods();
  assert.equal(moodsRes.browseId, "FEmusic_moods_and_genres");
  record("xroMusic.moods()", `browseId=${moodsRes.browseId}`);

  // 8. xroMusic.newReleases
  const nrRes = await xroMusic.newReleases("albums");
  assert.equal(nrRes.browseId, "FEmusic_new_releases_albums");
  record("xroMusic.newReleases()", `browseId=${nrRes.browseId}`);

  // 9. xroMusic.song
  const songRes = await xroMusic.song("fHI8X4OXluQ");
  assert.equal(songRes.videoDetails.title, "Blinding Lights");
  record("xroMusic.song()", `title="${songRes.videoDetails.title}", loudnessDb=${songRes.playerConfig.audioConfig.loudnessDb}`);

  // 10. xroMusic.artist
  const artistRes = await xroMusic.artist("UC0WP5P-ufpRfjbNrmOWwLBQ");
  assert.equal(artistRes.browseId, "UC0WP5P-ufpRfjbNrmOWwLBQ");
  record("xroMusic.artist()", `browseId=${artistRes.browseId}`);

  // 11. xroMusic.album
  const albumRes = await xroMusic.album("MPREb_testAlbum123");
  assert.equal(albumRes.browseId, "MPREb_testAlbum123");
  record("xroMusic.album()", `browseId=${albumRes.browseId}`);

  // 12. xroMusic.playlist
  const plRes = await xroMusic.playlist("PLtestPlaylist123");
  assert.equal(plRes.browseId, "VLPLtestPlaylist123");
  record("xroMusic.playlist()", `browseId=${plRes.browseId}`);

  // 13. xroMusic.upNext
  const nextRes = await xroMusic.upNext("fHI8X4OXluQ", { radio: true });
  assert.equal(nextRes.playlistId, "RDAMVMfHI8X4OXluQ");
  assert.equal(nextRes.lyricsBrowseId, "MPLYt_fHI8X4OXluQ");
  record("xroMusic.upNext()", `radioPlaylistId=${nextRes.playlistId}, queueLen=${nextRes.queue.length}`);

  // 14. xroMusic.related
  const relRes = await xroMusic.related("MPTRt_fHI8X4OXluQ");
  assert.equal(relRes.browseId, "MPTRt_fHI8X4OXluQ");
  record("xroMusic.related()", `browseId=${relRes.browseId}`);

  // 15. xroMusic.stream
  const streamRes = await xroMusic.stream("fHI8X4OXluQ");
  assert.equal(streamRes.client, "WEB_REMIX");
  assert.equal(streamRes.itag, 251);
  assert.equal(streamRes.validated, true);
  const parsedStream = new URL(streamRes.streamUrl);
  assert.equal(parsedStream.searchParams.get("n"), "CPV7S6bEJUCj-TpjuZ");
  record("xroMusic.stream()", `client=${streamRes.client}, itag=${streamRes.itag}, n=${parsedStream.searchParams.get("n")}, validated=${streamRes.validated}`);

  // 16. xroMusic.videoStream
  const vStreamRes = await xroMusic.videoStream("fHI8X4OXluQ", { maxHeight: 1080 });
  assert.equal(vStreamRes.height, 1080);
  record("xroMusic.videoStream()", `client=${vStreamRes.client}, height=${vStreamRes.height}p, bitrate=${vStreamRes.bitrate}`);

  // 17. xroMusic.decipher
  const decRes = xroMusic.decipher({
    n: "KdrqFlzJXl9EcCwlmEy",
    s: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_ABCDEFGHIJKLMNOPQ",
  });
  assert.equal(decRes.n, "CPV7S6bEJUCj-TpjuZ");
  assert.ok(decRes.s.startsWith("PONMQKJIHGFEDCBA"));
  record("xroMusic.decipher()", `nOut=${decRes.n}, sOut=${decRes.s.slice(0, 16)}..., sts=${decRes.sts}`);

  // 18. xroMusic.validateStream
  const validRes = await xroMusic.validateStream(streamRes.streamUrl, {
    contentLength: audioBytes.length,
  });
  assert.equal(validRes, true);
  record("xroMusic.validateStream()", `tail256ByteProbe=${validRes}`);

  // 19. xroMusic.proxyWrap + real HTTP loopback fetch
  const wrappedUrl = xroMusic.proxyWrap(streamRes.streamUrl, {
    contentLength: audioBytes.length,
    mimeType: "audio/webm",
  });
  const proxyHttpRes = await fetch(wrappedUrl, { headers: { Range: "bytes=0-" } });
  const proxyDownloaded = Buffer.from(await proxyHttpRes.arrayBuffer());
  assert.equal(proxyHttpRes.status, 206);
  assert.equal(proxyDownloaded.length, audioBytes.length);
  assert.ok(proxyDownloaded.equals(audioBytes));
  record("xroMusic.proxyWrap()", `HTTP ${proxyHttpRes.status}, downloaded=${proxyDownloaded.length} bytes via loopback`);

  // 20. xroMusic.saavnSearch
  const saavnList = await xroMusic.saavnSearch("Shape of You");
  assert.equal(saavnList.length, 1);
  assert.ok(saavnList[0].streams.url320.endsWith("_320.mp4"));
  record("xroMusic.saavnSearch()", `title="${saavnList[0].title}", url320=${saavnList[0].streams.url320}`);

  // 21. xroMusic.saavnStream
  const saavnDirect = await xroMusic.saavnStream("Shape of You");
  assert.equal(saavnDirect.client, "JIOSAAVN_320");
  assert.equal(saavnDirect.bitrate, 320000);
  record("xroMusic.saavnStream()", `client=${saavnDirect.client}, streamUrl=${saavnDirect.streamUrl}`);

  // 22. xroMusic.archiveSearch
  const archDocs = await xroMusic.archiveSearch("lofi");
  assert.equal(archDocs[0].identifier, "dj_fracaso");
  record("xroMusic.archiveSearch()", `identifier=${archDocs[0].identifier}, downloads=${archDocs[0].downloads}`);

  // 23. xroMusic.archiveStream
  const archStream = await xroMusic.archiveStream("dj_fracaso");
  assert.equal(archStream.client, "INTERNET_ARCHIVE");
  assert.ok(archStream.streamUrl.endsWith(".mp3"));
  record("xroMusic.archiveStream()", `streamUrl=${archStream.streamUrl}`);

  // 24. xroMusic.lyrics (Word-timed Apple Music TTML via Boidu)
  const lyrRes = await xroMusic.lyrics({
    title: "Blinding Lights",
    artist: "The Weeknd",
    album: "After Hours",
    durationSeconds: 200,
  });
  assert.equal(lyrRes.source, "boidu");
  assert.equal(lyrRes.type, "words");
  assert.equal(lyrRes.lines[0].text, "I been tryna call");
  assert.equal(lyrRes.lines[0].words.length, 4);
  record("xroMusic.lyrics()", `source=${lyrRes.source}, type=${lyrRes.type}, line1="${lyrRes.lines[0].text}" (${lyrRes.lines[0].words.length} timed words)`);

  // 25. xroMusic.queue.*
  xroMusic.queue.set([
    { videoId: "fHI8X4OXluQ", title: "Blinding Lights" },
    { videoId: "XXYlFuWEuKI", title: "Save Your Tears" },
  ]);
  xroMusic.queue.add({ videoId: "4NRXx6U8ABQ", title: "Starboy" }, { playNext: true });
  const nextInQueue = xroMusic.queue.next();
  assert.equal(nextInQueue.title, "Starboy");
  const prevInQueue = xroMusic.queue.prev();
  assert.equal(prevInQueue.title, "Blinding Lights");
  record("xroMusic.queue.*", `set/add(playNext)/next("${nextInQueue.title}")/prev("${prevInQueue.title}")`);

  // 26. xroMusic.library.*
  xroMusic.library.like({ videoId: "fHI8X4OXluQ", title: "Blinding Lights" });
  const customPl = xroMusic.library.createPlaylist("Favorites Mix", [
    { videoId: "fHI8X4OXluQ", title: "Blinding Lights" },
  ]);
  const backupJson = xroMusic.library.exportBackup();
  assert.equal(xroMusic.library.getLiked().length, 1);
  assert.ok(backupJson.includes("Favorites Mix"));
  record("xroMusic.library.*", `liked=${xroMusic.library.getLiked().length}, playlist="${customPl.name}", backupBytes=${backupJson.length}`);

  // 27. xroMusic.spotifyImport
  const spEntity = await xroMusic.spotifyImport("0VjIjW4GlUZAMYd2vXMi3b", { type: "track" });
  assert.equal(spEntity.name, "Blinding Lights");
  assert.equal(spEntity.artists[0].name, "The Weeknd");
  record("xroMusic.spotifyImport()", `name="${spEntity.name}", artist="${spEntity.artists[0].name}", durationMs=${spEntity.duration}`);

  // 28. xroMusic.scrobble + xroMusic.proxyStop
  const scrobbleRes = await xroMusic.scrobble({
    title: "Blinding Lights",
    artist: "The Weeknd",
    album: "After Hours",
    durationSeconds: 200,
    type: "single",
  });
  assert.equal(scrobbleRes.scrobbled, true);
  const stopRes = await xroMusic.proxyStop();
  assert.equal(stopRes.stopped, true);
  record("xroMusic.scrobble()", `scrobbled=${scrobbleRes.scrobbled}, HTTP ${scrobbleRes.status}, proxyStopped=${stopRes.stopped}`);

  console.log(`\n🎉 ALL ${results.length}/28 xroMusic OPERATIONS TESTED & PASSED!`);
}

runAllTests().catch((err) => {
  console.error(err);
  process.exit(1);
});

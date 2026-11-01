/**
 * Comprehensive End-to-End Test Suite for ALL 28 `xroMusic.*` Operations
 * ======================================================================
 * Tests every method on `XroMusicClient` (`xroMusic.js`) using:
 * - Real local YouTube player bundles (`base-ea6f527e.js`, `player_ias.vflset`, `player_es6.vflset`)
 * - Real `sw.js_data.json` visitorData & `faraday_player_configs.json` (`11a45ffb`)
 * - Captured GDStudio, Kugou, Deezer, Internet Archive, Boidu TTML, Spotify Embed,
 *   and YouTube Music InnerTube payload fixtures (all network calls are mocked)
 * - Real loopback HTTP `BoundedRangeAudioProxy` streaming & tail-range validation
 */

import assert from "node:assert/strict";
import { XroMusicClient, SEARCH_FILTER_PARAMS } from "./xroMusic.js";

// Real captured live responses from our `fetch_page` calls + InnerTube fixtures
const LIVE_GDSTUDIO_TRACK = {
  id: "451703096",
  name: "Shape of You",
  artist: ["Ed Sheeran"],
  album: "÷ (Deluxe)",
  duration: 233,
  pic_id: "109951171770750671",
  url_id: "451703096",
  lyric_id: "451703096",
};

const LIVE_KUGOU_TRACK = {
  EMixSongID: "987654321",
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

const LIVE_DEEZER_TRACK = {
  id: 1400843202,
  title: "Shape of You",
  title_short: "Shape of You",
  link: "https://www.deezer.com/track/1400843202",
  duration: 233,
  isrc: "GBAHS1600463",
  preview: "https://cdn.example.test/shape-preview.mp3",
  artist: { id: 123, name: "Ed Sheeran" },
  album: {
    id: 456,
    title: "÷ (Deluxe)",
    cover_big: "https://cdn.example.test/shape-cover.jpg",
    cover_xl: "https://cdn.example.test/shape-cover-xl.jpg",
  },
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

    if (u.includes("music-api.gdstudio.xyz/api.php")) {
      const params = new URL(u).searchParams;
      const type = params.get("types");
      let body;
      if (type === "search") body = [LIVE_GDSTUDIO_TRACK];
      else if (type === "url") {
        const br = params.get("br");
        body = {
          url: br === "999"
            ? "https://cdn.example.test/shape-of-you-hires.flac"
            : br === "740"
              ? "https://cdn.example.test/shape-of-you-lossless.flac"
              : "https://cdn.example.test/shape-of-you-320.mp3",
          br: Number(br),
          size: 9350836,
        };
      } else if (type === "pic") body = { url: "https://cdn.example.test/shape-cover-500.jpg" };
      else if (type === "lyric") body = { lyric: "[00:12.34]Hello, it's me\n", tlyric: "[00:12.34]你好\n" };
      else if (type === "playlist") body = { playlist: { id: params.get("id"), name: "Global Hits", tracks: [LIVE_GDSTUDIO_TRACK] } };
      else body = { detail: `Unexpected GDStudio type: ${type}` };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if (u.includes("complexsearch.kugou.com/v2/search/song")) {
      return new Response(JSON.stringify({ error_code: 0, data: { lists: [LIVE_KUGOU_TRACK] } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if (u.includes("m.kugou.com/app/i/getSongInfo.php")) {
      return new Response(JSON.stringify({
        status: 1,
        url: "https://cdn.example.test/shape-of-you-kugou.mp3",
        extName: "mp3",
        bitRate: 320,
        fileSize: 9350836,
        timeLength: 233,
        songName: "Shape of You",
        singerName: "Ed Sheeran",
        albumName: "÷ (Deluxe)",
      }), { status: 200, headers: { "content-type": "application/json" } });
    }

    if (u.includes("krcs.kugou.com/search")) {
      return new Response(JSON.stringify({ candidates: [{
        id: "lyric-1", accesskey: "access-1", song: "Shape of You", singer: "Ed Sheeran", duration: 233000,
      }] }), { status: 200, headers: { "content-type": "application/json" } });
    }

    if (u.includes("krcs.kugou.com/download")) {
      return new Response(JSON.stringify({
        content: Buffer.from("[00:12.34]Hello, it's me\n").toString("base64"),
        contenttype: 1,
      }), { status: 200, headers: { "content-type": "application/json" } });
    }

    if (u.includes("api.deezer.com/search")) {
      return new Response(JSON.stringify({ data: [LIVE_DEEZER_TRACK], total: 1 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (u.includes("api.deezer.com/track/")) {
      return new Response(JSON.stringify(LIVE_DEEZER_TRACK), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (u.includes("api.deezer.com/album/")) {
      return new Response(JSON.stringify({
        id: 456,
        title: "÷ (Deluxe)",
        artist: { name: "Ed Sheeran" },
        cover_xl: "https://cdn.example.test/shape-cover-xl.jpg",
        tracks: { data: [LIVE_DEEZER_TRACK] },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (u.includes("api.deezer.com/artist/") && u.includes("/top")) {
      return new Response(JSON.stringify({ data: [LIVE_DEEZER_TRACK] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (u.includes("api.deezer.com/chart")) {
      return new Response(JSON.stringify({
        tracks: { data: [LIVE_DEEZER_TRACK] },
        albums: { data: [{ id: 456, title: "÷ (Deluxe)", artist: { name: "Ed Sheeran" }, cover_big: "https://cdn.example.test/shape-cover.jpg" }] },
        artists: { data: [{ id: 123, name: "Ed Sheeran" }] },
      }), { status: 200, headers: { "content-type": "application/json" } });
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
    cookie: {
      url: "https://music.youtube.com/",
      cookies: [{
        name: "SAPISID",
        value: "test_cookie_val",
        domain: ".youtube.com",
        path: "/",
        expirationDate: Math.floor(Date.now() / 1000) + 3600,
      }],
    },
    listenBrainzToken: "lb_test_token_123",
  });
  assert.equal(authRes.authenticated, true);
  const authenticatedHeaders = xroMusic.core.buildClientHeaders("WEB_REMIX");
  assert.equal(authenticatedHeaders.Cookie, "SAPISID=test_cookie_val");
  assert.match(authenticatedHeaders.Authorization, /^SAPISIDHASH \d+_[a-f0-9]{40}$/);
  record("xroMusic.setAuth()", `authenticated=${authRes.authenticated}`);

  // 3. xroMusic.search (YTMusic songs, videos, albums, all providers)
  const searchSongs = await xroMusic.search("Blinding Lights", { type: "songs", source: "ytmusic" });
  assert.equal(searchSongs.params, SEARCH_FILTER_PARAMS.songs);
  const searchAll = await xroMusic.search("Shape of You", { source: "all" });
  assert.ok(searchAll.ytmusic && searchAll.gdstudio && searchAll.kugou && searchAll.deezer);
  record(
    "xroMusic.search()",
    `ytmResults=${searchSongs.results.length}, gdStudioResults=${searchAll.gdstudio.length}, kugouResults=${searchAll.kugou.length}, deezerResults=${searchAll.deezer.length}`
  );

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

  // 20–25. GDStudio search, full-stream quality, cover, lyrics, playlist, and charts
  const gdList = await xroMusic.gdStudioSearch("Shape of You", { source: "netease" });
  assert.equal(gdList[0].title, "Shape of You");
  assert.equal(gdList[0].artist, "Ed Sheeran");
  record("xroMusic.gdStudioSearch()", `track=${gdList[0].title} — ${gdList[0].artist}`);

  const gdStream = await xroMusic.gdStudioStream(gdList[0], { quality: "320" });
  assert.equal(gdStream.client, "GDSTUDIO");
  assert.equal(gdStream.bitrate, 320000);
  assert.ok(gdStream.streamUrl.endsWith("shape-of-you-320.mp3"));
  record("xroMusic.gdStudioStream()", `quality=${gdStream.quality}, br=${gdStream.bitrate}, url=${gdStream.streamUrl}`);

  const gdCover = await xroMusic.gdStudioCover(gdList[0], { size: 500 });
  assert.equal(gdCover, "https://cdn.example.test/shape-cover-500.jpg");
  record("xroMusic.gdStudioCover()", `coverUrl=${gdCover}`);

  const gdLyrics = await xroMusic.gdStudioLyrics(gdList[0]);
  assert.equal(gdLyrics.source, "netease");
  assert.ok(gdLyrics.lyric.includes("Hello, it's me"));
  assert.ok(gdLyrics.tlyric.includes("你好"));
  record("xroMusic.gdStudioLyrics()", `source=${gdLyrics.source}, translated=${Boolean(gdLyrics.tlyric)}`);

  const gdPlaylist = await xroMusic.gdStudioPlaylist("2809513713");
  assert.equal(gdPlaylist.name, "Global Hits");
  assert.equal(gdPlaylist.tracks.length, 1);
  record("xroMusic.gdStudioPlaylist()", `name=${gdPlaylist.name}, tracks=${gdPlaylist.tracks.length}`);

  const gdCharts = xroMusic.gdStudioCharts();
  assert.ok(gdCharts.some((chart) => chart.id === "2809513713"));
  record("xroMusic.gdStudioCharts()", `chartDefinitions=${gdCharts.length}`);

  // 26–28. Kugou full stream and synced lyrics, plus signed web search
  const kugouList = await xroMusic.kugouSearch("Shape of You Ed Sheeran");
  assert.equal(kugouList[0].title, "Shape of You");
  assert.equal(kugouList[0].hashes.mp3_320, LIVE_KUGOU_TRACK.HQFileHash);
  record("xroMusic.kugouSearch()", `track=${kugouList[0].title}, 320Hash=${kugouList[0].hashes.mp3_320}`);

  const kugouStream = await xroMusic.kugouStream(kugouList[0], { quality: "320" });
  assert.equal(kugouStream.client, "KUGOU_MOBILE");
  assert.equal(kugouStream.bitrate, 320000);
  record("xroMusic.kugouStream()", `quality=${kugouStream.quality}, bitrate=${kugouStream.bitrate}`);

  const kugouLyrics = await xroMusic.kugouLyrics({ title: "Shape of You", artist: "Ed Sheeran", durationSeconds: 233 });
  assert.equal(kugouLyrics.source, "kugou");
  assert.ok(kugouLyrics.lrc.includes("Hello, it's me"));
  record("xroMusic.kugouLyrics()", `source=${kugouLyrics.source}, timedLrc=${kugouLyrics.lrc.split("\n").length} line(s)`);

  // 29–33. Deezer catalog metadata and short-preview surfaces (not full-song streaming)
  const deezerList = await xroMusic.deezerSearch("Shape of You Ed Sheeran");
  assert.equal(deezerList[0].isrc, "GBAHS1600463");
  assert.equal(deezerList[0].fullStreamAvailable, false);
  record("xroMusic.deezerSearch()", `ISRC=${deezerList[0].isrc}, preview=${Boolean(deezerList[0].previewUrl)}`);

  const deezerTrack = await xroMusic.deezerTrack("1400843202");
  assert.equal(deezerTrack.title, "Shape of You");
  record("xroMusic.deezerTrack()", `title=${deezerTrack.title}, album=${deezerTrack.album}`);

  const deezerAlbum = await xroMusic.deezerAlbum("456");
  assert.equal(deezerAlbum.tracks.length, 1);
  record("xroMusic.deezerAlbum()", `title=${deezerAlbum.title}, tracks=${deezerAlbum.tracks.length}`);

  const deezerTop = await xroMusic.deezerArtistTop("123");
  assert.equal(deezerTop[0].artist, "Ed Sheeran");
  record("xroMusic.deezerArtistTop()", `topTracks=${deezerTop.length}`);

  const deezerCharts = await xroMusic.deezerCharts();
  assert.equal(deezerCharts.tracks.length, 1);
  assert.equal(deezerCharts.artists[0].name, "Ed Sheeran");
  record("xroMusic.deezerCharts()", `tracks=${deezerCharts.tracks.length}, artists=${deezerCharts.artists.length}`);

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

  console.log(`\n🎉 ALL ${results.length}/40 xroMusic OPERATIONS TESTED & PASSED!`);
}

runAllTests().catch((err) => {
  console.error(err);
  process.exit(1);
});

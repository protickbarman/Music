/**
 * xroMusic — Unified Multi-Source Music & Playback Client Module
 * ==============================================================
 * Zero-key, multi-provider music client combining:
 * - YouTube Music (`WEB_REMIX`, `VISIONOS`, `TVHTML5_SIMPLY`, `IOS`, `ANDROID_VR`, `IOS_MUSIC`)
 * - Universal `node:vm` Player Cipher (`s`) & Anti-Throttle (`n`) Engine (ES5 `player_ias` + ES6 `player_es6` + Faraday Registry)
 * - `sw.js_data` `visitorData` & `bgutils` `poToken` Minting
 * - Loopback 4 MiB Bounded-Range Audio Proxy (`googlevideo.com` & `c.youtube.com` unthrottler)
 * - GDStudio / NetEase-Bilibili 320kbps MP3 + lossless/Hi-Res FLAC search and stream
 * - Kugou Web-salt search + free-track direct streams + KRC/LRC lyrics
 * - Deezer public catalog, ISRC, artwork, charts, and preview metadata (no full stream)
 * - Internet Archive (`archive.org`) Lossless FLAC / MP3 Engine
 * - Multi-provider synced lyrics waterfall (GDStudio, Kugou, NetEase, QQ, LRCLIB, TTML)
 * - Spotify Public Embed Track/Playlist Importer & ListenBrainz/Last.fm Scrobbler
 */

import {
  UnifiedMusicAPI,
  UniversalCipherEngine,
  BoundedRangeAudioProxy,
  StreamFetchManager,
  CLIENTS,
  STREAM_FALLBACK_ORDER,
  UPLOAD_FALLBACK_ORDER,
  derivePlayerConfigFromJs,
  extractVisitorDataFromSwJsData,
  generateColdStartPoToken,
  validateStreamUrl,
  selectBestAudioFormat,
  isYouTubeStreamHost,
} from "./unified-music-api.js";

// Innertube search filter params (`EgWKAQ...` protobuf base64)
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

export class XroMusicClient {
  constructor(options = {}) {
    this.core = new UnifiedMusicAPI(options);
    this._queue = [];
    this._queueIndex = -1;
    this._repeatMode = "off"; // "off" | "all" | "one"
    this._shuffle = false;
    this._library = {
      likedSongs: new Map(),
      playlists: new Map(),
      history: [],
    };
    this._scrobbleConfig = {
      listenBrainzToken: options.listenBrainzToken || null,
      lastFmApiKey: options.lastFmApiKey || null,
      lastFmSessionKey: options.lastFmSessionKey || null,
    };
  }

  // ==========================================================================
  // 1. INITIALIZATION & SESSION CONFIGURATION
  // ==========================================================================

  /**
   * xroMusic.init(options)
   * Initializes visitorData, poToken, cipher VM, and optional loopback audio proxy.
   */
  async init(options = {}) {
    if (options.cookie) this.core.cookie = options.cookie;
    if (options.hl) this.core.hl = options.hl;
    if (options.gl) this.core.gl = options.gl;
    if (options.startProxy) {
      await this.core.audioProxy.start(options.proxyPort || 0);
    }
    return {
      ready: true,
      visitorData: this.core.visitorData,
      poToken: this.core.poToken,
      sts: this.core.cipher.signatureTimestamp,
      cipherHealthy: this.core.cipher.healthy,
      proxyPort: this.core.audioProxy.port,
      clients: Object.keys(CLIENTS),
    };
  }

  /**
   * xroMusic.setAuth({ cookie, listenBrainzToken, lastFmApiKey })
   * Optional: sets YouTube Music cookie (for private uploads / 18+ tracks) & scrobble tokens.
   */
  setAuth({ cookie, visitorData, poToken, listenBrainzToken, lastFmApiKey, lastFmSessionKey } = {}) {
    if (cookie !== undefined) this.core.cookie = cookie;
    if (visitorData) this.core.visitorData = visitorData;
    if (poToken) this.core.poToken = poToken;
    if (listenBrainzToken !== undefined) this._scrobbleConfig.listenBrainzToken = listenBrainzToken;
    if (lastFmApiKey !== undefined) this._scrobbleConfig.lastFmApiKey = lastFmApiKey;
    if (lastFmSessionKey !== undefined) this._scrobbleConfig.lastFmSessionKey = lastFmSessionKey;
    return { authenticated: Boolean(this.core.cookie) };
  }

  // ==========================================================================
  // 2. SEARCH & DISCOVERY OPERATIONS
  // ==========================================================================

  /**
   * Search YouTube Music, GDStudio (NetEase/Bilibili), Kugou, Deezer, or the Internet Archive.
   * `source: "all"` runs the configured catalogs concurrently; Deezer is metadata/preview only.
   */
  async search(
    query,
    {
      type = "songs",
      source = "ytmusic",
      limit = 20,
      continuation = null,
      gdSource = "netease",
      gdSources = undefined,
    } = {}
  ) {
    if (["gdstudio", "gd", "netease", "bilibili"].includes(source)) {
      const selectedSource = source === "netease" || source === "bilibili" ? source : gdSource;
      return source === "gdstudio" && gdSources
        ? this.core.gdStudio.searchAcrossSources(query, { sources: gdSources, limit })
        : this.core.gdStudio.search(query, { source: selectedSource, limit });
    }
    if (source === "kugou") return this.core.kugou.search(query, { limit });
    if (source === "deezer") return this.core.deezer.search(query, { limit });
    if (source === "archive") return this.archiveSearch(query, { limit });
    if (source === "all") {
      const [ytmusic, gdstudio, kugou, deezer, archive] = await Promise.allSettled([
        this.search(query, { type, source: "ytmusic", limit, continuation }),
        this.core.gdStudio.searchAcrossSources(query, { limit }),
        this.core.kugou.search(query, { limit }),
        this.core.deezer.search(query, { limit }),
        this.archiveSearch(query, { limit }),
      ]);
      const valueOrNull = (result) => (result.status === "fulfilled" ? result.value : null);
      const errorOrNull = (result) =>
        result.status === "rejected" ? String(result.reason?.message || result.reason) : null;
      return {
        query,
        ytmusic: valueOrNull(ytmusic),
        gdstudio: valueOrNull(gdstudio),
        kugou: valueOrNull(kugou),
        deezer: valueOrNull(deezer),
        archive: valueOrNull(archive),
        errors: {
          ytmusic: errorOrNull(ytmusic),
          gdstudio: errorOrNull(gdstudio),
          kugou: errorOrNull(kugou),
          deezer: errorOrNull(deezer),
          archive: errorOrNull(archive),
        },
      };
    }
    if (source !== "ytmusic") throw new Error(`Unsupported music search source: ${source}`);

    const payload = continuation
      ? { continuation }
      : {
          query,
          ...(SEARCH_FILTER_PARAMS[type] ? { params: SEARCH_FILTER_PARAMS[type] } : {}),
        };
    return this.core.requestInnerTube("search", payload, "WEB_REMIX");
  }

  /**
   * xroMusic.suggestions(input)
   * Real-time search autocomplete suggestions + quick entity matches from `music/get_search_suggestions`.
   */
  async suggestions(input) {
    return this.core.requestInnerTube("music/get_search_suggestions", { input }, "WEB_REMIX");
  }

  /**
   * xroMusic.home(continuation)
   * Fetches YouTube Music Home feed shelves (`FEmusic_home`) or paginates via `continuation`.
   */
  async home(continuation = null) {
    const payload = continuation ? { continuation } : { browseId: "FEmusic_home" };
    return this.core.requestInnerTube("browse", payload, "WEB_REMIX");
  }

  /**
   * xroMusic.charts(countryCode)
   * Fetches Top Songs, Top Music Videos, Top Artists, and Trending charts (`FEmusic_charts`).
   */
  async charts(countryCode = "US") {
    return this.core.requestInnerTube(
      "browse",
      {
        browseId: "FEmusic_charts",
        formData: { selectedValues: [countryCode] },
      },
      "WEB_REMIX"
    );
  }

  /**
   * xroMusic.moods(params)
   * Lists all Mood & Genre categories (`FEmusic_moods_and_genres`) or drills into a category (`FEmusic_moods_and_genres_category`).
   */
  async moods(params = null) {
    const payload = params
      ? { browseId: "FEmusic_moods_and_genres_category", params }
      : { browseId: "FEmusic_moods_and_genres" };
    return this.core.requestInnerTube("browse", payload, "WEB_REMIX");
  }

  /**
   * xroMusic.newReleases()
   * Fetches new album & single releases (`FEmusic_new_releases_albums` / `FEmusic_new_releases`).
   */
  async newReleases(type = "albums") {
    const browseId =
      type === "videos" ? "FEmusic_new_releases_videos" : "FEmusic_new_releases_albums";
    return this.core.requestInnerTube("browse", { browseId }, "WEB_REMIX");
  }

  // ==========================================================================
  // 3. CATALOG ENTITY OPERATIONS (SONG, ARTIST, ALBUM, PLAYLIST, PODCAST)
  // ==========================================================================

  /**
   * xroMusic.song(videoId)
   * Returns full track metadata (`videoDetails`, `microformat`, `loudnessDb`, `musicVideoType`).
   */
  async song(videoId) {
    return this.core.requestInnerTube("player", { videoId }, "WEB_REMIX");
  }

  /**
   * xroMusic.artist(channelId)
   * Fetches full Artist page (`UC...`): Top Songs, Albums, Singles/EPs, Videos, Featured On, and Related Artists.
   */
  async artist(channelId) {
    return this.core.requestInnerTube("browse", { browseId: channelId }, "WEB_REMIX");
  }

  /**
   * xroMusic.album(browseId)
   * Fetches full Album page (`MPREb_...` or `OLAK5uy_...`): tracklist, release year, copyright, and artist links.
   */
  async album(browseId) {
    return this.core.requestInnerTube("browse", { browseId }, "WEB_REMIX");
  }

  /**
   * xroMusic.playlist(playlistId, continuation)
   * Fetches full Playlist page (`VL...` / `PL...` / `RDCLAK5uy_...`) and supports `continuation` pagination.
   */
  async playlist(playlistId, continuation = null) {
    if (continuation) {
      return this.core.requestInnerTube("browse", { continuation }, "WEB_REMIX");
    }
    const browseId = playlistId.startsWith("VL") ? playlistId : `VL${playlistId}`;
    return this.core.requestInnerTube("browse", { browseId }, "WEB_REMIX");
  }

  /**
   * xroMusic.upNext(videoId, { playlistId, radio })
   * Fetches the Up-Next queue, Auto-Radio mix (`RDAMVM{videoId}`), and `lyrics`/`related` browseIds via `/youtubei/v1/next`.
   */
  async upNext(videoId, { playlistId = null, radio = true, continuation = null } = {}) {
    if (continuation) {
      return this.core.requestInnerTube("next", { continuation }, "WEB_REMIX");
    }
    const payload = {
      videoId,
      enablePersistentPlaylistPanel: true,
      isAudioOnly: true,
    };
    if (playlistId) {
      payload.playlistId = playlistId;
    } else if (radio) {
      payload.playlistId = `RDAMVM${videoId}`;
      payload.tunerSettingValue = "AUTOMIX_SETTING_NORMAL";
    }
    return this.core.requestInnerTube("next", payload, "WEB_REMIX");
  }

  /**
   * xroMusic.related(relatedBrowseId)
   * Fetches the "Related" tab for a currently playing song (`MPTRt_...`).
   */
  async related(relatedBrowseId) {
    return this.core.requestInnerTube("browse", { browseId: relatedBrowseId }, "WEB_REMIX");
  }

  // ==========================================================================
  // 4. AUDIO & VIDEO STREAM RESOLUTION, CIPHER & PROXY OPERATIONS
  // ==========================================================================

  /**
   * xroMusic.stream(videoId, options)
   * Resolves a verified, unthrottled audio stream using:
   * 1. Multi-Client InnerTube Waterfall (`WEB_REMIX` -> `VISIONOS` -> `TVHTML5_SIMPLY` -> `IOS` -> `ANDROID_VR`)
   * 2. Universal `node:vm` `signatureCipher` (`s`) decipher + `n`-param anti-throttle transform + `&pot=`
   * 3. Tail-range 256-byte probe (`validateStreamUrl`) to block 1 MiB-capped URLs
   * 4. Loopback 4 MiB bounded-range proxy URL (`proxyUrl`)
   * 5. Match-gated GDStudio (NetEase/Bilibili) and Kugou full-track fallback if YT clients fail
   */
  async stream(videoId, options = {}) {
    return this.core.resolveYouTubeStream(videoId, options);
  }

  /**
   * xroMusic.videoStream(videoId, { maxHeight })
   * Resolves a music-video stream URL (`WEB_REMIX` -> `VISIONOS`) for seamless Audio <-> Video switching.
   */
  async videoStream(videoId, { maxHeight = 1080 } = {}) {
    for (const clientKey of ["WEB_REMIX", "VISIONOS"]) {
      try {
        const payload = {
          videoId,
          contentCheckOk: true,
          racyCheckOk: true,
          playbackContext: {
            contentPlaybackContext: {
              html5Preference: "HTML5_PREF_WANTS",
              signatureTimestamp: this.core.cipher.signatureTimestamp,
            },
          },
        };
        const resp = await this.core.requestInnerTube("player", payload, clientKey);
        if (resp?.playabilityStatus?.status !== "OK") continue;
        const formats = (resp.streamingData?.adaptiveFormats || []).filter(
          (f) => f.mimeType?.startsWith("video/") && (f.height || 0) <= maxHeight
        );
        formats.sort((a, b) => (b.height || 0) - (a.height || 0) || (b.bitrate || 0) - (a.bitrate || 0));
        if (formats[0]) {
          const url = this.core.cipher.resolveFormatUrl(
            formats[0],
            CLIENTS[clientKey]?.useWebPoTokens ? this.core.poToken : null
          );
          if (url) {
            return {
              videoId,
              streamUrl: url,
              proxyUrl: this.core.audioProxy.register(
                url,
                { "User-Agent": CLIENTS[clientKey].userAgent },
                formats[0].contentLength,
                formats[0].mimeType
              ),
              client: clientKey,
              height: formats[0].height,
              mimeType: formats[0].mimeType,
              bitrate: formats[0].bitrate,
            };
          }
        }
      } catch {
        // Try next client
      }
    }
    return null;
  }

  /**
   * xroMusic.decipher({ url, signatureCipher, s, n, poToken })
   * Direct access to the Universal `node:vm` Player Cipher & `n`-Transform Engine.
   */
  decipher({ url = null, signatureCipher = null, s = null, n = null, poToken = null } = {}) {
    if (url || signatureCipher) {
      return {
        url: this.core.cipher.resolveFormatUrl({ url, signatureCipher }, poToken),
        sts: this.core.cipher.signatureTimestamp,
      };
    }
    return {
      s: s ? this.core.cipher.decipherSignature(s) : null,
      n: n ? this.core.cipher.transformN(n) : null,
      sts: this.core.cipher.signatureTimestamp,
    };
  }

  /**
   * xroMusic.validateStream(url, { headers, contentLength })
   * Probes the last 256 bytes (`Range: bytes={len-256}-{len-1}`) to verify the stream is not 1 MiB-capped.
   */
  async validateStream(url, { headers = {}, contentLength = null } = {}) {
    return validateStreamUrl(url, headers, contentLength, this.core.fetchImpl);
  }

  /**
   * xroMusic.proxyStart(port) / xroMusic.proxyWrap(url, meta) / xroMusic.proxyStop()
   * Controls the Loopback 4 MiB Bounded-Range Audio Proxy.
   */
  async proxyStart(port = 0) {
    const boundPort = await this.core.audioProxy.start(port);
    return { port: boundPort, baseUrl: `http://127.0.0.1:${boundPort}` };
  }

  proxyWrap(streamUrl, { headers = {}, contentLength = null, mimeType = "audio/webm" } = {}) {
    return this.core.audioProxy.register(streamUrl, headers, contentLength, mimeType);
  }

  async proxyStop() {
    await this.core.audioProxy.stop();
    return { stopped: true };
  }

  // ==========================================================================
  // 5. GDSTUDIO, KUGOU, DEEZER & INTERNET ARCHIVE OPERATIONS
  // ==========================================================================

  async gdStudioSearch(query, { source = "netease", limit = 20, page = 1 } = {}) {
    return this.core.gdStudio.search(query, { source, limit, page });
  }

  async gdStudioSearchAll(query, { sources, limit = 20, page = 1 } = {}) {
    return this.core.gdStudio.searchAcrossSources(query, { sources, limit, page });
  }

  async gdStudioStream(trackOrQuery, { source = "netease", quality = "999", fallback = true, limit = 10 } = {}) {
    let track = trackOrQuery;
    if (typeof trackOrQuery === "string") {
      const results = await this.core.gdStudio.search(trackOrQuery, { source, limit });
      track = results[0] || null;
    }
    return track ? this.core.gdStudio.stream(track, { source, quality, fallback }) : null;
  }

  async gdStudioCover(trackOrId, options = {}) {
    return this.core.gdStudio.cover(trackOrId, options);
  }

  async gdStudioLyrics(trackOrQuery, options = {}) {
    return this.core.gdStudio.lyrics(trackOrQuery, options);
  }

  async gdStudioPlaylist(id, options = {}) {
    return this.core.gdStudio.playlist(id, options);
  }

  gdStudioCharts() {
    return this.core.gdStudio.chartList();
  }

  async gdStudioChart(id, options = {}) {
    return this.core.gdStudio.chart(id, options);
  }

  async kugouSearch(query, options = {}) {
    return this.core.kugou.search(query, options);
  }

  async kugouStream(trackOrQuery, { quality = "320", fallback = true, limit = 10 } = {}) {
    let track = trackOrQuery;
    if (typeof trackOrQuery === "string" && !/^[a-f0-9]{32}$/i.test(trackOrQuery.trim())) {
      const results = await this.core.kugou.search(trackOrQuery, { limit });
      track = results[0] || null;
    }
    return track ? this.core.kugou.stream(track, { quality, fallback }) : null;
  }

  async kugouLyrics(trackOrTitle, options = {}) {
    return this.core.kugou.lyrics(trackOrTitle, options);
  }

  async deezerSearch(query, options = {}) {
    return this.core.deezer.search(query, options);
  }

  async deezerTrack(id) {
    return this.core.deezer.track(id);
  }

  async deezerAlbum(id) {
    return this.core.deezer.album(id);
  }

  async deezerArtistTop(id, options = {}) {
    return this.core.deezer.artistTop(id, options);
  }

  async deezerCharts(options = {}) {
    return this.core.deezer.charts(options);
  }

  /**
   * xroMusic.archiveSearch(query, { limit }) & xroMusic.archiveStream(identifier)
   * Searches and resolves DRM-free MP3/FLAC streams from Internet Archive (`archive.org`).
   */
  async archiveSearch(query, { limit = 10 } = {}) {
    const q = `(${query}) AND mediatype:(audio)`;
    const url = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(
      q
    )}&fl[]=identifier,title,creator,downloads&rows=${limit}&page=1&output=json`;
    const res = await this.core.fetchImpl(url);
    if (!res.ok) throw new Error(`Internet Archive search failed: HTTP ${res.status}`);
    const data = await res.json();
    return data?.response?.docs || [];
  }

  async archiveStream(identifier) {
    return this.core.resolveInternetArchiveStream(identifier);
  }

  // ==========================================================================
  // 6. SYNCED LYRICS WATERFALL OPERATIONS
  // ==========================================================================

  /**
   * xroMusic.lyrics({ videoId, lyricsBrowseId, title, artist, album, durationSeconds })
   * YouTube Music lyrics first when a browse ID is available, then seven external fallbacks:
   * Boidu, LyricsPlus, GDStudio, Kugou KRC, NetEase, QQ Music, and LRCLIB.
   */
  async lyrics({ videoId = null, lyricsBrowseId = null, title = "", artist = "", album = "", durationSeconds = 0 } = {}) {
    if (lyricsBrowseId) {
      try {
        const res = await this.core.requestInnerTube(
          "browse",
          { browseId: lyricsBrowseId },
          "IOS_MUSIC"
        );
        if (res) return { source: "ytmusic-ios", data: res };
      } catch {
        // Fall through to external synced providers
      }
    }
    return this.core.resolveSyncedLyrics({ title, artist, album, durationSeconds });
  }

  // ==========================================================================
  // 7. QUEUE, LIBRARY & SPOTIFY / SCROBBLING OPERATIONS
  // ==========================================================================

  /**
   * xroMusic.queue.*
   * Built-in playback queue controller with Shuffle, Repeat, Play Next, and Auto-Radio.
   */
  queue = {
    get: () => ({
      items: [...this._queue],
      currentIndex: this._queueIndex,
      currentTrack: this._queue[this._queueIndex] || null,
      repeatMode: this._repeatMode,
      shuffle: this._shuffle,
    }),
    set: (tracks, startIndex = 0) => {
      this._queue = [...tracks];
      this._queueIndex = startIndex;
      return this.queue.get();
    },
    add: (track, { playNext = false } = {}) => {
      if (playNext && this._queueIndex >= 0) {
        this._queue.splice(this._queueIndex + 1, 0, track);
      } else {
        this._queue.push(track);
      }
      if (this._queueIndex === -1) this._queueIndex = 0;
      return this.queue.get();
    },
    next: () => {
      if (this._queue.length === 0) return null;
      if (this._repeatMode === "one") return this._queue[this._queueIndex];
      if (this._shuffle) {
        this._queueIndex = Math.floor(Math.random() * this._queue.length);
      } else if (this._queueIndex + 1 < this._queue.length) {
        this._queueIndex++;
      } else if (this._repeatMode === "all") {
        this._queueIndex = 0;
      } else {
        return null;
      }
      return this._queue[this._queueIndex];
    },
    prev: () => {
      if (this._queue.length === 0) return null;
      this._queueIndex = Math.max(0, this._queueIndex - 1);
      return this._queue[this._queueIndex];
    },
    clear: () => {
      this._queue = [];
      this._queueIndex = -1;
      return this.queue.get();
    },
  };

  /**
   * xroMusic.library.*
   * Local multi-source library manager (Liked Songs, Custom Playlists, Listening History, JSON Export/Import).
   */
  library = {
    like: (track) => {
      const id = track.videoId || track.id;
      this._library.likedSongs.set(id, { ...track, likedAt: Date.now() });
      return true;
    },
    unlike: (id) => this._library.likedSongs.delete(id),
    getLiked: () => Array.from(this._library.likedSongs.values()),
    createPlaylist: (name, tracks = []) => {
      const id = `xro_pl_${Date.now()}`;
      const pl = { id, name, tracks: [...tracks], createdAt: Date.now() };
      this._library.playlists.set(id, pl);
      return pl;
    },
    exportBackup: () =>
      JSON.stringify({
        likedSongs: Array.from(this._library.likedSongs.entries()),
        playlists: Array.from(this._library.playlists.entries()),
        history: this._library.history,
      }),
  };

  /**
   * xroMusic.spotifyImport(spotifyUrlOrId)
   * Keyless public Spotify track/playlist/album metadata importer via `open.spotify.com/embed` (`__NEXT_DATA__`).
   */
  async spotifyImport(spotifyUrlOrId, { type = "track" } = {}) {
    let embedUrl = spotifyUrlOrId;
    if (!embedUrl.startsWith("http")) {
      embedUrl = `https://open.spotify.com/embed/${type}/${spotifyUrlOrId}`;
    } else if (!embedUrl.includes("/embed/")) {
      embedUrl = embedUrl.replace("open.spotify.com/", "open.spotify.com/embed/");
    }
    const res = await this.core.fetchImpl(embedUrl);
    if (!res.ok) throw new Error(`Spotify embed fetch failed: HTTP ${res.status}`);
    const html = await res.text();
    const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (!match) return null;
    const nextData = JSON.parse(match[1]);
    return nextData?.props?.pageProps?.state?.data?.entity || null;
  }

  /**
   * xroMusic.scrobble({ title, artist, album, durationSeconds, playedAt })
   * Submits "playing_now" or "single" listen events to ListenBrainz (`api.listenbrainz.org/1/submit-listens`).
   */
  async scrobble({
    title,
    artist,
    album = "",
    durationSeconds = 0,
    type = "single",
    playedAt = Math.floor(Date.now() / 1000),
  }) {
    if (!this._scrobbleConfig.listenBrainzToken) {
      return { scrobbled: false, reason: "No ListenBrainz token configured" };
    }
    const payload = {
      listen_type: type === "now" ? "playing_now" : "single",
      payload: [
        {
          ...(type === "now" ? {} : { listened_at: playedAt }),
          track_metadata: {
            artist_name: artist,
            track_name: title,
            release_name: album,
            additional_info: {
              duration_ms: durationSeconds * 1000,
              media_player: "xroMusic",
            },
          },
        },
      ],
    };
    const res = await this.core.fetchImpl("https://api.listenbrainz.org/1/submit-listens", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Token ${this._scrobbleConfig.listenBrainzToken}`,
      },
      body: JSON.stringify(payload),
    });
    return { scrobbled: res.ok, status: res.status };
  }
}

export const xroMusic = new XroMusicClient();
export default xroMusic;

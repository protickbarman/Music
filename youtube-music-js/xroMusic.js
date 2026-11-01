/**
 * xroMusic — Unified Multi-Source Music & Playback Client Module
 * ==============================================================
 * Zero-key, multi-provider music client combining:
 * - YouTube Music (`WEB_REMIX`, `VISIONOS`, `TVHTML5_SIMPLY`, `IOS`, `ANDROID_VR`, `IOS_MUSIC`)
 * - Universal `node:vm` Player Cipher (`s`) & Anti-Throttle (`n`) Engine (ES5 `player_ias` + ES6 `player_es6` + Faraday Registry)
 * - `sw.js_data` `visitorData` & `bgutils` `poToken` Minting
 * - Loopback 4 MiB Bounded-Range Audio Proxy (`googlevideo.com` & `c.youtube.com` unthrottler)
 * - JioSaavn 320kbps AAC Direct Engine (OpenSSL 3.0 native Triple-DES EDE3 `38346591`)
 * - Internet Archive (`archive.org`) Lossless FLAC / MP3 Engine
 * - 5-Provider Synced Lyrics Waterfall (IOS_MUSIC, Boidu/LyricsPlus, Kugou, NetEase, QQ Music)
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
  decryptJioSaavnMediaUrl,
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
   * xroMusic.search(query, options)
   * Unified search across YouTube Music (`songs`, `videos`, `albums`, `artists`, `playlists`, `podcasts`),
   * JioSaavn (`saavn`), and Internet Archive (`archive`).
   */
  async search(query, { type = "songs", source = "ytmusic", limit = 20, continuation = null } = {}) {
    if (source === "saavn" || source === "jiosaavn") {
      return this.saavnSearch(query, { limit });
    }
    if (source === "archive") {
      return this.archiveSearch(query, { limit });
    }
    if (source === "all") {
      const [ytm, saavn] = await Promise.allSettled([
        this.search(query, { type, source: "ytmusic", limit }),
        this.saavnSearch(query, { limit: 5 }),
      ]);
      return {
        query,
        ytmusic: ytm.status === "fulfilled" ? ytm.value : null,
        jiosaavn: saavn.status === "fulfilled" ? saavn.value : null,
      };
    }

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
   * 5. Automatic JioSaavn 320kbps AAC fallback if all YouTube clients are blocked
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
  // 5. JIOSAAVN (320KBPS AAC) & INTERNET ARCHIVE OPERATIONS
  // ==========================================================================

  /**
   * xroMusic.saavnSearch(query, { limit })
   * Searches JioSaavn and automatically decrypts `encrypted_media_url` into 320kbps/160kbps/96kbps AAC URLs.
   */
  async saavnSearch(query, { limit = 10 } = {}) {
    const url = `https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&_marker=0&api_version=4&ctx=web6dot0&n=${limit}&p=1&q=${encodeURIComponent(
      query
    )}`;
    const res = await this.core.fetchImpl(url);
    if (!res.ok) throw new Error(`JioSaavn search failed: HTTP ${res.status}`);
    const data = await res.json();
    return (data.results || []).map((song) => {
      const enc = song?.more_info?.encrypted_media_url || song?.encrypted_media_url;
      return {
        id: song.id,
        title: song.title || song.song,
        subtitle: song.subtitle,
        album: song?.more_info?.album,
        durationSeconds: Number(song?.more_info?.duration || song?.duration) || 0,
        image: (song.image || "").replace(/150x150|50x50/, "500x500"),
        streams: enc ? decryptJioSaavnMediaUrl(enc, 320) : null,
      };
    });
  }

  /**
   * xroMusic.saavnStream(queryOrEncryptedUrl)
   * Resolves or decrypts a direct 320kbps AAC (`.mp4`) stream from JioSaavn.
   */
  async saavnStream(queryOrEncryptedUrl) {
    if (
      typeof queryOrEncryptedUrl === "string" &&
      queryOrEncryptedUrl.length > 48 &&
      !queryOrEncryptedUrl.includes(" ")
    ) {
      return decryptJioSaavnMediaUrl(queryOrEncryptedUrl, 320);
    }
    return this.core.resolveJioSaavnStream(queryOrEncryptedUrl);
  }

  /**
   * xroMusic.saavnLaunchData() / saavnTrending() / saavnTopArtists() / saavnSongDetails() / saavnAlbum() / saavnPlaylist() / saavnArtist()
   * Complete JioSaavn (`jiosaavn.com/api.php`) catalog & discovery methods.
   */
  async saavnLaunchData() {
    const res = await this.core.fetchImpl(
      "https://www.jiosaavn.com/api.php?__call=webapi.getLaunchData&api_version=4&_format=json&_marker=0&ctx=web6dot0"
    );
    return res.ok ? res.json() : null;
  }

  async saavnTrending({ type = "song", language = "english,hindi" } = {}) {
    const res = await this.core.fetchImpl(
      `https://www.jiosaavn.com/api.php?__call=content.getTrending&api_version=4&_format=json&_marker=0&ctx=web6dot0&entity_type=${encodeURIComponent(
        type
      )}&entity_language=${encodeURIComponent(language)}`
    );
    return res.ok ? res.json() : null;
  }

  async saavnTopArtists() {
    const res = await this.core.fetchImpl(
      "https://www.jiosaavn.com/api.php?__call=social.getTopArtists&api_version=4&_format=json&_marker=0&ctx=web6dot0"
    );
    return res.ok ? res.json() : null;
  }

  async saavnSongDetails(pids) {
    const pidStr = Array.isArray(pids) ? pids.join(",") : String(pids);
    const res = await this.core.fetchImpl(
      `https://www.jiosaavn.com/api.php?__call=song.getDetails&_format=json&cc=in&_marker=0&pids=${encodeURIComponent(
        pidStr
      )}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    for (const track of Object.values(data || {})) {
      if (track && typeof track === "object" && track.encrypted_media_url) {
        track.streams = decryptJioSaavnMediaUrl(track.encrypted_media_url, 320);
      }
    }
    return data;
  }

  async saavnAlbum(albumId) {
    const res = await this.core.fetchImpl(
      `https://www.jiosaavn.com/api.php?__call=content.getAlbumDetails&_format=json&cc=in&_marker=0&albumid=${encodeURIComponent(
        albumId
      )}`
    );
    return res.ok ? res.json() : null;
  }

  async saavnPlaylist(listId) {
    const res = await this.core.fetchImpl(
      `https://www.jiosaavn.com/api.php?__call=playlist.getDetails&_format=json&_marker=0&api_version=4&ctx=web6dot0&listid=${encodeURIComponent(
        listId
      )}`
    );
    return res.ok ? res.json() : null;
  }

  async saavnArtist(artistId, { songCount = 15, albumCount = 10 } = {}) {
    const res = await this.core.fetchImpl(
      `https://www.jiosaavn.com/api.php?__call=artist.getArtistPageDetails&_format=json&_marker=0&api_version=4&ctx=web6dot0&artistId=${encodeURIComponent(
        artistId
      )}&n_song=${songCount}&n_album=${albumCount}`
    );
    return res.ok ? res.json() : null;
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
   * 5-provider synced lyrics waterfall:
   * 1. InnerTube `IOS_MUSIC` timed lyrics (`timedLyricsData`) / `WEB_REMIX` lyrics
   * 2. Boidu / LyricsPlus (`lyrics-api.boidu.dev` syllable/word-synced)
   * 3. Kugou (`msearchcdn.kugou.com` + `krcs.kugou.com` Base64 LRC)
   * 4. NetEase (`music.163.com`)
   * 5. QQ Music (`c.y.qq.com`)
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

import { XroMusicClient } from "./xroMusic.js";

function textValue(value) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (!value || typeof value !== "object") return "";
  if (typeof value.simpleText === "string") return value.simpleText.trim();
  if (Array.isArray(value.runs)) {
    return value.runs.map((run) => textValue(run?.text ?? run)).filter(Boolean).join("").trim();
  }
  if (value.text !== undefined) return textValue(value.text);
  return "";
}

function columnText(column) {
  return textValue(column?.musicResponsiveListItemFlexColumnRenderer?.text ?? column?.text);
}

function findVideoId(root) {
  const pending = [root];
  const visited = new WeakSet();
  while (pending.length) {
    const value = pending.pop();
    if (!value || typeof value !== "object" || visited.has(value)) continue;
    visited.add(value);
    if (typeof value.videoId === "string" && value.videoId) return value.videoId;
    if (typeof value.playlistItemData?.videoId === "string") return value.playlistItemData.videoId;
    if (typeof value.watchEndpoint?.videoId === "string") return value.watchEndpoint.videoId;
    for (const child of Object.values(value)) {
      if (child && typeof child === "object") pending.push(child);
    }
  }
  return null;
}

function findThumbnail(root) {
  const pending = [root];
  const visited = new WeakSet();
  while (pending.length) {
    const value = pending.pop();
    if (!value || typeof value !== "object" || visited.has(value)) continue;
    visited.add(value);
    if (Array.isArray(value.thumbnails)) {
      const url = value.thumbnails.slice().reverse().find((item) => typeof item?.url === "string")?.url;
      if (url) return url;
    }
    for (const child of Object.values(value)) {
      if (child && typeof child === "object") pending.push(child);
    }
  }
  return null;
}

function durationInSeconds(value) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.round(value));
  const text = textValue(value);
  if (!text) return 0;
  if (/^\d+(?:\.\d+)?$/.test(text)) return Math.max(0, Math.round(Number(text)));
  const parts = text.split(":").map((part) => Number.parseInt(part, 10));
  if (parts.length < 2 || parts.some((part) => !Number.isFinite(part))) return 0;
  return parts.reduce((total, part) => total * 60 + part, 0);
}

function normalizeRenderer(renderer) {
  if (!renderer || typeof renderer !== "object") return null;
  const columns = renderer.flexColumns || [];
  const firstColumn = columnText(columns[0]);
  const secondColumn = columnText(columns[1]);
  const artistRun = columns[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.find(
    (run) => run?.text && run.navigationEndpoint?.browseEndpoint?.browseId
  );
  const title = textValue(renderer.title ?? renderer.titleText) || firstColumn;
  const artist =
    textValue(renderer.artist ?? renderer.ownerText ?? renderer.longBylineText ?? renderer.shortBylineText) ||
    String(artistRun?.text || secondColumn).trim();
  const videoId = findVideoId(renderer);
  if (!videoId || !title) return null;

  const durationText =
    renderer.durationSeconds ??
    renderer.lengthText ??
    renderer.fixedColumns?.[0]?.musicResponsiveListItemFixedColumnRenderer?.text ??
    renderer.fixedColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text;
  return {
    id: videoId,
    videoId,
    provider: "ytmusic",
    source: "ytmusic",
    title,
    artist,
    durationSeconds: durationInSeconds(durationText),
    thumbnail: findThumbnail(renderer),
    raw: renderer,
  };
}

/** Convert common YouTube Music search renderer payloads into playable track records. */
export function normalizeYouTubeMusicTracks(payload, { limit = 20 } = {}) {
  const tracks = [];
  const seen = new Set();
  const pending = [payload];
  const visited = new WeakSet();
  while (pending.length && tracks.length < limit) {
    const value = pending.pop();
    if (!value || typeof value !== "object" || visited.has(value)) continue;
    visited.add(value);

    const renderer =
      value.musicResponsiveListItemRenderer ||
      value.musicTwoRowItemRenderer ||
      value.videoRenderer ||
      value;
    if (renderer && typeof renderer === "object") {
      const track = normalizeRenderer(renderer);
      if (track && !seen.has(track.videoId)) {
        seen.add(track.videoId);
        tracks.push(track);
      }
    }
    const children = Array.isArray(value) ? value : Object.values(value);
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const child = children[index];
      if (child && typeof child === "object") pending.push(child);
    }
  }
  return tracks;
}

function appBuckets(results, source) {
  if (!Array.isArray(results)) {
    return source === "ytmusic" ? { ytmusic: results } : results || {};
  }
  if (["gdstudio", "gd", "netease", "bilibili"].includes(source)) return { gdstudio: results };
  if (source === "kugou") return { kugou: results };
  if (source === "deezer") return { deezer: results };
  if (source === "archive") return { archive: results };
  return {};
}

/**
 * High-level single-import application module over XroMusicClient.
 * It initializes automatically, defaults catalog search to all sources, and
 * resolves a query or selected result to a stream URL when available.
 */
export class MusicApp extends XroMusicClient {
  constructor(options = {}) {
    super(options);
    this.ready = this.init(options);
  }

  async search(query, options = {}) {
    await this.ready;
    return super.search(query, { ...options, source: options.source ?? "all" });
  }

  async searchAll(query, options = {}) {
    return this.search(query, { ...options, source: "all" });
  }

  async play(trackOrQuery, options = {}) {
    await this.ready;
    if (typeof trackOrQuery !== "string") return this.playTrack(trackOrQuery, options);

    const query = trackOrQuery.trim();
    if (!query) throw new TypeError("play() requires a track query or track object");
    const source = options.source ?? "all";
    const results = await super.search(query, {
      type: "songs",
      source,
      limit: options.searchLimit ?? 10,
    });
    const buckets = appBuckets(results, source);
    let lastError = null;

    const youtubeTrack = normalizeYouTubeMusicTracks(buckets.ytmusic, { limit: 1 })[0];
    if (youtubeTrack) {
      try {
        return await this.stream(youtubeTrack.videoId, {
          title: youtubeTrack.title,
          artist: youtubeTrack.artist,
          durationSeconds: youtubeTrack.durationSeconds,
          preferHigh: options.preferHigh,
          validate: options.validate,
          quality: options.quality,
          enableCatalogFallback: options.enableCatalogFallback,
          fallbackSearchLimit: options.fallbackSearchLimit,
        });
      } catch (error) {
        lastError = error;
      }
    }

    for (const track of buckets.gdstudio || []) {
      try {
        const stream = await this.gdStudioStream(track, { quality: options.quality ?? "999" });
        if (stream) return stream;
      } catch (error) {
        lastError = error;
      }
    }
    for (const track of buckets.kugou || []) {
      try {
        const stream = await this.kugouStream(track, { quality: options.quality ?? "320" });
        if (stream) return stream;
      } catch (error) {
        lastError = error;
      }
    }

    if (source === "archive" || options.allowArchive) {
      for (const item of buckets.archive || []) {
        if (!item?.identifier) continue;
        try {
          const stream = await this.archiveStream(item.identifier);
          if (stream) return stream;
        } catch (error) {
          lastError = error;
        }
      }
    }

    if (options.allowPreview) {
      const preview = buckets.deezer?.[0];
      if (preview?.previewUrl) {
        return {
          id: String(preview.id),
          provider: "deezer",
          client: "DEEZER_PREVIEW",
          streamUrl: preview.previewUrl,
          mimeType: "audio/mpeg",
          title: preview.title,
          artist: preview.artist,
          isPreview: true,
        };
      }
    }

    if (lastError) {
      throw new Error(`No playable full-track stream was resolved for '${query}': ${lastError.message}`, {
        cause: lastError,
      });
    }
    throw new Error(`No playable full-track result found for '${query}'. Deezer results are previews only.`);
  }

  async playTrack(track, options = {}) {
    await this.ready;
    if (!track || typeof track !== "object") throw new TypeError("playTrack() requires a track object");
    const provider = String(track.provider || "").toLowerCase();
    const source = String(track.source || "").toLowerCase();

    if (provider === "gdstudio" || source === "netease" || source === "bilibili") {
      return this.gdStudioStream(track, { quality: options.quality ?? "999" });
    }
    if (provider === "kugou" || source === "kugou") {
      return this.kugouStream(track, { quality: options.quality ?? "320" });
    }
    if (provider === "deezer" || source === "deezer") {
      if (options.allowPreview && track.previewUrl) {
        return {
          id: String(track.id || ""),
          provider: "deezer",
          client: "DEEZER_PREVIEW",
          streamUrl: track.previewUrl,
          mimeType: "audio/mpeg",
          title: track.title,
          artist: track.artist,
          isPreview: true,
        };
      }
      throw new Error("Deezer supplies short previews, not a full-track stream");
    }
    if (provider === "internet_archive" || source === "archive" || track.identifier) {
      const identifier = track.identifier || track.id;
      return this.archiveStream(identifier);
    }

    const videoId = track.videoId || (provider === "ytmusic" ? track.id : null);
    if (videoId) {
      return this.stream(videoId, {
        title: track.title || "",
        artist: track.artist || "",
        durationSeconds: track.durationSeconds || 0,
        preferHigh: options.preferHigh,
        validate: options.validate,
        quality: options.quality,
        enableCatalogFallback: options.enableCatalogFallback,
        fallbackSearchLimit: options.fallbackSearchLimit,
      });
    }
    throw new Error(`Unsupported track provider: ${provider || source || "unknown"}`);
  }

  async close() {
    await this.ready;
    await this.proxyStop();
    return { closed: true };
  }

  async lyricsFor(trackOrQuery, options = {}) {
    await this.ready;
    let track = trackOrQuery;
    if (typeof trackOrQuery === "string") {
      const source = options.source ?? "all";
      const results = await super.search(trackOrQuery, { type: "songs", source, limit: 5 });
      const buckets = appBuckets(results, source);
      track =
        normalizeYouTubeMusicTracks(buckets.ytmusic, { limit: 1 })[0] ||
        buckets.gdstudio?.[0] ||
        buckets.kugou?.[0] ||
        { title: trackOrQuery, artist: "" };
    }
    return this.lyrics({
      videoId: track?.videoId || null,
      lyricsBrowseId: track?.lyricsBrowseId || track?.lyrics_browse_id || null,
      title: track?.title || (typeof trackOrQuery === "string" ? trackOrQuery : ""),
      artist: track?.artist || "",
      album: track?.album || "",
      durationSeconds: track?.durationSeconds || 0,
    });
  }
}

export function createMusicApp(options = {}) {
  return new MusicApp(options);
}

export const musicApp = new MusicApp();
export default musicApp;

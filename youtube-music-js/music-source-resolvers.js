import crypto from "node:crypto";
import zlib from "node:zlib";

/**
 * Keyless multi-provider catalog and stream resolvers.
 *
 * The GDStudio international API is verified here for NetEase Cloud Music and
 * Bilibili sources. Kugou provides free-track full streams where the resolver
 * accepts the hash; VIP/locked items are deliberately not bypassed. Deezer is a
 * metadata/ISRC/artwork catalog with a short preview only, not a full-stream
 * provider.
 */

export const GDSTUDIO_API_BASE_URL = "https://music-api.gdstudio.xyz/api.php";
export const GDSTUDIO_SOURCE_IDS = Object.freeze(["netease", "bilibili"]);
export const GDSTUDIO_QUALITY_ORDER = Object.freeze(["999", "740", "320", "192", "128"]);

export const GDSTUDIO_CHARTS = Object.freeze([
  { id: "2809513713", name: "Western / Global Hits", source: "netease" },
  { id: "3778678", name: "Hot Songs", source: "netease" },
  { id: "19723756", name: "Soaring Songs", source: "netease" },
  { id: "3779629", name: "New Songs", source: "netease" },
  { id: "71384707", name: "Classical", source: "netease" },
  { id: "1978921795", name: "Electronic", source: "netease" },
  { id: "71385702", name: "ACG", source: "netease" },
  { id: "5059644681", name: "Japanese Songs", source: "netease" },
  { id: "745956260", name: "Korean Songs", source: "netease" },
]);

const KUGOU_WEB_SALT = "NVPh5oo715z5DIWAeQlhMDsWXXQV4hwt";
const KUGOU_WEB_SEARCH_URL = "https://complexsearch.kugou.com/v2/search/song";
const KUGOU_MOBILE_STREAM_URL = "https://m.kugou.com/app/i/getSongInfo.php";
const KUGOU_LYRICS_SEARCH_URL = "https://krcs.kugou.com/search";
const KUGOU_LYRICS_DOWNLOAD_URL = "https://krcs.kugou.com/download";
const KUGOU_KRC_KEY = Object.freeze([64, 71, 97, 119, 94, 50, 116, 71, 81, 54, 49, 45, 206, 210, 110, 105]);

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko)";

function clampInteger(value, fallback, min, max) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function normalizeArtists(value) {
  if (Array.isArray(value)) {
    return value
      .map((artist) => (typeof artist === "string" ? artist : artist?.name || artist?.title || ""))
      .map((artist) => String(artist).trim())
      .filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/[、,，&;；/]|\bfeat\.?\b|\bft\.?\b/i)
      .map((artist) => artist.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeDurationSeconds(value) {
  const duration = Number(value);
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  // The providers use seconds, with a few catalog fields expressed in ms.
  return duration > 10000 ? Math.round(duration / 1000) : Math.round(duration);
}

function normalizeHttpUrl(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const url = value.trim().replace(/^http:\/\//i, "https://");
  return /^https?:\/\//i.test(url) ? url : null;
}

function normalizeMatchText(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function textSimilarity(leftValue, rightValue) {
  const left = normalizeMatchText(leftValue);
  const right = normalizeMatchText(rightValue);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) {
    return 0.76 + 0.2 * (Math.min(left.length, right.length) / Math.max(left.length, right.length));
  }
  const leftTokens = new Set(left.split(/\s+/));
  const rightTokens = new Set(right.split(/\s+/));
  let overlap = 0;
  for (const token of leftTokens) if (rightTokens.has(token)) overlap += 1;
  return (2 * overlap) / (leftTokens.size + rightTokens.size);
}

function artistText(value) {
  return normalizeArtists(value).join(" ");
}

function scoreTrackMatch(expected, candidate) {
  const titleScore = textSimilarity(expected.title, candidate.title);
  if (titleScore < 0.58) return null;

  const requestedArtist = normalizeMatchText(expected.artist);
  const foundArtist = normalizeMatchText(artistText(candidate.artists || candidate.artist));
  const artistScore = requestedArtist ? textSimilarity(requestedArtist, foundArtist) : 0.65;
  if (requestedArtist && (!foundArtist || artistScore < 0.2)) return null;

  const expectedDuration = normalizeDurationSeconds(expected.durationSeconds);
  const foundDuration = normalizeDurationSeconds(candidate.durationSeconds);
  const durationDelta = expectedDuration && foundDuration ? Math.abs(expectedDuration - foundDuration) : null;
  if (durationDelta !== null && durationDelta > 35) return null;
  const durationScore = durationDelta === null ? 0.5 : durationDelta <= 5 ? 1 : Math.max(0, 1 - durationDelta / 35);

  const score = titleScore * 0.72 + artistScore * 0.2 + durationScore * 0.08;
  if (score < 0.6) return null;
  return { score, titleScore, artistScore, durationDelta };
}

async function fetchJson(fetchImpl, url, { provider, headers = {}, timeoutMs = 15000 } = {}) {
  const response = await fetchImpl(url, {
    headers: {
      Accept: "application/json, text/plain, */*",
      "User-Agent": UA,
      ...headers,
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    throw new Error(`${provider || "Music API"} request failed: HTTP ${response.status}`);
  }
  let data;
  try {
    data = await response.json();
  } catch (error) {
    throw new Error(`${provider || "Music API"} returned invalid JSON: ${error.message}`);
  }
  if (data?.detail) throw new Error(`${provider || "Music API"}: ${data.detail}`);
  if (data?.error && typeof data.error === "object") {
    throw new Error(`${provider || "Music API"}: ${data.error.message || JSON.stringify(data.error)}`);
  }
  return data;
}

function extractListPayload(payload) {
  if (Array.isArray(payload)) return payload;
  for (const value of [payload?.data, payload?.result, payload?.results, payload?.songs]) {
    if (Array.isArray(value)) return value;
  }
  return [];
}

function normalizeGDStudioTrack(item, source) {
  const raw = item && typeof item === "object" ? item : {};
  const artists = normalizeArtists(raw.artist ?? raw.artists ?? raw.singer ?? raw.singers);
  const title = String(raw.name ?? raw.title ?? raw.song ?? raw.SongName ?? "").trim();
  if (!title) return null;
  const id = String(raw.id ?? raw.song_id ?? raw.songId ?? raw.url_id ?? "");
  const coverId = raw.pic_id ?? raw.picId ?? raw.cover_id ?? raw.coverId ?? null;
  const image = normalizeHttpUrl(raw.pic ?? raw.image ?? raw.cover ?? raw.pic_url ?? "");
  const durationSeconds = normalizeDurationSeconds(raw.duration ?? raw.Duration ?? raw.length);
  return {
    id,
    source,
    provider: "gdstudio",
    title,
    artist: artists.join(", "),
    artists,
    album: String(raw.album?.name ?? raw.album ?? raw.AlbumName ?? ""),
    durationSeconds,
    coverId: coverId == null ? null : String(coverId),
    coverUrl: image,
    streamId: String(raw.url_id ?? raw.urlId ?? raw.id ?? id),
    lyricId: String(raw.lyric_id ?? raw.lyricId ?? raw.id ?? id),
    raw,
  };
}

function normalizeKugouTrack(item) {
  const raw = item && typeof item === "object" ? item : {};
  const artists = normalizeArtists(raw.SingerName ?? raw.singer ?? raw.artist ?? raw.singers);
  const title = String(raw.SongName ?? raw.song_name ?? raw.songname ?? raw.name ?? raw.title ?? "").trim();
  if (!title) return null;
  const image = String(raw.Image ?? raw.AlbumImage ?? raw.pic ?? "")
    .replace(/\{size\}/g, "480")
    .replace(/^http:\/\//i, "https://");
  const hashes = {
    hires: raw.ResFileHash || null,
    flac: raw.SQFileHash || null,
    mp3_320: raw.HQFileHash || null,
    mp3_128: raw.FileHash || null,
  };
  return {
    id: String(raw.EMixSongID ?? raw.MixSongID ?? raw.Audioid ?? raw.AudioId ?? raw.FileHash ?? ""),
    source: "kugou",
    provider: "kugou",
    title,
    artist: artists.join(", "),
    artists,
    album: String(raw.AlbumName ?? raw.album_name ?? raw.album ?? ""),
    durationSeconds: normalizeDurationSeconds(raw.Duration ?? raw.duration ?? raw.timeLength),
    coverUrl: normalizeHttpUrl(image),
    hashes,
    raw,
  };
}

function decodeKugouKrc(encoded) {
  const buffer = Buffer.from(String(encoded || ""), "base64");
  if (buffer.length <= 4) return "";
  const payload = Buffer.from(buffer.subarray(4));
  for (let index = 0; index < payload.length; index += 1) {
    payload[index] ^= KUGOU_KRC_KEY[index % KUGOU_KRC_KEY.length];
  }
  try {
    return zlib.inflateSync(payload).toString("utf8");
  } catch {
    return "";
  }
}

function kugouKrcToLrc(krc) {
  return String(krc || "")
    .split(/\r?\n/)
    .flatMap((line) => {
      const match = line.match(/^\[(\d+),(\d+)\](.*)$/);
      if (!match) return [];
      const milliseconds = Number(match[1]);
      const minutes = String(Math.floor(milliseconds / 60000)).padStart(2, "0");
      const seconds = String(Math.floor((milliseconds % 60000) / 1000)).padStart(2, "0");
      const centiseconds = String(Math.floor((milliseconds % 1000) / 10)).padStart(2, "0");
      const text = match[3].replace(/<[^>]*>/g, "").trim();
      return [`[${minutes}:${seconds}.${centiseconds}]${text}`];
    })
    .join("\n");
}

export class GDStudioMusicResolver {
  constructor({ fetchImpl = fetch, baseUrl = GDSTUDIO_API_BASE_URL, supportedSources = GDSTUDIO_SOURCE_IDS } = {}) {
    this.fetchImpl = fetchImpl;
    this.baseUrl = baseUrl;
    this.supportedSources = [...supportedSources];
  }

  _assertSource(source) {
    if (!this.supportedSources.includes(source)) {
      throw new Error(`GDStudio source "${source}" is not enabled; supported sources: ${this.supportedSources.join(", ")}`);
    }
  }

  async _request(params) {
    const url = new URL(this.baseUrl);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
    }
    return fetchJson(this.fetchImpl, url, { provider: "GDStudio" });
  }

  async search(query, { source = "netease", limit = 20, page = 1 } = {}) {
    if (!String(query || "").trim()) return [];
    this._assertSource(source);
    const payload = await this._request({
      types: "search",
      source,
      name: String(query).trim(),
      count: clampInteger(limit, 20, 1, 50),
      pages: clampInteger(page, 1, 1, 1000),
    });
    return extractListPayload(payload)
      .map((item) => normalizeGDStudioTrack(item, source))
      .filter(Boolean);
  }

  async searchAcrossSources(query, { sources = this.supportedSources, limit = 20, page = 1 } = {}) {
    const uniqueSources = [...new Set(sources)];
    const results = await Promise.allSettled(
      uniqueSources.map((source) => this.search(query, { source, limit, page }))
    );
    const successful = results.filter((result) => result.status === "fulfilled");
    if (successful.length === 0) {
      const failures = results.map((result) => result.reason?.message || "unknown error").join("; ");
      throw new Error(`GDStudio search failed for all configured sources: ${failures}`);
    }
    const seen = new Set();
    const sourceLists = successful.map((result) => result.value);
    const interleaved = [];
    const longestList = Math.max(0, ...sourceLists.map((list) => list.length));
    for (let index = 0; index < longestList; index += 1) {
      for (const list of sourceLists) {
        if (list[index]) interleaved.push(list[index]);
      }
    }
    return interleaved
      .filter((track) => {
        const key = `${normalizeMatchText(track.title)}|${normalizeMatchText(track.artist)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, clampInteger(limit, 20, 1, 100));
  }

  async stream(trackOrId, { source = "netease", quality = "999", fallback = true } = {}) {
    const track = typeof trackOrId === "object" && trackOrId !== null ? trackOrId : null;
    const resolvedSource = track?.source || source;
    this._assertSource(resolvedSource);
    const id = String(track?.streamId ?? track?.url_id ?? track?.id ?? trackOrId ?? "").trim();
    if (!id) throw new Error("GDStudio stream requires a track or stream id");

    const requestedQuality = String(quality).toLowerCase();
    const qualityToBr = {
      hires: "999",
      "24bit": "999",
      lossless: "740",
      flac: "740",
      "16bit": "740",
      "320": "320",
      "320k": "320",
      "192": "192",
      "128": "128",
      "128k": "128",
      "999": "999",
      "740": "740",
    };
    const preferredBr = qualityToBr[requestedQuality] || "999";
    const startIndex = GDSTUDIO_QUALITY_ORDER.indexOf(preferredBr);
    const chain = fallback
      ? GDSTUDIO_QUALITY_ORDER.slice(Math.max(startIndex, 0))
      : [preferredBr];
    let lastError = null;

    for (const br of chain) {
      let payload;
      try {
        payload = await this._request({ types: "url", source: resolvedSource, id, br });
      } catch (error) {
        lastError = error;
        break;
      }
      const url = normalizeHttpUrl(payload?.url);
      const returnedBr = Number(payload?.br ?? br);
      if (!url || payload?.url === "err" || returnedBr < 0) continue;
      const extension = new URL(url).pathname.toLowerCase().split(".").pop();
      const isLossless = extension === "flac" || Number(br) >= 740;
      return {
        id,
        provider: "gdstudio",
        source: resolvedSource,
        client: "GDSTUDIO",
        streamUrl: url,
        url,
        mimeType: extension === "flac" ? "audio/flac" : extension === "m4a" ? "audio/mp4" : "audio/mpeg",
        quality: Number(br) >= 999 ? "hi-res" : Number(br) >= 740 ? "lossless" : `${br}kbps`,
        br: String(payload?.br ?? br),
        requestedBr: preferredBr,
        bitrate: Number(br) <= 320 ? Number(br) * 1000 : null,
        isLossless,
        contentLength: Number(payload?.size) || null,
        title: track?.title || "",
        artist: track?.artist || "",
        durationSeconds: track?.durationSeconds || 0,
        coverUrl: track?.coverUrl || null,
        raw: payload,
      };
    }
    if (lastError) throw lastError;
    return null;
  }

  async cover(trackOrId, { source = "netease", size = 500 } = {}) {
    const track = typeof trackOrId === "object" && trackOrId !== null ? trackOrId : null;
    const resolvedSource = track?.source || source;
    this._assertSource(resolvedSource);
    const id = String(track ? track.coverId || track.pic_id || "" : trackOrId || "").trim();
    if (!id) return track?.coverUrl || null;
    const payload = await this._request({
      types: "pic",
      source: resolvedSource,
      id,
      size: clampInteger(size, 500, 100, 1000),
    });
    return normalizeHttpUrl(payload?.url ?? payload?.pic ?? payload?.data ?? payload) || track?.coverUrl || null;
  }

  async lyrics(trackOrQuery, { source = "netease", limit = 5 } = {}) {
    let track = typeof trackOrQuery === "object" && trackOrQuery !== null ? trackOrQuery : null;
    if (!track) {
      const matches = await this.search(String(trackOrQuery || ""), { source, limit });
      track = matches[0] || null;
    }
    if (!track) return null;
    const resolvedSource = track.source || source;
    this._assertSource(resolvedSource);
    const id = String(track.lyricId ?? track.lyric_id ?? track.id ?? "").trim();
    if (!id) return null;
    const payload = await this._request({ types: "lyric", source: resolvedSource, id });
    const lyric = String(payload?.lyric ?? payload?.lrc ?? "");
    const translated = String(payload?.tlyric ?? payload?.translatedLyric ?? "");
    if (!lyric && !translated) return null;
    return {
      provider: "gdstudio",
      source: resolvedSource,
      type: "lrc",
      lyric,
      lrc: lyric,
      tlyric: translated || null,
      raw: payload,
    };
  }

  async playlist(id, { source = "netease" } = {}) {
    this._assertSource(source);
    const payload = await this._request({ types: "playlist", source, id: String(id) });
    const playlist = payload?.playlist ?? payload?.data ?? payload;
    const tracks = Array.isArray(playlist?.tracks)
      ? playlist.tracks.map((track) => normalizeGDStudioTrack(track, source)).filter(Boolean)
      : [];
    return {
      id: String(playlist?.id ?? id),
      provider: "gdstudio",
      source,
      name: String(playlist?.name ?? playlist?.title ?? ""),
      coverUrl: normalizeHttpUrl(playlist?.pic ?? playlist?.cover ?? playlist?.coverUrl),
      tracks,
      raw: payload,
    };
  }

  chartList() {
    return GDSTUDIO_CHARTS.map((chart) => ({ ...chart }));
  }

  async chart(id, options = {}) {
    return this.playlist(id, options);
  }
}

export function signKugouWebParams(params, salt = KUGOU_WEB_SALT) {
  const flattened = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("");
  return crypto.createHash("md5").update(`${salt}${flattened}${salt}`, "utf8").digest("hex").toUpperCase();
}

export class KugouMusicResolver {
  constructor({ fetchImpl = fetch, mid = null, clock = () => Date.now() } = {}) {
    this.fetchImpl = fetchImpl;
    this.clock = clock;
    this.mid = mid || crypto.createHash("md5").update(crypto.randomUUID()).digest("hex");
  }

  async search(query, { limit = 20, page = 1 } = {}) {
    const keyword = String(query || "").trim();
    if (!keyword) return [];
    const now = this.clock();
    const params = {
      bitrate: 0,
      clienttime: now,
      clientver: 2000,
      dfid: "-",
      inputtype: 0,
      iscorrection: 1,
      keyword,
      mid: this.mid,
      page: clampInteger(page, 1, 1, 1000),
      pagesize: clampInteger(limit, 20, 1, 50),
      platform: "WebFilter",
      privilege_filter: 0,
      srcappid: 2919,
      token: "",
      userid: 0,
      uuid: String(now),
      appid: 1014,
    };
    const url = new URL(KUGOU_WEB_SEARCH_URL);
    for (const [key, value] of Object.entries({ ...params, signature: signKugouWebParams(params) })) {
      url.searchParams.set(key, String(value));
    }
    const payload = await fetchJson(this.fetchImpl, url, {
      provider: "Kugou search",
      headers: { Referer: "https://www.kugou.com/", "User-Agent": UA },
    });
    if (Number(payload?.error_code) !== 0 && payload?.error_code != null) {
      throw new Error(`Kugou search error ${payload.error_code}: ${payload.error_msg || "unknown error"}`);
    }
    return extractListPayload(payload?.data?.lists ? payload.data.lists : payload?.data?.info ? payload.data.info : payload)
      .map(normalizeKugouTrack)
      .filter(Boolean);
  }

  _qualityCandidates(track, quality, fallback) {
    const raw = track.raw || track;
    const entries = [
      { quality: "hi-res", label: "hires", hash: raw.ResFileHash, privilege: raw.ResPrivilege ?? raw.ASQPrivilege, bitrate: raw.ResBitrate, size: raw.ResFileSize },
      { quality: "lossless", label: "flac", hash: raw.SQFileHash, privilege: raw.SQPrivilege, bitrate: raw.SQBitrate, size: raw.SQFileSize },
      { quality: "320kbps", label: "mp3_320", hash: raw.HQFileHash, privilege: raw.HQPrivilege, bitrate: raw.HQBitrate, size: raw.HQFileSize },
      { quality: "128kbps", label: "mp3_128", hash: raw.FileHash, privilege: raw.Privilege, bitrate: raw.Bitrate, size: raw.FileSize },
    ].filter((candidate) => candidate.hash);
    const target = String(quality).toLowerCase();
    let preferredLabels;
    if (["999", "hires", "hi-res", "24bit"].includes(target)) preferredLabels = ["hires", "flac", "mp3_320", "mp3_128"];
    else if (["740", "flac", "lossless", "16bit"].includes(target)) preferredLabels = ["flac", "hires", "mp3_320", "mp3_128"];
    else if (["320", "320k", "320kbps"].includes(target)) preferredLabels = ["mp3_320", "mp3_128"];
    else preferredLabels = ["mp3_128"];
    const ordered = preferredLabels
      .map((label) => entries.find((entry) => entry.label === label))
      .filter(Boolean);
    const candidates = fallback ? ordered : ordered.slice(0, 1);
    return candidates.filter((candidate) => candidate.privilege == null || Number(candidate.privilege) === 0);
  }

  async stream(trackOrHash, { quality = "320", fallback = true } = {}) {
    const track = typeof trackOrHash === "object" && trackOrHash !== null ? trackOrHash : null;
    const hash = track ? null : String(trackOrHash || "").trim();
    const candidates = track
      ? this._qualityCandidates(track, quality, fallback)
      : hash
        ? [{ quality: "unknown", label: "hash", hash, privilege: 0 }]
        : [];
    if (candidates.length === 0) return null;

    for (const candidate of candidates) {
      const url = new URL(KUGOU_MOBILE_STREAM_URL);
      url.searchParams.set("cmd", "playInfo");
      url.searchParams.set("hash", String(candidate.hash).toUpperCase());
      url.searchParams.set("from", "mkugou");
      let payload;
      try {
        payload = await fetchJson(this.fetchImpl, url, {
          provider: "Kugou stream",
          headers: { Referer: "https://m.kugou.com/", "User-Agent": MOBILE_UA },
        });
      } catch {
        continue;
      }
      const streamUrl = normalizeHttpUrl(
        Array.isArray(payload?.url) ? payload.url[0] : payload?.url
      );
      if (Number(payload?.status) !== 1 || !streamUrl) continue;
      const extension = String(payload?.extName || new URL(streamUrl).pathname.split(".").pop() || "mp3").toLowerCase();
      const mimeType = extension === "flac" ? "audio/flac" : extension === "m4a" || extension === "mp4" ? "audio/mp4" : "audio/mpeg";
      const bitrateKbps = Number(payload?.bitRate ?? candidate.bitrate) || 0;
      return {
        id: track?.id || candidate.hash,
        provider: "kugou",
        source: "kugou",
        client: "KUGOU_MOBILE",
        streamUrl,
        url: streamUrl,
        hash: candidate.hash,
        quality: candidate.quality,
        bitrate: bitrateKbps > 0 && bitrateKbps < 10000 ? bitrateKbps * 1000 : bitrateKbps || null,
        bitrateKbps: bitrateKbps || null,
        contentLength: Number(payload?.fileSize ?? candidate.size) || null,
        mimeType,
        title: String(payload?.songName || track?.title || ""),
        artist: String(payload?.singerName || track?.artist || ""),
        album: String(payload?.albumName || track?.album || ""),
        durationSeconds: normalizeDurationSeconds(payload?.timeLength || track?.durationSeconds),
        coverUrl: track?.coverUrl || null,
        raw: payload,
      };
    }
    return null;
  }

  async lyrics(trackOrTitle, { artist = "", durationSeconds = 0 } = {}) {
    let track = typeof trackOrTitle === "object" && trackOrTitle !== null ? trackOrTitle : null;
    const title = String(track?.title || trackOrTitle || "").trim();
    if (!title) return null;
    const expectedDurationMs = Math.round(normalizeDurationSeconds(track?.durationSeconds || durationSeconds) * 1000);
    const params = {
      ver: 1,
      man: "no",
      client: "mobi",
      keyword: title,
      hash: "",
      album_audio_id: 0,
      duration: expectedDurationMs,
    };
    const searchUrl = new URL(KUGOU_LYRICS_SEARCH_URL);
    for (const [key, value] of Object.entries(params)) searchUrl.searchParams.set(key, String(value));
    const search = await fetchJson(this.fetchImpl, searchUrl, {
      provider: "Kugou lyrics search",
      headers: { Referer: "https://www.kugou.com/", "User-Agent": UA },
    }).catch(() => null);
    const candidates = [...(search?.candidates || []), ...(search?.ugccandidates || [])];
    const wantedTitle = normalizeMatchText(title);
    const wantedArtist = normalizeMatchText(artist || track?.artist || "");
    const valid = candidates
      .map((candidate) => {
        const titleScore = textSimilarity(wantedTitle, candidate.song);
        const artistScore = wantedArtist ? textSimilarity(wantedArtist, candidate.singer) : 0.5;
        const candidateDuration = normalizeDurationSeconds(Number(candidate.duration) / 1000);
        const drift = expectedDurationMs && Number(candidate.duration)
          ? Math.abs(Number(candidate.duration) - expectedDurationMs)
          : 0;
        return { candidate, titleScore, artistScore, drift, candidateDuration };
      })
      .filter((entry) => entry.titleScore >= 0.58 && (!expectedDurationMs || !entry.drift || entry.drift <= 6000))
      .sort((a, b) => (b.titleScore + b.artistScore * 0.15) - (a.titleScore + a.artistScore * 0.15));
    const selected = valid[0]?.candidate;
    if (!selected?.id || !selected?.accesskey) return null;

    const downloadUrl = new URL(KUGOU_LYRICS_DOWNLOAD_URL);
    downloadUrl.searchParams.set("ver", "1");
    downloadUrl.searchParams.set("client", "mobi");
    downloadUrl.searchParams.set("id", String(selected.id));
    downloadUrl.searchParams.set("accesskey", String(selected.accesskey));
    downloadUrl.searchParams.set("fmt", "krc");
    downloadUrl.searchParams.set("charset", "utf8");
    const downloaded = await fetchJson(this.fetchImpl, downloadUrl, {
      provider: "Kugou lyrics download",
      headers: { Referer: "https://www.kugou.com/", "User-Agent": UA },
    }).catch(() => null);
    if (!downloaded?.content) return null;
    const isKrc = Number(downloaded.contenttype) === 0 || String(downloaded.contenttype).toLowerCase() === "krc";
    const decoded = isKrc
      ? decodeKugouKrc(downloaded.content)
      : Buffer.from(downloaded.content, "base64").toString("utf8");
    const lrc = isKrc ? kugouKrcToLrc(decoded) : decoded;
    if (!lrc || !/\[\d{2}:\d{2}/.test(lrc)) return null;
    return {
      provider: "kugou",
      source: "kugou",
      type: "lrc",
      lrc,
      krc: isKrc ? decoded : null,
      song: selected.song || title,
      singer: selected.singer || artist,
      durationSeconds: valid[0]?.candidateDuration || 0,
    };
  }
}

function normalizeDeezerTrack(track) {
  if (!track || typeof track !== "object") return null;
  const title = String(track.title || track.title_short || "").trim();
  if (!title) return null;
  const artists = normalizeArtists(track.artist?.name ?? track.artist ?? track.artists);
  const album = track.album || {};
  return {
    id: String(track.id ?? ""),
    provider: "deezer",
    source: "deezer",
    title,
    artist: artists.join(", "),
    artists,
    album: String(album.title ?? track.album_title ?? ""),
    durationSeconds: normalizeDurationSeconds(track.duration),
    isrc: track.isrc || null,
    link: track.link || null,
    coverUrl: normalizeHttpUrl(album.cover_xl || album.cover_big || album.cover_medium || track.cover),
    previewUrl: normalizeHttpUrl(track.preview),
    fullStreamAvailable: false,
    raw: track,
  };
}

export class DeezerCatalogResolver {
  constructor({ fetchImpl = fetch, baseUrl = "https://api.deezer.com" } = {}) {
    this.fetchImpl = fetchImpl;
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async _get(path, params = {}) {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }
    return fetchJson(this.fetchImpl, url, { provider: "Deezer catalog" });
  }

  async search(query, { limit = 20, index = 0 } = {}) {
    const payload = await this._get("/search", {
      q: String(query || "").trim(),
      limit: clampInteger(limit, 20, 1, 100),
      index: clampInteger(index, 0, 0, 100000),
    });
    return extractListPayload(payload).map(normalizeDeezerTrack).filter(Boolean);
  }

  async track(id) {
    const payload = await this._get(`/track/${encodeURIComponent(String(id))}`);
    return normalizeDeezerTrack(payload);
  }

  async album(id) {
    const payload = await this._get(`/album/${encodeURIComponent(String(id))}`);
    return {
      id: String(payload?.id ?? id),
      provider: "deezer",
      title: String(payload?.title || ""),
      artist: String(payload?.artist?.name || ""),
      coverUrl: normalizeHttpUrl(payload?.cover_xl || payload?.cover_big || payload?.cover_medium),
      tracks: extractListPayload(payload?.tracks).map(normalizeDeezerTrack).filter(Boolean),
      raw: payload,
    };
  }

  async artistTop(id, { limit = 20 } = {}) {
    const payload = await this._get(`/artist/${encodeURIComponent(String(id))}/top`, {
      limit: clampInteger(limit, 20, 1, 100),
    });
    return extractListPayload(payload).map(normalizeDeezerTrack).filter(Boolean);
  }

  async charts({ limit = 20 } = {}) {
    const payload = await this._get("/chart", { limit: clampInteger(limit, 20, 1, 100) });
    return {
      provider: "deezer",
      tracks: extractListPayload(payload?.tracks).map(normalizeDeezerTrack).filter(Boolean),
      albums: extractListPayload(payload?.albums).map((album) => ({
        id: String(album?.id ?? ""),
        title: String(album?.title || ""),
        artist: String(album?.artist?.name || ""),
        coverUrl: normalizeHttpUrl(album?.cover_xl || album?.cover_big || album?.cover_medium),
        raw: album,
      })),
      artists: extractListPayload(payload?.artists),
      raw: payload,
    };
  }

  async stream() {
    throw new Error("Deezer's public catalog provides metadata and short previews, not full-song streams");
  }
}

export { decodeKugouKrc, kugouKrcToLrc, normalizeMatchText, scoreTrackMatch };

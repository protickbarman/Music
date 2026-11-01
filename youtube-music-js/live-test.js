import { createMusicApp, normalizeYouTubeMusicTracks } from "./music-app.js";

function redactError(error) {
  return String(error?.message || error)
    .replace(/https?:\/\/\S+/gi, "[url redacted]")
    .replace(/(cookie|authorization)\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]");
}

const query = process.argv.slice(2).join(" ").trim() || "Blinding Lights The Weeknd";
if (!process.env.YTM_COOKIE && !process.env.YTM_COOKIE_FILE) {
  console.error("Set YTM_COOKIE_FILE to a local cookie export (or YTM_COOKIE to a raw header) before running the live test.");
  process.exitCode = 2;
} else {
  const app = createMusicApp();
  try {
    const init = await app.ready;
    const requestHeaders = app.core.buildClientHeaders("WEB_REMIX");
    const searchPayload = await app.search(query, { source: "ytmusic", type: "songs", limit: 10 });
    const tracks = normalizeYouTubeMusicTracks(searchPayload, { limit: 10 });
    if (tracks.length === 0) throw new Error("YouTube Music returned no playable song results for this query");

    const selected = tracks[0];
    const stream = await app.playTrack(selected, { validate: true });
    if (!stream?.streamUrl) throw new Error("No playable stream URL was resolved");

    console.log(JSON.stringify({
      ok: true,
      query,
      localAuthConfigured: Boolean(app.core.cookie),
      sapisidHashConfigured: /^SAPISIDHASH \d+_[a-f0-9]{40}$/.test(requestHeaders.Authorization || ""),
      cipherHealthy: init.cipherHealthy,
      search: {
        count: tracks.length,
        selected: { title: selected.title, artist: selected.artist, videoId: selected.videoId },
      },
      stream: {
        provider: stream.fallbackSource || stream.provider || "youtube-music",
        client: stream.client,
        validated: stream.validated,
        quality: stream.quality || stream.audioQuality || null,
        mimeType: stream.mimeType,
        url: "[redacted]",
      },
      note: "A successful search alone does not prove YouTube accepted authentication; public search may work without a cookie.",
    }, null, 2));
  } catch (error) {
    console.error(JSON.stringify({
      ok: false,
      query,
      error: redactError(error),
      note: "Cookie values, authorization headers, and stream URLs are not printed.",
    }, null, 2));
    process.exitCode = 1;
  } finally {
    await app.close().catch(() => {});
  }
}

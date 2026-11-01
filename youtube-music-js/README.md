# xroMusic unified client

A zero-dependency Node.js client that combines music discovery and playback across YouTube Music, GDStudio (NetEase/Bilibili), Kugou, Deezer, and Internet Archive.

## Catalog and playback coverage

- **Search:** YouTube Music, GDStudio NetEase/Bilibili, Kugou, Deezer, and Internet Archive. `source: "all"` queries them concurrently.
- **Full-track streams:** YouTube Music first; when unavailable, metadata-matched GDStudio streams (Hi-Res/lossless/MP3 tiers) and eligible free Kugou streams are tried. Internet Archive can resolve downloadable audio items.
- **Catalog-only:** Deezer contributes catalog metadata, ISRC, artwork, charts, and short previews. Its public API is not treated as a full-track source.
- **Lyrics:** YouTube Music when a lyrics browse ID is available, followed by Boidu, LyricsPlus, GDStudio, Kugou KRC, NetEase, QQ Music, and LRCLIB.
- Provider coverage and rights vary; no universal catalog or stream availability is promised, and locked/VIP access controls are not bypassed.

## Requirements and tests

- Node.js 18 or newer; no npm dependencies are required.
- Run both mock-backed suites with:

```sh
npm test
```

`test-unified-api.js` checks the player-cipher paths, provider resolvers, GDStudio source interleaving, stream validation/proxying, exact-match fallback, and rejection of a same-title result from a different artist. `test-xroMusic-all.js` exercises all 40 public client operations.

## One-import app module

`music-app.js` is the high-level entry point. It initializes automatically, searches all catalogs by default, chooses a YouTube Music result first, and resolves a stream with match-gated GDStudio/Kugou fallback. It also exposes the inherited lyrics, queue, library, playlists, charts, and other client methods.

```js
import musicApp from "./music-app.js";

await musicApp.ready;
const catalogs = await musicApp.search("বাংলা গান", { limit: 10 });
const stream = await musicApp.play("artist - song title");
const lyrics = await musicApp.lyricsFor("artist - song title");

// stream.streamUrl is ready for your app's audio player when a full track resolves.
```

`musicApp.play(track)` also accepts a selected catalog result. Deezer is preview-only; `allowPreview: true` must be opted into explicitly. Use `createMusicApp(options)` when you need a separate instance or a custom `fetchImpl`.

## Optional YouTube Music authentication

Public content does not require a cookie. For supported signed-in requests, the client accepts a Cookie header or a browser-exported JSON object through `init({ cookie })` / `setAuth({ cookie })`. It also reads `YTM_COOKIE` (raw header) or `YTM_COOKIE_FILE` (a local JSON export or raw header file) when the process starts:

```sh
YTM_COOKIE_FILE="/private/path/cookies.json" node app.js
```

The export is filtered to unexpired `youtube.com` cookies and scoped to YouTube Music. When a supported SAPISID cookie is present, the client computes the InnerTube `SAPISIDHASH` authorization header in memory. Keep the file outside the repository, never paste it into chat, and never commit it; cookie exports grant account access. Authentication can enable supported account-specific requests, but it cannot guarantee playback for every track or region.

## Bundled runtime data

The client uses checked-in player/cipher fixtures for local cipher operation and deterministic tests:

- `youtube-player-scripts/` — ES5 and ES6 player bundles used by the test suite and runtime cipher loader.
- `reserver-ytb-js/test/fixtures/player/base-ea6f527e.js` — a second player fixture.
- `cipher-configs/` — Faraday/Zemer player-cipher registries.
- `live-ytm-scripts/sw.js_data.json` — visitor-data bootstrap payload.

The upstream player bundles and provider APIs can change; refresh the fixtures/registries when needed. Additional downloaded upstream research trees may exist in a local checkout but are excluded from this package and are not runtime dependencies.

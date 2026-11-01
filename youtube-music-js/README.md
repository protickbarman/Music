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

## Quick example

```js
import xroMusic from "./xroMusic.js";

const catalogs = await xroMusic.search("বাংলা গান", { source: "all", limit: 10 });
const track = await xroMusic.gdStudioSearch("song title artist", { source: "netease" });
const stream = await xroMusic.gdStudioStream(track[0], { quality: "999" });
```

For a YouTube Music track, `xroMusic.stream(videoId, { title, artist, durationSeconds })` uses the YouTube client waterfall first, then only accepts a sufficiently matched external full-track candidate.

## Bundled runtime data

The client uses checked-in player/cipher fixtures for local cipher operation and deterministic tests:

- `youtube-player-scripts/` — ES5 and ES6 player bundles used by the test suite and runtime cipher loader.
- `reserver-ytb-js/test/fixtures/player/base-ea6f527e.js` — a second player fixture.
- `cipher-configs/` — Faraday/Zemer player-cipher registries.
- `live-ytm-scripts/sw.js_data.json` — visitor-data bootstrap payload.

The upstream player bundles and provider APIs can change; refresh the fixtures/registries when needed. Additional downloaded upstream research trees may exist in a local checkout but are excluded from this package and are not runtime dependencies.

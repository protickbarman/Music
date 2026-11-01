export type SearchType =
  | "all"
  | "songs"
  | "videos"
  | "albums"
  | "artists"
  | "playlists"
  | "community_playlists"
  | "featured_playlists"
  | "podcasts"
  | "episodes";

export type SearchSource =
  | "ytmusic"
  | "gdstudio"
  | "gd"
  | "netease"
  | "bilibili"
  | "kugou"
  | "deezer"
  | "archive"
  | "all";

export type GDStudioQuality = "999" | "740" | "320" | "192" | "128" | "hires" | "lossless" | "flac";

export interface MusicCatalogTrack {
  id: string;
  provider: "gdstudio" | "kugou" | "deezer" | string;
  source: string;
  title: string;
  artist: string;
  artists: string[];
  album?: string;
  durationSeconds?: number;
  coverId?: string | null;
  coverUrl?: string | null;
  previewUrl?: string | null;
  isrc?: string | null;
  hashes?: Record<string, string | null>;
  raw?: unknown;
}

export interface StreamResolution {
  videoId?: string;
  id?: string;
  provider?: string;
  source?: string;
  streamUrl: string;
  proxyUrl?: string;
  client: "WEB_REMIX" | "VISIONOS" | "TVHTML5_SIMPLY" | "IOS" | "ANDROID_VR" | "GDSTUDIO" | "KUGOU_MOBILE" | "INTERNET_ARCHIVE" | string;
  itag?: number;
  mimeType: string;
  bitrate?: number | null;
  bitrateKbps?: number | null;
  quality?: string;
  br?: string;
  requestedBr?: string;
  isLossless?: boolean;
  contentLength?: number | null;
  expiresInSeconds?: number;
  headers?: Record<string, string>;
  validated?: boolean | null;
  fallbackSource?: string;
  matchScore?: number;
  title?: string;
  artist?: string;
  durationSeconds?: number;
  thumbnail?: string | null;
  coverUrl?: string | null;
}

export interface GDStudioChart {
  id: string;
  name: string;
  source: string;
}

export declare class XroMusicClient {
  // 1. Initialization & Auth
  init(options?: {
    hl?: string;
    gl?: string;
    cookie?: string;
    startProxy?: boolean;
    proxyPort?: number;
  }): Promise<{
    ready: boolean;
    visitorData: string;
    poToken: string;
    sts: number;
    cipherHealthy: boolean;
    proxyPort: number | null;
    clients: string[];
  }>;

  setAuth(options: {
    cookie?: string;
    visitorData?: string;
    poToken?: string;
    listenBrainzToken?: string;
    lastFmApiKey?: string;
    lastFmSessionKey?: string;
  }): { authenticated: boolean };

  // 2. Search & Discovery
  search(
    query: string,
    options?: {
      type?: SearchType;
      source?: SearchSource;
      limit?: number;
      continuation?: string | null;
      gdSource?: "netease" | "bilibili";
      gdSources?: Array<"netease" | "bilibili">;
    }
  ): Promise<any>;
  suggestions(input: string): Promise<any>;
  home(continuation?: string | null): Promise<any>;
  charts(countryCode?: string): Promise<any>;
  moods(params?: string | null): Promise<any>;
  newReleases(type?: "albums" | "videos"): Promise<any>;

  // 3. Catalog Entities
  song(videoId: string): Promise<any>;
  artist(channelId: string): Promise<any>;
  album(browseId: string): Promise<any>;
  playlist(playlistId: string, continuation?: string | null): Promise<any>;
  upNext(
    videoId: string,
    options?: { playlistId?: string | null; radio?: boolean; continuation?: string | null }
  ): Promise<any>;
  related(relatedBrowseId: string): Promise<any>;

  // 4. Audio/Video Stream Resolution, Cipher & Proxy
  stream(
    videoId: string,
    options?: {
      preferHigh?: boolean;
      validate?: boolean;
      isUpload?: boolean;
      enableCatalogFallback?: boolean;
      title?: string;
      artist?: string;
      durationSeconds?: number;
      quality?: GDStudioQuality | "320k" | "128k";
      fallbackSearchLimit?: number;
    }
  ): Promise<StreamResolution>;
  videoStream(videoId: string, options?: { maxHeight?: number }): Promise<any>;
  decipher(options: {
    url?: string;
    signatureCipher?: string;
    s?: string;
    n?: string;
    poToken?: string;
  }): { url?: string | null; s?: string | null; n?: string | null; sts: number };
  validateStream(
    url: string,
    options?: { headers?: Record<string, string>; contentLength?: number | null }
  ): Promise<boolean>;
  proxyStart(port?: number): Promise<{ port: number; baseUrl: string }>;
  proxyWrap(
    streamUrl: string,
    options?: { headers?: Record<string, string>; contentLength?: number | null; mimeType?: string }
  ): string;
  proxyStop(): Promise<{ stopped: boolean }>;

  // 5. GDStudio full tracks, artwork, lyrics, playlists & charts
  gdStudioSearch(query: string, options?: { source?: "netease" | "bilibili"; limit?: number; page?: number }): Promise<MusicCatalogTrack[]>;
  gdStudioSearchAll(
    query: string,
    options?: { sources?: Array<"netease" | "bilibili">; limit?: number; page?: number }
  ): Promise<MusicCatalogTrack[]>;
  gdStudioStream(
    trackOrQuery: MusicCatalogTrack | string,
    options?: { source?: "netease" | "bilibili"; quality?: GDStudioQuality; fallback?: boolean; limit?: number }
  ): Promise<StreamResolution | null>;
  gdStudioCover(trackOrId: MusicCatalogTrack | string, options?: { source?: "netease" | "bilibili"; size?: number }): Promise<string | null>;
  gdStudioLyrics(
    trackOrQuery: MusicCatalogTrack | string,
    options?: { source?: "netease" | "bilibili"; limit?: number }
  ): Promise<any>;
  gdStudioPlaylist(id: string, options?: { source?: "netease" | "bilibili" }): Promise<any>;
  gdStudioCharts(): GDStudioChart[];
  gdStudioChart(id: string, options?: { source?: "netease" | "bilibili" }): Promise<any>;

  // 6. Kugou search, free-track full streams, and synced lyrics
  kugouSearch(query: string, options?: { limit?: number; page?: number }): Promise<MusicCatalogTrack[]>;
  kugouStream(
    trackOrQuery: MusicCatalogTrack | string,
    options?: { quality?: "999" | "740" | "320" | "128" | "hires" | "flac" | "lossless"; fallback?: boolean; limit?: number }
  ): Promise<StreamResolution | null>;
  kugouLyrics(
    trackOrTitle: MusicCatalogTrack | string,
    options?: { artist?: string; durationSeconds?: number }
  ): Promise<any>;

  // 7. Deezer metadata/catalog (public API only provides short previews)
  deezerSearch(query: string, options?: { limit?: number; index?: number }): Promise<MusicCatalogTrack[]>;
  deezerTrack(id: string): Promise<MusicCatalogTrack | null>;
  deezerAlbum(id: string): Promise<any>;
  deezerArtistTop(id: string, options?: { limit?: number }): Promise<MusicCatalogTrack[]>;
  deezerCharts(options?: { limit?: number }): Promise<any>;

  // 8. Internet Archive
  archiveSearch(query: string, options?: { limit?: number }): Promise<any[]>;
  archiveStream(identifier: string): Promise<StreamResolution | null>;

  // 9. Synced Lyrics
  lyrics(options: {
    videoId?: string | null;
    lyricsBrowseId?: string | null;
    title?: string;
    artist?: string;
    album?: string;
    durationSeconds?: number;
  }): Promise<any>;

  // 10. Queue, Library, Spotify Import & Scrobbling
  queue: {
    get(): any;
    set(tracks: any[], startIndex?: number): any;
    add(track: any, options?: { playNext?: boolean }): any;
    next(): any;
    prev(): any;
    clear(): any;
  };
  library: {
    like(track: any): boolean;
    unlike(id: string): boolean;
    getLiked(): any[];
    createPlaylist(name: string, tracks?: any[]): any;
    exportBackup(): string;
  };
  spotifyImport(spotifyUrlOrId: string, options?: { type?: "track" | "playlist" | "album" }): Promise<any>;
  scrobble(options: {
    title: string;
    artist: string;
    album?: string;
    durationSeconds?: number;
    type?: "now" | "single";
    playedAt?: number;
  }): Promise<{ scrobbled: boolean; status?: number; reason?: string }>;
}

export declare const xroMusic: XroMusicClient;
export default xroMusic;

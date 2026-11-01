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

export type SearchSource = "ytmusic" | "saavn" | "archive" | "all";

export interface StreamResolution {
  videoId: string;
  streamUrl: string;
  proxyUrl: string;
  client: "WEB_REMIX" | "VISIONOS" | "TVHTML5_SIMPLY" | "IOS" | "ANDROID_VR" | "JIOSAAVN_320" | "INTERNET_ARCHIVE";
  itag?: number;
  mimeType: string;
  bitrate: number;
  audioQuality?: string;
  contentLength?: number | null;
  expiresInSeconds?: number;
  headers?: Record<string, string>;
  validated?: boolean;
  title?: string;
  artist?: string;
  durationSeconds?: number;
  thumbnail?: string | null;
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
      enableJioSaavnFallback?: boolean;
      title?: string;
      artist?: string;
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

  // 5. JioSaavn & Internet Archive
  saavnSearch(query: string, options?: { limit?: number }): Promise<any[]>;
  saavnStream(queryOrEncryptedUrl: string): Promise<any>;
  archiveSearch(query: string, options?: { limit?: number }): Promise<any[]>;
  archiveStream(identifier: string): Promise<any>;

  // 6. Synced Lyrics
  lyrics(options: {
    videoId?: string | null;
    lyricsBrowseId?: string | null;
    title?: string;
    artist?: string;
    album?: string;
    durationSeconds?: number;
  }): Promise<any>;

  // 7. Queue, Library, Spotify Import & Scrobbling
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

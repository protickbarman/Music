import type {
  GDStudioQuality,
  MusicCatalogTrack,
  SearchSource,
  SearchType,
  StreamResolution,
  YouTubeCookieInput,
  XroMusicClient,
} from "./xroMusic.js";

export interface MusicAppOptions {
  cookie?: YouTubeCookieInput;
  hl?: string;
  gl?: string;
  startProxy?: boolean;
  proxyPort?: number;
  fetchImpl?: typeof fetch;
  [key: string]: unknown;
}

export interface YouTubeMusicTrack {
  id: string;
  videoId: string;
  provider: "ytmusic";
  source: "ytmusic";
  title: string;
  artist: string;
  durationSeconds: number;
  thumbnail: string | null;
  raw: unknown;
}

export type MusicAppStream = StreamResolution & { isPreview?: boolean };

export declare class MusicApp extends XroMusicClient {
  constructor(options?: MusicAppOptions);
  ready: Promise<{
    ready: boolean;
    visitorData: string;
    poToken: string;
    sts: number;
    cipherHealthy: boolean;
    proxyPort: number | null;
    clients: string[];
  }>;
  search(query: string, options?: {
    type?: SearchType;
    source?: SearchSource;
    limit?: number;
    continuation?: string | null;
    gdSource?: "netease" | "bilibili";
    gdSources?: Array<"netease" | "bilibili">;
  }): Promise<any>;
  searchAll(query: string, options?: { type?: SearchType; limit?: number }): Promise<any>;
  play(trackOrQuery: string | MusicCatalogTrack | YouTubeMusicTrack | Record<string, unknown>, options?: {
    source?: SearchSource;
    searchLimit?: number;
    quality?: GDStudioQuality | "320k" | "128k";
    preferHigh?: boolean;
    validate?: boolean;
    enableCatalogFallback?: boolean;
    fallbackSearchLimit?: number;
    allowArchive?: boolean;
    allowPreview?: boolean;
  }): Promise<MusicAppStream | null>;
  playTrack(track: MusicCatalogTrack | YouTubeMusicTrack | Record<string, unknown>, options?: {
    quality?: GDStudioQuality | "320k" | "128k";
    preferHigh?: boolean;
    validate?: boolean;
    enableCatalogFallback?: boolean;
    fallbackSearchLimit?: number;
    allowPreview?: boolean;
  }): Promise<MusicAppStream | null>;
  lyricsFor(trackOrQuery: string | MusicCatalogTrack | YouTubeMusicTrack, options?: {
    source?: SearchSource;
  }): Promise<any>;
  close(): Promise<{ closed: true }>;
}

export declare function normalizeYouTubeMusicTracks(
  payload: unknown,
  options?: { limit?: number }
): YouTubeMusicTrack[];

export declare function createMusicApp(options?: MusicAppOptions): MusicApp;
export declare const musicApp: MusicApp;
export default musicApp;

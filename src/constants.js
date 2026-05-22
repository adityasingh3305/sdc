import { Capacitor } from '@capacitor/core';

export const BREAKPOINTS = {
  XL: 1200,
  LG: 800,
  MD: 500,
};

export const DEBOUNCE_MS = {
  RESIZE: 250,
  SEARCH: 500,
};

export const SCROLL_THRESHOLD = 80;

export const FORMAT_THRESHOLDS = [
  { limit: 1000000, suffix: "M", divisor: 1000000 },
  { limit: 1000, suffix: "K", divisor: 1000 },
];

export const MAX_COMMENT_DEPTH = 5;

export const OBSERVER_THRESHOLD = 0.6;
export const SENTINEL_ROOT_MARGIN = "200%";

export const STORAGE_KEY = "rscroller_blacklist";

export const HLS_CONFIG = {
  maxBufferLength: 15,
  maxMaxBufferLength: 30,
  enableWorker: true,
  lowLatencyMode: true,
  backBufferLength: 5,
  startFragPrefetch: true,
  capLevelToPlayerSize: false,
  abrEwmaDefaultEstimate: 5000000,
};

export const SHARE_COPIED_DURATION = 1500;

export const REDGIFS_BASE = "https://media.redgifs.com/";

export const API_BASE = Capacitor.isNativePlatform() ? "https://www.reddit.com" : "/api/reddit";
export const POSTS_PER_PAGE = "25";

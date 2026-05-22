import { Capacitor } from '@capacitor/core';
import { API_BASE, POSTS_PER_PAGE } from "./constants.js";

export class RedditAPI {
  constructor({ baseUrl = API_BASE, limit = POSTS_PER_PAGE } = {}) {
    this.baseUrl = baseUrl;
    this.postsPerPage = limit;
    this.isNative = Capacitor.isNativePlatform();
    // Lazy-import Http only on native to avoid import issues on web
    this._Http = null;
  }

  async _getHttpModule() {
    if (!this._Http) {
      this._Http = await import('@capacitor/core');
    }
    return this._Http;
  }

  normalizeSubredditInput(input) {
    const raw = (input || "").trim();
    if (!raw) return "all";

    const tokens = raw
      .split(/[,+\s]+/)
      .map((t) => t.trim())
      .filter(Boolean)
      .map((t) => t.replace(/^r\//i, ""))
      .filter((t) => /^[A-Za-z0-9_]+$/.test(t));

    if (!tokens.length) return "all";

    const unique = [];
    const seen = new Set();
    for (const t of tokens) {
      const k = t.toLowerCase();
      if (!seen.has(k)) {
        seen.add(k);
        unique.push(t);
      }
    }
    return unique.join("+");
  }

  extractFromSort(sort) {
    let baseSort = sort;
    let timeQuery = "";
    const match = sort.match(/^(\w+)\?t=(.+)$/);

    if (match) {
      baseSort = match[1];
      timeQuery = `&t=${match[2]}`;
    }

    return { baseSort, timeQuery };
  }

  async fetchData(endpoint, params = new URLSearchParams()) {
    const url = new URL(`${this.baseUrl}${endpoint}`, window.location.origin);
    params.forEach((value, key) => url.searchParams.append(key, value));
    const fullUrl = url.toString();

    if (this.isNative) {
      const mod = await this._getHttpModule();
      const response = await mod.CapacitorHttp.get({
        url: fullUrl,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.82 Mobile Safari/537.36',
          'Accept': 'application/json',
        },
      });
      // CapacitorHttp wraps the body in a data property; response.data is already parsed JSON
      if (typeof response.data === 'object' && response.data !== null) {
        return response.data;
      }
      throw new Error(`Capacitor HTTP request failed: ${JSON.stringify(response)}`);
    }

    const res = await fetch(fullUrl);
    if (!res.ok) {
      throw new Error(`Request failed with status ${res.status} — ${res.statusText}`);
    }
    return res.json();
  }

  async fetchSubredditPosts(subreddit, sort, after = "") {
    const { baseSort, timeQuery } = this.extractFromSort(sort);
    const multi = this.normalizeSubredditInput(subreddit);
    const params = new URLSearchParams({
      limit: this.postsPerPage.toString(),
      after,
      raw_json: "1",
    });

    if (timeQuery) params.append("t", timeQuery.replace("&t=", ""));

    const data = await this.fetchData(`/r/${multi}/${baseSort}.json`, params);

    return {
      posts: data.data.children.map((child, index) => ({
        ...child.data,
        index,
      })),
      afterToken: data.data.after || "",
    };
  }

  async fetchSuggestions(query) {
    return this.fetchData(
      "/api/subreddit_autocomplete_v2.json",
      new URLSearchParams({
        query,
        include_over_18: "true",
      }),
    );
  }

  async fetchComments(permalink) {
    return this.fetchData(
      `${permalink}.json`,
      new URLSearchParams({ raw_json: "1" }),
    );
  }
}
// Cloudflare Worker entry point
// Handles /api/reddit/* proxy; everything else falls through to static assets (dist/).
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Intercept Reddit API proxy requests
    if (url.pathname.startsWith('/api/reddit/')) {
      const redditPath = url.pathname.replace('/api/reddit', '');
      const redditUrl = `https://www.reddit.com${redditPath}${url.search}`;

      console.log(`[reddit-proxy] ${redditPath}${url.search}`);

      const response = await fetch(redditUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });

      return new Response(response.body, {
        status: response.status,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=60',
        },
      });
    }

    // Everything else → serve static assets (SPA fallback handled by wrangler.jsonc)
    return env.ASSETS.fetch(request);
  },
};

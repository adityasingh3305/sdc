// Cloudflare Pages Function — handles /api/reddit/* proxy to Reddit
// Cloudflare's IP range is not blocked by Reddit, so simple browser headers work.
export async function onRequest(context) {
  const { request, params } = context;
  const url = new URL(request.url);

  // params.path is an array of path segments after /api/reddit/
  const path = params.path ? '/' + params.path.join('/') : '';
  const redditUrl = `https://www.reddit.com${path}${url.search}`;

  console.log(`[reddit-proxy] Proxying: ${path}${url.search}`);

  const response = await fetch(redditUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });

  const body = await response.text();

  return new Response(body, {
    status: response.status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=60',
    },
  });
}

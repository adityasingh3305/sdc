export default async (request, context) => {
  try {
    const url = new URL(request.url);

    // Strip the /api/reddit prefix to get the raw Reddit path
    const redditPath = url.pathname.replace(/^\/api\/reddit/, '');
    const redditUrl = `https://www.reddit.com${redditPath}${url.search}`;

    console.log(`[reddit-proxy] Proxying: ${redditPath}${url.search}`);

    // Reddit blocks non-browser User-Agents with 403.
    // We must send a real browser UA + matching headers to get valid responses.
    const response = await fetch(redditUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
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
  } catch (error) {
    console.error(`[reddit-proxy] Error: ${error.message}`);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
};

export const config = {
  path: '/api/reddit/*',
};


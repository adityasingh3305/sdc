// Module-level token cache — persists across requests within the same edge isolate.
let cachedToken = null;
let tokenExpiresAt = 0;

async function getAccessToken() {
  const now = Date.now();
  // Return cached token if still valid (with 60s buffer)
  if (cachedToken && now < tokenExpiresAt - 60_000) {
    return cachedToken;
  }

  const clientId = Deno.env.get('REDDIT_CLIENT_ID');
  const clientSecret = Deno.env.get('REDDIT_CLIENT_SECRET');

  if (!clientId || !clientSecret) {
    throw new Error('Missing REDDIT_CLIENT_ID or REDDIT_CLIENT_SECRET env vars');
  }

  // Reddit App-Only OAuth — client_credentials grant
  const credentials = btoa(`${clientId}:${clientSecret}`);
  const res = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'RedditScroller/1.0 by /u/adityasingh3305',
    },
    body: 'grant_type=client_credentials',
  });

  if (!res.ok) {
    throw new Error(`OAuth token fetch failed: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  cachedToken = data.access_token;
  // expires_in is in seconds (Reddit tokens last 1 hour)
  tokenExpiresAt = now + data.expires_in * 1000;
  return cachedToken;
}

export default async (request, context) => {
  try {
    const url = new URL(request.url);

    // Strip the /api/reddit prefix to get the raw Reddit path
    const redditPath = url.pathname.replace(/^\/api\/reddit/, '');

    // oauth.reddit.com — authenticated requests bypass IP-based blocking entirely
    const redditUrl = `https://oauth.reddit.com${redditPath}${url.search}`;

    console.log(`[reddit-proxy] Proxying: ${redditPath}${url.search}`);

    const token = await getAccessToken();

    const response = await fetch(redditUrl, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'RedditScroller/1.0 by /u/adityasingh3305',
        'Accept': 'application/json',
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

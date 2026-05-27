export default async (request, context) => {
  try {
    const url = new URL(request.url);
    const redditPath = url.pathname
      .replace(/^\/api\/reddit/, '')
      .replace(/^\/\.netlify\/functions\/reddit-proxy/, '');
    const redditUrl = `https://www.reddit.com${redditPath}${url.search}`;

    console.log(`[reddit-proxy] Proxying: ${redditPath}${url.search}`);

    const response = await fetch(redditUrl, {
      headers: {
        'User-Agent': 'RedditScroller/1.0 (by /u/adityasingh3305)',
        'Accept': 'application/json',
      },
    });

    const body = await response.text();

    return new Response(body, {
      status: response.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
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
  path: "/api/reddit/*",
};

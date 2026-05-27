export default async (request, context) => {
  try {
    const url = new URL(request.url);

    // Strip the /api/reddit prefix to get the raw Reddit path
    const redditPath = url.pathname.replace(/^\/api\/reddit/, '');
    // Use old.reddit.com — ScrollX uses this instead of www.reddit.com
    // because old Reddit has far less aggressive server-side bot detection.
    const redditUrl = `https://old.reddit.com${redditPath}${url.search}`;

    console.log(`[reddit-proxy] Proxying: ${redditPath}${url.search}`);

    // Reddit validates that requests look like they come from a real browser
    // visiting reddit.com itself. sec-fetch-site=same-origin is the key header.
    const response = await fetch(redditUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.reddit.com/',
        'Origin': 'https://www.reddit.com',
        'sec-ch-ua': '"Google Chrome";v="125", "Chromium";v="125", "Not=A?Brand";v="24"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
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


export default async (request, context) => {
  const url = new URL(request.url);
  const redditPath = url.pathname.replace(/^\/\.netlify\/functions\/reddit-proxy/, '');
  const redditUrl = `https://www.reddit.com${redditPath}${url.search}`;

  const response = await fetch(redditUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
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
};

export const config = {
  path: "/api/reddit/*",
};

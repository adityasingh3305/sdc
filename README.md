# RedditScroller

A high-performance Reddit feed viewer with a premium dark UI, featuring a grid browse mode and an infinite reel view for immersive scrolling.

## Features

- Grid Browse – Browse subreddit posts in a responsive card grid layout
- Infinite Reel – Swipe through posts in a TikTok-style vertical reel
- Subreddit Search – Search and combine subreddits with auto-suggestions
- Sort & Filter – Sort by Hot, New, Top, Rising, or Controversial with time-range filtering
- Blacklist – Filter posts by keyword in title or subreddit name
- Comments – Slide-out comment sheet with nested replies
- Video Support – HLS.js-powered video playback for Reddit-hosted videos
- PWA – Installable Progressive Web App with offline caching via Workbox

## Tech Stack

- Vite
- vite-plugin-pwa / Workbox
- Vitest with jsdom
- HLS.js
- Bootstrap Icons

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Install

```bash
npm install
```

### Development

```bash
npm run dev
```

The dev server starts with a proxy that forwards `/api/reddit/*` requests to `https://old.reddit.com`, bypassing CORS restrictions during development.

### Build

```bash
npm run build
```

### Preview Production Build

```bash
npm run preview
```

### Run Tests

```bash
npm test
```

## Project Structure

```text
├── index.html
├── main.js
├── style.css
├── vite.config.js
├── vitest.config.js
├── src/
│   ├── api.js
│   ├── constants.js
│   └── utils.js
├── test/
│   ├── main.test.js
│   └── setup.js
├── .gitignore
└── package.json
```

## Notes

- Development uses a Vite proxy for Reddit API requests.
- Production deployments need an equivalent reverse proxy/serverless API path for Reddit JSON requests.
- Dynamic Reddit HTML embeds are sanitized to iframe-only markup before rendering.

## License

Private – All rights reserved.

# scroller
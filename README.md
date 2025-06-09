Bluesky Wikipedia Timeline Graphics Bot
=======================================

![Posting](https://cdn.gomix.com/4032b241-bff8-473e-aa6b-eb0c92a4bd06%2Ftweeting.gif)

This project is a bot that automatically posts timeline graphics from Wikipedia articles to Bluesky. It works by selecting a random article from a specific Wikipedia category, scraping the page for a timeline image, and posting the image along with the article title to your Bluesky account.

## How it works

- Selects a random article from Wikipedia's "Articles which contain graphical timelines" category.
- Scrapes the article for a timeline image.
- Posts the image and article title to Bluesky as a new post.
- Ensures it only posts once per 24 hours.

## Setup Instructions

1. Create a Bluesky account at https://bsky.app/.
2. Add your Bluesky handle and app password to the `.env` file.
3. Set the `BOT_ENDPOINT` environment variable (e.g., `post`).
4. Optionally, set up a free service like [Uptime Robot](https://uptimerobot.com/) to trigger your bot every 25+ minutes. Use `https://YOUR_PROJECT_NAME.glitch.me/BOT_ENDPOINT` as the URL to ping.

## Customization

- You can modify the Wikipedia category or filtering logic in `server.js` to change which articles are selected.
- The bot can be further customized to post different content or on a different schedule.

## Resources

- [Bluesky Community Guidelines](https://bsky.app/about/guidelines)
- [Botwiki Bluesky bot tutorials](https://botwiki.org/tutorials/blueskybots/)
- [Open source Bluesky bots](https://botwiki.org/tag/bluesky+bot+opensource+nodejs/)

## Deploying as a Cloudflare Worker

This bot can be deployed as a [Cloudflare Worker](https://developers.cloudflare.com/workers/). The Worker version is in `worker.js`.

### Environment Variables

Set these environment variables in your Cloudflare Worker:
- `BLUESKY_HANDLE`: Your Bluesky handle (e.g. `yourname.bsky.social`)
- `BLUESKY_PASSWORD`: Your Bluesky app password
- `BOT_ENDPOINT`: The endpoint path to trigger the bot (e.g. `post`)

### Deploy Steps

1. Install [Wrangler](https://developers.cloudflare.com/workers/wrangler/).
2. Add your environment variables to your `wrangler.toml` or Cloudflare dashboard.
3. Deploy with:
   ```sh
   wrangler publish
   ```
4. Trigger your bot by visiting `https://<your-worker-subdomain>/<BOT_ENDPOINT>`

**Powered by [Glitch](https://glitch.com)**

\ ゜o゜)ノ

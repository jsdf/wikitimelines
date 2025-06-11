Bluesky Wikipedia Timeline Graphics Bot
=======================================

This project is a bot that automatically posts timeline graphics from Wikipedia articles to Bluesky. It works by selecting a random article from a specific Wikipedia category, scraping the page for a timeline image, and posting the image along with the article title to your Bluesky account.

## How it works

- Selects a random article from Wikipedia's "Articles which contain graphical timelines" category.
- Scrapes the article for a timeline image.
- Posts the image and article title to Bluesky as a new post.
- Ensures it only posts once per 24 hours.

## Setup Instructions for Cloudflare Worker

1. Create a Bluesky account at https://bsky.app/.
2. Set the following environment variables in your Cloudflare Worker settings:
    - `BLUESKY_HANDLE`: Your Bluesky handle (e.g. `yourname.bsky.social`)
    - `BLUESKY_PASSWORD`: Your Bluesky app password (it is recommended to use an app password for security).
3. Optionally, set up a cron trigger in your Cloudflare Worker settings to run the bot on a schedule (e.g., once a day). The bot exposes a `/post` endpoint that triggers a new post.

## Customization

- You can modify the Wikipedia category or filtering logic in `worker.js` to change which articles are selected.
- The bot can be further customized to post different content or on a different schedule by modifying `worker.js`.

## Resources

- [Bluesky Community Guidelines](https://bsky.app/about/guidelines)
- [Botwiki Bluesky bot tutorials](https://botwiki.org/tutorials/blueskybots/)
- [Open source Bluesky bots](https://botwiki.org/tag/bluesky+bot+opensource+nodejs/)

## Deploying as a Cloudflare Worker

This bot is designed to be deployed as a [Cloudflare Worker](https://developers.cloudflare.com/workers/). The Worker code is in `worker.js`.

### Deploy Steps

1. Install [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/get-started/).
2. Configure your `wrangler.toml` file with your Cloudflare account details and worker name.
3. Add your `BLUESKY_HANDLE` and `BLUESKY_PASSWORD` as secrets to your worker using the Wrangler CLI or the Cloudflare dashboard:
   ```sh
   npx wrangler secret put BLUESKY_HANDLE
   npx wrangler secret put BLUESKY_PASSWORD
   ```
4. Deploy with:
   ```sh
   npx wrangler deploy
   ```
5. To trigger your bot manually, you can visit `https://<your-worker-name>.<your-account-subdomain>.workers.dev/post`. For automated posting, set up a cron trigger in the Cloudflare dashboard for your worker.

\ ゜o゜)ノ

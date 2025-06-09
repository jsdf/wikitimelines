import { BskyAgent } from '@atproto/api';

// Wikipedia category and filtering logic
const WIKI_CATEGORY = 'Category:Articles_which_contain_graphical_timelines';
const WIKI_API = 'https://en.wikipedia.org/w/api.php';

async function getPages() {
  const url = `${WIKI_API}?action=query&list=categorymembers&cmtitle=${WIKI_CATEGORY}&cmlimit=500&format=json&origin=*`;
  const res = await fetch(url);
  const data = await res.json();
  return data.query.categorymembers
    .map(page => page.title)
    .filter(title => !/hurricane|cyclone|typhoon|season|conference/i.test(title));
}

async function getRandomPageImage(pageTitle) {
  const pageUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(pageTitle)}`;
  const res = await fetch(pageUrl);
  const html = await res.text();
  const match = html.match(/<div class="timeline-wrapper">[\s\S]*?<img[^>]+src="([^"]+)"/);
  if (match) {
    let imgurl = match[1];
    if (imgurl.startsWith('//')) imgurl = 'https:' + imgurl;
    if (imgurl.startsWith('/')) imgurl = 'https://en.wikipedia.org' + imgurl;
    return { title: pageTitle, imageUrl: imgurl };
  }
  return null;
}

async function getImageBase64(imgurl) {
  const res = await fetch(imgurl);
  const arrayBuffer = await res.arrayBuffer();
  return btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
}

async function postToBluesky(env, page, imageDataB64) {
  const bsky = new BskyAgent({ service: 'https://bsky.social' });
  await bsky.login({ identifier: env.BLUESKY_HANDLE, password: env.BLUESKY_PASSWORD });
  const imgRes = await bsky.uploadBlob(Uint8Array.from(atob(imageDataB64), c => c.charCodeAt(0)), {
    encoding: 'image/jpeg',
  });
  await bsky.post({
    text: page.title,
    embed: {
      $type: 'app.bsky.embed.images',
      images: [{ image: imgRes.data.blob, alt: page.title }]
    }
  });
}

export default {
  async fetch(request, env, ctx) {
    if (new URL(request.url).pathname !== `/${env.BOT_ENDPOINT}`) {
      return new Response('Not found', { status: 404 });
    }
    // Only post once per 24 hours: use KV or D1 for persistence in production
    // For demo, always post
    const pages = await getPages();
    for (let i = 0; i < 5; i++) {
      const pageTitle = pages[Math.floor(Math.random() * pages.length)];
      const page = await getRandomPageImage(pageTitle);
      if (page) {
        const imageDataB64 = await getImageBase64(page.imageUrl);
        await postToBluesky(env, page, imageDataB64);
        return new Response('Posted to Bluesky!', { status: 200 });
      }
    }
    return new Response('No timeline image found after several tries.', { status: 500 });
  }
};

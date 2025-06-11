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
  if (!match) {
    return null;
  }
  let imgurl = match[1];
  if (imgurl.startsWith('//')) imgurl = 'https:' + imgurl;
  if (imgurl.startsWith('/')) imgurl = 'https://en.wikipedia.org' + imgurl;
  return { title: pageTitle, imageUrl: imgurl };
}

async function getImageBase64(imgurl) {
  const res = await fetch(imgurl);
  const arrayBuffer = await res.arrayBuffer();
  return btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
}

// Helper function to get a random page with its image
async function getRandomPageWithImage() {
  const pages = await getPages();
  for (let i = 0; i < 5; i++) { // Try up to 5 times
    const pageTitle = pages[Math.floor(Math.random() * pages.length)];
    const page = await getRandomPageImage(pageTitle);
    if (page) {
      return page;
    }
  }
  return null; // No page with an image found
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

async function handlePost(env) {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const lastPostDate = await env.WIKITIMELINES_KV.get(`lastPostDate`);

  if (lastPostDate === today) {
    return new Response('Already posted today.', { status: 429 });
  }

  const page = await getRandomPageWithImage();
  if (!page) {
    return new Response('No timeline image found after several tries.', { status: 500 });
  }

  try {
    const imageDataB64 = await getImageBase64(page.imageUrl);
    await postToBluesky(env, page, imageDataB64);
    // Store the date of successful post with a TTL of 25 hours
    // 25 hours = 25 * 60 * 60 = 90000 seconds
    await env.WIKITIMELINES_KV.put(`lastPostDate`, today, { expirationTtl: 90000 });
    return new Response('Posted to Bluesky!', { status: 200 });
  } catch (error) {
    console.error("Error posting to Bluesky or saving to KV:", error);
    return new Response('Failed to post to Bluesky or save state.', { status: 500 });
  }
}

async function handleTestPost() {
  const page = await getRandomPageWithImage();
  if (!page) {
    return new Response('No timeline image found for test post after several tries.', { status: 500 });
  }

  try {
    const imageDataB64 = await getImageBase64(page.imageUrl);
    // Simulate what would be posted
    const postData = {
      text: page.title,
      embed: {
        $type: 'app.bsky.embed.images',
        images: [{ image: "BLOB_DATA_WOULD_BE_HERE", alt: page.title }] // Not uploading blob for test
      },
      imageDataBase64Length: imageDataB64.length // For verification
    };
    return new Response(JSON.stringify({
      message: 'Test post data prepared successfully.',
      pageTitle: page.title,
      imageUrl: page.imageUrl,
      postData: postData,
    }, null, 2), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error("Error preparing test post data:", error);
    return new Response('Failed to prepare test post data.', { status: 500 });
  }
}


export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === `/post`) {
      return handlePost(env);
    }
    if (url.pathname === '/test-post') {
      return handleTestPost();
    }
    return new Response('Not found', { status: 404 });
  }
};

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
  const headers = new Headers();
  // Comply with Wikimedia User-Agent policy: https://meta.wikimedia.org/wiki/User-Agent_policy
  // It's good practice to make this informative, e.g., "WikiTimelinesBot/1.0 (https://your-worker-url-or-project-page; your-contact-email)"
  // For now, a generic one that still identifies it as a script.
  headers.append('User-Agent', 'WikiTimelinesCloudflareWorker/1.0 (wikitimelines.bsky.social; https://github.com/jsdf/wikitimelines)');

  const res = await fetch(imgurl, { headers: headers });
  if (!res.ok) {
    throw new Error(`Failed to fetch image ${imgurl}: ${res.status} ${res.statusText}`);
  }
  const contentType = res.headers.get('Content-Type') || 'application/octet-stream'; // Default if not present
  const arrayBuffer = await res.arrayBuffer();
  const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
  return { base64, contentType };
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

async function postToBluesky(env, page, imageDataB64, contentType) {
  if (!env.BLUESKY_HANDLE) {
    console.error('BLUESKY_HANDLE secret not set.');
    throw new Error('Bluesky handle (identifier) is not configured as a secret.');
  }
  if (!env.BLUESKY_PASSWORD) {
    console.error('BLUESKY_PASSWORD secret not set.');
    throw new Error('Bluesky password is not configured as a secret.');
  }

  const bsky = new BskyAgent({ service: 'https://bsky.social' });
  await bsky.login({ identifier: env.BLUESKY_HANDLE, password: env.BLUESKY_PASSWORD });
  const imgRes = await bsky.uploadBlob(Uint8Array.from(atob(imageDataB64), c => c.charCodeAt(0)), {
    encoding: contentType, // Use dynamic content type
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

  // if (lastPostDate === today) {
  //   return new Response('Already posted today.', { status: 429 });
  // }

  const page = await getRandomPageWithImage();
  if (!page) {
    return new Response('No timeline image found after several tries.', { status: 500 });
  }

  try {
    const imageInfo = await getImageBase64(page.imageUrl);
    if (!imageInfo || !imageInfo.base64) {
      return new Response('Failed to get image data.', { status: 500 });
    }
    await postToBluesky(env, page, imageInfo.base64, imageInfo.contentType);
    // Store the date of successful post with a TTL of 25 hours
    // 25 hours = 25 * 60 * 60 = 90000 seconds
    await env.WIKITIMELINES_KV.put(`lastPostDate`, today, { expirationTtl: 90000 });
    return new Response('Posted to Bluesky!', { status: 200 });
  } catch (error) {
    console.error("Error posting to Bluesky or saving to KV:", error);
    return new Response('Failed to post to Bluesky or save state.', { status: 500 });
  }
}

async function handlePreview() {
  const page = await getRandomPageWithImage();
  if (!page) {
    return new Response('No timeline image found for test post after several tries.', { status: 500 });
  }

  try {
    const imageInfo = await getImageBase64(page.imageUrl);
    if (!imageInfo || !imageInfo.base64) {
      return new Response('Failed to get image data for preview.', { status: 500 });
    }
    // Simulate what would be posted
    const postData = {
      text: page.title,
      embed: {
        $type: 'app.bsky.embed.images',
        images: [{ image: "BLOB_DATA_WOULD_BE_HERE", alt: page.title }] // Not uploading blob for test
      },
      imageDataBase64Length: imageInfo.base64.length, // For verification
      imageContentType: imageInfo.contentType // Added for more info
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

async function handleIndex() {
  const routes = [
    { path: '/post', description: 'Triggers a post to Bluesky if not already posted today.' },
    { path: '/preview', description: 'Prepares test post data without actually posting.' }
  ];
  return new Response(JSON.stringify(routes, null, 2), {
    headers: { 'Content-Type': 'application/json' },
    status: 200
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/') {
      return handleIndex();
    }
    if (url.pathname === `/post`) {
      return handlePost(env);
    }
    if (url.pathname === '/preview') {
      return handlePreview();
    }
    return new Response('Not found', { status: 404 });
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(handlePost(env));
  }
};

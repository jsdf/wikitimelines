/* Setting things up. */
const path = require("path");
const express = require("express");
const cheerio = require("cheerio");
const httpRequest = require("request");
const url = require("url");
const wiki = require("wikijs").default;
const { BskyAgent } = require('@atproto/api');

const app = express();
app.use(express.static("public"));

/* Be sure to update the .env file with your API keys. See how to get them: https://botwiki.org/tutorials/how-to-create-a-twitter-app */
// Remove Twit and Twitter setup
// Setup Bluesky agent
const bsky = new BskyAgent({ service: 'https://bsky.social' });

// Authenticate Bluesky agent
async function blueskyLogin() {
  if (!bsky.session) {
    await bsky.login({
      identifier: process.env.BLUESKY_HANDLE,
      password: process.env.BLUESKY_PASSWORD
    });
  }
}

// downloads image from an external URL and returns it as base64-encoded data
function getImage(imgurl) {
  return new Promise((resolve, reject) => {
    httpRequest
      .defaults({ encoding: null })
      .get(imgurl, function(error, response, body) {
      if (!error && response.statusCode == 200) {
        var b64content = new Buffer(body).toString("base64");
        resolve(b64content);
      } else {
        reject(
          error ||
            new Error(`getImage failed with status ${response.statusCode} for url '${imgurl}'`)
        );
      }
    });
  });
}

// loads content (eg. wikipedia article html) from external URL and returns it
function getPageContents(pageurl) {
  return new Promise((resolve, reject) => {
    httpRequest.get(pageurl, function(error, response, body) {
      if (!error && response.statusCode == 200) {
        resolve(body);
      } else {
        reject(
          error ||
            new Error(`loading page content failed with status ${response.statusCode} for url '${pageurl}'`)
        );
      }
    });
  });
}

// get timeline image url from a wikipedia article's html
function extractImageUrl(body) {
  const $ = cheerio.load(body);
  const imgurl = $(".timeline-wrapper img").attr("src");
  
  if (imgurl == null) {
    return null;
  }

  const parsedImageUrl = url.parse(imgurl);
  parsedImageUrl.protocol = "https";
  return url.format(parsedImageUrl);
}

// get a list of candidate pages in category from which to choose a random page
async function getPages() {
  const categoryPages = await wiki().pagesInCategory(
    "Category:Articles_which_contain_graphical_timelines"
  );
  
  // filter out some common boring types of article
  return categoryPages.filter(page => !page.match(/hurricane|cyclone|typhoon|season|conference/i));
}

// gets a list of possible articles, then picks a random one and looks for the timeline image
// on that page, retrying a few times if one can't be found on the chosen page
async function getRandomPageImage() {
  const pageNames = await getPages();
  
  let imageUrl;
  let page;
  // not every page will have an image, possibly retry a few times
  for (let i = 0; i < 5; i++) {
    const randomPageName = pageNames[Math.floor(pageNames.length * Math.random())];
  
    const pageInfo = await wiki().page(randomPageName);
    page = pageInfo.raw;

    const pageBody = await getPageContents(page.fullurl);

    imageUrl = extractImageUrl(pageBody);

    if (imageUrl) {
      break;
    }
  }

  if (!imageUrl) {
    throw new Error(`ran out of retries while trying to get a random page image`);
  }

  return {
    title: page.title,
    imageUrl,
  };
}

const TWENTY_FOUR_HOURS_IN_MILLISECONDS = 8.64e+7;

// was the last tweet from the bot account in the last 24 hrs?
async function hasPostedAlreadyTooRecently() {
  await blueskyLogin();
  const feed = await bsky.getAuthorFeed({
    actor: process.env.BLUESKY_HANDLE,
    limit: 1
  });
  const post = feed.data.feed[0];
  if (post && post.post && post.post.indexedAt) {
    const postTime = +new Date(post.post.indexedAt);
    const longAgoEnoughTime = +new Date() - TWENTY_FOUR_HOURS_IN_MILLISECONDS;
    return !(postTime > 0 && postTime < longAgoEnoughTime);
  }
  return false;
}

// decide if the bot should tweet, get the content to tweet, and then post it via the twitter api
async function doPost(resp) {
  if (await hasPostedAlreadyTooRecently()) {
    return resp.send('already posted today');
  }
  const page = await getRandomPageImage();
  const imageDataB64 = await getImage(page.imageUrl);
  await blueskyLogin();
  // Upload image to Bluesky
  const imgRes = await bsky.uploadBlob(Buffer.from(imageDataB64, 'base64'), {
    encoding: 'image/jpeg',
  });
  // Post to Bluesky
  await bsky.post({
    text: page.title,
    embed: {
      $type: 'app.bsky.embed.images',
      images: [{ image: imgRes.data.blob, alt: page.title }]
    }
  });
  resp.sendStatus(200);
}

// external-facing http routes

app.get('/data', async (request, response) => {
  const page = await getRandomPageImage();

  response.json(page);
});

/* You can use uptimerobot.com or a similar site to hit your /BOT_ENDPOINT to wake up your app and make your Twitter bot tweet. */
app.all("/" + process.env.BOT_ENDPOINT, function(request, response) {
  doPost(response).catch(err => {
    response.sendStatus(500);
    console.log("Error!");
    console.log(err);
  });
});

app.all("/" + process.env.TEST_ENDPOINT, (request, resp) => {
  Promise.all([
    getRandomPageImage(),
    hasPostedAlreadyTooRecently(),
    getPages(),
  ])
    .then(([data, hasTweeted, pages]) => {
      resp.send(`
<h1>${data.title}</h1>
<img src="${data.imageUrl}" />
<p>has tweeted today: ${JSON.stringify(hasTweeted)}</p>

<h3>candidate pages</h3>
<pre>${JSON.stringify(pages,null,2)}</pre>
`);
    })
    .catch(err => {
      resp.sendStatus(500);
      console.log("Error!");
      console.log(err);
    });
});

const listener = app.listen(process.env.PORT, function() {
  console.log("Your bot is running on port " + listener.address().port);
});

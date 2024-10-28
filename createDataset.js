const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());  // Enable the stealth plugin

const TWITTER_USERNAME = 'twitter_account_username';  // Replace with target Twitter username
const OUTPUT_FILE = path.join(__dirname, 'tweet_links.txt');
const MAX_TWEETS = 100;
const MAX_SCROLLS = 50;  // Limit the number of scrolls
const MAX_RETRIES = 3;

// Random delay function
function randomDelay(min, max) {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(resolve => setTimeout(resolve, delay));
}

async function scrapeTweets() {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  const tweetLinks = [];
  const twitterURL = `https://twitter.com/${TWITTER_USERNAME}`;

  try {
    await page.goto(twitterURL, { waitUntil: 'networkidle2' });

    let scrolls = 0;
    let retries = 0;

    while (tweetLinks.length < MAX_TWEETS && scrolls < MAX_SCROLLS) {
      try {
        const newTweetLinks = await page.evaluate(() => {
          const links = Array.from(document.querySelectorAll('a[href*="/status/"]'))
            .map(link => link.getAttribute('href'))
            .filter((link, index, arr) => link && arr.indexOf(link) === index)
            .map(link => `https://twitter.com${link}`);
          return links;
        });

        tweetLinks.push(...newTweetLinks);
        tweetLinks.splice(MAX_TWEETS);  // Limit the number of tweets

        await page.evaluate(() => window.scrollBy(0, window.innerHeight));
        scrolls++;

        console.log(`Scroll ${scrolls}: Collected ${tweetLinks.length} tweet links`);
        await randomDelay(2000, 5000);  // Random delay between 2 to 5 seconds
      } catch (error) {
        console.warn('Scrolling error, retrying...', error);
        if (++retries >= MAX_RETRIES) break;
        await randomDelay(3000, 6000);  // Longer delay for retry
      }
    }

    // Write unique tweet links to file
    const uniqueLinks = Array.from(new Set(tweetLinks));
    fs.writeFileSync(OUTPUT_FILE, uniqueLinks.join('\n'), 'utf8');
    console.log(`Saved ${uniqueLinks.length} tweet links to ${OUTPUT_FILE}`);
  } catch (error) {
    console.error('Error during scraping:', error);
  } finally {
    await browser.close();
  }
}

scrapeTweets();

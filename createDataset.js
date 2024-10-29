import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

puppeteer.use(StealthPlugin());  // Enable the stealth plugin

// Recreate __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TWITTER_USERNAME = 'dfinity';  // Replace with target Twitter username
const OUTPUT_FILE = path.join(__dirname, 'tweet_links.txt');
const MAX_TWEETS = 40;
const MAX_SCROLLS = 10;  // Limit the number of scrolls
const MAX_RETRIES = 3;

// Regular expression to match main tweet links only
const tweetLinkRegex = /^https:\/\/twitter\.com\/\w+\/status\/\d+$/;

// Random delay function
function randomDelay(min, max) {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(resolve => setTimeout(resolve, delay));
}

async function scrapeTweets() {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  const tweetLinks = new Set();
  const twitterURL = `https://twitter.com/${TWITTER_USERNAME}`;

  try {
    await page.goto(twitterURL, { waitUntil: 'networkidle2' });

    let scrolls = 0;
    let retries = 0;

    while (tweetLinks.size < MAX_TWEETS && scrolls < MAX_SCROLLS) {
      try {
        const newTweetLinks = await page.evaluate(() => {
          return Array.from(document.querySelectorAll('a[href*="/status/"]'))
            .map(link => link.getAttribute('href'))
            .filter(link => link !== null)
            .map(link => `https://twitter.com${link}`);
        });

        // Add all main tweet links to the set
        newTweetLinks.forEach(link => {
          if (tweetLinkRegex.test(link)) {
            tweetLinks.add(link);
          }
        });

        scrolls++;
        console.log(`Scroll ${scrolls}: Collected ${tweetLinks.size} unique tweet links`);

        // Stop if we've reached the MAX_TWEETS limit
        if (tweetLinks.size >= MAX_TWEETS) break;

        await page.evaluate(() => window.scrollBy(0, window.innerHeight));
        await randomDelay(2000, 5000);  // Random delay between 2 to 5 seconds
      } catch (error) {
        console.warn('Scrolling error, retrying...', error);
        if (++retries >= MAX_RETRIES) break;
        await randomDelay(3000, 6000);  // Longer delay for retry
      }
    }

    // Filter out links to keep only those from the specified username
    const filteredLinks = Array.from(tweetLinks).filter(link => {
      const urlParts = link.split('/');
      const username = urlParts[3];  // Extract username from the URL
      return username === TWITTER_USERNAME;  // Keep only the matching username
    });

    // Write unique tweet links to file
    fs.writeFileSync(OUTPUT_FILE, filteredLinks.join('\n'), 'utf8');
    console.log(`Saved ${filteredLinks.length} unique tweet links to ${OUTPUT_FILE}`);
  } catch (error) {
    console.error('Error during scraping:', error);
  } finally {
    await browser.close();
  }
}

scrapeTweets();

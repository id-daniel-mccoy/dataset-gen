// twitter-pipeline.js
import { Scraper } from "agent-twitter-client";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import ProgressBar from "progress";

dotenv.config();

const CONFIG = {
  targetAccount: "degenspartan",
  paths: {
    tweetUrls: "pipeline/degenspartan-urls.txt",
    tweets: "pipeline/degenspartan-tweets.json",
    finetuning: "pipeline/degenspartan-finetuning.jsonl",
    outputDir: "pipeline"
  },
  twitter: {
    batchSize: 2000, // Increased batch size
    delayBetweenBatches: 1000,
  }
};

function setupDirectories() {
  if (!fs.existsSync(CONFIG.paths.outputDir)) {
    fs.mkdirSync(CONFIG.paths.outputDir, { recursive: true });
    console.log(`Created output directory: ${CONFIG.paths.outputDir}`);
  }
}

function validateEnvironment() {
  const required = ["TWITTER_USERNAME", "TWITTER_PASSWORD"];
  const missing = required.filter(var_ => !process.env[var_]);
  
  if (missing.length > 0) {
    console.error("❌ Missing required environment variables:");
    missing.forEach(var_ => console.error(`   - ${var_}`));
    console.log("\n📝 Create a .env file with YOUR Twitter credentials:");
    console.log(`TWITTER_USERNAME=your_username\nTWITTER_PASSWORD=your_password`);
    process.exit(1);
  }
}

async function scrapeDegenSpartanTweets(scraper) {
  console.log(`\n📱 Collecting tweets from @${CONFIG.targetAccount}...`);
  const tweets = new Set(); // Use Set to automatically handle duplicates
  let cursor = null; // For pagination

  // First get profile info to show total tweets
  try {
    const profile = await scraper.getProfile(CONFIG.targetAccount);
    const totalTweets = profile.tweetsCount;
    console.log(`\nFound ${totalTweets} total tweets for @${CONFIG.targetAccount}`);
    
    const bar = new ProgressBar('[:bar] :current/:total tweets', {
      total: totalTweets,
      width: 30
    });

    while (true) {
      try {
        const tweetsStream = scraper.getTweets(
          CONFIG.targetAccount,
          CONFIG.twitter.batchSize,
          cursor
        );

        let batchCount = 0;
        let lastId = null;

        for await (const tweet of tweetsStream) {
          // Skip retweets
          if (tweet.text.startsWith("RT @")) continue;

          lastId = tweet.id;
          const tweetObj = {
            id: tweet.id,
            text: tweet.text,
            created_at: tweet.createdAt,
            likes: tweet.likeCount,
            retweets: tweet.retweetCount,
            url: `https://twitter.com/${CONFIG.targetAccount}/status/${tweet.id}`
          };

          if (!Array.from(tweets).some(t => t.id === tweet.id)) {
            tweets.add(tweetObj);
            batchCount++;
            bar.tick();
          }
        }

        if (batchCount === 0) {
          console.log("\n📊 Reached end of timeline!");
          break;
        }

        cursor = lastId;
        console.log(`\nCollected ${tweets.size} tweets so far...`);
        
        await new Promise(r => setTimeout(r, CONFIG.twitter.delayBetweenBatches));

      } catch (error) {
        console.warn(`\n⚠️ Error: ${error.message}`);
        if (tweets.size > 0) {
          console.log("Continuing with collected tweets...");
          break;
        }
        throw error;
      }
    }
  } catch (error) {
    console.error("\n❌ Failed to get profile:", error.message);
    process.exit(1);
  }

  // Convert Set to Array and sort by date
  const sortedTweets = Array.from(tweets)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  // Print collection statistics
  console.log(`\n📊 Collection Stats:`);
  console.log(`   - Total tweets collected: ${sortedTweets.length}`);
  if (sortedTweets.length > 0) {
    console.log(`   - Date range: ${sortedTweets[sortedTweets.length-1]?.created_at} to ${sortedTweets[0]?.created_at}`);
  }

  // Save tweets and URLs
  const urls = sortedTweets.map(tweet => tweet.url);
  fs.writeFileSync(CONFIG.paths.tweetUrls, urls.join('\n'));
  fs.writeFileSync(CONFIG.paths.tweets, JSON.stringify(sortedTweets, null, 2));

  console.log(`\n✅ Saved tweets to ${CONFIG.paths.tweets}`);
  console.log(`✅ Saved URLs to ${CONFIG.paths.tweetUrls}`);

  return sortedTweets;
}

function generateFineTuningData(tweets) {
  console.log("\n📄 Generating fine-tuning data...");
  
  try {
    const finetuningData = tweets.map(tweet => ({
      text: tweet.text,
      metadata: {
        id: tweet.id,
        created_at: tweet.created_at,
        engagement: {
          likes: tweet.likes,
          retweets: tweet.retweets
        },
        url: tweet.url
      }
    }));
    
    const jsonlContent = finetuningData.map(data => JSON.stringify(data)).join('\n');
    fs.writeFileSync(CONFIG.paths.finetuning, jsonlContent);
    
    console.log(`\n✅ Generated fine-tuning data in ${CONFIG.paths.finetuning}`);
    console.log(`   Total entries: ${finetuningData.length}`);
  } catch (error) {
    console.error("❌ Error generating fine-tuning data:", error.message);
    throw error;
  }
}

async function runPipeline() {
  console.log(`🚀 Starting Twitter Pipeline for @${CONFIG.targetAccount}\n`);
  
  try {
    setupDirectories();
    validateEnvironment();
    
    const scraper = new Scraper();
    console.log("🔑 Logging in with your credentials...");
    await scraper.login(process.env.TWITTER_USERNAME, process.env.TWITTER_PASSWORD);
    
    if (await scraper.isLoggedIn()) {
      console.log("✅ Successfully logged into Twitter");
      
      const tweets = await scrapeDegenSpartanTweets(scraper);
      generateFineTuningData(tweets);
      
      await scraper.logout();
      console.log("\n🎉 Pipeline completed successfully!");
    } else {
      throw new Error("Failed to log into Twitter");
    }
  } catch (error) {
    console.error("\n❌ Pipeline failed:", error.message);
    process.exit(1);
  }
}

runPipeline();
import chromium from '@sparticuz/chromium';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import type { FacebookTrend } from './types';

const DEFAULT_PAGE_URLS = [
  'https://facebook.com/MwebantuZM',
  'https://facebook.com/ZambianWatchdog',
  'https://facebook.com/DiggersNewsZambia',
];

const POSTS_PER_PAGE = 5;
const MIN_COMMENTS = 500;
const MIN_SHARES = 100;
const TOP_TRENDS = 10;

const PAGE_TIMEOUT_MS = 45000;
const NAVIGATION_TIMEOUT_MS = 30000;

function getPageUrls(): string[] {
  const env = process.env.FACEBOOK_PAGE_URLS?.trim();
  if (env) {
    return env.split(',').map((u) => u.trim()).filter(Boolean);
  }
  return DEFAULT_PAGE_URLS;
}

async function scrapePagePosts(
  page: Page,
  pageUrl: string,
  limit: number
): Promise<{ text: string; comments: number; shares: number }[]> {
  await page.goto(pageUrl, {
    waitUntil: 'domcontentloaded',
    timeout: NAVIGATION_TIMEOUT_MS,
  });

  await new Promise((r) => setTimeout(r, 3000));

  const rawPosts = await page.evaluate((maxPosts) => {
    const posts: { text: string; comments: number; shares: number }[] = [];
    const articles = document.querySelectorAll('[role="article"]');

    articles.forEach((article) => {
      if (posts.length >= maxPosts) return;

      const textEl =
        article.querySelector('[data-ad-preview="message"]') ||
        article.querySelector('div[dir="auto"]');
      const text = (textEl?.textContent || '').trim().slice(0, 500);
      if (!text || text.length < 20) return;

      let comments = 0;
      let shares = 0;
      const spans = article.querySelectorAll('span');
      spans.forEach((span) => {
        const t = (span.textContent || '').toLowerCase();
        const numMatch = t.match(/([\d.,]+)\s*([km])?/);
        if (!numMatch) return;

        let n = parseFloat(numMatch[1].replace(/,/g, ''));
        if (Number.isNaN(n)) return;
        const suffix = numMatch[2];
        if (suffix === 'k') n *= 1000;
        if (suffix === 'm') n *= 1_000_000;
        n = Math.round(n);

        if (t.includes('comment')) comments = Math.max(comments, n);
        else if (t.includes('share')) shares = Math.max(shares, n);
      });

      posts.push({ text, comments, shares });
    });

    return posts;
  }, limit);

  return rawPosts;
}

async function launchBrowser(): Promise<Browser> {
  const isLocal =
    process.env.FUNCTIONS_EMULATOR === 'true' || !process.env.K_SERVICE;

  if (isLocal && process.env.CHROME_EXECUTABLE_PATH) {
    return puppeteer.launch({
      executablePath: process.env.CHROME_EXECUTABLE_PATH,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  }

  return puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
  });
}

/**
 * Scrapes public Zambian Facebook pages for high-engagement trending topics.
 * Returns [] on failure so the pipeline can continue with RSS/Twitter-only input.
 */
export async function getTrendingFromFacebook(): Promise<FacebookTrend[]> {
  const pageUrls = getPageUrls();
  let browser: Browser | null = null;

  try {
    browser = await launchBrowser();
    const page = await browser.newPage();
    page.setDefaultTimeout(PAGE_TIMEOUT_MS);
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    const trendingTopics: FacebookTrend[] = [];

    for (const pageUrl of pageUrls) {
      try {
        const posts = await scrapePagePosts(page, pageUrl, POSTS_PER_PAGE);

        for (const post of posts) {
          if (post.comments > MIN_COMMENTS || post.shares > MIN_SHARES) {
            trendingTopics.push({
              topic: post.text.substring(0, 200),
              engagement: post.comments + post.shares,
              source: pageUrl,
              comments: post.comments,
              shares: post.shares,
            });
          }
        }

        console.log(
          JSON.stringify({
            stage: 'facebookScraper',
            pageUrl,
            ok: true,
            postsScraped: posts.length,
            qualifying: trendingTopics.length,
          })
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(
          JSON.stringify({
            stage: 'facebookScraper',
            pageUrl,
            ok: false,
            error: msg,
          })
        );
      }
    }

    return trendingTopics
      .sort((a, b) => b.engagement - a.engagement)
      .slice(0, TOP_TRENDS);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(
      JSON.stringify({
        stage: 'facebookScraper',
        ok: false,
        error: msg,
        hint: 'Set CHROME_EXECUTABLE_PATH for local dev or rely on RSS/Twitter pipeline',
      })
    );
    return [];
  } finally {
    if (browser) {
      await browser.close().catch(() => undefined);
    }
  }
}

/** Alias used by the cron pipeline */
export const fetchTopFacebookPosts = getTrendingFromFacebook;

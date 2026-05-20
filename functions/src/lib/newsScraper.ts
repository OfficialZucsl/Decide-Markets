import Parser from 'rss-parser';
import type { NewsArticle } from './types';

const HOURS_24_MS = 24 * 60 * 60 * 1000;

interface FeedConfig {
  source: string;
  url: string;
}

const parser = new Parser({
  timeout: 15000,
  headers: {
    'User-Agent': 'DecideMarkets/1.0 (Zambia news aggregator)',
  },
});

function getFeedConfigs(): FeedConfig[] {
  const feeds: FeedConfig[] = [
    { source: 'Times of Zambia', url: 'https://www.times.co.zm/?feed=rss2' },
    {
      source: 'Diggers News',
      url: process.env.DIGGERS_RSS_URL || 'https://diggers.news/feed',
    },
    {
      source: 'Zambia Daily Mail',
      url: 'https://www.daily-mail.co.zm/feed/',
    },
  ];

  const monitorUrl = process.env.MONITOR_RSS_URL?.trim();
  if (monitorUrl) {
    feeds.push({ source: 'Monitor', url: monitorUrl });
  }

  return feeds;
}

function parsePublishedAt(item: Parser.Item): Date | null {
  const raw =
    item.pubDate ||
    item.isoDate ||
    (item as { 'dc:date'?: string })['dc:date'] ||
    (item as { published?: string }).published;

  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function fetchFeed(feed: FeedConfig): Promise<NewsArticle[]> {
  const parsed = await parser.parseURL(feed.url);
  const cutoff = Date.now() - HOURS_24_MS;
  const articles: NewsArticle[] = [];

  for (const item of parsed.items) {
    const headline = (item.title || '').trim();
    const url = (item.link || item.guid || '').trim();
    if (!headline || !url) continue;

    const published = parsePublishedAt(item);
    if (!published || published.getTime() < cutoff) continue;

    articles.push({
      headline,
      source: feed.source,
      url,
      publishedAt: published.toISOString(),
    });
  }

  return articles;
}

/**
 * Scrapes configured Zambian news RSS feeds and returns articles from the last 24 hours.
 */
export async function fetchRecentNews(): Promise<NewsArticle[]> {
  const feeds = getFeedConfigs();
  const results = await Promise.allSettled(feeds.map((f) => fetchFeed(f)));

  const articles: NewsArticle[] = [];
  const errors: string[] = [];

  results.forEach((result, i) => {
    const feed = feeds[i];
    if (result.status === 'fulfilled') {
      articles.push(...result.value);
      console.log(
        JSON.stringify({
          stage: 'newsScraper',
          feed: feed.source,
          ok: true,
          count: result.value.length,
        })
      );
    } else {
      const msg =
        result.reason instanceof Error
          ? result.reason.message
          : String(result.reason);
      errors.push(`${feed.source}: ${msg}`);
      console.warn(
        JSON.stringify({
          stage: 'newsScraper',
          feed: feed.source,
          ok: false,
          error: msg,
        })
      );
    }
  });

  if (errors.length === feeds.length) {
    throw new Error(`All RSS feeds failed: ${errors.join('; ')}`);
  }

  const seen = new Set<string>();
  const deduped = articles.filter((a) => {
    const key = a.url.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  deduped.sort(
    (a, b) =>
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );

  return deduped;
}

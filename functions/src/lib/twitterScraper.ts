import type { TwitterTrend } from './types';

const DEFAULT_HASHTAGS = [
  '#Zambia',
  '#Lusaka',
  '#ZambiaNews',
  '#ZambianEconomy',
];

const TWITTER_SEARCH_URL =
  'https://api.twitter.com/2/tweets/search/recent';
const TOP_TRENDS = 10;

interface TwitterApiTweet {
  id: string;
  text: string;
  public_metrics?: {
    retweet_count: number;
    reply_count: number;
    like_count: number;
    quote_count: number;
  };
}

interface TwitterApiResponse {
  data?: TwitterApiTweet[];
  errors?: { detail?: string }[];
}

function getHashtags(): string[] {
  const env = process.env.TWITTER_SEARCH_HASHTAGS?.trim();
  if (env) {
    return env.split(',').map((h) => h.trim()).filter(Boolean);
  }
  return DEFAULT_HASHTAGS;
}

function buildSearchQuery(hashtags: string[]): string {
  const tagQuery = hashtags
    .map((h) => (h.startsWith('#') ? h : `#${h}`))
    .join(' OR ');
  return `(${tagQuery}) -is:retweet lang:en`;
}

function tweetEngagement(tweet: TwitterApiTweet): number {
  const m = tweet.public_metrics;
  if (!m) return 0;
  return m.reply_count + m.retweet_count + m.like_count + m.quote_count;
}

/**
 * Fetches recent Zambia-related tweets via Twitter API v2 (Bearer token).
 * Returns [] if TWITTER_BEARER_TOKEN is unset or the API call fails.
 */
export async function getTrendingFromTwitter(): Promise<TwitterTrend[]> {
  const bearerToken = process.env.TWITTER_BEARER_TOKEN?.trim();
  if (!bearerToken) {
    console.warn(
      JSON.stringify({
        stage: 'twitterScraper',
        ok: false,
        error: 'TWITTER_BEARER_TOKEN not configured — skipping Twitter trends',
      })
    );
    return [];
  }

  const hashtags = getHashtags();
  const query = buildSearchQuery(hashtags);
  const params = new URLSearchParams({
    query,
    max_results: '10',
    'tweet.fields': 'public_metrics,created_at,lang',
  });

  try {
    const res = await fetch(`${TWITTER_SEARCH_URL}?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        'User-Agent': 'DecideMarkets/1.0',
      },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Twitter API ${res.status}: ${body.slice(0, 200)}`);
    }

    const json = (await res.json()) as TwitterApiResponse;
    if (json.errors?.length) {
      throw new Error(json.errors.map((e) => e.detail).join('; '));
    }

    const tweets = json.data || [];
    const trends: TwitterTrend[] = tweets.map((tweet) => ({
      topic: tweet.text.trim().slice(0, 280),
      engagement: tweetEngagement(tweet),
      source: hashtags.join(', '),
      tweetId: tweet.id,
    }));

    const sorted = trends
      .filter((t) => t.topic.length >= 10)
      .sort((a, b) => b.engagement - a.engagement)
      .slice(0, TOP_TRENDS);

    console.log(
      JSON.stringify({
        stage: 'twitterScraper',
        ok: true,
        count: sorted.length,
        query,
      })
    );

    return sorted;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(
      JSON.stringify({
        stage: 'twitterScraper',
        ok: false,
        error: msg,
      })
    );
    return [];
  }
}

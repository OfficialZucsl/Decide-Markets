import { onRequest } from 'firebase-functions/v2/https';
import { fetchRecentNews } from './lib/newsScraper';
import { getTrendingFromFacebook } from './lib/facebookScraper';
import { getTrendingFromTwitter } from './lib/twitterScraper';
import { generateMarkets } from './lib/marketGenerator';
import { seedMarketsToFirestore } from './lib/firestoreSeed';
import type { NewsArticle } from './lib/types';
import type { FacebookTrend } from './lib/types';
import type { TwitterTrend } from './lib/types';
import type { GeneratedMarket } from './lib/types';

const CRON_SECRET = process.env.CRON_SECRET;

function logStage(
  stage: string,
  ok: boolean,
  durationMs: number,
  detail?: Record<string, unknown>
) {
  console.log(
    JSON.stringify({
      stage,
      ok,
      durationMs,
      ...detail,
    })
  );
}

function authorizeRequest(authHeader: string | undefined): boolean {
  if (!CRON_SECRET) {
    console.warn(
      JSON.stringify({
        stage: 'auth',
        ok: false,
        error: 'CRON_SECRET not set — rejecting request',
      })
    );
    return false;
  }
  const expected = `Bearer ${CRON_SECRET}`;
  return authHeader === expected;
}

async function runPipeline(): Promise<{
  ok: boolean;
  createdCount: number;
  skippedDuplicates: number;
  errors: string[];
  newsCount: number;
  facebookCount: number;
  twitterCount: number;
  generatedCount: number;
}> {
  const errors: string[] = [];
  let news: NewsArticle[] = [];
  let facebook: FacebookTrend[] = [];
  let twitter: TwitterTrend[] = [];
  let generated: GeneratedMarket[] = [];

  const tNews = Date.now();
  try {
    news = await fetchRecentNews();
    logStage('newsScraper', true, Date.now() - tNews, { count: news.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`news: ${msg}`);
    logStage('newsScraper', false, Date.now() - tNews, { error: msg });
  }

  const tFb = Date.now();
  try {
    facebook = await getTrendingFromFacebook();
    logStage('facebookScraper', true, Date.now() - tFb, {
      count: facebook.length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`facebook: ${msg}`);
    logStage('facebookScraper', false, Date.now() - tFb, { error: msg });
  }

  const tTw = Date.now();
  try {
    twitter = await getTrendingFromTwitter();
    logStage('twitterScraper', true, Date.now() - tTw, {
      count: twitter.length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`twitter: ${msg}`);
    logStage('twitterScraper', false, Date.now() - tTw, { error: msg });
  }

  if (news.length === 0 && facebook.length === 0 && twitter.length === 0) {
    throw new Error(
      'Pipeline aborted: no news, Facebook, or Twitter content available'
    );
  }

  const tGen = Date.now();
  try {
    generated = await generateMarkets(news, facebook, twitter);
    logStage('marketGenerator', true, Date.now() - tGen, {
      count: generated.length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`generate: ${msg}`);
    logStage('marketGenerator', false, Date.now() - tGen, { error: msg });
    throw new Error(`Market generation failed: ${msg}`);
  }

  if (generated.length === 0) {
    return {
      ok: errors.length === 0,
      createdCount: 0,
      skippedDuplicates: 0,
      errors: [...errors, 'generate: no valid markets produced'],
      newsCount: news.length,
      facebookCount: facebook.length,
      twitterCount: twitter.length,
      generatedCount: 0,
    };
  }

  const tSeed = Date.now();
  let createdCount = 0;
  let skippedDuplicates = 0;
  try {
    const result = await seedMarketsToFirestore(generated);
    createdCount = result.createdCount;
    skippedDuplicates = result.skippedDuplicates;
    logStage('firestoreSeed', true, Date.now() - tSeed, {
      createdCount,
      skippedDuplicates,
      marketIds: result.marketIds,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`firestore: ${msg}`);
    logStage('firestoreSeed', false, Date.now() - tSeed, { error: msg });
    throw new Error(`Firestore seed failed: ${msg}`);
  }

  return {
    ok: errors.length === 0 || createdCount > 0,
    createdCount,
    skippedDuplicates,
    errors,
    newsCount: news.length,
    facebookCount: facebook.length,
    twitterCount: twitter.length,
    generatedCount: generated.length,
  };
}

export const seedMarkets = onRequest(
  {
    timeoutSeconds: 540,
    memory: '2GiB',
    region: process.env.FUNCTION_REGION || 'europe-west1',
    invoker: 'public',
  },
  async (req, res) => {
    if (req.method !== 'POST' && req.method !== 'GET') {
      res.status(405).json({ ok: false, error: 'Method not allowed' });
      return;
    }

    if (!authorizeRequest(req.headers.authorization)) {
      res.status(401).json({ ok: false, error: 'Unauthorized' });
      return;
    }

    const started = Date.now();
    try {
      const result = await runPipeline();
      const status =
        result.createdCount > 0 || result.errors.length === 0 ? 200 : 207;
      res.status(status).json({
        ok: result.ok,
        createdCount: result.createdCount,
        skippedDuplicates: result.skippedDuplicates,
        newsCount: result.newsCount,
        facebookCount: result.facebookCount,
        twitterCount: result.twitterCount,
        generatedCount: result.generatedCount,
        errors: result.errors,
        durationMs: Date.now() - started,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        JSON.stringify({
          stage: 'seedMarkets',
          ok: false,
          error: msg,
          durationMs: Date.now() - started,
        })
      );
      res.status(500).json({
        ok: false,
        createdCount: 0,
        errors: [msg],
        durationMs: Date.now() - started,
      });
    }
  }
);

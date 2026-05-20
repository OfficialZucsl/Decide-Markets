import { GoogleGenAI, Type } from '@google/genai';
import type {
  FacebookTrend,
  GeneratedMarket,
  NewsArticle,
  TwitterTrend,
} from './types';

const MAX_MARKETS = 5;
const MIN_MARKETS = 3;
const TRUNCATE_HEADLINE = 200;
const TRUNCATE_SOCIAL = 200;

const MARKET_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      decision: { type: Type.STRING },
      kpi: { type: Type.STRING },
      question: { type: Type.STRING },
      category: { type: Type.STRING },
      institution: { type: Type.STRING },
      yesPoints: { type: Type.NUMBER },
      noPoints: { type: Type.NUMBER },
      status: { type: Type.STRING },
    },
    required: [
      'decision',
      'kpi',
      'question',
      'category',
      'institution',
      'yesPoints',
      'noPoints',
      'status',
    ],
  },
};

function validateMarket(raw: unknown): GeneratedMarket | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;

  const decision = String(m.decision || '').trim();
  const kpi = String(m.kpi || '').trim();
  const question = String(m.question || '').trim();
  const category = String(m.category || '').trim();
  const institution = String(m.institution || '').trim();

  if (!decision || !kpi || !question || !category || !institution) {
    return null;
  }
  if (question.length < 30) return null;

  return {
    decision,
    kpi,
    question,
    category,
    institution,
    yesPoints: 5000,
    noPoints: 5000,
    status: 'open',
  };
}

function buildPrompt(
  news: NewsArticle[],
  facebook: FacebookTrend[],
  twitter: TwitterTrend[]
): string {
  const newsBlock = news
    .slice(0, 30)
    .map(
      (n, i) =>
        `${i + 1}. [${n.source}] ${n.headline.slice(0, TRUNCATE_HEADLINE)} (${n.url})`
    )
    .join('\n');

  const fbBlock =
    facebook.length > 0
      ? facebook
          .map(
            (t, i) =>
              `${i + 1}. - ${t.topic} (${t.engagement} engagements, ${t.comments} comments / ${t.shares} shares) [${t.source}]`
          )
          .join('\n')
      : '(no Facebook trends available)';

  const twitterBlock =
    twitter.length > 0
      ? twitter
          .map(
            (t, i) =>
              `${i + 1}. - ${t.topic.slice(0, TRUNCATE_SOCIAL)} (${t.engagement} engagements) [${t.source}]`
          )
          .join('\n')
      : '(no Twitter trends available)';

  return `You are a Decision Market curator for Zambia (Decide Markets).

Convert the following inputs into ${MIN_MARKETS} to ${MAX_MARKETS} decision markets.

SOURCES:
- NEWS: verified headlines (last 24h)
- FACEBOOK: local Zambian voices (high engagement on public pages)
- TWITTER: broader reach (#Zambia, #Lusaka, #ZambiaNews, #ZambianEconomy)

For EACH topic that contains a measurable policy decision or prediction, create a market:

{
  "decision": "The policy or action being proposed",
  "kpi": "The measurable outcome",
  "question": "If [decision], will [kpi] by [deadline]?",
  "category": "Economy|Finance|Governance|Politics|Mining|Agriculture|Public Services|ICT|Health|Legal",
  "institution": "Which institution would verify this",
  "yesPoints": 5000,
  "noPoints": 5000,
  "status": "open"
}

REQUIREMENTS:
- Only return topics with CLEAR, MEASURABLE outcomes
- Ignore insults, rumors, celebrity gossip, or vague complaints
- One market per distinct policy thread (no duplicates)
- Include a concrete deadline in each question

Today's date: ${new Date().toISOString().split('T')[0]}

NEWS (last 24h):
${newsBlock || '(no recent headlines)'}

FACEBOOK TRENDS (local Zambian voices, by engagement):
${fbBlock}

TWITTER TRENDS (broader reach):
${twitterBlock}

Return ONLY a JSON array of market objects.`;
}

/**
 * Uses Gemini to generate 3-5 decision markets from news + Facebook + Twitter trends.
 */
export async function generateMarkets(
  news: NewsArticle[],
  facebook: FacebookTrend[],
  twitter: TwitterTrend[] = []
): Promise<GeneratedMarket[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  if (news.length === 0 && facebook.length === 0 && twitter.length === 0) {
    throw new Error('No input content for market generation');
  }

  const ai = new GoogleGenAI({ apiKey });
  const prompt = buildPrompt(news, facebook, twitter);

  const response = await ai.models.generateContent({
    model: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
    contents: prompt,
    config: {
      systemInstruction:
        'You create Zambian policy decision markets with measurable KPIs and verifiable outcomes. Output valid JSON only. Filter out non-policy noise.',
      responseMimeType: 'application/json',
      responseSchema: MARKET_SCHEMA,
    },
  });

  const text = response.text?.trim();
  if (!text) {
    throw new Error('Gemini returned empty response');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`Failed to parse Gemini JSON: ${text.slice(0, 200)}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error('Gemini response is not an array');
  }

  const markets: GeneratedMarket[] = [];
  for (const item of parsed) {
    const validated = validateMarket(item);
    if (validated) markets.push(validated);
  }

  return markets.slice(0, MAX_MARKETS);
}

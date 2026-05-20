export interface NewsArticle {
  headline: string;
  source: string;
  url: string;
  publishedAt: string;
}

/** Local Zambian Facebook voice — high-engagement public page posts */
export interface FacebookTrend {
  topic: string;
  engagement: number;
  source: string;
  comments: number;
  shares: number;
}

/** Broader reach via Twitter/X API v2 recent search */
export interface TwitterTrend {
  topic: string;
  engagement: number;
  source: string;
  tweetId: string;
}

/** @deprecated Use FacebookTrend — kept for internal scrape mapping */
export interface FacebookPost {
  text: string;
  engagement: number;
  pageUrl: string;
  comments: number;
  shares: number;
}

export interface GeneratedMarket {
  decision: string;
  kpi: string;
  question: string;
  category: string;
  institution: string;
  yesPoints: number;
  noPoints: number;
  status: 'open';
}

export interface SeedResult {
  createdCount: number;
  skippedDuplicates: number;
  marketIds: string[];
}

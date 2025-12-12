export type SourceType = 'rss' | 'x';

export type FeedItemStatus = 'inbox' | 'saved' | 'bookmarked' | 'archived';

export type Theme = 'light' | 'dark' | 'sepia' | 'hn';

export interface FeedItem {
  id: string;
  source: string;
  sourceType: SourceType;
  title: string;
  url: string;
  publishedAt: string;
  contentSnippet: string;
  aiSummary?: string;
  aiInsightfulReply?: string;
  aiInvestorAnalysis?: string;
  aiFounderImplications?: string;
  status: FeedItemStatus;
  fullContent?: string;
}

export interface Feed {
  id: string;
  name: string; // Display name (can be renamed by user)
  url: string;
  sourceType: SourceType;
  rssTitle?: string; // Original RSS feed title (used for matching items, never changes)
}

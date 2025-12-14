export type SourceType = 'rss' | 'x';

export type FeedItemStatus = 'inbox' | 'saved' | 'bookmarked' | 'archived';

export type Theme = 'light' | 'dark' | 'sepia' | 'hn';

export interface FeedItem {
  id: string;
  feedId?: string; // Feed UUID (from database)
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
  updatedAt?: string; // Timestamp when item was last updated
}

export interface Feed {
  id: string;
  name: string; // Display name (can be renamed by user)
  url: string;
  sourceType: SourceType;
  rssTitle?: string; // Original RSS feed title (used for matching items, never changes)
}

export type AnnotationType = 'highlight' | 'note';

export interface Annotation {
  id: string;
  feedItemId: string; // Reference to the article
  feedId: string; // Reference to the feed
  type: AnnotationType;
  content: string; // Highlighted text or note body
  createdAt: string;
  // Article metadata for display
  articleTitle?: string;
  feedName?: string;
}

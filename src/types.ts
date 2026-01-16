export type SourceType = 'rss' | 'x' | 'custom' | 'link';

export type ReadingOrder = 'next' | 'later' | 'someday';

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
  // Reading order subcategory for items in the Later queue
  // Only applies when status === 'saved'
  readingOrder?: ReadingOrder | null;
  fullContent?: string;
  updatedAt?: string; // Timestamp when item was last updated
  // Daily brief fields
  audioBriefUrl?: string; // URL to generated audio file
  audioBriefGeneratedAt?: string; // Timestamp when audio was generated
  briefOrder?: number; // Order in daily brief (for sorting)
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

// ============================================================================
// DAILY BRIEF TYPES
// ============================================================================

export type BriefRunStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface BriefRun {
  id: string;
  date: string; // YYYY-MM-DD format
  status: BriefRunStatus;
  startedAt?: string;
  completedAt?: string;
  errorMessage?: string;
  errorDetails?: Record<string, unknown>;
  metadata?: {
    articleCount?: number;
    audioUrl?: string;
    compliment?: string;
    totalDuration?: number;
    [key: string]: unknown;
  };
  createdAt: string;
  updatedAt: string;
}

export interface BriefMetadata {
  date: string;
  articleCount: number;
  feeds: string[];
  runStatus: BriefRunStatus | null;
  runMetadata: Record<string, unknown> | null;
}

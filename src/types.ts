export type SourceType = 'rss' | 'x' | 'custom';

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
// WORKFLOW TYPES
// ============================================================================

export type WorkflowStatus = 'pending' | 'running' | 'completed' | 'failed' | 'partial' | 'cancelled';
export type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
export type StepType = 'llm' | 'tool' | 'transform' | 'gate';

export interface Workflow {
  id: string;
  name: string;
  slug: string;
  definitionJson: WorkflowDefinition;
  version: number;
  env: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  steps: StepDefinition[];
}

export interface StepDefinition {
  id: string;
  name: string;
  type: StepType;
  model?: string; // Model name if LLM step
  promptSystem?: string; // System prompt template if LLM step
  promptUser?: string; // User prompt template if LLM step
  toolName?: string; // Tool name if tool step
  inputMapping?: Record<string, string>; // JSONPath or dot notation mapping
  outputSchema?: Record<string, unknown>; // Zod schema as JSON
}

export interface WorkflowRun {
  id: string;
  workflowId: string;
  userId?: string;
  inputJson: Record<string, unknown>;
  outputJson?: Record<string, unknown>;
  status: WorkflowStatus;
  costEstimate?: number;
  actualCost?: number;
  env: string;
  startedAt?: string;
  finishedAt?: string;
  createdAt: string;
}

export interface WorkflowRunStep {
  id: string;
  runId: string;
  stepId: string;
  stepName: string;
  stepType: StepType;
  model?: string;
  promptSystem?: string;
  promptUser?: string;
  inputJson?: Record<string, unknown>;
  outputJson?: Record<string, unknown>;
  toolTraceJson?: Record<string, unknown>;
  status: StepStatus;
  errorMessage?: string;
  tokenCount?: number;
  cost?: number;
  env: string;
  startedAt?: string;
  finishedAt?: string;
  createdAt: string;
}

export interface WorkflowEval {
  id: string;
  workflowId: string;
  name: string;
  casesJson: EvalCase[];
  env: string;
  createdAt: string;
}

export interface EvalCase {
  id: string;
  name: string;
  input: Record<string, unknown>;
  expectedOutput?: Record<string, unknown>;
  constraints?: EvalConstraints;
}

export interface EvalConstraints {
  minFeeds?: number;
  maxFeeds?: number;
  mustIncludeDomains?: string[];
  freshnessDays?: number;
  minScore?: number;
}

export interface WorkflowEvalRun {
  id: string;
  evalId: string;
  runId?: string;
  resultsJson: EvalResults;
  score?: number;
  passed?: boolean;
  env: string;
  createdAt: string;
}

export interface EvalResults {
  caseResults: EvalCaseResult[];
  overallScore: number;
  passed: boolean;
  errors: string[];
}

export interface EvalCaseResult {
  caseId: string;
  passed: boolean;
  score: number;
  errors: string[];
  actualOutput?: Record<string, unknown>;
}

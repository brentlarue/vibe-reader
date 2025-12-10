import { FeedItem } from '../types';

/**
 * Generates an AI summary for a feed item using the backend API
 * @param item The feed item to summarize
 * @returns A summary, or "Summary not available." on error
 */
export async function summarizeItem(item: FeedItem): Promise<string> {
  try {
    // Combine title and content for summarization
    // Always include title if available, and content if available
    const textParts = [item.title];
    
    // Add content if available (prefer fullContent, fallback to contentSnippet)
    if (item.fullContent && item.fullContent.trim()) {
      textParts.push(item.fullContent);
    } else if (item.contentSnippet && item.contentSnippet.trim()) {
      textParts.push(item.contentSnippet);
    }
    
    const textToSummarize = textParts.filter(Boolean).join('\n\n');

    // Ensure we have at least a title to summarize
    if (!textToSummarize.trim() || !item.title || !item.title.trim()) {
      throw new Error('No title or content available to summarize');
    }

    // Use /api endpoint which will be proxied to backend server
    const response = await fetch('/api/summarize', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: textToSummarize,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`API error: ${response.status} ${errorData.message || response.statusText}`);
    }

    const data = await response.json();
    const summary = data.summary?.trim();

    if (!summary) {
      throw new Error('No summary returned from API');
    }

    // Debug: Log the full summary received from API
    console.log('AI summary received from API - Length (characters):', summary.length);
    console.log('AI summary full text:', summary);

    return summary;
  } catch (error) {
    console.error('Error generating AI summary:', error);
    // Log more details about the error
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    }
    // Check if it's a network error
    if (error instanceof TypeError && error.message.includes('fetch')) {
      console.error('Network error: Backend server may not be running. Make sure to start the server with: npm run dev:server');
    }
    throw error; // Re-throw to let the caller handle it
  }
}


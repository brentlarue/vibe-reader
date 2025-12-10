import { FeedItem } from '../types';

export type AIFeatureType = 'insightful-reply' | 'investor-analysis' | 'founder-implications';

/**
 * Generates AI content based on feature type
 */
export async function generateAIFeature(item: FeedItem, featureType: AIFeatureType): Promise<string> {
  try {
    // Combine title and content
    const textParts = [item.title];
    
    // Add content if available (prefer fullContent, fallback to contentSnippet)
    if (item.fullContent && item.fullContent.trim()) {
      textParts.push(item.fullContent);
    } else if (item.contentSnippet && item.contentSnippet.trim()) {
      textParts.push(item.contentSnippet);
    }
    
    const articleText = textParts.filter(Boolean).join('\n\n');

    // Ensure we have at least a title
    if (!articleText.trim() || !item.title || !item.title.trim()) {
      throw new Error('No title or content available');
    }

    // Use /api endpoint which will be proxied to backend server
    const response = await fetch('/api/ai-feature', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: articleText,
        featureType: featureType,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`API error: ${response.status} ${errorData.message || response.statusText}`);
    }

    const data = await response.json();
    const result = data.result?.trim();

    if (!result) {
      throw new Error('No result returned from API');
    }

    return result;
  } catch (error) {
    console.error(`Error generating ${featureType}:`, error);
    if (error instanceof TypeError && error.message.includes('fetch')) {
      console.error('Network error: Backend server may not be running. Make sure to start the server with: npm run dev:server');
    }
    throw error;
  }
}


import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .env in project root
dotenv.config({ path: join(__dirname, '..', '.env') });

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Summarize endpoint
app.post('/api/summarize', async (req, res) => {
  try {
    const { title, contentSnippet, fullContent, url } = req.body;

    if (!title && !contentSnippet && !fullContent) {
      return res.status(400).json({ error: 'title, contentSnippet, or fullContent is required' });
    }

    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      console.error('OpenAI API key not found in environment variables');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    // Prepare the content to summarize - prefer fullContent, fallback to contentSnippet
    const contentToSummarize = [
      title,
      fullContent || contentSnippet,
    ]
      .filter(Boolean)
      .join('\n\n');

    // Limit content length to avoid token limits (approximately 4000 chars)
    const truncatedContent = contentToSummarize.substring(0, 4000);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant that creates concise, informative summaries. Create a brief summary of the provided content. The summary must be maximum 280 characters. Focus on the key points and main information.',
          },
          {
            role: 'user',
            content: `Please summarize the following article in maximum 280 characters:\n\n${truncatedContent}`,
          },
        ],
        max_tokens: 150,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('OpenAI API error:', response.status, errorData);
      throw new Error(`OpenAI API error: ${response.status} ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    let summary = data.choices?.[0]?.message?.content?.trim();

    if (!summary) {
      throw new Error('No summary returned from API');
    }

    // Ensure summary is max 280 characters
    if (summary.length > 280) {
      summary = summary.substring(0, 277) + '...';
    }

    return res.json({ summary });
  } catch (error) {
    console.error('Error generating summary:', error);
    return res.status(500).json({ error: 'Failed to generate summary', message: error.message });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});


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
    const { text } = req.body;

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({ error: 'text is required' });
    }

    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      console.error('OpenAI API key not found in environment variables');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    // Limit content length to avoid token limits (approximately 4000 chars)
    const truncatedContent = text.substring(0, 4000);

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
            content: 'You are a helpful assistant that creates concise, informative summaries. Write a clear and complete summary that captures the key points of the article. Do not use ellipses (...), truncation markers, or indicate that the summary is incomplete. Provide the full summary text.',
          },
          {
            role: 'user',
            content: `Summarize the following article. Write a complete summary that captures the main points:\n\n${truncatedContent}`,
          },
        ],
        max_tokens: 500,
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

    // Remove any character count mentions or metadata from the summary
    // Remove patterns like "(280 chars)", "[280 characters]", etc.
    summary = summary.replace(/\s*\(?\d+\s*(char|characters?|chars?)\)?/gi, '').trim();
    summary = summary.replace(/\s*\[\d+\s*(char|characters?|chars?)\]/gi, '').trim();
    
    // Remove trailing ellipses if LLM added them despite instructions
    summary = summary.replace(/\.{2,}$/, '').trim();
    // Remove any ellipses in the middle or at the end
    summary = summary.replace(/\s*\.{3,}\s*/g, ' ').trim();

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


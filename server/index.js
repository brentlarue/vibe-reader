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
            content: 'You are a helpful assistant that creates concise, informative summaries. CRITICAL REQUIREMENTS: 1) Every summary MUST be COMPLETE and FINISHED - never truncate, never cut off mid-sentence, never end with ellipses (...). 2) The summary must end naturally with proper punctuation (period, exclamation mark, or question mark). 3) The summary must read as a complete, coherent piece of writing. 4) Do NOT indicate truncation or that the summary is incomplete in any way.',
          },
          {
            role: 'user',
            content: `Write a complete, finished summary of the following article. Capture the main points and key information.

CRITICAL REQUIREMENTS:
1. Your summary MUST be COMPLETE and FINISHED - never truncate, never cut off mid-sentence, never use ellipses (...)
2. Your summary MUST be EXACTLY 360 characters or fewer (this is a CHARACTER limit, including spaces and punctuation). DO NOT exceed 360 characters.
3. The summary must end naturally with proper punctuation (period, exclamation, or question mark)
4. The summary must read as a complete, coherent paragraph

CHARACTER LIMIT: 360 characters maximum (not 280, not 300, not 350 - exactly 360 characters or fewer).

Write your complete, finished summary within 360 characters:\n\n${truncatedContent}`,
          },
        ],
        max_tokens: 900,
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

    // Debug: Log the raw summary from LLM
    console.log('LLM raw response - Length (characters):', summary.length);
    console.log('LLM raw response text:', summary);

    // Remove any character count mentions or metadata from the summary
    // Remove patterns like "(360 chars)", "[360 characters]", etc.
    summary = summary.replace(/\s*\(?\d+\s*(char|characters?|chars?)\)?/gi, '').trim();
    summary = summary.replace(/\s*\[\d+\s*(char|characters?|chars?)\]/gi, '').trim();
    
    // Remove trailing ellipses if LLM added them despite instructions
    summary = summary.replace(/\.{2,}$/, '').trim();
    // Remove any ellipses in the middle or at the end
    summary = summary.replace(/\s*\.{3,}\s*/g, ' ').trim();

    // Ensure summary is within 360 character limit
    // This should rarely be needed if the LLM follows the prompt correctly
    if (summary.length > 360) {
      console.warn(`WARNING: Summary exceeds 360 character limit (${summary.length} chars). LLM did not follow character limit instruction.`);
      // Try to find a sentence boundary within the limit
      const trimmed = summary.substring(0, 360);
      const lastPeriod = trimmed.lastIndexOf('.');
      const lastExclamation = trimmed.lastIndexOf('!');
      const lastQuestion = trimmed.lastIndexOf('?');
      const lastSentenceEnd = Math.max(lastPeriod, lastExclamation, lastQuestion);
      
      if (lastSentenceEnd > 300) {
        // Found a sentence end reasonably close to the limit
        summary = summary.substring(0, lastSentenceEnd + 1).trim();
        console.warn(`Summary trimmed to sentence boundary: ${summary.length} characters`);
      } else {
        // No good sentence boundary, trim at word boundary
        const lastSpace = trimmed.lastIndexOf(' ');
        if (lastSpace > 300) {
          summary = summary.substring(0, lastSpace).trim() + '.';
          console.warn(`Summary trimmed to word boundary: ${summary.length} characters`);
        } else {
          // Last resort: hard cut (should never happen with proper prompt)
          summary = summary.substring(0, 357).trim() + '...';
          console.warn(`Summary hard-trimmed (last resort): ${summary.length} characters`);
        }
      }
    }

    // Debug: Log the cleaned summary being sent
    console.log('LLM cleaned summary - Length (characters):', summary.length);
    console.log('LLM cleaned summary text:', summary);
    if (summary.length > 360) {
      console.warn('WARNING: Summary still exceeds 360 character limit after processing!');
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


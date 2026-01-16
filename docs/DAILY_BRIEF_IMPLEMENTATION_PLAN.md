# Daily Brief Implementation Plan

## Overview
Create an agentic workflow using self-hosted n8n to generate a daily audio brief of RSS feed articles. The workflow will refresh feeds, generate summaries, convert to audio via ElevenLabs, and provide a Spotify-like playback experience.

## Architecture Decisions

### Tools & Services
- **n8n** (self-hosted) - Workflow orchestration
- **OpenAI API** - Text summarization (GPT-4o-mini recommended for cost)
- **ElevenLabs API** - Text-to-speech (free tier: 10k chars/month)
- **Your RSS Reader API** - Feed refresh, article retrieval, summary caching
- **Storage** - Audio file storage (options: S3, local filesystem, or Supabase storage)

### Cost Optimization
- Use GPT-4o-mini for summaries (~$0.15/1M input tokens, ~$0.60/1M output tokens)
- Cache summaries in database to avoid regeneration
- Manual trigger to prevent unnecessary runs
- Batch processing to minimize API calls

---

## Milestone 1: API Endpoints & Data Model
**Goal:** Extend your API to support the daily brief workflow

### Tasks
1. **Create feed refresh endpoint** (if not exists)
   - `POST /api/feeds/refresh` - Refresh all feeds or specific feed
   - Returns: `{ success: boolean, feedsRefreshed: number, itemsAdded: number }`

2. **Create daily brief query endpoint**
   - `GET /api/brief/items?date=YYYY-MM-DD` - Get items published on specific date
   - Returns: Array of FeedItem with metadata
   - Filters by `publishedAt` date (start of day to end of day UTC)
   - Only returns items with `status: 'inbox'` or `status: 'saved'`

3. **Extend FeedItem model for audio brief**
   - Add `audioBriefUrl?: string` - URL to generated audio file
   - Add `audioBriefGeneratedAt?: string` - Timestamp when audio was generated
   - Add `briefOrder?: number` - Order in daily brief (for sorting)

4. **Create brief metadata endpoint**
   - `GET /api/brief/metadata?date=YYYY-MM-DD` - Get brief stats
   - Returns: `{ date: string, articleCount: number, feeds: string[], totalDuration?: number }`

5. **Create audio storage endpoint**
   - `POST /api/brief/audio` - Upload/store audio file
   - Body: `{ itemId: string, audioUrl: string, duration: number }`
   - Stores audio URL in FeedItem record

### Database Changes
- Add columns to `feed_items` table:
  - `audio_brief_url` (TEXT, nullable)
  - `audio_brief_generated_at` (TIMESTAMP, nullable)
  - `brief_order` (INTEGER, nullable)

### Deliverables
- API endpoints tested and documented
- Database migration script
- Postman/curl examples for n8n integration

---

## Milestone 2: n8n Workflow - Data Collection
**Goal:** Build the data gathering portion of the workflow

### Tasks
1. **Set up n8n instance**
   - Self-host n8n (Docker recommended)
   - Configure environment variables for API keys
   - Set up webhook/HTTP Request nodes

2. **Create workflow trigger**
   - Manual trigger node (button in n8n UI)
   - Optional: Webhook trigger for future automation
   - Input: Date (defaults to today)

3. **Refresh feeds step**
   - HTTP Request node → `POST /api/feeds/refresh`
   - Include auth cookie/header
   - Error handling: Continue on failure, log warning

4. **Get daily items step**
   - HTTP Request node → `GET /api/brief/items?date={date}`
   - Parse response JSON
   - Filter: Only items without `aiSummary` (to avoid regenerating)

5. **Get brief metadata step**
   - HTTP Request node → `GET /api/brief/metadata?date={date}`
   - Extract: article count, feed names, date info

### Deliverables
- Working n8n workflow that collects daily items
- Error handling and logging
- Test with sample date

---

## Milestone 3: Summary Generation & Caching
**Goal:** Generate summaries for articles and cache them in your database

### Tasks
1. **Create summary generation node**
   - OpenAI node in n8n
   - Model: `gpt-4o-mini` (cost-effective)
   - Prompt template:
     ```
     Summarize this article in 2-3 sentences for a daily news brief. 
     Focus on key insights and actionable information.
     
     Title: {title}
     Author/Source: {source}
     Content: {contentSnippet or fullContent}
     ```

2. **Batch processing logic**
   - Loop through items without summaries
   - Generate summary for each
   - Rate limiting: Add delay between API calls (OpenAI rate limits)

3. **Save summaries to database**
   - HTTP Request node → `POST /api/items/{itemId}/summary`
   - Body: `{ summary: string }`
   - Update `aiSummary` field in database

4. **Error handling**
   - Retry logic for failed summaries
   - Skip items that fail after 2 retries
   - Log errors for manual review

### Cost Estimation
- Average article: ~500 words = ~650 tokens
- Summary: ~50 words = ~65 tokens
- Per article: ~715 tokens × $0.15/1M = ~$0.0001 per article
- 20 articles/day = ~$0.002/day = ~$0.06/month

### Deliverables
- Working summary generation workflow
- Summaries cached in database
- Cost tracking/logging

---

## Milestone 4: Audio Generation with ElevenLabs
**Goal:** Convert article summaries to audio using ElevenLabs

### Tasks
1. **Set up ElevenLabs integration**
   - Create ElevenLabs account (free tier: 10k chars/month)
   - Get API key
   - Configure HTTP Request node in n8n

2. **Select voice**
   - Browse ElevenLabs voices
   - Choose "smart, sexy, female" voice (e.g., "Rachel", "Bella", "Domi")
   - Store voice ID in n8n workflow variables

3. **Generate intro audio**
   - Template: "Good morning! Today is {day}, {date}. You have {count} articles in your brief today. {Compliment}. Let's dive in."
   - Compliment examples:
     - "You're staying ahead of the curve as always."
     - "Your commitment to learning is inspiring."
     - "You're making great progress on your goals."
   - Use OpenAI to generate unique compliment (optional, or use rotation)

4. **Generate article audio segments**
   - For each article: "From {source}, {title}. {summary}."
   - Concatenate all segments into single script
   - Generate one audio file for entire brief

5. **Audio storage**
   - Download audio file from ElevenLabs
   - Upload to storage (Supabase Storage, S3, or local filesystem)
   - Store URL in database via `POST /api/brief/audio`

### Cost Estimation
- Free tier: 10,000 characters/month
- Average brief: ~2,000-3,000 characters (intro + 20 articles)
- Free tier supports ~3-5 briefs/month
- Paid tier: $5/month for 30k chars = ~10 briefs/month

### Deliverables
- Working audio generation
- Audio file stored and accessible
- URL saved in database

---

## Milestone 5: Frontend Audio Player
**Goal:** Create Spotify-like full-screen audio player in your React app

### Tasks
1. **Create BriefPlayer component**
   - Full-screen overlay/modal
   - Large play/pause button (centered)
   - Progress bar
   - Time display (current/total)
   - Close button

2. **Audio playback logic**
   - Use HTML5 `<audio>` element
   - Handle play/pause
   - Track progress
   - Auto-pause when component unmounts

3. **Brief metadata display**
   - Show date, article count
   - Optional: List of articles (collapsible)

4. **Navigation/routing**
   - Add route: `/brief/:date` or `/brief/today`
   - Link from main UI (e.g., "Daily Brief" button in sidebar)

5. **Styling**
   - Dark, minimal design (Spotify-like)
   - Responsive for mobile
   - Smooth animations

### Deliverables
- Working audio player component
- Integrated into app navigation
- Mobile-responsive

---

## Milestone 6: Workflow Integration & Polish
**Goal:** Connect all pieces and add polish

### Tasks
1. **Complete n8n workflow**
   - Chain all nodes together
   - Add error handling at each step
   - Add logging/notifications (optional: email/Slack on completion)

2. **Add workflow status tracking**
   - Store brief generation status in database
   - Track: started, in-progress, completed, failed
   - Add endpoint: `GET /api/brief/status?date={date}`

3. **Frontend integration**
   - Add "Generate Daily Brief" button (triggers n8n webhook)
   - Show loading state while generating
   - Display brief when ready
   - Handle errors gracefully

4. **Optimization**
   - Cache audio URLs (don't regenerate if exists)
   - Skip items already in brief
   - Batch API calls where possible

5. **Testing**
   - Test full workflow end-to-end
   - Test error scenarios
   - Test on mobile devices
   - Performance testing

### Deliverables
- Complete working system
- Error handling throughout
- User documentation

---

## Milestone 7: Error Handling & Cost Tracking
**Goal:** Add robust error handling and cost monitoring to the summary generation workflow

### Tasks
1. **Error handling for summary generation**
   - Add retry logic for failed OpenAI API calls (retry up to 2 times)
   - Skip items that fail after 2 retries (log error, continue with next item)
   - Add error logging to `daily_brief_runs` table metadata
   - Handle rate limit errors gracefully (exponential backoff)

2. **Error handling for save operations**
   - Retry failed save operations (POST /api/items/:id/summary)
   - Log which items failed to save
   - Continue processing other items even if one save fails

3. **Cost tracking and logging**
   - Extract token usage from OpenAI responses
   - Log token counts per article in workflow metadata
   - Calculate estimated costs (input tokens × $0.15/1M + output tokens × $0.60/1M)
   - Store cost data in `daily_brief_runs` table metadata
   - Add summary cost to brief metadata endpoint

4. **Workflow status updates**
   - Update `daily_brief_runs` status to "failed" if critical errors occur
   - Store error messages and details in metadata
   - Add retry capability (mark run as failed, allow manual retry)

### Deliverables
- Robust error handling in n8n workflow
- Cost tracking and logging
- Error reporting in database
- Workflow continues processing even when individual items fail

### Estimated Timeline
- **Milestone 7:** 1-2 days

---

## Technical Considerations

### Authentication
- n8n needs to authenticate with your API
- Options: Use session cookie, API key, or OAuth token
- Store credentials securely in n8n environment variables

### Storage Options
1. **Supabase Storage** (recommended if using Supabase)
   - Free tier: 1GB storage
   - Easy integration with existing setup
   - CDN delivery

2. **AWS S3** (if already using AWS)
   - Pay per GB stored
   - Reliable and scalable

3. **Local filesystem** (simplest for self-hosted)
   - Store in `public/audio/briefs/` directory
   - Serve via Express static files
   - Backup strategy needed

### Error Handling Strategy
- Each n8n node should have error handling
- Log errors to n8n execution log
- Optional: Send notifications on critical failures
- Graceful degradation: Show partial brief if some articles fail

### Cost Monitoring
- Track OpenAI token usage in n8n
- Track ElevenLabs character usage
- Set up alerts if approaching limits
- Consider caching strategies to reduce API calls

---

## Future Enhancements (Post-MVP)

1. **Automated scheduling** - Run daily at specific time
2. **Multiple voice options** - Let user choose voice
3. **Playback speed control** - 1x, 1.5x, 2x speed
4. **Skip/next article** - Navigate between articles in brief
5. **Brief history** - View/listen to past briefs
6. **Customization** - User preferences for intro style, summary length
7. **Multi-language support** - Generate briefs in different languages
8. **Podcast feed** - Generate RSS feed for podcast apps

---

## Implementation Order Recommendation

1. **Start with Milestone 1** - Get API endpoints working
2. **Then Milestone 2** - Verify n8n can talk to your API
3. **Milestone 3** - Get summaries working (most critical feature)
4. **Milestone 4** - Add audio (can test with single article first)
5. **Milestone 5** - Build player (can test with sample audio)
6. **Milestone 6** - Polish and integrate

---

## Questions to Resolve

1. **Storage location** - Supabase Storage, S3, or local filesystem?
2. **Audio format** - MP3, OGG, or WAV? (ElevenLabs supports MP3)
3. **Brief duration** - How long should brief be? (affects ElevenLabs usage)
4. **Compliment generation** - Use OpenAI for unique compliments or predefined list?
5. **Error notifications** - Email, Slack, or just n8n logs?
6. **Mobile experience** - Should player work in background/background audio?

---

## Milestone 8: Brief Navigation & Inline Player

**Goal:** Create a polished brief browsing experience with inline player, date navigation, and workflow triggering.

### Tasks

1. **Backend: Workflow Trigger Endpoint**
   - Create `POST /api/brief/generate` endpoint
   - Accepts `date` parameter (optional, defaults to today)
   - Triggers n8n workflow via webhook
   - Returns workflow execution ID and status

2. **Frontend: Inline Player Component**
   - Convert `BriefPlayer` from full-screen to inline component
   - Style using theme CSS variables (light, dark, sepia, hn)
   - Remove full-screen overlay, make it part of page layout
   - Keep all playback controls (play/pause, progress, time)

3. **Frontend: Brief List & Navigation**
   - Update `BriefPage` to show list of available briefs
   - Add date picker/navigation (previous/next day buttons)
   - Show brief status (available, generating, failed)
   - Display article count and date for each brief

4. **Frontend: Generate Button**
   - Show "Generate Daily Brief" button when no brief available
   - Button triggers workflow via new endpoint
   - Disable button while generation is in progress

5. **Frontend: Workflow Progress Indicator**
   - Poll brief run status while generating
   - Show text-based loading steps:
     - "Refreshing feeds..."
     - "Generating summaries..."
     - "Creating compliment..."
     - "Generating audio..."
     - "Uploading to storage..."
     - "Complete!"
   - Update UI as workflow progresses

### Implementation Notes

- Use existing `BriefRun` status tracking
- Poll `/api/brief/runs/:date` every 2-3 seconds during generation
- Show inline player only when brief is available
- Style player to match app's 4 themes using CSS variables

## Estimated Timeline

- **Milestone 1:** 2-3 days
- **Milestone 2:** 1-2 days
- **Milestone 3:** 2-3 days
- **Milestone 4:** 2-3 days
- **Milestone 5:** 3-4 days
- **Milestone 6:** 2-3 days
- **Milestone 7:** 1-2 days (Error Handling & Cost Tracking)
- **Milestone 8:** 2-3 days (Brief Navigation & Inline Player)

**Total:** ~15-23 days of focused work

---

## Resources

- [n8n Documentation](https://docs.n8n.io/)
- [OpenAI API Docs](https://platform.openai.com/docs)
- [ElevenLabs API Docs](https://elevenlabs.io/docs)
- [HTML5 Audio API](https://developer.mozilla.org/en-US/docs/Web/API/HTMLAudioElement)

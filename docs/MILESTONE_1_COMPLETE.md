# Milestone 1: API Endpoints & Data Model - COMPLETE ✅

## Summary
All API endpoints and database changes for daily brief functionality have been implemented.

## What Was Built

### 1. Database Migration
**File:** `docs/migration-add-daily-brief.sql`

- Added columns to `feed_items`:
  - `audio_brief_url` (TEXT) - URL to generated MP3 file
  - `audio_brief_generated_at` (TIMESTAMPTZ) - When audio was generated
  - `brief_order` (INTEGER) - Order in daily brief
- Created `daily_brief_runs` table:
  - Tracks workflow execution state
  - Stores errors and metadata
  - One run per date per environment

### 2. Brief Repository
**File:** `server/db/briefRepository.js`

Functions:
- `getBriefItems(date)` - Get items for a specific date
- `getBriefMetadata(date)` - Get brief stats and run status
- `updateItemAudioBrief(itemId, audioUrl, order)` - Store audio URL
- `upsertBriefRun(date, updates)` - Create/update run record
- `getBriefRun(date)` - Get run for a date
- `getRecentBriefRuns(limit)` - Get recent runs

### 3. Brief API Routes
**File:** `server/routes/brief.js`

Endpoints:
- `POST /api/brief/refresh` - Refresh all RSS feeds
- `GET /api/brief/items?date=YYYY-MM-DD` - Get daily items
- `GET /api/brief/metadata?date=YYYY-MM-DD` - Get brief metadata
- `POST /api/brief/audio` - Store audio URL for item
- `GET /api/brief/runs` - Get recent brief runs
- `GET /api/brief/runs/:date` - Get run for specific date
- `POST /api/brief/runs` - Create/update run record

### 4. TypeScript Types
**File:** `src/types.ts`

Added:
- `audioBriefUrl`, `audioBriefGeneratedAt`, `briefOrder` to `FeedItem`
- `BriefRunStatus` type
- `BriefRun` interface
- `BriefMetadata` interface

### 5. Server Integration
**File:** `server/index.js`

- Mounted brief router at `/api/brief` with auth middleware

## Next Steps (Milestone 2)

1. Run the database migration in Supabase
2. Test the endpoints with Postman/curl
3. Set up n8n instance
4. Create n8n workflow for data collection

## Testing the Endpoints

### Refresh Feeds
```bash
curl -X POST http://localhost:3001/api/brief/refresh \
  -H "Cookie: session=YOUR_SESSION_COOKIE" \
  -H "Content-Type: application/json"
```

### Get Daily Items
```bash
curl http://localhost:3001/api/brief/items?date=2026-01-15 \
  -H "Cookie: session=YOUR_SESSION_COOKIE"
```

### Get Brief Metadata
```bash
curl http://localhost:3001/api/brief/metadata?date=2026-01-15 \
  -H "Cookie: session=YOUR_SESSION_COOKIE"
```

### Store Audio URL
```bash
curl -X POST http://localhost:3001/api/brief/audio \
  -H "Cookie: session=YOUR_SESSION_COOKIE" \
  -H "Content-Type: application/json" \
  -d '{"itemId": "uuid", "audioUrl": "https://...", "order": 1}'
```

### Create Brief Run
```bash
curl -X POST http://localhost:3001/api/brief/runs \
  -H "Cookie: session=YOUR_SESSION_COOKIE" \
  -H "Content-Type: application/json" \
  -d '{"date": "2026-01-15", "status": "running"}'
```

## Notes

- All endpoints require authentication (session cookie)
- Date format must be `YYYY-MM-DD`
- Environment scoping is handled automatically (dev/prod)
- Error handling is in place for all endpoints

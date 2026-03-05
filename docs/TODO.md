# The Signal — To-Dos


--

### 1. [✓] Multi-User Auth System
**Make The Signal ready for other users** — sign up, login, forgot password, password reset, login with Google.

**Status:** ✓ COMPLETED

**Scope:** Supabase Auth (built-in email/password + Google OAuth), user accounts, per-user data scoping across all tables (feeds, feed_items, preferences), signup/login/reset UI.

### 2. [✓] User-Provided AI Keys
**Users bring their own AI keys** — Anthropic, OpenAI, Google. App owner's keys must never be used.

**Status:** ✓ COMPLETED — Encrypted storage in Supabase, Settings UI for management, per-request key resolution, multi-provider support.

**Scope:** Settings UI for key management, encrypted storage in Supabase, per-request key resolution, validation, remove owner keys from LLM path. Add Google (Gemini) support.

### 3. [✓] HN-Style Feature Request Page
**Feature request board** — all users can post ideas, upvote, see vote counts and who submitted.

**Status:** ✓ COMPLETED — Database tables, API endpoints, React component with voting UI. Moved to Settings menu. Clean divider-based design.

**Scope:** New tables (feature_requests, feature_request_votes), API endpoints (GET list, POST create, POST vote), React pages, sorting by votes/recency. Depends on #1.

### 4. [ ] Make feed refresh more automatic instead of manual refresh button

### 5. [ ] Investigate what "clear cache" does and determine if we can remove it or restrict to admin/own account only

### 6. [ ] Add tooltip on "Cull the Heard" button to explain what the feature does

### 7. [✓] OPML import in add feed dialog
**Import feeds from other RSS readers** — users can upload OPML file (exported from Feedly, The Old Reader, etc.) to bulk-add feeds.

**Status:** ✓ COMPLETED — OPML parser (client-side DOMParser), new tab in AddModal, file upload UI, feed preview, bulk import endpoint, duplicate/error handling.

**Scope:** OPML parser, import dialog UI in add feed modal, batch feed creation, duplicate handling, progress/success messaging.

### 8. [ ] RSS Feed Discovery Agent
**AI agent that helps users discover feeds** — conversational, understands preferences, recommends feeds, validates and adds them.

**Current state:** Agentic workflow infrastructure partially exists. RSS parsing/validation implemented.

**Scope:** Conversational agent UI, feed search/recommendation tools, preference learning, integration with existing feed CRUD. Depends on #2.

### 9. [ ] RSS Feed Auto-Fix Agent
**AI agent that diagnoses and fixes broken feeds** — determines why a feed fails, fixes it, tests, confirms, adds it.

**Current state:** RSS parser with retries, content fetcher with fallbacks, custom scraper pattern.

**Scope:** Diagnostic workflow, auto-fix strategies (URL resolution, format detection, encoding, redirects), test harness, integration with feed repo. Depends on #2.

### 10. [ ] Improve RSS Content Fetcher/Parser
**Continue exploring and fixing undesirable behavior in the RSS content pipeline** — link blogs (like Daring Fireball) showing linked page content instead of feed descriptions, formatting issues, whitespace handling, and other feed-specific quirks.

**Known issues:** Auto-fetch was overriding RSS content with linked URL content for link blogs. `white-space: pre-line` added for essays. More edge cases likely exist across different feed types.

**Scope:** Audit content parsing across different feed types (link blogs, newsletters, full-text feeds, excerpt-only feeds), improve per-feed content strategy, handle whitespace/formatting correctly for each type.

### 11. [✓] Keyboard Shortcuts
**Vim-style and common RSS reader shortcuts** — list view: `j`/`k` focus next/prev, `o`/Enter open, `e` archive, `s` save, `b` bookmark. Article view: `j`/`k` next/prev article, `o` open original, `e` archive & return, `s`/`b` status toggles, `u`/Esc go back. `?` opens shortcut reference modal in both views and settings menu.

**Status:** ✓ COMPLETED — KeyboardShortcutsModal component, FeedList keyboard handler with focusedIndex + visual ring highlight, ArticleReader keyboard handler with navigateToPrev(), settings menu entry.

### 12. [✓] Fix dev login redirect to prod
**After Google OAuth in dev, callback redirected to prod URL instead of localhost.**

**Root cause:** Supabase's allowed Redirect URL list didn't include `http://localhost:5173/**`. The code was correct (`redirectTo: window.location.origin + /auth/callback`), but Supabase rejected the localhost URL and fell back to the production domain.

**Fix:** Supabase Dashboard → Authentication → URL Configuration → add `http://localhost:5173/**` and `http://localhost:5173` to Redirect URLs.

**Status:** ✓ RESOLVED (dashboard config change, no code change needed)



### 13. [ ] Add the ability for the admin user (me/Brent) to mark a product request as done.
**Planning notes:** Research other products like product board and canny.io and replicate their simplified ux. I don't want the done to clutter the view over time, but i also want it to be easily viewable/discoverable which features have shipped. 
# The Signal — Consolidated Todo List

Master list of all outstanding work and new feature requests. Each item will be planned in detail individually before execution.

---

## Existing Outstanding Work

### A. Performance Optimization (see `PERFORMANCE_AUDIT.md`)
**Status:** Identified, not started. Critical issues causing slow load times.

**Phase 1 — Quick Wins (50-70% improvement):**

- [ ] Server-side filtering in `loadItems()` — currently loads ALL 249+ items every navigation
- [ ] Memoize word count calculations — `getWordCount()` runs on every sort
- [ ] Throttle reading progress scroll handler — fires 100+/sec
- [ ] Memoize `FeedItemCard` component

**Phase 2 — Medium (20-30% more):**
- [ ] Optimize sidebar item counting (loads all items twice, O(n×m))
- [ ] Add virtual scrolling for long lists
- [ ] Replace global event listeners with state management

**Phase 3 — Long-term:**
- [ ] Pagination / infinite scroll

### B. Daily Brief Feature — PARKED
**Status:** Deprioritized. n8n was painful to work with. Code commented out. Can revisit with a different approach in the future.

### C. Agentic Workflow Infrastructure — SUPERSEDED
**Status:** Old 8-milestone plan superseded by items #5 and #6 below. Existing infrastructure in `server/workflows/` and `server/tools/` will be reused.

---

## New Feature Requests

### ✓ 1. Multi-User Auth System
**Make The Signal ready for other users** — sign up, login, forgot password, password reset, login with Google.

**Status:** ✓ COMPLETED

**Scope:** Supabase Auth (built-in email/password + Google OAuth), user accounts, per-user data scoping across all tables (feeds, feed_items, preferences), signup/login/reset UI.

### ✓ 2. User-Provided AI Keys
**Users bring their own AI keys** — Anthropic, OpenAI, Google. App owner's keys must never be used.

**Status:** ✓ COMPLETED — Encrypted storage in Supabase, Settings UI for management, per-request key resolution, multi-provider support.

**Scope:** Settings UI for key management, encrypted storage in Supabase, per-request key resolution, validation, remove owner keys from LLM path. Add Google (Gemini) support.

### 3. Server Migration (Off Render Free Tier)
**Eliminate the 2-minute cold start.** Budget: free or near-free for ~12 users.

**Status:** EVALUATED & ABANDONED — Tested Railway but encountered Node.js version incompatibility (dependencies require Node 20+). Decided to accept Render free tier cold starts.

**To evaluate:** Fly.io free tier, Railway ($5 credit/mo), Oracle Cloud always-free VM, Render paid ($7/mo).

### ✓ 4. HN-Style Feature Request Page
**Feature request board** — all users can post ideas, upvote, see vote counts and who submitted.

**Status:** ✓ COMPLETED — Database tables, API endpoints, React component with voting UI. Moved to Settings menu. Clean divider-based design.

**Scope:** New tables (feature_requests, feature_request_votes), API endpoints (GET list, POST create, POST vote), React pages, sorting by votes/recency. Depends on #1.

### 5. RSS Feed Discovery Agent
**AI agent that helps users discover feeds** — conversational, understands preferences, recommends feeds, validates and adds them.

**Current state:** Agentic workflow infrastructure partially exists. RSS parsing/validation implemented.

**Scope:** Conversational agent UI, feed search/recommendation tools, preference learning, integration with existing feed CRUD. Depends on #2.

### 6. RSS Feed Auto-Fix Agent
**AI agent that diagnoses and fixes broken feeds** — determines why a feed fails, fixes it, tests, confirms, adds it.

**Current state:** RSS parser with retries, content fetcher with fallbacks, custom scraper pattern.

**Scope:** Diagnostic workflow, auto-fix strategies (URL resolution, format detection, encoding, redirects), test harness, integration with feed repo. Depends on #2.

---

## Execution Order

```
✓ #1 Multi-User Auth          ← foundation for everything
#A Performance Fixes          ← quick wins, independent, good to do early
✓ #2 User AI Keys             ← depends on #1
~#3 Server Migration          ← evaluated & abandoned (sticking with Render)
✓ #4 Feature Requests         ← depends on #1
#5 Feed Discovery Agent       ← depends on #2 (next priority)
#6 Feed Auto-Fix Agent        ← depends on #2
```

Each item gets its own detailed plan before implementation begins.

**Completed:** #1, #2, #4
**In Progress:** None
**Next:** #5 Feed Discovery Agent or #A Performance Fixes


# Morning Oracle — Project Context & Worklog

## 1. Project Overview & Architecture
**Morning Oracle** is an automated AI-driven morning alarm assistant and task broadcaster built as a Progressive Web Application (PWA).

### Tech Stack
- **Frontend / Framework:** Next.js 14+ (App Router), TypeScript, Tailwind CSS, Lucide Icons.
- **Styling / Theme:** Forced Dark Mode (`#0a0a0a` background, `#121212` cards, `#00E5FF` Cyan & `#FF0055` Magenta neon accents).
- **Database & Storage:** Supabase PostgreSQL (`ideas`, `settings` tables) and Supabase Storage bucket (`oracle-audio`).
- **Backend / Automated Worker:** Oracle Cloud Free-Tier VM running Python 3 (`cron_worker.py`), Gemini 1.5/2.0 Flash API for news summarization, `edge-tts` for high-quality voice synthesis (`ru-RU-SvetlanaNeural`).
- **Deployment:** Vercel (Production URL: `https://morning-oracle-one.vercel.app`), GitHub (`ViktorDirin/morning-oracle`).

---

## 2. Implemented Features (v1.0 Completed)

### Phase 1 & 2: Voice Capture & Idea Workflow
- **Speech-to-Text Dictation:** Built using browser Web Speech API with multi-language dictation support (RU, EN, UA).
- **Two-Tier Idea Management:** Instant capture to `Inbox`, with one-tap transfer to `Tomorrow` (`is_for_tomorrow = true`).
- **Real-time Database Sync:** Full CRUD operations synced directly with Supabase Database.

### Phase 3 & 4: AI Backend & Nightly Audio Pipeline
- **Automated Python Worker (`cron_worker.py`):**
  - Fetches multi-category RSS feeds (Tech, AI, Crypto, Finance, World).
  - Summarizes top insights using Gemini API into an energetic morning radio script.
  - Synthesizes neural audio using `edge-tts` (`ru-RU-SvetlanaNeural`).
  - Automatically uploads `today_news.mp3` to Supabase Storage with public cache-busting URLs.
  - Scheduled via system `cron` to run every morning at 05:00 UTC/Server time.

### Phase 5: Live Alarm Engine, PWA & Broadcast Player
- **3-Stage Sequential Morning Broadcast (`MorningPlayer.tsx`):**
  - Stage 1: Procedural Web Audio API chime / countdown sequence.
  - Stage 2: Remote AI news broadcast playback streamed from Supabase Storage.
  - Stage 3: Dynamic client-side synthesis reading today's task list via SpeechSynthesis API.
- **Alarm Clock Engine (`AlarmClock.tsx`):**
  - Time setter with local and Supabase settings persistence.
  - 1-second interval comparison triggering `MorningPlayer` automatically upon time match.
  - Screen Wake Lock API integration (`navigator.wakeLock`) for nightstand mode.
- **PWA & Production Deployment:**
  - Configured `manifest.json`, fallback icons, metadata, and service worker registration for mobile standalone installation.
  - Deployed to Vercel with secured environment variables (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`).

---

## 3. Backlog & Next Iterations (v1.1 Roadmap)

1. **Voice Input Formatting (AI Post-Processing):**
   - Implement an automated fast micro-prompt via Gemini on voice capture to automatically add punctuation, capitalized sentences, and clean syntax instead of raw continuous transcripts.
2. **Task Readout Cadence & Spacing:**
   - Enhance Stage 3 task speech in `MorningPlayer` by introducing explicit item numbering, punctuation pauses, and natural breathing intervals (`"Task 1. [pause] Buy groceries. [pause] Task 2..."`).
3. **Multi-Language Broadcast Support (RU / EN Switch):**
   - Add language toggle in `SettingsModal`.
   - Update `cron_worker.py` to support dynamic English news generation and English voice assignment (`en-US-JennyNeural` / `en-US-GuyNeural`).
   - Sync Stage 3 dynamic task greeting and voice selection (`en-US` SpeechSynthesis).
4. **README.md Overhaul:**
   - Add formatted project architecture badges, feature checklists, setup instructions, and the official roadmap.

---

## 4. Environment & Secrets Mapping
- **Frontend (Vercel / `.env.local`):**
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **Backend VM (`/opt/morning_oracle_api/.env`):**
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `GEMINI_API_KEY`
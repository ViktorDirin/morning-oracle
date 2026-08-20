# Morning Oracle — Project Roadmap & Backlog

## Overview
This document tracks the phased development, architecture decisions, and planned features for **Morning Oracle**.

---

## [x] Version 1.0 — MVP Core & Alarm System (Completed)
- [x] **Voice Capture:** Browser Web Speech API implementation for speech-to-text dictation (RU/EN).
- [x] **Task Flow:** Dual-tier list (`Inbox` & `Tomorrow`) with Supabase Database sync.
- [x] **Backend Pipeline:** Nightly Python worker on Oracle Cloud generating summary via Gemini API and neural TTS via `edge-tts` (`ru-RU-SvetlanaNeural`).
- [x] **Storage Sync:** Automated upload of `today_news.mp3` to Supabase Storage with cache-busting URLs.
- [x] **Morning Player Engine:** 3-stage sequential playback (countdown chime -> AI news stream -> task synthesis).
- [x] **Alarm Engine:** Live interval timer, nightstand mode via Wake Lock API, and persistent settings.
- [x] **PWA & Production:** Full Progressive Web App manifest/service worker and Vercel production deployment.

---

## [x] Version 1.1 — Content Polish & Multi-Language Digest (Completed)
- [x] **Multi-Language Audio Switch (RU / EN):**
  - Added `Morning Digest Language (RU/EN)` toggle in `SettingsModal.tsx` synced to `localStorage`.
  - Dynamic stream selection in `MorningPlayer.tsx` (`today_news_en.mp3` vs `today_news.mp3`).
  - Localized Stage 3 task speech queues with natural pacing (`rate: 0.95`, `pitch: 1.0`).
- [x] **Structured Task Cadence (Stage 3):**
  - Direct introductory cue (*"Твой список задач."* / *"Your task list."*).
  - Clean ~500ms pauses between consecutive tasks with live UI task highlighting.
- [x] **AI-Powered Voice Post-Processing:**
  - Dedicated `/api/format-idea` Next.js endpoint powered by `gemini-3.6-flash` for capitalization, punctuation, and grammar cleanup.

---

## [x] Version 1.2 — Mobile Audio Capture & Multimodal Breakthrough (Completed)
- [x] **Standard MediaRecorder Stream Capture:**
  - Completely replaced unreliable `webkitSpeechRecognition` with cross-platform HTML5 `MediaRecorder`.
  - Eliminated hardware audio pipeline lock conflicts and `Speech error: aborted` drops on mobile Android/Google Pixel devices.
- [x] **Server-Side Multimodal Audio Transcription (`/api/transcribe`):**
  - Next.js server endpoint processing base64 WebM/Opus audio buffers directly via `gemini-3.6-flash`.
  - Zero-latency verbatim transcription with automatic capitalization, punctuation formatting, and ambient noise suppression.

---

## [ ] Version 1.3 — AI Assistant Tasks Briefing (Current Priority)

### 1. Conversational Task Script Generator (`/api/generate-tasks-briefing`)
- [ ] **Context Ingestion:** Fetch and ingest all active tasks from the `Tomorrow` category.
- [ ] **Role-Engineered Persona Prompt:**
  - Charismatic, caring, slightly witty personal female assistant persona.
  - Generates a cohesive 30–50s spoken morning briefing monologue seamlessly connecting tasks instead of robotic list numbering.
  - Dual-language support (`RU` / `EN`) matching the user's active digest language preference.

### 2. Audio Synthesis & Storage Pipeline
- [ ] **Edge-TTS Neural Voice Generation:**
  - Russian: `ru-RU-SvetlanaNeural`
  - English: `en-US-JennyNeural`
- [ ] **Storage Sync:**
  - Stream and save the personal task briefing directly to Supabase Storage bucket `morning_audio` as `today_tasks.mp3` and `today_tasks_en.mp3`.

### 3. Interactive Task UI & Smart Alarm Integration
- [ ] **Interactive Task Hub:** Add `[ ✨ AI Briefing ]` action button in the `Tomorrow` tasks tab with live generation progress & audio preview player.
- [ ] **Morning Player Upgrade (Stage 3):** Play the generated personal assistant audio briefing as a first-class MP3 stream before falling back to browser speech synthesis.

---

## [ ] Version 1.4 — Advanced Management & Analytics
- [ ] **Task CRUD:** Inline text editing and batch archiving directly in the UI.
- [ ] **Broadcast Transcript Archive:** Display full text transcripts of the morning news and task broadcasts inside the app.
- [ ] **Audio Speed Controller:** Add playback speed controls (`1.0x`, `1.2x`, `1.5x`) inside `MorningPlayer.tsx`.

# Morning Oracle — Project Roadmap & Backlog

## Overview
This document tracks the phased development, architecture decisions, and planned features for **Morning Oracle**.

---

## [x] Version 1.0 — MVP Core & Alarm System (Completed)
- [x] **Voice Capture:** Browser Web Speech API implementation for speech-to-text dictation (RU/EN/UA).
- [x] **Task Flow:** Dual-tier list (`Inbox` & `Tomorrow`) with Supabase Database sync.
- [x] **Backend Pipeline:** Nightly Python worker on Oracle Cloud generating summary via Gemini API and neural TTS via `edge-tts` (`ru-RU-SvetlanaNeural`).
- [x] **Storage Sync:** Automated upload of `today_news.mp3` to Supabase Storage with cache-busting URLs.
- [x] **Morning Player Engine:** 3-stage sequential playback (countdown chime -> AI news stream -> browser task synthesis).
- [x] **Alarm Engine:** Live interval timer, nightstand mode via Wake Lock API, and persistent settings.
- [x] **PWA & Production:** Full Progressive Web App manifest/service worker and Vercel production deployment.

---

## [ ] Version 1.1 — Content Quality, Voice Polish & Language Switch (Current Priority)

### 1. AI News Digest Refinement & Tone Overhaul
- [ ] **Geopolitical / Conflict Blacklist:** Update the Gemini prompt to strictly exclude military, war, and political conflict news (including Ukraine/Russia war coverage).
- [ ] **Frontier AI & Vibe-coding Focus:** Add dedicated RSS feeds (Hacker News AI, VentureBeat AI, TechCrunch AI) prioritizing new model releases, image/video generation tools, vibecoding setups, and LLM updates.
- [ ] **Engaging Host Persona:** Shift Gemini's role from "dry newsreader" to "charismatic tech-radio host" with an energetic, witty morning vibe.
- [ ] **Weather Integration:** Include brief local weather conditions at the start of the audio digest.

### 2. Voice Capture & Task Readout Flow
- [ ] **AI-Powered Voice Post-Processing:** Run voice transcripts through a lightweight Gemini micro-prompt to automatically insert punctuation, capital letters, and split text into clean sentences.
- [ ] **Android Chrome / Pixel Microphone Fix:** Ensure robust permissions lifecycle, event cleanup, and explicit audio constraints in `VoiceCapture.tsx`.
- [ ] **Structured Task Cadence (Stage 3):** Format task lists with numbered speech cues and breathing pauses (*"Here is your plan for today. [pause] Task one: ... [pause] Task two: ..."*).

### 3. Multi-Language Audio Toggle (RU / EN)
- [ ] **Settings Language Switch:** Add a `Language (RU/EN)` toggle in `SettingsModal.tsx` synced to Supabase `settings`.
- [ ] **Dual Neural Voices (`edge-tts`):**
  - Russian: `ru-RU-SvetlanaNeural`
  - English: `en-US-JennyNeural`
- [ ] **Dynamic Language Routing:** `cron_worker.py` and `MorningPlayer.tsx` adjust prompt generation and speech synthesis based on the selected language.

---

## [ ] Version 1.2 — UI Enhancements & Task Management
- [ ] **Task CRUD:** Add quick inline text editing and one-tap task deletion directly in the UI.
- [ ] **Broadcast Transcript Archive:** Display the full text transcript of the morning news digest inside the application.
- [ ] **Audio Speed Controller:** Add playback speed controls (`1.0x`, `1.2x`, `1.5x`) inside `MorningPlayer.tsx`.
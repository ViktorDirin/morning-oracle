'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, MicOff, Send, Sparkles, CheckCircle2, AlertCircle, RefreshCw, Globe, Wand2, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Idea } from '@/lib/types';

interface VoiceCaptureProps {
  onIdeaSaved: (newIdea: Idea) => void;
}

const SUPPORTED_LANGUAGES = [
  { code: 'ru-RU', label: 'RU' },
  { code: 'en-US', label: 'EN' },
];

export function VoiceCapture({ onIdeaSaved }: VoiceCaptureProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isFormatting, setIsFormatting] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [selectedLang, setSelectedLang] = useState('ru-RU');
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Load persisted language
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const savedLang = localStorage.getItem('morning_oracle_voice_lang');
        if (savedLang && (savedLang === 'en-US' || savedLang === 'ru-RU')) {
          setSelectedLang(savedLang);
        }
      } catch (e) {
        // ignore
      }
    }
  }, []);

  // Format transcribed text with Gemini AI via /api/format-idea
  const formatTextWithAI = useCallback(async (rawText: string) => {
    if (!rawText || !rawText.trim() || rawText.trim().length < 2) return;

    setIsFormatting(true);
    try {
      console.log('[Morning Oracle] Requesting text formatting for:', rawText);
      const res = await fetch('/api/format-idea', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: rawText }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data?.formattedText && data.formattedText.trim()) {
          console.log('[Morning Oracle] AI formatted result:', data.formattedText);
          setTranscript(data.formattedText);
        }
      }
    } catch (err) {
      console.warn('[Morning Oracle] AI formatting request error:', err);
    } finally {
      setIsFormatting(false);
    }
  }, []);

  // Send recorded audio Blob to backend Gemini transcription endpoint
  const sendAudioForTranscription = useCallback(
    async (blob: Blob, mimeType: string) => {
      if (blob.size < 500) {
        console.log('[Morning Oracle] Recorded audio chunk too small, skipping transcription.');
        return;
      }

      setIsTranscribing(true);
      setStatusMessage(null);

      try {
        const formData = new FormData();
        const extension = mimeType.includes('mp4') ? 'mp4' : mimeType.includes('ogg') ? 'ogg' : 'webm';
        formData.append('file', blob, `voice_note.${extension}`);
        formData.append('language', selectedLang === 'en-US' ? 'en' : 'ru');

        console.log(`[Morning Oracle] Sending audio to /api/transcribe (${blob.size} bytes)...`);

        const response = await fetch('/api/transcribe', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData?.error || 'Transcription server error');
        }

        const data = await response.json();
        if (data?.formattedText && data.formattedText.trim()) {
          const cleanText = data.formattedText.trim();
          console.log('[Morning Oracle] Transcription succeeded:', cleanText);
          setTranscript((prev) => (prev ? `${prev.trim()} ${cleanText}` : cleanText));
        } else {
          console.log('[Morning Oracle] No audible speech recognized.');
        }
      } catch (err: any) {
        console.error('[Morning Oracle] Audio transcription failed:', err);
        setStatusMessage({
          type: 'error',
          text: err.message || 'Failed to transcribe audio. Please try again or type below.',
        });
      } finally {
        setIsTranscribing(false);
      }
    },
    [selectedLang]
  );

  // Stop recording cleanly
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {
        console.warn('[Morning Oracle] Error stopping MediaRecorder:', e);
      }
    }
    setIsRecording(false);
  }, []);

  // Start recording using standard MediaRecorder
  const startRecording = useCallback(async () => {
    setStatusMessage(null);
    audioChunksRef.current = [];

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setStatusMessage({
        type: 'error',
        text: 'Audio recording is not supported in this browser. Please type below.',
      });
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      audioStreamRef.current = stream;

      // Select supported audio mime type
      let mimeType = 'audio/webm;codecs=opus';
      if (typeof MediaRecorder.isTypeSupported === 'function') {
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
          mimeType = 'audio/webm;codecs=opus';
        } else if (MediaRecorder.isTypeSupported('audio/webm')) {
          mimeType = 'audio/webm';
        } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
          mimeType = 'audio/mp4';
        } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
          mimeType = 'audio/ogg';
        } else {
          mimeType = '';
        }
      }

      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        console.log('[Morning Oracle] MediaRecorder stopped. Assembling audio payload...');
        const finalType = recorder.mimeType || mimeType || 'audio/webm';
        const audioBlob = new Blob(audioChunksRef.current, { type: finalType });

        // Release hardware mic tracks
        if (audioStreamRef.current) {
          audioStreamRef.current.getTracks().forEach((track) => track.stop());
          audioStreamRef.current = null;
        }

        // Send to backend for AI transcription
        sendAudioForTranscription(audioBlob, finalType);
      };

      recorder.onerror = (e) => {
        console.error('[Morning Oracle] MediaRecorder error event:', e);
        stopRecording();
      };

      recorder.start(250); // Slice audio every 250ms
      setIsRecording(true);
      console.log('[Morning Oracle] MediaRecorder started successfully with mimeType:', recorder.mimeType || mimeType);
    } catch (err: any) {
      console.error('[Morning Oracle] Failed to access microphone:', err);
      setIsRecording(false);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setStatusMessage({
          type: 'error',
          text: 'Microphone permission is required. Please grant access in your browser settings.',
        });
      } else {
        setStatusMessage({
          type: 'error',
          text: 'Could not access microphone hardware. Please check your device settings.',
        });
      }
    }
  }, [sendAudioForTranscription, stopRecording]);

  // Toggle button handler
  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  // Language Change handler
  const handleLangChange = (langCode: string) => {
    setSelectedLang(langCode);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('morning_oracle_voice_lang', langCode);
      } catch (e) {
        // ignore
      }
    }
    if (isRecording) {
      stopRecording();
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop();
        } catch (e) {
          // ignore
        }
      }
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // Save idea to Supabase
  const handleSaveIdea = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanText = transcript.trim();
    if (!cleanText) return;

    if (isRecording) {
      stopRecording();
    }

    setIsSaving(true);
    setStatusMessage(null);

    const payload = {
      text: cleanText,
      status: 'inbox' as const,
    };

    try {
      console.log('[Morning Oracle] Inserting idea to Supabase ideas table:', payload);
      const { data, error } = await supabase
        .from('ideas')
        .insert([payload])
        .select()
        .single();

      if (error) {
        console.error('[Morning Oracle] Supabase insert error details:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
          fullError: error,
        });
        const errorDetail = error.message || error.details || error.hint || `Error code: ${error.code}`;
        setStatusMessage({ type: 'error', text: `Supabase Error: ${errorDetail}` });
        return;
      }

      setTranscript('');
      setStatusMessage({ type: 'success', text: 'Idea captured to Inbox!' });
      if (data) {
        onIdeaSaved(data as Idea);
      }
    } catch (err: any) {
      console.error('[Morning Oracle] Unexpected error saving idea:', err);
      const msg = err?.message || 'Network / server communication error';
      setStatusMessage({ type: 'error', text: msg });
    } finally {
      setIsSaving(false);
      setTimeout(() => {
        setStatusMessage(null);
      }, 5000);
    }
  };

  return (
    <section className="w-full max-w-md mx-auto p-4 mb-6">
      <div className="glass-card rounded-2xl p-5 border border-oracle-border/80 relative overflow-hidden shadow-glass">
        {/* Glow effect backdrop */}
        <div
          className={`absolute -top-24 -right-24 w-48 h-48 rounded-full blur-3xl transition-opacity duration-500 pointer-events-none ${
            isRecording
              ? 'bg-oracle-magenta/35 opacity-100 animate-pulse'
              : isTranscribing
              ? 'bg-oracle-cyan/30 opacity-100 animate-pulse'
              : isFormatting
              ? 'bg-oracle-cyan/20 opacity-80'
              : 'bg-oracle-cyan/10 opacity-50'
          }`}
        />

        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-4 h-4 text-oracle-cyan" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-200">
              Voice Capture
            </h2>
          </div>

          <div className="flex items-center space-x-2">
            {/* Language Selector: RU & EN */}
            <div className="flex items-center bg-oracle-dark rounded-lg p-0.5 border border-oracle-border/60 text-[10px] font-mono">
              <Globe className="w-3 h-3 text-oracle-muted mx-1" />
              {SUPPORTED_LANGUAGES.map((lang) => (
                <button
                  key={lang.code}
                  type="button"
                  onClick={() => handleLangChange(lang.code)}
                  className={`px-2 py-0.5 rounded transition ${
                    selectedLang === lang.code
                      ? 'bg-oracle-cyan/20 text-oracle-cyan font-bold border border-oracle-cyan/40'
                      : 'text-oracle-muted hover:text-white'
                  }`}
                  title={`Recognition language: ${lang.code}`}
                >
                  {lang.label}
                </button>
              ))}
            </div>

            <span
              className={`text-[10px] uppercase font-mono px-2 py-0.5 rounded-full border transition-all ${
                isRecording
                  ? 'bg-oracle-magenta/20 border-oracle-magenta text-oracle-magenta animate-pulse'
                  : isTranscribing
                  ? 'bg-oracle-cyan/20 border-oracle-cyan text-oracle-cyan animate-pulse'
                  : isFormatting
                  ? 'bg-oracle-cyan/20 border-oracle-cyan text-oracle-cyan'
                  : 'bg-oracle-card border-oracle-border text-oracle-muted'
              }`}
            >
              {isRecording
                ? 'Recording...'
                : isTranscribing
                ? 'Transcribing...'
                : isFormatting
                ? 'Formatting...'
                : 'Ready'}
            </span>
          </div>
        </div>

        {/* Mic Button area */}
        <div className="flex flex-col items-center justify-center my-4">
          <div className="relative">
            {isRecording && (
              <>
                <span className="absolute inset-0 rounded-full border-2 border-oracle-magenta animate-ping opacity-75" />
                <span className="absolute -inset-2 rounded-full bg-oracle-magenta/25 animate-pulse" />
              </>
            )}
            <button
              onClick={toggleRecording}
              disabled={isTranscribing}
              type="button"
              className={`relative z-10 w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 transform active:scale-95 ${
                isRecording
                  ? 'bg-oracle-magenta text-white shadow-magenta-glow scale-105'
                  : isTranscribing
                  ? 'bg-oracle-card border-2 border-oracle-cyan text-oracle-cyan shadow-cyan-glow cursor-wait'
                  : 'bg-oracle-card border-2 border-oracle-border hover:border-oracle-cyan text-oracle-cyan hover:shadow-cyan-glow'
              }`}
              title={
                isRecording
                  ? 'Tap to stop recording'
                  : isTranscribing
                  ? 'Transcribing audio with Gemini...'
                  : `Tap to record audio (${selectedLang})`
              }
            >
              {isRecording ? (
                <MicOff className="w-8 h-8 animate-bounce" />
              ) : isTranscribing ? (
                <Loader2 className="w-8 h-8 animate-spin text-oracle-cyan" />
              ) : (
                <Mic className="w-8 h-8" />
              )}
            </button>
          </div>
          <p className="text-xs text-oracle-muted mt-3 text-center flex items-center justify-center gap-1.5">
            {isRecording ? (
              <span className="text-oracle-magenta font-mono animate-pulse">
                Recording audio... (tap to finish)
              </span>
            ) : isTranscribing ? (
              <span className="text-oracle-cyan font-mono animate-pulse flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" />
                Transcribing with Gemini AI... ✨
              </span>
            ) : isFormatting ? (
              <span className="text-oracle-cyan font-mono animate-pulse">
                Polishing punctuation with AI... ✨
              </span>
            ) : (
              <span>Tap microphone to record voice note</span>
            )}
          </p>
        </div>

        {/* Text Area & Controls */}
        <form onSubmit={handleSaveIdea} className="space-y-3 mt-4">
          <div className="relative">
            <textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder={
                selectedLang === 'en-US'
                  ? 'e.g. Buy milk, review quarterly presentation, call team...'
                  : 'e.g. Купить молоко, проверить презентацию, созвониться с командой...'
              }
              rows={3}
              className="w-full bg-oracle-dark/90 border border-oracle-border focus:border-oracle-cyan focus:ring-1 focus:ring-oracle-cyan/50 rounded-xl p-3 text-sm text-white placeholder-gray-500 outline-none resize-none transition-all"
            />
            <div className="absolute top-2 right-2 flex items-center space-x-1">
              {transcript.trim() && !isFormatting && !isTranscribing && (
                <button
                  type="button"
                  onClick={() => formatTextWithAI(transcript)}
                  className="text-xs text-oracle-cyan hover:text-white px-2 py-0.5 bg-oracle-border/50 hover:bg-oracle-border rounded-md flex items-center space-x-1"
                  title="Format with Gemini AI"
                >
                  <Wand2 className="w-3 h-3" />
                  <span className="text-[10px]">AI Fix</span>
                </button>
              )}
              {transcript.trim() && (
                <button
                  type="button"
                  onClick={() => setTranscript('')}
                  className="text-xs text-oracle-muted hover:text-white px-2 py-0.5 bg-oracle-border/50 rounded-md"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[11px] text-oracle-muted font-mono">
              {transcript.trim().length} chars
            </span>
            <button
              type="submit"
              disabled={!transcript.trim() || isSaving || isTranscribing || isFormatting}
              className={`flex items-center space-x-2 px-5 py-2.5 rounded-xl font-semibold text-xs tracking-wide transition-all ${
                transcript.trim() && !isSaving && !isTranscribing && !isFormatting
                  ? 'bg-oracle-cyan text-oracle-dark hover:bg-cyan-300 shadow-cyan-glow cursor-pointer'
                  : 'bg-oracle-border/50 text-oracle-muted cursor-not-allowed border border-oracle-border'
              }`}
            >
              {isSaving ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : isTranscribing ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-oracle-dark" />
                  <span>Transcribing...</span>
                </>
              ) : isFormatting ? (
                <>
                  <Wand2 className="w-3.5 h-3.5 animate-spin text-oracle-dark" />
                  <span>Formatting...</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>Capture to Inbox</span>
                </>
              )}
            </button>
          </div>
        </form>

        {/* Status Toast / Error Display */}
        {statusMessage && (
          <div
            className={`mt-3 p-3 rounded-xl text-xs flex items-start space-x-2 animate-fadeIn ${
              statusMessage.type === 'success'
                ? 'bg-oracle-cyan/15 border border-oracle-cyan/40 text-oracle-cyan'
                : 'bg-oracle-magenta/15 border border-oracle-magenta/40 text-oracle-magenta'
            }`}
          >
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            )}
            <span className="break-words font-mono text-[11px] leading-relaxed">
              {statusMessage.text}
            </span>
          </div>
        )}
      </div>
    </section>
  );
}

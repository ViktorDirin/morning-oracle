'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, MicOff, Send, Sparkles, CheckCircle2, AlertCircle, RefreshCw, Globe, Wand2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Idea } from '@/lib/types';

interface VoiceCaptureProps {
  onIdeaSaved: (newIdea: Idea) => void;
}

const SUPPORTED_LANGUAGES = [
  { code: 'ru-RU', label: 'RU' },
  { code: 'en-US', label: 'EN' },
  { code: 'uk-UA', label: 'UA' },
];

export function VoiceCapture({ onIdeaSaved }: VoiceCaptureProps) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimText, setInterimText] = useState('');
  const [selectedLang, setSelectedLang] = useState('ru-RU');
  const [isSaving, setIsSaving] = useState(false);
  const [isFormatting, setIsFormatting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isSpeechSupported, setIsSpeechSupported] = useState(true);

  const recognitionRef = useRef<any>(null);
  const isExplicitStopRef = useRef(false);
  const accumulatedTextRef = useRef('');

  // Check Web Speech API availability on mount
  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setIsSpeechSupported(false);
    }
  }, []);

  // Format transcribed text with Gemini AI via /api/format-idea
  const formatTextWithAI = useCallback(async (rawText: string) => {
    if (!rawText || !rawText.trim() || rawText.trim().length < 3) return;

    setIsFormatting(true);
    try {
      console.log('[Morning Oracle] Requesting AI formatting for:', rawText);
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
          accumulatedTextRef.current = data.formattedText;
        }
      }
    } catch (err) {
      console.warn('[Morning Oracle] AI formatting request error:', err);
    } finally {
      setIsFormatting(false);
    }
  }, []);

  // Cleanup helper to abort and detach any existing instance
  const cleanupRecognition = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.onstart = null;
        recognitionRef.current.abort();
      } catch (e) {
        // ignore
      }
      recognitionRef.current = null;
    }
  }, []);

  // Stop listening cleanly & trigger AI formatting
  const stopListening = useCallback(() => {
    isExplicitStopRef.current = true;
    setIsListening(false);
    setInterimText('');
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {
        // ignore
      }
    }

    // Format final accumulated text with AI
    const finalTextToFormat = (transcript + (interimText ? ` ${interimText}` : '')).trim();
    if (finalTextToFormat) {
      formatTextWithAI(finalTextToFormat);
    }
  }, [transcript, interimText, formatTextWithAI]);

  // Start listening session optimized for Android Chrome & Desktop
  const startListening = useCallback(async () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setStatusMessage({
        type: 'error',
        text: 'Voice recognition is not supported in this browser. Please type below.',
      });
      return;
    }

    setStatusMessage(null);
    setInterimText('');
    isExplicitStopRef.current = false;

    // Explicit audio permission warm-up for mobile Android
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
      } catch (err: any) {
        console.warn('[Morning Oracle] getUserMedia permission check rejected:', err);
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          setStatusMessage({
            type: 'error',
            text: 'Microphone permission is required. Please allow microphone access in your browser settings.',
          });
          return;
        }
      }
    }

    // Clean up previous instance
    cleanupRecognition();

    try {
      const recognition = new SpeechRecognition();
      
      // Configuration for high stability on Android Chrome / Pixel:
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      recognition.lang = selectedLang;

      recognition.onstart = () => {
        console.log('[Morning Oracle] Speech recognition session started with lang:', selectedLang);
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        let finalChunk = '';
        let currentInterim = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const item = event.results[i];
          const textChunk = item[0]?.transcript || '';

          if (item.isFinal) {
            finalChunk += textChunk;
          } else {
            currentInterim += textChunk;
          }
        }

        if (finalChunk) {
          setTranscript((prev) => {
            const trimmedPrev = prev.trim();
            const trimmedFinal = finalChunk.trim();
            const combined = trimmedPrev ? `${trimmedPrev} ${trimmedFinal}` : trimmedFinal;
            accumulatedTextRef.current = combined;
            return combined;
          });
          setInterimText('');
        } else {
          setInterimText(currentInterim);
        }
      };

      recognition.onerror = (event: any) => {
        console.warn('[Morning Oracle] Speech recognition error event:', event.error);
        
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          setIsListening(false);
          setStatusMessage({
            type: 'error',
            text: 'Microphone permission is required. Please grant microphone access in your browser settings.',
          });
        } else if (event.error === 'no-speech') {
          // Gracefully ignore no-speech timeouts on mobile
          console.log('[Morning Oracle] No speech detected.');
        } else if (event.error === 'aborted') {
          // Silent handling for manual stops
        } else {
          setIsListening(false);
          setStatusMessage({
            type: 'error',
            text: `Speech recognition notice: ${event.error}`,
          });
        }
      };

      recognition.onend = () => {
        console.log('[Morning Oracle] Speech recognition session ended.');
        setIsListening(false);
        setInterimText('');

        // Trigger AI formatting automatically after utterance concludes
        if (!isExplicitStopRef.current && accumulatedTextRef.current) {
          formatTextWithAI(accumulatedTextRef.current);
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err: any) {
      console.error('[Morning Oracle] Exception starting SpeechRecognition:', err);
      setIsListening(false);
      setStatusMessage({
        type: 'error',
        text: 'Failed to start voice capture. Please check microphone permissions or type below.',
      });
    }
  }, [selectedLang, cleanupRecognition, formatTextWithAI]);

  // Toggle button handler
  const toggleListening = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  // Language Change handler
  const handleLangChange = (langCode: string) => {
    setSelectedLang(langCode);
    if (isListening) {
      stopListening();
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupRecognition();
    };
  }, [cleanupRecognition]);

  // Save idea to Supabase
  const handleSaveIdea = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanText = (transcript + (interimText ? ` ${interimText}` : '')).trim();
    if (!cleanText) return;

    if (isListening) {
      stopListening();
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
      setInterimText('');
      accumulatedTextRef.current = '';
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

  const displayText = transcript + (interimText ? (transcript ? ` ${interimText}` : interimText) : '');

  return (
    <section className="w-full max-w-md mx-auto p-4 mb-6">
      <div className="glass-card rounded-2xl p-5 border border-oracle-border/80 relative overflow-hidden shadow-glass">
        {/* Glow effect backdrop */}
        <div
          className={`absolute -top-24 -right-24 w-48 h-48 rounded-full blur-3xl transition-opacity duration-500 pointer-events-none ${
            isListening
              ? 'bg-oracle-cyan/30 opacity-100'
              : isFormatting
              ? 'bg-oracle-magenta/25 opacity-100'
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
            {/* Language Selector */}
            <div className="flex items-center bg-oracle-dark rounded-lg p-0.5 border border-oracle-border/60 text-[10px] font-mono">
              <Globe className="w-3 h-3 text-oracle-muted mx-1" />
              {SUPPORTED_LANGUAGES.map((lang) => (
                <button
                  key={lang.code}
                  type="button"
                  onClick={() => handleLangChange(lang.code)}
                  className={`px-1.5 py-0.5 rounded transition ${
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
                isListening
                  ? 'bg-oracle-cyan/20 border-oracle-cyan text-oracle-cyan animate-pulse'
                  : isFormatting
                  ? 'bg-oracle-magenta/20 border-oracle-magenta text-oracle-magenta animate-pulse'
                  : 'bg-oracle-card border-oracle-border text-oracle-muted'
              }`}
            >
              {isListening ? 'Listening...' : isFormatting ? 'Formatting...' : 'Ready'}
            </span>
          </div>
        </div>

        {/* Mic Button area */}
        <div className="flex flex-col items-center justify-center my-4">
          <div className="relative">
            {isListening && (
              <>
                <span className="absolute inset-0 rounded-full border-2 border-oracle-cyan animate-ping opacity-75" />
                <span className="absolute -inset-2 rounded-full bg-oracle-cyan/20 animate-pulse" />
              </>
            )}
            <button
              onClick={toggleListening}
              type="button"
              className={`relative z-10 w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 transform active:scale-95 ${
                isListening
                  ? 'bg-oracle-cyan text-oracle-dark shadow-cyan-glow scale-105'
                  : isFormatting
                  ? 'bg-oracle-card border-2 border-oracle-magenta text-oracle-magenta shadow-magenta-glow'
                  : 'bg-oracle-card border-2 border-oracle-border hover:border-oracle-cyan text-oracle-cyan hover:shadow-cyan-glow'
              }`}
              title={isListening ? 'Stop listening' : `Start voice recording (${selectedLang})`}
            >
              {isListening ? (
                <MicOff className="w-8 h-8 animate-bounce" />
              ) : isFormatting ? (
                <Wand2 className="w-8 h-8 animate-spin text-oracle-magenta" />
              ) : (
                <Mic className="w-8 h-8" />
              )}
            </button>
          </div>
          <p className="text-xs text-oracle-muted mt-3 text-center flex items-center justify-center gap-1.5">
            {isListening ? (
              <span>Listening in {selectedLang}... (tap to finish)</span>
            ) : isFormatting ? (
              <span className="text-oracle-magenta font-mono animate-pulse">
                Polishing punctuation with AI... ✨
              </span>
            ) : isSpeechSupported ? (
              <span>Tap the microphone or type below</span>
            ) : (
              <span>Voice recognition unavailable. Type below:</span>
            )}
          </p>
        </div>

        {/* Text Area & Controls */}
        <form onSubmit={handleSaveIdea} className="space-y-3 mt-4">
          <div className="relative">
            <textarea
              value={displayText}
              onChange={(e) => {
                setTranscript(e.target.value);
                setInterimText('');
                accumulatedTextRef.current = e.target.value;
              }}
              placeholder="e.g. Купить молоко, проверить отчет, позвонить коллеге..."
              rows={3}
              className="w-full bg-oracle-dark/90 border border-oracle-border focus:border-oracle-cyan focus:ring-1 focus:ring-oracle-cyan/50 rounded-xl p-3 text-sm text-white placeholder-gray-500 outline-none resize-none transition-all"
            />
            <div className="absolute top-2 right-2 flex items-center space-x-1">
              {displayText.trim() && !isFormatting && (
                <button
                  type="button"
                  onClick={() => formatTextWithAI(displayText)}
                  className="text-xs text-oracle-cyan hover:text-white px-2 py-0.5 bg-oracle-border/50 hover:bg-oracle-border rounded-md flex items-center space-x-1"
                  title="Format with Gemini AI"
                >
                  <Wand2 className="w-3 h-3" />
                  <span className="text-[10px]">AI Fix</span>
                </button>
              )}
              {displayText.trim() && (
                <button
                  type="button"
                  onClick={() => {
                    setTranscript('');
                    setInterimText('');
                    accumulatedTextRef.current = '';
                  }}
                  className="text-xs text-oracle-muted hover:text-white px-2 py-0.5 bg-oracle-border/50 rounded-md"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[11px] text-oracle-muted font-mono">
              {displayText.trim().length} chars
            </span>
            <button
              type="submit"
              disabled={!displayText.trim() || isSaving || isFormatting}
              className={`flex items-center space-x-2 px-5 py-2.5 rounded-xl font-semibold text-xs tracking-wide transition-all ${
                displayText.trim() && !isSaving && !isFormatting
                  ? 'bg-oracle-cyan text-oracle-dark hover:bg-cyan-300 shadow-cyan-glow cursor-pointer'
                  : 'bg-oracle-border/50 text-oracle-muted cursor-not-allowed border border-oracle-border'
              }`}
            >
              {isSaving ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : isFormatting ? (
                <>
                  <Wand2 className="w-3.5 h-3.5 animate-spin text-oracle-dark" />
                  <span>AI Formatting...</span>
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

        {/* Status Toast / Detailed Error Display */}
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

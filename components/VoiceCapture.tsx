'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Send, Sparkles, CheckCircle2, AlertCircle, RefreshCw, Globe } from 'lucide-react';
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
  const [selectedLang, setSelectedLang] = useState('ru-RU');
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isSpeechSupported, setIsSpeechSupported] = useState(true);
  
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    // Check Web Speech API availability
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setIsSpeechSupported(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = selectedLang;

    recognition.onresult = (event: any) => {
      let currentTranscript = '';
      for (let i = 0; i < event.results.length; i++) {
        currentTranscript += event.results[i][0].transcript;
      }
      setTranscript(currentTranscript);
    };

    recognition.onerror = (event: any) => {
      console.error('[Morning Oracle] Speech recognition error event:', event);
      setIsListening(false);
      if (event.error !== 'no-speech') {
        setStatusMessage({ type: 'error', text: `Speech error: ${event.error}` });
      }
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {
          // ignore cleanup errors
        }
      }
    };
  }, [selectedLang]);

  const toggleListening = () => {
    if (!isSpeechSupported) {
      setStatusMessage({ type: 'error', text: 'Voice recognition not supported in this browser. Type below!' });
      return;
    }

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      setStatusMessage(null);
      try {
        if (recognitionRef.current) {
          recognitionRef.current.lang = selectedLang;
          recognitionRef.current.start();
          setIsListening(true);
        }
      } catch (err) {
        console.error('[Morning Oracle] Failed to start speech recognition:', err);
        setIsListening(false);
      }
    }
  };

  const handleLangChange = (langCode: string) => {
    setSelectedLang(langCode);
    if (recognitionRef.current) {
      recognitionRef.current.lang = langCode;
      if (isListening) {
        recognitionRef.current.stop();
        setIsListening(false);
      }
    }
  };

  const handleSaveIdea = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanText = transcript.trim();
    if (!cleanText) return;

    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
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
        <div className={`absolute -top-24 -right-24 w-48 h-48 rounded-full blur-3xl transition-opacity duration-500 pointer-events-none ${
          isListening ? 'bg-oracle-cyan/30 opacity-100' : 'bg-oracle-cyan/10 opacity-50'
        }`} />

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

            <span className={`text-[10px] uppercase font-mono px-2 py-0.5 rounded-full border ${
              isListening 
                ? 'bg-oracle-cyan/20 border-oracle-cyan text-oracle-cyan animate-pulse' 
                : 'bg-oracle-card border-oracle-border text-oracle-muted'
            }`}>
              {isListening ? 'Listening...' : 'Ready'}
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
                  : 'bg-oracle-card border-2 border-oracle-border hover:border-oracle-cyan text-oracle-cyan hover:shadow-cyan-glow'
              }`}
              title={isListening ? 'Stop listening' : `Start voice recording (${selectedLang})`}
            >
              {isListening ? (
                <MicOff className="w-8 h-8 animate-bounce" />
              ) : (
                <Mic className="w-8 h-8" />
              )}
            </button>
          </div>
          <p className="text-xs text-oracle-muted mt-3 text-center">
            {isListening ? `Speaking in ${selectedLang}...` : 'Tap the microphone or type below'}
          </p>
        </div>

        {/* Text Area & Controls */}
        <form onSubmit={handleSaveIdea} className="space-y-3 mt-4">
          <div className="relative">
            <textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="e.g. Купить молоко, проверить презентацию, обсудить проект..."
              rows={3}
              className="w-full bg-oracle-dark/90 border border-oracle-border focus:border-oracle-cyan focus:ring-1 focus:ring-oracle-cyan/50 rounded-xl p-3 text-sm text-white placeholder-gray-500 outline-none resize-none transition-all"
            />
            {transcript.trim() && (
              <button
                type="button"
                onClick={() => setTranscript('')}
                className="absolute top-2 right-2 text-xs text-oracle-muted hover:text-white px-2 py-0.5 bg-oracle-border/50 rounded-md"
              >
                Clear
              </button>
            )}
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[11px] text-oracle-muted font-mono">
              {transcript.trim().length} chars
            </span>
            <button
              type="submit"
              disabled={!transcript.trim() || isSaving}
              className={`flex items-center space-x-2 px-5 py-2.5 rounded-xl font-semibold text-xs tracking-wide transition-all ${
                transcript.trim() && !isSaving
                  ? 'bg-oracle-cyan text-oracle-dark hover:bg-cyan-300 shadow-cyan-glow cursor-pointer'
                  : 'bg-oracle-border/50 text-oracle-muted cursor-not-allowed border border-oracle-border'
              }`}
            >
              {isSaving ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving...</span>
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
          <div className={`mt-3 p-3 rounded-xl text-xs flex items-start space-x-2 animate-fadeIn ${
            statusMessage.type === 'success' 
              ? 'bg-oracle-cyan/15 border border-oracle-cyan/40 text-oracle-cyan' 
              : 'bg-oracle-magenta/15 border border-oracle-magenta/40 text-oracle-magenta'
          }`}>
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            )}
            <span className="break-words font-mono text-[11px] leading-relaxed">{statusMessage.text}</span>
          </div>
        )}
      </div>
    </section>
  );
}

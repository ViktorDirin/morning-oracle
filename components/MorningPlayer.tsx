'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  X,
  Volume2,
  Sparkles,
  CheckCircle,
  Radio,
  ListTodo,
  Music,
  Globe
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Idea, Settings } from '@/lib/types';

interface MorningPlayerProps {
  isOpen: boolean;
  onClose: () => void;
  ideas?: Idea[];
  settings?: Settings | null;
}

interface BroadcastTrack {
  id: string;
  title: string;
  category: string;
  iconType: 'music' | 'radio' | 'tasks';
  estimatedDuration: number;
}

const REMOTE_NEWS_AUDIO_RU =
  'https://ignakecyqbkwznubymue.supabase.co/storage/v1/object/public/morning_audio/today_news.mp3';
const REMOTE_NEWS_AUDIO_EN =
  'https://ignakecyqbkwznubymue.supabase.co/storage/v1/object/public/morning_audio/today_news_en.mp3';

const TOPIC_NAMES_RU: Record<string, string> = {
  technology: 'технологии',
  ai: 'искусственный интеллект',
  finance: 'финансы и рынки',
  world: 'мировые новости',
  science: 'наука и космос',
  crypto: 'криптовалюты',
  startups: 'стартапы и бизнес',
};

const TOPIC_NAMES_EN: Record<string, string> = {
  technology: 'technology',
  ai: 'artificial intelligence',
  finance: 'finance & markets',
  world: 'world news',
  science: 'science & space',
  crypto: 'crypto & web3',
  startups: 'startups & business',
};

// Generate an exact 5-second in-memory audio WAV chime sequence
function createChimeAudioBlobUrl(): string {
  try {
    const sampleRate = 22050;
    const duration = 5;
    const numSamples = sampleRate * duration;
    const buffer = new Float32Array(numSamples);

    // 3 harmonic chime tones at 0s, 1.6s, 3.2s
    const chimeEvents = [
      { time: 0.0, freq: 523.25 }, // C5
      { time: 1.6, freq: 659.25 }, // E5
      { time: 3.2, freq: 783.99 }, // G5
    ];

    for (const { time, freq } of chimeEvents) {
      const startSample = Math.floor(time * sampleRate);
      const noteSamples = Math.min(Math.floor(sampleRate * 1.8), numSamples - startSample);
      for (let i = 0; i < noteSamples; i++) {
        const t = i / sampleRate;
        const decay = Math.exp(-t * 2.5);
        const val =
          (Math.sin(2 * Math.PI * freq * t) * 0.7 + Math.sin(2 * Math.PI * freq * 2 * t) * 0.3) *
          decay *
          0.4;
        buffer[startSample + i] += val;
      }
    }

    const wavBuffer = new ArrayBuffer(44 + numSamples * 2);
    const view = new DataView(wavBuffer);

    // RIFF header
    writeAsciiString(view, 0, 'RIFF');
    view.setUint32(4, 36 + numSamples * 2, true);
    writeAsciiString(view, 8, 'WAVE');
    // fmt chunk
    writeAsciiString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // Mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    // data chunk
    writeAsciiString(view, 36, 'data');
    view.setUint32(40, numSamples * 2, true);

    let offset = 44;
    for (let i = 0; i < numSamples; i++) {
      const s = Math.max(-1, Math.min(1, buffer[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }

    const blob = new Blob([wavBuffer], { type: 'audio/wav' });
    return URL.createObjectURL(blob);
  } catch (e) {
    console.warn('[Morning Oracle] Blob URL generation fallback error:', e);
    return '';
  }
}

function writeAsciiString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

export function MorningPlayer({
  isOpen,
  onClose,
  ideas = [],
  settings = null,
}: MorningPlayerProps) {
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [track2Duration, setTrack2Duration] = useState(25);
  const [isCompleted, setIsCompleted] = useState(false);
  const [activeTaskIndex, setActiveTaskIndex] = useState<number | null>(null);
  const [digestLang, setDigestLang] = useState<'ru' | 'en'>('ru');

  const [chimeAudioUrl, setChimeAudioUrl] = useState<string>('');
  const [liveTomorrowTasks, setLiveTomorrowTasks] = useState<Idea[]>([]);

  const activeTrackIndexRef = useRef(0);
  const chimeAudioRef = useRef<HTMLAudioElement | null>(null);
  const newsAudioRef = useRef<HTMLAudioElement | null>(null);
  const progressTimerRef = useRef<any>(null);
  const isTaskSpeechAbortedRef = useRef(false);
  const wasOpenRef = useRef(false);

  // Read language preference from localStorage
  const refreshDigestLang = useCallback(() => {
    if (typeof window !== 'undefined') {
      try {
        const savedLang = localStorage.getItem('oracle_digest_lang');
        if (savedLang === 'en' || savedLang === 'ru') {
          setDigestLang(savedLang);
        }
      } catch (e) {
        // ignore
      }
    }
  }, []);

  useEffect(() => {
    refreshDigestLang();

    const handleLangChange = () => {
      refreshDigestLang();
    };

    window.addEventListener('oracle_digest_lang_changed', handleLangChange);
    return () => {
      window.removeEventListener('oracle_digest_lang_changed', handleLangChange);
    };
  }, [refreshDigestLang]);

  // Live tasks array reference
  const tasksToSpeakRef = useRef<Idea[]>([]);
  tasksToSpeakRef.current =
    liveTomorrowTasks.length > 0 ? liveTomorrowTasks : ideas.filter((i) => i.status === 'tomorrow');

  const newsTopics = settings?.news_topics || ['technology', 'ai', 'world'];
  const topicsFormatted =
    digestLang === 'en'
      ? newsTopics.map((t) => TOPIC_NAMES_EN[t] || t).join(', ')
      : newsTopics.map((t) => TOPIC_NAMES_RU[t] || t).join(', ');

  const tracks: BroadcastTrack[] = [
    {
      id: 'track-1',
      title: 'Sunrise Ambient Chimes (5s)',
      category: 'Wake-up Melody',
      iconType: 'music',
      estimatedDuration: 5,
    },
    {
      id: 'track-2',
      title: `AI News Briefing [${digestLang.toUpperCase()}] (${topicsFormatted})`,
      category: 'AI News Briefing',
      iconType: 'radio',
      estimatedDuration: track2Duration,
    },
    {
      id: 'track-3',
      title: `${tasksToSpeakRef.current.length > 0 ? tasksToSpeakRef.current.length : '0'} Priority Items for Today`,
      category: "Today's Tasks Breakdown",
      iconType: 'tasks',
      estimatedDuration: tasksToSpeakRef.current.length > 0 ? Math.max(12, tasksToSpeakRef.current.length * 6) : 6,
    },
  ];

  // Fetch fresh 'tomorrow' tasks directly from Supabase
  const fetchLiveTasks = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('ideas')
        .select('*')
        .eq('status', 'tomorrow')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[Morning Oracle] Error fetching live tomorrow tasks:', error);
      } else if (data) {
        console.log('[Morning Oracle] Live tomorrow tasks fetched from Supabase:', data);
        setLiveTomorrowTasks(data as Idea[]);
      }
    } catch (err) {
      console.error('[Morning Oracle] Failed to connect to Supabase for tomorrow tasks:', err);
    }
  }, []);

  // Initialize chime audio blob URL once on client mount
  useEffect(() => {
    const url = createChimeAudioBlobUrl();
    setChimeAudioUrl(url);

    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, []);

  // Stop all active audio elements and speech synthesis
  const stopCurrentAudio = useCallback(() => {
    isTaskSpeechAbortedRef.current = true;
    setActiveTaskIndex(null);

    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
    if (chimeAudioRef.current) {
      chimeAudioRef.current.pause();
      chimeAudioRef.current.currentTime = 0;
    }
    if (newsAudioRef.current) {
      newsAudioRef.current.pause();
      newsAudioRef.current.currentTime = 0;
      newsAudioRef.current.onended = null;
      newsAudioRef.current.onerror = null;
      newsAudioRef.current.ontimeupdate = null;
      newsAudioRef.current = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }, []);

  // Helper to speak a single text chunk with Promise resolution on end
  const speakTextChunk = useCallback((text: string, lang = 'ru-RU'): Promise<void> => {
    return new Promise((resolve) => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
        resolve();
        return;
      }

      if (isTaskSpeechAbortedRef.current) {
        resolve();
        return;
      }

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang;
      utterance.rate = 0.95; // Natural pacing
      utterance.pitch = 1.0;

      const voices = window.speechSynthesis.getVoices();
      const langPrefix = lang.split('-')[0].toLowerCase();
      const matchedVoice = voices.find((v) => v.lang.toLowerCase().startsWith(langPrefix));
      if (matchedVoice) {
        utterance.voice = matchedVoice;
      }

      utterance.onend = () => {
        resolve();
      };

      utterance.onerror = (e) => {
        console.warn('[Morning Oracle Speech Error]:', e);
        resolve();
      };

      setTimeout(() => {
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
        window.speechSynthesis.speak(utterance);
      }, 50);
    });
  }, []);

  // Advance to next track in queue
  const advanceToNextTrack = useCallback(() => {
    const nextIndex = activeTrackIndexRef.current + 1;
    if (nextIndex < 3) {
      playTrack(nextIndex);
    } else {
      stopCurrentAudio();
      setIsPlaying(false);
      setIsCompleted(true);
      console.log('[Morning Oracle] Morning broadcast queue finished.');
    }
  }, [stopCurrentAudio]);

  // Stage 3: Sequential Task Readout Engine with Multi-language support & 500ms Pauses
  const playSequentialTaskSpeech = useCallback(async () => {
    isTaskSpeechAbortedRef.current = false;
    setActiveTaskIndex(null);

    const currentTasks = tasksToSpeakRef.current;
    const isEn = digestLang === 'en';
    const speechLang = isEn ? 'en-US' : 'ru-RU';

    console.log(`[Morning Oracle Stage 3] Starting sequential task readout (${speechLang}):`, currentTasks);

    if (currentTasks.length === 0) {
      // Empty task list case
      const emptyPhrase = isEn
        ? 'Your task list is empty. Have a great day!'
        : 'Список задач пуст. Отличного дня!';
      await speakTextChunk(emptyPhrase, speechLang);
      if (!isTaskSpeechAbortedRef.current && activeTrackIndexRef.current === 2) {
        advanceToNextTrack();
      }
      return;
    }

    // 1. Introductory Cue (Language Specific)
    const introPhrase = isEn ? 'Your task list.' : 'Твой список задач.';
    await speakTextChunk(introPhrase, speechLang);

    if (isTaskSpeechAbortedRef.current || activeTrackIndexRef.current !== 2) return;

    // ~500ms pause after intro cue
    await new Promise((r) => setTimeout(r, 500));

    // 2. Iterate through each task sequentially with ~500ms pauses
    for (let i = 0; i < currentTasks.length; i++) {
      if (isTaskSpeechAbortedRef.current || activeTrackIndexRef.current !== 2) {
        break;
      }

      setActiveTaskIndex(i);
      const task = currentTasks[i];
      const taskSpeechText = isEn
        ? `Task ${i + 1}. ${task.text}`
        : `Задача ${i + 1}. ${task.text}`;

      await speakTextChunk(taskSpeechText, speechLang);

      if (isTaskSpeechAbortedRef.current || activeTrackIndexRef.current !== 2) {
        break;
      }

      // ~500ms clean delay between tasks
      if (i < currentTasks.length - 1) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    setActiveTaskIndex(null);

    if (!isTaskSpeechAbortedRef.current && activeTrackIndexRef.current === 2) {
      console.log('[Morning Oracle Stage 3] All tasks read. Concluding broadcast.');
      advanceToNextTrack();
    }
  }, [digestLang, speakTextChunk, advanceToNextTrack]);

  // Track 2 Speech fallback
  const playNewsSpeechFallback = useCallback(async () => {
    const isEn = digestLang === 'en';
    const speechLang = isEn ? 'en-US' : 'ru-RU';

    let textToSpeak = '';
    if (isEn) {
      const topicsEn = newsTopics.length > 0
        ? newsTopics.map((t) => TOPIC_NAMES_EN[t] || t).join(', ')
        : 'technology, artificial intelligence and world news';
      textToSpeak = `Good morning! Here is your personalized Morning Oracle digest. Key updates across your topics: ${topicsEn}. All systems are nominal, have a productive day ahead.`;
    } else {
      const topicsRu = newsTopics.length > 0
        ? newsTopics.map((t) => TOPIC_NAMES_RU[t] || t).join(', ')
        : 'технологии, искусственный интеллект и мировые события';
      textToSpeak = `Доброе утро! Это ваш персональный утренний дайджест Морнинг Оракул. Главные события по вашим темам: ${topicsRu}. Все системы работают в штатном режиме, впереди продуктивный день.`;
    }

    await speakTextChunk(textToSpeak, speechLang);
    if (!isTaskSpeechAbortedRef.current && activeTrackIndexRef.current === 1) {
      advanceToNextTrack();
    }
  }, [digestLang, newsTopics, speakTextChunk, advanceToNextTrack]);

  // Main playback starter for any track index
  const playTrack = useCallback(
    (trackIdx: number) => {
      stopCurrentAudio();
      activeTrackIndexRef.current = trackIdx;
      setCurrentTrackIndex(trackIdx);
      setIsPlaying(true);
      setProgress(0);
      setIsCompleted(false);
      isTaskSpeechAbortedRef.current = false;

      if (trackIdx === 0) {
        // Track 1: Play 5-Second HTML5 Chime
        console.log('[Morning Oracle] Track 1: Starting 5-second ambient chimes...');
        if (chimeAudioRef.current) {
          chimeAudioRef.current.currentTime = 0;
          chimeAudioRef.current.play().catch((err) => {
            console.warn('[Morning Oracle] Chime audio play warning:', err);
          });
        }

        // Smooth 5-second countdown timer
        progressTimerRef.current = setInterval(() => {
          setProgress((prev) => {
            const next = prev + 1;
            if (next >= 5) {
              if (activeTrackIndexRef.current === 0) {
                console.log('[Morning Oracle] Track 1 completed (5s). Advancing to Track 2...');
                advanceToNextTrack();
              }
              return 5;
            }
            return next;
          });
        }, 1000);
      } else if (trackIdx === 1) {
        // Track 2: Remote Supabase MP3 Broadcast (Language specific with fallback)
        const primaryNewsUrl =
          digestLang === 'en'
            ? `${REMOTE_NEWS_AUDIO_EN}?t=${Date.now()}`
            : `${REMOTE_NEWS_AUDIO_RU}?t=${Date.now()}`;

        console.log(`[Morning Oracle] Track 2: Loading remote MP3 (${digestLang.toUpperCase()}) from:`, primaryNewsUrl);

        const audio = new Audio(primaryNewsUrl);
        newsAudioRef.current = audio;

        audio.onloadedmetadata = () => {
          const dur = Math.ceil(audio.duration);
          if (dur && !isNaN(dur)) {
            setTrack2Duration(dur);
            console.log('[Morning Oracle] Track 2 MP3 duration loaded:', dur);
          }
        };

        audio.ontimeupdate = () => {
          if (activeTrackIndexRef.current === 1) {
            setProgress(Math.floor(audio.currentTime));
          }
        };

        audio.onended = () => {
          console.log('[Morning Oracle] Track 2 remote MP3 finished. Advancing to Track 3...');
          if (activeTrackIndexRef.current === 1) {
            advanceToNextTrack();
          }
        };

        audio.onerror = (e) => {
          console.warn('[Morning Oracle] Track 2 remote MP3 failed. Trying fallback/TTS:', e);
          if (digestLang === 'en') {
            // Try Russian broadcast file as intermediate fallback if English MP3 is not yet ready
            console.log('[Morning Oracle] Attempting fallback to default today_news.mp3...');
            const fallbackAudio = new Audio(`${REMOTE_NEWS_AUDIO_RU}?t=${Date.now()}`);
            newsAudioRef.current = fallbackAudio;

            fallbackAudio.onloadedmetadata = () => {
              const dur = Math.ceil(fallbackAudio.duration);
              if (dur && !isNaN(dur)) setTrack2Duration(dur);
            };

            fallbackAudio.ontimeupdate = () => {
              if (activeTrackIndexRef.current === 1) {
                setProgress(Math.floor(fallbackAudio.currentTime));
              }
            };

            fallbackAudio.onended = () => {
              if (activeTrackIndexRef.current === 1) advanceToNextTrack();
            };

            fallbackAudio.onerror = () => {
              if (activeTrackIndexRef.current === 1) playNewsSpeechFallback();
            };

            fallbackAudio.play().catch(() => {
              if (activeTrackIndexRef.current === 1) playNewsSpeechFallback();
            });
          } else {
            if (activeTrackIndexRef.current === 1) playNewsSpeechFallback();
          }
        };

        audio
          .play()
          .then(() => {
            console.log('[Morning Oracle] Track 2: Remote MP3 play() succeeded.');
          })
          .catch((err) => {
            console.warn('[Morning Oracle] Track 2 play() was blocked or failed:', err);
            playNewsSpeechFallback();
          });
      } else if (trackIdx === 2) {
        // Track 3: Enhanced Sequential Task Readout
        console.log('[Morning Oracle] Track 3: Launching sequential task readout...');
        playSequentialTaskSpeech();
        const estDuration =
          tasksToSpeakRef.current.length > 0 ? Math.max(12, tasksToSpeakRef.current.length * 6) : 6;
        progressTimerRef.current = setInterval(() => {
          setProgress((prev) => Math.min(prev + 1, estDuration));
        }, 1000);
      }
    },
    [digestLang, stopCurrentAudio, playNewsSpeechFallback, playSequentialTaskSpeech, advanceToNextTrack]
  );

  // Handle modal open/close lifecycle
  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      wasOpenRef.current = true;
      refreshDigestLang();
      fetchLiveTasks();
      playTrack(0);
    } else if (!isOpen && wasOpenRef.current) {
      wasOpenRef.current = false;
      stopCurrentAudio();
      setIsPlaying(false);
    }

    return () => {
      stopCurrentAudio();
    };
  }, [isOpen, refreshDigestLang, fetchLiveTasks, playTrack, stopCurrentAudio]);

  // Direct Track Selection
  const handleSelectTrack = (idx: number) => {
    console.log(`[Morning Oracle] User clicked Track ${idx + 1}`);
    playTrack(idx);
  };

  // Skip Next
  const handleSkipNext = () => {
    if (currentTrackIndex < tracks.length - 1) {
      playTrack(currentTrackIndex + 1);
    }
  };

  // Skip Prev
  const handleSkipPrev = () => {
    if (currentTrackIndex > 0) {
      playTrack(currentTrackIndex - 1);
    }
  };

  // Play / Pause Toggle
  const togglePlayPause = () => {
    if (isPlaying) {
      stopCurrentAudio();
      setIsPlaying(false);
    } else {
      if (isCompleted) {
        playTrack(0);
      } else {
        playTrack(currentTrackIndex);
      }
    }
  };

  const handleDismiss = () => {
    stopCurrentAudio();
    onClose();
  };

  if (!isOpen) return null;

  const currentTrack = tracks[currentTrackIndex];
  const maxDuration = currentTrack.estimatedDuration;
  const progressPercent = Math.min(100, Math.round((progress / maxDuration) * 100));

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
      {/* Hidden HTML5 Audio for Track 1 Ambient Chimes */}
      {chimeAudioUrl && (
        <audio
          ref={chimeAudioRef}
          src={chimeAudioUrl}
          preload="auto"
          className="hidden"
        />
      )}

      <div className="glass-card rounded-3xl w-full max-w-md border border-oracle-cyan/40 overflow-hidden shadow-[0_0_50px_rgba(0,229,255,0.25)] animate-fadeIn relative">
        {/* Ambient Glow Circles */}
        <div className="absolute -top-32 -right-32 w-64 h-64 bg-oracle-cyan/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -left-32 w-64 h-64 bg-oracle-magenta/20 rounded-full blur-3xl pointer-events-none" />

        {/* Modal Header */}
        <div className="p-4 border-b border-oracle-border/80 flex items-center justify-between bg-oracle-card/90">
          <div className="flex items-center space-x-2">
            <div className="w-7 h-7 rounded-lg bg-oracle-cyan/20 border border-oracle-cyan/50 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-oracle-cyan animate-pulse" />
            </div>
            <div>
              <h2 className="text-xs font-black uppercase tracking-widest text-white">
                Morning Oracle Broadcast
              </h2>
              <span className="text-[10px] text-oracle-muted font-mono">
                Track {currentTrackIndex + 1} of {tracks.length} • Lang: {digestLang.toUpperCase()}
              </span>
            </div>
          </div>

          <button
            onClick={handleDismiss}
            className="p-1.5 rounded-xl bg-oracle-dark border border-oracle-border text-oracle-muted hover:text-white transition"
            title="Close player"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Player Body */}
        <div className="p-6 space-y-5 flex flex-col items-center text-center">
          {/* Animated Equalizer Visualizer */}
          <div className="h-14 flex items-end justify-center space-x-1.5 py-1">
            {[40, 75, 100, 60, 85, 45, 90, 65, 35, 80].map((height, i) => (
              <span
                key={i}
                style={{
                  height: isPlaying ? `${Math.max(20, height)}%` : '15%',
                  animationDuration: `${0.5 + (i % 5) * 0.12}s`,
                }}
                className={`w-1.5 rounded-full transition-all duration-300 ${
                  isPlaying
                    ? i % 2 === 0
                      ? 'bg-oracle-cyan shadow-[0_0_8px_rgba(0,229,255,0.8)] animate-pulse'
                      : 'bg-oracle-magenta shadow-[0_0_8px_rgba(255,0,85,0.8)] animate-pulse'
                    : 'bg-oracle-border'
                }`}
              />
            ))}
          </div>

          {/* Current Track Metadata */}
          <div className="space-y-1 w-full">
            <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-oracle-dark/90 border border-oracle-cyan/30 text-oracle-cyan text-[11px] font-mono uppercase tracking-wider mb-1">
              {currentTrack.iconType === 'music' && <Music className="w-3 h-3" />}
              {currentTrack.iconType === 'radio' && <Radio className="w-3 h-3" />}
              {currentTrack.iconType === 'tasks' && <ListTodo className="w-3 h-3" />}
              <span>{currentTrack.category}</span>
            </div>

            <h3 className="text-base sm:text-lg font-bold text-white tracking-wide">
              {currentTrack.title}
            </h3>

            {isCompleted && (
              <p className="text-xs text-oracle-cyan font-mono flex items-center justify-center gap-1 mt-1">
                <CheckCircle className="w-3.5 h-3.5" />
                <span>Morning broadcast complete!</span>
              </p>
            )}
          </div>

          {/* Track 3 Live Spoken Task Highlighting List */}
          {currentTrackIndex === 2 && tasksToSpeakRef.current.length > 0 && (
            <div className="w-full max-h-28 overflow-y-auto space-y-1 text-left px-1 py-1 bg-oracle-dark/50 rounded-xl border border-oracle-border/60 text-xs">
              {tasksToSpeakRef.current.map((task, idx) => (
                <div
                  key={task.id}
                  className={`p-2 rounded-lg transition-all flex items-center justify-between ${
                    activeTaskIndex === idx
                      ? 'bg-oracle-cyan/20 border border-oracle-cyan/60 text-oracle-cyan font-medium shadow-cyan-glow'
                      : 'text-oracle-muted bg-transparent'
                  }`}
                >
                  <div className="flex items-center space-x-2 truncate">
                    <span className="font-mono text-[10px] opacity-75">#{idx + 1}</span>
                    <span className="truncate">{task.text}</span>
                  </div>
                  {activeTaskIndex === idx && (
                    <Volume2 className="w-3.5 h-3.5 text-oracle-cyan animate-pulse shrink-0 ml-2" />
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Progress Bar */}
          <div className="w-full space-y-1.5">
            <div className="w-full bg-oracle-dark h-2 rounded-full overflow-hidden border border-oracle-border/80">
              <div
                className="bg-gradient-to-r from-oracle-cyan to-oracle-magenta h-full transition-all duration-300 rounded-full"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div className="flex justify-between text-[11px] font-mono text-oracle-muted px-0.5">
              <span>{formatTime(progress)}</span>
              <span>{formatTime(maxDuration)}</span>
            </div>
          </div>

          {/* Audio Transport Controls */}
          <div className="flex items-center justify-center space-x-4">
            <button
              onClick={handleSkipPrev}
              disabled={currentTrackIndex === 0}
              className={`p-3 rounded-full bg-oracle-card border border-oracle-border text-white transition ${
                currentTrackIndex === 0 ? 'opacity-30 cursor-not-allowed' : 'hover:border-oracle-cyan hover:text-oracle-cyan'
              }`}
              title="Previous Track"
            >
              <SkipBack className="w-5 h-5" />
            </button>

            <button
              onClick={togglePlayPause}
              className="w-16 h-16 rounded-full bg-oracle-cyan text-oracle-dark flex items-center justify-center shadow-cyan-glow hover:bg-cyan-300 active:scale-95 transition-all"
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? (
                <Pause className="w-7 h-7 fill-current" />
              ) : (
                <Play className="w-7 h-7 fill-current ml-1" />
              )}
            </button>

            <button
              onClick={handleSkipNext}
              disabled={currentTrackIndex === tracks.length - 1}
              className={`p-3 rounded-full bg-oracle-card border border-oracle-border text-white transition ${
                currentTrackIndex === tracks.length - 1 ? 'opacity-30 cursor-not-allowed' : 'hover:border-oracle-cyan hover:text-oracle-cyan'
              }`}
              title="Skip Track"
            >
              <SkipForward className="w-5 h-5" />
            </button>
          </div>

          {/* Sequential Queue Overview */}
          <div className="w-full pt-3 border-t border-oracle-border/60 text-left space-y-1.5">
            <span className="text-[10px] uppercase font-mono tracking-widest text-oracle-muted block mb-0.5">
              Broadcast Playlist:
            </span>
            <div className="space-y-1">
              {tracks.map((t, idx) => (
                <div
                  key={t.id}
                  onClick={() => handleSelectTrack(idx)}
                  className={`flex items-center justify-between p-2 rounded-xl text-xs cursor-pointer transition ${
                    idx === currentTrackIndex
                      ? 'bg-oracle-cyan/15 border border-oracle-cyan/40 text-oracle-cyan font-semibold shadow-sm'
                      : idx < currentTrackIndex
                      ? 'bg-oracle-dark/40 text-gray-400 opacity-60 hover:bg-oracle-dark/70'
                      : 'bg-oracle-dark/40 text-oracle-muted hover:text-gray-200 hover:bg-oracle-dark/70'
                  }`}
                >
                  <div className="flex items-center space-x-2 truncate">
                    <span className="font-mono text-[10px] opacity-75">{idx + 1}.</span>
                    <span className="truncate">{t.category}</span>
                  </div>
                  {idx === currentTrackIndex && isPlaying && (
                    <Volume2 className="w-3.5 h-3.5 text-oracle-cyan animate-pulse shrink-0 ml-2" />
                  )}
                  {idx < currentTrackIndex && (
                    <CheckCircle className="w-3.5 h-3.5 text-gray-500 shrink-0 ml-2" />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer Action Button */}
        <div className="p-4 border-t border-oracle-border/80 bg-oracle-card/90">
          <button
            onClick={handleDismiss}
            className="w-full py-3 rounded-2xl bg-oracle-magenta text-white font-bold text-xs tracking-wider uppercase shadow-magenta-glow hover:bg-rose-600 active:scale-98 transition flex items-center justify-center space-x-2"
          >
            <X className="w-4 h-4" />
            <span>Stop Alarm & Dismiss</span>
          </button>
        </div>
      </div>
    </div>
  );
}

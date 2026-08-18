'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, SkipForward, SkipBack, X, Volume2, Sparkles, CheckCircle, Radio, ListTodo, Music } from 'lucide-react';
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

const REMOTE_NEWS_AUDIO_BASE =
  'https://ignakecyqbkwznubymue.supabase.co/storage/v1/object/public/morning_audio/today_news.mp3';

const TOPIC_NAMES_RU: Record<string, string> = {
  technology: 'технологии',
  ai: 'искусственный интеллект',
  finance: 'финансы и рынки',
  world: 'мировые новости',
  science: 'наука и космос',
  crypto: 'криптовалюты',
  startups: 'стартапы и бизнес',
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
  
  const [chimeAudioUrl, setChimeAudioUrl] = useState<string>('');
  const [liveTomorrowTasks, setLiveTomorrowTasks] = useState<Idea[]>([]);

  const activeTrackIndexRef = useRef(0);
  const chimeAudioRef = useRef<HTMLAudioElement | null>(null);
  const newsAudioRef = useRef<HTMLAudioElement | null>(null);
  const progressTimerRef = useRef<any>(null);
  const currentUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const wasOpenRef = useRef(false);

  // Live tasks array reference
  const tasksToSpeakRef = useRef<Idea[]>([]);
  tasksToSpeakRef.current = liveTomorrowTasks.length > 0 ? liveTomorrowTasks : ideas.filter((i) => i.status === 'tomorrow');

  const newsTopics = settings?.news_topics || ['technology', 'ai', 'world'];

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
      title: `AI News Briefing (${newsTopics.map((t) => TOPIC_NAMES_RU[t] || t).join(', ')})`,
      category: 'AI News Briefing',
      iconType: 'radio',
      estimatedDuration: track2Duration,
    },
    {
      id: 'track-3',
      title: `${tasksToSpeakRef.current.length > 0 ? tasksToSpeakRef.current.length : '0'} Priority Items for Today`,
      category: "Today's Tasks Breakdown",
      iconType: 'tasks',
      estimatedDuration: tasksToSpeakRef.current.length > 0 ? Math.max(10, tasksToSpeakRef.current.length * 5) : 8,
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

  // Stop all active audio elements and speech
  const stopCurrentAudio = useCallback(() => {
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
      currentUtteranceRef.current = null;
    }
  }, []);

  // Play Speech Synthesis in Russian for Track 2 (fallback) or Track 3 (Tasks)
  const playRussianSpeechTrack = useCallback((trackIdx: number) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      console.warn('[Morning Oracle] SpeechSynthesis not available');
      return;
    }

    window.speechSynthesis.cancel();
    let textToSpeak = '';

    if (trackIdx === 1) {
      // Track 2 Speech fallback
      const topicsRu = newsTopics.length > 0
        ? newsTopics.map((t) => TOPIC_NAMES_RU[t] || t).join(', ')
        : 'технологии, искусственный интеллект и мировые события';
      
      textToSpeak = `Доброе утро! Это ваш персональный утренний дайджест Морнинг Оракул. Главные события по вашим темам: ${topicsRu}. Все системы работают в штатном режиме, впереди продуктивный день.`;
    } else if (trackIdx === 2) {
      // Track 3: Tasks breakdown
      const currentTasks = tasksToSpeakRef.current;
      console.log('[Morning Oracle] Track 3 tasks to speak:', currentTasks);

      if (currentTasks.length > 0) {
        const tasksList = currentTasks
          .map((item, idx) => `${idx + 1}. ${item.text}`)
          .join(', ');
        textToSpeak = `Ваши задачи на сегодня: ${tasksList}. Желаю отличного дня!`;
      } else {
        textToSpeak = 'На сегодня запланированных задач нет. Отличного дня!';
      }
    }

    console.log(`[Morning Oracle] Playing Track ${trackIdx + 1} TTS:`, textToSpeak);

    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    utterance.lang = 'ru-RU';
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    currentUtteranceRef.current = utterance;

    const assignVoice = () => {
      const voices = window.speechSynthesis.getVoices();
      const ruVoice = voices.find((v) => v.lang.startsWith('ru') || v.lang.includes('RU'));
      if (ruVoice) {
        utterance.voice = ruVoice;
      }
    };

    assignVoice();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = assignVoice;
    }

    utterance.onstart = () => {
      console.log(`[Morning Oracle] Track ${trackIdx + 1} speech started.`);
    };

    utterance.onend = () => {
      console.log(`[Morning Oracle] Track ${trackIdx + 1} speech completed.`);
      if (activeTrackIndexRef.current === trackIdx) {
        advanceToNextTrack();
      }
    };

    utterance.onerror = (e) => {
      console.warn(`[Morning Oracle] Track ${trackIdx + 1} speech error:`, e);
      if (activeTrackIndexRef.current === trackIdx) {
        advanceToNextTrack();
      }
    };

    setTimeout(() => {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
      window.speechSynthesis.speak(utterance);
    }, 60);
  }, [newsTopics]);

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

  // Main playback starter for any track index
  const playTrack = useCallback((trackIdx: number) => {
    stopCurrentAudio();
    activeTrackIndexRef.current = trackIdx;
    setCurrentTrackIndex(trackIdx);
    setIsPlaying(true);
    setProgress(0);
    setIsCompleted(false);

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
      // Track 2: Remote Supabase MP3 Broadcast
      const freshNewsUrl = `${REMOTE_NEWS_AUDIO_BASE}?t=${Date.now()}`;
      console.log('[Morning Oracle] Track 2: Loading remote MP3 from:', freshNewsUrl);

      const audio = new Audio(freshNewsUrl);
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
        console.log('[Morning Oracle] Track 2 remote MP3 finished playing naturally. Advancing to Track 3...');
        if (activeTrackIndexRef.current === 1) {
          advanceToNextTrack();
        }
      };

      audio.onerror = (e) => {
        console.warn('[Morning Oracle] Track 2 remote MP3 failed to load/play. Switching to Russian TTS fallback:', e);
        if (activeTrackIndexRef.current === 1) {
          playRussianSpeechTrack(1);
        }
      };

      audio.play().then(() => {
        console.log('[Morning Oracle] Track 2: Remote MP3 play() succeeded.');
      }).catch((err) => {
        console.warn('[Morning Oracle] Track 2 play() was blocked or failed:', err);
        playRussianSpeechTrack(1);
      });
    } else if (trackIdx === 2) {
      // Track 3: Tasks Breakdown Speech
      console.log('[Morning Oracle] Track 3: Starting tasks breakdown speech...');
      playRussianSpeechTrack(2);
      const estDuration = tasksToSpeakRef.current.length > 0 ? Math.max(10, tasksToSpeakRef.current.length * 5) : 8;
      progressTimerRef.current = setInterval(() => {
        setProgress((prev) => Math.min(prev + 1, estDuration));
      }, 1000);
    }
  }, [stopCurrentAudio, playRussianSpeechTrack, advanceToNextTrack]);

  // Handle modal open/close lifecycle
  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      wasOpenRef.current = true;
      // Fetch fresh tasks from Supabase immediately on modal open
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
  }, [isOpen, fetchLiveTasks, playTrack, stopCurrentAudio]);

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
                Track {currentTrackIndex + 1} of {tracks.length}
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
        <div className="p-6 space-y-6 flex flex-col items-center text-center">
          
          {/* Animated Equalizer Visualizer */}
          <div className="h-16 flex items-end justify-center space-x-1.5 py-2">
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
          <div className="space-y-1">
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
          <div className="w-full pt-4 border-t border-oracle-border/60 text-left space-y-2">
            <span className="text-[10px] uppercase font-mono tracking-widest text-oracle-muted block mb-1">
              Broadcast Playlist:
            </span>
            <div className="space-y-1.5">
              {tracks.map((t, idx) => (
                <div
                  key={t.id}
                  onClick={() => handleSelectTrack(idx)}
                  className={`flex items-center justify-between p-2.5 rounded-xl text-xs cursor-pointer transition ${
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

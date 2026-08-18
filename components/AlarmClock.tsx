'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Clock,
  Bell,
  BellRing,
  ShieldCheck,
  ShieldAlert,
  Sparkles,
  Volume2,
  Moon,
  Sun,
  AlertTriangle,
  Sliders,
  Check,
  SunMedium
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Settings } from '@/lib/types';

interface AlarmClockProps {
  settings: Settings | null;
  onOpenSettings: () => void;
  onTriggerAlarm?: () => void;
  onUpdateSettings?: (newSettings: Settings) => void;
}

// 1-second silent WAV base64 data URI for keeping mobile web audio context awake
const SILENT_AUDIO_URI =
  'data:audio/wav;base64,UklGRjIAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YRAAAAAAAAAAAAAAAAAAAAAAAAAA';

export function AlarmClock({
  settings,
  onOpenSettings,
  onTriggerAlarm,
  onUpdateSettings,
}: AlarmClockProps) {
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const [isArmed, setIsArmed] = useState(false);
  const [isKeepScreenOn, setIsKeepScreenOn] = useState(false);
  
  // Local fast-synced settings state
  const [alarmTime, setAlarmTime] = useState<string>('07:30');
  const [isAlarmEnabled, setIsAlarmEnabled] = useState<boolean>(true);
  const [isSavingSettings, setIsSavingSettings] = useState<boolean>(false);

  const [wakeLockActive, setWakeLockActive] = useState(false);
  const [wakeLockSupported, setWakeLockSupported] = useState(true);
  const [isAlarmRinging, setIsAlarmRinging] = useState(false);
  const [audioLoopPlaying, setAudioLoopPlaying] = useState(false);

  const wakeLockRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastTriggeredMinuteRef = useRef<string | null>(null);

  // Sync settings on prop change or localStorage cache
  useEffect(() => {
    if (settings) {
      if (settings.alarm_time) setAlarmTime(settings.alarm_time);
      if (settings.is_alarm_enabled !== undefined) setIsAlarmEnabled(settings.is_alarm_enabled);
    } else if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem('morning_oracle_alarm_settings');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed.alarm_time) setAlarmTime(parsed.alarm_time);
          if (parsed.is_alarm_enabled !== undefined) setIsAlarmEnabled(parsed.is_alarm_enabled);
        }
      } catch (e) {
        // ignore cache parse errors
      }
    }
  }, [settings]);

  // Real-time clock update (every 1 second)
  useEffect(() => {
    setCurrentTime(new Date());
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Check Wake Lock support
  useEffect(() => {
    if (typeof window !== 'undefined' && !('wakeLock' in navigator)) {
      setWakeLockSupported(false);
    }
  }, []);

  // Request screen wake lock
  const requestWakeLock = useCallback(async () => {
    if (typeof window !== 'undefined' && 'wakeLock' in navigator) {
      try {
        const lock = await (navigator as any).wakeLock.request('screen');
        wakeLockRef.current = lock;
        setWakeLockActive(true);

        lock.addEventListener('release', () => {
          setWakeLockActive(false);
        });
      } catch (err) {
        console.warn('[Morning Oracle] Wake Lock request failed:', err);
        setWakeLockActive(false);
      }
    }
  }, []);

  // Release screen wake lock
  const releaseWakeLock = useCallback(async () => {
    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
      } catch (err) {
        console.warn('[Morning Oracle] Wake Lock release error:', err);
      }
      setWakeLockActive(false);
    }
  }, []);

  // Keep Screen On / Nightstand mode toggle
  const toggleKeepScreenOn = async () => {
    const nextState = !isKeepScreenOn;
    setIsKeepScreenOn(nextState);
    if (nextState) {
      await requestWakeLock();
    } else if (!isArmed) {
      await releaseWakeLock();
    }
  };

  // Re-acquire wake lock on visibility change
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && (isArmed || isKeepScreenOn)) {
        await requestWakeLock();
        if (isArmed && audioRef.current && audioRef.current.paused) {
          try {
            await audioRef.current.play();
            setAudioLoopPlaying(true);
          } catch (e) {
            console.warn('[Morning Oracle] Audio resume error on visibility change:', e);
          }
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isArmed, isKeepScreenOn, requestWakeLock]);

  // Handle Arm/Disarm toggle
  const toggleArm = async () => {
    if (!isArmed) {
      // Arm alarm
      setIsArmed(true);
      await requestWakeLock();

      if (audioRef.current) {
        try {
          audioRef.current.currentTime = 0;
          await audioRef.current.play();
          setAudioLoopPlaying(true);
        } catch (err) {
          console.warn('[Morning Oracle] Silent audio play blocked by browser policy:', err);
          setAudioLoopPlaying(false);
        }
      }
    } else {
      // Disarm alarm
      setIsArmed(false);
      setIsAlarmRinging(false);
      if (!isKeepScreenOn) {
        await releaseWakeLock();
      }

      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        setAudioLoopPlaying(false);
      }
    }
  };

  // Live save for inline alarm time and enabled state
  const handleSaveAlarmTime = async (newTime: string, newEnabled: boolean) => {
    setAlarmTime(newTime);
    setIsAlarmEnabled(newEnabled);
    setIsSavingSettings(true);

    // Save to localStorage for instant load
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(
          'morning_oracle_alarm_settings',
          JSON.stringify({ alarm_time: newTime, is_alarm_enabled: newEnabled })
        );
      } catch (e) {
        // ignore
      }
    }

    // Save to Supabase settings table
    try {
      const payload: Partial<Settings> = {
        alarm_time: newTime,
        is_alarm_enabled: newEnabled,
        updated_at: new Date().toISOString(),
      };

      let updatedRecord: any = null;
      if (settings?.id) {
        const res = await supabase.from('settings').update(payload).eq('id', settings.id).select().single();
        updatedRecord = res.data;
      } else {
        const res = await supabase.from('settings').insert([payload]).select().single();
        updatedRecord = res.data;
      }

      if (onUpdateSettings && updatedRecord) {
        onUpdateSettings(updatedRecord as Settings);
      }
    } catch (err) {
      console.error('[Morning Oracle] Error saving alarm time to Supabase:', err);
    } finally {
      setIsSavingSettings(false);
    }
  };

  // Live Alarm Trigger Engine (checked every second)
  useEffect(() => {
    if (!currentTime || !isAlarmEnabled) {
      return;
    }

    const hours = String(currentTime.getHours()).padStart(2, '0');
    const minutes = String(currentTime.getMinutes()).padStart(2, '0');
    const seconds = currentTime.getSeconds();
    const currentHM = `${hours}:${minutes}`;

    // Target alarm time in "HH:MM"
    const targetHM = alarmTime;

    // Trigger only on match, at 0-2 seconds, and once per minute
    if (currentHM === targetHM && seconds <= 2 && lastTriggeredMinuteRef.current !== currentHM) {
      lastTriggeredMinuteRef.current = currentHM;
      console.log(`[Morning Oracle] Alarm triggered at ${currentHM}:${seconds}! Launching Morning Routine...`);
      setIsAlarmRinging(true);
      if (onTriggerAlarm) {
        onTriggerAlarm();
      }
    }
  }, [currentTime, isAlarmEnabled, alarmTime, onTriggerAlarm]);

  // Format time display
  const hoursStr = currentTime ? String(currentTime.getHours()).padStart(2, '0') : '--';
  const minutesStr = currentTime ? String(currentTime.getMinutes()).padStart(2, '0') : '--';
  const secondsStr = currentTime ? String(currentTime.getSeconds()).padStart(2, '0') : '--';

  const dateStr = currentTime
    ? currentTime.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : 'Loading date...';

  return (
    <section className="w-full max-w-md mx-auto p-4 space-y-5">
      {/* Hidden audio element for continuous silent playback loop */}
      <audio
        ref={audioRef}
        src={SILENT_AUDIO_URI}
        loop
        preload="auto"
        className="hidden"
      />

      {/* Main Real-Time Clock Card */}
      <div className="glass-card rounded-3xl p-6 border border-oracle-border relative overflow-hidden shadow-2xl flex flex-col items-center justify-center text-center">
        {/* Glow ambient background */}
        <div
          className={`absolute -top-32 -left-32 w-64 h-64 rounded-full blur-3xl transition-opacity duration-700 pointer-events-none ${
            isAlarmRinging
              ? 'bg-oracle-magenta/30 opacity-100 animate-pulse'
              : isArmed
              ? 'bg-oracle-cyan/25 opacity-100'
              : 'bg-oracle-cyan/5 opacity-40'
          }`}
        />

        {/* Date Display */}
        <div className="flex items-center space-x-2 text-xs uppercase tracking-widest text-oracle-muted font-mono mb-3">
          <Moon className="w-3.5 h-3.5 text-oracle-cyan" />
          <span>{dateStr}</span>
        </div>

        {/* Digital Clock Display */}
        <div className="my-2 select-none">
          <div className="flex items-baseline justify-center font-mono tracking-tighter">
            <span className="text-5xl sm:text-6xl font-black text-white drop-shadow-[0_0_25px_rgba(0,229,255,0.4)]">
              {hoursStr}:{minutesStr}
            </span>
            <span className="text-2xl sm:text-3xl font-bold text-oracle-cyan ml-2 drop-shadow-[0_0_15px_rgba(0,229,255,0.8)] animate-pulse">
              :{secondsStr}
            </span>
          </div>
        </div>

        {/* Alarm Ringing Alert Banner */}
        {isAlarmRinging && (
          <div className="w-full mt-4 p-3 rounded-2xl bg-oracle-magenta/20 border border-oracle-magenta text-oracle-magenta flex items-center justify-between animate-bounce">
            <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider">
              <BellRing className="w-4 h-4 animate-spin" />
              <span>Alarm Triggered!</span>
            </div>
            <button
              onClick={() => setIsAlarmRinging(false)}
              className="px-3 py-1 bg-oracle-magenta text-white font-bold rounded-xl text-xs shadow-magenta-glow"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Quick Alarm Time Adjuster & Target */}
        <div className="w-full mt-5 pt-4 border-t border-oracle-border/60 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Bell className={`w-4 h-4 ${isAlarmEnabled ? 'text-oracle-cyan' : 'text-oracle-muted'}`} />
            <span className="text-xs text-oracle-muted">Alarm Time:</span>
            <input
              type="time"
              value={alarmTime}
              onChange={(e) => handleSaveAlarmTime(e.target.value, isAlarmEnabled)}
              className="bg-oracle-dark/90 border border-oracle-border hover:border-oracle-cyan/60 rounded-lg px-2 py-0.5 text-xs font-mono font-bold text-oracle-cyan outline-none transition cursor-pointer"
            />
          </div>

          <label className="flex items-center cursor-pointer space-x-1.5 text-xs">
            <span className="text-[11px] text-oracle-muted">Active</span>
            <input
              type="checkbox"
              checked={isAlarmEnabled}
              onChange={(e) => handleSaveAlarmTime(alarmTime, e.target.checked)}
              className="w-4 h-4 accent-oracle-cyan rounded cursor-pointer"
            />
          </label>
        </div>
      </div>

      {/* Arm / Nightstand Mode Controls Card */}
      <div className="glass-card rounded-2xl p-5 border border-oracle-border space-y-4">
        {/* Toggle 1: Arm Alarm & Keep Awake (Silent Loop + WakeLock) */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center border transition-all ${
                isArmed
                  ? 'bg-oracle-cyan/20 border-oracle-cyan text-oracle-cyan shadow-cyan-glow'
                  : 'bg-oracle-card border-oracle-border text-oracle-muted'
              }`}
            >
              {isArmed ? <ShieldCheck className="w-5 h-5" /> : <ShieldAlert className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-sm font-bold text-white tracking-wide">
                {isArmed ? 'Alarm Armed & Active' : 'Arm Alarm'}
              </h3>
              <p className="text-[11px] text-oracle-muted">
                {isArmed
                  ? 'Silent Audio Loop & WakeLock armed'
                  : 'Arm to ensure phone browser does not sleep'}
              </p>
            </div>
          </div>

          <button
            onClick={toggleArm}
            disabled={!isAlarmEnabled}
            className={`relative inline-flex h-7 w-14 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              isArmed ? 'bg-oracle-cyan' : 'bg-oracle-border'
            } ${!isAlarmEnabled ? 'opacity-40 cursor-not-allowed' : ''}`}
            role="switch"
            aria-checked={isArmed}
          >
            <span
              className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-oracle-dark shadow-lg ring-0 transition duration-200 ease-in-out ${
                isArmed ? 'translate-x-7' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Toggle 2: Keep Screen On (Nightstand Mode) */}
        <div className="pt-3 border-t border-oracle-border/40 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center border transition-all ${
                isKeepScreenOn || wakeLockActive
                  ? 'bg-oracle-cyan/15 border-oracle-cyan/50 text-oracle-cyan'
                  : 'bg-oracle-card border-oracle-border text-oracle-muted'
              }`}
            >
              <SunMedium className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-white">Keep Screen On (Nightstand)</h4>
              <p className="text-[10px] text-oracle-muted">Prevent display from sleeping all night</p>
            </div>
          </div>

          <button
            onClick={toggleKeepScreenOn}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              isKeepScreenOn ? 'bg-oracle-cyan' : 'bg-oracle-border'
            }`}
            role="switch"
            aria-checked={isKeepScreenOn}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-oracle-dark shadow-lg ring-0 transition duration-200 ease-in-out ${
                isKeepScreenOn ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Diagnostics Info */}
        <div className="pt-3 border-t border-oracle-border/40 grid grid-cols-2 gap-2 text-[10px] font-mono">
          <div className="flex items-center space-x-1.5 text-oracle-muted bg-oracle-dark/60 px-2.5 py-1.5 rounded-lg border border-oracle-border/40">
            <span
              className={`w-2 h-2 rounded-full ${
                wakeLockActive ? 'bg-oracle-cyan animate-ping' : 'bg-gray-600'
              }`}
            />
            <span>WakeLock: {wakeLockActive ? 'Active' : wakeLockSupported ? 'Ready' : 'N/A'}</span>
          </div>

          <div className="flex items-center space-x-1.5 text-oracle-muted bg-oracle-dark/60 px-2.5 py-1.5 rounded-lg border border-oracle-border/40">
            <Volume2 className={`w-3 h-3 ${audioLoopPlaying ? 'text-oracle-cyan' : 'text-gray-600'}`} />
            <span>Audio Loop: {audioLoopPlaying ? 'Active' : 'Idle'}</span>
          </div>
        </div>
      </div>

      {/* Manual Test Trigger */}
      <div className="flex justify-center pt-1">
        <button
          onClick={() => {
            setIsAlarmRinging(true);
            if (onTriggerAlarm) onTriggerAlarm();
          }}
          className="text-[11px] text-oracle-muted hover:text-oracle-cyan font-mono transition flex items-center space-x-1"
        >
          <Sparkles className="w-3 h-3" />
          <span>Test Live Alarm Trigger</span>
        </button>
      </div>
    </section>
  );
}

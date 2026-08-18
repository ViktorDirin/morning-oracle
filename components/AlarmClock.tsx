'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Clock, Bell, BellRing, ShieldCheck, ShieldAlert, Sparkles, Volume2, Moon, Sun, AlertTriangle } from 'lucide-react';
import { Settings } from '@/lib/types';

interface AlarmClockProps {
  settings: Settings | null;
  onOpenSettings: () => void;
  onTriggerAlarm?: () => void;
}

// 1-second silent WAV base64 data URI for keeping mobile web audio context awake
const SILENT_AUDIO_URI =
  'data:audio/wav;base64,UklGRjIAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YRAAAAAAAAAAAAAAAAAAAAAAAAAA';

export function AlarmClock({ settings, onOpenSettings, onTriggerAlarm }: AlarmClockProps) {
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const [isArmed, setIsArmed] = useState(false);
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const [wakeLockSupported, setWakeLockSupported] = useState(true);
  const [isAlarmRinging, setIsAlarmRinging] = useState(false);
  const [audioLoopPlaying, setAudioLoopPlaying] = useState(false);

  const wakeLockRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastTriggeredMinuteRef = useRef<string | null>(null);

  // Initialize clock and update every second
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
        console.warn('Wake Lock request failed:', err);
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
        console.warn('Wake Lock release error:', err);
      }
      setWakeLockActive(false);
    }
  }, []);

  // Handle visibility changes to re-acquire wake lock if tab is refocused
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && isArmed) {
        await requestWakeLock();
        if (audioRef.current && audioRef.current.paused) {
          try {
            await audioRef.current.play();
            setAudioLoopPlaying(true);
          } catch (e) {
            console.warn('Audio resume error on visibility change:', e);
          }
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isArmed, requestWakeLock]);

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
          console.warn('Silent audio play blocked by browser policy:', err);
          setAudioLoopPlaying(false);
        }
      }
    } else {
      // Disarm alarm
      setIsArmed(false);
      setIsAlarmRinging(false);
      await releaseWakeLock();

      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        setAudioLoopPlaying(false);
      }
    }
  };

  // Alarm matching check loop
  useEffect(() => {
    if (!currentTime || !isArmed || !settings?.alarm_time || !settings?.is_alarm_enabled) {
      return;
    }

    const hours = String(currentTime.getHours()).padStart(2, '0');
    const minutes = String(currentTime.getMinutes()).padStart(2, '0');
    const seconds = currentTime.getSeconds();
    const currentHM = `${hours}:${minutes}`;

    // Target alarm time in "HH:MM" format
    const targetHM = settings.alarm_time;

    if (currentHM === targetHM && seconds === 0 && lastTriggeredMinuteRef.current !== currentHM) {
      lastTriggeredMinuteRef.current = currentHM;
      setIsAlarmRinging(true);
      if (onTriggerAlarm) {
        onTriggerAlarm();
      }
    }
  }, [currentTime, isArmed, settings, onTriggerAlarm]);

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

  const alarmTarget = settings?.alarm_time || '07:30';
  const isAlarmEnabledInSettings = settings?.is_alarm_enabled ?? true;

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

      {/* Main Clock Card */}
      <div className="glass-card rounded-3xl p-6 border border-oracle-border relative overflow-hidden shadow-2xl flex flex-col items-center justify-center text-center">
        {/* Glow ambient background */}
        <div
          className={`absolute -top-32 -left-32 w-64 h-64 rounded-full blur-3xl transition-opacity duration-700 pointer-events-none ${
            isAlarmRinging
              ? 'bg-oracle-magenta/30 opacity-100 animate-pulse'
              : isArmed
              ? 'bg-oracle-cyan/20 opacity-100'
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

        {/* Target Alarm Info */}
        <div className="w-full mt-6 pt-4 border-t border-oracle-border/60 flex items-center justify-between text-xs">
          <div className="flex items-center space-x-2">
            <Bell className={`w-4 h-4 ${isArmed ? 'text-oracle-cyan' : 'text-oracle-muted'}`} />
            <span className="text-oracle-muted">Target Alarm:</span>
            <span className="font-mono font-bold text-white tracking-wider">
              {alarmTarget}
            </span>
          </div>

          <button
            onClick={onOpenSettings}
            className="text-[11px] text-oracle-cyan hover:underline font-mono"
          >
            Change
          </button>
        </div>
      </div>

      {/* Arm / Keep-Awake Toggle Card */}
      <div className="glass-card rounded-2xl p-5 border border-oracle-border space-y-4">
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
                {isArmed ? 'Alarm Armed & Awake' : 'Alarm Standby'}
              </h3>
              <p className="text-[11px] text-oracle-muted">
                {isArmed
                  ? 'Screen WakeLock & Silent Audio active'
                  : 'Arm to prevent phone from sleeping'}
              </p>
            </div>
          </div>

          {/* Toggle Switch */}
          <button
            onClick={toggleArm}
            disabled={!isAlarmEnabledInSettings}
            className={`relative inline-flex h-7 w-14 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              isArmed ? 'bg-oracle-cyan' : 'bg-oracle-border'
            } ${!isAlarmEnabledInSettings ? 'opacity-40 cursor-not-allowed' : ''}`}
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

        {/* Warning if alarm is disabled in settings */}
        {!isAlarmEnabledInSettings && (
          <div className="p-2.5 rounded-xl bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-xs flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>Alarm is disabled in Settings. Enable it to arm.</span>
          </div>
        )}

        {/* Live Diagnostics Badges */}
        <div className="pt-2 border-t border-oracle-border/40 grid grid-cols-2 gap-2 text-[10px] font-mono">
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
            <span>Audio Loop: {audioLoopPlaying ? 'Playing' : 'Idle'}</span>
          </div>
        </div>
      </div>

      {/* Quick Test Trigger Button for Developer/User convenience */}
      <div className="flex justify-center pt-1">
        <button
          onClick={() => {
            setIsAlarmRinging(true);
            if (onTriggerAlarm) onTriggerAlarm();
          }}
          className="text-[11px] text-oracle-muted hover:text-oracle-cyan font-mono transition flex items-center space-x-1"
        >
          <Sparkles className="w-3 h-3" />
          <span>Test Alarm Trigger</span>
        </button>
      </div>
    </section>
  );
}

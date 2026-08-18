'use client';

import React, { useState, useEffect } from 'react';
import { X, Clock, Newspaper, Save, CheckCircle2, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Settings } from '@/lib/types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSettingsSaved?: (settings: Settings) => void;
}

const AVAILABLE_TOPICS = [
  { id: 'technology', label: 'Technology' },
  { id: 'ai', label: 'Artificial Intelligence' },
  { id: 'finance', label: 'Finance & Markets' },
  { id: 'world', label: 'World News' },
  { id: 'science', label: 'Science & Space' },
  { id: 'crypto', label: 'Crypto & Web3' },
  { id: 'startups', label: 'Startups & Business' },
];

export function SettingsModal({ isOpen, onClose, onSettingsSaved }: SettingsModalProps) {
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [alarmTime, setAlarmTime] = useState('07:30');
  const [isAlarmEnabled, setIsAlarmEnabled] = useState(true);
  const [selectedTopics, setSelectedTopics] = useState<string[]>(['technology', 'world', 'ai']);
  
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadSettings();
    }
  }, [isOpen]);

  const loadSettings = async () => {
    setIsLoading(true);

    // Fast load from localStorage cache first
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem('morning_oracle_settings_cache');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed.alarm_time) setAlarmTime(parsed.alarm_time);
          if (parsed.is_alarm_enabled !== undefined) setIsAlarmEnabled(parsed.is_alarm_enabled);
          if (parsed.news_topics) setSelectedTopics(parsed.news_topics);
        }
      } catch (e) {
        // ignore
      }
    }

    try {
      const { data, error } = await supabase
        .from('settings')
        .select('*')
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data) {
        setSettingsId(data.id);
        setAlarmTime(data.alarm_time || '07:30');
        setIsAlarmEnabled(data.is_alarm_enabled ?? true);
        setSelectedTopics(data.news_topics || ['technology', 'world', 'ai']);

        // Update local cache
        if (typeof window !== 'undefined') {
          localStorage.setItem('morning_oracle_settings_cache', JSON.stringify(data));
        }
      }
    } catch (err: any) {
      console.error('[Morning Oracle] Failed to load settings from Supabase:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleTopic = (topicId: string) => {
    if (selectedTopics.includes(topicId)) {
      setSelectedTopics(selectedTopics.filter((t) => t !== topicId));
    } else {
      setSelectedTopics([...selectedTopics, topicId]);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setStatus(null);

    try {
      const payload: Partial<Settings> = {
        alarm_time: alarmTime,
        is_alarm_enabled: isAlarmEnabled,
        news_topics: selectedTopics,
        updated_at: new Date().toISOString(),
      };

      let error;
      let updatedData: any;

      if (settingsId) {
        const res = await supabase.from('settings').update(payload).eq('id', settingsId).select().single();
        error = res.error;
        updatedData = res.data;
      } else {
        const res = await supabase.from('settings').insert([payload]).select().single();
        if (res.data) setSettingsId(res.data.id);
        error = res.error;
        updatedData = res.data;
      }

      if (error) throw error;

      // Update localStorage caches
      if (typeof window !== 'undefined') {
        localStorage.setItem('morning_oracle_settings_cache', JSON.stringify(updatedData || payload));
        localStorage.setItem('morning_oracle_alarm_settings', JSON.stringify({ alarm_time: alarmTime, is_alarm_enabled: isAlarmEnabled }));
      }

      if (onSettingsSaved && (updatedData || payload)) {
        onSettingsSaved((updatedData || payload) as Settings);
      }

      setStatus({ type: 'success', message: 'Settings saved successfully!' });
      setTimeout(() => {
        setStatus(null);
        onClose();
      }, 1000);
    } catch (err: any) {
      console.error('[Morning Oracle] Failed to save settings:', err);
      setStatus({ type: 'error', message: err.message || 'Failed to save settings' });
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="glass-card rounded-2xl w-full max-w-md border border-oracle-border overflow-hidden shadow-2xl animate-fadeIn">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-oracle-border bg-oracle-card">
          <h3 className="text-base font-bold tracking-wide text-white">
            Assistant Settings
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-oracle-muted hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-6 max-h-[75vh] overflow-y-auto">
          {isLoading ? (
            <p className="text-xs text-oracle-muted text-center py-6">Loading settings...</p>
          ) : (
            <>
              {/* Alarm Time Section */}
              <div className="space-y-3">
                <div className="flex items-center space-x-2 text-oracle-cyan">
                  <Clock className="w-4 h-4" />
                  <h4 className="text-xs font-semibold uppercase tracking-wider">
                    Morning Alarm Time
                  </h4>
                </div>
                <div className="flex items-center justify-between p-3 rounded-xl bg-oracle-dark border border-oracle-border">
                  <input
                    type="time"
                    value={alarmTime}
                    onChange={(e) => setAlarmTime(e.target.value)}
                    className="bg-transparent text-lg font-bold text-white outline-none cursor-pointer"
                  />
                  <label className="flex items-center cursor-pointer space-x-2">
                    <span className="text-xs text-oracle-muted">Enabled</span>
                    <input
                      type="checkbox"
                      checked={isAlarmEnabled}
                      onChange={(e) => setIsAlarmEnabled(e.target.checked)}
                      className="w-4 h-4 accent-oracle-cyan rounded"
                    />
                  </label>
                </div>
              </div>

              {/* News Topics Section */}
              <div className="space-y-3">
                <div className="flex items-center space-x-2 text-oracle-cyan">
                  <Newspaper className="w-4 h-4" />
                  <h4 className="text-xs font-semibold uppercase tracking-wider">
                    Morning News Briefing Topics
                  </h4>
                </div>
                <p className="text-xs text-oracle-muted">
                  Select topics for your automated morning AI broadcast:
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  {AVAILABLE_TOPICS.map((topic) => {
                    const isSelected = selectedTopics.includes(topic.id);
                    return (
                      <button
                        key={topic.id}
                        type="button"
                        onClick={() => toggleTopic(topic.id)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                          isSelected
                            ? 'bg-oracle-cyan/20 text-oracle-cyan border border-oracle-cyan/50 shadow-cyan-glow'
                            : 'bg-oracle-dark text-oracle-muted border border-oracle-border hover:border-gray-600'
                        }`}
                      >
                        {isSelected ? '✓ ' : '+ '}
                        {topic.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {status && (
            <div className={`p-3 rounded-xl text-xs flex items-center space-x-2 ${
              status.type === 'success' ? 'bg-oracle-cyan/20 text-oracle-cyan border border-oracle-cyan/40' : 'bg-oracle-magenta/20 text-oracle-magenta border border-oracle-magenta/40'
            }`}>
              {status.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
              <span>{status.message}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-oracle-border bg-oracle-card flex items-center justify-end space-x-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-medium text-oracle-muted hover:text-white transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center space-x-1.5 px-5 py-2 rounded-xl bg-oracle-cyan text-oracle-dark font-semibold text-xs shadow-cyan-glow hover:bg-cyan-300 transition"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{isSaving ? 'Saving...' : 'Save Settings'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

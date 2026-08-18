'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Header } from '@/components/Header';
import { VoiceCapture } from '@/components/VoiceCapture';
import { IdeaList } from '@/components/IdeaList';
import { AlarmClock } from '@/components/AlarmClock';
import { MorningPlayer } from '@/components/MorningPlayer';
import { SettingsModal } from '@/components/SettingsModal';
import { supabase } from '@/lib/supabase';
import { Idea, IdeaStatus, Settings } from '@/lib/types';
import { Mic, Clock, PlayCircle } from 'lucide-react';

export default function Home() {
  const [activeTab, setActiveTab] = useState<'capture' | 'alarm'>('capture');
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [isLoadingIdeas, setIsLoadingIdeas] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isMorningPlayerOpen, setIsMorningPlayerOpen] = useState(false);

  // Fetch Ideas from Supabase
  const fetchIdeas = useCallback(async () => {
    setIsLoadingIdeas(true);
    try {
      const { data, error } = await supabase
        .from('ideas')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching ideas:', error);
      } else if (data) {
        setIdeas(data as Idea[]);
      }
    } catch (err) {
      console.error('Failed to connect to Supabase ideas table:', err);
    } finally {
      setIsLoadingIdeas(false);
    }
  }, []);

  // Fetch Settings from Supabase
  const fetchSettings = useCallback(async () => {
    // Check local cache first for instant UI response
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem('morning_oracle_settings_cache');
        if (cached) {
          setSettings(JSON.parse(cached));
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
        console.error('Error fetching settings:', error);
      } else if (data) {
        setSettings(data as Settings);
        if (typeof window !== 'undefined') {
          localStorage.setItem('morning_oracle_settings_cache', JSON.stringify(data));
        }
      }
    } catch (err) {
      console.error('Failed to fetch Supabase settings:', err);
    }
  }, []);

  useEffect(() => {
    fetchIdeas();
    fetchSettings();
  }, [fetchIdeas, fetchSettings]);

  const handleIdeaSaved = (newIdea: Idea) => {
    setIdeas((prev) => [newIdea, ...prev]);
  };

  const handleUpdateIdeaStatus = async (id: string, newStatus: IdeaStatus) => {
    // Optimistic UI update
    setIdeas((prev) =>
      prev.map((idea) => (idea.id === id ? { ...idea, status: newStatus } : idea))
    );

    try {
      const { error } = await supabase
        .from('ideas')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) {
        console.error('Error updating idea status:', error);
        fetchIdeas(); // Revert on error
      }
    } catch (err) {
      console.error('Failed to update idea in Supabase:', err);
      fetchIdeas();
    }
  };

  const handleDeleteIdea = async (id: string) => {
    // Optimistic delete
    setIdeas((prev) => prev.filter((idea) => idea.id !== id));

    try {
      const { error } = await supabase.from('ideas').delete().eq('id', id);

      if (error) {
        console.error('Error deleting idea:', error);
        fetchIdeas();
      }
    } catch (err) {
      console.error('Failed to delete idea from Supabase:', err);
      fetchIdeas();
    }
  };

  const handleOpenMorningPlayer = async () => {
    await fetchIdeas();
    setIsMorningPlayerOpen(true);
  };

  const handleAlarmTriggered = async () => {
    console.log('Morning Oracle Alarm fired! Opening Morning Broadcast Player...');
    await fetchIdeas();
    setIsMorningPlayerOpen(true);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-gray-100 flex flex-col selection:bg-oracle-cyan selection:text-oracle-dark pb-12">
      {/* Navigation Header */}
      <Header onOpenSettings={() => setIsSettingsOpen(true)} />

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-md mx-auto pt-4 px-2">
        {/* Top View Mode Switcher */}
        <div className="mx-4 mb-4 grid grid-cols-2 gap-1 p-1 bg-oracle-card rounded-2xl border border-oracle-border shadow-md">
          <button
            onClick={() => setActiveTab('capture')}
            className={`flex items-center justify-center space-x-2 py-2.5 px-3 rounded-xl text-xs font-semibold tracking-wide transition-all ${
              activeTab === 'capture'
                ? 'bg-oracle-dark text-oracle-cyan border border-oracle-cyan/40 shadow-cyan-glow'
                : 'text-oracle-muted hover:text-white'
            }`}
          >
            <Mic className="w-4 h-4" />
            <span>Voice & Capture</span>
          </button>

          <button
            onClick={() => setActiveTab('alarm')}
            className={`flex items-center justify-center space-x-2 py-2.5 px-3 rounded-xl text-xs font-semibold tracking-wide transition-all ${
              activeTab === 'alarm'
                ? 'bg-oracle-dark text-oracle-cyan border border-oracle-cyan/40 shadow-cyan-glow'
                : 'text-oracle-muted hover:text-white'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>Alarm Hub</span>
          </button>
        </div>

        {/* Tab 1: Capture View */}
        {activeTab === 'capture' && (
          <div className="animate-fadeIn space-y-2">
            <VoiceCapture onIdeaSaved={handleIdeaSaved} />
            <IdeaList
              ideas={ideas}
              isLoading={isLoadingIdeas}
              onRefresh={fetchIdeas}
              onUpdateIdeaStatus={handleUpdateIdeaStatus}
              onDeleteIdea={handleDeleteIdea}
            />
          </div>
        )}

        {/* Tab 2: Alarm Hub View */}
        {activeTab === 'alarm' && (
          <div className="animate-fadeIn space-y-4">
            <AlarmClock
              settings={settings}
              onOpenSettings={() => setIsSettingsOpen(true)}
              onTriggerAlarm={handleAlarmTriggered}
              onUpdateSettings={(newSettings) => setSettings(newSettings)}
            />

            {/* Quick manual preview button */}
            <div className="flex justify-center px-4">
              <button
                onClick={handleOpenMorningPlayer}
                className="w-full py-2.5 px-4 rounded-xl bg-oracle-card border border-oracle-cyan/30 text-oracle-cyan hover:bg-oracle-cyan/10 hover:border-oracle-cyan text-xs font-semibold flex items-center justify-center space-x-2 shadow-sm transition"
              >
                <PlayCircle className="w-4 h-4" />
                <span>Preview Morning Audio Broadcast</span>
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Sequential Morning Audio Broadcast Player */}
      <MorningPlayer
        isOpen={isMorningPlayerOpen}
        onClose={() => setIsMorningPlayerOpen(false)}
        ideas={ideas}
        settings={settings}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onSettingsSaved={(newSettings) => setSettings(newSettings)}
      />
    </div>
  );
}

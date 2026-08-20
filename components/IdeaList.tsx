'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Inbox,
  Sun,
  Trash2,
  CheckCircle2,
  ArrowRight,
  RefreshCw,
  Calendar,
  Sparkles,
  Play,
  Pause,
  Volume2,
  Loader2,
  Headphones,
  AlertCircle,
  Check
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Idea, IdeaStatus } from '@/lib/types';

interface IdeaListProps {
  ideas: Idea[];
  isLoading: boolean;
  onRefresh: () => void;
  onUpdateIdeaStatus: (id: string, newStatus: IdeaStatus) => void;
  onDeleteIdea: (id: string) => void;
}

export function IdeaList({
  ideas,
  isLoading,
  onRefresh,
  onUpdateIdeaStatus,
  onDeleteIdea,
}: IdeaListProps) {
  const [activeTab, setActiveTab] = useState<'inbox' | 'tomorrow' | 'all'>('inbox');
  const [isGeneratingBriefing, setIsGeneratingBriefing] = useState(false);
  const [briefingAudioUrl, setBriefingAudioUrl] = useState<string | null>(null);
  const [briefingScript, setBriefingScript] = useState<string | null>(null);
  const [isPlayingBriefing, setIsPlayingBriefing] = useState(false);
  const [statusNotice, setStatusNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  const filteredIdeas = ideas.filter((idea) => {
    if (activeTab === 'all') return true;
    return idea.status === activeTab;
  });

  const tomorrowTasks = ideas.filter((i) => i.status === 'tomorrow');
  const inboxCount = ideas.filter((i) => i.status === 'inbox').length;
  const tomorrowCount = tomorrowTasks.length;

  const formatDate = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return (
        date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) +
        ' · ' +
        date.toLocaleDateString([], { month: 'short', day: 'numeric' })
      );
    } catch {
      return isoString;
    }
  };

  // Generate AI Assistant Tasks Briefing
  const handleGenerateBriefing = async () => {
    setIsGeneratingBriefing(true);
    setStatusNotice(null);
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      setIsPlayingBriefing(false);
    }

    const digestLang =
      typeof window !== 'undefined'
        ? localStorage.getItem('oracle_digest_lang') || 'ru'
        : 'ru';

    try {
      console.log('[Morning Oracle] Requesting AI Task Briefing generation...');
      const response = await fetch('/api/generate-tasks-briefing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tasks: tomorrowTasks,
          lang: digestLang,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        if (data?.script) {
          setBriefingScript(data.script);
        }
        throw new Error(data.error || 'TTS synthesis service is temporarily unreachable');
      }

      console.log('[Morning Oracle] Briefing generation succeeded:', data);
      setBriefingAudioUrl(data.audioUrl);
      setBriefingScript(data.script);
      setStatusNotice({
        type: 'success',
        text: 'AI Assistant briefing generated successfully!',
      });
    } catch (err: any) {
      console.error('[Morning Oracle] Briefing generation error:', err);
      setStatusNotice({
        type: 'error',
        text: 'TTS service notice: ' + (err.message || 'Server error'),
      });
    } finally {
      setIsGeneratingBriefing(false);
      setTimeout(() => setStatusNotice(null), 6000);
    }
  };

  // Toggle preview audio playback
  const togglePlayBriefing = () => {
    if (!briefingAudioUrl) return;

    if (!previewAudioRef.current) {
      const audio = new Audio(briefingAudioUrl);
      previewAudioRef.current = audio;

      audio.onended = () => {
        setIsPlayingBriefing(false);
      };
      audio.onerror = () => {
        setIsPlayingBriefing(false);
      };
    }

    if (isPlayingBriefing) {
      previewAudioRef.current.pause();
      setIsPlayingBriefing(false);
    } else {
      previewAudioRef.current.currentTime = 0;
      previewAudioRef.current
        .play()
        .then(() => setIsPlayingBriefing(true))
        .catch((e) => {
          console.warn('[Morning Oracle] Preview audio play error:', e);
          setIsPlayingBriefing(false);
        });
    }
  };

  useEffect(() => {
    return () => {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current = null;
      }
    };
  }, []);

  return (
    <section className="w-full max-w-md mx-auto p-4">
      {/* Header & Tabs */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <Calendar className="w-4 h-4 text-oracle-cyan" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-200">
            Captured Ideas
          </h2>
        </div>

        <div className="flex items-center space-x-2">
          {activeTab === 'tomorrow' && (
            <button
              onClick={handleGenerateBriefing}
              disabled={isGeneratingBriefing}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold tracking-wide transition-all ${
                isGeneratingBriefing
                  ? 'bg-oracle-cyan/20 border border-oracle-cyan text-oracle-cyan cursor-wait animate-pulse'
                  : 'bg-gradient-to-r from-oracle-cyan/20 to-oracle-magenta/20 hover:from-oracle-cyan/30 hover:to-oracle-magenta/30 border border-oracle-cyan/50 text-oracle-cyan shadow-cyan-glow'
              }`}
              title="Generate personal AI assistant spoken briefing for tomorrow"
            >
              {isGeneratingBriefing ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Crafting Audio...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-oracle-cyan" />
                  <span>✨ AI Briefing</span>
                </>
              )}
            </button>
          )}

          <button
            onClick={onRefresh}
            className="p-1.5 rounded-lg bg-oracle-card border border-oracle-border text-oracle-muted hover:text-oracle-cyan transition"
            title="Refresh list"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-oracle-cyan' : ''}`} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-3 gap-1 bg-oracle-card p-1 rounded-xl border border-oracle-border mb-4">
        <button
          onClick={() => setActiveTab('inbox')}
          className={`flex items-center justify-center space-x-1.5 py-2 px-2 rounded-lg text-xs font-medium transition-all ${
            activeTab === 'inbox'
              ? 'bg-oracle-border/80 text-oracle-cyan border border-oracle-cyan/30 shadow-sm'
              : 'text-oracle-muted hover:text-white'
          }`}
        >
          <Inbox className="w-3.5 h-3.5" />
          <span>Inbox</span>
          <span className="ml-1 text-[10px] px-1.5 py-0.2 bg-oracle-dark rounded-full border border-oracle-border">
            {inboxCount}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('tomorrow')}
          className={`flex items-center justify-center space-x-1.5 py-2 px-2 rounded-lg text-xs font-medium transition-all ${
            activeTab === 'tomorrow'
              ? 'bg-oracle-border/80 text-oracle-cyan border border-oracle-cyan/30 shadow-sm'
              : 'text-oracle-muted hover:text-white'
          }`}
        >
          <Sun className="w-3.5 h-3.5 text-yellow-400" />
          <span>Tomorrow</span>
          <span className="ml-1 text-[10px] px-1.5 py-0.2 bg-oracle-dark rounded-full border border-oracle-border">
            {tomorrowCount}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('all')}
          className={`flex items-center justify-center space-x-1.5 py-2 px-2 rounded-lg text-xs font-medium transition-all ${
            activeTab === 'all'
              ? 'bg-oracle-border/80 text-oracle-cyan border border-oracle-cyan/30 shadow-sm'
              : 'text-oracle-muted hover:text-white'
          }`}
        >
          <span>All</span>
          <span className="ml-1 text-[10px] px-1.5 py-0.2 bg-oracle-dark rounded-full border border-oracle-border">
            {ideas.length}
          </span>
        </button>
      </div>

      {/* Generated AI Briefing Preview Banner (Tomorrow Tab) */}
      {activeTab === 'tomorrow' && briefingAudioUrl && (
        <div className="mb-4 p-3.5 rounded-2xl glass-card border border-oracle-cyan/50 bg-oracle-card/90 shadow-cyan-glow animate-fadeIn">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-2">
              <div className="w-6 h-6 rounded-lg bg-oracle-cyan/20 border border-oracle-cyan/40 flex items-center justify-center">
                <Headphones className="w-3.5 h-3.5 text-oracle-cyan" />
              </div>
              <span className="text-xs font-bold text-white tracking-wide uppercase">
                Assistant Task Briefing Ready
              </span>
            </div>

            <button
              onClick={togglePlayBriefing}
              className="flex items-center space-x-1.5 px-3 py-1 rounded-xl bg-oracle-cyan text-oracle-dark font-bold text-xs hover:bg-cyan-300 transition shadow-sm"
            >
              {isPlayingBriefing ? (
                <>
                  <Pause className="w-3.5 h-3.5 fill-current" />
                  <span>Pause</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Preview Audio</span>
                </>
              )}
            </button>
          </div>

          {briefingScript && (
            <p className="text-[11px] text-gray-300 italic bg-oracle-dark/70 p-2.5 rounded-xl border border-oracle-border/60 leading-relaxed">
              &quot;{briefingScript}&quot;
            </p>
          )}
        </div>
      )}

      {/* Notice Message */}
      {statusNotice && (
        <div
          className={`mb-3 p-2.5 rounded-xl text-xs font-mono flex items-center space-x-2 animate-fadeIn ${
            statusNotice.type === 'success'
              ? 'bg-oracle-cyan/15 border border-oracle-cyan/40 text-oracle-cyan'
              : 'bg-oracle-magenta/15 border border-oracle-magenta/40 text-oracle-magenta'
          }`}
        >
          {statusNotice.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          <span>{statusNotice.text}</span>
        </div>
      )}

      {/* Ideas List */}
      {isLoading && ideas.length === 0 ? (
        <div className="glass-card rounded-2xl p-8 flex flex-col items-center justify-center text-center">
          <RefreshCw className="w-6 h-6 text-oracle-cyan animate-spin mb-2" />
          <p className="text-xs text-oracle-muted">Loading ideas from Supabase...</p>
        </div>
      ) : filteredIdeas.length === 0 ? (
        <div className="glass-card rounded-2xl p-8 flex flex-col items-center justify-center text-center border border-dashed border-oracle-border">
          <Sparkles className="w-8 h-8 text-oracle-muted opacity-40 mb-2" />
          <p className="text-sm font-medium text-gray-300">No ideas in {activeTab}</p>
          <p className="text-xs text-oracle-muted mt-1 max-w-[240px]">
            {activeTab === 'inbox'
              ? 'Use voice or typing above to record new ideas!'
              : activeTab === 'tomorrow'
              ? 'Move ideas here from Inbox to generate an AI assistant morning audio briefing.'
              : 'Your captured thoughts will appear here.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredIdeas.map((idea) => (
            <div
              key={idea.id}
              className="glass-card glass-card-hover rounded-xl p-4 border border-oracle-border/80 flex flex-col justify-between group transition-all"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <p className="text-sm text-gray-100 font-normal leading-relaxed whitespace-pre-wrap break-words flex-1">
                  {idea.text}
                </p>
                <button
                  onClick={() => onDeleteIdea(idea.id)}
                  className="opacity-60 group-hover:opacity-100 text-oracle-muted hover:text-oracle-magenta transition-colors p-1"
                  title="Delete idea"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-oracle-border/40 text-xs">
                <span className="text-[11px] text-oracle-muted font-mono">
                  {formatDate(idea.created_at)}
                </span>

                <div className="flex items-center space-x-2">
                  {idea.status === 'inbox' ? (
                    <button
                      onClick={() => onUpdateIdeaStatus(idea.id, 'tomorrow')}
                      className="flex items-center space-x-1 px-3 py-1 rounded-lg bg-oracle-cyan/15 hover:bg-oracle-cyan/30 text-oracle-cyan border border-oracle-cyan/40 transition text-[11px] font-semibold"
                      title="Schedule for Tomorrow Morning"
                    >
                      <Sun className="w-3 h-3 text-yellow-400" />
                      <span>Move to Tomorrow</span>
                      <ArrowRight className="w-3 h-3 ml-0.5" />
                    </button>
                  ) : idea.status === 'tomorrow' ? (
                    <button
                      onClick={() => onUpdateIdeaStatus(idea.id, 'inbox')}
                      className="flex items-center space-x-1 px-3 py-1 rounded-lg bg-oracle-border/80 hover:bg-oracle-border text-oracle-muted hover:text-white border border-oracle-border transition text-[11px]"
                      title="Move back to Inbox"
                    >
                      <Inbox className="w-3 h-3" />
                      <span>Back to Inbox</span>
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

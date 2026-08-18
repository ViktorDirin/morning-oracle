'use client';

import React from 'react';
import { Sparkles, Sliders, Moon } from 'lucide-react';

interface HeaderProps {
  onOpenSettings: () => void;
}

export function Header({ onOpenSettings }: HeaderProps) {
  return (
    <header className="w-full border-b border-oracle-border bg-oracle-card/80 backdrop-blur-md sticky top-0 z-40 px-4 py-3 shadow-md">
      <div className="max-w-md mx-auto flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-oracle-cyan/20 to-oracle-magenta/20 border border-oracle-cyan/40 flex items-center justify-center shadow-cyan-glow">
            <Sparkles className="w-5 h-5 text-oracle-cyan animate-pulse" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-wider text-white flex items-center gap-1.5">
              MORNING <span className="text-oracle-cyan font-black">ORACLE</span>
            </h1>
            <p className="text-[10px] text-oracle-muted uppercase tracking-widest font-mono">
              AI Voice Assistant
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-oracle-border/50 text-xs font-mono text-oracle-cyan border border-oracle-cyan/30">
            <Moon className="w-3.5 h-3.5" />
            <span className="text-[10px] font-semibold tracking-wider">DARK</span>
          </div>

          <button
            onClick={onOpenSettings}
            className="p-2 rounded-xl bg-oracle-card border border-oracle-border hover:border-oracle-cyan text-oracle-muted hover:text-oracle-cyan transition-all duration-200"
            title="Settings"
            aria-label="Settings"
          >
            <Sliders className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}

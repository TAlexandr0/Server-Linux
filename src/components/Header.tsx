import React from 'react';
import { Server, Terminal, Layers, PlayCircle, ShieldCheck, Download, Activity } from 'lucide-react';

interface HeaderProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onOpenQuickRsnModal: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  onOpenQuickRsnModal,
}) => {
  const navItems = [
    { id: 'architecture', label: 'Архитектура', icon: Layers },
    { id: 'protocol', label: 'Протокол & API', icon: Terminal },
    { id: 'simulator', label: 'Симулятор Sync', icon: PlayCircle },
    { id: 'admin', label: 'Веб-Консоль', icon: ShieldCheck },
    { id: 'diagnostics', label: 'Диагностика', icon: Activity },
    { id: 'code', label: 'Код & Деплой', icon: Server },
  ];

  return (
    <header className="sticky top-0 z-40 bg-neutral-950/90 backdrop-blur-md border-b border-neutral-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Zone 1: Brand title, single clean text element */}
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 font-bold text-sm">
            TUX
          </div>
          <button
            onClick={() => setActiveTab('architecture')}
            className="text-lg font-bold tracking-tight text-white hover:text-amber-400 transition-colors text-left"
          >
            OpenRevitServer
          </button>
        </div>

        {/* Zone 2: Navigation Links (1-2 word labels, single line) */}
        <nav className="hidden md:flex items-center gap-1 sm:gap-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-neutral-800 text-amber-400 border border-neutral-700/80 shadow-sm'
                    : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900/60'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-amber-400' : 'text-neutral-500'}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Primary Actions */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={onOpenQuickRsnModal}
            className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-neutral-900 border border-neutral-700 hover:border-amber-500/50 hover:bg-neutral-800 text-neutral-200 hover:text-amber-300 transition-colors flex items-center gap-1.5 whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5 text-amber-400" />
            <span>RSN.ini</span>
          </button>
          <button
            onClick={() => setActiveTab('code')}
            className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-amber-500 hover:bg-amber-400 text-neutral-950 shadow-sm transition-colors whitespace-nowrap"
          >
            Скачать Демон
          </button>
        </div>
      </div>
    </header>
  );
};

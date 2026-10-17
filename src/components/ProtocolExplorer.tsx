import React, { useState } from 'react';
import { protocolEndpoints } from '../data/protocolSpecs';
import { ProtocolEndpoint } from '../types/revitServer';
import { Terminal, Copy, Check, Info, Layers, Send } from 'lucide-react';

interface ProtocolExplorerProps {
  onOpenInPlayground: (endpoint: ProtocolEndpoint) => void;
}

export const ProtocolExplorer: React.FC<ProtocolExplorerProps> = ({ onOpenInPlayground }) => {
  const [selectedEndpoint, setSelectedEndpoint] = useState<ProtocolEndpoint>(protocolEndpoints[0]);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const categories = ['All', 'Discovery', 'File System', 'Locking', 'Synchronization', 'History'];

  const filteredEndpoints = selectedCategory === 'All'
    ? protocolEndpoints
    : protocolEndpoints.filter(ep => ep.category === selectedCategory);

  const handleCopy = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const getMethodBadgeClass = (method: string) => {
    switch (method) {
      case 'GET': return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      case 'POST': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'PUT': return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      case 'DELETE': return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
      default: return 'bg-neutral-800 text-neutral-300 border-neutral-700';
    }
  };

  return (
    <div className="space-y-8">
      {/* Header Info */}
      <div className="space-y-2">
        <h2 className="text-xl font-bold text-white tracking-tight">Спецификация Протокола Revit Server WCF / REST</h2>
        <p className="text-xs text-neutral-400 max-w-3xl">
          Все конечные точки, заголовки и форматы данных, которые клиент Autodesk Revit отправляет на порт 808/80. 
          Ваш Linux-сервер должен отвечать на эти вызовы согласно данной схеме.
        </p>
      </div>

      {/* Category Pills (Interactive Filter Controls conforming to Zero-Pill) */}
      <div className="flex items-center gap-1.5 p-1 bg-neutral-900 border border-neutral-800 rounded-lg w-fit overflow-x-auto max-w-full">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              selectedCategory === cat
                ? 'bg-neutral-800 text-amber-400 shadow-sm border border-neutral-700'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Master Detail Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Endpoints List (Left) */}
        <div className="lg:col-span-5 space-y-2.5">
          {filteredEndpoints.map((ep) => {
            const isSelected = ep.id === selectedEndpoint.id;
            return (
              <button
                key={ep.id}
                onClick={() => setSelectedEndpoint(ep)}
                className={`w-full text-left p-3.5 rounded-xl border transition-all ${
                  isSelected
                    ? 'bg-neutral-900 border-amber-500/50 shadow-md ring-1 ring-amber-500/20'
                    : 'bg-neutral-900/40 border-neutral-800/80 hover:bg-neutral-900/80 hover:border-neutral-700'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border ${getMethodBadgeClass(ep.httpMethod)}`}>
                      {ep.httpMethod}
                    </span>
                    <span className="text-xs font-semibold text-neutral-200 truncate">
                      {ep.name}
                    </span>
                  </div>
                  <span className="text-[10px] text-neutral-500 font-mono">
                    {ep.category}
                  </span>
                </div>
                <div className="text-[11px] font-mono text-neutral-400 truncate">
                  {ep.path}
                </div>
              </button>
            );
          })}
        </div>

        {/* Endpoint Inspector (Right) */}
        <div className="lg:col-span-7 rounded-xl border border-neutral-800 bg-neutral-900/50 p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-800 pb-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${getMethodBadgeClass(selectedEndpoint.httpMethod)}`}>
                  {selectedEndpoint.httpMethod}
                </span>
                <h3 className="text-base font-bold text-white">{selectedEndpoint.name}</h3>
              </div>
              <div className="text-xs font-mono text-neutral-400 break-all">
                {selectedEndpoint.path}
              </div>
            </div>

            <button
              onClick={() => onOpenInPlayground(selectedEndpoint)}
              className="px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 text-xs font-semibold flex items-center gap-1.5 transition-colors self-start sm:self-auto whitespace-nowrap"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Тестировать вызов</span>
            </button>
          </div>

          {/* Summary & Description */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-neutral-300">Назначение метода:</div>
            <p className="text-xs text-neutral-300 leading-relaxed">
              {selectedEndpoint.description}
            </p>
          </div>

          {/* Linux Architecture Specifics */}
          <div className="p-3.5 rounded-lg bg-amber-500/5 border border-amber-500/20 text-xs text-amber-200/90 flex items-start gap-2.5">
            <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <strong className="text-amber-300 font-semibold">Реализация на Linux: </strong>
              {selectedEndpoint.relevanceToLinux}
            </div>
          </div>

          {/* HTTP Headers Expected from Revit */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-neutral-300">Заголовки запроса Revit Client</span>
              <span className="text-[10px] text-neutral-500 font-mono">Автоматически инжектируются Revit.exe</span>
            </div>
            <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800 font-mono text-[11px] space-y-1">
              {Object.entries(selectedEndpoint.headers).map(([key, val]) => (
                <div key={key} className="flex gap-2 text-neutral-400">
                  <span className="text-amber-400/90">{key}:</span>
                  <span className="text-neutral-300 truncate">{val}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Request Payload (if present) */}
          {selectedEndpoint.requestExample && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-neutral-300">Тело запроса (Request Payload)</span>
                <button
                  onClick={() => handleCopy(selectedEndpoint.requestExample!, 'req')}
                  className="text-[11px] text-neutral-400 hover:text-white flex items-center gap-1 font-mono"
                >
                  {copiedField === 'req' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedField === 'req' ? 'Скопировано' : 'Копировать'}</span>
                </button>
              </div>
              <pre className="p-3.5 rounded-lg bg-neutral-950 border border-neutral-800 font-mono text-xs text-neutral-300 overflow-x-auto">
                {selectedEndpoint.requestExample}
              </pre>
            </div>
          )}

          {/* Response Payload */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-neutral-300">Ожидаемый ответ сервера (Response JSON)</span>
              <button
                onClick={() => handleCopy(selectedEndpoint.responseExample, 'resp')}
                className="text-[11px] text-neutral-400 hover:text-white flex items-center gap-1 font-mono"
              >
                {copiedField === 'resp' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedField === 'resp' ? 'Скопировано' : 'Копировать'}</span>
              </button>
            </div>
            <pre className="p-3.5 rounded-lg bg-neutral-950 border border-neutral-800 font-mono text-xs text-emerald-400/90 overflow-x-auto">
              {selectedEndpoint.responseExample}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};

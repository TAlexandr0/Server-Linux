import React, { useState } from 'react';
import { codeTemplates, CodeTemplate } from '../data/codeTemplates';
import { Copy, Check, FileCode2, Terminal, Download, ShieldCheck } from 'lucide-react';

export const CodeGenerator: React.FC = () => {
  const [selectedTemplate, setSelectedTemplate] = useState<CodeTemplate>(codeTemplates[0]);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(selectedTemplate.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([selectedTemplate.code], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = selectedTemplate.filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h2 className="text-xl font-bold text-white tracking-tight">Исходный Код & Шаблоны Реализации для Linux</h2>
        <p className="text-xs text-neutral-400 max-w-3xl">
          Готовый рабочий каркас сервера на Go, .NET 9 Kestrel, конфигурация Docker Compose и клиентский файл RSN.ini.
          Вы можете скопировать код или скачать готовые файлы для компиляции.
        </p>
      </div>

      {/* Language / File Tabs (Zero-Pill compliant segmented tabs) */}
      <div className="flex items-center gap-1.5 p-1 bg-neutral-900 border border-neutral-800 rounded-lg w-fit overflow-x-auto max-w-full">
        {codeTemplates.map((tmpl) => (
          <button
            key={tmpl.filename}
            onClick={() => setSelectedTemplate(tmpl)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              selectedTemplate.filename === tmpl.filename
                ? 'bg-neutral-800 text-amber-400 shadow-sm border border-neutral-700'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            {tmpl.title}
          </button>
        ))}
      </div>

      {/* Code Viewer Panel */}
      <div className="rounded-xl border border-neutral-800 bg-neutral-950 overflow-hidden shadow-2xl">
        {/* Top bar */}
        <div className="px-5 py-3 bg-neutral-900/90 border-b border-neutral-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <FileCode2 className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-mono font-bold text-white">{selectedTemplate.filename}</span>
            </div>
            <p className="text-[11px] text-neutral-400">
              {selectedTemplate.description}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-medium border border-neutral-700 flex items-center gap-1.5 transition-colors whitespace-nowrap"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Скопировано!' : 'Копировать'}</span>
            </button>
            <button
              onClick={handleDownload}
              className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-neutral-950 text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Скачать {selectedTemplate.filename}</span>
            </button>
          </div>
        </div>

        {/* Code Content */}
        <div className="p-5 overflow-x-auto max-h-[580px] overflow-y-auto">
          <pre className="font-mono text-xs text-neutral-300 leading-relaxed">
            {selectedTemplate.code}
          </pre>
        </div>
      </div>
    </div>
  );
};

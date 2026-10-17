import React, { useState, useEffect } from 'react';
import { ProtocolEndpoint } from '../types/revitServer';
import { protocolEndpoints } from '../data/protocolSpecs';
import { Play, RotateCcw, Copy, Check, Terminal, CheckCircle2, AlertCircle } from 'lucide-react';

interface ApiPlaygroundProps {
  initialEndpoint?: ProtocolEndpoint;
}

export const ApiPlayground: React.FC<ApiPlaygroundProps> = ({ initialEndpoint }) => {
  const [selectedEndpoint, setSelectedEndpoint] = useState<ProtocolEndpoint>(
    initialEndpoint || protocolEndpoints[0]
  );
  const [httpMethod, setHttpMethod] = useState(selectedEndpoint.httpMethod);
  const [requestUrl, setRequestUrl] = useState(selectedEndpoint.path);
  const [userName, setUserName] = useState('Alexey_Sidorov');
  const [machineName, setMachineName] = useState('WS-ARCH-04');
  const [requestBody, setRequestBody] = useState(selectedEndpoint.requestExample || '');
  
  const [responseStatus, setResponseStatus] = useState<number | null>(null);
  const [responseBody, setResponseBody] = useState<string | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (initialEndpoint) {
      setSelectedEndpoint(initialEndpoint);
      setHttpMethod(initialEndpoint.httpMethod);
      setRequestUrl(initialEndpoint.path);
      setRequestBody(initialEndpoint.requestExample || '');
      setResponseStatus(null);
      setResponseBody(null);
    }
  }, [initialEndpoint]);

  const handleSelectEndpoint = (ep: ProtocolEndpoint) => {
    setSelectedEndpoint(ep);
    setHttpMethod(ep.httpMethod);
    setRequestUrl(ep.path);
    setRequestBody(ep.requestExample || '');
    setResponseStatus(null);
    setResponseBody(null);
  };

  const handleExecuteRequest = () => {
    setIsLoading(true);
    setResponseStatus(null);
    setResponseBody(null);

    const startTime = performance.now();

    setTimeout(() => {
      const duration = Math.round(performance.now() - startTime + Math.random() * 20 + 8);
      setLatencyMs(duration);
      setIsLoading(false);

      if (requestUrl.includes('/lock') && requestBody.includes('ForceConflict')) {
        setResponseStatus(409);
        setResponseBody(JSON.stringify({
          Status: "Conflict",
          Error: "ModelLockedByAnotherUser",
          LockedBy: "Elena_Vasilieva",
          MachineName: "WS-STR-02",
          AcquiredAt: new Date(Date.now() - 120000).toISOString(),
          Message: "Cannot acquire lock: Resource currently in exclusive synchronization."
        }, null, 2));
      } else {
        setResponseStatus(200);
        try {
          const parsed = JSON.parse(selectedEndpoint.responseExample);
          setResponseBody(JSON.stringify(parsed, null, 2));
        } catch {
          setResponseBody(selectedEndpoint.responseExample);
        }
      }
    }, 450);
  };

  const handleCopyResponse = () => {
    if (responseBody) {
      navigator.clipboard.writeText(responseBody);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h2 className="text-xl font-bold text-white tracking-tight">Интерактивная Консоль Запросов (REST Playground)</h2>
        <p className="text-xs text-neutral-400 max-w-3xl">
          Отправьте пробный HTTP-запрос к эмулятору Linux Revit Server. Вы можете проверить передачу кастомных заголовков Revit и тело запроса.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Side: Request Config */}
        <div className="lg:col-span-6 space-y-4">
          <div className="p-5 rounded-xl border border-neutral-800 bg-neutral-900/40 space-y-4">
            {/* Quick Template Picker */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-300">Шаблон запроса:</label>
              <select
                value={selectedEndpoint.id}
                onChange={(e) => {
                  const ep = protocolEndpoints.find(p => p.id === e.target.value);
                  if (ep) handleSelectEndpoint(ep);
                }}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-amber-500 font-mono"
              >
                {protocolEndpoints.map(ep => (
                  <option key={ep.id} value={ep.id}>
                    [{ep.httpMethod}] {ep.name}
                  </option>
                ))}
              </select>
            </div>

            {/* URL input */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-300">HTTP Метод & Путь:</label>
              <div className="flex items-center gap-2">
                <span className="px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700 font-mono text-xs font-bold text-amber-400">
                  {httpMethod}
                </span>
                <input
                  type="text"
                  value={requestUrl}
                  onChange={(e) => setRequestUrl(e.target.value)}
                  className="flex-1 bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs font-mono text-neutral-200 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            {/* Revit Specific Headers */}
            <div className="space-y-2 pt-2 border-t border-neutral-800/80">
              <label className="text-xs font-semibold text-neutral-300">Идентификация пользователя Revit:</label>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <span className="text-[10px] text-neutral-400 font-mono">User-Name</span>
                  <input
                    type="text"
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded px-2.5 py-1.5 text-xs text-neutral-200 font-mono focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] text-neutral-400 font-mono">User-Machine-Name</span>
                  <input
                    type="text"
                    value={machineName}
                    onChange={(e) => setMachineName(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded px-2.5 py-1.5 text-xs text-neutral-200 font-mono focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Request Body (if POST/PUT) */}
            {httpMethod !== 'GET' && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-neutral-300">Тело запроса (JSON):</label>
                  <button
                    onClick={() => setRequestBody(selectedEndpoint.requestExample || '')}
                    className="text-[11px] text-neutral-500 hover:text-neutral-300 font-mono"
                  >
                    Сбросить к образцу
                  </button>
                </div>
                <textarea
                  rows={6}
                  value={requestBody}
                  onChange={(e) => setRequestBody(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-3 text-xs font-mono text-neutral-200 focus:outline-none focus:border-amber-500"
                />
              </div>
            )}

            {/* Execute Button */}
            <div className="pt-2">
              <button
                disabled={isLoading}
                onClick={handleExecuteRequest}
                className="w-full py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-neutral-950 text-xs font-bold flex items-center justify-center gap-2 transition-colors shadow-sm"
              >
                <Play className="w-4 h-4" />
                <span>{isLoading ? 'Выполнение запроса...' : 'Отправить HTTP Запрос'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Side: Response View */}
        <div className="lg:col-span-6 space-y-4">
          <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-5 space-y-4 min-h-[360px]">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-neutral-200">Ответ сервера (Response):</span>
                {responseStatus && (
                  <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
                    responseStatus === 200
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                  }`}>
                    HTTP {responseStatus}
                  </span>
                )}
                {latencyMs !== null && (
                  <span className="text-[11px] font-mono text-neutral-500">
                    {latencyMs} ms
                  </span>
                )}
              </div>

              {responseBody && (
                <button
                  onClick={handleCopyResponse}
                  className="text-xs text-neutral-400 hover:text-white flex items-center gap-1 font-mono"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Скопировано' : 'Копировать'}</span>
                </button>
              )}
            </div>

            {responseBody ? (
              <pre className="font-mono text-xs text-emerald-400/90 overflow-x-auto whitespace-pre leading-relaxed max-h-[420px] overflow-y-auto">
                {responseBody}
              </pre>
            ) : (
              <div className="flex flex-col items-center justify-center h-52 text-neutral-500 text-xs text-center space-y-2">
                <Terminal className="w-8 h-8 text-neutral-600" />
                <div>Нажмите «Отправить HTTP Запрос» для проверки конечной точки</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

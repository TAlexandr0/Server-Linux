import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, 
  RotateCcw, 
  Lock, 
  Unlock, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  Terminal, 
  UserCheck, 
  Laptop,
  ArrowRight,
  ShieldAlert
} from 'lucide-react';
import { sampleModels } from '../data/sampleProjects';
import { RevitModel, SyncSessionStep } from '../types/revitServer';

interface LogMessage {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
}

export const LiveSyncSimulator: React.FC = () => {
  const [selectedModel, setSelectedModel] = useState<RevitModel>(sampleModels[0]);
  const [activeLock, setActiveLock] = useState<{
    lockedBy: string;
    machineName: string;
    token: string;
    expiresInSec: number;
  } | null>(null);

  const [alexeyStatus, setAlexeyStatus] = useState<'idle' | 'syncing' | 'finished' | 'failed'>('idle');
  const [elenaStatus, setElenaStatus] = useState<'idle' | 'syncing' | 'blocked' | 'finished'>('idle');
  
  const [syncSteps, setSyncSteps] = useState<SyncSessionStep[]>([]);
  const [logs, setLogs] = useState<LogMessage[]>([
    {
      id: 'l-0',
      timestamp: '11:12:00',
      level: 'info',
      message: 'Linux Revit Daemon инициализирован на порту 8080 (Storage: /var/revit/storage/Projects)',
    },
    {
      id: 'l-1',
      timestamp: '11:12:01',
      level: 'info',
      message: 'Ready for client connections. RSN broadcast: TUX-REVIT-01 (Host mode)',
    },
  ]);

  const logEndRef = useRef<HTMLDivElement>(null);

  const addLog = (level: 'info' | 'warn' | 'error' | 'success', message: string) => {
    const timeStr = new Date().toLocaleTimeString();
    setLogs(prev => [
      ...prev,
      { id: 'log-' + Math.random(), timestamp: timeStr, level, message }
    ]);
  };

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Handle Alexey Sync sequence
  const startAlexeySync = async () => {
    if (activeLock) {
      addLog('warn', `Запрос отклонен: Модель ${selectedModel.name} уже заблокирована пользователем ${activeLock.lockedBy}`);
      return;
    }

    setAlexeyStatus('syncing');
    const token = 'tok-' + Math.random().toString(36).substring(2, 9);

    const steps: SyncSessionStep[] = [
      {
        step: 1,
        name: 'Проверка доступности хоста',
        status: 'in_progress',
        endpoint: '/RevitServerAdminRESTService/AdminRESTService.svc/server/info',
        method: 'GET',
        description: 'Проверка роли сервера (Host/Accelerator) и дисковой квоты',
      },
      {
        step: 2,
        name: 'Атомарный захват блокировки модели',
        status: 'pending',
        endpoint: `/RevitServerAdminRESTService/AdminRESTService.svc${selectedModel.path}/lock`,
        method: 'POST',
        description: 'Эксклюзивная блокировка центрального файла во избежание коллизий',
      },
      {
        step: 3,
        name: 'Передача бинарной дельты элементов',
        status: 'pending',
        endpoint: '/ModelService/ModelService.svc/Stream/SyncDelta',
        method: 'POST',
        description: 'Передача 3.8 МБ компрессированных данных изменений рабочих наборов',
      },
      {
        step: 4,
        name: 'Фиксация версии и снятие блокировки',
        status: 'pending',
        endpoint: `/RevitServerAdminRESTService/AdminRESTService.svc${selectedModel.path}/unlock`,
        method: 'POST',
        description: 'Запись новой ревизии и освобождение ресурса для других участников',
      },
    ];

    setSyncSteps([...steps]);
    addLog('info', `[Алексей @ WS-ARCH-04] Инициализирована синхронизация модели: ${selectedModel.name}`);

    // Step 1
    await new Promise(r => setTimeout(r, 600));
    steps[0].status = 'success';
    steps[1].status = 'in_progress';
    setSyncSteps([...steps]);
    addLog('info', `[HTTP 200] Host confirmed: TUX-REVIT-01. Доступно места: 3.4 TB`);

    // Step 2
    await new Promise(r => setTimeout(r, 800));
    steps[1].status = 'success';
    steps[2].status = 'in_progress';
    setActiveLock({
      lockedBy: 'Alexey_Sidorov',
      machineName: 'WS-ARCH-04',
      token,
      expiresInSec: 600,
    });
    setSyncSteps([...steps]);
    addLog('warn', `[LOCK ACQUIRED] Модель ${selectedModel.name} заблокирована Алексеем. Токен: ${token}`);

    // Step 3
    await new Promise(r => setTimeout(r, 1400));
    steps[2].status = 'success';
    steps[3].status = 'in_progress';
    setSyncSteps([...steps]);
    addLog('info', `[DELTA STREAM] Принято 3,842,109 байт (Delta #143). Checksum SHA256: e8f9... подтверждена.`);

    // Step 4
    await new Promise(r => setTimeout(r, 800));
    steps[3].status = 'success';
    setActiveLock(null);
    setAlexeyStatus('finished');
    setSyncSteps([...steps]);
    addLog('success', `[SYNC COMPLETE] Новая ревизия #${selectedModel.revisionNumber + 1} зафиксирована на Linux ZFS датасете. Блокировка снята.`);
  };

  // Handle Elena simultaneous attempt
  const triggerElenaCollision = async () => {
    setElenaStatus('syncing');
    addLog('info', `[Елена @ WS-STR-02] Попытка синхронизации с центральной моделью...`);

    await new Promise(r => setTimeout(r, 500));

    if (activeLock) {
      setElenaStatus('blocked');
      addLog('error', `[HTTP 409 CONFLICT] Модель занята! Заблокирована: ${activeLock.lockedBy} (${activeLock.machineName}). Клиент Revit выдаст диалоговое окно «Модель занята другим пользователем».`);
    } else {
      setElenaStatus('finished');
      addLog('success', `[Елена @ WS-STR-02] Модель свободна, блокировка успешно получена.`);
    }
  };

  // Simulate Stale Lock (Alexey computer crash)
  const simulateCrashStaleLock = () => {
    const token = 'tok-stale-' + Math.random().toString(36).substring(2, 7);
    setActiveLock({
      lockedBy: 'Alexey_Sidorov',
      machineName: 'WS-ARCH-04 (OFFLINE)',
      token,
      expiresInSec: 540,
    });
    setAlexeyStatus('failed');
    addLog('error', `[СБОЙ КЛИЕНТА] ПК Алексея аварийно выключился во время передачи данных! Блокировка ${token} осталась в памяти сервера.`);
  };

  // Admin Force Unlock
  const handleForceUnlock = () => {
    if (!activeLock) return;
    const prevHolder = activeLock.lockedBy;
    setActiveLock(null);
    setAlexeyStatus('idle');
    setElenaStatus('idle');
    addLog('success', `[ADMIN OVERRIDE] Администратор принудительно снял зависшую блокировку пользователя ${prevHolder}. Модель разблокирована.`);
  };

  const handleReset = () => {
    setActiveLock(null);
    setAlexeyStatus('idle');
    setElenaStatus('idle');
    setSyncSteps([]);
    addLog('info', `Состояние симулятора сброшено.`);
  };

  return (
    <div className="space-y-8">
      {/* Introduction */}
      <div className="space-y-2">
        <h2 className="text-xl font-bold text-white tracking-tight">
          Интерактивный Симулятор: Concurrency Lock & Синхронизация (SWC)
        </h2>
        <p className="text-xs text-neutral-400 max-w-3xl">
          Смоделируйте работу двух инженеров (Архитектор Алексей и Конструктор Елена), пытающихся синхронизировать свои модели, 
          проверьте возникновение гонки (Race Condition / 409 Conflict) и работу механизма зависших блокировок на Linux.
        </p>
      </div>

      {/* Control Cockpit */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Side: Workstations & Actions */}
        <div className="lg:col-span-6 space-y-6">
          {/* Target Model Selector */}
          <div className="p-4 rounded-xl border border-neutral-800 bg-neutral-900/40 space-y-2">
            <label className="text-xs font-semibold text-neutral-300">Целевая модель для синхронизации:</label>
            <select
              value={selectedModel.id}
              onChange={(e) => {
                const found = sampleModels.find(m => m.id === e.target.value);
                if (found) setSelectedModel(found);
              }}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-amber-500 font-mono"
            >
              {sampleModels.map(m => (
                <option key={m.id} value={m.id}>
                  {m.name} (Rev #{m.revisionNumber}, {(m.sizeBytes / 1024 / 1024).toFixed(0)} MB)
                </option>
              ))}
            </select>
          </div>

          {/* Workstation 1: Alexey */}
          <div className="p-5 rounded-xl border border-neutral-800 bg-neutral-900/40 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                  <Laptop className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white">АРМ 1: Алексей (Архитектор)</h4>
                  <div className="text-[11px] font-mono text-neutral-400">WS-ARCH-04 · 192.168.10.112</div>
                </div>
              </div>

              {alexeyStatus === 'syncing' && (
                <span className="text-[11px] text-amber-400 font-mono flex items-center gap-1.5 animate-pulse">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Синхронизация...</span>
                </span>
              )}
              {alexeyStatus === 'finished' && (
                <span className="text-[11px] text-emerald-400 font-mono flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Синхронизировано</span>
                </span>
              )}
              {alexeyStatus === 'failed' && (
                <span className="text-[11px] text-rose-400 font-mono flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Сбой питания ПК</span>
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                disabled={alexeyStatus === 'syncing'}
                onClick={startAlexeySync}
                className="px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-neutral-950 text-xs font-bold flex items-center gap-2 transition-colors"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Синхронизировать с центральным</span>
              </button>

              <button
                onClick={simulateCrashStaleLock}
                className="px-3 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-medium border border-neutral-700 transition-colors"
                title="Смоделировать внезапный обрыв питания при синхронизации"
              >
                Сымитировать краш ПК
              </button>
            </div>
          </div>

          {/* Workstation 2: Elena */}
          <div className="p-5 rounded-xl border border-neutral-800 bg-neutral-900/40 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
                  <Laptop className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white">АРМ 2: Елена (Конструктор)</h4>
                  <div className="text-[11px] font-mono text-neutral-400">WS-STR-02 · 192.168.10.115</div>
                </div>
              </div>

              {elenaStatus === 'blocked' && (
                <span className="text-[11px] text-rose-400 font-mono flex items-center gap-1">
                  <Lock className="w-3.5 h-3.5" />
                  <span>409 Заблокировано</span>
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={triggerElenaCollision}
                className="px-3.5 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold flex items-center gap-2 transition-colors"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Попробовать синхронизироваться</span>
              </button>
            </div>
          </div>

          {/* Active Lock Status Box */}
          <div className="p-4 rounded-xl border border-neutral-800 bg-neutral-900/60 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {activeLock ? (
                  <Lock className="w-4 h-4 text-amber-400" />
                ) : (
                  <Unlock className="w-4 h-4 text-emerald-400" />
                )}
                <span className="text-xs font-bold text-white">
                  Текущий статус замка (Model Lock State)
                </span>
              </div>

              {activeLock && (
                <button
                  onClick={handleForceUnlock}
                  className="px-2.5 py-1 rounded bg-rose-500/10 border border-rose-500/30 text-rose-400 hover:bg-rose-500/20 text-[11px] font-semibold flex items-center gap-1 transition-colors"
                >
                  <ShieldAlert className="w-3 h-3" />
                  <span>Admin Force Unlock</span>
                </button>
              )}
            </div>

            {activeLock ? (
              <div className="text-xs space-y-1 font-mono text-neutral-300">
                <div>Заблокировано: <span className="text-amber-400 font-semibold">{activeLock.lockedBy}</span> ({activeLock.machineName})</div>
                <div>Токен: <span className="text-neutral-400">{activeLock.token}</span></div>
                <div className="text-[11px] text-neutral-400">Таймаут истечения TTL: 10 минут</div>
              </div>
            ) : (
              <div className="text-xs text-neutral-400">
                Модель свободна. Любой клиент Revit может безопасно захватить эксклюзивный доступ.
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Execution Steps & Live Server Logs */}
        <div className="lg:col-span-6 space-y-6">
          {/* Synchronize Steps Visualizer */}
          {syncSteps.length > 0 && (
            <div className="p-4 rounded-xl border border-neutral-800 bg-neutral-900/30 space-y-3">
              <div className="text-xs font-bold text-white">Шаги протокола синхронизации:</div>
              <div className="space-y-2">
                {syncSteps.map((st) => (
                  <div
                    key={st.step}
                    className={`p-2.5 rounded-lg border text-xs flex items-center justify-between ${
                      st.status === 'in_progress'
                        ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                        : st.status === 'success'
                        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                        : 'bg-neutral-950/40 border-neutral-800/60 text-neutral-500'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] font-bold">#{st.step}</span>
                      <span>{st.name}</span>
                    </div>
                    <span className="font-mono text-[10px]">
                      {st.status === 'in_progress' ? 'Выполняется...' : st.status === 'success' ? '✔ 200 OK' : 'Ожидание'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Linux Daemon Terminal Logs */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-950 overflow-hidden flex flex-col h-[380px]">
            <div className="px-4 py-2.5 bg-neutral-900/80 border-b border-neutral-800 flex items-center justify-between text-xs text-neutral-400">
              <div className="flex items-center gap-2">
                <Terminal className="w-3.5 h-3.5 text-amber-400" />
                <span className="font-mono font-semibold text-neutral-200">journalctl -u revit-daemon.service</span>
              </div>
              <button
                onClick={handleReset}
                className="text-[11px] hover:text-white flex items-center gap-1 text-neutral-400"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Очистить лог</span>
              </button>
            </div>

            <div className="p-4 font-mono text-[11px] overflow-y-auto space-y-2 flex-1 leading-relaxed">
              {logs.map((log) => {
                let colorClass = 'text-neutral-300';
                if (log.level === 'warn') colorClass = 'text-amber-400';
                if (log.level === 'error') colorClass = 'text-rose-400 font-semibold';
                if (log.level === 'success') colorClass = 'text-emerald-400';

                return (
                  <div key={log.id} className="flex items-start gap-2">
                    <span className="text-neutral-600 select-none">{log.timestamp}</span>
                    <span className={colorClass}>{log.message}</span>
                  </div>
                );
              })}
              <div ref={logEndRef} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

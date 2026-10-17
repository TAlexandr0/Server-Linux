import React, { useState } from 'react';
import { 
  sampleModels, 
  initialServerStats, 
  sampleModelRevisions 
} from '../data/sampleProjects';
import { RevitModel, ModelRevision } from '../types/revitServer';
import { 
  ShieldCheck, 
  Folder, 
  HardDrive, 
  Lock, 
  Unlock, 
  History, 
  Camera, 
  Search, 
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  X,
  FileBox,
  Layers,
  Clock
} from 'lucide-react';

export const AdminConsole: React.FC = () => {
  const [models, setModels] = useState<RevitModel[]>(sampleModels);
  const [serverStats, setServerStats] = useState(initialServerStats);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFolder, setSelectedFolder] = useState<string>('All');
  const [activeHistoryModel, setActiveHistoryModel] = useState<RevitModel | null>(null);
  const [snapshotSuccessToast, setSnapshotSuccessToast] = useState<string | null>(null);

  const folders = ['All', 'Healthcare_Campus', 'Skyline_Tower', 'Infrastructure_Transit'];

  const filteredModels = models.filter((m) => {
    const matchesSearch = m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          m.lastModifiedBy.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFolder = selectedFolder === 'All' || m.projectFolder === selectedFolder;
    return matchesSearch && matchesFolder;
  });

  const handleForceReleaseLock = (modelId: string) => {
    setModels(prev => prev.map(m => {
      if (m.id === modelId) {
        return {
          ...m,
          isLocked: false,
          currentLock: undefined,
        };
      }
      return m;
    }));
    setServerStats(prev => ({
      ...prev,
      activeLocksCount: Math.max(0, prev.activeLocksCount - 1),
    }));
  };

  const handleCreateZfsSnapshot = () => {
    const snapName = `zpool/revit@manual_${new Date().toISOString().replace(/[:.]/g, '-')}`;
    setServerStats(prev => ({
      ...prev,
      zfsSnapshotsCount: prev.zfsSnapshotsCount + 1,
    }));
    setSnapshotSuccessToast(`ZFS Snapshot создан за 0.08с: ${snapName}`);
    setTimeout(() => setSnapshotSuccessToast(null), 4000);
  };

  const formatBytes = (bytes: number) => {
    const mb = bytes / (1024 * 1024);
    if (mb >= 1024) {
      return `${(mb / 1024).toFixed(2)} GB`;
    }
    return `${mb.toFixed(0)} MB`;
  };

  return (
    <div className="space-y-8">
      {/* Toast Notification */}
      {snapshotSuccessToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-neutral-900 border border-emerald-500/50 text-emerald-300 text-xs px-4 py-3 rounded-xl shadow-xl flex items-center gap-2 font-mono">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{snapshotSuccessToast}</span>
        </div>
      )}

      {/* Header and Server Stats Bar */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">Веб-Консоль Управления OpenRevitServer</h2>
            <p className="text-xs text-neutral-400">
              Современная замена устаревшего Revit Server Administrator для Linux хоста
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCreateZfsSnapshot}
              className="px-3.5 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <Camera className="w-3.5 h-3.5 text-amber-400" />
              <span>Создать ZFS Snapshot</span>
            </button>
          </div>
        </div>

        {/* Server Metrics Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl border border-neutral-800 bg-neutral-900/40 space-y-1">
            <div className="text-[11px] text-neutral-400">Хост & Версия ядра</div>
            <div className="text-sm font-bold text-white font-mono truncate">{serverStats.serverName}</div>
            <div className="text-[10px] text-neutral-500 font-mono truncate">{serverStats.linuxDistro}</div>
          </div>

          <div className="p-4 rounded-xl border border-neutral-800 bg-neutral-900/40 space-y-1">
            <div className="text-[11px] text-neutral-400">Занято места (ZFS)</div>
            <div className="text-sm font-bold text-white font-mono tabular-nums">
              {serverStats.usedStorageGB} GB <span className="text-xs text-neutral-500">/ {serverStats.totalStorageGB} GB</span>
            </div>
            <div className="text-[10px] text-neutral-500 font-mono">{serverStats.zfsSnapshotsCount} CoW снимков</div>
          </div>

          <div className="p-4 rounded-xl border border-neutral-800 bg-neutral-900/40 space-y-1">
            <div className="text-[11px] text-neutral-400">Активные Блокировки</div>
            <div className="text-sm font-bold text-amber-400 font-mono tabular-nums">
              {serverStats.activeLocksCount} {serverStats.activeLocksCount === 1 ? 'модель' : 'моделей'}
            </div>
            <div className="text-[10px] text-neutral-500 font-mono">{serverStats.totalModelsCount} центральных моделей</div>
          </div>

          <div className="p-4 rounded-xl border border-neutral-800 bg-neutral-900/40 space-y-1">
            <div className="text-[11px] text-neutral-400">Ср. время синхронизации</div>
            <div className="text-sm font-bold text-emerald-400 font-mono tabular-nums">
              {serverStats.averageSyncTimeSec} сек
            </div>
            <div className="text-[10px] text-neutral-500 font-mono">Uptime: {serverStats.uptime}</div>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск модели или автора..."
            className="w-full bg-neutral-900 border border-neutral-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-neutral-200 placeholder:text-neutral-500 focus:outline-none focus:border-amber-500"
          />
        </div>

        {/* Folder filter buttons */}
        <div className="flex items-center gap-1.5 p-1 bg-neutral-900 border border-neutral-800 rounded-lg overflow-x-auto">
          {folders.map(f => (
            <button
              key={f}
              onClick={() => setSelectedFolder(f)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                selectedFolder === f
                  ? 'bg-neutral-800 text-amber-400 shadow-sm border border-neutral-700'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              {f === 'All' ? 'Все проекты' : f}
            </button>
          ))}
        </div>
      </div>

      {/* Models Table */}
      <div className="rounded-xl border border-neutral-800 bg-neutral-900/30 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-neutral-900/80 text-neutral-400 font-mono uppercase border-b border-neutral-800">
              <tr>
                <th className="py-3 px-4">Модель (.rvt)</th>
                <th className="py-3 px-4">Проект</th>
                <th className="py-3 px-4">Версия</th>
                <th className="py-3 px-4 text-right">Размер</th>
                <th className="py-3 px-4 text-center">Ревизия</th>
                <th className="py-3 px-4">Статус Блокировки</th>
                <th className="py-3 px-4">Посл. Синхронизация</th>
                <th className="py-3 px-4 text-right">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/60 font-sans">
              {filteredModels.map((m) => (
                <tr key={m.id} className="hover:bg-neutral-900/50 transition-colors">
                  <td className="py-3 px-4 font-medium text-white">
                    <div className="flex items-center gap-2">
                      <FileBox className="w-4 h-4 text-neutral-400 shrink-0" />
                      <span className="truncate max-w-[220px]" title={m.name}>{m.name}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-neutral-400 font-mono text-[11px]">
                    {m.projectFolder}
                  </td>
                  <td className="py-3 px-4 text-neutral-300 font-mono text-[11px]">
                    Revit {m.revitVersion}
                  </td>
                  <td className="py-3 px-4 text-right text-neutral-300 font-mono tabular-nums">
                    {formatBytes(m.sizeBytes)}
                  </td>
                  <td className="py-3 px-4 text-center font-mono text-neutral-300 tabular-nums">
                    #{m.revisionNumber}
                  </td>
                  <td className="py-3 px-4">
                    {m.isLocked ? (
                      <div className="flex items-center gap-1.5 text-amber-400 text-xs">
                        <Lock className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate max-w-[140px]" title={m.currentLock?.lockedBy}>
                          {m.currentLock?.lockedBy}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-emerald-400 text-xs">
                        <Unlock className="w-3.5 h-3.5 shrink-0" />
                        <span>Свободна</span>
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-4 text-neutral-400 text-[11px]">
                    <div className="truncate max-w-[150px]">{m.lastModifiedBy}</div>
                    <div className="text-[10px] text-neutral-500 font-mono">
                      {new Date(m.lastModified).toLocaleDateString()}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => setActiveHistoryModel(m)}
                        className="p-1.5 rounded hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 transition-colors"
                        title="История синхронизаций"
                      >
                        <History className="w-3.5 h-3.5" />
                      </button>
                      {m.isLocked && (
                        <button
                          onClick={() => handleForceReleaseLock(m.id)}
                          className="px-2 py-1 rounded bg-rose-500/10 border border-rose-500/30 text-rose-400 hover:bg-rose-500/20 text-[10px] font-semibold transition-colors"
                          title="Снять блокировку принудительно"
                        >
                          Снять Lock
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Model History Modal */}
      {activeHistoryModel && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <History className="w-4 h-4 text-amber-400" />
                  <span>История синхронизаций: {activeHistoryModel.name}</span>
                </h3>
                <div className="text-xs text-neutral-400 font-mono mt-0.5">
                  GUID: {activeHistoryModel.currentVersionGuid}
                </div>
              </div>
              <button
                onClick={() => setActiveHistoryModel(null)}
                className="p-1 rounded-lg hover:bg-neutral-800 text-neutral-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
              {(sampleModelRevisions[activeHistoryModel.id] || []).map((rev) => (
                <div key={rev.revision} className="p-3.5 rounded-xl border border-neutral-800 bg-neutral-950/60 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-amber-400">Ревизия #{rev.revision}</span>
                      <span className="text-neutral-400">·</span>
                      <span className="font-semibold text-neutral-200">{rev.author}</span>
                    </div>
                    <span className="text-[11px] font-mono text-neutral-500">
                      {new Date(rev.timestamp).toLocaleString()}
                    </span>
                  </div>

                  <p className="text-xs text-neutral-300">
                    «{rev.comment}»
                  </p>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-neutral-900 text-[11px] text-neutral-400 font-mono">
                    <div>Дельта: {(rev.deltaSizeBytes / 1024 / 1024).toFixed(2)} MB</div>
                    <div>Изменены наборы: {rev.worksetsModified.join(', ')}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-2 border-t border-neutral-800">
              <button
                onClick={() => setActiveHistoryModel(null)}
                className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

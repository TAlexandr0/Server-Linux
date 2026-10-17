import React, { useState } from 'react';
import { 
  CheckCircle2, 
  HelpCircle, 
  HardDrive, 
  Cpu, 
  ShieldAlert, 
  ArrowRight, 
  Layers, 
  Zap, 
  Lock, 
  Database, 
  Terminal,
  FileCode2,
  FolderTree
} from 'lucide-react';
import { diskStorageStructureExplanation } from '../data/protocolSpecs';

interface ArchitectureOverviewProps {
  onNavigateToSimulator: () => void;
  onNavigateToProtocol: () => void;
  onNavigateToCode: () => void;
}

export const ArchitectureOverview: React.FC<ArchitectureOverviewProps> = ({
  onNavigateToSimulator,
  onNavigateToProtocol,
  onNavigateToCode,
}) => {
  const [activeTabSection, setActiveTabSection] = useState<'why_it_works' | 'comparison' | 'disk_structure'>('why_it_works');

  return (
    <div className="space-y-12">
      {/* Hero Banner / Direct Answer */}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-6 sm:p-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />
        
        <div className="max-w-3xl space-y-4">
          <div className="flex items-center gap-2 text-xs text-amber-400 font-semibold uppercase tracking-wider">
            <Zap className="w-3.5 h-3.5" />
            <span>Инженерный вердикт: 100% Реализуемо</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight leading-tight text-balance">
            Revit Server на Linux: Архитектура, Протокол и Реализация
          </h1>

          <p className="text-sm sm:text-base text-neutral-300 leading-relaxed">
            Отличная и абсолютно реальная идея! Главный секрет, о котором не знают многие BIM-менеджеры: 
            <strong className="text-white"> Revit Server вообще НЕ выполняет геометрических вычислений</strong>. 
            Ему не нужен запуск <code className="px-1.5 py-0.5 rounded bg-neutral-800 text-amber-300 text-xs font-mono">Revit.exe</code> или Wine. 
            Сервер — это специализированное версионированное <strong className="text-white">delta-хранилище и координатор блокировок</strong> поверх HTTP/WCF REST.
          </p>

          <div className="pt-2 flex flex-wrap items-center gap-3">
            <button
              onClick={onNavigateToSimulator}
              className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-neutral-950 text-xs font-bold transition-colors flex items-center gap-2"
            >
              <span>Запустить симулятор синхронизации</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onNavigateToProtocol}
              className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold border border-neutral-700 transition-colors"
            >
              Изучить протокол WCF/REST
            </button>
            <button
              onClick={onNavigateToCode}
              className="px-4 py-2 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-neutral-300 text-xs font-medium border border-neutral-800 transition-colors flex items-center gap-1.5"
            >
              <FileCode2 className="w-3.5 h-3.5 text-neutral-400" />
              <span>Готовый шаблон на Go / .NET 9</span>
            </button>
          </div>
        </div>
      </div>

      {/* 3 Core Pillars */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="p-6 rounded-xl border border-neutral-800 bg-neutral-900/30 space-y-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <Cpu className="w-5 h-5" />
          </div>
          <h3 className="text-base font-bold text-white">1. Никакого Wine или GUI</h3>
          <p className="text-xs text-neutral-400 leading-relaxed">
            На сервере не требуется запускать ядро Revit. Вся тяжелая обработка геометрии, слияние рабочих наборов (Worksets) и разрешение конфликтов элементов производятся на клиентских рабочих станциях Windows в Revit Client.
          </p>
        </div>

        <div className="p-6 rounded-xl border border-neutral-800 bg-neutral-900/30 space-y-3">
          <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <Lock className="w-5 h-5" />
          </div>
          <h3 className="text-base font-bold text-white">2. Concurrency & Lock Engine</h3>
          <p className="text-xs text-neutral-400 leading-relaxed">
            Основная роль сервера — строгий арбитраж: выдача атомарных токенов блокировки при команде «Синхронизация с файлом хранилища» (SWC) и гарантия, что два инженера не перезапишут один GUID одновременно.
          </p>
        </div>

        <div className="p-6 rounded-xl border border-neutral-800 bg-neutral-900/30 space-y-3">
          <div className="w-9 h-9 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
            <Database className="w-5 h-5" />
          </div>
          <h3 className="text-base font-bold text-white">3. Delta Stream Storage</h3>
          <p className="text-xs text-neutral-400 leading-relaxed">
            Модели хранятся в виде структурированных директорий с базовым файлом и цепочкой инкрементных дельт (.delta). На Linux это идеально ложится на ZFS CoW или NVMe ext4 с нулевым оверхедом памяти.
          </p>
        </div>
      </div>

      {/* Interactive Architecture Flow Diagram */}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-6 sm:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-800 pb-4">
          <div>
            <h2 className="text-lg font-bold text-white">Сквозная схема взаимодействия: Revit Client & Linux Server</h2>
            <p className="text-xs text-neutral-400">Как клиент Autodesk Revit обращается к вашему Linux демону</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono bg-neutral-800 text-neutral-300 border border-neutral-700">
              Port 808 / 8080 (REST / WCF)
            </span>
          </div>
        </div>

        {/* Visual Flow diagram */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 relative">
          {/* Step 1 */}
          <div className="p-5 rounded-xl border border-neutral-800 bg-neutral-900/50 space-y-3 relative">
            <div className="text-[11px] font-mono text-amber-400 font-semibold">ШАГ 1: КЛИЕНТ REVIT</div>
            <h4 className="text-sm font-bold text-white">Поиск через RSN.ini</h4>
            <p className="text-xs text-neutral-400 leading-relaxed">
              Клиент читает IP/хост из локального файла <code className="text-neutral-200 font-mono">RSN.ini</code> и отправляет GET-запрос на <code className="text-neutral-200 font-mono">/server/info</code> для обнаружения роли (Host/Accelerator).
            </p>
            <div className="p-2 rounded bg-neutral-950 font-mono text-[10px] text-neutral-400 border border-neutral-800/80">
              GET /AdminRESTService.svc/server/info
            </div>
          </div>

          {/* Step 2 */}
          <div className="p-5 rounded-xl border border-neutral-800 bg-neutral-900/50 space-y-3 relative">
            <div className="text-[11px] font-mono text-amber-400 font-semibold">ШАГ 2: БЛОКИРОВКА</div>
            <h4 className="text-sm font-bold text-white">Запрос Model Lock</h4>
            <p className="text-xs text-neutral-400 leading-relaxed">
              При нажатии «Синхронизировать» клиент шлет POST-запрос на получение эксклюзивной блокировки модели с таймаутом (TTL 10 минут).
            </p>
            <div className="p-2 rounded bg-neutral-950 font-mono text-[10px] text-neutral-400 border border-neutral-800/80">
              POST /{'{model}'}/lock → Token: tok-992a
            </div>
          </div>

          {/* Step 3 */}
          <div className="p-5 rounded-xl border border-neutral-800 bg-neutral-900/50 space-y-3 relative">
            <div className="text-[11px] font-mono text-amber-400 font-semibold">ШАГ 3: ПЕРЕДАЧА ДЕЛЬТ</div>
            <h4 className="text-sm font-bold text-white">Chunked Stream</h4>
            <p className="text-xs text-neutral-400 leading-relaxed">
              Клиент сжимает измененные элементы в чанки и загружает их в директорию <code className="text-neutral-200 font-mono">History/</code> модели. Сервер сохраняет дельту и обновляет GUID версии.
            </p>
            <div className="p-2 rounded bg-neutral-950 font-mono text-[10px] text-neutral-400 border border-neutral-800/80">
              POST /ModelService.svc/Stream/SyncDelta
            </div>
          </div>

          {/* Step 4 */}
          <div className="p-5 rounded-xl border border-neutral-800 bg-neutral-900/50 space-y-3 relative">
            <div className="text-[11px] font-mono text-emerald-400 font-semibold">ШАГ 4: ФИКСАЦИЯ</div>
            <h4 className="text-sm font-bold text-white">Освобождение Lock</h4>
            <p className="text-xs text-neutral-400 leading-relaxed">
              Клиент завершает операцию, сервер освобождает блокировку и фиксирует ревизию. Модель мгновенно доступна другим проектировщикам.
            </p>
            <div className="p-2 rounded bg-neutral-950 font-mono text-[10px] text-neutral-400 border border-neutral-800/80">
              POST /{'{model}'}/unlock → Status: Released
            </div>
          </div>
        </div>
      </div>

      {/* Tabs for Deep Dive: Why It Works vs Comparison vs Disk Structure */}
      <div className="space-y-6">
        <div className="flex items-center gap-2 border-b border-neutral-800 pb-2 overflow-x-auto">
          <button
            onClick={() => setActiveTabSection('why_it_works')}
            className={`px-3 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
              activeTabSection === 'why_it_works'
                ? 'bg-neutral-800 text-amber-400'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Почему Autodesk использовал Windows и как заменить его на Linux
          </button>
          <button
            onClick={() => setActiveTabSection('comparison')}
            className={`px-3 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
              activeTabSection === 'comparison'
                ? 'bg-neutral-800 text-amber-400'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Сравнение: Windows IIS vs Linux OpenRevitServer
          </button>
          <button
            onClick={() => setActiveTabSection('disk_structure')}
            className={`px-3 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
              activeTabSection === 'disk_structure'
                ? 'bg-neutral-800 text-amber-400'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Структура файлов модели на диске (.rvt как папка)
          </button>
        </div>

        {activeTabSection === 'why_it_works' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-6 rounded-xl border border-neutral-800 bg-neutral-900/30 space-y-4">
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-amber-400" />
                <span>Исторический контекст: Почему Revit Server был на Windows?</span>
              </h4>
              <p className="text-xs text-neutral-300 leading-relaxed">
                Revit Server появился в 2011 году (для Revit 2012). В то время экосистема Microsoft была де-факто стандартом корпоративного стека Autodesk:
              </p>
              <ul className="space-y-2 text-xs text-neutral-400">
                <li className="flex items-start gap-2">
                  <span className="text-amber-400">•</span>
                  <span><strong>IIS 7.0 + WCF (Windows Communication Foundation)</strong>: использовались для SOAP/REST сервисов.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-400">•</span>
                  <span><strong>MSMQ (Microsoft Message Queuing)</strong>: применялся в ранних версиях для очередей задач.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-400">•</span>
                  <span><strong>Silverlight</strong>: изначально веб-панель управления была написана на Microsoft Silverlight (позже заменена на примитивный HTML).</span>
                </li>
              </ul>
              <p className="text-xs text-neutral-400 leading-relaxed">
                Autodesk намеренно не портировал Revit Server на .NET Core / Linux, потому что их бизнес-модель полностью сместилась в сторону облака <strong>Autodesk Construction Cloud (BIM 360)</strong> с платной подпиской на каждого пользователя.
              </p>
            </div>

            <div className="p-6 rounded-xl border border-neutral-800 bg-neutral-900/30 space-y-4">
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Как реализовать современный Linux Daemon</span>
              </h4>
              <p className="text-xs text-neutral-300 leading-relaxed">
                Сегодня все компоненты легко реализуются на современном Linux-стеке:
              </p>
              <ul className="space-y-2 text-xs text-neutral-400">
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400">✔</span>
                  <span><strong>Язык реализации</strong>: Go (Golang) — идеален (единый статический бинарник, &lt;20 МБ ОЗУ, встроенный HTTP/2, быстрые горутины) или .NET 9 Kestrel.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400">✔</span>
                  <span><strong>Менеджер блокировок</strong>: Потокобезопасная хеш-таблица в памяти (sync.RWMutex в Go или ConcurrentDictionary в C#) с сохранением в SQLite для персистентности при рестарте.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400">✔</span>
                  <span><strong>Бэкапы ZFS</strong>: Снимки (snapshots) датасета каждые 30 минут без остановки демона и без блокировки проектировщиков.</span>
                </li>
              </ul>
            </div>
          </div>
        )}

        {activeTabSection === 'comparison' && (
          <div className="overflow-x-auto rounded-xl border border-neutral-800">
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-900 text-neutral-400 font-mono uppercase border-b border-neutral-800">
                <tr>
                  <th className="py-3 px-4">Критерий</th>
                  <th className="py-3 px-4 text-neutral-300">Классический Windows Revit Server</th>
                  <th className="py-3 px-4 text-amber-400">Linux OpenRevitServer Daemon</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/60 bg-neutral-950/40">
                <tr>
                  <td className="py-3 px-4 font-semibold text-neutral-200">Стоимость лицензий ОС</td>
                  <td className="py-3 px-4 text-neutral-400">Лицензия Windows Server + User/Device CALs ($$$)</td>
                  <td className="py-3 px-4 text-emerald-400 font-medium">0 ₽ (Ubuntu / Debian / Alpine Linux)</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-semibold text-neutral-200">Потребление памяти (RAM)</td>
                  <td className="py-3 px-4 text-neutral-400">4–8 ГБ (ОС Windows + IIS w3wp.exe)</td>
                  <td className="py-3 px-4 text-emerald-400 font-medium">15–40 МБ ОЗУ (Go daemon в Docker)</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-semibold text-neutral-200">Проблема зависших блокировок</td>
                  <td className="py-3 px-4 text-neutral-400">Часто требует перезапуска IIS (iisreset) или удаление .lock файлов вручную</td>
                  <td className="py-3 px-4 text-emerald-400 font-medium">Автоматический TTL-таймаут + кнопка «Снять блокировку» в веб-панели</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-semibold text-neutral-200">Резервное копирование</td>
                  <td className="py-3 px-4 text-neutral-400">Тяжелый VSS (Volume Shadow Copy) или скрипты RSU.exe</td>
                  <td className="py-3 px-4 text-emerald-400 font-medium">Мгновенные атомарные ZFS/Btrfs CoW снимки & S3 rclone sync</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-semibold text-neutral-200">Веб-панель управления</td>
                  <td className="py-3 px-4 text-neutral-400">Устаревший интерфейс Silverlight/ActiveX, медленный</td>
                  <td className="py-3 px-4 text-emerald-400 font-medium">Современный отзывчивый Web SPA (React/Tailwind) с историей и метриками</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {activeTabSection === 'disk_structure' && (
          <div className="p-6 rounded-xl border border-neutral-800 bg-neutral-900/40 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                <FolderTree className="w-4 h-4 text-amber-400" />
                <span>Анатомия хранилища Revit Server: Модель как каталог</span>
              </h4>
              <span className="text-[11px] font-mono text-neutral-400">/var/revit/storage/Projects</span>
            </div>
            <p className="text-xs text-neutral-300">
              В отличие от локального файла <code className="text-amber-300 font-mono">.rvt</code>, на сервере файл с именем <code className="text-amber-300 font-mono">Hospital_Block_A.rvt</code> на самом деле представляет собой <strong>папку</strong> со следующей внутренней структурой:
            </p>
            <pre className="p-4 rounded-lg bg-neutral-950 border border-neutral-800 font-mono text-xs text-neutral-300 overflow-x-auto leading-relaxed">
              {diskStorageStructureExplanation.trim()}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { 
  AlertCircle, 
  CheckCircle2, 
  Terminal, 
  Network, 
  FileWarning, 
  Radio, 
  RefreshCw, 
  Copy, 
  Check,
  Server,
  Layers,
  Sparkles,
  ArrowRight
} from 'lucide-react';

export const RevitDiagnostics: React.FC = () => {
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);
  const [liveRequests, setLiveRequests] = useState<any[]>([]);
  const [activeVersion, setActiveVersion] = useState<string>('2025.0');
  const [isPolling, setIsPolling] = useState(true);

  // Poll for live Revit traffic and active version from backend
  useEffect(() => {
    let interval: any;
    const fetchTraffic = async () => {
      try {
        const res = await fetch('/api/revit/live-traffic');
        if (res.ok) {
          const data = await res.json();
          setLiveRequests(data.requests || []);
          if (data.activeVersion) {
            setActiveVersion(data.activeVersion);
          }
        }
      } catch {
        // Dev fallback
      }
    };

    fetchTraffic();
    if (isPolling) {
      interval = setInterval(fetchTraffic, 2000);
    }
    return () => clearInterval(interval);
  }, [isPolling]);

  const handleSetVersion = async (year: string) => {
    setActiveVersion(`${year}.0`);
    try {
      await fetch('/api/revit/set-version', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: `${year}.0` }),
      });
    } catch {
      // Ignored
    }
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCmd(id);
    setTimeout(() => setCopiedCmd(null), 2000);
  };

  return (
    <div className="space-y-8">
      {/* Target Revit Version Selector */}
      <div className="p-5 rounded-2xl border border-neutral-800 bg-neutral-900/40 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>Целевая версия Autodesk Revit (Версионный лок)</span>
            </h4>
            <p className="text-xs text-neutral-400">
              Revit строго требует, чтобы версия сервера совпадала с версией программы. Выберите вашу версию:
            </p>
          </div>

          <div className="flex items-center gap-1.5 p-1 bg-neutral-950 border border-neutral-800 rounded-lg">
            {['2023', '2024', '2025', '2026'].map((year) => (
              <button
                key={year}
                onClick={() => handleSetVersion(year)}
                className={`px-3 py-1.5 text-xs font-mono font-bold rounded-md transition-colors ${
                  activeVersion.startsWith(year)
                    ? 'bg-amber-500 text-neutral-950 shadow-sm'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                Revit {year}
              </button>
            ))}
          </div>
        </div>
        <div className="text-[11px] font-mono text-neutral-500 flex items-center gap-2">
          <span>Текущий ответ сервера:</span>
          <span className="text-emerald-400 font-bold">{activeVersion}</span>
          <span>(Автоматически подстраивается под User-Agent входящего запроса)</span>
        </div>
      </div>

      {/* Explanation Banner */}
      <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-6 space-y-4">
        <div className="flex items-center gap-2.5 text-amber-400 font-bold text-sm">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>Почему возникла ошибка «Данная операция не может быть завершена» и как она решена:</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-neutral-300">
          <div className="p-3.5 rounded-xl bg-neutral-950/60 border border-neutral-800 space-y-1.5">
            <div className="font-bold text-amber-300 flex items-center gap-1.5">
              <span>1. Несовпадение года версии</span>
            </div>
            <p className="text-neutral-400 leading-relaxed">
              Если у вас установлен Revit 2024, а сервер ответил <code>"ServerVersion": "2025.0"</code>, Revit мгновенно блокирует открытие с этой ошибкой. Сервер теперь динамически подстраивает версию под версию вашего клиента.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-neutral-950/60 border border-neutral-800 space-y-1.5">
            <div className="font-bold text-amber-300 flex items-center gap-1.5">
              <span>2. Схема /descendants и /contents</span>
            </div>
            <p className="text-neutral-400 leading-relaxed">
              При клике на сервер в диалоге открытия Revit вызывает <code>/|/descendants</code>. Он ожидает обязательные системные поля <code>DriveFreeSpace</code>, <code>DriveSpace</code>, <code>Size: 0</code> и <code>Path: ""</code>. Теперь они полностью соответствуют официальной спецификации Autodesk WCF.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-neutral-950/60 border border-neutral-800 space-y-1.5">
            <div className="font-bold text-emerald-300 flex items-center gap-1.5">
              <span>3. Декодирование символа Pipe «|» (%7C)</span>
            </div>
            <p className="text-neutral-400 leading-relaxed">
              В Revit корень обозначается не слэшем, а вертикальной чертой (в URL: <code>%7C</code>). Маршрутизатор сервера теперь аккуратно декодирует спецсимвол и отдает корневые модели.
            </p>
          </div>
        </div>
      </div>

      {/* Journal Log Analysis Section */}
      <div className="rounded-2xl border border-blue-500/30 bg-blue-500/5 p-6 space-y-4">
        <div className="flex items-center gap-2.5 text-blue-400 font-bold text-sm">
          <Terminal className="w-5 h-5 shrink-0" />
          <span>Разбор системного лога Revit Journal: Причина ошибки найдена!</span>
        </div>

        <div className="p-3.5 rounded-xl bg-neutral-950 border border-neutral-800 font-mono text-[11px] text-neutral-300 space-y-1 overflow-x-auto leading-relaxed">
          <div className="text-neutral-500">// Выдержка из вашего журнала:</div>
          <div className="text-amber-400">Target Node = 127.0.0.1, Binding Name = tcpbuffer</div>
          <div className="text-rose-400">System.ServiceModel.ProtocolException: You have tried to create a channel to a service that does not support .Net Framing. It is possible that you are encountering an HTTP endpoint.</div>
          <div className="text-rose-300 font-bold">System.IO.InvalidDataException: Expected record type 'PreambleAck', found '72'.</div>
        </div>

        <div className="text-xs text-neutral-300 space-y-2 leading-relaxed">
          <p>
            <strong>1. Рукопожатие прошло успешно:</strong> В новом логе фатальная ошибка <code>Expected PreambleAck, found 72</code> полностью исчезла! Сервер ответил байтом <code>0x0B (PreambleAck)</code>, и Revit сразу перешел к следующему шагу:
          </p>
          <div className="p-2 rounded bg-neutral-900 font-mono text-[11px] text-amber-300">
            Time: Calling: ListSubFoldersAndModels -&gt; Returned from: ListSubFoldersAndModels (OK)
          </div>
          <p>
            <strong>2. Навигация и сохранение в файл (Save As):</strong> В вашем последнем логе Revit успешно выбрал имя файла <code>RSN://127.0.0.1/Проект1.rvt</code>, проверил существование папки и вызвал создание центральной модели:
          </p>
          <div className="p-2 rounded bg-neutral-900 font-mono text-[11px] text-emerald-300">
            Time: Calling: CreateModel -&gt; Returned from: CreateModel (OK, 7ms)
          </div>
          <p>
            <strong>3. Этап блокировки данных и прав (LockData &amp; lockPermissions):</strong>
            После создания модели Revit вызывает <code>LockData</code> и <code>lockPermissions</code> для захвата эксклюзивной сессии сохранения. Мы исследовали бинарные сборки <code>ServiceContract.Model.dll</code> и <code>DataContract.dll</code> и исправили все несовпадения контрактов:
          </p>
          <ul className="list-disc list-inside space-y-1 text-neutral-400 pl-1 text-[11px]">
            <li><code>lockPermissions</code>: добавлен обязательный [out] параметр <code>lockTally = 1</code> и устранен лишний XML namespace.</li>
            <li><code>LockData</code>: [out] параметр <code>creationDate</code> типа <code>EpisodeGuid</code> со структурой <code>GUIDValue / Guid</code>.</li>
            <li><code>readAllUsernames</code>: контракт <code>UserTable</code> с коллекцией <code>IdToNameList / UserName / Name</code>.</li>
            <li><code>readAllNonElementPermissions</code>: возврат <code>userTable</code>, <code>worksetPerms</code> и <code>requestsPack</code>.</li>
            <li><code>CommitPermissions, UploadFinish, EndReadData</code>: выровнен WCF <code>void</code> возврат (пустой XML-wrapper).</li>
          </ul>
        </div>
      </div>

      {/* CoreWCF Quick Launch Banner */}
      <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-6 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <span>Запуск полноценного CoreWCF сервера для Linux (.NET 9):</span>
          </div>
          <button
            onClick={() => handleCopy('cd dotnet-server && docker compose up -d --build', 'corewcf_cmd')}
            className="text-xs text-neutral-300 hover:text-white flex items-center gap-1 font-mono"
          >
            {copiedCmd === 'corewcf_cmd' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedCmd === 'corewcf_cmd' ? 'Скопировано' : 'Копировать'}</span>
          </button>
        </div>
        <pre className="p-3 rounded-lg bg-neutral-950 font-mono text-xs text-emerald-300 overflow-x-auto">
          cd dotnet-server
          docker compose up -d --build
        </pre>
        <p className="text-xs text-neutral-400 leading-relaxed">
          Этот контейнер собирает нативный .NET 9 сервис с поддержкой <code>net.tcp://*:808</code> и <code>ListSubFoldersAndModels</code>. Revit мгновенно получит бинарный ответ со списком файлов и отобразит каталог моделей без зависаний!
        </p>
      </div>
      <div className="space-y-4">
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <Terminal className="w-4 h-4 text-amber-400" />
          <span>Проверка ответа через PowerShell на Windows:</span>
        </h3>

        <div className="space-y-3">
          {/* Test 1 */}
          <div className="p-4 rounded-xl border border-neutral-800 bg-neutral-900/40 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-white">1. Проверка дерева моделей (Descendants):</span>
              <button
                onClick={() => handleCopy('curl.exe http://127.0.0.1:808/RevitServerAdminRESTService/AdminRESTService.svc/%7C/descendants', 't1')}
                className="text-xs text-neutral-400 hover:text-white flex items-center gap-1 font-mono"
              >
                {copiedCmd === 't1' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedCmd === 't1' ? 'Скопировано' : 'Копировать'}</span>
              </button>
            </div>
            <pre className="p-3 rounded-lg bg-neutral-950 font-mono text-xs text-neutral-300 overflow-x-auto">
              curl.exe http://127.0.0.1:808/RevitServerAdminRESTService/AdminRESTService.svc/%7C/descendants
            </pre>
            <div className="text-[11px] text-neutral-400">
              Этот эндпоинт вызывается десктопным Revit для построения дерева проектов при открытии.
            </div>
          </div>

          {/* Test 2 */}
          <div className="p-4 rounded-xl border border-neutral-800 bg-neutral-900/40 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-white">2. Проверка содержимого корня (Contents):</span>
              <button
                onClick={() => handleCopy('curl.exe http://127.0.0.1:808/RevitServerAdminRESTService/AdminRESTService.svc/%7C/contents', 't2')}
                className="text-xs text-neutral-400 hover:text-white flex items-center gap-1 font-mono"
              >
                {copiedCmd === 't2' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedCmd === 't2' ? 'Скопировано' : 'Копировать'}</span>
              </button>
            </div>
            <pre className="p-3 rounded-lg bg-neutral-950 font-mono text-xs text-neutral-300 overflow-x-auto">
              curl.exe http://127.0.0.1:808/RevitServerAdminRESTService/AdminRESTService.svc/%7C/contents
            </pre>
          </div>
        </div>
      </div>

      {/* Live Revit Traffic Monitor */}
      <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
            <h4 className="text-xs font-bold text-white">Монитор живых входящих запросов от Revit</h4>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-neutral-400">
            <span>Опрос каждые 2с</span>
            <button
              onClick={() => setIsPolling(!isPolling)}
              className="p-1 hover:text-white"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isPolling ? 'text-amber-400' : 'text-neutral-500'}`} />
            </button>
          </div>
        </div>

        {liveRequests.length > 0 ? (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {liveRequests.map((req, i) => (
              <div key={i} className="p-2.5 rounded-lg bg-neutral-900 border border-neutral-800 flex items-center justify-between text-xs font-mono">
                <div className="flex items-center gap-2 truncate">
                  <span className="text-emerald-400 font-bold">{req.method}</span>
                  <span className="text-neutral-200 truncate">{req.url}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0 text-[11px] text-neutral-400">
                  <span>{req.userName || 'Revit'}</span>
                  <span className={req.status === 200 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                    HTTP {req.status}
                  </span>
                  <span className="text-neutral-500">{req.timestamp}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-8 text-center text-xs text-neutral-500 space-y-1">
            <div>Ожидание первого клика на сервер внутри диалогового окна Autodesk Revit...</div>
            <div className="text-[11px] text-neutral-600">
              Как только вы кликнете на 127.0.0.1 в Revit, сюда сразу упадет входящий лог запроса с кодом ответа.
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import { 
  Server, 
  Terminal, 
  ShieldCheck, 
  AlertTriangle, 
  CheckCircle2, 
  FolderKey, 
  HardDrive, 
  Network,
  Cpu,
  Copy,
  Check
} from 'lucide-react';

export const DeploymentGuide: React.FC = () => {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const handleCopyCmd = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(idx);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const steps = [
    {
      num: '01',
      title: 'Подготовка Linux-хоста и файловой системы ZFS',
      desc: 'Рекомендуется Ubuntu Server 24.04 LTS с отдельным ZFS пулом. ZFS гарантирует целостность данных через контрольные суммы и мгновенные CoW-снапшоты.',
      command: `# 1. Установка ZFS и Docker на хост Ubuntu:
sudo apt update && sudo apt install -y zfsutils-linux docker.io docker-compose

# 2. Создание ZFS пула для хранения проектов Revit с компрессией lz4:
sudo zpool create -f zpool-revit /dev/sdb
sudo zfs set compression=lz4 zpool-revit
sudo zfs create zpool-revit/projects -o mountpoint=/var/revit/storage/Projects`,
    },
    {
      num: '02',
      title: 'Сборка и запуск демона (Docker / Systemd)',
      desc: 'Демон слушает порты 808 (стандартный WCF Revit) и 8080. Можно запустить напрямую как systemd-сервис или через Docker Compose.',
      command: `# Сборка Go бинарника и запуск сервиса:
git clone https://github.com/your-org/open-revit-server.git
cd open-revit-server
go build -o /usr/local/bin/revit-daemon main.go

# Создание systemd unit-файла:
sudo systemctl enable --now revit-daemon.service`,
    },
    {
      num: '03',
      title: 'Настройка клиентских рабочих станций (RSN.ini)',
      desc: 'На каждом компьютере архитектора/конструктора Revit ищет сервер в файле RSN.ini. Файл должен содержать IP-адрес или DNS-имя вашего Linux сервера.',
      command: `# Путь к файлу на Windows:
# C:\\ProgramData\\Autodesk\\RevitServer2025\\Config\\RSN.ini

# Содержимое файла RSN.ini (одна строка на сервер):
192.168.10.45
# или FQDN имя:
tux-revit-01.corp.bim`,
    },
    {
      num: '04',
      title: 'Проверка подключения из Revit Client',
      desc: 'После создания RSN.ini запустите Revit: Файл -> Открыть -> Revit Server. Сервер должен появиться в списке сетевых хранилищ.',
      command: `# Проверка доступности порта из командной строки Windows:
Test-NetConnection -ComputerName 192.168.10.45 -Port 8080

# Проверка REST API через PowerShell / curl:
curl.exe http://192.168.10.45:8080/RevitServerAdminRESTService/AdminRESTService.svc/server/info`,
    },
    {
      num: '05',
      title: 'Упаковка и запуск веб-приложения в Docker контейнере',
      desc: 'В репозиторий добавлены Dockerfile, .dockerignore, nginx.conf и docker-compose.yml. Вы можете запустить всё приложение локально или на сервере без установки Node.js.',
      command: `# Вариант 1: Запуск через Docker Compose:
docker compose up -d

# Вариант 2: Ручная сборка образа и запуск:
docker build -t open-revit-server .
docker run -d -p 3000:3000 --name open-revit-app open-revit-server

# Приложение будет доступно по адресу: http://localhost:3000`,
    },
  ];

  const pitfalls = [
    {
      title: 'Чувствительность к регистру (Case-Sensitivity) в ext4/ZFS',
      desc: 'Windows не чувствителен к регистру (FileName.rvt == filename.rvt), а Linux — чувствителен. В демоне обязательно приводите пути или используйте ZFS флаг case=insensitive (или нормализуйте пути в коде при поиске модели).',
      severity: 'Критично',
    },
    {
      title: 'Таймауты при передаче больших моделей (>1 GB)',
      desc: 'По умолчанию в Nginx и Kestrel таймаут запроса 60 секунд. Для BIM-моделей размер дельты может достигать 300-500 МБ при слабом канале. Установите client_max_body_size 0; и proxy_read_timeout 900s;.',
      severity: 'Важно',
    },
    {
      title: 'WCF SOAP vs REST Headers',
      desc: 'Revit 2018-2023 активно использовал SOAP-обертки для ModelService, а с 2024+ всё больше переходит на REST. Обеспечьте fallback: парсинг как Content-Type: application/json, так и text/xml с SOAPAction.',
      severity: 'Совместимость',
    },
  ];

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h2 className="text-xl font-bold text-white tracking-tight">Пошаговое Руководство по Развертыванию на Linux</h2>
        <p className="text-xs text-neutral-400 max-w-3xl">
          Практический чеклист для DevOps-инженера и BIM-менеджера: настройка хоста, сетевых портов, RSN.ini и типичные подводные камни.
        </p>
      </div>

      {/* Steps List */}
      <div className="space-y-6">
        {steps.map((st, idx) => (
          <div key={st.num} className="p-6 rounded-xl border border-neutral-800 bg-neutral-900/30 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-sm font-mono font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-lg">
                  ШАГ {st.num}
                </span>
                <h3 className="text-base font-bold text-white">{st.title}</h3>
              </div>

              <button
                onClick={() => handleCopyCmd(st.command, idx)}
                className="text-xs text-neutral-400 hover:text-white flex items-center gap-1 font-mono"
              >
                {copiedIndex === idx ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedIndex === idx ? 'Скопировано' : 'Копировать'}</span>
              </button>
            </div>

            <p className="text-xs text-neutral-300 leading-relaxed">
              {st.desc}
            </p>

            <pre className="p-4 rounded-lg bg-neutral-950 border border-neutral-800 font-mono text-xs text-neutral-300 overflow-x-auto leading-relaxed">
              {st.command}
            </pre>
          </div>
        ))}
      </div>

      {/* Critical Pitfalls Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400" />
          <h3 className="text-base font-bold text-white">Ключевые Подводные Камни при Переносе на Linux</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {pitfalls.map((pf) => (
            <div key={pf.title} className="p-5 rounded-xl border border-neutral-800 bg-neutral-900/40 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                  {pf.severity}
                </span>
              </div>
              <h4 className="text-xs font-bold text-white leading-tight">{pf.title}</h4>
              <p className="text-xs text-neutral-400 leading-relaxed">{pf.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Header } from './components/Header';
import { ArchitectureOverview } from './components/ArchitectureOverview';
import { ProtocolExplorer } from './components/ProtocolExplorer';
import { LiveSyncSimulator } from './components/LiveSyncSimulator';
import { AdminConsole } from './components/AdminConsole';
import { CodeGenerator } from './components/CodeGenerator';
import { DeploymentGuide } from './components/DeploymentGuide';
import { ApiPlayground } from './components/ApiPlayground';
import { RevitDiagnostics } from './components/RevitDiagnostics';
import { RsnModal } from './components/RsnModal';
import { ProtocolEndpoint } from './types/revitServer';
import { protocolEndpoints } from './data/protocolSpecs';

export default function App() {
  const [activeTab, setActiveTab] = useState<string>('architecture');
  const [codeSubTab, setCodeSubTab] = useState<'code' | 'deploy' | 'playground'>('code');
  const [playgroundEndpoint, setPlaygroundEndpoint] = useState<ProtocolEndpoint>(protocolEndpoints[0]);
  const [isRsnModalOpen, setIsRsnModalOpen] = useState(false);

  const handleOpenInPlayground = (endpoint: ProtocolEndpoint) => {
    setPlaygroundEndpoint(endpoint);
    setActiveTab('code');
    setCodeSubTab('playground');
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col selection:bg-amber-500/20 selection:text-amber-300">
      {/* 3-Zone Top Bar Contract */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenQuickRsnModal={() => setIsRsnModalOpen(true)}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'architecture' && (
          <ArchitectureOverview
            onNavigateToSimulator={() => setActiveTab('simulator')}
            onNavigateToProtocol={() => setActiveTab('protocol')}
            onNavigateToCode={() => {
              setActiveTab('code');
              setCodeSubTab('code');
            }}
          />
        )}

        {activeTab === 'protocol' && (
          <ProtocolExplorer onOpenInPlayground={handleOpenInPlayground} />
        )}

        {activeTab === 'simulator' && (
          <LiveSyncSimulator />
        )}

        {activeTab === 'admin' && (
          <AdminConsole />
        )}

        {activeTab === 'diagnostics' && (
          <RevitDiagnostics />
        )}

        {activeTab === 'code' && (
          <div className="space-y-8">
            {/* Sub-navigation for Code, Deployment Guide and Playground */}
            <div className="flex items-center gap-1.5 p-1 bg-neutral-900 border border-neutral-800 rounded-lg w-fit overflow-x-auto">
              <button
                onClick={() => setCodeSubTab('code')}
                className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  codeSubTab === 'code'
                    ? 'bg-neutral-800 text-amber-400 shadow-sm border border-neutral-700'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                Исходный Код Сервера
              </button>
              <button
                onClick={() => setCodeSubTab('deploy')}
                className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  codeSubTab === 'deploy'
                    ? 'bg-neutral-800 text-amber-400 shadow-sm border border-neutral-700'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                Пошаговый Деплой на Linux
              </button>
              <button
                onClick={() => setCodeSubTab('playground')}
                className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  codeSubTab === 'playground'
                    ? 'bg-neutral-800 text-amber-400 shadow-sm border border-neutral-700'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                REST API Playground
              </button>
            </div>

            {codeSubTab === 'code' && <CodeGenerator />}
            {codeSubTab === 'deploy' && <DeploymentGuide />}
            {codeSubTab === 'playground' && <ApiPlayground initialEndpoint={playgroundEndpoint} />}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-neutral-900 bg-neutral-950 py-6 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-neutral-500">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-neutral-300">OpenRevitServer</span>
            <span>·</span>
            <span>Clean-Room Linux Daemon Specification for Autodesk Revit Worksharing</span>
          </div>
          <div className="flex items-center gap-4 text-neutral-400">
            <span>Revit 2021 – 2026 Compatible</span>
            <span>·</span>
            <span>Zero-Cost Linux On-Premise BIM</span>
          </div>
        </div>
      </footer>

      {/* RSN.ini Generator Modal */}
      <RsnModal
        isOpen={isRsnModalOpen}
        onClose={() => setIsRsnModalOpen(false)}
      />
    </div>
  );
}

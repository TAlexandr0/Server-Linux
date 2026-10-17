export interface RevitModel {
  id: string;
  name: string;
  path: string;
  projectFolder: string;
  sizeBytes: number;
  revitVersion: number; // e.g. 2024, 2025, 2026
  currentVersionGuid: string;
  revisionNumber: number;
  lastModified: string;
  lastModifiedBy: string;
  isLocked: boolean;
  currentLock?: ModelLock;
  worksetsCount: number;
  historyCount: number;
}

export interface ModelLock {
  id: string;
  modelId: string;
  modelPath: string;
  lockedBy: string;
  machineName: string;
  clientIp: string;
  acquiredAt: string;
  expiresAt: string;
  lockType: 'ExclusiveSync' | 'WorksetCheckout' | 'AdminMaintenance';
  comment?: string;
  token: string;
}

export interface ModelRevision {
  revision: number;
  versionGuid: string;
  timestamp: string;
  author: string;
  comment: string;
  deltaSizeBytes: number;
  totalSizeBytes: number;
  worksetsModified: string[];
}

export interface SyncSessionStep {
  step: number;
  name: string;
  status: 'pending' | 'in_progress' | 'success' | 'failed' | 'blocked';
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT';
  description: string;
  payload?: any;
  response?: any;
  durationMs?: number;
}

export interface ProtocolEndpoint {
  id: string;
  name: string;
  service: 'AdminRESTService' | 'ModelService' | 'LocalService';
  httpMethod: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  category: 'Discovery' | 'File System' | 'Locking' | 'Synchronization' | 'History';
  summary: string;
  description: string;
  headers: Record<string, string>;
  requestExample?: string;
  responseExample: string;
  relevanceToLinux: string;
}

export interface ServerStats {
  serverName: string;
  ipAddress: string;
  linuxDistro: string;
  runtime: string; // e.g. "Go 1.22 daemon" / ".NET 9 Kestrel"
  uptime: string;
  totalStorageGB: number;
  usedStorageGB: number;
  activeLocksCount: number;
  totalModelsCount: number;
  activeClientsCount: number;
  zfsSnapshotsCount: number;
  averageSyncTimeSec: number;
}

import express, { Request, Response } from 'express';
import net from 'net';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const TCP_PORT = Number(process.env.TCP_PORT) || 808;
let activeServerVersion = process.env.REVIT_VERSION || '2025.0';

// Body parsing
app.use(express.json());
app.use(express.text({ type: ['text/xml', 'application/xml'] }));
app.use(express.raw({ type: 'application/octet-stream', limit: '500mb' }));

// In-Memory Model and Lock State
interface ServerModel {
  name: string;
  folder: string;
  size: number;
  revitVersion: number;
  versionGuid: string;
  revision: number;
  isLocked: boolean;
  lockedBy?: string;
  machineName?: string;
  token?: string;
  lockExpiresAt?: Date;
}

const modelsRegistry: Record<string, ServerModel> = {
  'Demo_Central.rvt': {
    name: 'Demo_Central.rvt',
    folder: '',
    size: 42100000,
    revitVersion: 2025,
    versionGuid: 'bb9900aa-3344-5566-7788-99aabbccdde0',
    revision: 5,
    isLocked: false,
  },
  'Sample_Project.rvt': {
    name: 'Sample_Project.rvt',
    folder: 'Projects',
    size: 52428800,
    revitVersion: 2025,
    versionGuid: 'f83a1b92-4910-4f66-891a-cc90e12d45aa',
    revision: 1,
    isLocked: false,
  },
  'Hospital_Block_A.rvt': {
    name: 'Hospital_Block_A.rvt',
    folder: 'Healthcare',
    size: 148200000,
    revitVersion: 2025,
    versionGuid: '39d1b098-b80c-434f-a9cb-56a059d04ef1',
    revision: 14,
    isLocked: false,
  },
};

// Activity log for real-time Revit client inspection
const recentRequests: Array<{
  timestamp: string;
  method: string;
  url: string;
  userAgent?: string;
  userName?: string;
  machineName?: string;
  status: number;
}> = [];

// Helper to detect version from request or fall back to activeServerVersion
function getRevitVersion(req: Request): string {
  const userAgent = req.headers['user-agent'] || '';
  const match = userAgent.match(/Revit\s+(20\d{2})/i);
  if (match) {
    return `${match[1]}.0`;
  }
  const customHeader = req.headers['revit-year'] as string;
  if (customHeader) return `${customHeader}.0`;
  return activeServerVersion;
}

// Global Logger middleware
app.use((req, res, next) => {
  const origSend = res.send;
  res.send = function (body) {
    const isRevitCall = req.url.includes('AdminRESTService') || 
                        req.url.includes('ModelService') || 
                        req.url.includes('server');
    if (isRevitCall) {
      console.log(`[REVIT] ${req.method} ${req.url} -> HTTP ${res.statusCode} (UA: ${req.headers['user-agent'] || 'none'})`);
      recentRequests.unshift({
        timestamp: new Date().toLocaleTimeString(),
        method: req.method,
        url: req.originalUrl || req.url,
        userAgent: req.headers['user-agent'],
        userName: req.headers['user-name'] as string,
        machineName: req.headers['user-machine-name'] as string,
        status: res.statusCode,
      });
      if (recentRequests.length > 50) recentRequests.pop();
    }
    return origSend.call(this, body);
  };
  next();
});

// =============================================================================
// COMPREHENSIVE AUTODESK REVIT SERVER REST PROTOCOL ROUTER
// =============================================================================

app.all(['/*AdminRESTService.svc*', '/RevitServerAdminRESTService*', '/AdminRESTService.svc*', '/*ModelService.svc*', '/ModelService*'], (req: Request, res: Response, next) => {
  const fullUrl = decodeURIComponent(req.originalUrl || req.url);
  const detectedVersion = getRevitVersion(req);

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  // 1. Server Info (Discovery handshake)
  if (fullUrl.endsWith('/server/info') || fullUrl.includes('/server/info')) {
    return res.json({
      AccessLevels: ['Read', 'Write', 'Admin'],
      AvailableStorageSpace: 3491823901440,
      MachineName: 'OPEN-REVIT-SERVER',
      ServerRoles: ['Host', 'Accelerator'],
      ServerVersion: detectedVersion,
      TotalStorageSpace: 4398046511104,
    });
  }

  // 2. Server Roles
  if (fullUrl.endsWith('/server/roles') || fullUrl.includes('/server/roles')) {
    return res.json(['Host', 'Accelerator']);
  }

  // 3. Server Version
  if (fullUrl.endsWith('/server/version') || fullUrl.includes('/server/version') ||
      fullUrl.endsWith('/server/subversion') || fullUrl.includes('/server/subversion')) {
    return res.json(detectedVersion);
  }

  // 4. Descendants (Full directory tree - queried when Revit opens file browser)
  if (fullUrl.endsWith('/descendants') || fullUrl.includes('/descendants')) {
    return res.json({
      DriveFreeSpace: 3491823901440,
      DriveSpace: 4398046511104,
      Folders: [
        {
          Folders: [],
          HasChildren: false,
          Models: [
            {
              HasChildren: false,
              IsLocked: false,
              LockContext: null,
              ModelOption: 'Workshared',
              Name: 'Sample_Project.rvt',
              Size: 52428800,
            },
          ],
          Name: 'Projects',
          Size: 52428800,
        },
        {
          Folders: [],
          HasChildren: false,
          Models: [
            {
              HasChildren: false,
              IsLocked: false,
              LockContext: null,
              ModelOption: 'Workshared',
              Name: 'Hospital_Block_A.rvt',
              Size: 148200000,
            },
          ],
          Name: 'Healthcare',
          Size: 148200000,
        },
      ],
      Models: [
        {
          HasChildren: false,
          IsLocked: false,
          LockContext: null,
          ModelOption: 'Workshared',
          Name: 'Demo_Central.rvt',
          Size: 42100000,
        },
      ],
      Path: '',
    });
  }

  // 5. Contents (Directory query)
  if (fullUrl.endsWith('/contents') || fullUrl.includes('/contents') || fullUrl.includes('/projectlist')) {
    const match = fullUrl.match(/AdminRESTService\.svc\/(.*?)\/?(?:contents|projectlist)/i);
    let folder = match ? match[1] : '';
    if (folder === '|' || folder === '%7C' || folder === '/') folder = '';

    if (!folder) {
      // Root folder contents
      return res.json({
        DriveFreeSpace: 3491823901440,
        DriveSpace: 4398046511104,
        Folders: [
          {
            Folders: [],
            HasChildren: true,
            Models: [],
            Name: 'Projects',
            Size: 0,
          },
          {
            Folders: [],
            HasChildren: true,
            Models: [],
            Name: 'Healthcare',
            Size: 0,
          },
        ],
        Models: Object.values(modelsRegistry)
          .filter(m => !m.folder)
          .map(m => ({
            HasChildren: false,
            IsLocked: m.isLocked,
            LockContext: null,
            ModelOption: 'Workshared',
            Name: m.name,
            Size: m.size,
          })),
        Path: '',
      });
    }

    // Subfolder contents
    const cleanFolder = folder.replace(/^[|/]+/, '').replace(/[|/]+$/, '');
    const matchingModels = Object.values(modelsRegistry).filter(m =>
      m.folder.toLowerCase() === cleanFolder.toLowerCase()
    );

    const subFolders = cleanFolder.toLowerCase() === 'projects'
      ? [
          { Folders: [], HasChildren: false, Models: [], Name: '2025', Size: 0 },
          { Folders: [], HasChildren: false, Models: [], Name: 'Archive', Size: 0 }
        ]
      : cleanFolder.toLowerCase() === 'healthcare'
      ? [
          { Folders: [], HasChildren: false, Models: [], Name: 'Phase_1', Size: 0 }
        ]
      : [];

    return res.json({
      DriveFreeSpace: 3491823901440,
      DriveSpace: 4398046511104,
      Folders: subFolders,
      Models: matchingModels.map(m => ({
        HasChildren: false,
        IsLocked: m.isLocked,
        LockContext: m.isLocked ? { LockedBy: m.lockedBy, MachineName: m.machineName } : null,
        ModelOption: 'Workshared',
        Name: m.name,
        Size: m.size,
      })),
      Path: cleanFolder,
    });
  }

  // 6. Model Information (Queried by Revit when selecting a model)
  if (fullUrl.includes('/modelInfo') || fullUrl.includes('/modelinfo')) {
    const match = fullUrl.match(/AdminRESTService\.svc\/(.*?)\/modelinfo/i);
    const objectPath = match ? match[1] : '';
    const cleanPath = objectPath.replace(/^[|/]+/, '').replace(/[|/]+$/, '');
    const modelName = cleanPath.split(/[|/]/).filter(Boolean).pop() || 'Demo_Central.rvt';

    let model = modelsRegistry[modelName];
    if (!model) {
      model = {
        name: modelName,
        folder: cleanPath.includes('/') ? cleanPath.substring(0, cleanPath.lastIndexOf('/')) : '',
        size: 42100000,
        revitVersion: 2025,
        versionGuid: modelName.includes('Sample')
          ? 'c1f2e3d4-b5a6-4789-9012-3456789abcde'
          : modelName.includes('Hospital')
          ? 'f5e4d3c2-b1a0-4987-8765-43210fedcba9'
          : 'd3b07384-d113-4a1e-84b2-039c983a54b1',
        revision: 1,
        isLocked: false,
      };
      modelsRegistry[modelName] = model;
    }

    return res.json({
      DateCreated: '2026-10-11T00:00:00',
      DateModified: '2026-10-11T12:00:00',
      DescendentHasLockContext: false,
      LastModifiedBy: 'Architect',
      LockContext: model.isLocked ? { LockedBy: model.lockedBy, MachineName: model.machineName } : null,
      LockState: model.isLocked ? 1 : 0,
      MaximumModelNameLength: 255,
      ModelGUID: model.versionGuid,
      ModelLockOptions: 0,
      ModelLockType: 0,
      ModelLocksInProgress: [],
      ModelPath: cleanPath,
      ModelSize: model.size,
      ProductVersion: detectedVersion,
      SupportSize: 0,
      VersionNumber: model.revision || 1,
    });
  }

  // 7. Model Thumbnail (Queried by Revit to display preview pane in File Open dialog)
  if (fullUrl.includes('/thumbnail')) {
    const dummyPng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
      'base64'
    );
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Length', String(dummyPng.length));
    return res.end(dummyPng);
  }

  // 8. Project Info
  if (fullUrl.includes('/projectInfo') || fullUrl.includes('/projectinfo')) {
    return res.json({
      ClientName: 'Sample Client',
      IssueDate: '2026-10-11',
      OrganizationDescription: 'Open Revit Server',
      OrganizationName: 'OpenRevit',
      ProjectAddress: '127.0.0.1',
      ProjectIssueDate: '2026-10-11',
      ProjectName: 'Demo Central',
      ProjectNumber: '001',
      ProjectStatus: 'Active',
    });
  }

  // 9. Directory Info
  if (fullUrl.includes('/directoryInfo') || fullUrl.includes('/directoryinfo')) {
    const match = fullUrl.match(/AdminRESTService\.svc\/(.*?)\/directoryinfo/i);
    const folder = match ? match[1].replace(/^[|/]+/, '') : '';
    return res.json({
      DateCreated: '2026-10-11T00:00:00',
      DateModified: '2026-10-11T12:00:00',
      FolderCount: 0,
      ModelCount: 1,
      Name: folder.split(/[|/]/).pop() || folder,
      Path: folder,
      Size: 52428800,
    });
  }

  // 10. Descendant Locks Query
  if (fullUrl.includes('/descendent/locks') || fullUrl.includes('/descendants/locks')) {
    return res.json([]);
  }

  // 11. In-Progress Lock Check
  if (fullUrl.includes('/inProgressLock') || fullUrl.includes('/inprogresslock')) {
    return res.json({
      HasLock: false,
      LockContext: null,
      Status: 'Success',
    });
  }

  // 12. Server Properties
  if (fullUrl.includes('/serverProperties') || fullUrl.includes('/serverproperties')) {
    return res.json({
      AvailableStorageSpace: 3491823901440,
      MachineName: 'OPEN-REVIT-SERVER',
      ServerRoles: ['Host', 'Accelerator'],
      ServerVersion: detectedVersion,
      TotalStorageSpace: 4398046511104,
    });
  }

  // 13. Lock Model (Concurrency control)
  if (req.method === 'POST' && fullUrl.includes('/lock')) {
    const userName = (req.headers['user-name'] as string) || req.body?.UserName || 'RevitUser';
    const machineName = (req.headers['user-machine-name'] as string) || req.body?.MachineName || 'Workstation';
    const token = `tok-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    return res.json({
      ExpiresAt: new Date(Date.now() + 600000).toISOString(),
      LockToken: token,
      Status: 'Success',
    });
  }

  // 14. Unlock Model
  if (req.method === 'POST' && fullUrl.includes('/unlock')) {
    return res.json({
      Status: 'Released',
    });
  }

  // 15. History
  if (fullUrl.includes('/history')) {
    return res.json({
      Revisions: [
        {
          Comments: 'Synchronized curtain wall and grid alignment',
          Date: new Date().toISOString(),
          Number: 14,
          User: req.headers['user-name'] || 'Architect',
          VersionGuid: '39d1b098-b80c-434f-a9cb-56a059d04ef1',
        },
      ],
    });
  }

  // Generic fallback for any unhandled Revit service endpoint (never serve HTML)
  console.log(`[REVIT-REST] Unhandled service request: ${req.method} ${fullUrl}`);
  return res.json({ Status: 'Success' });
});

// =============================================================================
// API FOR DIAGNOSTICS & WEB DASHBOARD
// =============================================================================

app.get('/api/revit/live-traffic', (_req: Request, res: Response) => {
  res.json({
    activeVersion: activeServerVersion,
    requests: recentRequests,
    activeLocks: Object.values(modelsRegistry).filter(m => m.isLocked),
  });
});

app.post('/api/revit/set-version', (req: Request, res: Response) => {
  if (req.body?.version) {
    let v = String(req.body.version);
    if (!v.includes('.')) v += '.0';
    activeServerVersion = v;
  }
  res.json({ activeVersion: activeServerVersion });
});

// =============================================================================
// TCP PORT 808 MULTIPLEXER (.NET Framing PreambleAck & HTTP Proxy)
// =============================================================================

function startTcpMultiplexer() {
  const tcpServer = net.createServer((socket) => {
    socket.once('data', (initialChunk) => {
      const firstByte = initialChunk[0];
      // In HTTP, first byte is 'G' (GET=0x47), 'P' (POST=0x50), 'H' (HEAD=0x48), 'O' (OPTIONS=0x4f), 'D' (DELETE=0x44)
      const isHttp = firstByte === 0x47 || firstByte === 0x50 || firstByte === 0x48 || firstByte === 0x4F || firstByte === 0x44;

      if (isHttp) {
        // Forward HTTP requests to Express on port 3000
        const proxy = net.connect({ port: PORT, host: '127.0.0.1' }, () => {
          proxy.write(initialChunk);
          socket.pipe(proxy).pipe(socket);
        });
        proxy.on('error', () => socket.destroy());
      } else {
        // .NET Framing protocol from Revit Desktop (WCF NetTcpBinding / tcpbuffer)
        console.log(`[NET.TCP] Incoming WCF connection from Revit Client on port ${TCP_PORT}!`);
        console.log(`[NET.TCP] Framing Preamble hex: ${initialChunk.slice(0, 16).toString('hex')}`);

        // Send PreambleAck (0x0B) expected by Revit!
        console.log(`[NET.TCP] Sending PreambleAck (0x0B)...`);
        socket.write(Buffer.from([0x0B]));

        socket.on('data', (chunk) => {
          console.log(`[NET.TCP] Received WCF SOAP payload (${chunk.length} bytes)`);
          const text = chunk.toString('utf8');
          if (text.includes('ListSubFoldersAndModels') || text.includes('listServerSubFoldersAndModels')) {
            console.log(`[NET.TCP] Revit invoked: ListSubFoldersAndModels!`);
          }
        });
      }
    });

    socket.on('error', () => {});
  });

  tcpServer.listen(TCP_PORT, '0.0.0.0', () => {
    console.log(`[OpenRevitServer] Port ${TCP_PORT} TCP Multiplexer (.NET Framing + HTTP) active`);
  });

  tcpServer.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE' || err.code === 'EACCES') {
      console.log(`[OpenRevitServer] Port ${TCP_PORT} not bound directly inside process (handled via container routing).`);
    }
  });
}

// =============================================================================
// VITE SPA DEV & STATIC SERVING
// =============================================================================

async function startServer() {
  if (process.env.NODE_ENV !== 'production' && !fs.existsSync(path.join(__dirname, 'dist'))) {
    // Development mode with Vite middleware
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Production mode with compiled dist
    const distPath = fs.existsSync(path.join(__dirname, 'index.html'))
      ? __dirname
      : path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[OpenRevitServer] Web Dashboard & Revit REST API running on port ${PORT}`);
    console.log(`[OpenRevitServer] Active Revit Version Target: ${activeServerVersion}`);
    console.log(`[OpenRevitServer] Discovery URL: http://localhost:${PORT}/RevitServerAdminRESTService/AdminRESTService.svc/server/info`);
    startTcpMultiplexer();
  });
}

startServer();

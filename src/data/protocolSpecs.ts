import { ProtocolEndpoint } from '../types/revitServer';

export const protocolEndpoints: ProtocolEndpoint[] = [
  {
    id: 'ep-server-info',
    name: 'Server Info & Discovery',
    service: 'AdminRESTService',
    httpMethod: 'GET',
    path: '/RevitServerAdminRESTService/AdminRESTService.svc/server/info',
    category: 'Discovery',
    summary: 'Returns server identity, Revit version, roles (Host/Accelerator), and capacity',
    description: 'Revit Desktop Client calls this endpoint upon reading the server entry from RSN.ini. The response informs the client of server capabilities and server role.',
    headers: {
      'User-Agent': 'Autodesk Revit 2025 (x64)',
      'Accept': 'application/json, text/xml',
      'User-Name': 'Alexey_Sidorov',
      'User-Machine-Name': 'WS-ARCH-04',
      'Operation-GUID': '7d19280a-5b12-4cf3-a7d1-ef80912384a2',
    },
    responseExample: `{
  "ServerVersion": "2025.0",
  "ServerRoles": ["Host", "Accelerator"],
  "MachineName": "TUX-REVIT-01",
  "AvailableStorageSpace": 3491823901440,
  "TotalStorageSpace": 4398046511104,
  "AccessLevels": ["Read", "Write", "Admin"]
}`,
    relevanceToLinux: 'On Linux, this can be served as a static or lightweight JSON response from Go/Rust/Kestrel, replacing the IIS ASP.NET pipeline.',
  },
  {
    id: 'ep-folder-contents',
    name: 'Directory & Model Tree Listing',
    service: 'AdminRESTService',
    httpMethod: 'GET',
    path: '/RevitServerAdminRESTService/AdminRESTService.svc/{folderPath}/contents',
    category: 'File System',
    summary: 'Lists subfolders, .rvt project models, and lock flags for the specified directory',
    description: 'Invoked by Revit File Open dialog and Manage Links dialog when browsing the Revit Server Network (RSN). Traverses server directories.',
    headers: {
      'User-Agent': 'Autodesk Revit 2025 (x64)',
      'Accept': 'application/json',
      'User-Name': 'Elena_Vasilieva',
      'User-Machine-Name': 'WS-STR-02',
    },
    responseExample: `{
  "Path": "/Healthcare_Campus",
  "Folders": [
    { "Name": "Architecture", "HasChildren": true },
    { "Name": "Structure", "HasChildren": true },
    { "Name": "MEP", "HasChildren": true }
  ],
  "Models": [
    {
      "Name": "Site_Masterplan.rvt",
      "Size": 184520900,
      "ModelOption": "Workshared",
      "IsLocked": false,
      "LockContext": null
    }
  ]
}`,
    relevanceToLinux: 'Maps directly to Linux file system folders under /var/revit/projects. Linux ext4 or ZFS directory reading is substantially faster than Windows NTFS NTFS-MFT scans.',
  },
  {
    id: 'ep-model-lock',
    name: 'Acquire Central Model Lock',
    service: 'AdminRESTService',
    httpMethod: 'POST',
    path: '/RevitServerAdminRESTService/AdminRESTService.svc/{modelPath}/lock',
    category: 'Locking',
    summary: 'Atomically requests exclusive lock on central model during Synchronize with Central',
    description: 'Critical concurrency gate: When a Revit user presses "Synchronize with Central", Revit calls this to prevent conflicting concurrent writes. If already locked, returns HTTP 409 / ModelLocked code with existing holder info.',
    headers: {
      'User-Agent': 'Autodesk Revit 2025 (x64)',
      'Content-Type': 'application/json',
      'User-Name': 'Alexey_Sidorov',
      'User-Machine-Name': 'WS-ARCH-04',
      'Client-Session-Id': 'sess-9812-44fa',
    },
    requestExample: `{
  "LockType": "ExclusiveSync",
  "Comment": "Synchronizing Level 3 Architecture",
  "TimeoutSeconds": 600
}`,
    responseExample: `{
  "Status": "Success",
  "LockToken": "tok-e8201a4f-9988-4cba",
  "ModelPath": "/Healthcare_Campus/Architecture/Hospital_Block_A_Architecture.rvt",
  "GrantedAt": "2026-10-07T11:09:40Z",
  "ExpiresAt": "2026-10-07T11:19:40Z"
}`,
    relevanceToLinux: 'In Linux daemon, atomic locks can be managed in memory with sync.Mutex / Redis / SQLite WAL mode, eliminating the notorious Windows file-locking (sharing violation) bugs!',
  },
  {
    id: 'ep-model-release-lock',
    name: 'Release Central Model Lock',
    service: 'AdminRESTService',
    httpMethod: 'POST',
    path: '/RevitServerAdminRESTService/AdminRESTService.svc/{modelPath}/unlock',
    category: 'Locking',
    summary: 'Releases the lock upon successful sync completion or client cancellation',
    description: 'Called after differential stream upload and version pointer commit. The LockToken must match the token issued during lock acquisition.',
    headers: {
      'User-Agent': 'Autodesk Revit 2025 (x64)',
      'Content-Type': 'application/json',
      'Lock-Token': 'tok-e8201a4f-9988-4cba',
    },
    requestExample: `{
  "LockToken": "tok-e8201a4f-9988-4cba",
  "Action": "CommitAndRelease",
  "NewVersionGuid": "f83a1b92-4910-4f66-891a-cc90e12d45aa"
}`,
    responseExample: `{
  "Status": "Released",
  "ModelPath": "/Healthcare_Campus/Architecture/Hospital_Block_A_Architecture.rvt",
  "ReleasedAt": "2026-10-07T11:10:14Z"
}`,
    relevanceToLinux: 'Web admin panel can also provide an administrative "Force Break Lock" endpoint for when a user machine crashes mid-sync.',
  },
  {
    id: 'ep-model-history',
    name: 'Model Revision History & Version Chain',
    service: 'AdminRESTService',
    httpMethod: 'GET',
    path: '/RevitServerAdminRESTService/AdminRESTService.svc/{modelPath}/history',
    category: 'History',
    summary: 'Returns history of synchronization commits, authors, comments, and GUID deltas',
    description: 'Revit reads this to display the "Show History" dialog, and to compute which delta increments a local copy needs to download to catch up with Central.',
    headers: {
      'User-Agent': 'Autodesk Revit 2025 (x64)',
      'Accept': 'application/json',
    },
    responseExample: `{
  "ModelPath": "/Healthcare_Campus/Architecture/Hospital_Block_A_Architecture.rvt",
  "Revisions": [
    {
      "Number": 142,
      "Date": "2026-10-07T10:45:12Z",
      "User": "Alexey_Sidorov",
      "Comments": "Updated atrium curtain wall mullions",
      "VersionGuid": "f83a1b92-4910-4f66-891a-cc90e12d45aa"
    },
    {
      "Number": 141,
      "Date": "2026-10-07T08:12:00Z",
      "User": "Olga_Ivanova",
      "Comments": "Door schedule updates",
      "VersionGuid": "e1029c88-7711-4ca0-8801-44778899aa11"
    }
  ]
}`,
    relevanceToLinux: 'Stored as structured JSON or SQLite on Linux, keeping pristine revision logs independent of opaque Windows metadata files.',
  },
  {
    id: 'ep-model-stream-sync',
    name: 'Binary Delta Stream (ModelService)',
    service: 'ModelService',
    httpMethod: 'POST',
    path: '/ModelService/ModelService.svc/Stream/SyncDelta',
    category: 'Synchronization',
    summary: 'Chunked binary stream transfer for delta elements, worksets, and incremental blobs',
    description: 'The core payload transfer. Transmits compressed differential streams. Revit Server acts as a content-addressable delta store, preserving element GUID streams without parsing geometry.',
    headers: {
      'Content-Type': 'application/octet-stream',
      'Transfer-Encoding': 'chunked',
      'Target-Version-Guid': 'f83a1b92-4910-4f66-891a-cc90e12d45aa',
      'Base-Version-Guid': 'e1029c88-7711-4ca0-8801-44778899aa11',
    },
    responseExample: `{
  "SyncResult": "Success",
  "CommittedVersionGuid": "f83a1b92-4910-4f66-891a-cc90e12d45aa",
  "BytesReceived": 4210982,
  "ChecksumSha256": "8a31fe44...c991"
}`,
    relevanceToLinux: 'Linux network stack with epoll and sendfile/splice handles multi-gigabyte chunked streams with minimal CPU overhead.',
  },
];

export const diskStorageStructureExplanation = `
/var/revit/storage/
├── Projects/                           # Root for Revit projects tree
│   └── Healthcare_Campus/
│       └── Architecture/
│           └── Hospital_Block_A.rvt/   # Revit Server stores models as DIRECTORIES!
│               ├── model.dat           # Main model baseline storage blob
│               ├── GlobalData/         # Model GUID, permissions, workset definitions
│               ├── History/            # Incremental delta stream packs
│               │   ├── 00000140.delta
│               │   ├── 00000141.delta
│               │   └── 00000142.delta
│               ├── Permissions/        # Element & workset ownership leases
│               ├── Locks/              # Active sync locks (lock.json or flock)
│               └── manifest.json       # Metadata, version GUID, revision index
└── Cache/                              # Accelerator local cache for satellite offices
`;

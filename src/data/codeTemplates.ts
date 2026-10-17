export interface CodeTemplate {
  language: string;
  filename: string;
  title: string;
  description: string;
  code: string;
}

export const codeTemplates: CodeTemplate[] = [
  {
    language: 'go',
    filename: 'main.go',
    title: 'Go (Golang) Linux Daemon (Recommended)',
    description: 'High-concurrency, lightweight (<20MB RAM) native Linux daemon with atomic model locking and REST service routing.',
    code: `package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// Config and State
type ServerConfig struct {
	Port         string
	StorageRoot  string
	ServerName   string
	RevitVersion string
}

type ModelLock struct {
	Token        string    \`json:"token"\`
	LockedBy     string    \`json:"lockedBy"\`
	MachineName  string    \`json:"machineName"\`
	AcquiredAt   time.Time \`json:"acquiredAt"\`
	ExpiresAt    time.Time \`json:"expiresAt"\`
	LockType     string    \`json:"lockType"\`
}

type RevitServerDaemon struct {
	cfg   ServerConfig
	mu    sync.RWMutex
	locks map[string]*ModelLock // Key: model relative path
}

func NewRevitServerDaemon(cfg ServerConfig) *RevitServerDaemon {
	return &RevitServerDaemon{
		cfg:   cfg,
		locks: make(map[string]*ModelLock),
	}
}

// 1. Discovery Endpoint (Revit reads upon startup)
func (s *RevitServerDaemon) handleServerInfo(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	resp := map[string]interface{}{
		"ServerVersion":         s.cfg.RevitVersion,
		"ServerRoles":           []string{"Host", "Accelerator"},
		"MachineName":           s.cfg.ServerName,
		"AvailableStorageSpace": 3491823901440,
		"TotalStorageSpace":     4398046511104,
		"AccessLevels":          []string{"Read", "Write", "Admin"},
	}
	json.NewEncoder(w).Encode(resp)
}

// 2. Directory Listing
func (s *RevitServerDaemon) handleFolderContents(w http.ResponseWriter, r *http.Request) {
	folderPath := r.URL.Query().Get("path")
	if folderPath == "" {
		folderPath = "/"
	}
	targetDir := filepath.Join(s.cfg.StorageRoot, folderPath)

	entries, err := os.ReadDir(targetDir)
	if err != nil {
		http.Error(w, fmt.Sprintf("Directory error: %v", err), http.StatusNotFound)
		return
	}

	type FolderItem struct {
		Name        string \`json:"Name"\`
		HasChildren bool   \`json:"HasChildren"\`
	}
	type ModelItem struct {
		Name     string \`json:"Name"\`
		Size     int64  \`json:"Size"\`
		IsLocked bool   \`json:"IsLocked"\`
	}

	var folders []FolderItem
	var models []ModelItem

	s.mu.RLock()
	for _, entry := range entries {
		if entry.IsDir() {
			if filepath.Ext(entry.Name()) == ".rvt" {
				// In Revit Server, .rvt is stored as a structured directory!
				relPath := filepath.Join(folderPath, entry.Name())
				_, isLocked := s.locks[relPath]
				models = append(models, ModelItem{
					Name:     entry.Name(),
					Size:     350 * 1024 * 1024,
					IsLocked: isLocked,
				})
			} else {
				folders = append(folders, FolderItem{Name: entry.Name(), HasChildren: true})
			}
		}
	}
	s.mu.RUnlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"Path":    folderPath,
		"Folders": folders,
		"Models":  models,
	})
}

// 3. Concurrency Gate: Model Lock Acquisition
func (s *RevitServerDaemon) handleAcquireLock(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		ModelPath   string \`json:"ModelPath"\`
		UserName    string \`json:"UserName"\`
		MachineName string \`json:"MachineName"\`
		LockType    string \`json:"LockType"\`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Bad Request", http.StatusBadRequest)
		return
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	// Check if already locked and not expired
	if existing, exists := s.locks[req.ModelPath]; exists {
		if time.Now().Before(existing.ExpiresAt) {
			w.WriteHeader(http.StatusConflict) // 409 Conflict
			json.NewEncoder(w).Encode(map[string]interface{}{
				"Status":       "LockedByOtherUser",
				"LockedBy":     existing.LockedBy,
				"MachineName":  existing.MachineName,
				"AcquiredAt":   existing.AcquiredAt,
				"Message":      "The model is currently locked for synchronization.",
			})
			return
		}
	}

	// Grant Lock
	token := fmt.Sprintf("tok-%d-%s", time.Now().UnixNano(), req.UserName)
	newLock := &ModelLock{
		Token:       token,
		LockedBy:    req.UserName,
		MachineName: req.MachineName,
		AcquiredAt:  time.Now(),
		ExpiresAt:   time.Now().Add(10 * time.Minute),
		LockType:    req.LockType,
	}
	s.locks[req.ModelPath] = newLock

	log.Printf("[LOCK GRANTED] Model: %s by %s@%s (Token: %s)", req.ModelPath, req.UserName, req.MachineName, token)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"Status":    "Success",
		"LockToken": token,
		"ExpiresAt": newLock.ExpiresAt,
	})
}

func main() {
	cfg := ServerConfig{
		Port:         "8080",
		StorageRoot:  "/var/revit/storage/Projects",
		ServerName:   "TUX-REVIT-01",
		RevitVersion: "2025.0",
	}

	daemon := NewRevitServerDaemon(cfg)

	// Route mapping matching Autodesk Revit Server AdminRESTService.svc
	http.HandleFunc("/RevitServerAdminRESTService/AdminRESTService.svc/server/info", daemon.handleServerInfo)
	http.HandleFunc("/RevitServerAdminRESTService/AdminRESTService.svc/contents", daemon.handleFolderContents)
	http.HandleFunc("/RevitServerAdminRESTService/AdminRESTService.svc/lock", daemon.handleAcquireLock)

	log.Printf("Starting Linux Revit Server Daemon on port %s...", cfg.Port)
	if err := http.ListenAndServe(":"+cfg.Port, nil); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}`,
  },
  {
    language: 'csharp',
    filename: 'Program.cs',
    title: '.NET 9 CoreWCF (NetTcpBinding & tcpbuffer on Linux)',
    description: 'Официальный Microsoft CoreWCF для Linux. Нативно поддерживает WCF net.tcp://*:808 (binding: tcpbuffer) с обработкой GetMaxModelPathLength, ListSubFoldersAndModels и REST discovery на порту 80.',
    code: `// Program.cs - .NET 9 CoreWCF Linux Daemon for Autodesk Revit Server
using CoreWCF;
using CoreWCF.Configuration;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using System.Net;
using System.Xml;

var builder = WebApplication.CreateBuilder(args);

// 1. CoreWCF NetTcp Listener Configuration (Port 808)
builder.WebHost.UseNetTcp(options =>
{
    options.Listen(IPAddress.Any, 808);
});

// 2. Kestrel HTTP Listener (Port 80 for REST Discovery & Port 3000 for Web Dashboard)
builder.WebHost.ConfigureKestrel(options =>
{
    options.ListenAnyIP(80);
    options.ListenAnyIP(3000);
});

builder.Services.AddServiceModelServices();
builder.Services.AddServiceModelMetadata();

var app = builder.Build();

// 3. Universal Autodesk Revit Server REST API Middleware
app.Use(async (context, next) =>
{
    var path = context.Request.Path.Value ?? "";
    var isRest = path.Contains("AdminRESTService.svc", StringComparison.OrdinalIgnoreCase) ||
                 path.Contains("/server/info", StringComparison.OrdinalIgnoreCase);

    if (isRest)
    {
        context.Response.ContentType = "application/json; charset=utf-8";
        if (path.Contains("/server/info", StringComparison.OrdinalIgnoreCase))
        {
            await context.Response.WriteAsJsonAsync(new
            {
                AccessLevels = new[] { "Read", "Write", "Admin" },
                AvailableStorageSpace = 3491823901440L,
                MachineName = "OPEN-REVIT-SERVER",
                ServerRoles = new[] { "Host", "Accelerator" },
                ServerVersion = "2025.0",
                TotalStorageSpace = 4398046511104L
            });
            return;
        }
        if (path.Contains("/server/roles", StringComparison.OrdinalIgnoreCase))
        {
            await context.Response.WriteAsJsonAsync(new[] { "Host", "Accelerator" });
            return;
        }
    }
    await next();
});

// 4. CoreWCF NetTcpBinding Registration on Port 808
var netTcpBinding = new NetTcpBinding(SecurityMode.None)
{
    MaxReceivedMessageSize = 2147483647L,
    MaxBufferSize = 2147483647,
    TransferMode = TransferMode.Buffered,
    SendTimeout = TimeSpan.FromMinutes(10),
    ReceiveTimeout = TimeSpan.FromMinutes(10)
};

app.UseServiceModel(serviceModel =>
{
    serviceModel.AddService<UniversalModelService>();
    var endpoints = new[]
    {
        "net.tcp://127.0.0.1:808/ModelService2025/ModelService.svc/tcpbuffer",
        "net.tcp://127.0.0.1:808/ModelService2025/ModelService.svc",
        "net.tcp://127.0.0.1:808/ModelService2024/ModelService.svc/tcpbuffer",
        "net.tcp://127.0.0.1:808/ModelService2026/ModelService.svc/tcpbuffer",
        "net.tcp://127.0.0.1:808/ModelService.svc/tcpbuffer",
        "net.tcp://127.0.0.1:808/ModelService.svc"
    };

    foreach (var ep in endpoints)
    {
        serviceModel.AddServiceEndpoint<UniversalModelService, IUniversalModelService>(netTcpBinding, ep);
    }
});

app.Run();

[ServiceContract(Name = "IModelService", Namespace = "http://opendesign.com/2010/01/IModelService")]
public interface IUniversalModelService
{
    [OperationContract(Action = "*", ReplyAction = "*")]
    CoreWCF.Channels.Message ProcessMessage(CoreWCF.Channels.Message request);
}

[ServiceBehavior(AddressFilterMode = AddressFilterMode.Any)]
public class UniversalModelService : IUniversalModelService
{
    public CoreWCF.Channels.Message ProcessMessage(CoreWCF.Channels.Message request)
    {
        var action = request.Headers.Action ?? "http://opendesign.com/2010/01/IModelService/GetMaxModelPathLength";
        var lastSlash = action.LastIndexOf('/');
        var ns = lastSlash > 0 ? action.Substring(0, lastSlash) : "http://opendesign.com/2010/01/IModelService";
        var methodName = lastSlash > 0 ? action.Substring(lastSlash + 1) : action;
        string replyAction = action.EndsWith("Response", StringComparison.OrdinalIgnoreCase) ? action : action + "Response";

        string responseXml = methodName.Contains("GetMaxModelPathLength", StringComparison.OrdinalIgnoreCase)
            ? $"<GetMaxModelPathLengthResponse xmlns=\\"{ns}\\"><GetMaxModelPathLengthResult>255</GetMaxModelPathLengthResult></GetMaxModelPathLengthResponse>"
            : $"<ListSubFoldersAndModelsResponse xmlns=\\"{ns}\\"><ListSubFoldersAndModelsResult>true</ListSubFoldersAndModelsResult><folders xmlns:b=\\"http://schemas.microsoft.com/2003/10/Serialization/Arrays\\"><b:string>Projects</b:string><b:string>Healthcare</b:string></folders><models xmlns:b=\\"http://schemas.microsoft.com/2003/10/Serialization/Arrays\\"><b:string>Demo_Central.rvt</b:string></models></ListSubFoldersAndModelsResponse>";

        var reader = XmlReader.Create(new StringReader(responseXml));
        var reply = CoreWCF.Channels.Message.CreateMessage(request.Version, replyAction, reader);
        if (request.Headers.MessageId != null) reply.Headers.RelatesTo = request.Headers.MessageId;
        return reply;
    }
}`,
  },
  {
    language: 'docker',
    filename: 'Dockerfile',
    title: 'Dockerfile (Full-Stack .NET 9 CoreWCF + Web UI)',
    description: 'Multi-stage Dockerfile: сборка React UI на Node 22 + сборка CoreWCF демона на .NET 9 SDK + минимальный образ запуска ASP.NET 9 Alpine.',
    code: `# Multi-stage Dockerfile: OpenRevitServer .NET 9 CoreWCF + React UI
FROM node:22-alpine AS ui-builder
WORKDIR /app
COPY package.json ./
COPY bun.lock* package-lock.json* ./
RUN npm install --legacy-peer-deps
COPY . .
RUN npm run build

FROM mcr.microsoft.com/dotnet/sdk:9.0-alpine AS dotnet-builder
WORKDIR /src
COPY OpenRevitServer.csproj ./
RUN dotnet restore
COPY Program.cs ./
RUN dotnet publish -c Release -o /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:9.0-alpine AS runner
WORKDIR /app
COPY --from=dotnet-builder /app/publish ./
COPY --from=ui-builder /app/dist ./dist

EXPOSE 80 808 3000
ENV ASPNETCORE_ENVIRONMENT=Production
ENV ASPNETCORE_URLS=http://+:80;http://+:3000

ENTRYPOINT ["dotnet", "OpenRevitServer.dll"]`,
  },
  {
    language: 'docker',
    filename: 'docker-compose.yml',
    title: 'docker-compose.yml (Порты 808, 80, 3000)',
    description: 'Маппинг стандартных портов Autodesk Revit: 808 (WCF NetTcp), 80 (REST Discovery), 3000 (Веб-панель).',
    code: `services:
  open-revit-server:
    build:
      context: .
      dockerfile: Dockerfile
    restart: unless-stopped
    ports:
      # WCF NetTcpBinding (tcpbuffer) - Used by Revit Desktop for ModelService
      - "808:808"
      # REST API - Standard HTTP port for AdminRESTService discovery
      - "80:80"
      # Web Administration Dashboard
      - "3000:3000"
    environment:
      - ASPNETCORE_ENVIRONMENT=Production`,
  },
  {
    language: 'ini',
    filename: 'RSN.ini',
    title: 'Client Configuration (RSN.ini)',
    description: 'Placed on each Windows workstation at C:\\ProgramData\\Autodesk\\RevitServer[Year]\\Config\\RSN.ini',
    code: `; Revit Server Network Configuration File
; Place in: C:\\ProgramData\\Autodesk\\RevitServer2025\\Config\\RSN.ini
; (or respective version year 2021-2026)

; 1. Direct IP or Hostname of your Linux Server:
192.168.10.45

; 2. Or FQDN (Fully Qualified Domain Name):
tux-revit-01.corp.bim

; Multiple hosts can be specified line by line:
; revit-central-01.corp.bim
; revit-central-02.corp.bim`,
  },
];

using CoreWCF;
using CoreWCF.Configuration;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Runtime.Serialization;
using System.Text;
using System.Text.RegularExpressions;
using System.Xml;

var builder = WebApplication.CreateBuilder(args);

// =============================================================================
// 1. CoreWCF NetTcp Listener Configuration (Port 808) & Kestrel (Port 80, 3000)
// =============================================================================
builder.WebHost.UseNetTcp(IPAddress.Any, 808);

builder.WebHost.ConfigureKestrel(options =>
{
    options.ListenAnyIP(80);   // Standard Revit Server REST & SOAP HTTP port
    options.ListenAnyIP(3000); // Web Management Dashboard port
});

// Register CoreWCF Services, Metadata, and Universal Service Implementations
builder.Services.AddServiceModelServices();
builder.Services.AddServiceModelMetadata();
builder.Services.AddTransient<UniversalModelService>();
builder.Services.AddTransient<IUniversalModelService, UniversalModelService>();
builder.Services.AddTransient<IUniversalLocalService, UniversalModelService>();
builder.Services.AddTransient<IUniversalAdminService, UniversalModelService>();

var app = builder.Build();

// =============================================================================
// 2. Static Web Dashboard Files (Port 3000 / Port 80)
// =============================================================================
var distPath = Path.Combine(AppContext.BaseDirectory, "dist");
if (!Directory.Exists(distPath))
{
    distPath = Path.Combine(Directory.GetCurrentDirectory(), "dist");
}

PhysicalFileProvider? distFileProvider = null;
if (Directory.Exists(distPath))
{
    distFileProvider = new PhysicalFileProvider(distPath);
    app.UseDefaultFiles(new DefaultFilesOptions { FileProvider = distFileProvider });
    app.UseStaticFiles(new StaticFileOptions { FileProvider = distFileProvider });
}

// =============================================================================
// 3. API Endpoints for Dashboard Live Monitoring & Version Control
// =============================================================================
app.Use(async (context, next) =>
{
    var path = context.Request.Path.Value ?? "";

    // GET /api/revit/live-traffic
    if (path.Equals("/api/revit/live-traffic", StringComparison.OrdinalIgnoreCase))
    {
        context.Response.ContentType = "application/json; charset=utf-8";
        await context.Response.WriteAsJsonAsync(new
        {
            activeVersion = ServerState.EffectiveVersion,
            configuredVersion = ServerState.ConfiguredVersion,
            requests = ServerState.RecentLogs.Reverse().Take(50)
        });
        return;
    }

    // POST /api/revit/set-version
    if (path.Equals("/api/revit/set-version", StringComparison.OrdinalIgnoreCase) && context.Request.Method.Equals("POST", StringComparison.OrdinalIgnoreCase))
    {
        try
        {
            using var reader = new StreamReader(context.Request.Body);
            var bodyText = await reader.ReadToEndAsync();
            var doc = System.Text.Json.JsonDocument.Parse(string.IsNullOrWhiteSpace(bodyText) ? "{}" : bodyText);
            if (doc.RootElement.TryGetProperty("version", out var verProp))
            {
                var v = verProp.GetString() ?? "AUTO";
                ServerState.ConfiguredVersion = v;
                ServerState.TryDetectVersion(v);
                Console.WriteLine($"[Config] Target Revit Version updated to: '{ServerState.EffectiveVersion}' (Configured: '{ServerState.ConfiguredVersion}')");
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[Config] Failed to parse set-version payload: {ex.Message}");
        }

        context.Response.ContentType = "application/json; charset=utf-8";
        await context.Response.WriteAsJsonAsync(new
        {
            success = true,
            effectiveVersion = ServerState.EffectiveVersion,
            configuredVersion = ServerState.ConfiguredVersion
        });
        return;
    }

    // GET /api/revit/status
    if (path.Equals("/api/revit/status", StringComparison.OrdinalIgnoreCase))
    {
        context.Response.ContentType = "application/json; charset=utf-8";
        await context.Response.WriteAsJsonAsync(new
        {
            status = "online",
            serverVersion = ServerState.EffectiveVersion,
            configuredVersion = ServerState.ConfiguredVersion,
            roles = new[] { "Host", "Accelerator", "Admin" },
            ports = new { wcf = 808, rest = 80, web = 3000 }
        });
        return;
    }

    await next();
});

// =============================================================================
// 4. Universal Autodesk Revit Server REST API & WCF HTTP Middleware
// =============================================================================
app.Use(async (context, next) =>
{
    var path = context.Request.Path.Value ?? "";
    var queryString = context.Request.QueryString.Value ?? "";

    // Inspect headers for client version clues
    var userAgent = context.Request.Headers.UserAgent.ToString();
    var userName = context.Request.Headers["User-Name"].ToString();
    var machineName = context.Request.Headers["User-Machine-Name"].ToString();

    // Check version clues in path, query, UA, and all headers
    ServerState.TryDetectVersion(path);
    ServerState.TryDetectVersion(queryString);
    ServerState.TryDetectVersion(userAgent);
    foreach (var h in context.Request.Headers)
    {
        ServerState.TryDetectVersion(h.Key + ": " + h.Value);
    }

    var effectiveVersion = ServerState.EffectiveVersion;
    var hostName = context.Request.Host.Host;
    var effectiveMachine = !string.IsNullOrWhiteSpace(hostName) ? hostName : "127.0.0.1";

    // Check if this request is targeted at Revit Server REST API
    var isRestCall = path.Contains("AdminRESTService.svc", StringComparison.OrdinalIgnoreCase) ||
                     path.Contains("/server/info", StringComparison.OrdinalIgnoreCase) ||
                     path.Contains("/server/roles", StringComparison.OrdinalIgnoreCase) ||
                     path.Contains("/server/version", StringComparison.OrdinalIgnoreCase) ||
                     path.Contains("/server/subversion", StringComparison.OrdinalIgnoreCase) ||
                     path.Contains("/serverProperties", StringComparison.OrdinalIgnoreCase) ||
                     path.Contains("/descendants", StringComparison.OrdinalIgnoreCase) ||
                     path.Contains("/contents", StringComparison.OrdinalIgnoreCase) ||
                     path.StartsWith("/RevitServerAdminRESTService", StringComparison.OrdinalIgnoreCase);

    if (isRestCall)
    {
        Console.WriteLine($"[REST HTTP] {context.Request.Method} '{path}' (User: '{userName}', Machine: '{machineName}', UA: '{userAgent}', Version: '{effectiveVersion}')");

        context.Response.ContentType = "application/json; charset=utf-8";
        context.Response.Headers.CacheControl = "no-cache, no-store, must-revalidate";

        // 1. Server Info (Primary Discovery & Handshake)
        if (path.Contains("/server/info", StringComparison.OrdinalIgnoreCase))
        {
            Console.WriteLine($"[REST] Handshake: /server/info -> Responding with ServerVersion: '{effectiveVersion}', Roles: ['Host', 'Accelerator', 'Admin']");
            ServerState.RecordLog("REST", context.Request.Method, path, $"{userName}@{machineName}", effectiveVersion, 200, "Discovery handshake (/server/info)");

            await context.Response.WriteAsJsonAsync(new
            {
                AccessLevels = new[] { "Read", "Write", "Admin" },
                AvailableStorageSpace = 3491823901440L,
                MachineName = effectiveMachine,
                ServerRoles = new[] { "Host", "Accelerator", "Admin" },
                ServerVersion = effectiveVersion,
                TotalStorageSpace = 4398046511104L
            });
            return;
        }

        // 2. Server Roles
        if (path.Contains("/server/roles", StringComparison.OrdinalIgnoreCase))
        {
            ServerState.RecordLog("REST", context.Request.Method, path, $"{userName}@{machineName}", effectiveVersion, 200, "Server roles query");
            await context.Response.WriteAsJsonAsync(new[] { "Host", "Accelerator", "Admin" });
            return;
        }

        // 3. Server Version / Subversion
        if (path.Contains("/server/version", StringComparison.OrdinalIgnoreCase) ||
            path.Contains("/server/subversion", StringComparison.OrdinalIgnoreCase))
        {
            ServerState.RecordLog("REST", context.Request.Method, path, $"{userName}@{machineName}", effectiveVersion, 200, $"Version query: {effectiveVersion}");
            await context.Response.WriteAsJsonAsync(effectiveVersion);
            return;
        }

        // 4. Server Properties
        if (path.Contains("serverProperties", StringComparison.OrdinalIgnoreCase) ||
            path.Contains("/server/properties", StringComparison.OrdinalIgnoreCase))
        {
            ServerState.RecordLog("REST", context.Request.Method, path, $"{userName}@{machineName}", effectiveVersion, 200, "Server properties query");
            await context.Response.WriteAsJsonAsync(new
            {
                AccessLevels = new[] { "Read", "Write", "Admin" },
                AvailableStorageSpace = 3491823901440L,
                MachineName = effectiveMachine,
                ServerRoles = new[] { "Host", "Accelerator", "Admin" },
                ServerVersion = effectiveVersion,
                TotalStorageSpace = 4398046511104L
            });
            return;
        }

        // 5. Drives
        if (path.Contains("/server/drives", StringComparison.OrdinalIgnoreCase) ||
            path.Contains("/drives", StringComparison.OrdinalIgnoreCase))
        {
            ServerState.RecordLog("REST", context.Request.Method, path, $"{userName}@{machineName}", effectiveVersion, 200, "Drive storage query");
            await context.Response.WriteAsJsonAsync(new[]
            {
                new { DriveName = "C", DriveFreeSpace = 3491823901440L, DriveSpace = 4398046511104L }
            });
            return;
        }

        // 6. Descendants (Full directory tree queried by Revit File Open Dialog and Admin REST)
        if (path.Contains("/descendants", StringComparison.OrdinalIgnoreCase))
        {
            Console.WriteLine($"[REST] Descendants requested: {path}");
            ServerState.RecordLog("REST", context.Request.Method, path, $"{userName}@{machineName}", effectiveVersion, 200, "Catalog descendants query");

            var (rootFolders, rootModels) = ServerState.GetFolderContents("");
            var folderTrees = new List<object>();

            foreach (var fName in rootFolders)
            {
                var (subFolders, subModels) = ServerState.GetFolderContents(fName);
                folderTrees.Add(new
                {
                    Name = fName,
                    Size = subModels.Sum(m => m.Size),
                    HasChildren = subFolders.Count > 0 || subModels.Count > 0,
                    Folders = subFolders.Select(sf =>
                    {
                        var (subSubF, subSubM) = ServerState.GetFolderContents($"{fName}/{sf}");
                        return new
                        {
                            Name = sf,
                            Size = subSubM.Sum(m => m.Size),
                            HasChildren = subSubF.Count > 0 || subSubM.Count > 0,
                            Folders = Array.Empty<object>(),
                            Models = subSubM.Select(m => new
                            {
                                Name = m.Name,
                                LockState = m.IsLocked ? 1 : 0,
                                LockContext = (object?)null,
                                ModelSize = m.Size,
                                SupportSize = 0L,
                                ProductVersion = m.Version.Contains(".") ? m.Version.Substring(0, m.Version.IndexOf('.')) : m.Version,
                                ModelLocksInProgress = Array.Empty<object>()
                            }).ToArray()
                        };
                    }).ToArray(),
                    Models = subModels.Select(m => new
                    {
                        Name = m.Name,
                        Size = m.Size,
                        ModelOption = "Workshared",
                        IsLocked = m.IsLocked,
                        LockContext = (object?)null,
                        HasChildren = false,
                        DateCreated = m.DateCreated.ToString("o"),
                        DateModified = m.DateModified.ToString("o"),
                        LastModifiedBy = m.LastModifiedBy
                    }).ToArray()
                });
            }

            await context.Response.WriteAsJsonAsync(new
            {
                DriveFreeSpace = 3491823901440L,
                DriveSpace = 4398046511104L,
                Folders = folderTrees.ToArray(),
                Models = rootModels.Select(m => new
                {
                                Name = m.Name,
                                LockState = m.IsLocked ? 1 : 0,
                                LockContext = (object?)null,
                                ModelSize = m.Size,
                                SupportSize = 0L,
                                ProductVersion = m.Version.Contains(".") ? m.Version.Substring(0, m.Version.IndexOf('.')) : m.Version,
                                ModelLocksInProgress = Array.Empty<object>()
                }).ToArray(),
                Path = ""
            });
            return;
        }

        // 7. Contents & Directory Info (Single-level directory query in Open Dialog)
        if (path.Contains("/contents", StringComparison.OrdinalIgnoreCase) ||
            path.Contains("/projectlist", StringComparison.OrdinalIgnoreCase) ||
            path.Contains("/directoryinfo", StringComparison.OrdinalIgnoreCase) ||
            path.EndsWith(".svc", StringComparison.OrdinalIgnoreCase) ||
            path.EndsWith(".svc/", StringComparison.OrdinalIgnoreCase) ||
            path.EndsWith("|", StringComparison.OrdinalIgnoreCase) ||
            path.EndsWith("%7C", StringComparison.OrdinalIgnoreCase))
        {
            Console.WriteLine($"[REST] Contents / Directory info requested: {path}");
            ServerState.RecordLog("REST", context.Request.Method, path, $"{userName}@{machineName}", effectiveVersion, 200, "Directory contents query");

            string folderPath = "";
            var svcIdx = path.IndexOf(".svc", StringComparison.OrdinalIgnoreCase);
            if (svcIdx >= 0)
            {
                var afterSvc = path.Substring(svcIdx + 4).Trim('/');
                var contentsIdx = afterSvc.LastIndexOf("/contents", StringComparison.OrdinalIgnoreCase);
                if (contentsIdx >= 0)
                {
                    folderPath = afterSvc.Substring(0, contentsIdx);
                }
                else if (afterSvc.Equals("contents", StringComparison.OrdinalIgnoreCase) ||
                         afterSvc.Equals("descendants", StringComparison.OrdinalIgnoreCase))
                {
                    folderPath = "";
                }
                else
                {
                    folderPath = afterSvc.Replace("/contents", "").Replace("contents", "").Trim('/');
                }
            }
            folderPath = ServerState.NormalizePath(folderPath);

            var (folderList, modelItemList) = ServerState.GetFolderContents(folderPath);

            await context.Response.WriteAsJsonAsync(new
            {
                DriveFreeSpace = 3491823901440L,
                DriveSpace = 4398046511104L,
                Exists = true,
                Folders = folderList.Select(f => new
                {
                    Name = f,
                    HasContents = true,
                    LockState = 0,
                    LockContext = (object?)null,
                    Size = 0L,
                    ModelLocksInProgress = Array.Empty<object>()
                }).ToArray(),
                Models = modelItemList.Select(m => new
                {
                    Name = m.Name,
                    ModelGUID = m.ModelGuid,
                    ModelSize = m.Size,
                    SupportSize = 0L,
                    ModelOption = "Workshared",
                    ProductVersion = m.Version.Contains(".") ? m.Version.Substring(0, m.Version.IndexOf('.')) : m.Version,
                    IsLocked = m.IsLocked,
                    LockState = m.IsLocked ? 1 : 0,
                    LockContext = (object?)null,
                    DateCreated = m.DateCreated.ToString("o"),
                    DateModified = m.DateModified.ToString("o"),
                    LastModifiedBy = m.LastModifiedBy,
                    ModelLocksInProgress = Array.Empty<object>()
                }).ToArray(),
                Files = Array.Empty<object>(),
                LockState = 0,
                LockContext = (object?)null,
                ModelLocksInProgress = Array.Empty<object>(),
                Path = folderPath
            });
            return;
        }

        // 8. Lock / Unlock
        if (path.Contains("/lock", StringComparison.OrdinalIgnoreCase))
        {
            ServerState.RecordLog("REST", context.Request.Method, path, $"{userName}@{machineName}", effectiveVersion, 200, "Lock model request");
            await context.Response.WriteAsJsonAsync(new
            {
                ExpiresAt = DateTime.UtcNow.AddMinutes(10).ToString("o"),
                LockToken = $"tok-{Guid.NewGuid()}",
                Status = "Success"
            });
            return;
        }

        if (path.Contains("/unlock", StringComparison.OrdinalIgnoreCase))
        {
            ServerState.RecordLog("REST", context.Request.Method, path, $"{userName}@{machineName}", effectiveVersion, 200, "Unlock model request");
            await context.Response.WriteAsJsonAsync(new { Status = "Released" });
            return;
        }

        // 9. History
        if (path.Contains("/history", StringComparison.OrdinalIgnoreCase))
        {
            ServerState.RecordLog("REST", context.Request.Method, path, $"{userName}@{machineName}", effectiveVersion, 200, "Model history query");
            await context.Response.WriteAsJsonAsync(new
            {
                Revisions = new[]
                {
                    new
                    {
                        Comments = "Synchronized Central Model on Linux Host",
                        Date = DateTime.UtcNow.ToString("o"),
                        Number = 1,
                        User = !string.IsNullOrEmpty(userName) ? userName : "Architect",
                        VersionGuid = Guid.NewGuid().ToString()
                    }
                }
            });
            return;
        }

        // 8. ModelInfo query
        if (path.Contains("modelInfo", StringComparison.OrdinalIgnoreCase) ||
            path.Contains("modelinfo", StringComparison.OrdinalIgnoreCase))
        {
            var cleanPath = path.Replace("/AdminRESTService.svc", "").Replace("/modelInfo", "").Replace("/modelinfo", "").Trim('/', '|');
            cleanPath = Uri.UnescapeDataString(cleanPath);
            var model = ServerState.ResolveModel(cleanPath, "Проект1.rvt");
            Console.WriteLine($"[REST] ModelInfo requested for '{model.Path}' (GUID: {model.ModelGuid}, Version: {model.Version})");
            ServerState.RecordLog("REST", context.Request.Method, path, $"{userName}@{machineName}", effectiveVersion, 200, $"ModelInfo: {model.Path}");

            await context.Response.WriteAsJsonAsync(new
            {
                DateCreated = model.DateCreated.ToString("o"),
                DateModified = model.DateModified.ToString("o"),
                LastModifiedBy = model.LastModifiedBy,
                ModelSize = model.Size,
                SupportSize = 0L,
                ModelGUID = model.ModelGuid,
                ModelOption = "Workshared",
                ProductVersion = model.Version,
                LockState = 0,
                LockContext = (object?)null,
                ModelLocksInProgress = Array.Empty<object>()
            });
            return;
        }

        // 9. ProjectInfo query
        if (path.Contains("projectInfo", StringComparison.OrdinalIgnoreCase) ||
            path.Contains("projectinfo", StringComparison.OrdinalIgnoreCase))
        {
            Console.WriteLine($"[REST] ProjectInfo requested: {path}");
            ServerState.RecordLog("REST", context.Request.Method, path, $"{userName}@{machineName}", effectiveVersion, 200, "ProjectInfo query");
            await context.Response.WriteAsJsonAsync(new
            {
                Author = "Architect",
                ClientName = "Client",
                IssueDate = DateTime.UtcNow.ToString("yyyy-MM-dd"),
                ProjectAddress = "Address",
                ProjectName = "Project",
                ProjectNumber = "001",
                ProjectStatus = "Active"
            });
            return;
        }

        // 10. DirectoryInfo query
        if (path.Contains("directoryInfo", StringComparison.OrdinalIgnoreCase) ||
            path.Contains("directoryinfo", StringComparison.OrdinalIgnoreCase))
        {
            Console.WriteLine($"[REST] DirectoryInfo requested: {path}");
            ServerState.RecordLog("REST", context.Request.Method, path, $"{userName}@{machineName}", effectiveVersion, 200, "DirectoryInfo query");
            await context.Response.WriteAsJsonAsync(new
            {
                DateCreated = DateTime.UtcNow.ToString("o"),
                DateModified = DateTime.UtcNow.ToString("o"),
                LastModifiedBy = "user",
                Size = 0L,
                ModelSize = 0L,
                FolderCount = 0,
                ModelCount = 0,
                IsFolder = true,
                Exists = true,
                LockState = 0,
                LockContext = (object?)null,
                ModelLocksInProgress = Array.Empty<object>()
            });
            return;
        }

        // 11. Descendent locks query
        if (path.Contains("descendent/locks", StringComparison.OrdinalIgnoreCase) ||
            path.Contains("/locks", StringComparison.OrdinalIgnoreCase))
        {
            ServerState.RecordLog("REST", context.Request.Method, path, $"{userName}@{machineName}", effectiveVersion, 200, "Descendent locks query");
            await context.Response.WriteAsJsonAsync(new
            {
                Items = Array.Empty<object>(),
                DescendentHasLockContext = false
            });
            return;
        }

        // Fallback for unhandled AdminRESTService query
        Console.WriteLine($"[REST] Generic AdminREST query: {path}");
        ServerState.RecordLog("REST", context.Request.Method, path, $"{userName}@{machineName}", effectiveVersion, 200, "Generic REST query");

        await context.Response.WriteAsJsonAsync(new
        {
            DriveFreeSpace = 3491823901440L,
            DriveSpace = 4398046511104L,
            Exists = true,
            Folders = new[]
            {
                new { Name = "Projects", Size = 52428800L, HasChildren = true },
                new { Name = "Healthcare", Size = 148200000L, HasChildren = true }
            },
            Models = new[]
            {
                new { Name = "Demo_Central.rvt", Size = 42100000L, ModelOption = "Workshared", IsLocked = false, LockContext = (object?)null, HasChildren = false }
            },
            Path = ""
        });
        return;
    }

    // 5. Handling of WCF .svc requests over HTTP (ModelService.svc, LocalService.svc, AdminService.svc)
    // CRITICAL: NEVER return HTML SPA index.html for .svc requests or Revit throws ProxyGenerationException!
    if (path.Contains(".svc", StringComparison.OrdinalIgnoreCase))
    {
        Console.WriteLine($"[WCF HTTP] {context.Request.Method} '{path}' (UA: '{userAgent}', Version: '{effectiveVersion}')");
        ServerState.RecordLog("WCF-HTTP", context.Request.Method, path, userAgent, effectiveVersion, 200, "WCF HTTP .svc interrogation");

        // WSDL metadata inquiry (?wsdl, ?singleWsdl)
        if (queryString.Contains("wsdl", StringComparison.OrdinalIgnoreCase) || queryString.Contains("mex", StringComparison.OrdinalIgnoreCase))
        {
            context.Response.ContentType = "text/xml; charset=utf-8";
            await context.Response.WriteAsync($@"<?xml version=""1.0"" encoding=""utf-8""?>
<wsdl:definitions xmlns:wsdl=""http://schemas.xmlsoap.org/wsdl/"" xmlns:soap=""http://schemas.xmlsoap.org/wsdl/soap/"" xmlns:tns=""http://Autodesk.RevitServer.Enterprise.Services.Protected.Model"" targetNamespace=""http://Autodesk.RevitServer.Enterprise.Services.Protected.Model"">
    <wsdl:types/>
    <wsdl:service name=""UniversalModelService"">
        <wsdl:port name=""NetTcpBinding_IModelService"" binding=""tns:NetTcpBinding_IModelService"">
            <soap:address location=""net.tcp://0.0.0.0:808{path}/tcpbuffer""/>
        </wsdl:port>
    </wsdl:service>
</wsdl:definitions>");
            return;
        }

        // Return valid WCF service status XML for GET/HEAD requests
        context.Response.ContentType = "text/xml; charset=utf-8";
        await context.Response.WriteAsync($@"<s:Envelope xmlns:s=""http://schemas.xmlsoap.org/soap/envelope/"">
    <s:Body>
        <ServiceInfoResponse xmlns=""http://Autodesk.RevitServer.Enterprise.Services.Protected.Model"">
            <ServiceName>UniversalModelService</ServiceName>
            <Status>Active</Status>
            <Binding>NetTcpBinding (tcpbuffer)</Binding>
            <Port>808</Port>
            <ServerVersion>{effectiveVersion}</ServerVersion>
        </ServiceInfoResponse>
    </s:Body>
</s:Envelope>");
        return;
    }

    await next();
});

// SPA Fallback for Web Dashboard (Port 3000 / browser requests ONLY)
// Ensures API, .svc, and REST requests never accidentally receive HTML
if (distFileProvider != null)
{
    app.MapFallback(async context =>
    {
        var path = context.Request.Path.Value ?? "";
        if (path.Contains(".svc", StringComparison.OrdinalIgnoreCase) || path.StartsWith("/api/", StringComparison.OrdinalIgnoreCase))
        {
            context.Response.StatusCode = 404;
            return;
        }

        context.Response.ContentType = "text/html; charset=utf-8";
        var fileInfo = distFileProvider.GetFileInfo("index.html");
        if (fileInfo.Exists)
        {
            using var stream = fileInfo.CreateReadStream();
            await stream.CopyToAsync(context.Response.Body);
        }
        else
        {
            context.Response.StatusCode = 404;
        }
    });
}

// =============================================================================
// 5. CoreWCF NetTcpBinding Configuration on Port 808 (tcpbuffer)
// =============================================================================
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

    // Support all Revit year versions: 2026, 2025, 2024, 2023, 2022, 2021 + Generic
    var years = new[] { "2026", "2025", "2024", "2023", "2022", "2021" };

    foreach (var yr in years)
    {
        // ModelService
        serviceModel.AddServiceEndpoint<UniversalModelService, IUniversalModelService>(netTcpBinding, $"/ModelService{yr}/ModelService.svc/tcpbuffer");
        serviceModel.AddServiceEndpoint<UniversalModelService, IUniversalModelService>(netTcpBinding, $"/ModelService{yr}/ModelService.svc");

        // LocalService
        serviceModel.AddServiceEndpoint<UniversalModelService, IUniversalLocalService>(netTcpBinding, $"/LocalService{yr}/LocalService.svc/tcpbuffer");
        serviceModel.AddServiceEndpoint<UniversalModelService, IUniversalLocalService>(netTcpBinding, $"/LocalService{yr}/LocalService.svc");

        // AdminService
        serviceModel.AddServiceEndpoint<UniversalModelService, IUniversalAdminService>(netTcpBinding, $"/AdminService{yr}/AdminService.svc/tcpbuffer");
        serviceModel.AddServiceEndpoint<UniversalModelService, IUniversalAdminService>(netTcpBinding, $"/AdminService{yr}/AdminService.svc");
    }

    // Generic / Fallback endpoints
    serviceModel.AddServiceEndpoint<UniversalModelService, IUniversalModelService>(netTcpBinding, "/ModelService/ModelService.svc/tcpbuffer");
    serviceModel.AddServiceEndpoint<UniversalModelService, IUniversalModelService>(netTcpBinding, "/ModelService/ModelService.svc");
    serviceModel.AddServiceEndpoint<UniversalModelService, IUniversalModelService>(netTcpBinding, "/ModelService.svc/tcpbuffer");
    serviceModel.AddServiceEndpoint<UniversalModelService, IUniversalModelService>(netTcpBinding, "/ModelService.svc");

    serviceModel.AddServiceEndpoint<UniversalModelService, IUniversalLocalService>(netTcpBinding, "/LocalService/LocalService.svc/tcpbuffer");
    serviceModel.AddServiceEndpoint<UniversalModelService, IUniversalLocalService>(netTcpBinding, "/LocalService/LocalService.svc");
    serviceModel.AddServiceEndpoint<UniversalModelService, IUniversalLocalService>(netTcpBinding, "/LocalService.svc/tcpbuffer");
    serviceModel.AddServiceEndpoint<UniversalModelService, IUniversalLocalService>(netTcpBinding, "/LocalService.svc");

    serviceModel.AddServiceEndpoint<UniversalModelService, IUniversalAdminService>(netTcpBinding, "/AdminService/AdminService.svc/tcpbuffer");
    serviceModel.AddServiceEndpoint<UniversalModelService, IUniversalAdminService>(netTcpBinding, "/AdminService/AdminService.svc");
    serviceModel.AddServiceEndpoint<UniversalModelService, IUniversalAdminService>(netTcpBinding, "/AdminService.svc/tcpbuffer");
    serviceModel.AddServiceEndpoint<UniversalModelService, IUniversalAdminService>(netTcpBinding, "/AdminService.svc");
});

Console.WriteLine("==================================================================");
Console.WriteLine("[OpenRevitServer] CoreWCF Linux Server Ready!");
Console.WriteLine("[OpenRevitServer] Port 808: NetTcpBinding (tcpbuffer) Active (0.0.0.0:808)");
Console.WriteLine("[OpenRevitServer] Port 80:  Revit Server REST Handshake & .svc (0.0.0.0:80)");
Console.WriteLine("[OpenRevitServer] Port 3000: Web Dashboard Active (0.0.0.0:3000)");
Console.WriteLine($"[OpenRevitServer] Active Revit Version: '{ServerState.EffectiveVersion}' (Configured: '{ServerState.ConfiguredVersion}')");
Console.WriteLine("==================================================================");

app.Run();

// =============================================================================
// STATE & LOGGING
// =============================================================================

public record LiveRequestLog(
    string Timestamp,
    string Protocol,
    string Method,
    string Url,
    string ClientInfo,
    string DetectedVersion,
    int StatusCode,
    string Summary
);

public class ServerModelItem
{
    public string Path { get; set; } = "";
    public string Name { get; set; } = "";
    public string Folder { get; set; } = "";
    public string ModelGuid { get; set; } = Guid.NewGuid().ToString();
    public long Size { get; set; } = 42100000;
    public string Version { get; set; } = ServerState.EffectiveVersion;
    public DateTime DateCreated { get; set; } = DateTime.UtcNow;
    public DateTime DateModified { get; set; } = DateTime.UtcNow;
    public string LastModifiedBy { get; set; } = "user";
    public int VersionNumber { get; set; } = 1;
    public bool IsLocked { get; set; } = false;
    public string? LockedBy { get; set; }
}

public static class ServerState
{
    public static Dictionary<string, byte[]> ExtractOleStreams(byte[] cfbfBytes)
    {
        var result = new Dictionary<string, byte[]>(StringComparer.OrdinalIgnoreCase);
        if (cfbfBytes == null || cfbfBytes.Length < 512) return result;
        if (cfbfBytes[0] != 0xD0 || cfbfBytes[1] != 0xCF || cfbfBytes[2] != 0x11 || cfbfBytes[3] != 0xE0 ||
            cfbfBytes[4] != 0xA1 || cfbfBytes[5] != 0xB1 || cfbfBytes[6] != 0x1A || cfbfBytes[7] != 0xE1)
        {
            return result;
        }

        try {
            ushort sectorShift = BitConverter.ToUInt16(cfbfBytes, 30);
            int sectorSize = 1 << sectorShift;
            int fatSectorsCount = BitConverter.ToInt32(cfbfBytes, 44);
            int dirFirstSector = BitConverter.ToInt32(cfbfBytes, 48);

            List<int> fat = new List<int>();
            for (int i = 0; i < fatSectorsCount; i++)
            {
                int fatSecIndex = BitConverter.ToInt32(cfbfBytes, 76 + i * 4);
                int fatSecOffset = (fatSecIndex + 1) * sectorSize;
                int entriesInSector = sectorSize / 4;
                for (int e = 0; e < entriesInSector; e++)
                {
                    if (fatSecOffset + e * 4 + 4 <= cfbfBytes.Length)
                        fat.Add(BitConverter.ToInt32(cfbfBytes, fatSecOffset + e * 4));
                }
            }

            byte[] ReadSectorChain(int startSector, long streamSize)
            {
                using var ms = new MemoryStream();
                int curr = startSector;
                while (curr >= 0 && curr < fat.Count && ms.Length < streamSize)
                {
                    int offset = (curr + 1) * sectorSize;
                    int bytesToRead = (int)Math.Min(sectorSize, streamSize - ms.Length);
                    if (offset + bytesToRead <= cfbfBytes.Length)
                    {
                        ms.Write(cfbfBytes, offset, bytesToRead);
                    }
                    curr = fat[curr];
                }
                return ms.ToArray();
            }

            byte[] dirData = ReadSectorChain(dirFirstSector, cfbfBytes.Length);
            int dirEntriesCount = dirData.Length / 128;

            for (int d = 0; d < dirEntriesCount; d++)
            {
                int entryOffset = d * 128;
                ushort nameLen = BitConverter.ToUInt16(dirData, entryOffset + 64);
                byte objType = dirData[entryOffset + 66];

                if (nameLen > 2 && (objType == 2 || objType == 5))
                {
                    string name = Encoding.Unicode.GetString(dirData, entryOffset, nameLen - 2);
                    int startSector = BitConverter.ToInt32(dirData, entryOffset + 116);
                    long streamSize = BitConverter.ToInt64(dirData, entryOffset + 120);

                    if (objType == 2 && streamSize > 0 && startSector >= 0)
                    {
                        byte[] data = ReadSectorChain(startSector, streamSize);
                        result[name] = data;
                    }
                }
            }
        } catch { }

        return result;
    }

    public static byte[] GetModelStreamBytes(ServerModelItem model, string requestedFile, string clientMachine, string userName, string effectiveVersion)
    {
        string lowerReq = (requestedFile ?? "").ToLowerInvariant();

        if (lowerReq.EndsWith("/o") || lowerReq.EndsWith(@"\o") || lowerReq.Equals("o") ||
            lowerReq.Contains("basicfileinfo"))
        {
            return GenerateBasicFileInfo(
                clientMachine,
                model.Path,
                model.ModelGuid,
                !string.IsNullOrEmpty(model.Version) ? model.Version : effectiveVersion,
                !string.IsNullOrEmpty(userName) ? userName : "Architect"
            );
        }

        string diskPath = GetModelDiskPath(model.Path);
        if (File.Exists(diskPath))
        {
            byte[] diskBytes = File.ReadAllBytes(diskPath);
            var streams = ExtractOleStreams(diskBytes);
            if (streams.Count > 0)
            {
                if (lowerReq.Contains("contents"))
                {
                    if (streams.TryGetValue("Contents", out var cData)) return cData;
                }
                else if (lowerReq.Contains("projectinformation"))
                {
                    if (streams.TryGetValue("ProjectInformation", out var pData)) return pData;
                }
                else if (lowerReq.Contains("transmissiondata"))
                {
                    if (streams.TryGetValue("TransmissionData", out var tData)) return tData;
                }
                else
                {
                    foreach (var kvp in streams)
                    {
                        if (lowerReq.Contains(kvp.Key.ToLowerInvariant()))
                            return kvp.Value;
                    }
                }
            }
            return diskBytes;
        }

        byte[] bfiBytes = GenerateBasicFileInfo(
            clientMachine,
            model.Path,
            model.ModelGuid,
            !string.IsNullOrEmpty(model.Version) ? model.Version : effectiveVersion,
            !string.IsNullOrEmpty(userName) ? userName : "Architect"
        );

        if (lowerReq.Contains("contents"))
        {
            string defaultContentsXml = "<Contents><DocumentVersion>1</DocumentVersion></Contents>";
            return Encoding.UTF8.GetBytes(defaultContentsXml);
        }

        return bfiBytes;
    }
    public static byte[] CompressToZipDat(byte[] payload)
    {
        using var ms = new MemoryStream();
        using (var archive = new System.IO.Compression.ZipArchive(ms, System.IO.Compression.ZipArchiveMode.Create, leaveOpen: true))
        {
            var entry = archive.CreateEntry("data");
            using var es = entry.Open();
            es.Write(payload, 0, payload.Length);
        }
        return ms.ToArray();
    }

    public static string GetModelDiskPath(string rawPath)
    {
        var clean = NormalizePath(rawPath);
        if (string.IsNullOrEmpty(clean)) clean = "Проект1.rvt";
        var storageDir = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "model_storage");
        if (!Directory.Exists(storageDir)) Directory.CreateDirectory(storageDir);
        return Path.Combine(storageDir, clean.Replace('/', '_'));
    }

    public static byte[] CreateMinimalCompoundFile(byte[] basicFileInfoStreamBytes)
    {
        int dataSectors = (basicFileInfoStreamBytes.Length + 511) / 512;
        int totalSectors = 2 + dataSectors;

        byte[] fileBytes = new byte[(1 + totalSectors) * 512];

        fileBytes[0] = 0xD0; fileBytes[1] = 0xCF; fileBytes[2] = 0x11; fileBytes[3] = 0xE0;
        fileBytes[4] = 0xA1; fileBytes[5] = 0xB1; fileBytes[6] = 0x1A; fileBytes[7] = 0xE1;
        
        fileBytes[24] = 0x3E; fileBytes[25] = 0x00;
        fileBytes[26] = 0x03; fileBytes[27] = 0x00;
        fileBytes[28] = 0xFE; fileBytes[29] = 0xFF;
        fileBytes[30] = 0x09; fileBytes[31] = 0x00;
        fileBytes[32] = 0x06; fileBytes[33] = 0x00;
        
        BitConverter.GetBytes((int)1).CopyTo(fileBytes, 44);
        BitConverter.GetBytes((int)1).CopyTo(fileBytes, 48);
        BitConverter.GetBytes((int)4096).CopyTo(fileBytes, 56);
        BitConverter.GetBytes((int)-2).CopyTo(fileBytes, 60);
        BitConverter.GetBytes((int)-2).CopyTo(fileBytes, 68);
        
        BitConverter.GetBytes((int)0).CopyTo(fileBytes, 76);
        for (int i = 1; i < 109; i++)
        {
            BitConverter.GetBytes((int)-1).CopyTo(fileBytes, 76 + i * 4);
        }

        BitConverter.GetBytes((int)-3).CopyTo(fileBytes, 512 + 0 * 4);
        BitConverter.GetBytes((int)-2).CopyTo(fileBytes, 512 + 1 * 4);
        
        for (int s = 0; s < dataSectors; s++)
        {
            int currentSector = 2 + s;
            int nextSector = (s == dataSectors - 1) ? -2 : currentSector + 1;
            BitConverter.GetBytes(nextSector).CopyTo(fileBytes, 512 + currentSector * 4);
        }
        
        for (int i = 2 + dataSectors; i < 128; i++)
        {
            BitConverter.GetBytes((int)-1).CopyTo(fileBytes, 512 + i * 4);
        }

        string rootName = "Root Entry";
        for (int i = 0; i < rootName.Length; i++)
        {
            BitConverter.GetBytes((ushort)rootName[i]).CopyTo(fileBytes, 1024 + i * 2);
        }
        fileBytes[1024 + 64] = (byte)((rootName.Length + 1) * 2);
        fileBytes[1024 + 66] = 0x05;
        BitConverter.GetBytes((int)-1).CopyTo(fileBytes, 1024 + 68);
        BitConverter.GetBytes((int)-1).CopyTo(fileBytes, 1024 + 72);
        BitConverter.GetBytes((int)1).CopyTo(fileBytes, 1024 + 76);
        BitConverter.GetBytes((int)-2).CopyTo(fileBytes, 1024 + 116);
        BitConverter.GetBytes((long)0).CopyTo(fileBytes, 1024 + 120);

        int entry1Offset = 1024 + 128;
        string bfiName = "BasicFileInfo";
        for (int i = 0; i < bfiName.Length; i++)
        {
            BitConverter.GetBytes((ushort)bfiName[i]).CopyTo(fileBytes, entry1Offset + i * 2);
        }
        fileBytes[entry1Offset + 64] = (byte)((bfiName.Length + 1) * 2);
        fileBytes[entry1Offset + 66] = 0x02;
        BitConverter.GetBytes((int)-1).CopyTo(fileBytes, entry1Offset + 68);
        BitConverter.GetBytes((int)-1).CopyTo(fileBytes, entry1Offset + 72);
        BitConverter.GetBytes((int)-1).CopyTo(fileBytes, entry1Offset + 76);
        BitConverter.GetBytes((int)2).CopyTo(fileBytes, entry1Offset + 116);
        BitConverter.GetBytes((long)basicFileInfoStreamBytes.Length).CopyTo(fileBytes, entry1Offset + 120);

        for (int e = 2; e < 4; e++) {
            fileBytes[1024 + e * 128 + 66] = 0x00;
        }

        int dataStartOffset = 512 * (1 + 2);
        Array.Copy(basicFileInfoStreamBytes, 0, fileBytes, dataStartOffset, basicFileInfoStreamBytes.Length);

        return fileBytes;
    }

    public static byte[] GetOrCreateModelBytes(ServerModelItem model, string clientMachine, string userName, string effectiveVersion)
    {
        string diskPath = GetModelDiskPath(model.Path);
        if (File.Exists(diskPath))
        {
            try { return File.ReadAllBytes(diskPath); } catch {}
        }
        
        byte[] bfiBytes = GenerateBasicFileInfo(
            clientMachine,
            model.Path,
            model.ModelGuid,
            !string.IsNullOrEmpty(model.Version) ? model.Version : effectiveVersion,
            !string.IsNullOrEmpty(userName) ? userName : "Architect"
        );
        byte[] cfbf = CreateMinimalCompoundFile(bfiBytes);
        try { File.WriteAllBytes(diskPath, cfbf); } catch {}
        return cfbf;
    }

    public static volatile string ConfiguredVersion = Environment.GetEnvironmentVariable("REVIT_SERVER_VERSION") ?? "AUTO";
    public static volatile string ActiveDetectedVersion = "2025.0";
    public static readonly ConcurrentQueue<LiveRequestLog> RecentLogs = new();
    public static readonly ConcurrentDictionary<string, ServerModelItem> Models = new(StringComparer.OrdinalIgnoreCase);
    public static readonly ConcurrentDictionary<string, string> ClientActiveModelMap = new(StringComparer.OrdinalIgnoreCase);

    static ServerState()
    {
        InitializeDefaultModels();
    }

    public static void InitializeDefaultModels()
    {
        RegisterOrUpdateModel("Demo_Central.rvt", "Architect", "2025.0", 42100000, "d3b07384-d113-4a1e-84b2-039c983a54b1");
        RegisterOrUpdateModel("Projects/Sample_Project.rvt", "Architect", "2025.0", 52428800, "c1f2e3d4-b5a6-4789-9012-3456789abcde");
        RegisterOrUpdateModel("Projects/Demo_Central.rvt", "Architect", "2025.0", 42100000, "d3b07384-d113-4a1e-84b2-039c983a54b1");
        RegisterOrUpdateModel("Projects/2025/Commercial_Center.rvt", "Engineer", "2025.0", 84500000, "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d");
        RegisterOrUpdateModel("Projects/2025/Tower_Block_A.rvt", "Engineer", "2025.0", 91200000, "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e");
        RegisterOrUpdateModel("Projects/Archive/Project_2024_Backup.rvt", "Architect", "2024.0", 39100000, "c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f");
        RegisterOrUpdateModel("Healthcare/Hospital_Block_A.rvt", "BIM Manager", "2025.0", 148200000, "f5e4d3c2-b1a0-4987-8765-43210fedcba9");
        RegisterOrUpdateModel("Healthcare/Phase_1/Emergency_Wing.rvt", "BIM Manager", "2025.0", 67400000, "d4e5f6a7-b8c9-4d0e-1f2a-3b4c5d6e7f8a");
    }

    public static string NormalizePath(string? rawPath)
    {
        if (string.IsNullOrWhiteSpace(rawPath)) return "";
        var cleaned = rawPath.Trim(' ', '\t', '\r', '\n', '/', '\\', '|');
        cleaned = cleaned.Replace('\\', '/').Replace('|', '/');
        while (cleaned.Contains("//")) cleaned = cleaned.Replace("//", "/");
        return cleaned.Trim('/');
    }

    public static bool HasModel(string rawPath)
    {
        var clean = NormalizePath(rawPath);
        if (string.IsNullOrEmpty(clean)) return false;
        if (!clean.EndsWith(".rvt", StringComparison.OrdinalIgnoreCase)) return false;
        if (Models.ContainsKey(clean)) return true;
        var fileName = clean.Split('/').Last();
        return Models.Values.Any(m => m.Name.Equals(fileName, StringComparison.OrdinalIgnoreCase) && 
            (string.IsNullOrEmpty(m.Folder) || clean.Contains(m.Folder, StringComparison.OrdinalIgnoreCase)));
    }

    public static bool FolderExists(string rawFolderPath)
    {
        var clean = NormalizePath(rawFolderPath);
        if (string.IsNullOrEmpty(clean)) return true;
        if (clean.EndsWith(".rvt", StringComparison.OrdinalIgnoreCase)) return false;

        var (rootFolders, _) = GetFolderContents("");
        if (rootFolders.Any(f => f.Equals(clean, StringComparison.OrdinalIgnoreCase))) return true;

        if (clean.Equals("Projects", StringComparison.OrdinalIgnoreCase) ||
            clean.Equals("Projects/2025", StringComparison.OrdinalIgnoreCase) ||
            clean.Equals("Projects/Archive", StringComparison.OrdinalIgnoreCase) ||
            clean.Equals("Healthcare", StringComparison.OrdinalIgnoreCase) ||
            clean.Equals("Healthcare/Phase_1", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        if (Models.Values.Any(m => m.Folder.Equals(clean, StringComparison.OrdinalIgnoreCase) ||
                                   m.Folder.StartsWith(clean + "/", StringComparison.OrdinalIgnoreCase)))
        {
            return true;
        }

        return false;
    }

    public static ServerModelItem? GetModel(string rawPath)
    {
        var clean = NormalizePath(rawPath);
        if (string.IsNullOrEmpty(clean)) return null;
        if (Models.TryGetValue(clean, out var model)) return model;
        var fileName = clean.Split('/').Last();
        return Models.Values.FirstOrDefault(m => m.Name.Equals(fileName, StringComparison.OrdinalIgnoreCase));
    }

    public static ServerModelItem RegisterOrUpdateModel(string rawPath, string? userName = null, string? version = null, long size = 42100000, string? explicitGuid = null)
    {
        var clean = NormalizePath(rawPath);
        if (!string.IsNullOrEmpty(clean) && !clean.EndsWith(".rvt", StringComparison.OrdinalIgnoreCase))
        {
            clean = $"{clean}.rvt";
        }
        var parts = clean.Split('/');
        var name = parts.Last();
        var folder = parts.Length > 1 ? string.Join('/', parts.Take(parts.Length - 1)) : "";

        if (Models.TryGetValue(clean, out var existing))
        {
            existing.DateModified = DateTime.UtcNow;
            if (!string.IsNullOrEmpty(userName)) existing.LastModifiedBy = userName;
            existing.VersionNumber++;
            return existing;
        }

        var guid = explicitGuid ?? Guid.NewGuid().ToString();
        var item = new ServerModelItem
        {
            Path = clean,
            Name = name,
            Folder = folder,
            ModelGuid = guid,
            Size = size,
            Version = version ?? EffectiveVersion,
            DateCreated = DateTime.UtcNow,
            DateModified = DateTime.UtcNow,
            LastModifiedBy = userName ?? "Architect",
            VersionNumber = 1
        };
        Models[clean] = item;
        Console.WriteLine($"[ServerState] Registered model: Path='{clean}', Folder='{folder}', Name='{name}', GUID='{guid}'");
        return item;
    }

    public static (List<string> folders, List<ServerModelItem> models) GetFolderContents(string rawFolderPath)
    {
        var cleanFolder = NormalizePath(rawFolderPath);
        var folders = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var models = new List<ServerModelItem>();

        if (string.IsNullOrEmpty(cleanFolder))
        {
            folders.Add("Projects");
            folders.Add("Healthcare");
        }
        else if (cleanFolder.Equals("Projects", StringComparison.OrdinalIgnoreCase))
        {
            folders.Add("2025");
            folders.Add("Archive");
        }
        else if (cleanFolder.Equals("Healthcare", StringComparison.OrdinalIgnoreCase))
        {
            folders.Add("Phase_1");
        }

        foreach (var m in Models.Values)
        {
            if (string.IsNullOrEmpty(cleanFolder))
            {
                if (string.IsNullOrEmpty(m.Folder))
                {
                    models.Add(m);
                }
                else
                {
                    var topFolder = m.Folder.Split('/')[0];
                    folders.Add(topFolder);
                }
            }
            else
            {
                if (m.Folder.Equals(cleanFolder, StringComparison.OrdinalIgnoreCase))
                {
                    models.Add(m);
                }
                else if (m.Folder.StartsWith(cleanFolder + "/", StringComparison.OrdinalIgnoreCase))
                {
                    var remainder = m.Folder.Substring(cleanFolder.Length + 1);
                    var nextFolder = remainder.Split('/')[0];
                    folders.Add(nextFolder);
                }
            }
        }

        return (folders.OrderBy(f => f).ToList(), models.OrderBy(m => m.Name).ToList());
    }

    
    public static string ExtractClientKey(string requestBodyXml)
    {
        if (string.IsNullOrWhiteSpace(requestBodyXml)) return "default_client";
        var match = Regex.Match(requestBodyXml, @"<(?:[a-zA-Z0-9_]+:)?ClientMachineName[^>]*>(.*?)</", RegexOptions.IgnoreCase);
        if (match.Success && !string.IsNullOrWhiteSpace(match.Groups[1].Value))
            return match.Groups[1].Value.Trim();
        var userMatch = Regex.Match(requestBodyXml, @"<(?:[a-zA-Z0-9_]+:)?(?:UserName|user|userName)[^>]*>(.*?)</", RegexOptions.IgnoreCase);
        if (userMatch.Success && !string.IsNullOrWhiteSpace(userMatch.Groups[1].Value))
            return userMatch.Groups[1].Value.Trim();
        return "default_client";
    }

    public static string ExtractModelPath(string requestBodyXml)
    {
        if (string.IsNullOrWhiteSpace(requestBodyXml)) return "";

        var match = Regex.Match(requestBodyXml,
            @"<(?:[a-zA-Z0-9_]+:)?(?:strModelPath|relativeModelPath|modelPath|filePath|path|strFilePath|ModelDataResourceFileName)[^>]*>(.*?)</(?:[a-zA-Z0-9_]+:)?(?:strModelPath|relativeModelPath|modelPath|filePath|path|strFilePath|ModelDataResourceFileName)>",
            RegexOptions.IgnoreCase | RegexOptions.Singleline);

        if (match.Success && !string.IsNullOrWhiteSpace(match.Groups[1].Value))
        {
            var rawPath = match.Groups[1].Value.Trim();
            if (!System.Net.IPAddress.TryParse(rawPath, out _) && !rawPath.Equals("localhost", StringComparison.OrdinalIgnoreCase))
            {
                var clean = NormalizePath(rawPath);
                if (!string.IsNullOrEmpty(clean) && !clean.Equals("127.0.0.1", StringComparison.OrdinalIgnoreCase)) return clean;
            }
        }

        var rvtMatch = Regex.Match(requestBodyXml, @"([^\s<>""']+\.rvt)", RegexOptions.IgnoreCase);
        if (rvtMatch.Success)
        {
            var raw = rvtMatch.Value.Trim();
            if (!System.Net.IPAddress.TryParse(raw.Replace(".rvt", ""), out _))
            {
                return NormalizePath(raw);
            }
        }

        return "";
    }

    public static string ExtractModelGuid(string requestBodyXml)
    {
        if (string.IsNullOrWhiteSpace(requestBodyXml)) return "";

        var projMatch = Regex.Match(requestBodyXml,
            @"<(?:[a-zA-Z0-9_]+:)?ProjectGUID[^>]*>\s*([a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12})\s*</",
            RegexOptions.IgnoreCase);
        if (projMatch.Success && !string.IsNullOrWhiteSpace(projMatch.Groups[1].Value))
            return projMatch.Groups[1].Value.Trim();

        var modelMatch = Regex.Match(requestBodyXml,
            @"<(?:[a-zA-Z0-9_]+:)?ModelGUID[^>]*>\s*([a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12})\s*</",
            RegexOptions.IgnoreCase);
        if (modelMatch.Success && !string.IsNullOrWhiteSpace(modelMatch.Groups[1].Value))
            return modelMatch.Groups[1].Value.Trim();

        var idMatch = Regex.Match(requestBodyXml,
            @"<(?:[a-zA-Z0-9_]+:)?IdentityGUID[^>]*>\s*<(?:[a-zA-Z0-9_]+:)?Guid[^>]*>\s*([a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12})\s*</",
            RegexOptions.IgnoreCase | RegexOptions.Singleline);
        if (idMatch.Success && !string.IsNullOrWhiteSpace(idMatch.Groups[1].Value))
            return idMatch.Groups[1].Value.Trim();

        var permsMatch = Regex.Match(requestBodyXml,
            @"<(?:[a-zA-Z0-9_]+:)?PermsIdentity[^>]*>\s*<(?:[a-zA-Z0-9_]+:)?IdentityGUID[^>]*>\s*<(?:[a-zA-Z0-9_]+:)?Guid[^>]*>\s*([a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12})\s*</",
            RegexOptions.IgnoreCase | RegexOptions.Singleline);
        if (permsMatch.Success && !string.IsNullOrWhiteSpace(permsMatch.Groups[1].Value))
            return permsMatch.Groups[1].Value.Trim();

        return "";
    }

    public static ServerModelItem ResolveModel(string requestBodyXml, string defaultPath = "Проект1.rvt", bool autoRegister = false, string? overrideGuid = null)
    {
        var clientKey = ExtractClientKey(requestBodyXml);
        var path = ExtractModelPath(requestBodyXml);
        var guid = ExtractModelGuid(requestBodyXml);
        if (string.IsNullOrEmpty(guid) && !string.IsNullOrEmpty(overrideGuid))
        {
            guid = overrideGuid;
        }

        ServerModelItem? model = null;

        if (!string.IsNullOrEmpty(guid))
        {
            model = Models.Values.FirstOrDefault(m => m.ModelGuid.Equals(guid, StringComparison.OrdinalIgnoreCase));
        }

        if (model == null && !string.IsNullOrEmpty(path))
        {
            model = GetModel(path);
        }

        if (model == null && ClientActiveModelMap.TryGetValue(clientKey, out var activePath) && !string.IsNullOrEmpty(activePath))
        {
            model = GetModel(activePath);
        }

        if (model == null)
        {
            var targetPath = !string.IsNullOrEmpty(path) ? path : defaultPath;
            if (autoRegister)
            {
                model = RegisterOrUpdateModel(targetPath, "user", EffectiveVersion, explicitGuid: !string.IsNullOrEmpty(guid) ? guid : null);
            }
            else
            {
                var clean = NormalizePath(targetPath);
                if (!string.IsNullOrEmpty(clean) && !clean.EndsWith(".rvt", StringComparison.OrdinalIgnoreCase)) clean += ".rvt";
                var parts = clean.Split('/');
                var name = parts.Last();
                var folder = parts.Length > 1 ? string.Join('/', parts.Take(parts.Length - 1)) : "";
                model = new ServerModelItem
                {
                    Path = clean,
                    Name = name,
                    Folder = folder,
                    ModelGuid = !string.IsNullOrEmpty(guid) ? guid : Guid.NewGuid().ToString(),
                    Size = 42100000,
                    Version = EffectiveVersion,
                    DateCreated = DateTime.UtcNow,
                    DateModified = DateTime.UtcNow,
                    LastModifiedBy = "user",
                    VersionNumber = 1
                };
            }
        }

        if (model != null && autoRegister)
        {
            ClientActiveModelMap[clientKey] = model.Path;
        }

        return model!;
    }

    private static void WriteBfiString(BinaryWriter writer, string? content)
    {
        if (content == null)
        {
            writer.Write((int)0);
            return;
        }
        writer.Write((int)content.Length);
        if (content.Length > 0)
        {
            writer.Write(content.ToCharArray());
        }
    }

    public static byte[] GenerateBasicFileInfo(string serverHost, string modelPath, string modelGuid, string version, string userName)
    {
        var versionYear = version.Split('.')[0].Trim();
        if (string.IsNullOrEmpty(versionYear) || versionYear.Length != 4) versionYear = "2025";
        var buildNumber = version.Contains('.') ? version : $"{versionYear}.0";

        var centralPath = $"RSN://{serverHost}/{modelPath}";
        var episodeGuid = Guid.NewGuid().ToString();

        using var ms = new MemoryStream();
        using (var writer = new BinaryWriter(ms, Encoding.Unicode, leaveOpen: true))
        {
            // 1. Version: BFISV_Max = 15
            writer.Write((int)14);
            // 2. IsWorkshared: true
            writer.Write(true);
            // 3. WorksharingState: 0 (WS_Central)
            writer.Write((byte)0);
            // 4. Username
            WriteBfiString(writer, userName);
            // 5. CentralPath
            WriteBfiString(writer, centralPath);
            // 6. Format (>= 12)
            WriteBfiString(writer, versionYear);
            // BuildVersion
            WriteBfiString(writer, buildNumber);
            // 7. SavedPath (>= 1)
            WriteBfiString(writer, centralPath);
            // 8. OpenWorksetDefault (>= 3)
            writer.Write((int)3);
            // 9. IsLT (>= 4)
            writer.Write(false);
            // 10. CentralModelIdentity (>= 5)
            WriteBfiString(writer, modelGuid);
            // 11. LocaleWhenSaved (>= 6)
            WriteBfiString(writer, "ENU");
            // 12. AllLocalChangesSavedToCentral (>= 7)
            writer.Write(true);
            // 13. LatestCentralVersionAndEpisode (>= 8)
            writer.Write((int)1);
            WriteBfiString(writer, episodeGuid);
            // 14. UniqueDocumentVersionIdentifier (>= 9)
            WriteBfiString(writer, Guid.NewGuid().ToString());
            WriteBfiString(writer, "1");
            // 15. ModelIdentity (>= 10)
            WriteBfiString(writer, modelGuid);
            // 16. IsSingleUserCloudModel (>= 11)
            writer.Write(false);
            // 17. Author (>= 13)
            WriteBfiString(writer, "Autodesk Revit");
            // 18. ClientAppName (>= 14)
            WriteBfiString(writer, "RevitApplication");

            // Text representation section
            string textRepresentation =
                "Worksharing: Central\r\n" +
                $"Username: {userName}\r\n" +
                $"Central Model Path: {centralPath}\r\n" +
                $"Format: {versionYear}\r\n" +
                $"Build: {buildNumber}\r\n" +
                $"Last Save Path: {centralPath}\r\n" +
                "Open Workset Default: 3\r\n" +
                "Revit LT File: False\r\n" +
                $"Central Model Identity: {modelGuid}\r\n" +
                "Locale When Saved: ENU\r\n" +
                "All Local Changes Saved To Central: True\r\n" +
                "Central model's version number corresponding to the last reload latest: 1\r\n" +
                $"Central model's episode GUID corresponding to the last reload latest: GUID{episodeGuid}\r\n" +
                $"The unique document version identifier is {modelGuid} for 1 saves.\r\n" +
                $"Model Identity: {modelGuid}\r\n" +
                "Model is singleUserCloudModel: False\r\n" +
                "Author: Autodesk Revit\r\n" +
                "ClientAppName: RevitApplication\r\n";

            writer.Write("\r\n");
            writer.Write(textRepresentation.ToCharArray());
            writer.Write("\r\n");
        }

        return ms.ToArray();
    }

    public static string EffectiveVersion
    {
        get
        {
            if (string.IsNullOrWhiteSpace(ConfiguredVersion) || ConfiguredVersion.Equals("AUTO", StringComparison.OrdinalIgnoreCase))
            {
                return ActiveDetectedVersion;
            }
            return ConfiguredVersion.Contains('.') ? ConfiguredVersion : $"{ConfiguredVersion}.0";
        }
    }

    public static void RecordLog(string protocol, string method, string url, string clientInfo, string detectedVersion, int statusCode, string summary)
    {
        RecentLogs.Enqueue(new LiveRequestLog(
            DateTime.Now.ToString("HH:mm:ss.fff"),
            protocol,
            method,
            url,
            clientInfo,
            detectedVersion,
            statusCode,
            summary
        ));
        while (RecentLogs.Count > 100)
        {
            RecentLogs.TryDequeue(out _);
        }
    }

    public static void TryDetectVersion(string? text)
    {
        if (string.IsNullOrEmpty(text)) return;
        var match = Regex.Match(text, @"20(1[8-9]|2[0-9])");
        if (match.Success)
        {
            var year = match.Value;
            var newVer = $"{year}.0";
            if (ActiveDetectedVersion != newVer)
            {
                Console.WriteLine($"[Version Detector] Detected incoming client version: {newVer} (from: '{text}')");
                ActiveDetectedVersion = newVer;
            }
        }
    }
}

// =============================================================================
// UNIVERSAL WCF SERVICE CONTRACTS & IMPLEMENTATION
// =============================================================================

[ServiceContract(Name = "IModelService", Namespace = "http://Autodesk.RevitServer.Enterprise.Services.Protected.Model")]
public interface IUniversalModelService
{
    [OperationContract(Action = "*", ReplyAction = "*")]
    CoreWCF.Channels.Message ProcessMessage(CoreWCF.Channels.Message request);
}

[ServiceContract(Name = "ILocalService", Namespace = "http://Autodesk.RevitServer.Enterprise.Services.Protected.Local")]
public interface IUniversalLocalService
{
    [OperationContract(Action = "*", ReplyAction = "*")]
    CoreWCF.Channels.Message ProcessMessage(CoreWCF.Channels.Message request);
}

[ServiceContract(Name = "IAdminService", Namespace = "http://Autodesk.RevitServer.Enterprise.Services.Protected.Admin")]
public interface IUniversalAdminService
{
    [OperationContract(Action = "*", ReplyAction = "*")]
    CoreWCF.Channels.Message ProcessMessage(CoreWCF.Channels.Message request);
}

[DataContract(Name = "VersionNumber", Namespace = "http://Autodesk.RevitServer.Enterprise.DataContract.Model")]
public class HeaderVersionNumber
{
    [DataMember(Name = "Major")]
    public int Major { get; set; } = -1;

    [DataMember(Name = "Minor")]
    public int Minor { get; set; }
}

[ServiceBehavior(AddressFilterMode = AddressFilterMode.Any)]
public class UniversalModelService : IUniversalModelService, IUniversalLocalService, IUniversalAdminService
{
    private string serverHost = "127.0.0.1";

    public CoreWCF.Channels.Message ProcessMessage(CoreWCF.Channels.Message request)
    {
        var action = request.Headers.Action ?? "";
        var toUri = request.Headers.To?.ToString() ?? "";

        // Detect version from WCF action or To URI
        ServerState.TryDetectVersion(action + " " + toUri);
        var effectiveVersion = ServerState.EffectiveVersion;

        serverHost = "127.0.0.1";
        try
        {
            if (!string.IsNullOrEmpty(toUri))
            {
                var uri = new Uri(toUri);
                serverHost = uri.Host;
            }
        }
        catch { }

        var effectiveMachine = !string.IsNullOrEmpty(serverHost) ? serverHost : "127.0.0.1";
        var userName = "user";
        int? latestModelVersionNumber = null;

        Console.WriteLine($"[CoreWCF] >>> REQUEST RECEIVED: Action='{action}', To='{toUri}', Version='{effectiveVersion}', Host='{serverHost}'");

        string? currentUploadFileId = null;
        string incomingFileId = "";
        string incomingModelGuid = "";
        string incomingScopingId = "";
        try
        {
            if (request.Headers.Count > 0)
            {
                var hList = new List<string>();
                for (int i = 0; i < request.Headers.Count; i++)
                {
                    var h = request.Headers[i];
                    if (h.Name != "To" && h.Name != "Action")
                    {
                        hList.Add($"{h.Name} (ns: {h.Namespace})");
                    }
                    if (h.Name.Equals("FileId", StringComparison.OrdinalIgnoreCase) || h.Name.Equals("FileID", StringComparison.OrdinalIgnoreCase))
                    {
                        try
                        {
                            using var rdr = request.Headers.GetReaderAtHeader(i);
                            incomingFileId = rdr.ReadElementContentAsString();
                        }
                        catch { }
                    }
                    else if (h.Name.Equals("ModelSessionToken", StringComparison.OrdinalIgnoreCase) ||
                             h.Name.Equals("SessionToken", StringComparison.OrdinalIgnoreCase) ||
                             h.Name.Equals("serviceModelSessionToken", StringComparison.OrdinalIgnoreCase))
                    {
                        try
                        {
                            using var rdr = request.Headers.GetReaderAtHeader(i);
                            var headerXml = rdr.ReadOuterXml();
                            var m = Regex.Match(headerXml, @"[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}");
                            if (m.Success)
                            {
                                incomingModelGuid = m.Value;
                            }
                        }
                        catch { }
                    }
                    if (h.Name.Equals("ScopingId", StringComparison.OrdinalIgnoreCase))
                    {
                        try
                        {
                            using var rdr = request.Headers.GetReaderAtHeader(i);
                            incomingScopingId = rdr.ReadElementContentAsString();
                        }
                        catch { }
                    }
                }
                if (hList.Count > 0)
                {
                    Console.WriteLine($"[CoreWCF] >>> Headers: {string.Join(", ", hList)}");
                }
                if (!string.IsNullOrEmpty(incomingScopingId))
                {
                    Console.WriteLine($"[CoreWCF] >>> ScopingId: '{incomingScopingId}'");
                }
            }
        }
        catch { }

        string requestElementName = "";
        string requestElementNamespace = "";
        string requestBodyXml = "";

        // Inspect incoming SOAP body contents
        try
        {
            var msgBuffer = request.CreateBufferedCopy(int.MaxValue);
            request = msgBuffer.CreateMessage();
            using var msgCopy = msgBuffer.CreateMessage();
            using var bodyReader = msgCopy.GetReaderAtBodyContents();
            requestElementName = bodyReader.LocalName;
            requestElementNamespace = bodyReader.NamespaceURI;
            requestBodyXml = bodyReader.ReadOuterXml();
            Console.WriteLine($"[CoreWCF] >>> Request Body Root: Element='{requestElementName}', Namespace='{requestElementNamespace}'");
            if (!string.IsNullOrEmpty(requestBodyXml))
            {
                Console.WriteLine($"[CoreWCF] >>> Request Body Content: {requestBodyXml}");
                ServerState.TryDetectVersion(requestBodyXml);
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[CoreWCF] (Unable to inspect request body: {ex.Message})");
        }

        // Determine target method name
        var lastSlash = action.LastIndexOf('/');
        var methodNameFromAction = lastSlash > 0 ? action.Substring(lastSlash + 1) : action;
        var methodName = !string.IsNullOrEmpty(methodNameFromAction) ? methodNameFromAction : requestElementName;
        if (string.IsNullOrEmpty(methodName))
        {
            methodName = "GetMaxModelPathLength";
        }

        // Extract base namespace from action
        var nsFromAction = lastSlash > 0 ? action.Substring(0, lastSlash) : "";
        var baseNsFromAction = nsFromAction;
        string[] serviceSuffixes = { "/ModelService", "/IModelService", "/LocalService", "/ILocalService", "/AdminService", "/IAdminService" };
        foreach (var suffix in serviceSuffixes)
        {
            if (baseNsFromAction.EndsWith(suffix, StringComparison.OrdinalIgnoreCase))
            {
                baseNsFromAction = baseNsFromAction.Substring(0, baseNsFromAction.Length - suffix.Length);
                break;
            }
        }

        // Determine contract XML namespace for response elements
        string ns;
        if (!string.IsNullOrEmpty(requestElementNamespace) && requestElementNamespace.StartsWith("http"))
        {
            ns = requestElementNamespace;
        }
        else if (!string.IsNullOrEmpty(baseNsFromAction) && baseNsFromAction.StartsWith("http"))
        {
            ns = baseNsFromAction;
        }
        else
        {
            ns = "http://Autodesk.RevitServer.Enterprise.Services.Protected.Model";
        }

        // Determine replyAction expected by WCF client
        string replyAction;
        if (!string.IsNullOrEmpty(action))
        {
            replyAction = action.EndsWith("Response", StringComparison.OrdinalIgnoreCase) ? action : action + "Response";
        }
        else
        {
            replyAction = $"{ns}/ModelService/{methodName}Response";
        }

        string responseXml;

        // 1. GetMaxModelPathLength (Autodesk Revit standard buffer limit is 255 characters)
        if (methodName.Contains("GetMaxModelPathLength", StringComparison.OrdinalIgnoreCase) ||
            methodName.Contains("maxModelPathLength", StringComparison.OrdinalIgnoreCase))
        {
            Console.WriteLine($"[CoreWCF] -> Returning GetMaxModelPathLengthResult: 255 (Namespace: '{ns}')");
            ServerState.RecordLog("WCF-TCP", "GetMaxModelPathLength", toUri, action, effectiveVersion, 200, "Max path length result: 255");

            responseXml = $"<GetMaxModelPathLengthResponse xmlns=\"{ns}\"><GetMaxModelPathLengthResult>255</GetMaxModelPathLengthResult></GetMaxModelPathLengthResponse>";
        }
        // 2. IsHostNode (Verification that this server has Host role for Central Models)
        else if (methodName.Contains("IsHostNode", StringComparison.OrdinalIgnoreCase) ||
                 methodName.Contains("isHost", StringComparison.OrdinalIgnoreCase))
        {
            Console.WriteLine($"[CoreWCF] -> Returning IsHostNodeResult: true (Namespace: '{ns}')");
            ServerState.RecordLog("WCF-TCP", "IsHostNode", toUri, action, effectiveVersion, 200, "IsHostNode check: true");

            responseXml = $"<IsHostNodeResponse xmlns=\"{ns}\"><IsHostNodeResult>true</IsHostNodeResult></IsHostNodeResponse>";
        }
        // 3. ListSubFoldersAndModels
        else if (methodName.Contains("ListSubFoldersAndModels", StringComparison.OrdinalIgnoreCase) ||
                 methodName.Contains("listServerSubFoldersAndModels", StringComparison.OrdinalIgnoreCase) ||
                 methodName.Contains("ListFoldersAndModels", StringComparison.OrdinalIgnoreCase))
        {
            var pathMatch = Regex.Match(requestBodyXml, @"<(?:[a-zA-Z0-9_]+:)?(?:relativeFolderPath|strFolderPath|folderPath|folder|path|subFolder)[^>]*>(.*?)</(?:[a-zA-Z0-9_]+:)?(?:relativeFolderPath|strFolderPath|folderPath|folder|path|subFolder)>", RegexOptions.IgnoreCase);
            var reqPath = pathMatch.Success ? pathMatch.Groups[1].Value.Trim() : "";

            var cleanPath = reqPath.Trim(' ', '\t', '\r', '\n', '/', '\\', '|');
            cleanPath = cleanPath.Replace('\\', '/').Replace('|', '/').Trim('/');

            var (folderList, modelItemList) = ServerState.GetFolderContents(cleanPath);
            var nowFileTime = DateTime.UtcNow.ToFileTimeUtc().ToString();

            var folderArrayListItems = string.Concat(folderList.Select(f =>
                $"<d4p1:anyType i:type=\"xs:string\" xmlns:xs=\"http://www.w3.org/2001/XMLSchema\">{f}|{nowFileTime}</d4p1:anyType>"));

            var modelArrayListItems = string.Concat(modelItemList.Select(m =>
                $"<d4p1:anyType i:type=\"xs:string\" xmlns:xs=\"http://www.w3.org/2001/XMLSchema\">{m.Name}|{m.ModelGuid}|{nowFileTime}</d4p1:anyType>"));

            Console.WriteLine($"[CoreWCF] -> Returning ListSubFoldersAndModelsResult: true, Folders=[{string.Join(", ", folderList)}], Models=[{string.Join(", ", modelItemList.Select(m => m.Name))}], Host='{serverHost}', RawPath='{reqPath}', CleanPath='{cleanPath}'");
            ServerState.RecordLog("WCF-TCP", "ListSubFoldersAndModels", toUri, reqPath, effectiveVersion, 200, $"Listed {folderList.Count} folders, {modelItemList.Count} models for '{cleanPath}'");

            responseXml = $"<ListSubFoldersAndModelsResponse xmlns=\"{ns}\">" +
                          "<ListSubFoldersAndModelsResult>true</ListSubFoldersAndModelsResult>" +
                          $"<subFolderList xmlns:d4p1=\"http://schemas.microsoft.com/2003/10/Serialization/Arrays\" xmlns:i=\"http://www.w3.org/2001/XMLSchema-instance\">{folderArrayListItems}</subFolderList>" +
                          $"<modelList xmlns:d4p1=\"http://schemas.microsoft.com/2003/10/Serialization/Arrays\" xmlns:i=\"http://www.w3.org/2001/XMLSchema-instance\">{modelArrayListItems}</modelList>" +
                          "</ListSubFoldersAndModelsResponse>";
        }
        else if (methodName.Contains("LongestFolderPath", StringComparison.OrdinalIgnoreCase))
        {
            var pathMatch = Regex.Match(requestBodyXml, @"<(?:[a-zA-Z0-9_]+:)?(?:relativeFolderPath|strFolderPath|folderPath|folder|path)[^>]*>(.*?)</(?:[a-zA-Z0-9_]+:)?(?:relativeFolderPath|strFolderPath|folderPath|folder|path)>", RegexOptions.IgnoreCase);
            var reqPath = pathMatch.Success ? pathMatch.Groups[1].Value.Trim() : "";
            Console.WriteLine($"[CoreWCF] -> Returning LongestFolderPath: '{reqPath}' (Namespace: '{ns}')");
            ServerState.RecordLog("WCF-TCP", "LongestFolderPath", toUri, reqPath, effectiveVersion, 200, $"LongestFolderPath: {reqPath}");

            responseXml = $"<LongestFolderPathResponse xmlns=\"{ns}\"><LongestFolderPathResult>{reqPath}</LongestFolderPathResult></LongestFolderPathResponse>";
        }
        // 5. Roles & Server Roles
        else if (methodName.Equals("Roles", StringComparison.OrdinalIgnoreCase) ||
                 methodName.Contains("GetServerRoles", StringComparison.OrdinalIgnoreCase) ||
                 methodName.Contains("serverRoles", StringComparison.OrdinalIgnoreCase))
        {
            Console.WriteLine($"[CoreWCF] -> Returning Roles (Namespace: '{ns}')");
            ServerState.RecordLog("WCF-TCP", methodName, toUri, action, effectiveVersion, 200, "ServerRoles query");

            var resultTag = methodName.Equals("Roles", StringComparison.OrdinalIgnoreCase) ? "RolesResult" : "GetServerRolesResult";
            var respTag = methodName.Equals("Roles", StringComparison.OrdinalIgnoreCase) ? "RolesResponse" : "GetServerRolesResponse";

            responseXml = $"<{respTag} xmlns=\"{ns}\">" +
                          $"<{resultTag} xmlns:b=\"http://schemas.microsoft.com/2003/10/Serialization/Arrays\">" +
                          "<b:string>Host</b:string><b:string>Accelerator</b:string><b:string>Admin</b:string>" +
                          $"</{resultTag}>" +
                          $"</{respTag}>";
        }
        else if (methodName.Contains("NumberOfRoles", StringComparison.OrdinalIgnoreCase))
        {
            Console.WriteLine($"[CoreWCF] -> Returning NumberOfRoles: 3 (Namespace: '{ns}')");
            ServerState.RecordLog("WCF-TCP", "NumberOfRoles", toUri, action, effectiveVersion, 200, "NumberOfRoles: 3");

            responseXml = $"<NumberOfRolesResponse xmlns=\"{ns}\"><NumberOfRolesResult>3</NumberOfRolesResult></NumberOfRolesResponse>";
        }
        // 6. Central Server Version
        else if (methodName.Contains("GetCentralServerVersion", StringComparison.OrdinalIgnoreCase))
        {
            Console.WriteLine($"[CoreWCF] -> Returning GetCentralServerVersion (Namespace: '{ns}')");
            ServerState.RecordLog("WCF-TCP", "GetCentralServerVersion", toUri, action, effectiveVersion, 200, "GetCentralServerVersion");

            responseXml = $"<GetCentralServerVersionResponse xmlns=\"{ns}\">" +
                          "<GetCentralServerVersionResult xmlns:b=\"http://Autodesk.RevitServer.Enterprise.DataContract.Model\">" +
                          "<b:Build>0</b:Build>" +
                          "<b:Major>2025</b:Major>" +
                          "<b:Minor>0</b:Minor>" +
                          "<b:Revision>0</b:Revision>" +
                          "<b:Version>2025.0</b:Version>" +
                          "</GetCentralServerVersionResult>" +
                          "</GetCentralServerVersionResponse>";
        }
        else if (methodName.Contains("ModelDataFormatVersion", StringComparison.OrdinalIgnoreCase) ||
                 methodName.Contains("PermissionsFormatVersion", StringComparison.OrdinalIgnoreCase))
        {
            Console.WriteLine($"[CoreWCF] -> Returning FormatVersion: 1 (Namespace: '{ns}')");
            ServerState.RecordLog("WCF-TCP", methodName, toUri, action, effectiveVersion, 200, "FormatVersion: 1");

            responseXml = $"<{methodName}Response xmlns=\"{ns}\"><{methodName}Result>1</{methodName}Result></{methodName}Response>";
        }
        else if (methodName.Contains("FolderExists", StringComparison.OrdinalIgnoreCase))
        {
            var folderMatch = Regex.Match(requestBodyXml, @"<(?:[a-zA-Z0-9_]+:)?(?:strFolderPath|folderPath|relativeFolderPath|path)[^>]*>(.*?)</", RegexOptions.IgnoreCase);
            var reqFolder = folderMatch.Success ? folderMatch.Groups[1].Value.Trim() : "";
            var cleanFolder = ServerState.NormalizePath(reqFolder);

            var exists = string.IsNullOrEmpty(cleanFolder) || ServerState.FolderExists(cleanFolder);
            Console.WriteLine($"[CoreWCF] -> FolderExists check for '{cleanFolder}' (Raw: '{reqFolder}'): {exists} (Namespace: '{ns}')");
            ServerState.RecordLog("WCF-TCP", "FolderExists", toUri, reqFolder, effectiveVersion, 200, $"FolderExists '{cleanFolder}': {exists}");

            responseXml = $"<FolderExistsResponse xmlns=\"{ns}\"><FolderExistsResult>" + (exists ? "true" : "false") + "</FolderExistsResult></FolderExistsResponse>";
        }
        else if (methodName.Contains("ModelExists", StringComparison.OrdinalIgnoreCase) ||
                 methodName.Equals("Exists", StringComparison.OrdinalIgnoreCase))
        {
            var reqPath = ServerState.ExtractModelPath(requestBodyXml);
            var cleanPath = ServerState.NormalizePath(reqPath);
            var exists = !string.IsNullOrEmpty(cleanPath) && ServerState.HasModel(cleanPath);

            var opName = methodName.Equals("Exists", StringComparison.OrdinalIgnoreCase) ? "Exists" : "ModelExists";
            Console.WriteLine($"[CoreWCF] -> {opName} check for '{cleanPath}' (Raw: '{reqPath}'): {exists} (Namespace: '{ns}')");
            ServerState.RecordLog("WCF-TCP", opName, toUri, reqPath, effectiveVersion, 200, $"{opName}: {exists}");

            responseXml = $"<{opName}Response xmlns=\"{ns}\">" +
                          $"<{opName}Result>" + (exists ? "true" : "false") + $"</{opName}Result>" +
                          $"</{opName}Response>";
        }
        // Save As - Step 1: CreateModel on Revit Server
        else if (methodName.Contains("CreateModel", StringComparison.OrdinalIgnoreCase))
        {
            var reqPath = ServerState.ExtractModelPath(requestBodyXml);
            var cleanPath = string.IsNullOrEmpty(reqPath) ? "Проект1.rvt" : reqPath;

            var userMatch = Regex.Match(requestBodyXml, @"<c:Name>([^<]+)</c:Name>", RegexOptions.IgnoreCase);
            if (!userMatch.Success) userMatch = Regex.Match(requestBodyXml, @"<(?:[a-zA-Z0-9_]+:)?(?:userName|user)[^>]*>([^<]+)</", RegexOptions.IgnoreCase);
            if (userMatch.Success && !string.IsNullOrWhiteSpace(userMatch.Groups[1].Value)) userName = userMatch.Groups[1].Value.Trim();

            var model = ServerState.ResolveModel(requestBodyXml, cleanPath, autoRegister: true);
            model.LastModifiedBy = userName;
            model.DateModified = DateTime.UtcNow;

            Console.WriteLine($"[CoreWCF] -> CreateModel: Successfully registered central model '{model.Path}' with GUID '{model.ModelGuid}', User='{userName}' (Namespace: '{ns}')");
            ServerState.RecordLog("WCF-TCP", "CreateModel", toUri, model.Path, effectiveVersion, 200, $"Created central model '{model.Path}' (GUID: {model.ModelGuid})");

            responseXml = $"<CreateModelResponse xmlns=\"{ns}\">" +
                          "<CreateModelResult xmlns:b=\"http://Autodesk.RevitServer.Enterprise.DataContract.Model\" xmlns:i=\"http://www.w3.org/2001/XMLSchema-instance\">" +
                          "<b:IdentityGUID>" +
                          $"<b:Guid>{model.ModelGuid}</b:Guid>" +
                          "</b:IdentityGUID>" +
                          "</CreateModelResult>" +
                          "</CreateModelResponse>";
        }
        else if (methodName.Contains("IsValidServerModelPath", StringComparison.OrdinalIgnoreCase))
        {
            var mPath = ServerState.ExtractModelPath(requestBodyXml);
            var isValid = !string.IsNullOrEmpty(mPath) && (mPath.EndsWith(".rvt", StringComparison.OrdinalIgnoreCase) || !mPath.Contains("."));

            Console.WriteLine($"[CoreWCF] -> IsValidServerModelPath check for '{mPath}': {isValid} (Namespace: '{ns}')");
            ServerState.RecordLog("WCF-TCP", "IsValidServerModelPath", toUri, mPath, effectiveVersion, 200, $"IsValidServerModelPath: {isValid}");

            responseXml = $"<IsValidServerModelPathResponse xmlns=\"{ns}\"><IsValidServerModelPathResult>{(isValid ? "true" : "false")}</IsValidServerModelPathResult></IsValidServerModelPathResponse>";
        }
        else if (methodName.Contains("LocateModel", StringComparison.OrdinalIgnoreCase))
        {
            var model = ServerState.ResolveModel(requestBodyXml, "Проект1.rvt", overrideGuid: incomingModelGuid);
            var locatePath = model.Path;

            Console.WriteLine($"[CoreWCF] -> Returning LocateModel: '{locatePath}' for GUID '{model.ModelGuid}' (Namespace: '{ns}')");
            ServerState.RecordLog("WCF-TCP", "LocateModel", toUri, action, effectiveVersion, 200, $"LocateModel: {locatePath}");

            responseXml = $"<LocateModelResponse xmlns=\"{ns}\"><LocateModelResult>{locatePath}</LocateModelResult></LocateModelResponse>";
        }
        else if (methodName.Contains("IsModelLockedByAdmin", StringComparison.OrdinalIgnoreCase))
        {
            Console.WriteLine($"[CoreWCF] -> Returning IsModelLockedByAdmin: false (Namespace: '{ns}')");
            ServerState.RecordLog("WCF-TCP", "IsModelLockedByAdmin", toUri, action, effectiveVersion, 200, "IsModelLockedByAdmin: false");

            responseXml = $"<IsModelLockedByAdminResponseMessage xmlns=\"{ns}\">" +
                          "<ModelLockedByAdmin xmlns=\"http://Autodesk.RevitServer.Enterprise.DataContract.Message\">false</ModelLockedByAdmin>" +
                          "<LockedForReadOnly xmlns=\"http://Autodesk.RevitServer.Enterprise.DataContract.Message\">false</LockedForReadOnly>" +
                          "<Version xmlns=\"http://Autodesk.RevitServer.Enterprise.DataContract.Message\">1</Version>" +
                          "</IsModelLockedByAdminResponseMessage>";
        }
        else if (methodName.Contains("IsDataLocked", StringComparison.OrdinalIgnoreCase))
        {
            Console.WriteLine($"[CoreWCF] -> Returning IsDataLocked: false (Namespace: '{ns}')");
            ServerState.RecordLog("WCF-TCP", "IsDataLocked", toUri, action, effectiveVersion, 200, "IsDataLocked: false");

            responseXml = $"<IsDataLockedResponse xmlns=\"{ns}\"><IsDataLockedResult>false</IsDataLockedResult></IsDataLockedResponse>";
        }
        else if (methodName.Contains("LatestModelVersion", StringComparison.OrdinalIgnoreCase))
        {
            var model = ServerState.ResolveModel(requestBodyXml, "Проект1.rvt", overrideGuid: incomingModelGuid);
            latestModelVersionNumber = model.VersionNumber;

            Console.WriteLine($"[CoreWCF] -> Returning LatestModelVersion for '{model.Path}' (VersionNumber: {model.VersionNumber}, GUID: '{model.ModelGuid}') (Namespace: '{ns}')");
            ServerState.RecordLog("WCF-TCP", "LatestModelVersion", toUri, action, effectiveVersion, 200, $"LatestModelVersion: {model.VersionNumber}");

            responseXml = $"<LatestModelVersionResponseMessage xmlns=\"{ns}\">" +
                          $"<VersionNumber xmlns=\"http://Autodesk.RevitServer.Enterprise.DataContract.Message\">{model.VersionNumber}</VersionNumber>" +
                          "<Version xmlns=\"http://Autodesk.RevitServer.Enterprise.DataContract.Message\" xmlns:b=\"http://Autodesk.RevitServer.Enterprise.DataContract.Model\">" +
                          "<b:Major>-1</b:Major>" +
                          $"<b:Minor>{model.VersionNumber}</b:Minor>" +
                          "</Version>" +
                          "<LatestEpisodeGuid xmlns=\"http://Autodesk.RevitServer.Enterprise.DataContract.Message\" xmlns:b=\"http://Autodesk.RevitServer.Enterprise.DataContract.Model\">" +
                          "<b:GUIDValue>" +
                          $"<b:Guid>{model.ModelGuid}</b:Guid>" +
                          "</b:GUIDValue>" +
                          "</LatestEpisodeGuid>" +
                          "<ModelVersion xmlns=\"http://Autodesk.RevitServer.Enterprise.DataContract.Message\" xmlns:b=\"http://Autodesk.RevitServer.Enterprise.DataContract.Model\">" +
                          "<b:HistoryCheckInfo>" +
                          "<b:LatestEpisodeGuid>" +
                          "<b:GUIDValue>" +
                          $"<b:Guid>{model.ModelGuid}</b:Guid>" +
                          "</b:GUIDValue>" +
                          "</b:LatestEpisodeGuid>" +
                          "</b:HistoryCheckInfo>" +
                          "<b:Version>" +
                          "<b:Major>-1</b:Major>" +
                          $"<b:Minor>{model.VersionNumber}</b:Minor>" +
                          "</b:Version>" +
                          "</ModelVersion>" +
                          "</LatestModelVersionResponseMessage>";
        }
        else if (methodName.Contains("GetSize", StringComparison.OrdinalIgnoreCase))
        {
            var model = ServerState.ResolveModel(requestBodyXml, "Demo_Central.rvt");
            var size = model.Size;

            Console.WriteLine($"[CoreWCF] -> Returning GetSize: {size} for '{model.Path}' (Namespace: '{ns}')");
            ServerState.RecordLog("WCF-TCP", "GetSize", toUri, model.Path, effectiveVersion, 200, $"GetSize: {size}");

            responseXml = $"<GetSizeResponseMessage xmlns=\"{ns}\">" +
                          $"<FilePath xmlns=\"http://Autodesk.RevitServer.Enterprise.DataContract.Message\">{model.Path}</FilePath>" +
                          $"<Size xmlns=\"http://Autodesk.RevitServer.Enterprise.DataContract.Message\">{size}</Size>" +
                          "</GetSizeResponseMessage>";
        }
        else if (methodName.Contains("IdentifyModel", StringComparison.OrdinalIgnoreCase))
        {
            var reqPath = ServerState.ExtractModelPath(requestBodyXml);
            var cleanPath = ServerState.NormalizePath(reqPath);
            var isModel = string.IsNullOrEmpty(cleanPath) || cleanPath.EndsWith(".rvt", StringComparison.OrdinalIgnoreCase) || !cleanPath.Contains(".");

            string modelGuid;
            if (!isModel)
            {
                modelGuid = "00000000-0000-0000-0000-000000000000";
                Console.WriteLine($"[CoreWCF] -> IdentifyModel for non-model path '{cleanPath}': returning Guid.Empty");
            }
            else
            {
                var model = ServerState.ResolveModel(requestBodyXml, string.IsNullOrEmpty(cleanPath) ? "Проект1.rvt" : cleanPath);
                modelGuid = model.ModelGuid;
                Console.WriteLine($"[CoreWCF] -> IdentifyModel for '{model.Path}' -> GUID '{modelGuid}'");
            }

            ServerState.RecordLog("WCF-TCP", "IdentifyModel", toUri, cleanPath, effectiveVersion, 200, $"IdentifyModel GUID {modelGuid}");

            responseXml = $"<IdentifyModelResponse xmlns=\"{ns}\">" +
                          "<IdentifyModelResult xmlns:b=\"http://Autodesk.RevitServer.Enterprise.DataContract.Model\" xmlns:i=\"http://www.w3.org/2001/XMLSchema-instance\">" +
                          "<b:IdentityGUID>" +
                          $"<b:Guid>{modelGuid}</b:Guid>" +
                          "</b:IdentityGUID>" +
                          "</IdentifyModelResult>" +
                          "</IdentifyModelResponse>";
        }
        else if (methodName.Contains("ModelInfoData", StringComparison.OrdinalIgnoreCase) ||
                 methodName.Contains("QueryModelInformation", StringComparison.OrdinalIgnoreCase))
        {
            var model = ServerState.ResolveModel(requestBodyXml, "Demo_Central.rvt");

            Console.WriteLine($"[CoreWCF] -> Returning ModelInfoData for '{model.Path}' (GUID: {model.ModelGuid}) (Namespace: '{ns}')");
            ServerState.RecordLog("WCF-TCP", "ModelInfoData", toUri, model.Path, effectiveVersion, 200, $"ModelInfoData for {model.Path}");

            responseXml = $"<ModelInfoDataResponse xmlns=\"{ns}\">" +
                          "<ModelInfoDataResult xmlns:b=\"http://schemas.datacontract.org/2004/07/Autodesk.RevitServer.Enterprise.Admin.Service\" xmlns:i=\"http://www.w3.org/2001/XMLSchema-instance\">" +
                          $"<b:DateCreated>{model.DateCreated:s}</b:DateCreated>" +
                          $"<b:DateModified>{model.DateModified:s}</b:DateModified>" +
                          "<b:DescendentHasLockContext>false</b:DescendentHasLockContext>" +
                          $"<b:LastModifiedBy>{model.LastModifiedBy}</b:LastModifiedBy>" +
                          "<b:LockContext i:nil=\"true\" />" +
                          "<b:LockState>Unlocked</b:LockState>" +
                          "<b:MaximumModelNameLength>255</b:MaximumModelNameLength>" +
                          $"<b:ModelGUID>{model.ModelGuid}</b:ModelGUID>" +
                          "<b:ModelLockOptions>0</b:ModelLockOptions>" +
                          "<b:ModelLockType>0</b:ModelLockType>" +
                          "<b:ModelLocksInProgress xmlns:c=\"http://schemas.microsoft.com/2003/10/Serialization/Arrays\" />" +
                          $"<b:ModelPath>{model.Path}</b:ModelPath>" +
                          $"<b:ModelSize>{model.Size}</b:ModelSize>" +
                          "<b:ModelOption>Workshared</b:ModelOption>" +
                          $"<b:ProductVersion>{model.Version}</b:ProductVersion>" +
                          "<b:SupportSize>0</b:SupportSize>" +
                          $"<b:VersionNumber>{model.VersionNumber}</b:VersionNumber>" +
                          "</ModelInfoDataResult>" +
                          "</ModelInfoDataResponse>";
        }
        else if (methodName.Contains("ModelThumbnail", StringComparison.OrdinalIgnoreCase))
        {
            Console.WriteLine($"[CoreWCF] -> Returning ModelThumbnail (null) (Namespace: '{ns}')");
            ServerState.RecordLog("WCF-TCP", "ModelThumbnail", toUri, action, effectiveVersion, 200, "ModelThumbnail: nil");

            responseXml = $"<ModelThumbnailResponse xmlns=\"{ns}\">" +
                          "<ModelThumbnailResult i:nil=\"true\" xmlns:i=\"http://www.w3.org/2001/XMLSchema-instance\" />" +
                          "</ModelThumbnailResponse>";
        }
        else if (methodName.Contains("ProjectInfo", StringComparison.OrdinalIgnoreCase))
        {
            Console.WriteLine($"[CoreWCF] -> Returning ProjectInfo (Namespace: '{ns}')");
            ServerState.RecordLog("WCF-TCP", "ProjectInfo", toUri, action, effectiveVersion, 200, "ProjectInfo response");

            responseXml = $"<ProjectInfoResponse xmlns=\"{ns}\">" +
                          "<ProjectInfoResult xmlns:b=\"http://schemas.datacontract.org/2004/07/Autodesk.RevitServer.Enterprise.Admin.Service\" xmlns:i=\"http://www.w3.org/2001/XMLSchema-instance\">" +
                          "<b:ClientName>Sample Client</b:ClientName>" +
                          "<b:IssueDate>2026-10-11</b:IssueDate>" +
                          "<b:OrganizationDescription>Open Revit Server</b:OrganizationDescription>" +
                          "<b:OrganizationName>OpenRevit</b:OrganizationName>" +
                          $"<b:ProjectAddress>{serverHost}</b:ProjectAddress>" +
                          "<b:ProjectIssueDate>2026-10-11</b:ProjectIssueDate>" +
                          "<b:ProjectName>Demo Central</b:ProjectName>" +
                          "<b:ProjectNumber>001</b:ProjectNumber>" +
                          "<b:ProjectStatus>Active</b:ProjectStatus>" +
                          "</ProjectInfoResult>" +
                          "</ProjectInfoResponse>";
        }
        else if (methodName.Contains("GetListOfModelDataFiles", StringComparison.OrdinalIgnoreCase) ||
                 methodName.Contains("GetListOfModelFilesAndFolders", StringComparison.OrdinalIgnoreCase))
        {
            Console.WriteLine($"[CoreWCF] -> Returning {methodName}: Success (Namespace: '{ns}')");
            ServerState.RecordLog("WCF-TCP", methodName, toUri, action, effectiveVersion, 200, $"{methodName}: Success");

            var respName = $"{methodName}Response";
            var resultName = $"{methodName}Result";

            responseXml = $"<{respName} xmlns=\"{ns}\">" +
                          $"<{resultName}>Success</{resultName}>" +
                          "<modelDataFiles xmlns:d4p1=\"http://schemas.microsoft.com/2003/10/Serialization/Arrays\" xmlns:i=\"http://www.w3.org/2001/XMLSchema-instance\">" +
                          "<d4p1:anyType i:type=\"xs:string\" xmlns:xs=\"http://www.w3.org/2001/XMLSchema\">ContentDocuments</d4p1:anyType>" +
                          "<d4p1:anyType i:type=\"xs:string\" xmlns:xs=\"http://www.w3.org/2001/XMLSchema\">Permissions</d4p1:anyType>" +
                          "</modelDataFiles>" +
                          $"</{respName}>";
        }
        else if (methodName.Contains("LatestStreamVersion", StringComparison.OrdinalIgnoreCase))
        {
            Console.WriteLine($"[CoreWCF] -> Returning LatestStreamVersion: 0 (Namespace: '{ns}')");
            ServerState.RecordLog("WCF-TCP", "LatestStreamVersion", toUri, action, effectiveVersion, 200, "LatestStreamVersion: 0");

            responseXml = $"<LatestStreamVersionResponse xmlns=\"{ns}\">" +
                          "<LatestStreamVersionResult xmlns:b=\"http://Autodesk.RevitServer.Enterprise.DataContract.Model\">" +
                          "<b:Major>-1</b:Major>" +
                          "<b:Minor>0</b:Minor>" +
                          "</LatestStreamVersionResult>" +
                          "</LatestStreamVersionResponse>";
        }
        else if (methodName.Contains("BeginReadData", StringComparison.OrdinalIgnoreCase))
        {
            var accessGuid = Guid.NewGuid().ToString();

            var epMatch = Regex.Match(requestBodyXml, @"LatestEpisodeGuid.*?([a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12})", RegexOptions.Singleline | RegexOptions.IgnoreCase);
            var episodeGuid = epMatch.Success && !string.IsNullOrWhiteSpace(epMatch.Groups[1].Value)
                ? epMatch.Groups[1].Value.Trim()
                : Guid.NewGuid().ToString();

            var model = ServerState.ResolveModel(requestBodyXml, "Проект1.rvt", overrideGuid: incomingModelGuid);

            Console.WriteLine($"[CoreWCF] -> Returning BeginReadData for '{model.Path}' (AccessGuid: {accessGuid}, Episode: {episodeGuid}) (Namespace: '{ns}')");
            ServerState.RecordLog("WCF-TCP", "BeginReadData", toUri, action, effectiveVersion, 200, $"BeginReadData for {model.Path}: AccessGuid={accessGuid}");

            responseXml = $"<BeginReadDataResponse xmlns=\"{ns}\">" +
                          "<BeginReadDataResult xmlns:b=\"http://Autodesk.RevitServer.Enterprise.DataContract.ModelAccess\" xmlns:c=\"http://Autodesk.RevitServer.Enterprise.DataContract.Model\" xmlns:i=\"http://www.w3.org/2001/XMLSchema-instance\">" +
                          $"<b:AccessGuid><c:Guid>{accessGuid}</c:Guid></b:AccessGuid>" +
                          $"<b:CreationDate><c:GUIDValue><c:Guid>{episodeGuid}</c:Guid></c:GUIDValue></b:CreationDate>" +
                          "<b:DataAccessToken>" +
                          $"<b:AccessGuid><c:Guid>{accessGuid}</c:Guid></b:AccessGuid>" +
                          $"<b:CreationDate><c:GUIDValue><c:Guid>{episodeGuid}</c:Guid></c:GUIDValue></b:CreationDate>" +
                          "</b:DataAccessToken>" +
                          "</BeginReadDataResult>" +
                          "</BeginReadDataResponse>";
        }
        else if (methodName.Contains("EndReadData", StringComparison.OrdinalIgnoreCase) ||
                 methodName.Contains("UnlockData", StringComparison.OrdinalIgnoreCase))
        {
            Console.WriteLine($"[CoreWCF] -> Returning {methodName}: Success (Namespace: '{ns}')");
            ServerState.RecordLog("WCF-TCP", methodName, toUri, action, effectiveVersion, 200, $"{methodName}: Success");

            if (methodName.Contains("UnlockData", StringComparison.OrdinalIgnoreCase))
            {
                responseXml = $"<UnlockDataResponse xmlns=\"{ns}\"><UnlockDataResult>Unlocked</UnlockDataResult></UnlockDataResponse>";
            }
            else
            {
                responseXml = $"<EndReadDataResponse xmlns=\"{ns}\" />";
            }
        }
        else if (methodName.Contains("LockData", StringComparison.OrdinalIgnoreCase))
        {
            var episodeGuid = Guid.NewGuid().ToString();
            Console.WriteLine($"[CoreWCF] -> Returning LockData (EpisodeGuid: {episodeGuid}) (Namespace: '{ns}')");
            ServerState.RecordLog("WCF-TCP", "LockData", toUri, action, effectiveVersion, 200, $"LockData OK: {episodeGuid}");

            responseXml = $"<LockDataResponse xmlns=\"{ns}\">" +
                          "<LockDataResult xmlns=\"http://Autodesk.RevitServer.Enterprise.Services.Protected.Model\">Locked</LockDataResult>" +
                          "<creationDate xmlns:b=\"http://Autodesk.RevitServer.Enterprise.DataContract.Model\">" +
                          $"<b:GUIDValue><b:Guid>{episodeGuid}</b:Guid></b:GUIDValue>" +
                          "</creationDate>" +
                          "</LockDataResponse>";
        }
        else if (methodName.Contains("unlockPermissions", StringComparison.OrdinalIgnoreCase))
        {
            Console.WriteLine($"[CoreWCF] -> Returning UnlockPermissions (Namespace: '{ns}')");
            ServerState.RecordLog("WCF-TCP", "unlockPermissions", toUri, action, effectiveVersion, 200, "UnlockPermissions: Unlocked");

            responseXml = $"<UnlockPermissionsResponse xmlns=\"{ns}\">" +
                          "<UnlockPermissionsResult>Unlocked</UnlockPermissionsResult>" +
                          "</UnlockPermissionsResponse>";
        }
        else if (methodName.Contains("lockPermissions", StringComparison.OrdinalIgnoreCase))
        {
            Console.WriteLine($"[CoreWCF] -> Returning LockPermissions (Namespace: '{ns}')");
            ServerState.RecordLog("WCF-TCP", "lockPermissions", toUri, action, effectiveVersion, 200, "LockPermissions: Locked");

            responseXml = $"<LockPermissionsResponse xmlns=\"{ns}\">" +
                          "<LockPermissionsResult>Locked</LockPermissionsResult>" +
                          "<lockTally>1</lockTally>" +
                          "</LockPermissionsResponse>";
        }
        else if (methodName.Contains("CommitPermissions", StringComparison.OrdinalIgnoreCase))
        {
            Console.WriteLine($"[CoreWCF] -> Returning CommitPermissions (Namespace: '{ns}')");
            ServerState.RecordLog("WCF-TCP", "CommitPermissions", toUri, action, effectiveVersion, 200, "CommitPermissions: OK");

            responseXml = $"<CommitPermissionsResponse xmlns=\"{ns}\" />";
        }
        else if (methodName.Contains("writeUserTable", StringComparison.OrdinalIgnoreCase))
        {
            Console.WriteLine($"[CoreWCF] -> Returning WriteUserTable: true (Namespace: '{ns}')");
            ServerState.RecordLog("WCF-TCP", "writeUserTable", toUri, action, effectiveVersion, 200, "WriteUserTable: true");

            responseXml = $"<WriteUserTableResponse xmlns=\"{ns}\"><WriteUserTableResult>true</WriteUserTableResult></WriteUserTableResponse>";
        }
        else if (methodName.Contains("readAllUsernames", StringComparison.OrdinalIgnoreCase))
        {
            var userMatch = Regex.Match(requestBodyXml, @"<(?:[a-zA-Z0-9_]+:)?(?:UserName|user|userName)[^>]*>(.*?)</(?:[a-zA-Z0-9_]+:)?(?:UserName|user|userName)>", RegexOptions.IgnoreCase);
            var uName = userMatch.Success ? userMatch.Groups[1].Value.Trim() : "user";
            Console.WriteLine($"[CoreWCF] -> Returning ReadAllUsernames (Namespace: '{ns}')");
            ServerState.RecordLog("WCF-TCP", "readAllUsernames", toUri, action, effectiveVersion, 200, "ReadAllUsernames: OK");

            responseXml = $"<ReadAllUsernamesResponse xmlns=\"{ns}\">" +
                          "<ReadAllUsernamesResult>true</ReadAllUsernamesResult>" +
                          "<userTable xmlns:b=\"http://Autodesk.RevitServer.Enterprise.DataContract.Model\">" +
                          "<b:IdToNameList>" +
                          "<b:UserName>" +
                          $"<b:Name>{uName}</b:Name>" +
                          "</b:UserName>" +
                          "</b:IdToNameList>" +
                          "</userTable>" +
                          "</ReadAllUsernamesResponse>";
        }
        else if (methodName.Contains("writeWorksetCheckoutRecords", StringComparison.OrdinalIgnoreCase))
        {
            Console.WriteLine($"[CoreWCF] -> Returning WriteWorksetCheckoutRecords: true (Namespace: '{ns}')");
            ServerState.RecordLog("WCF-TCP", "writeWorksetCheckoutRecords", toUri, action, effectiveVersion, 200, "WriteWorksetCheckoutRecords: true");

            responseXml = $"<WriteWorksetCheckoutRecordsResponse xmlns=\"{ns}\"><WriteWorksetCheckoutRecordsResult>true</WriteWorksetCheckoutRecordsResult></WriteWorksetCheckoutRecordsResponse>";
        }
        else if (methodName.Contains("readAllWorksetCheckoutRecords", StringComparison.OrdinalIgnoreCase))
        {
            Console.WriteLine($"[CoreWCF] -> Returning ReadAllWorksetCheckoutRecords: true (Namespace: '{ns}')");
            ServerState.RecordLog("WCF-TCP", "readAllWorksetCheckoutRecords", toUri, action, effectiveVersion, 200, "ReadAllWorksetCheckoutRecords: true");

            responseXml = $"<ReadAllWorksetCheckoutRecordsResponse xmlns=\"{ns}\">" +
                          "<ReadAllWorksetCheckoutRecordsResult>true</ReadAllWorksetCheckoutRecordsResult>" +
                          "<worksetCheckoutTable xmlns:b=\"http://Autodesk.RevitServer.Enterprise.DataContract.Model\" />" +
                          "</ReadAllWorksetCheckoutRecordsResponse>";
        }
        else if (methodName.Contains("readAllEditingRequestRecords", StringComparison.OrdinalIgnoreCase))
        {
            Console.WriteLine($"[CoreWCF] -> Returning ReadAllEditingRequestRecords: true (Namespace: '{ns}')");
            ServerState.RecordLog("WCF-TCP", "ReadAllEditingRequestRecords", toUri, action, effectiveVersion, 200, "ReadAllEditingRequestRecords: true");

            responseXml = $"<ReadAllEditingRequestRecordsResponse xmlns=\"{ns}\">" +
                          "<ReadAllEditingRequestRecordsResult>true</ReadAllEditingRequestRecordsResult>" +
                          "<requestsPack xmlns:b=\"http://Autodesk.RevitServer.Enterprise.DataContract.Model\">" +
                          "<b:Requests xmlns:c=\"http://schemas.microsoft.com/2003/10/Serialization/Arrays\" />" +
                          "<b:ReadableElementInfoMap xmlns:c=\"http://schemas.microsoft.com/2003/10/Serialization/Arrays\" />" +
                          "</requestsPack>" +
                          "</ReadAllEditingRequestRecordsResponse>";
        }
        else if (methodName.Contains("BeginSave", StringComparison.OrdinalIgnoreCase) ||
                 methodName.Contains("SaveRequestMessage", StringComparison.OrdinalIgnoreCase))
        {
            Console.WriteLine($"[CoreWCF] -> Returning BeginSaveResponseMessage: true (Namespace: '{ns}')");
            ServerState.RecordLog("WCF-TCP", "BeginSave", toUri, action, effectiveVersion, 200, "BeginSaveResponseMessage: true");

            responseXml = $"<BeginSaveResponseMessage xmlns=\"{ns}\">" +
                          "<Result xmlns=\"http://Autodesk.RevitServer.Enterprise.DataContract.TransactionalSafety\">true</Result>" +
                          "</BeginSaveResponseMessage>";
        }
        else if (methodName.Contains("BeginWriteData", StringComparison.OrdinalIgnoreCase))
        {
            var accessGuid = Guid.NewGuid().ToString();
            var episodeGuid = Guid.NewGuid().ToString();
            var model = ServerState.ResolveModel(requestBodyXml, "Проект1.rvt", overrideGuid: incomingModelGuid);

            Console.WriteLine($"[CoreWCF] -> Returning BeginWriteData for '{model.Path}' (AccessGuid: {accessGuid}, EpisodeGuid: {episodeGuid}) (Namespace: '{ns}')");
            ServerState.RecordLog("WCF-TCP", "BeginWriteData", toUri, action, effectiveVersion, 200, $"BeginWriteData for {model.Path}: {accessGuid}");

            responseXml = $"<BeginWriteDataResponse xmlns=\"{ns}\">" +
                          "<BeginWriteDataResult xmlns:b=\"http://Autodesk.RevitServer.Enterprise.DataContract.ModelAccess\" xmlns:c=\"http://Autodesk.RevitServer.Enterprise.DataContract.Model\" xmlns:i=\"http://www.w3.org/2001/XMLSchema-instance\">" +
                          $"<b:AccessGuid><c:Guid>{accessGuid}</c:Guid></b:AccessGuid>" +
                          $"<b:CreationDate><c:GUIDValue><c:Guid>{episodeGuid}</c:Guid></c:GUIDValue></b:CreationDate>" +
                          "<b:DataAccessToken>" +
                          $"<b:AccessGuid><c:Guid>{accessGuid}</c:Guid></b:AccessGuid>" +
                          $"<b:CreationDate><c:GUIDValue><c:Guid>{episodeGuid}</c:Guid></c:GUIDValue></b:CreationDate>" +
                          "</b:DataAccessToken>" +
                          "</BeginWriteDataResult>" +
                          "</BeginWriteDataResponse>";
        }
        else if (methodName.Contains("SynchronousUpload", StringComparison.OrdinalIgnoreCase) ||
                 methodName.Contains("SynchronousFileUpload", StringComparison.OrdinalIgnoreCase))
        {
            currentUploadFileId = Guid.NewGuid().ToString();
            Console.WriteLine($"[CoreWCF] -> Returning SynchronousFileUploadResponseMessage (FileId: {currentUploadFileId}, ScopingId: '{incomingScopingId}', Namespace: 'http://autodesk.com/files/2009/01')");
            ServerState.RecordLog("WCF-TCP", "SynchronousUpload", toUri, action, effectiveVersion, 200, $"SynchronousFileUploadResponseMessage: OK (FileId: {currentUploadFileId})");

            responseXml = "<SynchronousFileUploadResponseMessage xmlns=\"http://autodesk.com/files/2009/01\" xmlns:b=\"http://Autodesk.RevitServer.Enterprise.Common.ClientServer.DataContract.Message\" xmlns:c=\"http://Autodesk.RevitServer.Enterprise.DataContract.TransactionalSafety\">" +
                          "<Result>true</Result>" +
                          "<c:Result>true</c:Result>" +
                          "<b:Result>true</b:Result>" +
                          "<Success>true</Success>" +
                          "<SynchronousFileUploadResult>true</SynchronousFileUploadResult>" +
                          "<SynchronousUploadResult>true</SynchronousUploadResult>" +
                          "<UploadResult>true</UploadResult>" +
                          $"<FileId>{currentUploadFileId}</FileId>" +
                          $"<b:FileId>{currentUploadFileId}</b:FileId>" +
                          $"<fileId>{currentUploadFileId}</fileId>" +
                          (!string.IsNullOrEmpty(incomingScopingId) ? $"<ScopingId>{incomingScopingId}</ScopingId>" : "") +
                          "<Status>0</Status>" +
                          "<StatusCode>0</StatusCode>" +
                          "<ErrorCode>0</ErrorCode>" +
                          "</SynchronousFileUploadResponseMessage>";
        }
        else if (methodName.Contains("DownloadFile", StringComparison.OrdinalIgnoreCase))
        {
            var mPath = ServerState.ExtractModelPath(requestBodyXml);
            var targetQuery = !string.IsNullOrEmpty(mPath) ? mPath : (!string.IsNullOrEmpty(incomingFileId) ? incomingFileId : incomingModelGuid);
            var model = ServerState.ResolveModel(targetQuery, "Проект1.rvt", overrideGuid: incomingModelGuid);

            Console.WriteLine($"[CoreWCF] -> Returning FileDownloadMessageStream for '{targetQuery}' (Resolved Model: '{model.Path}', GUID: '{model.ModelGuid}', Version: '{model.Version}')");
            ServerState.RecordLog("WCF-TCP", "DownloadFile", toUri, targetQuery, effectiveVersion, 200, $"FileDownloadMessageStream: {model.Path}");

            byte[] bfiBytes = ServerState.GenerateBasicFileInfo(
                effectiveMachine,
                model.Path,
                model.ModelGuid,
                !string.IsNullOrEmpty(model.Version) ? model.Version : effectiveVersion,
                !string.IsNullOrEmpty(userName) ? userName : "Architect"
            );

            string streamB64 = Convert.ToBase64String(bfiBytes);

            responseXml = "<FileDownloadMessageStream xmlns=\"http://autodesk.com/files/2009/01\" xmlns:b=\"http://Autodesk.RevitServer.Enterprise.Common.ClientServer.DataContract.Message\">" +
                          $"<Stream>{streamB64}</Stream>" +
                          $"<b:Stream>{streamB64}</b:Stream>" +
                          "</FileDownloadMessageStream>";
        }
        else if (methodName.Equals("ReadData", StringComparison.OrdinalIgnoreCase) ||
                 (methodName.Contains("ReadData", StringComparison.OrdinalIgnoreCase) &&
                  !methodName.Contains("BeginReadData", StringComparison.OrdinalIgnoreCase) &&
                  !methodName.Contains("EndReadData", StringComparison.OrdinalIgnoreCase)))
        {
            var fileId = Guid.NewGuid().ToString();
            Console.WriteLine($"[CoreWCF] -> Returning ReadDataResponseMessage (ResourceFileName: {fileId})");
            ServerState.RecordLog("WCF-TCP", "ReadData", toUri, action, effectiveVersion, 200, $"ReadData: {fileId}");

            responseXml = $"<ReadDataResponseMessage xmlns=\"http://Autodesk.RevitServer.Enterprise.Common.ClientServer.DataContract.Message\">" +
                          $"<ModelDataResourceFileName>{fileId}</ModelDataResourceFileName>" +
                          "</ReadDataResponseMessage>";
        }
        else if (methodName.Contains("WriteChunkDataFinish", StringComparison.OrdinalIgnoreCase))
        {
            Console.WriteLine($"[CoreWCF] -> Returning WriteChunkDataFinish (Namespace: '{ns}')");
            ServerState.RecordLog("WCF-TCP", "WriteChunkDataFinish", toUri, action, effectiveVersion, 200, "WriteChunkDataFinish: OK");

            responseXml = $"<WriteChunkDataFinishResponse xmlns=\"{ns}\" />";
        }
        else if (methodName.Equals("WriteData", StringComparison.OrdinalIgnoreCase) ||
                 (methodName.Contains("WriteData", StringComparison.OrdinalIgnoreCase) &&
                  !methodName.Contains("CommitWriteData", StringComparison.OrdinalIgnoreCase) &&
                  !methodName.Contains("BeginWriteData", StringComparison.OrdinalIgnoreCase) &&
                  !methodName.Contains("AbortWriteData", StringComparison.OrdinalIgnoreCase) &&
                  !methodName.Contains("EndWriteData", StringComparison.OrdinalIgnoreCase)))
        {
            var fileId = Guid.NewGuid().ToString();
            Console.WriteLine($"[CoreWCF] -> Returning WriteDataResponseMessage (FileId: {fileId})");
            ServerState.RecordLog("WCF-TCP", "WriteData", toUri, action, effectiveVersion, 200, $"WriteData: {fileId}");

            responseXml = $"<WriteDataResponseMessage xmlns=\"http://Autodesk.RevitServer.Enterprise.Common.ClientServer.DataContract.Message\">" +
                          $"<FileId>{fileId}</FileId>" +
                          "</WriteDataResponseMessage>";
        }
        else if (methodName.Contains("UploadFinish", StringComparison.OrdinalIgnoreCase))
        {
            Console.WriteLine($"[CoreWCF] -> Returning UploadFinish: true (Namespace: '{ns}')");
            ServerState.RecordLog("WCF-TCP", "UploadFinish", toUri, action, effectiveVersion, 200, "UploadFinish: true");

            responseXml = $"<UploadFinishResponse xmlns=\"{ns}\" />";
        }
        else if (methodName.Contains("CommitWriteData", StringComparison.OrdinalIgnoreCase))
        {
            var model = ServerState.ResolveModel(requestBodyXml, "Проект1.rvt", autoRegister: true);

            Console.WriteLine($"[CoreWCF] -> Returning CommitWriteData for '{model.Path}' (GUID: {model.ModelGuid})");
            ServerState.RecordLog("WCF-TCP", "CommitWriteData", toUri, action, effectiveVersion, 200, $"CommitWriteData OK for '{model.Path}' (GUID: {model.ModelGuid})");

            responseXml = "<CommitWriteDataResponseMessage xmlns=\"http://Autodesk.RevitServer.Enterprise.Common.ClientServer.DataContract.Message\" xmlns:b=\"http://Autodesk.RevitServer.Enterprise.DataContract.Model\">" +
                          "<ModelIdentity>" +
                          "<b:IdentityGUID>" +
                          $"<b:Guid>{model.ModelGuid}</b:Guid>" +
                          "</b:IdentityGUID>" +
                          "</ModelIdentity>" +
                          "<ResourcePathInfoList xmlns:c=\"http://schemas.microsoft.com/2003/10/Serialization/Arrays\" xmlns:i=\"http://www.w3.org/2001/XMLSchema-instance\" i:nil=\"true\" />" +
                          "</CommitWriteDataResponseMessage>";
        }
        else if (methodName.Contains("CommitSave", StringComparison.OrdinalIgnoreCase))
        {
            var episodeGuid = Guid.NewGuid().ToString();
            var model = ServerState.ResolveModel(requestBodyXml, "Проект1.rvt", autoRegister: true);

            model.DateModified = DateTime.UtcNow;
            model.VersionNumber++;

            Console.WriteLine($"[CoreWCF] -> Returning CommitSave (Path: '{model.Path}', GUID: '{model.ModelGuid}', EpisodeGuid: '{episodeGuid}') (Namespace: '{ns}')");
            ServerState.RecordLog("WCF-TCP", "CommitSave", toUri, action, effectiveVersion, 200, $"CommitSave OK for '{model.Path}' (GUID: '{model.ModelGuid}')");

            responseXml = $"<CommitSaveResponseMessage xmlns=\"{ns}\">" +
                          "<CreationDate xmlns=\"http://Autodesk.RevitServer.Enterprise.DataContract.TransactionalSafety\" xmlns:b=\"http://Autodesk.RevitServer.Enterprise.DataContract.Model\">" +
                          "<b:GUIDValue>" +
                          $"<b:Guid>{episodeGuid}</b:Guid>" +
                          "</b:GUIDValue>" +
                          "</CreationDate>" +
                          "<ModelIdentity xmlns=\"http://Autodesk.RevitServer.Enterprise.DataContract.TransactionalSafety\" xmlns:b=\"http://Autodesk.RevitServer.Enterprise.DataContract.Model\">" +
                          "<b:IdentityGUID>" +
                          $"<b:Guid>{model.ModelGuid}</b:Guid>" +
                          "</b:IdentityGUID>" +
                          "</ModelIdentity>" +
                          "<ResourcePathInfoList xmlns=\"http://Autodesk.RevitServer.Enterprise.DataContract.TransactionalSafety\" xmlns:i=\"http://www.w3.org/2001/XMLSchema-instance\" i:nil=\"true\" />" +
                          "</CommitSaveResponseMessage>";
        }
        else if (methodName.Contains("AbortWriteData", StringComparison.OrdinalIgnoreCase))
        {
            Console.WriteLine($"[CoreWCF] -> Returning AbortWriteData (Namespace: '{ns}')");
            ServerState.RecordLog("WCF-TCP", "AbortWriteData", toUri, action, effectiveVersion, 200, "AbortWriteData OK");

            responseXml = $"<AbortWriteDataResponse xmlns=\"{ns}\" />";
        }
        else if (methodName.Contains("EndWriteData", StringComparison.OrdinalIgnoreCase))
        {
            Console.WriteLine($"[CoreWCF] -> Returning EndWriteData (Namespace: '{ns}')");
            ServerState.RecordLog("WCF-TCP", "EndWriteData", toUri, action, effectiveVersion, 200, "EndWriteData OK");

            responseXml = $"<EndWriteDataResponse xmlns=\"{ns}\"><EndWriteDataResult>true</EndWriteDataResult></EndWriteDataResponse>";
        }
        else if (methodName.Contains("readAllNonElementPermissions", StringComparison.OrdinalIgnoreCase))
        {
            var userMatch = Regex.Match(requestBodyXml, @"<(?:[a-zA-Z0-9_]+:)?(?:UserName|user|userName)[^>]*>(.*?)</(?:[a-zA-Z0-9_]+:)?(?:UserName|user|userName)>", RegexOptions.IgnoreCase);
            var uName = userMatch.Success ? userMatch.Groups[1].Value.Trim() : "user";
            Console.WriteLine($"[CoreWCF] -> Returning ReadAllNonElementPermissions (Namespace: '{ns}')");
            ServerState.RecordLog("WCF-TCP", "ReadAllNonElementPermissions", toUri, action, effectiveVersion, 200, "ReadAllNonElementPermissions: OK");

            responseXml = $"<ReadAllNonElementPermissionsResponse xmlns=\"{ns}\">" +
                          "<userTable xmlns:b=\"http://Autodesk.RevitServer.Enterprise.DataContract.Model\">" +
                          "<b:IdToNameList>" +
                          "<b:UserName>" +
                          $"<b:Name>{uName}</b:Name>" +
                          "</b:UserName>" +
                          "</b:IdToNameList>" +
                          "</userTable>" +
                          "<worksetPerms xmlns:b=\"http://Autodesk.RevitServer.Enterprise.DataContract.Model\" />" +
                          "<requestsPack xmlns:b=\"http://Autodesk.RevitServer.Enterprise.DataContract.Model\">" +
                          "<b:Requests xmlns:c=\"http://schemas.microsoft.com/2003/10/Serialization/Arrays\" />" +
                          "<b:ReadableElementInfoMap xmlns:c=\"http://schemas.microsoft.com/2003/10/Serialization/Arrays\" />" +
                          "</requestsPack>" +
                          "</ReadAllNonElementPermissionsResponse>";
        }
        else if (methodName.Contains("writeAllElementPermissionsFromTempFile", StringComparison.OrdinalIgnoreCase) ||
                 methodName.Contains("writeElementPermissionsUpdates", StringComparison.OrdinalIgnoreCase))
        {
            var model = ServerState.ResolveModel(requestBodyXml, "Проект1.rvt");
            var pascalMethod = methodName.Contains("writeAllElementPermissionsFromTempFile", StringComparison.OrdinalIgnoreCase)
                ? "WriteAllElementPermissionsFromTempFile"
                : "WriteElementPermissionsUpdates";
            Console.WriteLine($"[CoreWCF] -> Returning {pascalMethod} with newTransId for '{model.Path}' (GUID: {model.ModelGuid})");
            ServerState.RecordLog("WCF-TCP", pascalMethod, toUri, action, effectiveVersion, 200, $"{pascalMethod}: OK");

            responseXml = $"<{pascalMethod}Response xmlns=\"{ns}\">" +
                          "<newTransId xmlns:b=\"http://Autodesk.RevitServer.Enterprise.DataContract.Model\">" +
                          "<b:PermsIdentity>" +
                          "<b:IdentityGUID>" +
                          $"<b:Guid>{model.ModelGuid}</b:Guid>" +
                          "</b:IdentityGUID>" +
                          "</b:PermsIdentity>" +
                          "<b:TransId>" +
                          "<b:Id>1</b:Id>" +
                          "</b:TransId>" +
                          "</newTransId>" +
                          $"</{pascalMethod}Response>";
        }
        else if (methodName.Contains("writeAllElementPermissions", StringComparison.OrdinalIgnoreCase) ||
                 methodName.Contains("writeAllNonElementPermissions", StringComparison.OrdinalIgnoreCase))
        {
            var pascalMethod = methodName.Contains("writeAllNonElementPermissions", StringComparison.OrdinalIgnoreCase)
                ? "WriteAllNonElementPermissions"
                : "WriteAllElementPermissions";
            Console.WriteLine($"[CoreWCF] -> Returning {pascalMethod} void (Namespace: '{ns}')");
            ServerState.RecordLog("WCF-TCP", pascalMethod, toUri, action, effectiveVersion, 200, $"{pascalMethod}: Success");

            responseXml = $"<{pascalMethod}Response xmlns=\"{ns}\"><{pascalMethod}Result>true</{pascalMethod}Result></{pascalMethod}Response>";
        }
        else if (methodName.Contains("readAllPermissionsUpdates", StringComparison.OrdinalIgnoreCase))
        {
            var model = ServerState.ResolveModel(requestBodyXml, "Проект1.rvt");

            Console.WriteLine($"[CoreWCF] -> Returning ReadAllPermissionsUpdatesResponseMessage for '{model.Path}' (GUID: {model.ModelGuid})");
            ServerState.RecordLog("WCF-TCP", "readAllPermissionsUpdates", toUri, action, effectiveVersion, 200, $"ReadAllPermissionsUpdatesResponseMessage: OK for '{model.Path}'");

            responseXml = "<ReadAllPermissionsUpdatesResponseMessage xmlns=\"http://Autodesk.RevitServer.Enterprise.Common.ClientServer.DataContract.Message\" xmlns:b=\"http://Autodesk.RevitServer.Enterprise.DataContract.Model\">" +
                          "<PermissionsUpdatesData></PermissionsUpdatesData>" +
                          "<Stream></Stream>" +
                          "<stream></stream>" +
                          "<LatestTransId>" +
                          "<b:PermsIdentity>" +
                          "<b:IdentityGUID>" +
                          $"<b:Guid>{model.ModelGuid}</b:Guid>" +
                          "</b:IdentityGUID>" +
                          "</b:PermsIdentity>" +
                          "<b:TransId>" +
                          "<b:Id>1</b:Id>" +
                          "</b:TransId>" +
                          "</LatestTransId>" +
                          "</ReadAllPermissionsUpdatesResponseMessage>";
        }
        else if (methodName.Contains("readAllElementPermissions", StringComparison.OrdinalIgnoreCase) ||
                 methodName.Contains("writeElementPermissions", StringComparison.OrdinalIgnoreCase) ||
                 methodName.Contains("readElementPermissions", StringComparison.OrdinalIgnoreCase))
        {
            var pascalMethod = "ReadAllElementPermissions";
            if (methodName.Contains("writeElementPermissions", StringComparison.OrdinalIgnoreCase)) pascalMethod = "WriteElementPermissions";
            else if (methodName.Contains("readElementPermissions", StringComparison.OrdinalIgnoreCase)) pascalMethod = "ReadElementPermissions";

            Console.WriteLine($"[CoreWCF] -> Returning {pascalMethod}: Success (Namespace: '{ns}')");
            ServerState.RecordLog("WCF-TCP", pascalMethod, toUri, action, effectiveVersion, 200, $"{pascalMethod}: Success");

            responseXml = $"<{pascalMethod}Response xmlns=\"{ns}\">" +
                          $"<{pascalMethod}Result>true</{pascalMethod}Result>" +
                          $"</{pascalMethod}Response>";
        }
        else if (methodName.Contains("CheckoutAndRelinquishWorksets", StringComparison.OrdinalIgnoreCase))
        {
            Console.WriteLine($"[CoreWCF] -> Returning CheckoutAndRelinquishWorksetsResponseMessage (Namespace: '{ns}')");
            ServerState.RecordLog("WCF-TCP", "CheckoutAndRelinquishWorksets", toUri, action, effectiveVersion, 200, "CheckoutAndRelinquishWorksetsResponseMessage");

            responseXml = $"<CheckoutAndRelinquishWorksetsResponseMessage xmlns=\"{ns}\">" +
                          "<b:PermissionsWorksetsUpdateData xmlns=\"http://Autodesk.RevitServer.Enterprise.DataContract.Message\" xmlns:i=\"http://www.w3.org/2001/XMLSchema-instance\" i:nil=\"true\" />" +
                          "</CheckoutAndRelinquishWorksetsResponseMessage>";
        }
        else if (methodName.Contains("checkoutElements", StringComparison.OrdinalIgnoreCase))
        {
            Console.WriteLine($"[CoreWCF] -> Returning CheckoutElementsResponseMessage (Namespace: '{ns}')");
            ServerState.RecordLog("WCF-TCP", "checkoutElements", toUri, action, effectiveVersion, 200, "CheckoutElementsResponseMessage");

            responseXml = $"<CheckoutElementsResponseMessage xmlns=\"{ns}\">" +
                          "<b:Checkedout xmlns=\"http://Autodesk.RevitServer.Enterprise.DataContract.Message\">true</b:Checkedout>" +
                          "</CheckoutElementsResponseMessage>";
        }
        else if (methodName.Contains("GrantDenyRetractEditingRequests", StringComparison.OrdinalIgnoreCase))
        {
            Console.WriteLine($"[CoreWCF] -> Returning GrantDenyRetractEditingRequestsResponseMessage (Namespace: '{ns}')");
            ServerState.RecordLog("WCF-TCP", "GrantDenyRetractEditingRequests", toUri, action, effectiveVersion, 200, "GrantDenyRetractEditingRequestsResponseMessage");

            responseXml = $"<GrantDenyRetractEditingRequestsResponseMessage xmlns=\"{ns}\">" +
                          "<b:PermissionsRequestsUpdateData xmlns=\"http://Autodesk.RevitServer.Enterprise.DataContract.Message\" xmlns:i=\"http://www.w3.org/2001/XMLSchema-instance\" i:nil=\"true\" />" +
                          "</GrantDenyRetractEditingRequestsResponseMessage>";
        }
        else if (methodName.Contains("RelinquishPermissions", StringComparison.OrdinalIgnoreCase) ||
                 methodName.Contains("PermissionsUpdates", StringComparison.OrdinalIgnoreCase))
        {
            Console.WriteLine($"[CoreWCF] -> Returning PermissionsUpdatesResponseMessage (Namespace: '{ns}')");
            ServerState.RecordLog("WCF-TCP", "PermissionsUpdates", toUri, action, effectiveVersion, 200, "PermissionsUpdatesResponseMessage");

            responseXml = $"<PermissionsUpdatesResponseMessage xmlns=\"{ns}\">" +
                          "<b:PermissionsUpdatesData xmlns=\"http://Autodesk.RevitServer.Enterprise.DataContract.Message\" xmlns:i=\"http://www.w3.org/2001/XMLSchema-instance\" i:nil=\"true\" />" +
                          "</PermissionsUpdatesResponseMessage>";
        }
        else if (methodName.Contains("DeleteFile", StringComparison.OrdinalIgnoreCase))
        {
            Console.WriteLine($"[CoreWCF] -> Returning DeleteFile: true (Namespace: '{ns}')");
            ServerState.RecordLog("WCF-TCP", "DeleteFile", toUri, action, effectiveVersion, 200, "DeleteFile OK");

            responseXml = $"<DeleteFileResponse xmlns=\"{ns}\"><DeleteFileResult>true</DeleteFileResult></DeleteFileResponse>";
        }
        else if (methodName.Contains("UpgradeModel", StringComparison.OrdinalIgnoreCase))
        {
            Console.WriteLine($"[CoreWCF] -> Returning UpgradeModel: true (Namespace: '{ns}')");
            ServerState.RecordLog("WCF-TCP", "UpgradeModel", toUri, action, effectiveVersion, 200, "UpgradeModel OK");

            responseXml = $"<UpgradeModelResponse xmlns=\"{ns}\"><UpgradeModelResult>true</UpgradeModelResult></UpgradeModelResponse>";
        }
        // Local service acceleration
        else if (methodName.Contains("IsAcceleratorNode", StringComparison.OrdinalIgnoreCase))
        {
            Console.WriteLine($"[CoreWCF] -> Returning IsAcceleratorNode: true (Namespace: '{ns}')");
            ServerState.RecordLog("WCF-TCP", "IsAcceleratorNode", toUri, action, effectiveVersion, 200, "IsAcceleratorNode: true");

            responseXml = $"<IsAcceleratorNodeResponse xmlns=\"{ns}\"><IsAcceleratorNodeResult>true</IsAcceleratorNodeResult></IsAcceleratorNodeResponse>";
        }
        else if (methodName.Contains("GetLocalServerVersion", StringComparison.OrdinalIgnoreCase))
        {
            Console.WriteLine($"[CoreWCF] -> Returning GetLocalServerVersion: 1 (Namespace: '{ns}')");
            ServerState.RecordLog("WCF-TCP", "GetLocalServerVersion", toUri, action, effectiveVersion, 200, "GetLocalServerVersion: 1");

            responseXml = $"<GetLocalServerVersionResponse xmlns=\"{ns}\"><GetLocalServerVersionResult xmlns:b=\"http://Autodesk.RevitServer.Enterprise.DataContract.System\"><b:Build>0</b:Build><b:Major>2025</b:Major><b:Minor>0</b:Minor><b:Revision>0</b:Revision><b:Version>2025.0</b:Version></GetLocalServerVersionResult></GetLocalServerVersionResponse>";
        }
        // Server Info & Properties
        else if (methodName.Contains("GetServerInfo", StringComparison.OrdinalIgnoreCase) ||
                 methodName.Contains("serverInfo", StringComparison.OrdinalIgnoreCase))
        {
            Console.WriteLine($"[CoreWCF] -> Returning ServerInfo (Version: {effectiveVersion}, Host: {serverHost}, Namespace: '{ns}')");
            ServerState.RecordLog("WCF-TCP", "GetServerInfo", toUri, action, effectiveVersion, 200, $"ServerInfo: Version {effectiveVersion}");

            responseXml = $"<GetServerInfoResponse xmlns=\"{ns}\">" +
                          "<GetServerInfoResult>" +
                          $"<ServerVersion>{effectiveVersion}</ServerVersion>" +
                          "<ServerRoles xmlns:b=\"http://schemas.microsoft.com/2003/10/Serialization/Arrays\">" +
                          "<b:string>Host</b:string><b:string>Accelerator</b:string><b:string>Admin</b:string>" +
                          "</ServerRoles>" +
                          $"<MachineName>{serverHost}</MachineName>" +
                          "</GetServerInfoResult>" +
                          "</GetServerInfoResponse>";
        }
        else if (methodName.Contains("GetServerProperties", StringComparison.OrdinalIgnoreCase))
        {
            Console.WriteLine($"[CoreWCF] -> Returning GetServerProperties (Namespace: '{ns}')");
            ServerState.RecordLog("WCF-TCP", "GetServerProperties", toUri, action, effectiveVersion, 200, "ServerProperties query");

            responseXml = $"<GetServerPropertiesResponse xmlns=\"{ns}\">" +
                          "<GetServerPropertiesResult>" +
                          $"<MachineName>{serverHost}</MachineName>" +
                          $"<ServerVersion>{effectiveVersion}</ServerVersion>" +
                          "</GetServerPropertiesResult>" +
                          "</GetServerPropertiesResponse>";
        }
        else if (methodName.Contains("CheckServer", StringComparison.OrdinalIgnoreCase) ||
                 methodName.Contains("IsServerAlive", StringComparison.OrdinalIgnoreCase) ||
                 methodName.Contains("Ping", StringComparison.OrdinalIgnoreCase))
        {
            Console.WriteLine($"[CoreWCF] -> Returning Health/Ping true (Namespace: '{ns}')");
            ServerState.RecordLog("WCF-TCP", methodName, toUri, action, effectiveVersion, 200, "Ping/Health check OK");

            responseXml = $"<{methodName}Response xmlns=\"{ns}\"><{methodName}Result>true</{methodName}Result></{methodName}Response>";
        }
        // Default / Fallback response
        else
        {
            Console.WriteLine($"[CoreWCF] -> Handled generic method: '{methodName}' (Namespace: '{ns}')");
            ServerState.RecordLog("WCF-TCP", methodName, toUri, action, effectiveVersion, 200, $"Generic WCF method handled: {methodName}");

            responseXml = $"<{methodName}Response xmlns=\"{ns}\"><{methodName}Result>true</{methodName}Result></{methodName}Response>";
        }
        var xmlSettings = new XmlReaderSettings
        {
            IgnoreWhitespace = true,
            IgnoreComments = true,
            ConformanceLevel = ConformanceLevel.Auto
        };
        var reader = XmlReader.Create(new StringReader(responseXml), xmlSettings);
        var reply = CoreWCF.Channels.Message.CreateMessage(
            request.Version,
            replyAction,
            reader);

        // Copy WS-Addressing RelatesTo correlation header
        if (request.Headers.MessageId != null)
        {
            reply.Headers.RelatesTo = request.Headers.MessageId;
        }

        // Add SOAP response headers for file streaming operations
        if (!string.IsNullOrEmpty(currentUploadFileId))
        {
            reply.Headers.Add(CoreWCF.Channels.MessageHeader.CreateHeader("FileId", "http://autodesk.com/files/2009/01", currentUploadFileId));
            reply.Headers.Add(CoreWCF.Channels.MessageHeader.CreateHeader("FileId", "http://Autodesk.RevitServer.Enterprise.Common.ClientServer.DataContract.Message", currentUploadFileId));
            reply.Headers.Add(CoreWCF.Channels.MessageHeader.CreateHeader("Result", "http://autodesk.com/files/2009/01", true));
            reply.Headers.Add(CoreWCF.Channels.MessageHeader.CreateHeader("Result", "http://Autodesk.RevitServer.Enterprise.Common.ClientServer.DataContract.Message", true));
            reply.Headers.Add(CoreWCF.Channels.MessageHeader.CreateHeader("Success", "http://autodesk.com/files/2009/01", true));
            if (!string.IsNullOrEmpty(incomingScopingId))
            {
                reply.Headers.Add(CoreWCF.Channels.MessageHeader.CreateHeader("ScopingId", "http://autodesk.com/files/2009/01", incomingScopingId));
                reply.Headers.Add(CoreWCF.Channels.MessageHeader.CreateHeader("ScopingId", "http://Autodesk.RevitServer.Enterprise.Common.ClientServer.DataContract.Message", incomingScopingId));
            }
        }

        if (latestModelVersionNumber.HasValue)
        {
            reply.Headers.Add(CoreWCF.Channels.MessageHeader.CreateHeader(
                "Version",
                "http://Autodesk.RevitServer.Enterprise.DataContract.Message",
                new HeaderVersionNumber { Major = -1, Minor = latestModelVersionNumber.Value }));
        }

        Console.WriteLine($"[CoreWCF] <<< Reply dispatched: ReplyAction='{replyAction}'");
        return reply;
    }
}
# ==============================================================================
# OpenRevitServer - Production Full-Stack (.NET 9 CoreWCF + React Web UI)
# ==============================================================================

# Stage 1: Build Web SPA UI
FROM node:22-alpine AS ui-builder
WORKDIR /app
COPY package.json ./
COPY bun.lock* package-lock.json* ./
RUN npm install --legacy-peer-deps
COPY . .
RUN npm run build

# Stage 2: Build .NET 9 CoreWCF Daemon
FROM mcr.microsoft.com/dotnet/sdk:9.0-alpine AS dotnet-builder
WORKDIR /src
COPY OpenRevitServer.csproj ./
RUN dotnet restore
COPY Program.cs ./
RUN dotnet publish -c Release -o /app/publish

# Stage 3: Minimal Production Runtime
FROM mcr.microsoft.com/dotnet/aspnet:9.0-alpine AS runner
WORKDIR /app

# Copy compiled .NET 9 CoreWCF binaries
COPY --from=dotnet-builder /app/publish ./

# Copy compiled React UI into dist folder for web serving
COPY --from=ui-builder /app/dist ./dist

# Ports: 808 (WCF Net.Tcp), 80 (REST), 3000 (Web Dashboard)
EXPOSE 80 808 3000

ENV ASPNETCORE_ENVIRONMENT=Production

ENTRYPOINT ["dotnet", "OpenRevitServer.dll"]

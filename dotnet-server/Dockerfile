# Multi-stage Dockerfile for .NET 9 CoreWCF Linux Revit Server
FROM mcr.microsoft.com/dotnet/sdk:9.0-alpine AS build
WORKDIR /src
COPY OpenRevitServer.csproj ./
RUN dotnet restore
COPY . .
RUN dotnet publish -c Release -o /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:9.0-alpine AS runtime
WORKDIR /app
COPY --from=build /app/publish .

EXPOSE 80 808 3000

ENV ASPNETCORE_URLS=http://+:80;http://+:3000

ENTRYPOINT ["dotnet", "OpenRevitServer.dll"]

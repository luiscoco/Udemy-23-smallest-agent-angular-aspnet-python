FROM node:24-bookworm-slim AS ui
WORKDIR /src
COPY frontend/package.json frontend/package-lock.json ./frontend/
RUN npm --prefix frontend ci
COPY frontend ./frontend
COPY backend ./backend
COPY agent-service/app ./agent-service/app
COPY scripts/generate-lesson.mjs ./scripts/generate-lesson.mjs
RUN node scripts/generate-lesson.mjs && npm --prefix frontend run build
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS gateway
WORKDIR /src
COPY NuGet.Config ./NuGet.Config
COPY backend ./backend
RUN dotnet publish backend/SmallestAgent.Gateway.csproj -c Release -o /out
FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app/backend
COPY --from=gateway /out ./
COPY --from=ui /src/frontend/dist/browser /app/frontend/dist/browser
ENV API_HOST=0.0.0.0 API_PORT=9800 AGENT_SERVICE_URL=http://agent:9801
USER app
EXPOSE 9800
ENTRYPOINT ["dotnet","SmallestAgent.Gateway.dll"]

# The Smallest Agent — Angular + ASP.NET Core + Python Agent

Edition 23 keeps the complete teaching application: five working lesson tabs, retained prompt/results, Stream/Simple modes, cancellation, partial answers, copy/Markdown download, readable 21px body text, pastel cards, persistent dark theme, syntax-colored C#/Python/TypeScript snippets and a 16-step UML with actual source excerpts.

The browser calls an ASP.NET Core 10 gateway. The gateway serves compiled Angular, validates public requests and relays to a private Python service running the real Claude Agent SDK. Only Python has the model key. A separate shared internal token authenticates gateway-to-Python calls; neither credential enters Angular.

## Windows Terminal / PowerShell

Prerequisites: Node.js 24, .NET 10 SDK, Python 3.11+ (tested with 3.14), and a Windows Python launcher (`py`). Python’s SDK includes its native Claude CLI. Use a standard terminal with the installed tools on PATH.

From **Lesson0**:

```powershell
cd .\23-smallest-agent-angular-aspnet-python
npm ci
npm run setup
notepad agent-service\.env
```

Set your own `ANTHROPIC_API_KEY`. Keep the generated `AGENT_SERVICE_TOKEN` intact. Save, then run:

```powershell
npm run dev
```

Wait for Angular and open **http://127.0.0.1:6600**. Public .NET API: **http://127.0.0.1:9800/api/docs**. Private Python:127.0.0.1:9801. The launcher waits for readiness in order. Ctrl+C stops only its own child processes. First installation/build takes longer.

Setup creates a local `.venv`, installs Python and Angular dependencies, restores the two .NET projects, generates matching random tokens in missing configuration files and regenerates lesson excerpts. Existing files are preserved. Previous editions’ credentials are never copied. No paid provider request occurs during setup/build/test. Python on Windows uses a Proactor event loop for SDK subprocess support, without activating the venv.

Separate terminals, from this edition’s root:

```powershell
npm run dev:agent
npm run dev:backend
npm run dev:frontend
```

Run one per terminal. Do not run them alongside the combined launcher on the same ports.

## Private configuration

Only `agent-service/.env` needs the Anthropic key:

```dotenv
ANTHROPIC_API_KEY=sk-ant-replace-with-your-key
CLAUDE_MODEL=
AGENT_SYSTEM_PROMPT=You are a concise teaching assistant.
AGENT_MAX_TURNS=1
AGENT_HOST=127.0.0.1
AGENT_PORT=9801
AGENT_SERVICE_TOKEN=YOUR_SETUP_GENERATED_TOKEN
```

Blank model uses the SDK default; an override must be available to your account. Turns accept 1–10. `backend/.env` contains the private origin and matching token, with no model key:

```dotenv
API_HOST=127.0.0.1
API_PORT=9800
AGENT_SERVICE_URL=http://127.0.0.1:9801
AGENT_SERVICE_TOKEN=THE_SAME_SETUP_GENERATED_TOKEN
TRUST_PROXY=0
```

Environment variables override files in both services. Python loads its module-relative dotenv; .NET loads the backend dotfile explicitly as an INI stream to avoid dot-prefixed file-provider exclusions. Restart after changes. Missing/mismatched internal tokens prevent gateway access to Python. Keep the generated files paired; only replace the model-key placeholder. Health reports key presence, not provider authentication, credits or model access. Defaults in scripts/proxy/configuration expect the documented ports; change all relevant values if overriding them.

Angular’s public `frontend/public/config.json` contains only `{ "apiUrl": "" }`, keeping same-origin API calls. Never place either server credential there.

## Test, build and run production locally

```powershell
npm run typecheck
npm test
npm run build
npm start
```

Stop development first. Production serves the compiled Angular UI and API at **http://127.0.0.1:9800**, alongside private Python. Build generates 16 source-linked cards/SVG/PlantUML, compiles Angular into frontend/dist/browser and publishes .NET into backend/artifacts/publish. The Python service runs from its isolated venv. The published gateway starts with backend as its working directory, keeping the separate private configuration and public source path deterministic.

Tests include Python pytest with injected SDK iterators, Angular Vitest, and a .NET console integration harness using actual Kestrel/HttpClient sockets. The .NET harness runs through `dotnet run --project backend.tests/Gateway.IntegrationTests.csproj`; it does not depend on a third-party test framework.

With a placeholder key and production running in a second terminal:

```powershell
npm run verify:http
$env:VERIFY_BASE_URL='http://127.0.0.1:9800'
npm run verify:browser
Remove-Item Env:VERIFY_BASE_URL
```

Browser verification uses installed Google Chrome and writes ignored screenshots to verification/. It checks all tabs, retained prompt, missing-key SSE, 16 colored workflow cards, UML loading, theme persistence and mobile overflow. No real model request is made. A real prompt still requires your own working provider account.

## Source map

- `frontend/src/app/`: Angular signals/forms, retained state, bounded SSE parser, safe Markdown/code and all lesson sections.
- `backend/GatewayApplication.cs`: request/origin validation, fixed private handoff, linked cancellation, progressive relay and safe static hosting. It forwards no browser cookies, authorization or supplied service token.
- `agent-service/app/`: private ASGI authentication, Python SDK options and safe message/result projection, deadlines and iterator cleanup.
- `scripts/generate-lesson.mjs`: real TypeScript/C#/Python marker extraction, line numbers and explicit-attribute SVG/PlantUML; missing markers fail the build.
- `BUILD-PROMPT.txt`: reusable generation prompt, also supplied as a separate root text file.

See DEPLOYMENT.md for the two-container option, HTTPS/private-network boundaries and production authentication. VERIFICATION.md records actual checks and limits. The course astronaut is reused from prior local editions; no new asset-license claim is made.

Official references: [ASP.NET Core Minimal APIs](https://learn.microsoft.com/en-us/aspnet/core/fundamentals/minimal-apis?view=aspnetcore-10.0), [Python Agent SDK](https://code.claude.com/docs/en/agent-sdk/python), [course design reference](https://github.com/luiscoco/Udemy-Claude-Agent-SDK-lesson01-app).

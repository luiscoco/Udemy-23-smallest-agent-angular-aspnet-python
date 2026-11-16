# Two services, one public entry

Expose only the ASP.NET Core gateway. Keep Python on loopback on one host or on a private network between containers/hosts. Its internal token authenticates gateway calls and is not end-user authentication. Before remote exposure, add actual user authentication/authorization, quotas, rate limits and HTTPS ingress around the gateway. No cloud resources or external accounts are created by this task.

The browser uses relative /api routes. Development Angular proxies those to .NET preserving Host/Origin; production .NET serves Angular and API together. Python has no public static host, model key endpoint or unauthenticated API routes. Only /internal/ready returns a minimal unauthenticated readiness response for startup/health checks. The gateway owns the internal token, forwards only normalized prompt JSON to fixed paths, disables redirects and maps private authentication/redirect failures to a safe503.

## Docker Compose

After setup and private configuration, with Docker Desktop running Linux containers:

```powershell
docker compose up --build
```

Open **http://127.0.0.1:9800**. Compose publishes only the gateway on host loopback. Python remains internal under agent:9801, and both containers receive their own paired .env settings at runtime. The model key goes only to Python. `docker compose down` stops this Compose application. The .dockerignore excludes all .env-prefixed files, caches, venv, node_modules, build outputs and private local configuration; it retains the Python source needed for image creation.

The gateway image builds Angular with Node24 and .NET with the10 SDK, then runs the ASP.NET runtime as its non-root app user. Python3.14-slim installs the platform-specific Python Agent SDK bundle and runs as a non-root user with bash/git and writable temporary space. Install on the target platform; do not copy the Windows venv into Linux. Neither image bakes credentials. Docker/hosted execution still needs validation on your deployment platform; the local Docker Linux engine was unavailable during implementation.

## HTTPS and secret management

Use secret-manager environment injection for each service in production. Put ANTHROPIC_API_KEY only on Python and generate a strong matching AGENT_SERVICE_TOKEN for both services. Restart/redeploy after rotation. Do not embed tokens in Angular, build arguments, image layers, public config or logs. Restrict Python to the gateway network; for separate hosts, use private TLS as appropriate to your network boundary.

Keep TRUST_PROXY=0 locally. Set it to1 only when a controlled HTTPS ingress is the sole direct caller and overwrites X-Forwarded-Proto. The gateway never trusts forwarded host and derives expected origin from actual Host plus the controlled scheme. Do not enable broad forwarded-header trust on a directly reachable service. CORS/origin validation and an internal token do not replace user identity/access control.

Configure ingress to disable response buffering and support POST SSE beyond185 seconds. Python execution is bounded to180 seconds; .NET links a185-second upstream deadline with browser RequestAborted; Angular bounds the fetch to195 seconds. The .NET HttpClient uses ResponseHeadersRead and writes/flushes each received chunk. Disconnect cancellation closes the private connection and Python cancels its owned SDK iterator. Task/process shutdown can interrupt a run, so the browser requires both a valid final result and done and rejects truncated frames.

## Runtime boundaries

Both services bound actual request input32KiB including chunked requests and validate a trimmed string of1–4000UTF-16 units. Invalid values are not echoed. No arbitrary upstream URL comes from the browser. Static hosting rejects dotfiles, path traversal and escaping links; unknown API paths do not return Angular HTML. Published content excludes local .env files and nested publish artifacts.

Python uses the real SDK query/async-iterator loop, fresh temporary work/home/config directories, bounded turns, a deadline, disabled tools/settings/skills/MCP/plugins/persistence, safe field projection and redaction. Child environments clear internal tokens and ambient cloud/Claude credentials before adding the intended model key and private runtime directories. These controls are not OS/network sandboxing. No raw thinking, tool payloads, private session identifiers or paths are sent to the interface. Non-success SDK result subtypes remain failures even if an inconsistent raw flag is false; unreported cost remains null.

The native SDK subprocess needs working filesystem and outbound provider HTTPS. Keep its platform bundle installed and ensure the host meets the current Claude runtime requirements. On Windows, use the included Proactor startup script and a normal Python installation. Do not run Uvicorn with a selector-only event loop for real SDK subprocesses.

No paid inference is part of setup/tests/build. Health checks report presence rather than provider access; verify intended live prompts yourself after configuring your account. README.md contains local startup and test commands.

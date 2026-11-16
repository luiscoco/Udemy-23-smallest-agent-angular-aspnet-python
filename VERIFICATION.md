# Verification record

Passed: 30 Python tests, 14 Angular tests and seven .NET integration groups (51 checks), plus the production build and Chrome UI checks.

Local checks exercise Angular TypeScript/AOT compilation, .NET 10 build/publish, Python SDK projections and cleanup, private ASGI token authentication, Unicode/input boundaries and secret-safe configuration errors. Tests inject SDK iterators; no paid Claude request is made.

The .NET integration harness runs real Kestrel/HttpClient sockets and checks input validation,32KiB bounds, media/origin handling, normalized JSON with gateway-owned credentials, no forwarded browser cookies/origin, progressive SSE before completion, upstream cancellation, compiled HTML/JavaScript assets, hidden/unknown routes and safe private-auth/redirect failures.

Live production HTTP verification checks compiled Angular and static assets, public API/docs/schema, missing-key query503 and SSE error without done, private Python401 and browser token-spoof resistance. Chrome checks all five tabs, retained prompt,16 highlighted C#/Python/TypeScript source cards, complete SVG, persistent dark theme and 390px mobile page width without browser errors.

The documented setup, development launcher and final build are verified locally. Docker Compose syntax can be checked without a daemon; actual container builds/execution were unavailable because Docker’s Linux engine was not running. No cloud deployment, end-user-auth provider integration, signing or real provider authentication was exercised. Validate containers and any hosting-specific ingress/auth/network settings before deployment.

Reproduce with npm ci, npm run setup, npm run typecheck, npm test and npm run build. Run production in another terminal with a placeholder model key, then npm run verify:http and npm run verify:browser with VERIFY_BASE_URL=http://127.0.0.1:9800. Screenshots go to ignored verification/.

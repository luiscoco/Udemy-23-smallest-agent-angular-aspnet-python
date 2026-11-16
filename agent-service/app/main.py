import asyncio
from contextlib import aclosing, suppress
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from fastapi.sse import EventSourceResponse, ServerSentEvent
from fastapi.staticfiles import StaticFiles

from .agent_service import AgentService
from .config import Settings
from .schemas import AgentResponse, ErrorResponse, PromptRequest

FAILURE = 'The agent could not finish. Check the server API key, model access and connection, then try again.'
MISSING_KEY = 'Configure ANTHROPIC_API_KEY in agent-service/.env, then restart the Python agent service.'
DIST = Path(__file__).resolve().parents[2] / 'frontend' / 'dist'
INPUT_ERRORS = {status: {'model': ErrorResponse, 'description': description} for status, description in [
    (400, 'Malformed JSON'), (403, 'Foreign origin'), (413, 'Body exceeds 32 KiB'),
    (415, 'Use application/json'), (422, 'Invalid prompt; values are not echoed'),
]}


class InternalAuth:
    def __init__(self, app, token: str):
        self.app, self.expected = app, token.encode('utf-8')

    async def __call__(self, scope, receive, send):
        if scope['type'] == 'http' and not (scope['path'] == '/internal/ready' and scope['method'] == 'GET'):
            from hmac import compare_digest
            supplied = dict(scope['headers']).get(b'x-agent-service-token', b'')
            if not compare_digest(supplied, self.expected):
                return await JSONResponse({'detail': 'Agent service authentication failed.'}, status_code=401)(scope, receive, send)
        return await self.app(scope, receive, send)


class InputBoundary:
    """Bound actual POST bytes before FastAPI parses them, including chunked bodies."""
    def __init__(self, app, allowed_origins=()):
        self.app = app
        self.allowed_origins = set(allowed_origins)

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http' or scope['method'] != 'POST' or not scope['path'].startswith('/api/agent/'):
            return await self.app(scope, receive, send)
        headers = {key.decode().lower(): value.decode() for key, value in scope['headers']}
        expected = f"{scope['scheme']}://{headers.get('host', '')}"
        status, detail = None, ''
        if headers.get('origin') and headers['origin'] != expected and headers['origin'] not in self.allowed_origins:
            status, detail = 403, 'Origin is not allowed.'
        elif headers.get('content-type', '').split(';')[0].strip().lower() != 'application/json':
            status, detail = 415, 'Use Content-Type: application/json.'
        chunks, size = [], 0
        while status is None:
            message = await receive()
            if message['type'] == 'http.disconnect':
                return
            body = message.get('body', b'')
            size += len(body)
            if size > 32768:
                status, detail = 413, 'Request body is too large.'
                break
            chunks.append(body)
            if not message.get('more_body', False):
                break
        if status is not None:
            return await JSONResponse({'detail': detail}, status_code=status)(scope, receive, send)
        buffered = b''.join(chunks)
        delivered = False

        async def replay():
            nonlocal delivered
            if not delivered:
                delivered = True
                return {'type': 'http.request', 'body': buffered, 'more_body': False}
            return await receive()
        await self.app(scope, replay, send)


async def query_until_disconnected(request: Request, service: AgentService, prompt: str):
    task = asyncio.create_task(service.run_agent(prompt))
    try:
        async with asyncio.timeout(180):
            while not task.done():
                await asyncio.wait({task}, timeout=0.2)
                if await request.is_disconnected():
                    raise HTTPException(499, 'Request was cancelled.')
            return await task
    finally:
        if not task.done():
            task.cancel()
        with suppress(asyncio.CancelledError, Exception):
            await task


def create_app(settings: Settings | None = None, query_fn=None, dist: Path = DIST) -> FastAPI:
    settings = settings or Settings()
    agent = AgentService(settings, query_fn)
    app = FastAPI(docs_url='/api/docs', openapi_url='/api/openapi.json', redoc_url=None, title='The Smallest Agent · Angular + ASP.NET Core + Python Agent', version='1.0.0',
                  description='Private Python Claude Agent SDK service behind ASP.NET Core.')
    app.add_middleware(InputBoundary, allowed_origins=[v.strip() for v in settings.allowed_origins.split(',') if v.strip()])

    app.add_middleware(InternalAuth, token=settings.agent_service_token.get_secret_value())

    @app.get('/internal/ready', include_in_schema=False)
    async def ready():
        return {'status': 'ok'}

    @app.exception_handler(RequestValidationError)
    async def invalid_input(request: Request, exc: RequestValidationError):
        malformed = any(error['type'] == 'json_invalid' for error in exc.errors())
        return JSONResponse({'detail': 'Request must contain valid JSON.' if malformed else 'Prompt must contain 1–4000 characters after trimming.'}, status_code=400 if malformed else 422)

    @app.exception_handler(Exception)
    async def unexpected(request: Request, exc: Exception):
        return JSONResponse({'detail': 'An unexpected server error occurred.'}, status_code=500)

    @app.get('/api/health', tags=['Health'])
    async def health():
        return {'status': 'ok', 'api_key_configured': settings.api_key_configured}

    @app.post('/api/agent/query', response_model=AgentResponse, tags=['Agent'],
              responses={**INPUT_ERRORS, 503: {'model': ErrorResponse, 'description': 'Missing server key'}, 502: {'model': ErrorResponse, 'description': 'Safe SDK failure'}})
    async def query_agent(body: PromptRequest, request: Request):
        if not settings.api_key_configured:
            raise HTTPException(503, MISSING_KEY)
        try:
            return await query_until_disconnected(request, agent, body.prompt)
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(502, FAILURE) from None

    @app.post('/api/agent/stream', response_class=EventSourceResponse, tags=['Agent'], responses=INPUT_ERRORS,
              description='SSE message events carry safe SDK projections. done follows a final result. Failures and missing keys emit error without done; is_error is not overridden by done.')
    async def stream(body: PromptRequest):
        if not settings.api_key_configured:
            yield ServerSentEvent(event='error', data={'detail': MISSING_KEY})
            return
        try:
            async with asyncio.timeout(180):
                async with aclosing(agent.stream_agent(body.prompt)) as messages:
                    async for message in messages:
                        yield ServerSentEvent(event='message', data=message)
                yield ServerSentEvent(event='done', data={'status': 'complete'})
        except Exception:
            yield ServerSentEvent(event='error', data={'detail': FAILURE})

    @app.api_route('/api/{path:path}', methods=['GET', 'POST', 'HEAD', 'OPTIONS'], include_in_schema=False)
    async def unknown_api(path: str):
        raise HTTPException(404, 'Not found')

    return app


app = create_app()

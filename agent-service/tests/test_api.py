import asyncio
from contextlib import aclosing
from types import SimpleNamespace

import pytest
from claude_agent_sdk import AssistantMessage, ResultMessage, SystemMessage, TextBlock, ThinkingBlock
from fastapi import HTTPException
from fastapi.testclient import TestClient as OriginalTestClient
from pydantic import ValidationError

from app.agent_service import AgentService
from app.config import Settings
from app.main import InputBoundary, create_app, query_until_disconnected

SECRET = 'sk-ant-test-secret'
TOKEN = 'test-agent-service-token-0123456789-abcdefghijklmnopqrstuvwxyz'

def TestClient(*args, **kwargs):
    kwargs.setdefault('headers', {})['X-Agent-Service-Token'] = TOKEN
    return OriginalTestClient(*args, **kwargs)


@pytest.fixture
def harness(tmp_path):
    settings = Settings(_env_file=None, agent_service_token=TOKEN, anthropic_api_key=SECRET)
    calls = {'started': 0, 'closed': 0}

    async def fake_query(*, prompt, options):
        calls['started'] += 1
        assert prompt == prompt.strip()
        assert options.tools == [] and options.allowed_tools == []
        assert options.setting_sources == [] and options.skills == []
        assert options.mcp_servers == {} and options.strict_mcp_config is True
        assert options.permission_mode == 'dontAsk' and options.max_turns == 1
        assert options.env['ANTHROPIC_API_KEY'] == SECRET
        assert options.env['ENABLE_CLAUDEAI_MCP_SERVERS'] == 'false'
        try:
            if prompt == 'fail':
                raise RuntimeError(f'{SECRET} /private/trace')
            yield SystemMessage('init', {'key': SECRET, 'cwd': '/private/path'})
            if prompt == 'slow':
                await asyncio.sleep(100)
                return
            if prompt == 'empty':
                return
            yield AssistantMessage([TextBlock(f'Hello {SECRET}'), ThinkingBlock(SECRET, 'signature')], 'test')
            yield ResultMessage(subtype='error_during_execution' if prompt == 'error-result' else 'success', duration_ms=42,
                                duration_api_ms=20, is_error=False, num_turns=1, session_id='private-session',
                                total_cost_usd=0.001, result=f'**Hello!** {SECRET}')
        finally:
            calls['closed'] += 1

    return SimpleNamespace(settings=settings, calls=calls, query=fake_query,
                           client=TestClient(create_app(settings, fake_query, dist=tmp_path/'not-built')))


def test_health_and_real_swagger_schema(harness):
    response = harness.client.get('/api/health')
    assert response.json() == {'status': 'ok', 'api_key_configured': True}
    assert SECRET not in response.text
    assert harness.client.get('/api/docs').status_code == 200
    assert '/api/agent/stream' in harness.client.get('/api/openapi.json').json()['paths']


@pytest.mark.parametrize('mode', ['query', 'stream'])
@pytest.mark.parametrize('body', [{}, {'prompt': ''}, {'prompt': '   '}, {'prompt': 'x'*4001}, {'prompt': None}, {'prompt': 42}])
def test_prompt_validation_before_sdk(harness, mode, body):
    response = harness.client.post(f'/api/agent/{mode}', json=body)
    assert response.status_code == 422
    assert harness.calls['started'] == 0


@pytest.mark.parametrize('mode', ['query', 'stream'])
def test_content_type_json_and_actual_body_limit(harness, mode):
    path = f'/api/agent/{mode}'
    malformed = harness.client.post(path, content=f'{{broken-{SECRET}', headers={'Content-Type': 'application/json'})
    assert malformed.status_code == 400 and SECRET not in malformed.text
    assert harness.client.post(path, content='{}', headers={'Content-Type':'text/plain'}).status_code == 415
    assert harness.client.post(path, json={'prompt':'x'*40000}).status_code == 413
    assert harness.calls['started'] == 0


@pytest.mark.parametrize('mode', ['query', 'stream'])
def test_matching_host_origin_and_foreign_rejection(harness, mode):
    for host in ['localhost:4600', '127.0.0.1:4600', '127.0.0.1:8100']:
        assert harness.client.post(f'/api/agent/{mode}', json={'prompt':''}, headers={'Host':host,'Origin':f'http://{host}'}).status_code == 422
    for origin in ['https://foreign.invalid', 'http://127.0.0.1:4601', 'https://127.0.0.1:4600', 'null']:
        assert harness.client.post(f'/api/agent/{mode}', json={'prompt':'Hello'}, headers={'Host':'127.0.0.1:4600','Origin':origin,'X-Forwarded-Host':'foreign.invalid'}).status_code == 403


def test_query_normalizes_result_and_closes_sdk_iterator(harness):
    response = harness.client.post('/api/agent/query', json={'prompt':' Hello '})
    assert response.status_code == 200
    assert response.json() == {'result':'**Hello!** [redacted]','num_turns':1,'duration_ms':42,'total_cost_usd':0.001,'is_error':False}
    assert harness.calls == {'started':1,'closed':1}


def test_native_sse_order_safe_projections_and_done(harness):
    response = harness.client.post('/api/agent/stream', json={'prompt':'Hello'})
    text = response.text
    assert response.headers['content-type'].startswith('text/event-stream')
    assert text.count('event: message') == 3
    assert text.index('SystemMessage') < text.index('AssistantMessage') < text.index('ResultMessage') < text.index('event: done')
    assert SECRET not in text and '/private/' not in text and 'private-session' not in text and 'thinking' not in text
    assert harness.calls == {'started':1,'closed':1}


@pytest.mark.parametrize('prompt', ['fail','empty'])
def test_failures_and_missing_result_have_safe_error_without_done(harness, prompt):
    query = harness.client.post('/api/agent/query', json={'prompt':prompt})
    assert query.status_code == 502 and SECRET not in query.text
    stream = harness.client.post('/api/agent/stream', json={'prompt':prompt})
    assert 'event: error' in stream.text and 'event: done' not in stream.text
    assert SECRET not in stream.text and '/private/' not in stream.text
    assert harness.calls['closed'] == 2


def test_non_success_subtype_remains_an_error(harness):
    result = harness.client.post('/api/agent/query', json={'prompt':'error-result'}).json()
    assert result['is_error'] is True


def test_missing_key_does_not_call_sdk(harness, tmp_path):
    settings = Settings(_env_file=None, agent_service_token=TOKEN, anthropic_api_key='sk-ant-replace-with-your-key')
    client = TestClient(create_app(settings, harness.query, dist=tmp_path/'missing'))
    assert client.post('/api/agent/query', json={'prompt':'Hi'}).status_code == 503
    response = client.post('/api/agent/stream', json={'prompt':'Hi'})
    assert 'event: error' in response.text and 'agent-service/.env' in response.text and 'event: done' not in response.text
    assert harness.calls['started'] == 0


def test_closing_stream_and_cancelling_query_close_sdk(harness):
    async def scenario():
        service = AgentService(harness.settings, harness.query)
        async with aclosing(service.stream_agent('slow')) as stream:
            assert (await anext(stream))['type'] == 'SystemMessage'
        assert harness.calls['closed'] == 1
        task = asyncio.create_task(service.run_agent('slow'))
        await asyncio.sleep(0)
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
        assert harness.calls['closed'] == 2
    asyncio.run(scenario())


def test_query_disconnect_cancels_running_sdk(harness):
    async def scenario():
        async def disconnected():
            return True
        service = AgentService(harness.settings, harness.query)
        with pytest.raises(HTTPException) as error:
            await query_until_disconnected(SimpleNamespace(is_disconnected=disconnected), service, 'slow')
        assert error.value.status_code == 499
        assert harness.calls['closed'] == 1
    asyncio.run(scenario())


def test_chunked_body_limit_is_not_only_a_content_length_check():
    async def scenario():
        called = False
        async def downstream(scope, receive, send):
            nonlocal called
            called = True
        chunks = iter([{'type':'http.request','body':b'x'*20000,'more_body':True}, {'type':'http.request','body':b'x'*20000,'more_body':False}])
        async def receive():
            return next(chunks)
        sent=[]
        async def send(message):
            sent.append(message)
        await InputBoundary(downstream)({'type':'http','method':'POST','path':'/api/agent/query','scheme':'http','headers':[(b'host',b'localhost'),(b'content-type',b'application/json')]},receive,send)
        assert sent[0]['status'] == 413 and not called
    asyncio.run(scenario())


def test_settings_bounds_and_no_html_fallback_for_unknown_api(harness):
    with pytest.raises(ValidationError):
        Settings(_env_file=None, agent_service_token=TOKEN, agent_max_turns=0)
    assert harness.client.get('/api/unknown').status_code == 404
    assert harness.client.get('/').status_code == 404

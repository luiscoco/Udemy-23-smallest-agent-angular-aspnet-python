import os
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from app.config import Settings
from app.main import create_app
from app.agent_service import AgentService

TOKEN = 'test-private-token-0123456789-abcdefghijklmnopqrstuvwxyz'

def test_private_authentication_precedes_parsing_or_execution():
    called = []
    async def query(**kwargs):
        called.append(True)
        yield None
    app = create_app(Settings(_env_file=None, agent_service_token=TOKEN), query)
    client = TestClient(app)
    assert client.get('/internal/ready').json() == {'status': 'ok'}
    for headers in [{}, {'X-Agent-Service-Token': 'wrong'}]:
        assert client.post('/api/agent/query', content='broken', headers=headers).status_code == 401
        assert client.get('/api/health', headers=headers).status_code == 401
    assert not called
    assert client.get('/api/health', headers={'X-Agent-Service-Token': TOKEN}).status_code == 200

def test_utf16_limit_and_private_runtime_environment(monkeypatch):
    monkeypatch.setenv('AGENT_SERVICE_TOKEN', TOKEN)
    monkeypatch.setenv('AWS_SECRET_ACCESS_KEY', 'private-cloud-key')
    monkeypatch.setenv('CLAUDE_CODE_OAUTH_TOKEN', 'private-login-token')
    settings = Settings(_env_file=None, agent_service_token=TOKEN, anthropic_api_key='sk-ant-replace-with-your-key')
    client = TestClient(create_app(settings), headers={'X-Agent-Service-Token': TOKEN})
    assert client.post('/api/agent/query', json={'prompt': '😀' * 2001}).status_code == 422
    service = AgentService(settings)
    with service.runtime_options() as options:
        directory = options.cwd
        assert os.path.isdir(directory)
        assert options.plugins == []
        assert options.env['AGENT_SERVICE_TOKEN'] == ''
        assert options.env['AWS_SECRET_ACCESS_KEY'] == ''
        assert options.env['CLAUDE_CODE_OAUTH_TOKEN'] == ''
    assert not os.path.exists(directory)

def test_configuration_errors_do_not_echo_secret_input():
    with pytest.raises(ValidationError) as error:
        Settings(_env_file=None, agent_service_token='bad-token', anthropic_api_key='sk-ant-do-not-print')
    assert 'sk-ant-do-not-print' not in str(error.value)
    assert 'bad-token' not in str(error.value)

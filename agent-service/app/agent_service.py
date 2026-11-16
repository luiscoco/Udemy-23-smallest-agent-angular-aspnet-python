"""Only this module imports the Agent SDK; never send its raw objects to the UI."""
from contextlib import aclosing, contextmanager
from tempfile import TemporaryDirectory
from pathlib import Path
import os

from claude_agent_sdk import ClaudeAgentOptions, ResultMessage, TextBlock, query

from .config import Settings


class AgentService:
    def __init__(self, settings: Settings, query_fn=None):
        self.settings = settings
        self.query_fn = query_fn or query

    @contextmanager
    def runtime_options(self):
        with TemporaryDirectory(prefix='smallest-agent-23-') as directory:
            base = Path(directory)
            for name in ['work', 'home', 'config']:
                (base / name).mkdir()
            yield self.agent_options(base)

    def agent_options(self, base: Path | None = None) -> ClaudeAgentOptions:
        # tools=[] removes built-ins; allowed_tools=[] alone is not a tool ban.
        return ClaudeAgentOptions(
            cwd=str(base / 'work') if base else None,
            extra_args={'no-session-persistence': None},
            tools=[], allowed_tools=[], permission_mode='dontAsk',
            setting_sources=[], skills=[], plugins=[], mcp_servers={}, strict_mcp_config=True,
            max_turns=self.settings.agent_max_turns,
            model=self.settings.claude_model or None,
            system_prompt=self.settings.agent_system_prompt or None,
            env={**{key: '' for key in os.environ if key == 'AGENT_SERVICE_TOKEN' or (key.startswith(('ECS_', 'AWS_', 'GOOGLE_', 'GCLOUD_', 'CLOUDSDK_', 'ANTHROPIC_', 'CLAUDE_')) and key != 'CLAUDE_CODE_GIT_BASH_PATH')},
                 **({'HOME': str(base / 'home'), 'USERPROFILE': str(base / 'home'), 'CLAUDE_CONFIG_DIR': str(base / 'config')} if base else {}),
                 'ANTHROPIC_API_KEY': self.settings.anthropic_api_key.get_secret_value().strip(),
                 'ANTHROPIC_BASE_URL': 'https://api.anthropic.com',
                 'ENABLE_CLAUDEAI_MCP_SERVERS': 'false', 'CLAUDE_CODE_DISABLE_AUTO_MEMORY': '1'},
        )

    def redact(self, text: str) -> str:
        key = self.settings.anthropic_api_key.get_secret_value().strip()
        return text.replace(key, '[redacted]') if key else text

    def result_data(self, message: ResultMessage) -> dict:
        return {
            'result': self.redact(message.result or ''),
            'num_turns': message.num_turns,
            'duration_ms': message.duration_ms,
            'total_cost_usd': message.total_cost_usd,
            'is_error': message.is_error or message.subtype != 'success',
        }

    async def run_agent(self, prompt: str) -> dict:
        # The same query -> async for -> ResultMessage loop as the terminal lesson.
        with self.runtime_options() as options:
            source = self.query_fn(prompt=prompt, options=options)
            async with aclosing(source):
                async for message in source:
                    if isinstance(message, ResultMessage):
                        return self.result_data(message)
            raise RuntimeError('Agent ended without a final result')

    async def stream_agent(self, prompt: str):
        with self.runtime_options() as options:
            source = self.query_fn(prompt=prompt, options=options)
            found_result = False
            async with aclosing(source):
                async for message in source:
                    kind = type(message).__name__
                    if isinstance(message, ResultMessage):
                        found_result = True
                        data = self.result_data(message)
                        summary = 'Agent finished with an error' if data['is_error'] else 'Final answer received'
                    elif kind in ('AssistantMessage', 'UserMessage'):
                        content = getattr(message, 'content', [])
                        text = content if isinstance(content, str) else '\n'.join(block.text for block in content if isinstance(block, TextBlock))
                        safe_text = self.redact(text)
                        data = {'text': safe_text}
                        summary = safe_text[:160] or 'Message received'
                    elif kind == 'SystemMessage':
                        subtype = str(getattr(message, 'subtype', 'system'))
                        data = {'subtype': self.redact(subtype)}
                        summary = 'Agent initialized' if subtype == 'init' else 'System update'
                    else:
                        kind, data, summary = 'OtherMessage', {}, 'SDK lifecycle message received'
                    yield {'type': kind, 'summary': summary, 'data': data}
            if not found_result:
                raise RuntimeError('Agent ended without a final result')

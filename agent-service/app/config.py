from pathlib import Path

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parents[1] / '.env',
        env_file_encoding='utf-8', extra='ignore', hide_input_in_errors=True,
    )
    anthropic_api_key: SecretStr = SecretStr('')
    claude_model: str = ''
    agent_system_prompt: str = ''
    agent_max_turns: int = Field(default=1, ge=1, le=10)

    allowed_origins: str = ''
    agent_service_token: SecretStr = SecretStr('')

    @model_validator(mode='after')
    def valid_service_token(self):
        token = self.agent_service_token.get_secret_value()
        if len(token) < 32 or token.startswith('replace-'):
            raise ValueError('Run npm run setup to configure a private service token.')
        return self

    @property
    def api_key_configured(self) -> bool:
        key = self.anthropic_api_key.get_secret_value().strip()
        return bool(key) and key != 'sk-ant-replace-with-your-key'

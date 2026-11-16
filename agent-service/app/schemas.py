from pydantic import BaseModel, ConfigDict, Field, field_validator


class PromptRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra='forbid')
    prompt: str = Field(min_length=1, max_length=4000, strict=True)


    @field_validator('prompt')
    @classmethod
    def utf16_limit(cls, value: str) -> str:
        if len(value.encode('utf-16-le')) // 2 > 4000:
            raise ValueError('Prompt exceeds 4000 UTF-16 units.')
        return value


class AgentResponse(BaseModel):
    result: str
    num_turns: int
    duration_ms: int
    total_cost_usd: float | None
    is_error: bool


class ErrorResponse(BaseModel):
    detail: str

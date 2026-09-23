"""
LLM Provider Abstraction Module.
Part 0.13F - Ocean Guard AI

Provides configurable LLM provider integrations (Mock, Gemini, OpenAI) with:
  - Low-temperature enforcement (<= 0.2) for strictly grounded evidence summarization
  - Strict secret masking (API keys are never logged or exposed in responses)
  - Controlled timeout handling and explicit error states
  - Abstract interface for deterministic testing without live paid APIs
"""

import os
import json
import logging
from abc import ABC, abstractmethod
from typing import Dict, Any, Optional, Tuple

import httpx

logger = logging.getLogger(__name__)


class LLMProviderError(Exception):
    """Raised when LLM configuration, network request, or response parsing fails."""
    def __init__(self, message: str, status_code: str = "LLM_GENERATION_FAILED"):
        super().__init__(message)
        self.status_code = status_code


class LLMConfig:
    """
    Configuration for LLM synthesis provider.
    Strictly enforces low temperature and masks credentials in repr/str.
    """
    def __init__(
        self,
        provider: Optional[str] = None,
        model: Optional[str] = None,
        api_key: Optional[str] = None,
        timeout_seconds: Optional[float] = None,
        temperature: Optional[float] = None,
        max_output_tokens: Optional[int] = None,
    ):
        self.provider = (provider or os.getenv("LLM_PROVIDER", "mock")).lower()
        self.model = model or os.getenv("LLM_MODEL", "gemini-1.5-pro")
        self.api_key = api_key or os.getenv("LLM_API_KEY", None)
        self.timeout_seconds = float(timeout_seconds or os.getenv("LLM_TIMEOUT_SECONDS", "30.0"))
        
        # Enforce low temperature guardrail (max 0.20) for factual evidence summarization
        raw_temp = float(temperature if temperature is not None else os.getenv("LLM_TEMPERATURE", "0.10"))
        self.temperature = min(0.20, max(0.0, raw_temp))
        
        self.max_output_tokens = int(max_output_tokens or os.getenv("LLM_MAX_TOKENS", "4096"))

    def is_configured(self) -> bool:
        """Returns True if the provider is mock or if external API keys are provided."""
        if self.provider == "mock":
            return True
        return bool(self.api_key and len(self.api_key.strip()) > 0)

    def to_dict(self, mask_secrets: bool = True) -> Dict[str, Any]:
        """Serialize configuration without exposing secrets."""
        key_repr = None
        if self.api_key:
            key_repr = f"***...{self.api_key[-4:]}" if (mask_secrets and len(self.api_key) > 4) else "***MASKED***"
        
        return {
            "provider": self.provider,
            "model": self.model,
            "apiKeyConfigured": bool(self.api_key),
            "apiKeyPreview": key_repr,
            "timeoutSeconds": self.timeout_seconds,
            "temperature": self.temperature,
            "maxOutputTokens": self.max_output_tokens,
            "isConfigured": self.is_configured(),
        }

    def __repr__(self) -> str:
        return f"LLMConfig(provider={self.provider}, model={self.model}, temp={self.temperature}, configured={self.is_configured()})"


class BaseLLMProvider(ABC):
    """Abstract interface for LLM synthesis engines."""
    def __init__(self, config: LLMConfig):
        self.config = config

    @abstractmethod
    def generate_completion(self, system_prompt: str, user_prompt: str) -> str:
        """Generate text completion from prompt pair."""
        pass


class MockLLMProvider(BaseLLMProvider):
    """
    Deterministic Mock Provider.
    Used for unit testing, offline CI/CD, and fallback execution without external API dependencies.
    """
    def __init__(self, config: Optional[LLMConfig] = None, mock_response_override: Optional[str] = None):
        super().__init__(config or LLMConfig(provider="mock"))
        self.mock_response_override = mock_response_override

    def generate_completion(self, system_prompt: str, user_prompt: str) -> str:
        if self.mock_response_override is not None:
            return self.mock_response_override
        # When no override is set, synthesis module will use structured deterministic generator
        return "__DETERMINISTIC_SYNTHESIS_REQUESTED__"


class GeminiLLMProvider(BaseLLMProvider):
    """
    Google Gemini API Provider.
    Invokes Gemini 1.5 Pro / Flash with JSON response schema enforcement.
    """
    def generate_completion(self, system_prompt: str, user_prompt: str) -> str:
        if not self.config.api_key:
            raise LLMProviderError(
                "Gemini API key is missing. Set LLM_API_KEY environment variable.",
                status_code="LLM_NOT_CONFIGURED"
            )

        url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.config.model}:generateContent?key={self.config.api_key}"
        
        payload = {
            "system_instruction": {
                "parts": [{"text": system_prompt}]
            },
            "contents": [
                {
                    "role": "user",
                    "parts": [{"text": user_prompt}]
                }
            ],
            "generationConfig": {
                "temperature": self.config.temperature,
                "maxOutputTokens": self.config.max_output_tokens,
                "responseMimeType": "application/json"
            }
        }

        try:
            with httpx.Client(timeout=self.config.timeout_seconds) as client:
                response = client.post(url, json=payload)
                
            if response.status_code != 200:
                logger.error("[GeminiLLMProvider] API error: status=%d", response.status_code)
                raise LLMProviderError(
                    f"Gemini API returned HTTP {response.status_code}",
                    status_code="LLM_GENERATION_FAILED"
                )

            data = response.json()
            candidates = data.get("candidates", [])
            if not candidates:
                raise LLMProviderError("Gemini returned empty candidates list", status_code="LLM_GENERATION_FAILED")
            
            parts = candidates[0].get("content", {}).get("parts", [])
            if not parts:
                raise LLMProviderError("Gemini returned empty content parts", status_code="LLM_GENERATION_FAILED")
                
            return parts[0].get("text", "")

        except httpx.TimeoutException:
            logger.error("[GeminiLLMProvider] Request timed out after %.1f seconds", self.config.timeout_seconds)
            raise LLMProviderError(f"LLM request timed out after {self.config.timeout_seconds}s", status_code="LLM_GENERATION_FAILED")
        except Exception as e:
            if isinstance(e, LLMProviderError):
                raise e
            logger.error("[GeminiLLMProvider] Request exception: %s", str(e))
            raise LLMProviderError(f"Gemini provider execution failed: {str(e)}", status_code="LLM_GENERATION_FAILED")


class OpenAILLMProvider(BaseLLMProvider):
    """
    OpenAI Chat Completions Provider.
    Invokes OpenAI GPT models with json_object format enforcement.
    """
    def generate_completion(self, system_prompt: str, user_prompt: str) -> str:
        if not self.config.api_key:
            raise LLMProviderError(
                "OpenAI API key is missing. Set LLM_API_KEY environment variable.",
                status_code="LLM_NOT_CONFIGURED"
            )

        url = "https://api.openai.com/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.config.api_key}",
            "Content-Type": "application/json"
        }
        payload = {
            "model": self.config.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            "temperature": self.config.temperature,
            "max_tokens": self.config.max_output_tokens,
            "response_format": {"type": "json_object"}
        }

        try:
            with httpx.Client(timeout=self.config.timeout_seconds) as client:
                response = client.post(url, headers=headers, json=payload)
                
            if response.status_code != 200:
                logger.error("[OpenAILLMProvider] API error: status=%d", response.status_code)
                raise LLMProviderError(
                    f"OpenAI API returned HTTP {response.status_code}",
                    status_code="LLM_GENERATION_FAILED"
                )

            data = response.json()
            choices = data.get("choices", [])
            if not choices:
                raise LLMProviderError("OpenAI returned empty choices list", status_code="LLM_GENERATION_FAILED")
                
            return choices[0].get("message", {}).get("content", "")

        except httpx.TimeoutException:
            logger.error("[OpenAILLMProvider] Request timed out after %.1f seconds", self.config.timeout_seconds)
            raise LLMProviderError(f"LLM request timed out after {self.config.timeout_seconds}s", status_code="LLM_GENERATION_FAILED")
        except Exception as e:
            if isinstance(e, LLMProviderError):
                raise e
            logger.error("[OpenAILLMProvider] Request exception: %s", str(e))
            raise LLMProviderError(f"OpenAI provider execution failed: {str(e)}", status_code="LLM_GENERATION_FAILED")


def get_llm_provider(config: Optional[LLMConfig] = None) -> BaseLLMProvider:
    """Factory creating the appropriate LLM provider based on configuration."""
    cfg = config or LLMConfig()
    
    if cfg.provider == "mock":
        return MockLLMProvider(cfg)
    elif cfg.provider in ("gemini", "google"):
        return GeminiLLMProvider(cfg)
    elif cfg.provider in ("openai", "gpt"):
        return OpenAILLMProvider(cfg)
    else:
        logger.warning("[LLMProvider] Unknown provider '%s', defaulting to MockLLMProvider", cfg.provider)
        return MockLLMProvider(cfg)

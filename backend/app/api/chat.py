from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List
import httpx
import os
import json

router = APIRouter()

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    model: str
    provider: str = "ollama"
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    context: Optional[str] = None


class ChatResponse(BaseModel):
    role: str
    content: str


@router.post("/chat", response_model=ChatResponse)
async def chat_with_llm(request: ChatRequest):
    """
    Forward chat messages to the selected LLM provider and return response.
    """
    system_prompt = "You are a research assistant for a platform containing language, archaeology, and genetics data."
    if request.context:
        system_prompt += (
            f" Here is some context about the current data view: {request.context}"
        )

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            if request.provider == "ollama":
                url = request.base_url or OLLAMA_BASE_URL
                messages = [{"role": "system", "content": system_prompt}]
                for msg in request.messages:
                    messages.append({"role": msg.role, "content": msg.content})

                headers = {"Content-Type": "application/json"}
                if request.api_key:
                    headers["Authorization"] = f"Bearer {request.api_key}"

                response = await client.post(
                    f"{url}/api/chat",
                    headers=headers,
                    json={
                        "model": request.model,
                        "messages": messages,
                        "stream": False,
                    },
                )
                if response.status_code != 200:
                    try:
                        error_detail = response.json().get("error", response.text)
                        if "not found" in error_detail.lower():
                            error_detail = f"Model '{request.model}' not found in Ollama. Please run 'ollama pull {request.model}' or change the model in settings."
                        else:
                            error_detail = f"Ollama error: {error_detail}"
                    except:
                        error_detail = f"Ollama error: {response.text}"
                    raise HTTPException(
                        status_code=response.status_code, detail=error_detail
                    )

                result = response.json()
                return ChatResponse(
                    role="assistant",
                    content=result.get("message", {}).get(
                        "content", "No response from LLM"
                    ),
                )

            elif request.provider == "openai":
                if not request.api_key:
                    raise HTTPException(
                        status_code=400, detail="OpenAI API key is required"
                    )

                messages = [{"role": "system", "content": system_prompt}]
                for msg in request.messages:
                    messages.append({"role": msg.role, "content": msg.content})

                response = await client.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {request.api_key}",
                        "Content-Type": "application/json",
                    },
                    json={"model": request.model, "messages": messages},
                )
                if response.status_code != 200:
                    raise HTTPException(
                        status_code=response.status_code,
                        detail=f"OpenAI error: {response.text}",
                    )

                result = response.json()
                return ChatResponse(
                    role="assistant", content=result["choices"][0]["message"]["content"]
                )

            elif request.provider == "anthropic":
                if not request.api_key:
                    raise HTTPException(
                        status_code=400, detail="Anthropic API key is required"
                    )

                # Anthropic uses a separate 'system' parameter for the system prompt
                messages = []
                for msg in request.messages:
                    messages.append({"role": msg.role, "content": msg.content})

                response = await client.post(
                    "https://api.anthropic.com/v1/messages",
                    headers={
                        "x-api-key": request.api_key,
                        "anthropic-version": "2023-06-01",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": request.model,
                        "messages": messages,
                        "system": system_prompt,
                        "max_tokens": 1024,
                    },
                )
                if response.status_code != 200:
                    raise HTTPException(
                        status_code=response.status_code,
                        detail=f"Anthropic error: {response.text}",
                    )

                result = response.json()
                return ChatResponse(
                    role="assistant", content=result["content"][0]["text"]
                )

            elif request.provider == "gemini":
                if not request.api_key:
                    raise HTTPException(
                        status_code=400, detail="Gemini API key is required"
                    )

                # Gemini format: contents: [{role: 'user', parts: [{text: '...'}]}]
                # System prompt is prepended or handled via system_instruction (v1beta)
                contents = []
                # Combine system prompt with the first user message or handle it properly
                # For simplicity, we'll prepend it to the first message if it's user, or just as a separate part

                # Convert messages to Gemini format
                # backend/app/api/chat.py: request.messages needs to be converted
                for msg in request.messages:
                    role = "user" if msg.role == "user" else "model"
                    contents.append({"role": role, "parts": [{"text": msg.content}]})

                # Prepend system prompt to the first user message content or add as system instruction
                # We'll use the 'system_instruction' field available in v1beta

                response = await client.post(
                    f"https://generativelanguage.googleapis.com/v1beta/models/{request.model}:generateContent?key={request.api_key}",
                    json={
                        "contents": contents,
                        "system_instruction": {"parts": [{"text": system_prompt}]},
                    },
                )
                if response.status_code != 200:
                    raise HTTPException(
                        status_code=response.status_code,
                        detail=f"Gemini error: {response.text}",
                    )

                result = response.json()
                return ChatResponse(
                    role="assistant",
                    content=result["candidates"][0]["content"]["parts"][0]["text"],
                )

            else:
                raise HTTPException(
                    status_code=400, detail=f"Unsupported provider: {request.provider}"
                )

    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="LLM request timeout")
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/models")
async def list_models(
    provider: str, api_key: Optional[str] = None, base_url: Optional[str] = None
):
    """
    Fetch available models for a given provider.
    """
    try:
        # Use explicit connect and read timeouts to prevent hanging
        timeout = httpx.Timeout(connect=2.0, read=3.0, write=3.0, pool=3.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            if provider == "ollama":
                url = base_url or OLLAMA_BASE_URL
                headers = {}
                if api_key:
                    headers["Authorization"] = f"Bearer {api_key}"

                response = await client.get(f"{url}/api/tags", headers=headers)
                if response.status_code == 200:
                    models = [m["name"] for m in response.json().get("models", [])]
                    return {"models": models}
                else:
                    return {"models": [], "error": f"Ollama API error: {response.text}"}

            elif provider == "openai":
                if not api_key:
                    return {"models": [], "error": "API key required"}
                response = await client.get(
                    "https://api.openai.com/v1/models",
                    headers={"Authorization": f"Bearer {api_key}"},
                )
                if response.status_code == 200:
                    # Filter for chat models
                    models = [
                        m["id"]
                        for m in response.json().get("data", [])
                        if "gpt" in m["id"]
                    ]
                    return {"models": sorted(models)}
                else:
                    return {
                        "models": [],
                        "error": f"OpenAI API error: {response.status_code}",
                    }

            elif provider == "gemini":
                if not api_key:
                    return {"models": [], "error": "API key required"}
                response = await client.get(
                    f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}"
                )
                if response.status_code == 200:
                    models = [
                        m["name"].split("/")[-1]
                        for m in response.json().get("models", [])
                        if "generateContent" in m.get("supportedGenerationMethods", [])
                    ]
                    return {"models": sorted(models)}
                else:
                    return {
                        "models": [],
                        "error": f"Gemini API error: {response.status_code}",
                    }

            elif provider == "anthropic":
                # Anthropic doesn't have a public models list API
                return {
                    "models": [
                        "claude-3-5-sonnet-20241022",
                        "claude-3-5-sonnet-20240620",
                        "claude-3-5-haiku-20241022",
                        "claude-3-opus-20240229",
                        "claude-3-sonnet-20240229",
                        "claude-3-haiku-20240307",
                        "claude-2.1",
                        "claude-2.0",
                        "claude-instant-1.2",
                    ]
                }

            return {"models": [], "error": f"Unknown provider: {provider}"}

    except httpx.ConnectError as e:
        return {"models": [], "error": f"Connection failed: {str(e)}"}
    except httpx.TimeoutException:
        return {"models": [], "error": "Request timeout"}
    except Exception as e:
        return {"models": [], "error": str(e)}

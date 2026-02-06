import React, { useState, useEffect } from 'react';

// Provider metadata only - NO hardcoded models
const PROVIDERS = [
  { 
    id: 'ollama', 
    name: 'Ollama (Local)', 
    placeholder: 'http://localhost:11434',
    requiresKey: false
  },
  { 
    id: 'ollama-cloud', 
    name: 'Ollama Cloud', 
    placeholder: 'Enter your Ollama Cloud key',
    requiresKey: true
  },
  { 
    id: 'openai', 
    name: 'OpenAI', 
    placeholder: 'sk-...',
    requiresKey: true
  },
  { 
    id: 'anthropic', 
    name: 'Anthropic', 
    placeholder: 'sk-ant-...',
    requiresKey: true
  },
  { 
    id: 'gemini', 
    name: 'Gemini', 
    placeholder: 'AIza...',
    requiresKey: true
  },
];

// Session-level cache for fetched models
const modelCache: Record<string, { models: string[], timestamp: number }> = {};
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

interface ChatInterfaceProps {
  onAddToMap?: (csvData: string, layerName: string) => void;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ onAddToMap }) => {

  const [isOpen, setIsOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<Array<{role: string, content: string, toolData?: any, thinkingTime?: number}>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [customModel, setCustomModel] = useState(false);
  const [sessionId] = useState(() => `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);

  // LLM Settings
  const [provider, setProvider] = useState(() => localStorage.getItem('chat_provider') || 'ollama');
  const [model, setModel] = useState(() => localStorage.getItem('chat_model') || 'llama2');
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('chat_api_key') || '');
  const [ollamaUrl, setOllamaUrl] = useState(() => localStorage.getItem('chat_ollama_url') || 'http://localhost:11434');
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [modelFetchError, setModelFetchError] = useState<string | null>(null);
  
  // File upload state
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    localStorage.setItem('chat_provider', provider);
    localStorage.setItem('chat_model', model);
    localStorage.setItem('chat_api_key', apiKey);
    localStorage.setItem('chat_ollama_url', ollamaUrl);
  }, [provider, model, apiKey, ollamaUrl]);

  // Fetch models dynamically with caching
  const fetchModels = React.useCallback(async (forceRefresh = false) => {
    const currentProvider = PROVIDERS.find(p => p.id === provider);
    
    console.log('[ChatInterface] Fetching models for provider:', provider, 'hasApiKey:', !!apiKey);
    
    // Don't fetch if provider requires key but none is provided
    if (currentProvider?.requiresKey && !apiKey && provider !== 'ollama') {
      console.log('[ChatInterface] API key required but not provided');
      setAvailableModels([]);
      setModelFetchError('API key required to fetch models');
      return;
    }

    // Build cache key
    const cacheKey = `${provider}-${apiKey || 'nokey'}-${provider === 'ollama' ? ollamaUrl : ''}`;
    
    // Check cache
    if (!forceRefresh && modelCache[cacheKey]) {
      const cached = modelCache[cacheKey];
      if (Date.now() - cached.timestamp < CACHE_DURATION) {
        console.log('[ChatInterface] Using cached models:', cached.models);
        setAvailableModels(cached.models);
        setModelFetchError(null);
        return;
      }
    }

    setIsFetchingModels(true);
    setModelFetchError(null);
    
    try {
      const query = new URLSearchParams({
        provider: provider === 'ollama-cloud' ? 'ollama' : provider,
        ...(apiKey && { api_key: apiKey }),
        ...(provider === 'ollama' && { base_url: ollamaUrl }),
        ...(provider === 'ollama-cloud' && { base_url: 'https://api.ollama.com' })
      });

      const url = `http://localhost:8000/api/v1/models?${query}`;
      console.log('[ChatInterface] Fetching from:', url);
      
      const response = await fetch(url);
      console.log('[ChatInterface] Response status:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log('[ChatInterface] Response data:', data);
        
        if (data.error) {
          console.error('[ChatInterface] API returned error:', data.error);
          setModelFetchError(data.error);
          setAvailableModels([]);
        } else if (data.models && data.models.length > 0) {
          console.log('[ChatInterface] Found models:', data.models);
          setAvailableModels(data.models);
          setModelFetchError(null);
          
          // Cache the result
          modelCache[cacheKey] = {
            models: data.models,
            timestamp: Date.now()
          };
          
          // Auto-select first model if current model is not set or not in list
          if (!model || !data.models.includes(model)) {
            console.log('[ChatInterface] Auto-selecting first model:', data.models[0]);
            setModel(data.models[0]);
          }
        } else {
          console.warn('[ChatInterface] No models in response');
          setModelFetchError('No models available');
          setAvailableModels([]);
        }
      } else {
        console.error('[ChatInterface] HTTP error:', response.status);
        setModelFetchError('Failed to fetch models from provider');
        setAvailableModels([]);
      }
    } catch (error) {
      console.error('[ChatInterface] Failed to fetch models:', error);
      setModelFetchError('Network error - check backend connection');
      setAvailableModels([]);
    } finally {
      setIsFetchingModels(false);
    }
  }, [provider, apiKey, ollamaUrl, model]);

  // Fetch models when provider/credentials change
  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  const handleProviderChange = (newProvider: string) => {
    setProvider(newProvider);
    setCustomModel(false);
    setModel(''); // Will be set by fetchModels
  };

  const handleSend = async () => {
    if (!message.trim() || isLoading) return;

    if (provider !== 'ollama' && !apiKey) {
      alert('Please enter an API key for ' + provider);
      setShowSettings(true);
      return;
    }

    const userMessage = { role: 'user', content: message };
    setMessages(prev => [...prev, userMessage]);
    setMessage('');
    setIsLoading(true);
    
    try {
      const response = await fetch('http://localhost:8000/api/v1/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMessage],
          model: model,
          provider: provider === 'ollama-cloud' ? 'ollama' : provider,
          api_key: apiKey || undefined,
          base_url: provider === 'ollama' ? ollamaUrl : (provider === 'ollama-cloud' ? 'https://api.ollama.com' : undefined),
          context: 'User is viewing a research platform with language, archaeology, and genetics data.',
          session_id: sessionId
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        setMessages(prev => [...prev, { 
          role: 'assistant', 
          content: data.content,
          toolData: data.tool_data,
          thinkingTime: data.thinking_time
        }]);
      } else {
        const errorData = await response.json().catch(() => ({}));
        setMessages(prev => [...prev, { 
          role: 'assistant', 
          content: `Error: ${errorData.detail || response.statusText}` 
        }]);
      }
    } catch (error) {
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: 'Connection failed. Please ensure the backend server is running.' 
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.csv')) {
      alert('Please upload a CSV file');
      return;
    }

    setUploadedFile(file);
    setIsLoading(true);
    
    // Read file content
    const reader = new FileReader();
    reader.onload = async (e) => {
      const csvContent = e.target?.result as string;
      
      // Add a system message locally
      const userMessage = { 
        role: 'user', 
        content: `I've uploaded a file: ${file.name}` 
      };
      setMessages(prev => [...prev, userMessage]);
      
      try {
        const response = await fetch('http://localhost:8000/api/v1/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [...messages, userMessage],
            model: model,
            provider: provider === 'ollama-cloud' ? 'ollama' : provider,
            api_key: apiKey || undefined,
            base_url: provider === 'ollama' ? ollamaUrl : (provider === 'ollama-cloud' ? 'https://api.ollama.com' : undefined),
            context: 'User is uploading a linguistic data file.',
            session_id: sessionId,
            uploaded_file: csvContent
          })
        });
        
        if (response.ok) {
          const data = await response.json();
          setMessages(prev => [...prev, { 
            role: 'assistant', 
            content: data.content,
            toolData: data.tool_data,
            thinkingTime: data.thinking_time
          }]);
        } else {
          setMessages(prev => [...prev, { 
            role: 'assistant', 
            content: 'Failed to process the uploaded file.' 
          }]);
        }
      } catch (error) {
        setMessages(prev => [...prev, { 
          role: 'assistant', 
          content: 'Connection error while uploading file.' 
        }]);
      } finally {
        setIsLoading(false);
        setUploadedFile(null); // Clear after upload
      }
    };
    reader.readAsText(file);
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };


  const downloadCSV = (csvData: string, filename: string) => {
    const blob = new Blob([csvData], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="absolute bottom-4 right-4 bg-blue-500 text-white rounded-full p-3 shadow-lg hover:bg-blue-600 z-40"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      </button>
    );
  }

  return (
    <div className="absolute bottom-4 right-4 w-96 h-125 bg-white rounded-lg shadow-xl z-40 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between p-3 border-b bg-blue-500 text-white">
        <div className="flex items-center space-x-2">
          <h3 className="font-semibold text-sm">Research Assistant</h3>
          <span className="text-xs bg-blue-400 px-1 rounded opacity-80">{model}</span>
        </div>
        <div className="flex items-center space-x-2">
          <button 
            onClick={() => setShowSettings(!showSettings)}
            className="text-white hover:text-gray-200"
            title="Settings"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
          <button
            onClick={() => setIsOpen(false)}
            className="text-white hover:text-gray-200 text-xl font-bold leading-none"
          >
            ×
          </button>
        </div>
      </div>
      
      <div className="flex-1 relative overflow-hidden flex flex-col">
        {showSettings && (
          <div className="absolute inset-0 bg-white z-10 p-4 space-y-3 border-b overflow-y-auto">
            <h4 className="font-bold text-gray-700 text-sm">Model Settings</h4>
            
            <div>
              <label className="block text-xs text-gray-500 mb-1">Provider</label>
              <select 
                value={provider}
                onChange={(e) => handleProviderChange(e.target.value)}
                className="w-full text-sm border rounded p-1.5 focus:ring-1 focus:ring-blue-500"
              >
                {PROVIDERS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>

            {provider === 'ollama' && (
              <div>
                <label className="block text-xs text-gray-500 mb-1">Ollama URL</label>
                <input 
                  type="text"
                  value={ollamaUrl}
                  onChange={(e) => setOllamaUrl(e.target.value)}
                  className="w-full text-sm border rounded p-1.5"
                  placeholder="http://localhost:11434"
                />
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs text-gray-500">Model</label>
                <div className="flex items-center space-x-2">
                  {isFetchingModels && (
                    <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                  )}
                  <button 
                    onClick={() => fetchModels(true)}
                    disabled={isFetchingModels}
                    className="text-[10px] text-blue-500 hover:underline disabled:opacity-50"
                    title="Refresh model list"
                  >
                    🔄 Refresh
                  </button>
                  <button 
                    onClick={() => setCustomModel(!customModel)}
                    className="text-[10px] text-blue-500 hover:underline"
                  >
                    {customModel ? 'Select from List' : 'Enter Custom'}
                  </button>
                </div>
              </div>
              
              {modelFetchError && !customModel && (
                <div className="text-[10px] text-red-500 mb-1 p-1 bg-red-50 rounded">
                  ⚠️ {modelFetchError}
                </div>
              )}
              
              {customModel ? (
                <input 
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full text-sm border rounded p-1.5"
                  placeholder="e.g. gpt-4, llama3:8b"
                />
              ) : (
                <select 
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full text-sm border rounded p-1.5"
                  disabled={isFetchingModels || availableModels.length === 0}
                >
                  {availableModels.length === 0 && !isFetchingModels ? (
                    <option value="">No models available - use Custom</option>
                  ) : (
                    availableModels.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))
                  )}
                </select>
              )}
            </div>

            {provider !== 'ollama' && (
              <div>
                <label className="block text-xs text-gray-500 mb-1">API Key</label>
                <input 
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="w-full text-sm border rounded p-1.5"
                  placeholder={PROVIDERS.find(p => p.id === provider)?.placeholder}
                />
              </div>
            )}

            <button 
              onClick={() => setShowSettings(false)}
              className="w-full bg-blue-500 text-white py-2 mt-2 rounded text-sm hover:bg-blue-600 transition shadow-sm"
            >
              Save & Close
            </button>
          </div>
        )}

        <div className="flex-1 p-3 overflow-y-auto space-y-3 bg-gray-50">
          {messages.length === 0 && (
            <div className="text-center mt-10 text-gray-400">
              <p className="text-sm">Start a conversation about the research data.</p>
            </div>
          )}
          {messages.map((msg, index) => (
            <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] p-2 rounded-lg text-sm ${
                msg.role === 'user' 
                  ? 'bg-blue-500 text-white rounded-br-none' 
                  : 'bg-white border text-gray-800 rounded-bl-none shadow-sm'
              }`}>
                <div className="whitespace-pre-wrap">{msg.content}</div>

                {msg.role === 'assistant' && msg.thinkingTime !== undefined && (
                  <div className="mt-1 text-[10px] text-gray-400 italic flex items-center gap-1 border-t border-gray-100 pt-1">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Thinking time: {msg.thinkingTime}s
                  </div>
                )}
                
                {/* Display CSV action buttons if tool data is available */}
                {msg.toolData?.result?.csv && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      onClick={() => downloadCSV(
                        msg.toolData.result.csv, 
                        msg.toolData.result.filename || `linguistic_data_${Date.now()}.csv`
                      )}
                      className="px-3 py-1 bg-green-500 text-white text-xs rounded hover:bg-green-600 transition flex items-center gap-1"
                    >
                      📥 Download CSV
                      {msg.toolData.result.row_count && (
                        <span className="opacity-75">({msg.toolData.result.row_count} rows)</span>
                      )}
                    </button>
                    {onAddToMap && msg.toolData.result.csv && msg.toolData.result.csv.trim().split('\n').length > 1 && (
                      <button
                        onClick={() => {
                          try {
                            onAddToMap(
                              msg.toolData.result.csv,
                              msg.toolData.tool || `layer_${Date.now()}`
                            );
                            // Visual feedback
                            const btn = document.activeElement as HTMLButtonElement;
                            if (btn) {
                              btn.textContent = '✅ Added!';
                              btn.disabled = true;
                              setTimeout(() => {
                                btn.textContent = '🗺️ Add to Map';
                                btn.disabled = false;
                              }, 2000);
                            }
                          } catch (e) {
                            console.error('Failed to add to map:', e);
                          }
                        }}
                        className="px-3 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600 transition flex items-center gap-1 disabled:opacity-50"
                      >
                        🗺️ Add to Map
                      </button>
                    )}
                  </div>
                )}


                {/* Display wordlist if available */}
                {msg.toolData?.result?.wordlist && msg.toolData.result.wordlist.length > 0 && (
                  <div className="mt-2 p-2 bg-blue-50 rounded text-xs">
                    <div className="font-semibold text-blue-700 mb-1">Wordlist ({msg.toolData.result.wordlist.length} concepts)</div>
                    <div className="text-gray-600 flex flex-wrap gap-1">
                      {msg.toolData.result.wordlist.slice(0, 15).map((word: string, i: number) => (
                        <span key={i} className="bg-white px-1.5 py-0.5 rounded border">{word}</span>
                      ))}
                      {msg.toolData.result.wordlist.length > 15 && (
                        <span className="text-gray-400">+{msg.toolData.result.wordlist.length - 15} more</span>
                      )}
                    </div>
                  </div>
                )}

              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-white border p-2 rounded-lg rounded-bl-none shadow-sm">
                <div className="flex flex-col space-y-2">
                  {uploadedFile && (
                    <div className="text-xs text-blue-500 font-medium italic">
                      Processing {uploadedFile.name}...
                    </div>
                  )}
                  <div className="flex space-x-1">
                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"></div>
                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce delay-75"></div>
                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce delay-150"></div>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>
        
        <div className="p-3 bg-white border-t">
          <div className="flex space-x-2">
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Ask about the data or start a linguistic analysis..."
              className="flex-1 border rounded p-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              disabled={isLoading}
            />
            
            {/* File upload button */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-2 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300 transition"
              title="Upload CSV file"
              disabled={isLoading}
            >
              📎
            </button>
            
            <button
              onClick={handleSend}
              disabled={isLoading || !message.trim()}
              className="px-4 py-2 bg-blue-500 text-white rounded text-sm hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-sm"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatInterface;
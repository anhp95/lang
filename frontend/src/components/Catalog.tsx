import React, { useState, useEffect, useMemo, useRef } from 'react';

interface CatalogProps {
  onAddDataset: (dataType: string, dataset: string, filters?: any) => void;
  onUploadData: (data: any, filteredData: any, name: string, coords: {lat: string, lon: string}, type: string) => void;
  onClose: () => void;
}

const Catalog: React.FC<CatalogProps> = ({ onAddDataset, onUploadData, onClose }) => {
  const [catalog, setCatalog] = useState<Record<string, Array<{name: string, count: number}>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [glossOptions, setGlossOptions] = useState<string[]>([]);
  const [selectedGlosses, setSelectedGlosses] = useState<string[]>([]);
  const [glossSearch, setGlossSearch] = useState('');
  const [isGlossDropdownOpen, setIsGlossDropdownOpen] = useState(false);
  const [lastSelectedGloss, setLastSelectedGloss] = useState<string | null>(null);
  
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsGlossDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const MAX_SIZE = 50 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
        setError(`File is too large (${(file.size / (1024 * 1024)).toFixed(1)}MB). Maximum allowed is 50MB.`);
        return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);

    const xhr = new XMLHttpRequest();
    
    xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
            const percent = Math.round((event.loaded / event.total) * 100);
            setUploadProgress(percent * 0.9);
        }
    });

    xhr.onload = () => {
        setIsUploading(false);
        setUploadProgress(100);
        if (xhr.status >= 200 && xhr.status < 300) {
            const result = JSON.parse(xhr.responseText);
            onUploadData(result.data, result.filtered_data || result.data, result.name, result.coordinates, result.type);
        } else {
            const err = JSON.parse(xhr.responseText || '{"detail":"Upload failed"}');
            setError(err.detail || 'Upload failed');
        }
    };

    xhr.onerror = () => {
        setIsUploading(false);
        setError('Network error during upload');
    };

    xhr.open('POST', 'http://localhost:8000/api/v1/upload');
    xhr.send(formData);
  };

  const getFilteredCatalog = useMemo(() => {
    if (!catalog) return [];
    const result: Array<{type: string, datasets: Array<{name: string, count: number}>}> = [];
    Object.entries(catalog).forEach(([type, datasets]) => {
        if (selectedType !== 'all' && selectedType !== type) return;
        const filtered = datasets.filter(ds => 
            !search || (ds && ds.name && ds.name.toLowerCase().includes(search.toLowerCase()))
        );
        if (filtered.length > 0) {
            result.push({ type, datasets: filtered });
        }
    });
    return result;
  }, [catalog, search, selectedType]);

  const currentlyVisibleDatasets = useMemo(() => {
    return getFilteredCatalog.flatMap(cat => cat.datasets.map(ds => ds.name));
  }, [getFilteredCatalog]);

  useEffect(() => {
    if (selectedType !== 'spoken_language' && selectedType !== 'all') return;
    const params = new URLSearchParams();
    if (search) {
        currentlyVisibleDatasets.slice(0, 100).forEach(ds => params.append('datasets', ds));
    }
    fetch(`http://localhost:8000/api/v1/glosses?${params.toString()}`)
      .then(res => res.json())
      .then(data => {
          if (data && data.glosses) {
              setGlossOptions(data.glosses);
          }
      })
      .catch(err => console.error("Failed to load glosses", err));
  }, [currentlyVisibleDatasets, selectedType, search]);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (selectedGlosses.length > 0) {
        selectedGlosses.forEach(g => params.append('glosses', g));
    }
    fetch(`http://localhost:8000/api/v1/catalog?${params.toString()}`)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        return res.json();
      })
      .then(data => {
        setCatalog(data);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, [selectedGlosses]);

  const toggleGloss = (gloss: string) => {
    const isAdding = !selectedGlosses.includes(gloss);
    setSelectedGlosses(prev => 
        isAdding ? [...prev, gloss] : prev.filter(g => g !== gloss)
    );
    if (isAdding) {
      setLastSelectedGloss(gloss);
      setTimeout(() => setLastSelectedGloss(null), 1000);
    }
  };

  const handleSelectAllGlosses = () => {
    const matchingGlosses = glossOptions.filter(g => 
        !glossSearch || g.toLowerCase().includes(glossSearch.toLowerCase())
    );
    setSelectedGlosses(prev => {
        const newSet = new Set([...prev, ...matchingGlosses]);
        return Array.from(newSet);
    });
    setGlossSearch('');
  };

  const visibleSelectedGlosses = selectedGlosses.slice(0, 5);
  const hiddenCount = selectedGlosses.length > 5 ? selectedGlosses.length - 5 : 0;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[95vh] flex flex-col border border-white/20 animate-in fade-in zoom-in duration-200 overflow-hidden">
        <div className="p-5 border-b flex justify-between items-center bg-gray-50 rounded-t-xl">
          <div>
            <h2 className="text-xl font-black text-gray-800 tracking-tight">Data Catalog</h2>
            <p className="text-[10px] text-gray-400 uppercase font-black tracking-widest mt-0.5">Physical Dataset Explorer</p>
          </div>
          <button 
            onClick={onClose} 
            className="text-gray-400 hover:text-gray-800 transition-colors bg-gray-200/50 hover:bg-gray-200 rounded-full w-8 h-8 flex items-center justify-center text-xl font-bold"
          >
            &times;
          </button>
        </div>

        {/* Filter Bar */}
        <div className="p-5 bg-white border-b space-y-4">
            <div className="flex flex-col lg:flex-row items-stretch gap-4">
                {/* Dataset Filter */}
                <div className="flex-1 space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Dataset Name</label>
                    <div className="relative">
                        <input 
                            type="text" 
                            list="dataset-suggestions"
                            placeholder="Search dataset (e.g. kusunda)..." 
                            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none transition-all"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                        <svg className="w-4 h-4 text-gray-400 absolute left-3.5 top-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <datalist id="dataset-suggestions">
                            {catalog && Object.entries(catalog)
                                .filter(([type]) => selectedType === 'all' || selectedType === type)
                                .flatMap(([_, datasets]) => datasets)
                                .filter(ds => ds && ds.name)
                                .map((ds, idx) => (
                                    <option key={`${ds.name}-${idx}-suggest`} value={ds.name} />
                                ))
                            }
                        </datalist>
                    </div>
                </div>

                {/* Concepticon Gloss Filter */}
                <div 
                    ref={dropdownRef}
                    className={`flex-[1.5] space-y-1.5 transition-opacity duration-300 ${selectedType === 'spoken_language' || selectedType === 'all' ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}
                >
                    <div className="flex items-center justify-between ml-1">
                        <div className="flex items-center gap-3">
                            <label className="text-[10px] font-black uppercase tracking-widest text-blue-600">Concepticon Gloss</label>
                            <span className="text-[9px] font-black bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full uppercase tracking-tighter">
                                {selectedGlosses.length} selected
                            </span>
                            <button 
                                onClick={handleSelectAllGlosses}
                                className="text-[10px] font-black text-blue-600 hover:text-blue-800 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100 transition-colors"
                            >
                                SELECT ALL {glossSearch ? 'MATCHING' : ''}
                            </button>
                        </div>
                        {selectedGlosses.length > 0 && (
                            <button 
                                onClick={() => setSelectedGlosses([])}
                                className="text-[10px] font-bold text-red-500 hover:text-red-700 underline"
                            >
                                Clear All
                            </button>
                        )}
                    </div>
                    <div className="relative group/gloss">
                        <div className="absolute left-3 top-3 z-10 transition-transform group-hover/gloss:scale-110">
                            <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                            </svg>
                        </div>
                        
                        {/* Selector Trigger Area */}
                        <div 
                            onClick={() => setIsGlossDropdownOpen(!isGlossDropdownOpen)}
                            className="w-full flex flex-wrap items-center gap-1.5 pl-10 pr-4 py-1.5 border border-blue-100 rounded-xl bg-blue-50/30 focus-within:ring-2 focus-within:ring-blue-500 focus-within:bg-white min-h-11.5 transition-all relative overflow-hidden"
                        >
                            {visibleSelectedGlosses.map(gloss => (
                                <span 
                                    key={gloss} 
                                    className={`px-2 py-0.5 bg-blue-600 text-white rounded-lg text-[10px] font-black flex items-center gap-1 shadow-sm transition-all duration-300 ${lastSelectedGloss === gloss ? 'ring-4 ring-blue-300 scale-110' : ''}`}
                                >
                                    {gloss}
                                    <button onClick={(e) => { e.stopPropagation(); toggleGloss(gloss); }} className="hover:text-blue-200 font-bold ml-0.5">&times;</button>
                                </span>
                            ))}
                            {hiddenCount > 0 && (
                                <span className="px-2 py-0.5 bg-gray-200 text-gray-600 rounded-lg text-[10px] font-black shadow-sm">
                                    ... +{hiddenCount} more
                                </span>
                            )}
                            {selectedGlosses.length === 0 && (
                                <span className="text-gray-400 text-sm py-1">View all glosses...</span>
                            )}
                            <div className="absolute right-3 top-3 text-blue-300">
                                <svg className={`w-4 h-4 transition-transform duration-300 ${isGlossDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                            </div>
                        </div>
                        
                        {/* Dropdown Menu */}
                        {isGlossDropdownOpen && (
                            <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-100 rounded-xl shadow-2xl z-60 animate-in fade-in slide-in-from-top-2 duration-200 flex flex-col overflow-hidden max-h-[400px]">
                                <div className="p-3 border-b bg-gray-50/50">
                                    <div className="relative">
                                        <input 
                                            type="text" 
                                            autoFocus
                                            placeholder="Search glosses (e.g. HAND, WATER)..." 
                                            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                            value={glossSearch}
                                            onChange={(e) => setGlossSearch(e.target.value)}
                                            onClick={(e) => e.stopPropagation()}
                                        />
                                        <svg className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                        </svg>
                                    </div>
                                </div>
                                <div className="overflow-auto py-2 custom-scrollbar">
                                    {glossOptions
                                        .filter(g => !glossSearch || g.toLowerCase().includes(glossSearch.toLowerCase()))
                                        .slice(0, 100) // Performance cap for list rendering
                                        .map(g => {
                                            const isSelected = selectedGlosses.includes(g);
                                            return (
                                                <button 
                                                    key={g} 
                                                    className={`w-full text-left px-5 py-2.5 text-xs font-bold flex items-center justify-between group transition-colors ${isSelected ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50 text-gray-700'}`}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        toggleGloss(g);
                                                    }}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${isSelected ? 'bg-blue-600 border-blue-600' : 'border-gray-300 bg-white group-hover:border-blue-400'}`}>
                                                            {isSelected && (
                                                                <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                                </svg>
                                                            )}
                                                        </div>
                                                        <span>{g}</span>
                                                    </div>
                                                    {lastSelectedGloss === g && (
                                                        <span className="text-[9px] font-black text-blue-500 uppercase animate-bounce">Added!</span>
                                                    )}
                                                </button>
                                            );
                                        })
                                    }
                                    {glossOptions.filter(g => !glossSearch || g.toLowerCase().includes(glossSearch.toLowerCase())).length === 0 && (
                                        <div className="px-5 py-8 text-center">
                                            <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">No matching glosses</p>
                                            <p className="text-[10px] text-gray-300 mt-1">Try a different search term</p>
                                        </div>
                                    )}
                                </div>
                                {glossOptions.length > 100 && !glossSearch && (
                                    <div className="p-2 text-center bg-gray-50 border-t">
                                        <p className="text-[9px] text-gray-400 font-bold uppercase">Showing first 100 of {glossOptions.length} results</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Type Select */}
                <div className="w-full lg:w-48 space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Category</label>
                    <select 
                        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none cursor-pointer font-bold appearance-none bg-no-repeat bg-position-[right_0.75rem_center] bg-size-[1em_1em]"
                        value={selectedType}
                        onChange={(e) => setSelectedType(e.target.value)}
                        style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")` }}
                    >
                        <option value="all">📁 All Types</option>
                        <option value="spoken_language">🗣️ Spoken Language</option>
                        <option value="sign_language">🤟 Sign Language</option>
                        <option value="archaeology">🏺 Archaeology</option>
                        <option value="genetics">🧬 Genetics</option>
                    </select>
                </div>
            </div>
        </div>
        
        {/* Upload Banner */}
        <div className="px-6 py-3 bg-linear-to-r from-blue-600 to-indigo-700 flex items-center justify-between shadow-inner">
            <div className="flex items-center space-x-4">
                <div className="p-2 bg-white/20 rounded-lg backdrop-blur-md">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a1 1 0 001 1h14a1 1 0 001-1v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                </div>
                <div>
                    <h3 className="text-xs font-black text-white uppercase tracking-wider">Cloud Upload</h3>
                    <p className="text-[10px] text-blue-100 opacity-80 font-bold">CSV/GeoJSON • Multiple Formats • SSL Encrypted</p>
                </div>
            </div>
            <label className={`
                px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-[0.15em] transition-all cursor-pointer shadow-lg
                ${isUploading ? 'bg-white/10 text-white/40 cursor-wait' : 'bg-white text-blue-600 hover:scale-105 active:scale-95'}
            `}>
                {isUploading ? `Uploading ${Math.round(uploadProgress)}%` : 'Select Files'}
                <input type="file" className="hidden" accept=".csv,.geojson,.json" onChange={handleFileChange} disabled={isUploading} />
            </label>
        </div>
        
        <div className="flex-1 overflow-auto p-6 space-y-8 custom-scrollbar bg-gray-50/50">
          {loading && (
            <div className="flex flex-col items-center justify-center py-24 space-y-5">
              <div className="relative">
                <div className="w-16 h-16 border-4 border-blue-100 rounded-full animate-pulse"></div>
                <div className="absolute inset-0 border-t-4 border-blue-600 rounded-full animate-spin"></div>
              </div>
              <p className="text-[11px] font-black text-gray-400 animate-pulse uppercase tracking-[0.3em]">Optimizing Index...</p>
            </div>
          )}

          {error && (
            <div className="bg-white border-2 border-red-50 rounded-2xl p-10 text-center shadow-xl shadow-red-50 max-w-md mx-auto">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 className="text-lg font-black text-gray-800 mb-2 uppercase tracking-tight">Backend Connection Failed</h3>
              <p className="text-sm text-gray-400 mb-8 leading-relaxed">{error}</p>
              <button 
                onClick={() => window.location.reload()} 
                className="w-full bg-red-600 text-white text-xs py-4 rounded-xl font-black uppercase tracking-widest hover:bg-red-700 transition-colors shadow-lg shadow-red-200"
              >
                Reconnect to Server
              </button>
            </div>
          )}

          {!loading && !error && getFilteredCatalog.length === 0 && (
            <div className="text-center py-32 opacity-40">
                <svg className="w-20 h-20 text-gray-300 mx-auto mb-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <p className="text-sm text-gray-400 font-black uppercase tracking-[0.2em]">Zero Results Found</p>
                <p className="text-[10px] text-gray-300 font-bold mt-2">Try relaxing your search criteria</p>
            </div>
          )}

          {!loading && !error && getFilteredCatalog.map(({type, datasets}) => (
            <div key={type} className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex items-center space-x-4">
                <span className="text-[11px] font-black uppercase tracking-[0.25em] text-blue-600 whitespace-nowrap">
                    {type.replace('_', ' ')}
                </span>
                <div className="h-0.5 bg-linear-to-r from-blue-100 to-transparent flex-1 rounded-full"></div>
                <span className="text-[10px] font-bold text-gray-300 tabular-nums">{datasets.length} Datasets</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {datasets.map((ds) => (
                  <div 
                    key={`${type}-${ds.name}`} 
                    className="group relative p-5 bg-white border border-gray-100 rounded-2xl hover:border-blue-400 hover:shadow-2xl hover:shadow-blue-100/50 cursor-pointer transition-all duration-300 active:scale-95"
                    onClick={() => onAddDataset(type, ds.name, { glosses: selectedGlosses })}
                  >
                    <div className="flex flex-col h-full">
                        <div className="flex justify-between items-start mb-3">
                            <span className="text-sm font-black text-gray-800 transition-colors group-hover:text-blue-700 break-all pr-8">{ds.name}</span>
                            <div className="absolute top-4 right-4 p-2 bg-blue-50 text-blue-600 rounded-xl opacity-0 scale-50 group-hover:opacity-100 group-hover:scale-100 transition-all duration-300 shadow-sm border border-blue-100">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
                                </svg>
                            </div>
                        </div>
                        <div className="mt-auto flex items-center space-x-3">
                            <div className="flex -space-x-1">
                                {[1, 2, 3].map(i => (
                                    <div key={i} className="w-4 h-4 rounded-full border border-white bg-blue-100 flex items-center justify-center">
                                        <div className="w-1.5 h-1.5 bg-blue-400 rounded-full"></div>
                                    </div>
                                ))}
                            </div>
                            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-tight">{(ds.count || 0).toLocaleString()} Langs</span>
                        </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Catalog;

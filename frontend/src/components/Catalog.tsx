import React, { useState, useEffect } from 'react';

interface CatalogProps {
  onAddDataset: (dataType: string, dataset: string) => void;
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

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 1. Client-side size limit (50MB)
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
            setUploadProgress(percent * 0.9); // Reserve last 10% for backend processing
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

  useEffect(() => {
    fetch('http://localhost:8000/api/v1/catalog')
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
  }, []);

  const getFilteredCatalog = () => {
    if (!catalog) return [];
    
    const result: Array<{type: string, datasets: Array<{name: string, count: number}>}> = [];
    
    Object.entries(catalog).forEach(([type, datasets]) => {
        // 1. Skip this category if a specific type is selected and it doesn't match
        if (selectedType !== 'all' && selectedType !== type) return;
        
        // 2. Filter datasets within this category based on search
        const filtered = datasets.filter(ds => 
            !search || (ds && ds.name && ds.name.toLowerCase().includes(search.toLowerCase()))
        );
        
        // 3. Add to result if we have matches, OR if a specific type is selected (to show empty state in group)
        if (filtered.length > 0) {
            result.push({ type, datasets: filtered });
        }
    });
    
    return result;
  };

  const filteredItems = getFilteredCatalog();

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col border border-white/20 animate-in fade-in zoom-in duration-200">
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
        <div className="p-4 bg-white border-b flex flex-col sm:flex-row gap-3">
            <div className="flex-1 relative">
                <input 
                    type="text" 
                    list="dataset-suggestions"
                    placeholder="Search dataset name (e.g. kusunda)..." 
                    className="w-full pl-9 pr-4 py-2.5 border rounded-xl text-sm bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
                <svg className="w-4 h-4 text-gray-400 absolute left-3 top-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
            <select 
                className="px-3 py-2 border rounded-xl text-sm bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none min-w-[150px] cursor-pointer"
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
            >
                <option value="all">📁 All Types</option>
                <option value="spoken_language">🗣️ Spoken Language</option>
                <option value="sign_language">🤟 Sign Language</option>
                <option value="archaeology">🏺 Archaeology</option>
                <option value="genetics">🧬 Genetics</option>
            </select>
        </div>
        
        {/* Upload Section */}
        <div className="px-6 py-4 bg-blue-50/50 border-b">
            <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                    <div className="p-2 bg-blue-600 rounded-lg shadow-lg shadow-blue-200">
                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a1 1 0 001 1h14a1 1 0 001-1v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                        </svg>
                    </div>
                    <div>
                        <h3 className="text-[13px] font-black text-blue-900">Upload Your Data</h3>
                        <p className="text-[10px] text-blue-400 font-bold uppercase tracking-tight">CSV or GeoJSON supported • Max 50MB</p>
                    </div>
                </div>
                <label className={`
                    px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all cursor-pointer shadow-sm
                    ${isUploading ? 'bg-gray-200 text-gray-400 cursor-wait' : 'bg-white text-blue-600 hover:bg-blue-600 hover:text-white border border-blue-100'}
                `}>
                    {isUploading ? `${Math.round(uploadProgress)}%` : 'Choose File'}
                    <input type="file" className="hidden" accept=".csv,.geojson,.json" onChange={handleFileChange} disabled={isUploading} />
                </label>
            </div>
            
            {isUploading && (
                <div className="mt-3 w-full bg-gray-200 rounded-full h-1 overflow-hidden">
                    <div 
                        className="bg-blue-600 h-full transition-all duration-300 ease-out" 
                        style={{ width: `${uploadProgress}%` }}
                    ></div>
                </div>
            )}
        </div>
        
        <div className="flex-1 overflow-auto p-6 space-y-8 custom-scrollbar">
          {loading && (
            <div className="flex flex-col items-center justify-center py-20 space-y-4">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
              <p className="text-sm font-bold text-gray-400 animate-pulse uppercase tracking-widest">Scanning Filesystem...</p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-100 rounded-lg p-6 text-center">
              <p className="text-red-600 font-bold mb-2">Failed to load catalog</p>
              <p className="text-xs text-red-400 mb-4">{error}</p>
              <button onClick={() => window.location.reload()} className="bg-red-600 text-white text-xs px-4 py-2 rounded font-bold">Retry Connection</button>
            </div>
          )}

          {!loading && !error && filteredItems.length === 0 && (
            <div className="text-center py-20">
                <p className="text-sm text-gray-400 font-bold uppercase tracking-widest">No datasets match your criteria</p>
            </div>
          )}

          {!loading && !error && filteredItems.map(({type, datasets}) => (
            <div key={type} className="space-y-4">
              <div className="flex items-center space-x-3">
                <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-blue-600">
                    {type.replace('_', ' ')}
                </h3>
                <div className="h-px bg-blue-100 flex-1"></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {datasets.length === 0 ? (
                    <p key={`${type}-no-matches`} className="text-[11px] text-gray-400 italic">No matches in this category</p>
                ) : datasets.filter(ds => ds && ds.name).map((ds) => (
                  <div 
                    key={`${type}-${ds.name}`} 
                    className="p-4 border border-gray-100 rounded-xl hover:border-blue-400 hover:shadow-lg hover:bg-blue-50/30 cursor-pointer flex flex-col justify-between transition-all group relative overflow-hidden"
                    onClick={() => onAddDataset(type, ds.name)}
                  >
                    <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-100 transition-opacity">
                        <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
                        </svg>
                    </div>
                    <span className="text-[13px] font-black text-gray-700 mb-1">{ds.name}</span>
                    <span className="text-[10px] text-gray-400 font-bold">{(ds.count || 0).toLocaleString()} Records Detected</span>
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

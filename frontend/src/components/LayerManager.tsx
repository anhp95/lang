import React, { useState, useEffect } from 'react';
import { getAllPalettes } from '../utils/ColorMapper';

interface LayerConfig {
  id: string;
  name: string;
  type: string;
  dataset: string;
  visible: boolean;
  opacity: number;
  color: [number, number, number];
  filters?: any;
  vizField?: string;
  displayField?: string;
  tooltipFields?: string[];
  palette?: string[];
  data?: any[];
  isLoading?: boolean;
}

interface LayerManagerProps {
  layers: LayerConfig[];
  onToggle: (layerId: string) => void;
  onOpacityChange: (layerId: string, opacity: number) => void;
  onColorChange: (layerId: string, color: [number, number, number]) => void;
  onRemove: (layerId: string) => void;
  onOpenCatalog: () => void;
  onFilterChange: (layerId: string, filters: any) => void;
  onOpenTable: (layerId: string) => void;
  onVizChange: (layerId: string, vizField?: string, palette?: string[], displayField?: string, tooltipFields?: string[]) => void;
  activeTableLayerId?: string;
}

const LayerManager: React.FC<LayerManagerProps> = ({ 
  layers, 
  onToggle, 
  onOpacityChange, 
  onColorChange: _onColorChange,
  onRemove,
  onOpenCatalog,
  onFilterChange,
  onOpenTable,
  onVizChange,
  activeTableLayerId
}) => {
  const [expandedFilters, setExpandedFilters] = useState<string | null>(null);
  const [schema, setSchema] = useState<Record<string, any[]>>({});
  const allPalettes = getAllPalettes();

  useEffect(() => {
    // Fetch schema for all layers
    layers.forEach(l => {
        if (l.dataset && !schema[l.id]) {
            fetch(`http://localhost:8000/api/v1/schema?data_type=${l.type}&dataset=${l.dataset}`)
                .then(res => {
                    if (!res.ok) return null;
                    return res.json();
                })
                .then(data => {
                    if (data) setSchema(prev => ({ ...prev, [l.id]: data.columns }));
                })
                .catch(() => {});
        }
    });
  }, [layers]);

  const toggleFilters = (id: string) => {
    setExpandedFilters(expandedFilters === id ? null : id);
  };

  return (
    <div className="absolute top-4 left-4 bg-white/95 backdrop-blur-md rounded-xl shadow-2xl w-80 z-40 flex flex-col max-h-[85vh] border border-gray-200 overflow-hidden">
      <div className="p-4 border-b flex justify-between items-center bg-gray-50/50">
        <div>
            <h3 className="text-sm font-black text-gray-800 uppercase tracking-widest">Workspace</h3>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-tighter">Active Map Layers</p>
        </div>
        <button 
          onClick={onOpenCatalog}
          className="bg-blue-600 text-white text-[10px] px-3 py-1.5 rounded-lg hover:bg-blue-700 font-black transition-all shadow-lg shadow-blue-200 uppercase"
        >
          + Add Data
        </button>
      </div>
      
      <div className="flex-1 overflow-auto p-3 space-y-3 custom-scrollbar">
        {layers.length === 0 && (
          <div className="text-center py-10">
            <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
            </div>
            <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">Empty Workspace</p>
          </div>
        )}
        
        {layers.map(layer => {
          const isCLDF = layer.type === 'spoken_language' || layer.type === 'sign_language';
          const isFilterExpanded = expandedFilters === layer.id;
          const layerSchema = schema[layer.id] || [];
          const selectedField = layerSchema.find(f => f.name === layer.vizField);

          return (
            <div key={layer.id} className={`border rounded-xl p-3 transition-all ${layer.visible ? 'bg-white shadow-sm border-gray-200' : 'bg-gray-50/50 opacity-60 border-transparent scale-[0.98]'}`}>
              <div className="flex items-center justify-between group">
                 <div className="flex items-center space-x-3 flex-1 min-w-0">
                    <input
                      type="checkbox"
                      checked={layer.visible}
                      onChange={() => onToggle(layer.id)}
                      className="w-5 h-5 rounded-md text-blue-600 focus:ring-blue-500 cursor-pointer border-gray-300"
                    />
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center space-x-2">
                        <span className="text-[13px] font-black text-gray-800 truncate leading-tight" title={layer.dataset}>{layer.dataset}</span>
                        {layer.isLoading && (
                            <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                        )}
                      </div>
                      <span className="text-[9px] text-gray-400 uppercase font-black tracking-widest">
                        {layer.type.replace('_', ' ')} • {layer.data?.length || 0} markers
                      </span>
                    </div>
                 </div>

                 <div className="flex items-center space-x-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={() => onOpenTable(layer.id)}
                      className={`p-1.5 rounded-lg hover:bg-gray-100 transition-colors ${activeTableLayerId === layer.id ? 'text-blue-600 bg-blue-50' : 'text-gray-400'}`}
                      title="Open Data Table"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                    </button>
                    <button 
                      onClick={() => toggleFilters(layer.id)}
                      className={`p-1.5 rounded-lg hover:bg-gray-100 transition-colors ${isFilterExpanded ? 'text-blue-600 bg-blue-50' : 'text-gray-400'}`}
                      title="Visualization & Filters"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6v2m6 10v2" /></svg>
                    </button>
                    <button 
                      onClick={() => onRemove(layer.id)}
                      className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all"
                      title="Remove Layer"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                 </div>
              </div>
              
              {layer.visible && isFilterExpanded && (
                <div className="mt-3 space-y-4 border-t pt-3 animate-in slide-in-from-top-2 duration-200">
                  
                  {/* Visualization Section */}
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em]">Visualize by Field</label>
                    <select 
                      value={layer.vizField || ''} 
                      onChange={(e) => onVizChange(layer.id, e.target.value || undefined, layer.palette)}
                      className="w-full px-2 py-1.5 border rounded-lg text-[11px] bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                      <option value="">None (Single Color)</option>
                      {layerSchema.filter(f => f.name !== 'geom' && f.name !== 'Latitude' && f.name !== 'Longitude').map(f => (
                        <option key={f.name} value={f.name}>{f.name} ({f.type})</option>
                      ))}
                    </select>

                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em] mt-2 block">Display Header Field</label>
                    <select 
                      value={layer.displayField || ''} 
                      onChange={(e) => onVizChange(layer.id, layer.vizField, layer.palette, e.target.value || undefined, layer.tooltipFields)}
                      className="w-full px-2 py-1.5 border rounded-lg text-[11px] bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                      <option value="">Default (Name/ID)</option>
                      {layerSchema.filter(f => f.name !== 'geom' && f.name !== 'Latitude' && f.name !== 'Longitude').map(f => (
                        <option key={f.name} value={f.name}>{f.name}</option>
                      ))}
                    </select>

                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em] mt-3 block">Visible Tooltip Fields</label>
                    <div className="max-h-32 overflow-auto border rounded-lg bg-gray-50 p-2 space-y-1">
                        {layerSchema.filter(f => !['geom', 'Latitude', 'Longitude'].includes(f.name)).map(f => {
                            const isVisible = !layer.tooltipFields || layer.tooltipFields.includes(f.name);
                            return (
                                <label key={f.name} className="flex items-center space-x-2 cursor-pointer hover:bg-gray-100 p-0.5 rounded transition-colors group">
                                    <input 
                                        type="checkbox"
                                        checked={isVisible}
                                        onChange={(e) => {
                                            const current = layer.tooltipFields || layerSchema.map(s => s.name).filter(n => !['geom', 'Latitude', 'Longitude'].includes(n));
                                            const updated = e.target.checked 
                                                ? [...current, f.name]
                                                : current.filter(n => n !== f.name);
                                            onVizChange(layer.id, layer.vizField, layer.palette, layer.displayField, updated);
                                        }}
                                        className="w-3.5 h-3.5 rounded text-blue-600 border-gray-300"
                                    />
                                    <span className={`text-[10px] ${isVisible ? 'text-gray-700 font-bold' : 'text-gray-400'} truncate`}>{f.name}</span>
                                </label>
                            );
                        })}
                    </div>

                    {layer.vizField && (
                        <div className="space-y-2 pt-1">
                             <label className="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em]">Color Palette (ColorBrewer)</label>
                             <div className="flex flex-wrap gap-1.5 p-2 bg-gray-50 rounded-lg max-h-32 overflow-auto">
                                {allPalettes.filter(p => !selectedField || (selectedField.type === 'numerical' ? p.type === 'sequential' : p.type === 'qualitative')).map(p => (
                                    <button 
                                        key={p.name}
                                        onClick={() => onVizChange(layer.id, layer.vizField, p.colors, layer.displayField, layer.tooltipFields)}
                                        className={`flex flex-col space-y-0.5 p-1 rounded hover:bg-blue-100 transition-colors ${JSON.stringify(layer.palette) === JSON.stringify(p.colors) ? 'ring-2 ring-blue-500 bg-blue-50' : ''}`}
                                        title={p.name}
                                    >
                                        <div className="flex h-2 w-12 rounded-sm overflow-hidden">
                                            {p.colors.slice(0, 5).map((c, i) => <div key={i} className="flex-1" style={{backgroundColor: c}} />)}
                                        </div>
                                        <span className="text-[8px] text-gray-500 text-center truncate w-12">{p.name}</span>
                                    </button>
                                ))}
                             </div>
                        </div>
                    )}
                  </div>

                  {/* Filter Section */}
                  <div className="space-y-3">
                    <div className="flex items-center space-x-3">
                        <label className="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em]">Data Filters</label>
                        <div className="h-px bg-gray-100 flex-1"></div>
                    </div>
                    <div className="space-y-2">
                        <div className="flex flex-col space-y-1">
                            <input
                            type="text"
                            value={layer.filters?.search || ''}
                            onChange={(e) => onFilterChange(layer.id, { ...layer.filters, search: e.target.value })}
                            className="w-full px-2 py-2 border rounded-lg text-[11px] bg-white shadow-inner focus:ring-2 focus:ring-blue-500 outline-none"
                            placeholder="Search by name..."
                            />
                        </div>

                        {isCLDF && (
                            <div className="grid grid-cols-2 gap-2">
                                <input
                                    type="text"
                                    value={layer.filters?.parameter_filter || ''}
                                    onChange={(e) => onFilterChange(layer.id, { ...layer.filters, parameter_filter: e.target.value })}
                                    className="px-2 py-2 border rounded-lg text-[11px] bg-white shadow-inner"
                                    placeholder="Linguistic Field"
                                />
                                <input
                                    type="text"
                                    value={layer.filters?.form_filter || ''}
                                    onChange={(e) => onFilterChange(layer.id, { ...layer.filters, form_filter: e.target.value })}
                                    className="px-2 py-2 border rounded-lg text-[11px] bg-white shadow-inner"
                                    placeholder="Value/Result"
                                />
                            </div>
                        )}
                    </div>
                  </div>

                  {/* Opacity Control */}
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[9px] text-gray-400 font-black uppercase tracking-widest">Global Opacity</span>
                    <div className="flex items-center space-x-2 flex-1 ml-4">
                        <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.01"
                            value={layer.opacity}
                            onChange={(e) => onOpacityChange(layer.id, parseFloat(e.target.value))}
                            className="flex-1 h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                        />
                        <span className="text-[9px] text-gray-500 font-mono w-6">{Math.round(layer.opacity * 100)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default LayerManager;
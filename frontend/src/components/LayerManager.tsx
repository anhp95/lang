import React, { useState } from 'react';
import { getAllPalettes } from '../utils/ColorMapper';

const getStylePreviewColor = (styleId: string): string => {
  const colors: Record<string, string> = {
    dark: '#1a1a2e',
    light: '#f5f5f5',
    streets: '#e8e8e8',
    outdoors: '#d4e4d4',
    satellite: '#2d2d2d',
    'satellite-streets': '#3d3d3d'
  };
  return colors[styleId] || '#666';
};

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
  isSpatial?: boolean;
  pointSize?: number;
  stroked?: boolean;
}

interface BaseMapStyle {
  id: string;
  name: string;
  style: string;
  thumbnail?: string;
}

const BASEMAP_STYLES: BaseMapStyle[] = [
  { id: 'dark', name: 'Dark', style: 'mapbox://styles/mapbox/dark-v11' },
  { id: 'light', name: 'Light', style: 'mapbox://styles/mapbox/light-v11' },
  { id: 'streets', name: 'Streets', style: 'mapbox://styles/mapbox/streets-v12' },
  { id: 'outdoors', name: 'Outdoors', style: 'mapbox://styles/mapbox/outdoors-v12' },
  { id: 'satellite', name: 'Satellite', style: 'mapbox://styles/mapbox/satellite-v9' },
  { id: 'satellite-streets', name: 'Satellite Streets', style: 'mapbox://styles/mapbox/satellite-streets-v12' },
];

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
  onPointSizeChange: (layerId: string, pointSize: number) => void;
  onStrokedChange: (layerId: string, stroked: boolean) => void;
  activeTableLayerId?: string;
  schema: Record<string, any[]>;
  onBaseMapChange: (style: string) => void;
  baseMapStyle: string;
}

const LayerManager: React.FC<LayerManagerProps> = ({
  layers,
  onToggle,
  onOpacityChange,
  onColorChange,
  onRemove,
  onOpenCatalog,
  onFilterChange,
  onOpenTable,
  onVizChange,
  onPointSizeChange,
  onStrokedChange,
  activeTableLayerId,
  schema,
  onBaseMapChange,
  baseMapStyle
}) => {
  const [expandedFilters, setExpandedFilters] = useState<string | null>(null);
  const [openPaletteId, setOpenPaletteId] = useState<string | null>(null);
  const allPalettes = getAllPalettes();

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

      {/* Base Map Selector */}
      <div className="px-3 py-2 border-b bg-gray-50/50">
        <div className="flex items-center justify-between">
          <label className="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em]">Base Map</label>
          <div className="relative">
            <select
              value={baseMapStyle}
              onChange={(e) => onBaseMapChange(e.target.value)}
              className="appearance-none bg-white border border-gray-200 rounded-lg px-3 py-1.5 pr-8 text-[11px] font-medium text-gray-700 hover:border-blue-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none cursor-pointer transition-all"
            >
              {BASEMAP_STYLES.map(style => (
                <option key={style.id} value={style.style}>{style.name}</option>
              ))}
            </select>
            <svg className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
        <div className="mt-1.5 grid grid-cols-6 gap-1">
          {BASEMAP_STYLES.map(style => (
            <button
              key={style.id}
              onClick={() => onBaseMapChange(style.style)}
              className={`h-6 rounded-md transition-all ${baseMapStyle === style.style ? 'ring-2 ring-blue-500 ring-offset-1' : 'hover:ring-2 hover:ring-gray-300 hover:ring-offset-1'}`}
              style={{
                backgroundColor: getStylePreviewColor(style.id),
                border: style.id === 'light' || style.id === 'streets' ? '1px solid #e5e7eb' : 'none'
              }}
              title={style.name}
            />
          ))}
        </div>
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
                      className="w-5 h-5 rounded-md text-blue-600 focus:ring-blue-500 cursor-pointer border-gray-300 disabled:opacity-20"
                      disabled={!layer.isSpatial}
                    />
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center space-x-2">
                        <span className={`text-[13px] font-black tracking-tight truncate leading-tight ${!layer.isSpatial ? 'text-gray-400' : 'text-gray-800'}`} title={layer.dataset}>{layer.dataset}</span>
                        {layer.isLoading && (
                            <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                        )}
                        {!layer.isLoading && !layer.isSpatial && (
                            <span className="bg-amber-100 text-amber-600 text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-tighter shadow-sm border border-amber-200">Non-Spatial</span>
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
 
                    <div className="space-y-1.5 pt-1 border-t mt-2">
                         <label className="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em]">
                             {layer.vizField ? `Color Palette (${selectedField?.type || 'Unknown'})` : 'Color Palette'}
                         </label>
                         
                         <div className="relative">
                            {/* Dropdown Toggle */}
                            <button 
                                onClick={() => setOpenPaletteId(openPaletteId === layer.id ? null : layer.id)}
                                className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 border rounded-lg hover:border-blue-400 transition-all group"
                            >
                                <div className="flex items-center space-x-3 overflow-hidden">
                                     <div className="flex h-3 w-16 rounded-sm overflow-hidden shrink-0 shadow-sm border border-black/5">
                                        {layer.palette ? layer.palette.slice(0, 8).map((c, i) => <div key={i} className="flex-1" style={{backgroundColor: c}} />) : <div className="flex-1 bg-gray-200" />}
                                     </div>
                                     <span className="text-[10px] font-bold text-gray-600 truncate">{allPalettes.find(p => JSON.stringify(p.colors) === JSON.stringify(layer.palette))?.name || 'Select Palette...'}</span>
                                </div>
                                <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform ${openPaletteId === layer.id ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" /></svg>
                            </button>

                            {/* Dropdown Menu */}
                            {openPaletteId === layer.id && (
                                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-100 rounded-xl shadow-2xl z-50 max-h-48 overflow-auto py-1 animate-in fade-in zoom-in-95 duration-100 custom-scrollbar">
                                    {(() => {
                                        const isNum = selectedField && ['DOUBLE', 'INT', 'FLOAT', 'DECIMAL', 'REAL', 'BIGINT'].some(t => selectedField.type.toUpperCase().includes(t));
                                        const filtered = allPalettes.filter(p => {
                                            if (!layer.vizField) return true;
                                            return isNum ? (p.type === 'sequential' || p.type === 'diverging') : (p.type === 'qualitative');
                                        });

                                        return filtered.map(p => {
                                            const isSelected = JSON.stringify(layer.palette) === JSON.stringify(p.colors);
                                            return (
                                                <button 
                                                    key={p.name}
                                                    onClick={() => {
                                                        onVizChange(layer.id, layer.vizField, p.colors, layer.displayField, layer.tooltipFields);
                                                        setOpenPaletteId(null);
                                                    }}
                                                    className={`w-full flex items-center justify-between px-3 py-2.5 hover:bg-blue-50 transition-colors ${isSelected ? 'bg-blue-50/50' : ''}`}
                                                >
                                                    <div className="flex items-center space-x-3 overflow-hidden">
                                                        <div className="flex h-2.5 w-14 rounded-sm overflow-hidden shrink-0 border border-black/5">
                                                            {p.colors.slice(0, 8).map((c, i) => <div key={i} className="flex-1" style={{backgroundColor: c}} />)}
                                                        </div>
                                                        <span className={`text-[10px] ${isSelected ? 'font-black text-blue-600' : 'font-medium text-gray-600'}`}>{p.name}</span>
                                                    </div>
                                                    {isSelected && <svg className="w-3 h-3 text-blue-600" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>}
                                                </button>
                                            );
                                        });
                                    })()}
                                </div>
                            )}
                         </div>
                    </div>
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

                   {/* Visual Settings Section */}
                   <div className="space-y-3 py-2 border-t border-b bg-gray-50/30 px-1">
                      {!layer.vizField && (
                          <div className="space-y-2">
                             <label className="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em]">Base Color</label>
                             <div className="flex flex-wrap gap-2">
                                {[
                                    [255, 120, 0], [0, 200, 100], [0, 120, 255], 
                                    [255, 50, 50], [150, 0, 150], [255, 200, 0], 
                                    [0, 0, 0], [255, 255, 255]
                                ].map((c: any, i) => (
                                    <button 
                                        key={i}
                                        onClick={() => onColorChange(layer.id, c)}
                                        className={`w-5 h-5 rounded-full border border-gray-200 transition-transform hover:scale-110 ${JSON.stringify(layer.color) === JSON.stringify(c) ? 'ring-2 ring-blue-500 scale-110 shadow-sm' : ''}`}
                                        style={{backgroundColor: `rgb(${c[0]}, ${c[1]}, ${c[2]})`}}
                                    />
                                ))}
                             </div>
                          </div>
                      )}

                      <div className="flex items-center justify-between">
                         <span className="text-[9px] text-gray-400 font-black uppercase tracking-widest">Marker Size</span>
                         <div className="flex items-center space-x-2 flex-1 ml-4">
                            <input
                                type="range"
                                min="1"
                                max="50"
                                step="1"
                                value={layer.pointSize || 6}
                                onChange={(e) => onPointSizeChange(layer.id, parseInt(e.target.value))}
                                className="flex-1 h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                            />
                            <span className="text-[9px] text-gray-500 font-mono w-6">{layer.pointSize || 6}px</span>
                         </div>
                      </div>

                      <div className="flex items-center justify-between">
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

                      <div className="flex items-center justify-between">
                        <span className="text-[9px] text-gray-400 font-black uppercase tracking-widest">Outline (Stroked)</span>
                        <button 
                            onClick={() => onStrokedChange(layer.id, !layer.stroked)}
                            className={`w-8 h-4 rounded-full transition-colors relative ${layer.stroked ? 'bg-blue-600' : 'bg-gray-300'}`}
                        >
                            <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${layer.stroked ? 'left-4.5' : 'left-0.5'}`} />
                        </button>
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
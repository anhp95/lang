import React, { useState } from 'react';
import { downloadCSV, downloadJSON } from '../utils/Exporter';

interface DataTableProps {
  layers: any[];
  activeLayerId: string;
  onRowClick: (record: any) => void;
  onTabChange: (layerId: string) => void;
  onCloseTab: (layerId: string) => void;
  onCloseAll: () => void;
}

const DataTable: React.FC<DataTableProps> = ({ layers, activeLayerId, onRowClick, onTabChange, onCloseTab, onCloseAll }) => {
  const [isMinimized, setIsMinimized] = useState(false);
  const [isDownloadOpen, setIsDownloadOpen] = useState(false);
  
  const activeLayer = layers.find(l => l.id === activeLayerId) || layers[0];

  const filteredData = React.useMemo(() => {
    if (!activeLayer || !activeLayer.data) return [];
    
    return activeLayer.data.filter((d: any) => {
        if (activeLayer.filters?.search) {
            const search = activeLayer.filters.search.toLowerCase();
            const nameMatch = (d.Name || d.name || '').toLowerCase().includes(search);
            const descMatch = (d.Description || d.description || '').toLowerCase().includes(search);
            if (!nameMatch && !descMatch) return false;
        }
        if (activeLayer.filters?.parameter_filter && !(d.parameter_name || '').toLowerCase().includes(activeLayer.filters.parameter_filter.toLowerCase())) return false;
        if (activeLayer.filters?.form_filter && !(d.form_value || '').toLowerCase().includes(activeLayer.filters.form_filter.toLowerCase())) return false;
        return true;
    });
  }, [activeLayer?.data, activeLayer?.filters, activeLayer?.id]);

  const displayData = filteredData.slice(0, 100);
  const total = filteredData.length;

  if (layers.length === 0) return null;

  return (
    <div 
        className={`fixed z-30 transition-all duration-500 ease-in-out ${isMinimized ? 'bottom-4 left-88 h-12 w-64' : 'bottom-6 left-88 right-96 h-[45vh]'}`}
    >
      <div className="w-full h-full bg-white shadow-[0_-20px_50px_-12px_rgba(0,0,0,0.3)] rounded-2xl border border-gray-100 flex flex-col overflow-hidden">
        {/* Tab Bar */}
        <div className={`flex items-center bg-gray-50/50 border-b px-2 overflow-x-auto no-scrollbar transition-all ${isMinimized ? 'h-12 border-none bg-transparent' : 'h-12'}`}>
            <div className="flex items-center h-full flex-1">
                {layers.map(l => (
                    <div 
                        key={l.id}
                        className={`group flex items-center h-full px-4 border-r border-gray-100 cursor-pointer transition-all relative min-w-30 max-w-50
                            ${activeLayerId === l.id ? 'bg-white shadow-sm' : 'hover:bg-gray-100/50'}
                        `}
                        onClick={() => {
                            onTabChange(l.id);
                            if (isMinimized) setIsMinimized(false);
                        }}
                    >
                        <div className="flex items-center space-x-2 min-w-0 pr-6">
                            <div className="w-2 h-2 rounded-full shrink-0" style={{backgroundColor: `rgb(${l.color[0]}, ${l.color[1]}, ${l.color[2]})`}} />
                            <span className={`text-[10px] font-black uppercase tracking-tight truncate ${activeLayerId === l.id ? 'text-blue-600' : 'text-gray-500'}`}>{l.dataset}</span>
                        </div>
                        <button 
                            onClick={(e) => { e.stopPropagation(); onCloseTab(l.id); }}
                            className={`absolute right-2 p-1 rounded-md transition-colors ${activeLayerId === l.id ? 'text-gray-300 hover:text-red-500 hover:bg-red-50' : 'opacity-0 group-hover:opacity-100 text-gray-400'}`}
                        >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                        {activeLayerId === l.id && <div className="absolute bottom-0 left-0 right-0 h-1 bg-blue-600" />}
                    </div>
                ))}
            </div>

            <div className="flex items-center space-x-1 px-2 border-l border-gray-100">
                <button 
                    onClick={() => setIsMinimized(!isMinimized)}
                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                    title={isMinimized ? "Expand" : "Minimize"}
                >
                    <svg className={`w-4 h-4 transition-transform duration-300 ${isMinimized ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                </button>
                <button 
                    onClick={onCloseAll}
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                    title="Close All Tabs"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
            </div>
        </div>
        
        {/* Table Content */}
        {!isMinimized && (
            <div className="flex-1 overflow-hidden flex flex-col pt-2 bg-white">
                <div className="px-6 py-2 flex items-center justify-between border-b border-gray-50 bg-white/50">
                     <div className="flex items-center space-x-3">
                        <span className="text-[10px] text-gray-400 font-black uppercase tracking-widest">{total.toLocaleString()} records • Optimized view</span>
                        <div className="h-3 w-px bg-gray-200"></div>
                        <span className="text-[10px] text-blue-500 font-black uppercase tracking-widest">{activeLayer?.dataset}</span>
                     </div>
                     
                     <div className="relative">
                        <button 
                            onClick={() => setIsDownloadOpen(!isDownloadOpen)}
                            className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg transition-all border ${isDownloadOpen ? 'bg-blue-600 border-blue-600 text-white shadow-lg' : 'bg-blue-50 border-blue-100 text-blue-600 hover:bg-blue-100'}`}
                        >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a1 1 0 001 1h14a1 1 0 001-1v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                            <span className="text-[10px] font-black uppercase tracking-wider">Export Data</span>
                            <svg className={`w-3 h-3 transition-transform ${isDownloadOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                        </button>
                        
                        {isDownloadOpen && (
                            <div className="absolute top-full right-0 mt-2 bg-white border border-gray-100 rounded-xl shadow-2xl z-60 py-1 min-w-32 animate-in fade-in slide-in-from-top-2 duration-200 overflow-hidden">
                                <button 
                                    onClick={() => {
                                        downloadCSV(filteredData, activeLayer?.dataset || 'export');
                                        setIsDownloadOpen(false);
                                    }}
                                    className="w-full text-left px-4 py-2 text-[10px] font-black uppercase text-gray-600 hover:bg-blue-50 hover:text-blue-600 transition-colors flex items-center justify-between group/btn"
                                >
                                    <span>CSV Format</span>
                                    <svg className="w-3 h-3 text-gray-300 group-hover/btn:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" /></svg>
                                </button>
                                <button 
                                    onClick={() => {
                                        downloadJSON(filteredData, activeLayer?.dataset || 'export');
                                        setIsDownloadOpen(false);
                                    }}
                                    className="w-full text-left px-4 py-2 text-[10px] font-black uppercase text-gray-600 hover:bg-blue-50 hover:text-blue-600 transition-colors flex items-center justify-between group/btn"
                                >
                                    <span>JSON Format</span>
                                    <svg className="w-3 h-3 text-gray-300 group-hover/btn:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" /></svg>
                                </button>
                            </div>
                        )}
                     </div>
                </div>
                <div className="overflow-auto flex-1 custom-scrollbar mt-2">
                    {total === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full space-y-3 pb-12">
                            <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center">
                                <svg className="w-6 h-6 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                            </div>
                            <span className="text-[10px] text-gray-300 font-black uppercase tracking-[0.2em]">Filtered out all records</span>
                        </div>
                    ) : (
                        <table className="w-full text-left border-collapse">
                            <thead className="sticky top-0 z-20 bg-white/95 backdrop-blur-sm">
                                <tr>
                                    {Object.keys(displayData[0]).filter(key => !['geom', 'data', 'isLoading', 'id', 'Dataset'].includes(key)).map(key => (
                                        <th key={key} className="px-6 py-4 text-[9px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100 whitespace-nowrap">{key.replace('_', ' ')}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {displayData.map((record: any, i: number) => (
                                    <tr 
                                        key={i}
                                        onClick={() => onRowClick(record)}
                                        className="hover:bg-blue-50/40 cursor-pointer transition-all border-b border-gray-50 group font-sans"
                                    >
                                        {Object.entries(record).filter(([key]) => !['geom', 'data', 'isLoading', 'id', 'Dataset'].includes(key)).map(([_, v]: [any, any], j) => (
                                            <td key={j} className="px-6 py-4 text-[12px] text-gray-600 font-medium truncate max-w-50 group-hover:text-blue-700 transition-colors">
                                                {v?.toString() || '-'}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        )}
      </div>
    </div>
  );
};

export default DataTable;

import React from 'react';

interface DataTableProps {
  layer: any;
  onRowClick: (record: any) => void;
  onClose: () => void;
}

const DataTable: React.FC<DataTableProps> = ({ layer, onRowClick, onClose }) => {
  const filteredData = React.useMemo(() => {
    if (!layer || !layer.data) return [];
    
    return layer.data.filter((d: any) => {
        if (layer.filters?.search) {
            const search = layer.filters.search.toLowerCase();
            const nameMatch = (d.Name || d.name || '').toLowerCase().includes(search);
            const descMatch = (d.Description || d.description || '').toLowerCase().includes(search);
            if (!nameMatch && !descMatch) return false;
        }
        if (layer.filters?.parameter_filter && !(d.parameter_name || '').toLowerCase().includes(layer.filters.parameter_filter.toLowerCase())) return false;
        if (layer.filters?.form_filter && !(d.form_value || '').toLowerCase().includes(layer.filters.form_filter.toLowerCase())) return false;
        return true;
    });
  }, [layer?.data, layer?.filters]);

  const displayData = filteredData.slice(0, 100); // Show first 100 in table for performance
  const total = filteredData.length;


  if (!layer) return null;

  return (
    <div className="absolute bottom-0 left-0 right-0 bg-white shadow-2xl z-30 flex flex-col transition-all duration-300" style={{ height: '35vh' }}>
      <div className="flex items-center justify-between px-4 py-2 border-b bg-gray-100">
        <div className="flex items-center space-x-2">
            <span className="text-xs font-bold uppercase text-gray-500 tracking-wider">Viewing Layer:</span>
            <span className="text-sm font-bold text-blue-600">{layer.dataset}</span>
        </div>
        <div className="flex items-center space-x-4">
            <span className="text-xs font-medium text-gray-500">{total.toLocaleString()} records found</span>
            <button 
                onClick={onClose}
                className="text-gray-400 hover:text-red-500 transition-colors"
                title="Close Table"
            >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
        </div>
      </div>
      
      <div className="overflow-auto flex-1">
      <div className="overflow-auto flex-1 custom-scrollbar">
        {total === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-400 font-bold uppercase tracking-widest text-xs">
            No records match filters
          </div>
        ) : (
          <div>
            <table className="w-full text-[13px]">
              <thead className="bg-white sticky top-0 shadow-sm z-10">
                <tr>
                  {displayData.length > 0 && Object.keys(displayData[0]).filter(key => !['geom', 'data', 'isLoading'].includes(key)).map(key => (
                    <th key={key} className="px-4 py-3 text-left font-black text-gray-400 uppercase tracking-tighter border-b text-[10px]">{key.replace('_', ' ')}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white">
                {displayData.map((record, i) => (
                  <tr 
                    key={i}
                    onClick={() => onRowClick(record)}
                    className="border-b border-gray-50 hover:bg-blue-50/50 cursor-pointer transition-colors group"
                  >
                    {Object.entries(record).filter(([key]) => !['geom', 'data', 'isLoading'].includes(key)).map(([_, v]: [any, any], j) => (
                      <td key={j} className="px-4 py-2.5 text-gray-600 truncate max-w-xs group-hover:text-blue-700 font-medium">{v?.toString() || '-'}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {total > 100 && (
                <div className="p-3 text-center text-[10px] text-gray-400 font-bold uppercase tracking-widest bg-gray-50/50 border-t">
                    Showing first 100 of {total} optimized markers
                </div>
            )}
          </div>
        )}
      </div>
      </div>
    </div>
  );
};

export default DataTable;

import { useState, useCallback, useEffect, useMemo } from 'react';
import { WebMercatorViewport } from '@math.gl/web-mercator';
import Map from 'react-map-gl/mapbox';
import DeckGL from '@deck.gl/react';
import { TileLayer } from '@deck.gl/geo-layers';
import { BitmapLayer, ScatterplotLayer } from '@deck.gl/layers';
import { tableFromIPC } from 'apache-arrow';
import { Rnd } from 'react-rnd';
import LayerManager from './components/LayerManager';
import DetailWindow from './components/DetailWindow';
import ChatInterface from './components/ChatInterface';
import DataTable from './components/DataTable';
import Catalog from './components/Catalog';
import './App.css';

import { createColorScale } from './utils/ColorMapper';

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

interface DetailWindowData {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  data: any;
  layerId: string;
  lon: number;
  lat: number;
}

const MAPBOX_TOKEN = 'pk.eyJ1IjoiYW5ocCIsImEiOiJja2xpcXZnZ3MycTE5MndxZXgwdHRwM2RpIn0.3Y6CVuK_RTZ1kTMsuF8wvw';

function App() {
  const [layers, setLayers] = useState<LayerConfig[]>([]);
  const [detailWindows, setDetailWindows] = useState<DetailWindowData[]>([]);
  const [scales, setScales] = useState<Record<string, any>>({});
  const [viewState, setViewState] = useState({
    longitude: 0,
    latitude: 20,
    zoom: 2,
    pitch: 0,
    bearing: 0
  });
  const [showDataTable, setShowDataTable] = useState(false);
  const [activeTableLayerId, setActiveTableLayerId] = useState<string | null>(null);
  const [isCatalogOpen, setIsCatalogOpen] = useState(false);
  const [windowPositions, setWindowPositions] = useState<Record<string, {x: number, y: number, w: number, h: number}>>({});

  const viewport = useMemo(() => {
    return new WebMercatorViewport({
        ...viewState,
        width: window.innerWidth,
        height: window.innerHeight
    });
  }, [viewState]);

  // Sync Data and Color Scales
  useEffect(() => {
    layers.forEach(l => {
        if (l.visible && !l.data && !l.isLoading) {
            setLayers(prev => prev.map(layer => layer.id === l.id ? { ...layer, isLoading: true } : layer));
            
            const params = new URLSearchParams({
                data_type: l.type,
                dataset: l.dataset
            });
            
            const url = `http://localhost:8000/api/v1/arrow_data?${params}`;
            
            console.log(`[Arrow] Fetching binary stream for ${l.dataset}...`);
            fetch(url)
                .then(res => res.arrayBuffer())
                .then(buffer => {
                    try {
                        const table = tableFromIPC(new Uint8Array(buffer));
                        const fields = table.schema.fields.map(f => f.name);
                        
                        // Use toArray() and map to plain objects
                        const data = table.toArray().map((row: any) => {
                            const obj: any = {};
                            fields.forEach(f => { obj[f] = row[f]; });
                            return obj;
                        });
                        
                        console.log(`[Arrow] Direct parse success: ${data.length} rows for ${l.dataset}`);
                        setLayers(prev => prev.map(layer => layer.id === l.id ? { ...layer, data, isLoading: false } : layer));
                        
                        if (l.vizField && l.palette && data.length > 0) {
                            const values = data.map((d: any) => d[l.vizField!]).filter((v: any) => v != null);
                            if (values.length > 0) {
                                const isNum = !isNaN(parseFloat(values[0])) && isFinite(values[0]);
                                const scale = createColorScale(isNum ? 'numerical' : 'categorical', values, l.palette!);
                                setScales(prev => ({ ...prev, [l.id]: scale }));
                            }
                        }
                    } catch (e) {
                        console.error(`[Arrow] Binary parse error for ${l.dataset}:`, e);
                        setLayers(prev => prev.map(layer => layer.id === l.id ? { ...layer, isLoading: false } : layer));
                    }
                })
                .catch(err => {
                    console.error(`[Arrow] Network error for ${l.dataset}:`, err);
                    setLayers(prev => prev.map(layer => layer.id === l.id ? { ...layer, isLoading: false } : layer));
                });
        } else if (l.visible && l.data && l.vizField && l.palette && !scales[l.id]) {
            const values = l.data.map((d: any) => d[l.vizField!]).filter((v: any) => v != null);
            if (values.length > 0) {
                const isNum = !isNaN(parseFloat(values[0])) && isFinite(values[0]);
                const scale = createColorScale(isNum ? 'numerical' : 'categorical', values, l.palette!);
                setScales(prev => ({ ...prev, [l.id]: scale }));
            }
        }
    });
  }, [layers.map(l => `${l.id}-${l.visible}-${l.vizField}-${l.palette?.join(',')}-${!!l.data}`).join('|')]);

  const handleUploadData = (data: any[], name: string, coords: {lat: string, lon: string}, fileType: string) => {
    const id = `upload_${name}_${Date.now()}`;
    const randomColors: [number, number, number][] = [
        [255, 120, 0], [0, 200, 100], [0, 120, 255], [255, 50, 50], [150, 0, 150]
    ];
    
    // Create layer with in-memory data
    const newLayer: LayerConfig = {
      id,
      name,
      type: `user_upload_${fileType}`,
      dataset: name,
      visible: true,
      opacity: 0.9,
      color: randomColors[Math.floor(Math.random() * randomColors.length)],
      filters: { 
          // Inject detected coordinate keys for consistent access
          coords_lon: coords.lon || 'longitude',
          coords_lat: coords.lat || 'latitude'
      },
      data,
      vizField: undefined
    };
    
    setLayers(prev => [...prev, newLayer]);
    setIsCatalogOpen(false);
  };

  const handleAddDataset = (dataType: string, dataset: string) => {
    const id = `${dataType}_${dataset}_${Date.now()}`;
    const randomColors: [number, number, number][] = [
        [255, 120, 0], [0, 200, 100], [0, 120, 255], [255, 50, 50], [150, 0, 150]
    ];
    const newLayer: LayerConfig = {
      id,
      name: dataset,
      type: dataType,
      dataset,
      visible: true,
      opacity: 0.8,
      color: randomColors[Math.floor(Math.random() * randomColors.length)],
      filters: {}
    };
    setLayers(prev => [...prev, newLayer]);
    setIsCatalogOpen(false);
  };

  const handleRemoveLayer = (layerId: string) => {
    setLayers(prev => prev.filter(l => l.id !== layerId));
    if (activeTableLayerId === layerId) {
        setActiveTableLayerId(null);
        setShowDataTable(false);
    }
  };

  const handleLayerToggle = (layerId: string) => {
    setLayers(prev => prev.map(layer => 
      layer.id === layerId ? { ...layer, visible: !layer.visible } : layer
    ));
  };

  const handleLayerOpacity = (layerId: string, opacity: number) => {
    setLayers(prev => prev.map(layer => 
      layer.id === layerId ? { ...layer, opacity } : layer
    ));
  };

  const handleLayerColor = (layerId: string, color: [number, number, number]) => {
    setLayers(prev => prev.map(layer => 
      layer.id === layerId ? { ...layer, color } : layer
    ));
  };

  const handleFilterChange = (layerId: string, filters: any) => {
    setLayers(prev => prev.map(layer => 
      layer.id === layerId ? { ...layer, filters } : layer
    ));
  };

  const handleVizChange = (layerId: string, vizField?: string, palette?: string[], displayField?: string, tooltipFields?: string[]) => {
    setLayers(prev => prev.map(layer => {
        if (layer.id === layerId) {
            if (vizField !== layer.vizField || JSON.stringify(palette) !== JSON.stringify(layer.palette)) {
                setScales(prevScales => {
                    const next = { ...prevScales };
                    delete next[layerId];
                    return next;
                });
            }
            return { ...layer, vizField, palette, displayField: displayField ?? layer.displayField, tooltipFields: tooltipFields ?? layer.tooltipFields };
        }
        return layer;
    }));
  };

  const handleOpenTable = (layerId: string) => {
    if (activeTableLayerId === layerId && showDataTable) {
        setShowDataTable(false);
        setActiveTableLayerId(null);
    } else {
        setActiveTableLayerId(layerId);
        setShowDataTable(true);
    }
  };

  const handleMapClick = useCallback((info: any) => {
    if (info.object) {
      const newWindow: DetailWindowData = {
        id: `window-${Date.now()}`,
        x: Math.random() * (window.innerWidth - 450) + 50,
        y: Math.random() * (window.innerHeight - 350) + 50,
        width: 400,
        height: 300,
        data: info.object,
        layerId: info.layer.id,
        lon: parseFloat(info.object.Longitude || info.object.longitude || info.object.Lon || info.object.lon || 0),
        lat: parseFloat(info.object.Latitude || info.object.latitude || info.object.Lat || info.object.lat || 0)
      };
      setDetailWindows(prev => [...prev, newWindow]);
      setWindowPositions(prev => ({ 
        ...prev, 
        [newWindow.id]: { x: newWindow.x, y: newWindow.y, w: newWindow.width, h: newWindow.height } 
      }));
    }
  }, []);

  const handleCloseWindow = (windowId: string) => {
    setDetailWindows(prev => prev.filter(w => w.id !== windowId));
  };

  const handleTableRowClick = (record: any) => {
    const lon = record.Longitude || record.longitude || record.Lon || record.lon || 0;
    const lat = record.Latitude || record.latitude || record.Lat || record.lat || 0;
    
    setViewState(prev => ({
      ...prev,
      longitude: parseFloat(lon),
      latitude: parseFloat(lat),
      zoom: 12,
      transitionDuration: 1000
    }));
    
    const newWindow: DetailWindowData = {
      id: `window-${Date.now()}`,
      x: window.innerWidth / 2 - 200,
      y: window.innerHeight / 2 - 150,
      width: 400,
      height: 300,
      data: record,
      layerId: activeTableLayerId!,
      lon: parseFloat(lon),
      lat: parseFloat(lat)
    };
    setDetailWindows(prev => [...prev, newWindow]);
    setWindowPositions(prev => ({ 
      ...prev, 
      [newWindow.id]: { x: newWindow.x, y: newWindow.y, w: newWindow.width, h: newWindow.height } 
    }));
  };

  const toggle3D = () => {
    setViewState(prev => ({
      ...prev,
      pitch: prev.pitch === 0 ? 45 : 0,
      bearing: prev.pitch === 0 ? 30 : 0,
      transitionDuration: 500
    }));
  };

  const createDeckLayers = () => {
    const deckLayers: any[] = [];
    
    layers.forEach(l => {
      if (!l.visible) return;
      
      if (l.type === 'raster') {
        const cogUrl = 'https://sentinel-cogs.s3.us-west-2.amazonaws.com/sentinel-s2-l2a-cogs/2020/S2A_31UCT_20200101_0_L2A/TCI.tif';
        deckLayers.push(
          new TileLayer({
            id: l.id,
            data: [`http://localhost:8000/api/v1/raster/tiles/{z}/{x}/{y}.png?url=${encodeURIComponent(cogUrl)}`],
            maxZoom: 19,
            minZoom: 0,
            opacity: l.opacity,
            renderSubLayers: (props: any) => {
              const { bbox: {west, south, east, north} } = props.tile;
              return new BitmapLayer(props, {
                data: undefined,
                image: props.data,
                bounds: [west, south, east, north]
              });
            }
          })
        );
      } else if (l.data) {
        const scale = scales[l.id];
        const filteredData = l.data.filter(d => {
            if (l.filters?.search) {
                const search = l.filters.search.toLowerCase();
                const nameMatch = (d.Name || d.name || '').toLowerCase().includes(search);
                const descMatch = (d.Description || d.description || '').toLowerCase().includes(search);
                if (!nameMatch && !descMatch) return false;
            }
            if (l.filters?.parameter_filter && !(d.parameter_name || '').toLowerCase().includes(l.filters.parameter_filter.toLowerCase())) return false;
            if (l.filters?.form_filter && !(d.form_value || '').toLowerCase().includes(l.filters.form_filter.toLowerCase())) return false;
            return true;
        });

        deckLayers.push(new ScatterplotLayer({
          id: l.id,
          data: filteredData,
          pickable: true,
          opacity: l.opacity,
          stroked: true,
          filled: true,
          radiusScale: 1,
          radiusMinPixels: 6,
          radiusMaxPixels: 100,
          lineWidthMinPixels: 1,
          getPosition: d => {
              // Priority 1: User upload detected coordinates
              if (l.filters?.coords_lon && l.filters?.coords_lat) {
                  return [parseFloat(d[l.filters.coords_lon] || 0), parseFloat(d[l.filters.coords_lat] || 0)];
              }
              // Priority 2: Standard naming patterns
              const lon = d.Longitude || d.longitude || d.Lon || d.lon || d.lng || d.Lng || d.x || d.X || 0;
              const lat = d.Latitude || d.latitude || d.Lat || d.lat || d.y || d.Y || 0;
              return [parseFloat(lon), parseFloat(lat)];
          },
          getFillColor: d => scale && l.vizField ? scale(d[l.vizField]) : l.color,
          getLineColor: [255, 255, 255, 150],
          onClick: handleMapClick,
          updateTriggers: {
            getFillColor: [l.vizField, l.palette, scale],
            data: l.data,
            filters: l.filters
          }
        }));
      }
    });
    return deckLayers;
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-gray-900 font-sans">
      <DeckGL
        viewState={viewState}
        onViewStateChange={({ viewState: vs }) => setViewState(vs as any)}
        controller={{scrollZoom: true, dragPan: true, dragRotate: true}}
        layers={createDeckLayers()}
      >
        <Map
          mapboxAccessToken={MAPBOX_TOKEN}
          mapStyle="mapbox://styles/mapbox/dark-v11"
          projection={{name: 'mercator'}}
        />
        
        {/* Connector Lines SVG Layer */}
        <svg className="absolute top-0 left-0 w-full h-full pointer-events-none z-40 overflow-visible">
            {detailWindows.map(w => {
                const pos = windowPositions[w.id];
                if (!pos) return null;
                const [sx, sy] = viewport.project([w.lon, w.lat]);
                const tx = pos.x + pos.w / 2;
                const ty = pos.y + pos.h / 2;
                return (
                    <g key={`cable-${w.id}`}>
                        <path d={`M ${sx} ${sy} Q ${(sx+tx)/2} ${sy}, ${tx} ${ty}`} stroke="rgba(37, 99, 235, 0.2)" strokeWidth="4" fill="none" className="transition-all duration-300" />
                        <path d={`M ${sx} ${sy} Q ${(sx+tx)/2} ${sy}, ${tx} ${ty}`} stroke="rgba(37, 99, 235, 0.6)" strokeWidth="1.5" strokeDasharray="4 4" fill="none" className="transition-all duration-300" />
                        <circle cx={sx} cy={sy} r="4" fill="#2563eb" className="animate-pulse" />
                    </g>
                );
            })}
        </svg>
      </DeckGL>

      <LayerManager
        layers={layers}
        onToggle={handleLayerToggle}
        onOpacityChange={handleLayerOpacity}
        onColorChange={handleLayerColor}
        onRemove={handleRemoveLayer}
        onOpenCatalog={() => setIsCatalogOpen(true)}
        onFilterChange={handleFilterChange}
        onOpenTable={handleOpenTable}
        onVizChange={handleVizChange}
        activeTableLayerId={activeTableLayerId || undefined}
      />

      <div className="absolute top-[88vh] left-4 z-50">
         <button onClick={toggle3D} className="group relative flex items-center justify-center w-12 h-12 bg-white rounded-full shadow-2xl hover:bg-gray-100 transition-all border border-gray-100" title="Toggle 2D/3D View">
            <span className="text-[10px] font-black text-blue-600 transition-transform group-active:scale-90">{viewState.pitch === 0 ? '3D' : '2D'}</span>
          </button>
      </div>

      {showDataTable && activeTableLayerId && (
        <DataTable layer={layers.find(l => l.id === activeTableLayerId)} onRowClick={handleTableRowClick} onClose={() => { setShowDataTable(false); setActiveTableLayerId(null); }} />
      )}

      {isCatalogOpen && (
        <Catalog onAddDataset={handleAddDataset} onUploadData={handleUploadData} onClose={() => setIsCatalogOpen(false)} />
      )}

      {detailWindows.map(window => {
        const layer = layers.find(l => l.id === window.layerId);
        return (
          <Rnd
            key={window.id}
            default={{ x: window.x, y: window.y, width: window.width, height: window.height }}
            minWidth={300}
            minHeight={250}
            onDrag={(_e, d) => setWindowPositions(prev => ({ ...prev, [window.id]: { ...prev[window.id], x: d.x, y: d.y } }))}
            onResize={(_e, _direction, ref, _delta, position) => {
                setWindowPositions(prev => ({ 
                    ...prev, 
                    [window.id]: { 
                        x: position.x, 
                        y: position.y, 
                        w: ref.offsetWidth, 
                        h: ref.offsetHeight 
                    } 
                }));
            }}
            className="absolute z-50 pointer-events-auto"
          >
            <DetailWindow
              data={window.data}
              datasetName={layer?.dataset}
              displayField={layer?.displayField}
              tooltipFields={layer?.tooltipFields}
              onClose={() => {
                handleCloseWindow(window.id);
                setWindowPositions(prev => {
                    const next = { ...prev };
                    delete next[window.id];
                    return next;
                });
              }}
            />
          </Rnd>
        );
      })}

      <ChatInterface />
    </div>
  );
}

export default App;
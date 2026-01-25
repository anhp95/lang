import * as colorbrewer from 'colorbrewer';
import { scaleOrdinal, scaleQuantize } from 'd3-scale';
import { extent } from 'd3-array';

export type PaletteType = 'qualitative' | 'sequential' | 'diverging';

export interface PaletteInfo {
    name: string;
    type: PaletteType;
    colors: string[];
}

const getBrewer = () => {
    try {
        // Handle both default and namespace imports
        return (colorbrewer as any).default || colorbrewer;
    } catch {
        return {};
    }
};

// Get all ColorBrewer palettes
export const getAllPalettes = (): PaletteInfo[] => {
    const list: PaletteInfo[] = [];
    const cb = getBrewer();
    
    // Qualitative
    ['Accent', 'Dark2', 'Paired', 'Pastel1', 'Pastel2', 'Set1', 'Set2', 'Set3', 'Category10', 'Pastel', 'Tableau10'].forEach(name => {
        const p = cb[name];
        if (p) {
            const maxColors = Math.max(...Object.keys(p).map(Number));
            list.push({ name, type: 'qualitative', colors: p[maxColors] });
        }
    });
    
    // Sequential
    ['Blues', 'Greens', 'Greys', 'Oranges', 'Purples', 'Reds', 'BuGn', 'BuPu', 'GnBu', 'OrRd', 'PuBu', 'PuBuGn', 'PuRd', 'RdPu', 'YlGn', 'YlGnBu', 'YlOrBr', 'YlOrRd', 'Viridis', 'Inferno', 'Magma', 'Plasma'].forEach(name => {
         const p = cb[name];
         if (p) {
            const maxColors = Math.max(...Object.keys(p).map(Number));
            list.push({ name, type: 'sequential', colors: p[maxColors] });
         }
    });

    // Diverging
    ['BrBG', 'PiYG', 'PRGn', 'PuOr', 'RdBu', 'RdGy', 'RdYlBu', 'RdYlGn', 'Spectral', 'Cool', 'Warm'].forEach(name => {
        const p = cb[name];
        if (p) {
           const maxColors = Math.max(...Object.keys(p).map(Number));
           list.push({ name, type: 'diverging', colors: p[maxColors] });
        }
    });

    // Fallbacks if brewer is empty
    if (list.length === 0) {
        list.push({ name: 'Vibrant', type: 'qualitative', colors: ['#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00'] });
        list.push({ name: 'Ocean', type: 'sequential', colors: ['#f7fbff', '#deebf7', '#c6dbef', '#9ecae1', '#6baed6', '#4292c6', '#2171b5', '#084594'] });
    }
    
    return list;
};

// Map hex to [r, g, b]
export const hexToRgb = (hex: string): [number, number, number] => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? [
        parseInt(result[1], 16),
        parseInt(result[2], 16),
        parseInt(result[3], 16)
    ] : [0, 0, 0];
};

export const createColorScale = (type: 'categorical' | 'numerical', values: any[], palette: string[]) => {
    if (type === 'categorical') {
        const uniqueValues = Array.from(new Set(values));
        const scale = scaleOrdinal<string>()
            .domain(uniqueValues)
            .range(palette);
        return (val: any) => hexToRgb(scale(val));
    } else {
        const [min, max] = extent(values.map(Number)) as [number, number];
        const scale = scaleQuantize<string>()
            .domain([min || 0, max || 1])
            .range(palette);
        return (val: any) => hexToRgb(scale(Number(val)));
    }
};

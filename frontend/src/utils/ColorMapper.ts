import * as colorbrewer from 'colorbrewer';
import { scaleOrdinal, scaleQuantize } from 'd3-scale';
import { extent } from 'd3-array';

export type PaletteType = 'qualitative' | 'sequential' | 'diverging';

export interface PaletteInfo {
    name: string;
    type: PaletteType;
    colors: string[];
}

// Get all ColorBrewer palettes
export const getAllPalettes = (): PaletteInfo[] => {
    const list: PaletteInfo[] = [];
    
    // Qualitative
    ['Accent', 'Dark2', 'Paired', 'Pastel1', 'Pastel2', 'Set1', 'Set2', 'Set3'].forEach(name => {
        const p = (colorbrewer as any)[name];
        if (p) {
            const maxColors = Math.max(...Object.keys(p).map(Number));
            list.push({ name, type: 'qualitative', colors: p[maxColors] });
        }
    });
    
    // Sequential
    ['Blues', 'Greens', 'Greys', 'Oranges', 'Purples', 'Reds', 'BuGn', 'BuPu', 'GnBu', 'OrRd', 'PuBu', 'PuBuGn', 'PuRd', 'RdPu', 'YlGn', 'YlGnBu', 'YlOrBr', 'YlOrRd'].forEach(name => {
         const p = (colorbrewer as any)[name];
         if (p) {
            const maxColors = Math.max(...Object.keys(p).map(Number));
            list.push({ name, type: 'sequential', colors: p[maxColors] });
         }
    });
    
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

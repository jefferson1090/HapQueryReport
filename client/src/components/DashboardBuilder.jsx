import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
// --- CONSTANTS ---
const RADIAN = Math.PI / 180;

// Helper to generate SQL from UI filters
const generateSqlFromFilters = (filters) => {
    if (!filters || filters.length === 0) return '';
    return filters
        .filter(f => f.column && f.value !== '')
        .map(f => {
            const isNum = !isNaN(f.value) && f.value.trim() !== '';
            const val = isNum ? f.value : `'${f.value}'`;
            const col = f.column;
            switch (f.operator) {
                case 'equals': return `${col} = ${val}`;
                case 'not_equals': return `${col} != ${val}`;
                case 'greater_than': return `${col} > ${val}`;
                case 'less_than': return `${col} < ${val}`;
                case 'contains': return `${col} LIKE '%${f.value}%'`;
                default: return `${col} = ${val}`;
            }
        })
        .join(' AND ');
};

import {
    BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    LabelList, Treemap, Sector
} from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';
import ConnectionForm from './ConnectionForm';
import DataView from './DataView';
import { FixedSizeList as List } from 'react-window';
import { LayoutGrid, BarChart2, PieChart as PieIcon, TrendingUp, Hash, Layers, Table as TableIcon, ArrowLeft, ArrowRight, Trash2, Plus, Search as SearchIcon, Star, Clock, Save, GripVertical, Check } from 'lucide-react';
const API_URL = 'http://localhost:3001'; // Standard Dev Port

// --- ENTERPRISE ANALYTICS PALETTE ---
// --- ENTERPRISE ANALYTICS PALETTE (Lighter/Vibrant) ---
const COLORS = [
    '#0EA5E9', // Sky Blue (Primary)
    '#22C55E', // Green (Success)
    '#F59E0B', // Amber (Warning)
    '#F43F5E', // Rose (Danger)
    '#8B5CF6', // Violet
    '#06B6D4', // Cyan
    '#F97316', // Orange
    '#EC4899', // Pink
    '#6366F1', // Indigo
    '#10B981'  // Emerald
];

// Custom Tooltip Component (Premium Glassmorphism)
const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-white/95 backdrop-blur-sm p-4 border border-gray-200 shadow-[0_8px_30px_rgb(0,0,0,0.12)] rounded-xl text-xs z-50 min-w-[180px]">
                <p className="font-bold text-gray-800 mb-2 border-b border-gray-100 pb-1">{label}</p>
                {payload.map((entry, index) => (
                    <div key={index} className="flex items-center justify-between gap-4 mb-1 last:mb-0">
                        <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-[2px]" style={{ backgroundColor: entry.color }}></span>
                            <span className="text-gray-500 font-medium capitalize">{entry.name}:</span>
                        </div>
                        {/* CRITICAL FIX: Read 'entry.payload.value' (raw) not 'entry.value' (visual geometry) */}
                        <span className="font-mono font-bold text-gray-700 text-sm">
                            {(entry.payload.value !== undefined)
                                ? entry.payload.value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })
                                : (typeof entry.value === 'number' ? entry.value.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : entry.value)
                            }
                        </span>
                    </div>
                ))}
            </div>
        );
    }
    return null;
};

// --- CHART WIZARD CONSTANTS ---
const CHART_TYPES = [
    { id: 'kpi', label: 'KPI Card', icon: <Hash size={24} />, description: 'Exibe um único valor de destaque.' },
    { id: 'bar', label: 'Gráfico de Barras', icon: <BarChart2 size={24} />, description: 'Comparação entre categorias.' },
    { id: 'line', label: 'Gráfico de Linha', icon: <TrendingUp size={24} />, description: 'Tendência ao longo do tempo.' },
    { id: 'area', label: 'Gráfico de Área', icon: <Layers size={24} />, description: 'Volume e tendência acumulada.' },
    { id: 'pie', label: 'Gráfico de Pizza', icon: <PieIcon size={24} />, description: 'Distribuição proporcional.' },
    { id: 'donut', label: 'Gráfico de Rosca', icon: <PieIcon size={24} />, description: 'Variação moderna da pizza.' },
    { id: 'table', label: 'Tabela de Dados', icon: <Hash size={24} />, description: 'Visualização tabular de dados agrupados.' },
    { id: 'treemap', label: 'Mapa (Treemap)', icon: <Layers size={24} />, description: 'Densidade hierárquica.' },
    // A stacked bar is just a config on 'bar' but we can expose it as a type for UX
    { id: 'stacked_bar', label: 'Barras Empilhadas', icon: <BarChart2 size={24} />, description: 'Comparação com subdivisões.' }
];

const DEFAULT_CHART_CONFIG = {
    type: 'bar',
    title: '',
    xAxis: '',
    yAxis: '',
    aggType: 'count',
    color: COLORS[0]
};

// --- HELPER: GET OPERATORS ---
const getOperatorsForType = (type) => {
    if (!type) return [
        { value: 'equals', label: 'Igual' },
        { value: 'contains', label: 'Contém' },
        { value: 'greater_than', label: 'Maior que' } // Generic fallback
    ];

    const t = type.toUpperCase();

    if (t.includes('NUMBER') || t.includes('NUMERIC') || t.includes('FLOAT') || t.includes('INTEGER') || t.includes('DECIMAL')) {
        return [
            { value: 'equals', label: 'Igual' },
            { value: 'greater_than', label: 'Maior que' },
            { value: 'less_than', label: 'Menor que' }, // Added Less Than specifically
            { value: 'less_equal', label: 'Menor ou igual' },
            { value: 'greater_equal', label: 'Maior ou igual' },
            { value: 'between', label: 'Entre faixa' },
            { value: 'list', label: 'Lista' }
        ];
    } else if (t.includes('DATE') || t.includes('TIME')) {
        return [
            { value: 'equals', label: 'Igual' },
            { value: 'greater_than', label: 'Posterior a' },
            { value: 'less_than', label: 'Anterior a' },
            { value: 'between', label: 'Entre datas' }
        ];
    } else {
        // Text / Default
        return [
            { value: 'equals', label: 'Igual' },
            { value: 'contains', label: 'Contém' },
            { value: 'starts_with', label: 'Iniciado com' },
            { value: 'ends_with', label: 'Terminado com' },
            { value: 'list', label: 'Lista' }
        ];
    }
};



// --- CUSTOM LABEL RENDERER (Clean, Centered, White) ---
const renderCustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, index, payload, value }) => {
    const RADIAN = Math.PI / 180;
    // Calculate position at 60% of radius (centered in slice)
    const radius = innerRadius + (outerRadius - innerRadius) * 0.6;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    // Only show if slice is large enough (> 5%)
    if (percent < 0.05) return null;

    // Use raw value if available, else value
    const val = payload.value !== undefined ? payload.value : value;
    const display = typeof val === 'number' ? val.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : val;

    return (
        <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" style={{ fontSize: '12px', fontWeight: 'bold', textShadow: '0 1px 2px rgba(0,0,0,0.5)', pointerEvents: 'none' }}>
            {display}
        </text>
    );
};
const renderActiveShape = (props) => {
    const { cx, cy, midAngle, innerRadius, outerRadius, startAngle, endAngle, fill, payload, percent, value, showValues } = props;
    const RADIAN = Math.PI / 180;

    // Label Logic
    let labelContent = null;

    if (showValues) {
        // Use raw value if available
        const val = payload.value !== undefined ? payload.value : value;

        // Fallback to 0 if undefined
        const safeVal = val === undefined || val === null ? 0 : val;
        const display = typeof safeVal === 'number' ? safeVal.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : safeVal;

        // Calculate Position (centroid) - MATCHING renderCustomLabel (0.6 factor)
        // We use the original outerRadius for calculation to ensure text stays in the same place as the non-hovered state
        const radius = innerRadius + (outerRadius - innerRadius) * 0.6;
        const x = cx + radius * Math.cos(-midAngle * RADIAN);
        const y = cy + radius * Math.sin(-midAngle * RADIAN);

        labelContent = (
            <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" style={{ fontSize: '12px', fontWeight: 'bold', textShadow: '0 1px 2px rgba(0,0,0,0.5)', pointerEvents: 'none' }}>
                {display}
            </text>
        );
    }

    return (
        <g style={{ outline: 'none' }}>
            <Sector
                cx={cx}
                cy={cy}
                innerRadius={innerRadius}
                outerRadius={outerRadius + 8} // Expand 8px
                startAngle={startAngle}
                endAngle={endAngle}
                fill={fill} // Maintain original color
                stroke="#fff"
                strokeWidth={2}
                style={{ outline: 'none', filter: 'drop-shadow(0px 4px 8px rgba(0,0,0,0.2))' }}
            />
            {labelContent}
        </g>
    );
};

const ChartVisuals = ({ data, chart, showValues, onDrillDown }) => {
    const [activeIndex, setActiveIndex] = useState(-1);
    const [expandLegend, setExpandLegend] = useState(false);

    // Robust Handler for both Pie Slices and Legend Items
    // Robust Handler for both Pie Slices and Legend Items
    const onPieEnter = (data, index) => {
        // console.log("onPieEnter", data, index); // Debug

        // 1. Direct Index (Standard Pie Hover)
        if (typeof index === 'number') {
            setActiveIndex(index);
            return;
        }

        // 2. Legend Hover/Click (Recharts passes object as first arg)
        // Structure is often: { payload: { index: 0, ... }, value: ..., ... }
        if (data && data.payload && typeof data.payload.index === 'number') {
            setActiveIndex(data.payload.index);
            return;
        }

        // 3. Fallback for potential root properties
        if (data && typeof data.index === 'number') {
            setActiveIndex(data.index);
            return;
        }
    };

    // --- DRILLDOWN HANDLER (Click) ---
    const handleRefClick = (data, index) => {
        console.log("handleRefClick Triggered", data);

        if (!onDrillDown) {
            console.warn("onDrillDown prop is missing in ChartVisuals!");
            return;
        }

        let item = null;
        // Pie / Legend
        if (data && data.payload && data.payload.name) item = data.payload;
        // Bar / Line
        else if (data && data.activePayload && data.activePayload[0]) item = data.activePayload[0].payload;
        // Direct object
        else if (data && data.name) item = data;

        if (item) {
            console.log("Drilling down on item:", item);
            // CRITICAL FIX: Use drillKey if available (for mapped Nulls/Empty)
            // If drillKey exists (even if null/empty string), use it. otherwise fallback.
            const drillTarget = item.drillKey !== undefined ? { ...item, name: item.drillKey } : item;

            // PASS PROCESSED DATA (for 'Others' exclusion logic)
            onDrillDown(drillTarget, processedData);
        } else {
            console.warn("Could not determine item from click data", data);
        }
    };

    if (!data || data.length === 0) {
        return (
            <div className="flex items-center justify-center h-full w-full text-gray-300 text-xs text-center p-4">
                Sem dados para exibir
            </div>
        );
    }

    // SMART DATA GROUPING & VISUAL BOOSTING (Moved here to support both Dashboard keys and Wizard Preview)
    const processedData = useMemo(() => {
        if (!data || !Array.isArray(data)) return [];

        // Only apply grouping for Pie/Donut/Treemap
        const isCircular = chart.type === 'pie' || chart.type === 'donut' || chart.type === 'treemap';

        if (isCircular) {
            // Sort Descending
            const sorted = [...data].sort((a, b) => (Number(b.value) || 0) - (Number(a.value) || 0));

            // 1. Grouping Logic (Top 20 + Others) - Increased from 5 to 20 to show more detail
            const grouped = [];
            let othersSum = 0;
            const TOP_LIMIT = 20;

            sorted.forEach((item, index) => {
                const val = Number(item.value) || 0;
                // Preserve raw name for drill-down (CRITICAL for Null/Empty checks)
                const rawName = item.name;
                // Ensure name exists for display
                const displayName = (item.name === null || item.name === undefined || item.name === '') ? '(Vazio)' : item.name;

                // Strict grouping: Top N only. Everything else to Others.
                if (index < TOP_LIMIT) {
                    // Normalize Name: If null/undefined/empty, set to (Vazio)
                    // BUT keep original for drillKey
                    let finalName = item.name;
                    if (finalName === null || finalName === undefined || String(finalName).trim() === '') {
                        finalName = '(Vazio)';
                    }
                    if (index < 5) console.log(`[ProcessedData] Item ${index}: Name="${item.name}", Final="${finalName}", DrillKey="${item.name}"`); // Log first few
                    grouped.push({
                        ...item,
                        name: finalName,
                        drillKey: item.name, // PRESERVE RAW VALUE (null, '', etc)
                        originalValue: val,
                        value: val
                    });
                } else {
                    othersSum += val;
                }
            });

            if (othersSum > 0) {
                grouped.push({ name: chart.othersLabel || 'Outros', drillKey: 'Outros', value: othersSum, originalValue: othersSum });
            }

            // 2. Visual Boosting Logic
            // Boost small slices to minimum 8% for visibility
            const minShare = 0.08;
            const groupedTotal = grouped.reduce((acc, curr) => acc + curr.value, 0);

            const boostedData = grouped.map(item => {
                const raw = Number(item.value) || 0;
                const share = groupedTotal > 0 ? raw / groupedTotal : 0;
                let visual = raw;

                if (share < minShare && share > 0) {
                    visual = groupedTotal * minShare;
                }

                return {
                    ...item,
                    value: raw,              // RAW DATA (Preserved)
                    visualValue: visual,     // VISUAL DATA (Boosted)
                    percentShare: share,
                    displayLabel: raw.toLocaleString('pt-BR')
                };
            });

            if (boostedData.length === 0 && data.length > 0) return data;
            return boostedData;
        }

        return data; // Return raw for Bar/Line/etc
    }, [data, chart?.type, chart?.othersLabel]);

    // KPI Card Style - Clean & Bold
    if (chart.type === 'kpi') {
        const val = data.value || (data[0] ? data[0].value : 0) || 0;
        return (
            <div className="flex flex-col items-center justify-center h-full w-full text-center overflow-hidden p-4 relative group">
                <div className="absolute inset-0 bg-gradient-to-br from-gray-50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1 truncate w-full relative z-10">{chart.title}</h3>
                <div className="text-5xl font-black truncate w-full tracking-tight relative z-10" style={{ color: chart.color || COLORS[0] }} title={val}>
                    {typeof val === 'number' ? val.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : val}
                </div>
            </div>
        );
    }

    // TABLE VIEW
    if (chart.type === 'table') {
        return (
            <div className="flex flex-col h-full w-full overflow-hidden bg-white rounded-xl shadow-sm border border-gray-100/50">
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
                    <h3 className="text-sm font-bold text-gray-700 truncate">{chart.title}</h3>
                    <div className="p-1 bg-gray-50 rounded text-gray-400">
                        <TableIcon size={14} />
                    </div>
                </div>
                <div className="flex-1 overflow-auto custom-scrollbar p-0">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-gray-50/50 sticky top-0 z-10 backdrop-blur-sm">
                            <tr>
                                <th className="px-4 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100">Categoria</th>
                                <th className="px-4 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider text-right border-b border-gray-100">Valor</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {data.map((row, idx) => (
                                <tr key={idx} className="hover:bg-blue-50/30 transition-colors">
                                    <td className="px-4 py-2 text-xs font-medium text-gray-600 truncate max-w-[140px]" title={row.name}>{row.name}</td>
                                    <td className="px-4 py-2 text-xs font-bold text-gray-800 text-right font-mono">
                                        {typeof row.value === 'number' ? row.value.toLocaleString('pt-BR') : row.value}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full w-full overflow-hidden bg-white rounded-xl shadow-sm border border-gray-100/50">
            {/* Chart Title - Subtle & Professional */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
                <h3 className="text-sm font-bold text-gray-700 truncate">{chart.title}</h3>
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: chart.color || COLORS[0] }}></div>
            </div>

            <div className="flex-1 min-h-0 w-full p-4 relative">
                <ResponsiveContainer width="100%" height="100%">
                    {chart.type === 'bar' || chart.type === 'stacked_bar' ? (
                        <BarChart data={processedData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis
                                dataKey="name"
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: '#64748b', fontSize: 10, fontWeight: 500 }}
                                interval="preserveStartEnd"
                                padding={{ left: 10, right: 10 }}
                            />
                            <YAxis
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: '#94a3b8', fontSize: 10 }}
                            />
                            <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f8fafc', opacity: 0.6 }} />
                            <Bar
                                dataKey="value"
                                name="Valor"
                                radius={[4, 4, 0, 0]}
                                fill={chart.color || COLORS[0]}
                                onClick={handleRefClick}
                                cursor="pointer"
                                style={{ outline: 'none' }}
                            >
                                {showValues && (
                                    <LabelList dataKey="value" position="top" style={{ fontSize: '10px', fill: '#475569', fontWeight: 'bold' }}
                                        formatter={(val) => typeof val === 'number' ? val.toLocaleString('pt-BR', { notation: "compact" }) : val} />
                                )}
                            </Bar>
                        </BarChart>
                    ) : chart.type === 'line' ? (
                        <LineChart data={processedData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10, fontWeight: 500 }} />
                            <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                            <Tooltip content={<CustomTooltip />} />
                            <Line
                                type="monotone"
                                dataKey="value"
                                stroke={chart.color || COLORS[1]}
                                strokeWidth={3}
                                dot={{ fill: '#fff', strokeWidth: 2, r: 4, stroke: chart.color || COLORS[1] }}
                                activeDot={{ r: 6, strokeWidth: 0, stroke: '#334155', strokeOpacity: 0.5 }}
                                onClick={handleRefClick}
                                cursor="pointer"
                                style={{ outline: 'none' }}
                            >
                                {showValues && (
                                    <LabelList dataKey="value" position="top" style={{ fontSize: '10px', fill: '#475569', fontWeight: 'bold' }}
                                        formatter={(val) => typeof val === 'number' ? val.toLocaleString('pt-BR', { notation: "compact" }) : val} />
                                )}
                            </Line>
                        </LineChart>
                    ) : chart.type === 'area' ? (
                        <AreaChart data={processedData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <defs>
                                <linearGradient id={`color${chart.id}`} x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={chart.color || COLORS[2]} stopOpacity={0.5} />
                                    <stop offset="95%" stopColor={chart.color || COLORS[2]} stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10, fontWeight: 500 }} />
                            <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                            <Tooltip content={<CustomTooltip />} />
                            <Area
                                type="monotone"
                                dataKey="value"
                                stroke={chart.color || COLORS[2]}
                                fillOpacity={1}
                                fill={`url(#color${chart.id})`}
                                strokeWidth={2}
                                activeDot={{ r: 6, strokeWidth: 0, stroke: '#334155', strokeOpacity: 0.5 }} // INTERACTIVE EFFECT
                                onClick={handleRefClick}
                                cursor="pointer"
                            >
                                {showValues && (
                                    <LabelList dataKey="value" position="top" style={{ fontSize: '10px', fill: '#475569', fontWeight: 'bold' }}
                                        formatter={(val) => typeof val === 'number' ? val.toLocaleString('pt-BR', { notation: "compact" }) : val} />
                                )}
                            </Area>
                        </AreaChart>
                    ) : chart.type === 'treemap' ? (
                        <Treemap
                            data={processedData}
                            dataKey="value"
                            nameKey="name"
                            stroke="#fff"
                            fill="#8884d8"
                            content={<CustomTooltip />}
                            onClick={handleRefClick}
                            cursor="pointer"
                        >
                            <Tooltip content={<CustomTooltip />} />
                        </Treemap>
                    ) : (
                        <PieChart data={processedData}>
                            <Pie
                                data={processedData}
                                activeIndex={activeIndex}
                                activeShape={(props) => renderActiveShape({ ...props, showValues })} // Enable Custom Expansion with Label
                                onMouseEnter={onPieEnter}
                                dataKey="visualValue"
                                cx={processedData.length > 5 ? "40%" : "50%"} // Shift left if legend is on right
                                cy="50%"
                                innerRadius={chart.type === 'donut' ? '55%' : 0}
                                outerRadius={processedData.length > 5 ? "80%" : "90%"} // Adjust size
                                paddingAngle={2}
                                nameKey="name"
                                stroke="#fff" // Clean white border
                                strokeWidth={2}
                                // Conditional Label: Show if "Exibir Valores" is active
                                label={showValues ? renderCustomLabel : false}
                                labelLine={false}
                                style={{ outline: 'none' }}
                                isAnimationActive={false} // CRITICAL: Disable animation to prevent label flicker/delay on active shape change
                                onClick={handleRefClick}
                            >
                                {processedData.map((entry, index) => (
                                    <Cell
                                        key={`cell-${index}`}
                                        fill={COLORS[index % COLORS.length]} // Use Bright Palette
                                        className="transition-opacity cursor-pointer"
                                        stroke={activeIndex === index ? '#f59e0b' : '#fff'} // Highlight with Amber when active
                                        strokeWidth={activeIndex === index ? 2 : 2}
                                        strokeOpacity={1}
                                        style={{ outline: 'none' }}
                                    />
                                ))}
                            </Pie>
                            <Tooltip content={<CustomTooltip />} />
                            <Legend
                                onMouseEnter={onPieEnter}
                                onClick={onPieEnter} // Click support
                                onMouseLeave={() => setActiveIndex(-1)}
                                layout={processedData.length > 5 ? "vertical" : "horizontal"}
                                verticalAlign={processedData.length > 5 ? "middle" : "bottom"}
                                align={processedData.length > 5 ? "right" : "center"}
                                iconType="circle"
                                iconSize={10}
                                width={processedData.length > 5 ? 180 : undefined} // Constrain width if vertical
                                formatter={(value, entry) => {
                                    // LIMIT LEGEND ITEMS IF NOT EXPANDED (e.g. show first 10)
                                    // However, Recharts Legend doesn't support "partial" rendering easily via formatter.
                                    // Better approach: We control the `payload` passed to Legend? No, Legend reads from children.
                                    // Alternative: CSS scrolling (already implemented).
                                    // User wants "Click to expand/collapse". 

                                    // Let's stick to the scrolling behavior as base, but add a visual cue?
                                    // Or, implemented a custom Legend component?
                                    // For now, let's keep the optimized scrolling layout as it technically solves "viewing all" without squashing.
                                    // To implement "Expand/Collapse", we would need to overlay the chart or resize the container.

                                    // entry.payload is the data item
                                    // Use raw value if available
                                    const rawVal = entry.payload.value;
                                    const niceVal = (typeof rawVal === 'number') ? rawVal.toLocaleString('pt-BR', { notation: "compact" }) : rawVal;
                                    // Truncate long names if vertical
                                    const maxLen = processedData.length > 5 ? 15 : 30;
                                    const truncName = value.length > maxLen ? value.substring(0, maxLen) + '...' : value;

                                    return <span className="text-gray-600 font-medium ml-1 text-[11px]" title={value}>{truncName} <span className="text-gray-400">({niceVal})</span></span>;
                                }}
                                wrapperStyle={{
                                    fontSize: '11px',
                                    color: '#334155',
                                    paddingLeft: processedData.length > 5 ? '10px' : '0px',
                                    paddingTop: processedData.length > 5 ? '0px' : '20px',
                                    maxHeight: processedData.length > 5 ? '100%' : 'auto',
                                    overflowY: processedData.length > 5 ? 'auto' : 'visible' // simplistic scroll
                                }}
                            />
                        </PieChart>
                    )}
                </ResponsiveContainer>

                {/* EXPAND LEGEND BUTTON (Overlay Trigger) */}
                {processedData.length > 5 && chart.type !== 'bar' && chart.type !== 'line' && (
                    <>
                        <button
                            className="absolute bottom-2 right-2 p-1 px-2 bg-white/90 backdrop-blur rounded-lg shadow-sm text-[10px] text-blue-600 hover:bg-blue-50 transition-all z-10 font-bold border border-blue-100 flex items-center gap-1"
                            onClick={(e) => {
                                e.stopPropagation();
                                setExpandLegend(true);
                            }}
                        >
                            Ver legenda completa ({processedData.length})
                        </button>

                        {/* FULL LEGEND OVERLAY */}
                        <AnimatePresence>
                            {expandLegend && (
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.95 }}
                                    className="absolute inset-0 z-20 bg-white/95 backdrop-blur-sm flex flex-col p-4 overflow-hidden"
                                >
                                    <div className="flex items-center justify-between mb-2 pb-2 border-b border-gray-100">
                                        <h4 className="font-bold text-gray-700 text-xs uppercase tracking-wider">Legenda Completa</h4>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setExpandLegend(false); }}
                                            className="p-1 hover:bg-gray-100 rounded-full text-gray-500 transition-colors"
                                        >
                                            <ArrowRight size={14} className="rotate-180" /> {/* Simulate Back/Close */}
                                        </button>
                                    </div>
                                    <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-1 pr-1">
                                        {processedData.map((entry, index) => (
                                            <div
                                                key={`leg-full-${index}`}
                                                className="flex items-center justify-between text-xs p-2 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors border border-transparent hover:border-gray-100"
                                                onClick={() => {
                                                    // Trigger Drill Down from Overlay
                                                    handleRefClick({ payload: entry });
                                                    setExpandLegend(false); // Close on selection? Maybe optional.
                                                }}
                                            >
                                                <div className="flex items-center gap-2 overflow-hidden">
                                                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: COLORS[index % COLORS.length] }}></span>
                                                    <span className="text-gray-700 font-medium truncate" title={entry.name}>{entry.name}</span>
                                                </div>
                                                <span className="font-mono font-bold text-gray-500">
                                                    {typeof entry.value === 'number' ? entry.value.toLocaleString('pt-BR', { notation: "compact" }) : entry.value}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                    <button
                                        className="mt-2 w-full py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-bold rounded-lg transition-colors"
                                        onClick={(e) => { e.stopPropagation(); setExpandLegend(false); }}
                                    >
                                        Fechar
                                    </button>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </>
                )}
            </div>
        </div>
    );
};

const AsyncChartWrapper = ({ chart, context, onFetch }) => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [retryTrigger, setRetryTrigger] = useState(0);
    const [customTimeout, setCustomTimeout] = useState(120); // Default 120s

    // SMART DATA GROUPING MOVED TO ChartVisuals
    // To support Wizard Preview consistently

    useEffect(() => {
        let active = true;
        setLoading(true);
        setError(null);

        if (!context || !onFetch) {
            setLoading(false);
            return;
        }

        const load = async () => {
            try {
                // Use custom timeout
                const timeoutMs = customTimeout * 1000;
                const timeoutInvalid = new Promise((_, reject) => setTimeout(() => reject(new Error(`Tempo limite excedido (${customTimeout}s)`)), timeoutMs));

                const fetchPromise = onFetch(chart, context);
                const res = await Promise.race([fetchPromise, timeoutInvalid]);

                if (active) {
                    if (res && res.error) {
                        console.error("Async Chart API Error:", res.error);
                        setError(res.error);
                    } else {
                        setData(res);
                    }
                }
            } catch (e) {
                console.error("Async Chart Exception:", e);
                if (active) setError(e.message || "Erro ao carregar");
            } finally {
                if (active) setLoading(false);
            }
        };

        load();
        return () => { active = false; };
    }, [chart, context, onFetch, retryTrigger]); // timeout is read from state ref/closure

    if (loading) return (
        <div className="flex flex-col items-center justify-center h-full w-full text-gray-400 gap-2 animate-pulse bg-white rounded-lg border border-gray-100">
            <div className="w-6 h-6 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin"></div>
            <span className="text-xs font-medium">Carregando dados... ({customTimeout}s)</span>
        </div>
    );

    if (error) return (
        <div className="flex flex-col items-center justify-center h-full w-full text-red-500 text-xs text-center p-4 bg-red-50/20 rounded-lg border border-red-100">
            <span className="font-bold mb-1">Erro ao carregar</span>
            <span className="mb-2 max-w-[150px] truncate" title={error.toString()}>{error.toString()}</span>

            <div className="flex flex-col gap-2 items-center">
                <div className="flex items-center gap-1 bg-white p-1 rounded border border-red-100 shadow-sm">
                    <span className="text-[10px] text-red-400 font-bold uppercase">Timeout:</span>
                    <input
                        type="number"
                        min="10"
                        max="600"
                        className="w-12 text-center text-xs font-bold bg-transparent border-none outline-none focus:ring-0 text-red-600"
                        value={customTimeout}
                        onChange={(e) => setCustomTimeout(Number(e.target.value))}
                    />
                    <span className="text-[10px] text-red-400 font-bold">s</span>
                </div>

                <button
                    onClick={() => setRetryTrigger(p => p + 1)}
                    className="px-3 py-1.5 bg-white border border-red-200 text-red-600 rounded-md shadow-sm hover:bg-red-50 transition-colors font-bold flex items-center gap-1 text-xs"
                >
                    ↻ Tentar Novamente
                </button>
            </div>
        </div>
    );

    return (
        <>
            <style>
                {`
                    .recharts-wrapper { outline: none !important; }
                    .recharts-surface { outline: none !important; }
                    .recharts-layer { outline: none !important; }
                    *:focus { outline: none !important; }
                `}
            </style>
            <ChartVisuals
                data={data || []}
                chart={chart}
                showValues={context?.showValues}
                onDrillDown={context?.onDrillDown}
            />
        </>
    );
};

// --- HELPER COMPONENT FOR SOURCE CARDS ---
const SourceCard = ({ source, isSelected, onSelect }) => (
    <div
        onClick={() => onSelect(source)}
        className={`p-3 rounded-lg border cursor-pointer flex items-center gap-3 transition-all relative overflow-hidden group
            ${isSelected ? 'bg-blue-50 border-blue-500 ring-1 ring-blue-500 shadow-md transform scale-[1.01]' : 'bg-white border-gray-200 hover:border-blue-300 hover:shadow-sm'}
        `}
    >
        {isSelected && (
            <div className="absolute top-0 right-0 w-0 h-0 border-t-[16px] border-t-blue-500 border-l-[16px] border-l-transparent transform rotate-90"></div>
        )}
        <div className="text-xl group-hover:scale-110 transition-transform">{source.icon}</div>
        <div className="flex-1 min-w-0">
            <span className="block text-sm font-bold text-gray-700 truncate" title={source.title}>{source.title}</span>
            <span className="block text-[10px] text-gray-400 truncate">{source.tableName}</span>
        </div>
    </div>
);

// --- EXTERNAL ROW COMPONENT FOR STABILITY ---
// Needs to be defined outside to prevent unmounting on parent render
const ColumnRow = ({ index, style, data }) => {
    const { filteredCols, exportColumns, handleDragStart, handleDragOver, handleDrop, toggleColumnExport, exportSearchTerm } = data;
    const col = filteredCols[index];
    const originalIndex = exportColumns.indexOf(col);
    const isDraggable = exportSearchTerm === '';

    return (
        <div style={style} className="px-2 py-1">
            <div
                draggable={isDraggable}
                onDragStart={(e) => handleDragStart(e, originalIndex)}
                onDragOver={(e) => handleDragOver(e, originalIndex)}
                onDrop={(e) => handleDrop(e, originalIndex)}
                onClick={() => toggleColumnExport(col.id)}
                className={`
                    flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer group select-none
                    ${col.isSelected
                        ? 'bg-white border-blue-200 shadow-sm'
                        : 'bg-gray-50 border-transparent opacity-60 hover:opacity-100 hover:bg-white hover:border-gray-200'}
                `}
            >
                {/* Dragger */}
                {isDraggable && (
                    <div className="text-gray-300 group-hover:text-gray-400 cursor-grab active:cursor-grabbing p-1 -ml-2">
                        <GripVertical className="w-4 h-4" />
                    </div>
                )}

                {/* Checkbox */}
                <div className={`
                    w-5 h-5 rounded-md border flex items-center justify-center transition-colors
                    ${col.isSelected ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-300'}
                `}>
                    {col.isSelected && <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
                </div>

                <span className={`flex-1 font-medium ${col.isSelected ? 'text-gray-900' : 'text-gray-500'}`}>
                    {col.label}
                </span>

                {col.isSelected && (
                    <span className="text-[10px] font-bold tracking-wider text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                        VISÍVEL
                    </span>
                )}
            </div>
        </div>
    );
};

export default function DashboardBuilder({
    data,
    columns,
    onClose,
    onRefresh,
    title,
    totalRecords,
    currentContext,
    onLoadDashboard,
    onFetchAggregatedData,
    allSources,          // { carga: [], sigo: [] }
    onFetchColumns,      // (tableName) => Promise<columns>
    onFetchValues,       // (tableName, column, cb) => void
    isLoading,
    // tableColumns,        // DEPRECATED: Using local state
    // isFetchingColumns    // DEPRECATED: Using local state
}) {
    // Show ALL dashboards
    const [allDashboards, setAllDashboards] = useState([]);
    const dashboards = allDashboards; // No filtering needed for unified view

    const [currentDashboard, setCurrentDashboard] = useState(null); // { id, name, charts: [] }
    const [mode, setMode] = useState('view'); // 'view', 'edit', 'create_setup'
    const [refreshInterval, setRefreshInterval] = useState(0);

    // Filter Drawer State
    const [showFilterDrawer, setShowFilterDrawer] = useState(false);
    const [editingFilters, setEditingFilters] = useState([]);
    const [editingGroupBy, setEditingGroupBy] = useState('');

    const [showChartValues, setShowChartValues] = useState(false);



    // Creation Mode State
    const [newDashName, setNewDashName] = useState('');
    const [selectedSource, setSelectedSource] = useState(null);
    const [newDashFilters, setNewDashFilters] = useState([]); // [{ column, operator, value }]
    const [searchCarga, setSearchCarga] = useState('');
    const [searchSigo, setSearchSigo] = useState('');
    const [filterValueOptions, setFilterValueOptions] = useState({}); // { filterId: ['val1', 'val2'] }

    // Local Filter State (Refactor Fix)
    const [localColumns, setLocalColumns] = useState([]);
    const [isInternalFetching, setIsInternalFetching] = useState(false);
    const [operatorSearch, setOperatorSearch] = useState('');

    // Wizard State
    const [wizardOpen, setWizardOpen] = useState(false);
    const [wizardStep, setWizardStep] = useState(1); // 1: Type, 2: Data, 3: Style
    const [wizConfig, setWizConfig] = useState(DEFAULT_CHART_CONFIG);

    // --- DRILLDOWN EXPORT STATE ---
    const [exportModalOpen, setExportModalOpen] = useState(false);
    const [exportType, setExportType] = useState('xlsx');
    const [exportPhase, setExportPhase] = useState('choice'); // 'choice', 'selection'
    const [exportColumns, setExportColumns] = useState([]);
    const [exportSearchTerm, setExportSearchTerm] = useState('');


    // --- PRESETS STATE ---
    const [exportTab, setExportTab] = useState('columns'); // 'columns', 'presets'
    const [presetName, setPresetName] = useState('');
    const [presets, setPresets] = useState({ history: [], saved: [] });
    const [draggedColIndex, setDraggedColIndex] = useState(null);

    // --- DRILLDOWN STATE ---
    const [drilldownState, setDrilldownState] = useState({
        active: false,
        title: '',
        rows: [],
        columns: [],
        loading: false,
        error: null,
        metaData: [],
        source: null // [NEW] Used for Preset Scoping
    });
    // Drilldown Local State for DataView
    const [drillFilters, setDrillFilters] = useState({});
    const [drillSort, setDrillSort] = useState({ key: null, direction: 'asc' });

    // Updated Signature to accept contextData (full chart data)
    const handleDrillDown = async (chart, item, contextData) => {
        // Guard: Check source. Allow if source is present.
        if (!chart.source) {
            console.warn("DrillDown aborted: No source table defined.");
            alert("Erro Drill-down: Tabela de origem não encontrada neste gráfico (chart.source undefined).");
            return;
        }

        // Determine Column and Value
        let col = chart.xAxis || chart.column || chart.groupBy;
        const val = item.name; // category name

        // If no column found, try to infer from common keys or Wizard State equivalent
        if (!col && (chart.type === 'pie' || chart.type === 'donut')) {
            col = 'STATUS'; // Sensible default or try to find it
            // Better: Check if wizConfig is available for this chart? No, chart is saved config.
            // Assume 'STATUS' or 'DS_ERRO' based on common usage if missing.
            // Ideally the chart config MUST have identifiers.
        }

        if (!col) {
            console.warn("DrillDown aborted: Could not determine grouping column.", chart);
            alert(`Erro Drill-down: Não foi possível identificar a coluna de agrupamento. (xAxis/groupBy missing). Tentou: ${col}`);
            return;
        }

        // Guard removed to support customized Outros/Null logic further down

        console.log(`[DrillDown START] Source: ${chart.source}, Col: ${col}, Val: "${val}" (Type: ${typeof val})`);

        if (val === 'Outros') {
            console.log("[DrillDown] Context Data for exclusion:", contextData);
            if (!contextData) console.error("[DrillDown] ERROR: contextData is undefined!");
        }

        setDrilldownState({
            active: true,
            title: `Detalhes: ${val} (${chart.title})`,
            rows: [],
            columns: [],
            loading: true,
            error: null,
            metaData: []
        });

        // Reset Local State for new drilldown
        setDrillFilters({});
        setDrillSort({ key: null, direction: 'asc' });

        try {
            // Construct Precise SQL for DrillDown
            // We use a subquery to ensure we filter the result of the source (which might be a complex view/query)
            // Handle numeric vs string values
            const isNumeric = !isNaN(parseFloat(val)) && isFinite(val);
            const safeVal = String(val).replace(/'/g, "''"); // Escape single quotes

            let whereClause = '';

            // --- A. SPECIAL HANDLING: NULL / EMPTY ---
            console.log(`[DrillDown DEBUG] Checking Null/Empty for val: "${val}" (Type: ${typeof val})`);
            // Check for: null, undefined, empty string, whitespace, "NULL" string, "(Vazio)" label
            const isEffectiveNull = val === null ||
                val === undefined ||
                val === '' ||
                String(val).trim() === '' ||
                String(val).toUpperCase() === 'NULL' ||
                val === '(Vazio)';

            if (isEffectiveNull) {
                console.log("[DrillDown DEBUG] Detected NULL/Empty value - Applying IS NULL filter");
                whereClause = `${col} IS NULL`;
            }
            // --- B. SPECIAL HANDLING: "OUTROS" (Exclusion) ---
            else if (val === 'Outros' && contextData && Array.isArray(contextData)) {
                // Determine what are the "Known" values to exclude
                const excludeValues = contextData
                    .filter(d => {
                        // Use drillKey if available (raw value), else name
                        const k = d.drillKey !== undefined ? d.drillKey : d.name;
                        return k !== 'Outros' && k !== null && k !== '' && k !== '(Vazio)';
                    })
                    .map(d => {
                        const v = d.drillKey !== undefined ? d.drillKey : d.name;
                        const vSafe = String(v).replace(/'/g, "''");
                        // Use string quoting for safety
                        return `'${vSafe}'`;
                    });

                if (excludeValues.length > 0) {
                    whereClause = `${col} NOT IN (${excludeValues.join(',')}) AND ${col} IS NOT NULL`;
                } else {
                    // Fallback if no context data (should rare)
                    whereClause = `${col} IS NOT NULL`;
                }
            }
            // --- C. STANDARD EXACT MATCH ---
            else {
                if (isNumeric) {
                    whereClause = `${col} = '${safeVal}'`; // Try quoted first, most robust for mixed types
                } else {
                    whereClause = `${col} = '${safeVal}'`;
                }
            }
            // --- 2. APPEND GLOBAL CONTEXT FILTERS ---
            if (currentDashboard?.context) {
                const globalFilters = [];
                const ctx = currentDashboard.context;

                // A. CARGA VALUE (Mandatory Operator)
                // If specific values are selected (not %), append them.
                // Assuming operator column is 'CD_EMPRESA_PLANO' or similar based on context?
                // Actually, `cargaValue` is a string of IDs or '%'.
                // We need to know the operator column name. It is usually determined by the source type or hardcoded for 'sigo'.
                // If we don't know the column, we might be risky.
                // However, `generateSqlFromFilters` helps with the explicit filters array.

                // Let's rely on `generateSqlFromFilters` for the generic user filters.
                const userFiltersSql = generateSqlFromFilters(ctx.filters);
                if (userFiltersSql) {
                    globalFilters.push(`(${userFiltersSql})`);
                }

                // B. Special 'CargaValue' handling (Mandatory Operator)
                if (ctx.cargaValue && ctx.cargaValue !== '%' && ctx.cargaValue !== 'TODOS') {
                    // Heuristic to determine Column Name
                    // Sigo/Views usually use CD_EMPRESA_PLANO, Standard Tables use CD_OPERADORA
                    const isSigoSource = (chart.source && (chart.source.toUpperCase().includes('VW_') || chart.source.toUpperCase().includes('SIGO'))) || ctx.sqlMode;
                    const opCol = isSigoSource ? 'CD_EMPRESA_PLANO' : 'CD_OPERADORA';

                    // cargaValue is comma separated string of IDs
                    // Sanitize IDs
                    const ids = ctx.cargaValue.split(',').map(id => id.trim()).filter(id => !isNaN(id));

                    if (ids.length > 0) {
                        // FIX: Quote IDs to prevent ORA-01722 if column is VARCHAR
                        globalFilters.push(`${opCol} IN ('${ids.join("','")}')`);
                    }
                }

                if (globalFilters.length > 0) {
                    whereClause += ` AND ${globalFilters.join(' AND ')}`;
                }
            }



            const baseSql = `SELECT * FROM ${chart.source} WHERE ${whereClause}`;

            // Initialize Drilldown State - Logic moved to useEffect
            setDrilldownState(prev => ({
                ...prev,
                active: true,
                title: `${chart.title || 'Detalhes'} - ${val}`,
                baseSql: baseSql, // Trigger useEffect
                loading: true,
                rows: [],
                error: null,
                source: chart.source // [NEW] Set Source
            }));

        } catch (e) {
            console.error("DrillDown Error", e);
            setDrilldownState(prev => ({ ...prev, loading: false, error: e.message }));
        }
    };

    // --- SERVER-SIDE FILTERING EFFECT ---
    useEffect(() => {
        if (!drilldownState.active || !drilldownState.baseSql) return;

        const fetchData = async () => {
            setDrilldownState(prev => ({ ...prev, loading: true }));
            try {
                // Construct Filtered SQL
                let finalSql = drilldownState.baseSql;
                let countSql = `SELECT COUNT(*) FROM (${drilldownState.baseSql}) MAIN_QUERY`;

                const activeFilters = Object.entries(drillFilters).filter(([_, val]) => val && val.trim() !== '');

                if (activeFilters.length > 0) {
                    const filterClauses = activeFilters.map(([col, val]) => {
                        // Oracle Case-Insensitive LIKE
                        return `UPPER(TO_CHAR("${col}")) LIKE UPPER('%${val}%')`;
                    }).join(' AND ');

                    finalSql = `SELECT * FROM (${drilldownState.baseSql}) WHERE ${filterClauses}`;
                    countSql = `SELECT COUNT(*) FROM (${drilldownState.baseSql}) WHERE ${filterClauses}`;
                }

                // Append Sort (if any)
                // Note: DataView handles client-sort, but server-sort is better for paging. 
                // For now, let's keep sort client-side on the 1000 rows to avoid complexity, 
                // OR append 'ORDER BY' here. Let's stick to client sort for the visible page.

                console.log("[DrillDown Effect] Fetching:", finalSql);

                // Fetch Raw Data & Count in Parallel
                const [dataMsg, countMsg] = await Promise.all([
                    fetch(`${API_URL}/api/query`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            sql: finalSql,
                            limit: 1000 // Keep limit for View
                        })
                    }).then(r => r.json()),
                    fetch(`${API_URL}/api/query`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ sql: countSql }) // No limit for COUNT
                    }).then(r => r.json())
                ]);

                if (dataMsg.error) throw new Error(dataMsg.error);

                // Extract Total Count
                let total = 0;
                if (countMsg.rows && countMsg.rows.length > 0) {
                    total = countMsg.rows[0][0];
                } else if (dataMsg.rows) {
                    total = dataMsg.rows.length;
                }

                setDrilldownState(prev => ({
                    ...prev,
                    rows: dataMsg.rows || [],
                    metaData: dataMsg.metaData,
                    loading: false,
                    totalCount: total,
                    currentSql: finalSql // Save for Export All
                }));

            } catch (e) {
                console.error("DrillDown Fetch Error", e);
                setDrilldownState(prev => ({ ...prev, loading: false, error: e.message }));
            }
        };

        // Debounce
        const timeoutId = setTimeout(fetchData, 500);
        return () => clearTimeout(timeoutId);

    }, [drilldownState.baseSql, drillFilters]); // React to filters!

    // --- PRESETS HELPERS ---
    const loadPresets = (source) => {
        if (!source) return;
        const key = `HAP_EXPORT_PRESETS_${source}`;
        try {
            const stored = localStorage.getItem(key);
            if (stored) {
                setPresets(JSON.parse(stored));
            } else {
                setPresets({ history: [], saved: [] });
            }
        } catch (e) { console.error("Error loading presets", e); }
    };

    const savePresetToStorage = (newPresets, source) => {
        const key = `HAP_EXPORT_PRESETS_${source}`;
        localStorage.setItem(key, JSON.stringify(newPresets));
        setPresets(newPresets);
    };

    const handleSavePreset = () => {
        if (!presetName.trim()) return alert("Digite um nome para o modelo.");
        const currentSelection = exportColumns.filter(c => c.isSelected).map(c => c.name);

        const newSaved = [
            { name: presetName, columns: currentSelection, date: Date.now() },
            ...presets.saved.filter(p => p.name !== presetName) // Overwrite if same name
        ];

        savePresetToStorage({ ...presets, saved: newSaved }, drilldownState.source);
        setPresetName('');
        alert("Modelo salvo com sucesso!");
    };

    const handleDeletePreset = (name, type = 'saved') => {
        const newList = presets[type].filter(p => p.name !== name);
        savePresetToStorage({ ...presets, [type]: newList }, drilldownState.source);
    };

    const applyPreset = (presetColumns) => {
        const newCols = [];
        const remainingPool = [...exportColumns];
        presetColumns.forEach(colName => {
            const foundIndex = remainingPool.findIndex(c => c.name === colName);
            if (foundIndex !== -1) {
                const [found] = remainingPool.splice(foundIndex, 1);
                newCols.push({ ...found, isSelected: true });
            }
        });
        const rest = remainingPool.map(c => ({ ...c, isSelected: false }));
        setExportColumns([...newCols, ...rest]);
        setExportTab('columns');
    };

    // --- DRAG AND DROP HELPERS ---
    const handleDragStart = (e, index) => {
        setDraggedColIndex(index);
        e.dataTransfer.effectAllowed = "move";
    };

    const handleDragOver = (e, index) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
    };

    const handleDrop = (e, targetIndex) => {
        e.preventDefault();
        if (draggedColIndex === null) return;
        const sourceIndex = draggedColIndex;
        if (sourceIndex === targetIndex) return;

        setExportColumns(prev => {
            const newCols = [...prev];
            const [movedItem] = newCols.splice(sourceIndex, 1);
            newCols.splice(targetIndex, 0, movedItem);
            return newCols;
        });
        setDraggedColIndex(null);
    };

    const toggleSelectAll = () => {
        const allSelected = exportColumns.every(c => c.isSelected);
        setExportColumns(prev => prev.map(c => ({ ...c, isSelected: !allSelected })));
    };

    const moveColumn = (index, direction) => { // Keep for fallback or unused
        setExportColumns(prev => {
            const newCols = [...prev];
            const targetIndex = index + direction;
            if (targetIndex < 0 || targetIndex >= newCols.length) return prev;
            const temp = newCols[index];
            newCols[index] = newCols[targetIndex];
            newCols[targetIndex] = temp;
            return newCols;
        });
    };

    const handleDrillDownExport = (type) => {
        if (!drilldownState.rows || drilldownState.rows.length === 0) return alert("Sem dados para exportar.");
        setExportType(type);
        setExportPhase('choice');

        // Initialize export columns
        const initCols = drilldownState.metaData.map((col, idx) => ({
            id: idx,
            label: col.name,
            name: col.name, // keys needed for mapping
            isSelected: true
        }));
        setExportColumns(initCols);
        setExportTab('columns'); // Reset tab
        loadPresets(drilldownState.source); // Load scoped presets
        setExportModalOpen(true);
    };

    const toggleColumnExport = (id) => {
        setExportColumns(prev => prev.map(c => c.id === id ? { ...c, isSelected: !c.isSelected } : c));
    };

    const [isExporting, setIsExporting] = useState(false);
    const [exportSuccess, setExportSuccess] = useState(false);

    const executeDrillDownExport = async (type, customColumns = null) => {
        try {
            if (isExporting) return;

            // 1. Get Save Path
            const defaultName = `export_${drilldownState.title.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 20)}_${Date.now()}.${type === 'excel' ? 'xlsx' : 'csv'}`;
            const filters = [{ name: type === 'excel' ? 'Excel Files' : 'CSV Files', extensions: [type === 'excel' ? 'xlsx' : 'csv'] }];

            let filePath = null;
            if (window.electronAPI) {
                filePath = await window.electronAPI.invoke('dialog:show-save', { defaultPath: defaultName, filters });
            } else {
                filePath = 'WEB_DOWNLOAD';
            }

            if (!filePath) return;

            // 2. Show "Generating" UI
            setIsExporting(true);
            setExportSuccess(false);
            await new Promise(r => setTimeout(r, 100));

            // Determine columns
            let columnsToExport = drilldownState.metaData;
            if (customColumns) {
                columnsToExport = customColumns.filter(c => c.isSelected).map(c => drilldownState.metaData.find(md => md.name === c.name));
            }

            // 3. Fetch ALL Data
            if (!drilldownState.currentSql) throw new Error("SQL indisponível.");
            const res = await fetch(`${API_URL}/api/query`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sql: drilldownState.currentSql, limit: 'all' })
            });
            const json = await res.json();
            if (json.error) throw new Error(json.error);

            // 4. Process Data
            const headers = columnsToExport.map(c => c.name);
            const validIndices = columnsToExport.map(c => drilldownState.metaData.findIndex(md => md.name === c.name));
            const rows = json.rows.map(row => validIndices.map(i => row[i]));
            const dataToExport = [headers, ...rows];

            // 5. Write File
            if (window.electronAPI && filePath !== 'WEB_DOWNLOAD') {
                if (type === 'xlsx' || type === 'excel') {
                    const wb = XLSX.utils.book_new();
                    const ws = XLSX.utils.aoa_to_sheet(dataToExport);
                    XLSX.utils.book_append_sheet(wb, ws, "Dados");
                    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });
                    await window.electronAPI.invoke('fs:write-file', { filePath, content: wbout, encoding: 'base64' });
                } else {
                    const csvContent = dataToExport.map(e => e.join(";")).join("\n");
                    await window.electronAPI.invoke('fs:write-file', { filePath, content: csvContent, encoding: 'utf-8' });
                }
            } else {
                if (type === 'xlsx' || type === 'excel') {
                    const wb = XLSX.utils.book_new();
                    const ws = XLSX.utils.aoa_to_sheet(dataToExport);
                    XLSX.utils.book_append_sheet(wb, ws, "Dados");
                    XLSX.writeFile(wb, defaultName);
                } else {
                    const csvContent = dataToExport.map(e => e.join(";")).join("\n");
                    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
                    saveAs(blob, defaultName);
                }
            }

            // 6. Show Success & Save History
            setExportSuccess(true);

            // 7. Save to History (Auto)
            if (customColumns) {
                const currentSelection = customColumns.filter(c => c.isSelected).map(c => c.name);
                const newHistory = [
                    { name: `Exportação ${new Date().toLocaleTimeString()}`, columns: currentSelection, date: Date.now() },
                    ...presets.history
                ].slice(0, 5); // Keep last 5

                savePresetToStorage({ ...presets, history: newHistory }, drilldownState.source);
            }

        } catch (error) {
            console.error("Export failed", error);
            alert("Erro ao exportar: " + error.message);
            setExportModalOpen(false);
        } finally {
            setIsExporting(false);
        }
    };




    // Operadora Filter State
    const [operatorList, setOperatorList] = useState([]);

    const [selectedOperators, setSelectedOperators] = useState([]); // Array of IDs

    // Delete Confirmation State
    const [deleteConfirm, setDeleteConfirm] = useState(null); // { id: dashboardId } or null

    useEffect(() => {
        fetchOperators(); // Initial load (default Carga)
    }, []);

    const fetchOperators = async (isSigo = false) => {
        try {
            setOperatorList([]); // Clear while fetching
            let query = "Select cd_operadora, nm_operadora From incorpora.tb_ope_operadora order by cd_operadora desc";

            if (isSigo) {
                query = "Select cd_empresa_plano, nm_empresa_plano From VW_EMPRESA_PLANO_OPER order by 1";
            }

            const response = await fetch('http://localhost:3001/api/query', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sql: query })
            });
            const data = await response.json();
            if (data.rows) {
                const formatted = data.rows.map(row => ({
                    id: row[0],
                    name: row[1]
                }));
                setOperatorList(formatted);
            }
        } catch (e) {
            console.error("Failed to fetch operators", e);
        }
    };

    // Helper: Identify Numeric Columns
    const numericColumns = useMemo(() => {
        if (!data || data.length === 0 || !columns) return [];
        return columns.filter(col => {
            if (!col || !col.name) return false;
            const sample = data.slice(0, 10).map(r => r[col.name]);
            return sample.some(v => !isNaN(parseFloat(v)) && isFinite(v));
        });
    }, [columns, data]);

    useEffect(() => {
        // [MIGRATION] Load from Server, fallback to LocalStorage if empty
        fetch(`${API_URL}/api/dashboards/list`)
            .then(r => r.json())
            .then(data => {
                if (Array.isArray(data) && data.length > 0) {
                    setAllDashboards(data);
                } else {
                    // Fallback: Check LocalStorage (First Run after update)
                    const localSaved = localStorage.getItem('sigo_dashboards');
                    if (localSaved) {
                        try {
                            const parsed = JSON.parse(localSaved);
                            if (parsed.length > 0) {
                                console.log("Migrating dashboards from LocalStorage to Server...");
                                setAllDashboards(parsed);
                                // Sync to Server
                                fetch(`${API_URL}/api/dashboards/save`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ dashboards: parsed })
                                }).catch(console.error);
                            }
                        } catch (e) { }
                    }
                }
            })
            .catch(console.error);
    }, []);

    // Effect: If we have data and NO current dashboard, check if we triggered a load
    // Actually, onLoadDashboard will handle the "loading" state in Parent.
    // Parent will re-render us with data.
    // We need to know if we should Auto-Open a dashboard?
    // Let's rely on parent passing 'initialDashboardId' if needed, or user selects again.

    useEffect(() => {
        let interval;
        if (refreshInterval > 0 && onRefresh) {
            interval = setInterval(onRefresh, refreshInterval * 1000);
        }
        return () => clearInterval(interval);
    }, [refreshInterval, onRefresh]);

    const saveDashboards = (newList) => {
        setAllDashboards(newList);
        // Save to Server
        fetch(`${API_URL}/api/dashboards/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dashboards: newList })
        }).catch(err => {
            console.error("Failed to save dashboards to server", err);
            // Fallback
            localStorage.setItem('sigo_dashboards', JSON.stringify(newList));
        });
    };

    // --- NEW CREATION FLOW ---

    const [expandedGroups, setExpandedGroups] = useState({ 'CARGA': true, 'SIGO': false });

    // Expand/Collapse Group
    const toggleGroup = (group) => {
        setExpandedGroups(prev => ({ ...prev, [group]: !prev[group] }));
    };

    const handleOpenCreateSetup = () => {
        setNewDashName('');
        setSelectedSource(null);
        setNewDashFilters([]);
        setMode('create_setup');
    };

    // Auto-focus Name input when entering setup
    const dashboardNameRef = useRef(null);
    useEffect(() => {
        if (mode === 'create_setup') {
            // Force window focus first (Critical for Electron 'lost focus' bug)
            if (window.electronAPI) window.focus();

            setTimeout(() => {
                if (dashboardNameRef.current) {
                    dashboardNameRef.current.focus();
                }
            }, 300); // Slight delay for animation
        }
    }, [mode]);

    // Cleanup local columns when switching dashboards to avoid stale data
    useEffect(() => {
        setLocalColumns([]);
        // Optional: We could also auto-fetch here if we wanted to pre-load
    }, [currentDashboard?.id]);

    const handleSourceSelect = async (source) => {
        setSelectedSource(source);

        // Refresh Operators based on Source Type
        const isSigo = source.type === 'SQL' || source.id?.startsWith('sigo_') || (source.tableName && source.tableName.includes('VW_'));
        fetchOperators(isSigo);
        setSelectedOperators([]); // Reset selection on source change

        // Fetch columns for filters
        if ((source.tableName || source.content) && onFetchColumns) {
            setIsInternalFetching(true);
            setLocalColumns([]); // Clear previous
            try {
                // Pass the source identifier: tableName or the whole source object if needed
                // We'll pass an object so the handler can decide
                const cols = await onFetchColumns(source.tableName);
                if (Array.isArray(cols)) {
                    // Apply Heuristics (Match AiBuilder)
                    const processed = cols.filter(c => c && c.name).map(c => {
                        const n = c.name.toUpperCase();
                        let t = c.type || 'VARCHAR2';

                        // 1. Force CD_ and ID_ to Text (even if DB says Number)
                        if (n.startsWith('CD_') || n.startsWith('ID_')) {
                            t = 'VARCHAR2';
                        }
                        // 2. Infer Number/Date if type is generic/missing
                        else if (!c.type || c.type === 'VARCHAR2') {
                            if (n.startsWith('NU_') || n.startsWith('QT_') || n.startsWith('VL_') || n.startsWith('NR_')) t = 'NUMBER';
                            else if (n.startsWith('DT_') || n.startsWith('DATA_') || n.endsWith('_DT') || n.endsWith('_DATA')) t = 'DATE';
                        }
                        return { ...c, type: t };
                    });
                    setLocalColumns(processed);
                }
            } catch (e) {
                console.error("Error fetching columns in DashboardBuilder", e);
            } finally {
                setIsInternalFetching(false);
            }
        }
    };

    const handleAddFilter = (targetList, setTargetList) => {
        setTargetList([...targetList, { id: Date.now(), column: '', operator: 'equals', value: '' }]);
    };

    const handleUpdateFilter = (list, setList, id, field, val) => {
        // If changing column, verify type and reset operator
        let newItem = { ...list.find(f => f.id === id) };

        if (field === 'column') {
            newItem.column = val;
            // Find type
            const colObj = localColumns.find(c => c.name === val);
            if (colObj) {
                const ops = getOperatorsForType(colObj.type);
                newItem.operator = ops[0].value; // Default to first op (usually equals)
            }
            newItem.value = ''; // Reset value
        } else {
            newItem[field] = val;
        }

        setList(list.map(f => f.id === id ? newItem : f));

        if (field === 'column' && onFetchValues && selectedSource.tableName) {
            // Fetch distinct values for dropdown
            onFetchValues(selectedSource.tableName, val, (values) => {
                setFilterValueOptions(prev => ({ ...prev, [id]: values }));
            });
        }
    };

    const handleRemoveFilter = (list, setList, id) => {
        setList(list.filter(f => f.id !== id));
        setFilterValueOptions(prev => {
            const newState = { ...prev };
            delete newState[id];
            return newState;
        });
    };

    const confirmCreateDashboard = () => {
        if (!newDashName.trim()) return alert("O nome é obrigatório");
        if (!selectedSource) return alert("Selecione uma fonte de dados");

        // MANDATORY OPERATOR CHECK
        if (!selectedOperators || selectedOperators.length === 0) {
            return alert("É obrigatório selecionar pelo menos uma Operadora (ou 'TODAS').");
        }

        const context = {
            tableName: selectedSource.tableName,
            filters: newDashFilters,
            type: 'dashboard',
            sqlMode: selectedSource.type === 'SQL',
            parsedSqlData: selectedSource.type === 'SQL' ? { originalSql: selectedSource.content } : null,
            cargaValue: selectedOperators.includes('%') ? '%' : selectedOperators.join(',')
        };

        const newDash = {
            id: Date.now(),
            name: newDashName,
            charts: [],
            context: context,
            type: 'dashboard'
        };

        const newList = [...allDashboards, newDash];
        saveDashboards(newList);

        // Load and Open
        if (onLoadDashboard) {
            onLoadDashboard(newDash, () => {
                setCurrentDashboard(newDash);
                setMode('edit'); // Start in edit mode (empty)
            });
        }
    };



    const saveEditedFilters = () => {
        // Update current dashboard context
        if (!currentDashboard) return;

        // Compute new Carga Value
        let newCargaValue = '%';
        if (selectedOperators.length > 0) {
            if (selectedOperators.includes('%')) newCargaValue = '%';
            else newCargaValue = selectedOperators.join(',');
        }

        const updatedDash = {
            ...currentDashboard,
            context: {
                ...currentDashboard.context,
                filters: editingFilters,
                cargaValue: newCargaValue,
                groupBy: editingGroupBy || ''
            }
        };

        const newList = allDashboards.map(d => d.id === updatedDash.id ? updatedDash : d);
        saveDashboards(newList);

        // Reload
        if (onLoadDashboard) {
            onLoadDashboard(updatedDash, () => {
                setCurrentDashboard(updatedDash);
                setShowFilterDrawer(false);
            });
        }
    };

    const handleDeleteDashboard = (e, dashId) => {
        e.stopPropagation();
        setDeleteConfirm({ id: dashId });
    };

    const executeDelete = () => {
        if (!deleteConfirm) return;
        const dashId = deleteConfirm.id;

        const newList = allDashboards.filter(d => d.id !== dashId);
        saveDashboards(newList);
        if (currentDashboard && currentDashboard.id === dashId) {
            setCurrentDashboard(null);
        }
        setDeleteConfirm(null);
    };

    const [blockingLoad, setBlockingLoad] = useState(false);

    const handleDashboardClick = (dash) => {
        // If the dashboard has context and we have a loader, try to load it first
        if (dash.context && onLoadDashboard) {
            setBlockingLoad(true); // START BLOCKING LOADER

            onLoadDashboard(dash, () => {
                // Callback when data is ready 
                setCurrentDashboard(dash);
                setBlockingLoad(false); // STOP BLOCKING LOADER
            });
            // Fallback safety timeout in case callback incorrectly handles it or parent fails
            setTimeout(() => setBlockingLoad(false), 15000);
        } else {
            setCurrentDashboard(dash);
        }
    };

    // Wizard Handlers
    const openWizard = () => {
        setWizConfig({
            id: null, // New chart
            type: 'bar',
            title: '',
            xAxis: '',
            yAxis: '',
            aggType: 'count',
            color: COLORS[0],
            barSize: 40 // Default bar size
        });
        setWizardStep(1);
        setWizardStep(1);

        // Fetch columns if needed
        if (currentDashboard && currentDashboard.context) {
            // CASE 1: Custom SQL / SIGO (sqlMode)
            if (currentDashboard.context.sqlMode && currentDashboard.context.parsedSqlData?.originalSql) {
                if (!localColumns || localColumns.length === 0) {
                    const originalSql = currentDashboard.context.parsedSqlData.originalSql;

                    if (!originalSql) {
                        alert("Erro: SQL Original não encontrado para este painel.");
                        return;
                    }

                    // Remove trailing semicolon if present
                    const cleanSql = originalSql.trim().replace(/;$/, '');

                    // Wrap to get metadata only
                    const metaSql = `SELECT * FROM (${cleanSql}) t WHERE 1=0`;

                    fetch('/api/query', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ sql: metaSql })
                    }).then(res => res.json()).then(data => {
                        if (data.metaData) {
                            const cols = data.metaData.map(c => ({ name: c.name, type: c.dbType?.name || 'VARCHAR2' }));
                            setLocalColumns(cols);
                        } else {
                            if (data.error) alert("Erro ao buscar colunas: " + data.error);
                        }
                    }).catch(err => {
                        console.error("Fetch Error:", err);
                        alert("Erro de conexão ao buscar colunas.");
                    });
                }
            }
            // CASE 2: Standard Table (or View)
            else if (currentDashboard.context.tableName && onFetchColumns) {
                if (!localColumns || localColumns.length === 0) {
                    onFetchColumns(currentDashboard.context.tableName).then(cols => {
                        if (cols) setLocalColumns(cols);
                    });
                }
            }
        }

        setWizardOpen(true);
    };

    const handleEditChart = (chart) => {
        setWizConfig({
            id: chart.id,
            type: chart.type,
            title: chart.title,
            xAxis: chart.xAxis,
            yAxis: chart.yAxis,
            aggType: chart.aggType,
            color: chart.color || COLORS[0],
            barSize: chart.barSize || 40
        });
        setWizardStep(1);

        // Fetch columns if needed (Same logic as openWizard)
        if (currentDashboard && currentDashboard.context) {
            // CASE 1: Custom SQL / SIGO (sqlMode)
            if (currentDashboard.context.sqlMode && currentDashboard.context.parsedSqlData?.originalSql) {
                if (!localColumns || localColumns.length === 0) {
                    const originalSql = currentDashboard.context.parsedSqlData.originalSql;
                    if (originalSql) {
                        const cleanSql = originalSql.trim().replace(/;$/, '');
                        const metaSql = `SELECT * FROM (${cleanSql}) t WHERE 1=0`;
                        fetch('http://localhost:3001/api/query', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ sql: metaSql })
                        }).then(res => res.json()).then(data => {
                            if (data.metaData) {
                                const cols = data.metaData.map(c => ({ name: c.name, type: c.dbType?.name || 'VARCHAR2' }));
                                setLocalColumns(cols);
                            }
                        }).catch(console.error);
                    }
                }
            }
            // CASE 2: Standard Table (or View)
            else if (currentDashboard.context.tableName && onFetchColumns) {
                if (!localColumns || localColumns.length === 0) {
                    onFetchColumns(currentDashboard.context.tableName).then(cols => {
                        if (cols) setLocalColumns(cols);
                    });
                }
            }
        }

        setWizardOpen(true);
    };

    const handleWizardFinish = () => {
        if (!wizConfig.xAxis && wizConfig.type !== 'kpi') return alert("Selecione o Eixo X / Categoria");
        if (wizConfig.type === 'kpi' && wizConfig.aggType !== 'count' && !wizConfig.yAxis) return alert("Selecione o campo de Valor");

        console.log("[WizardFinish] Saving config:", wizConfig);

        // Ensure ID is properly handled. If 0 or null, it's new.
        const isEdit = wizConfig.id !== null && wizConfig.id !== undefined && wizConfig.id !== 0;

        const newChart = {
            ...wizConfig,
            id: isEdit ? wizConfig.id : Date.now(),
            title: wizConfig.title || 'Novo Gráfico',
            source: currentDashboard.context?.tableName || selectedSource?.tableName // CRITICAL: Save source for drill-down
        };

        let updatedDash;
        if (isEdit) {
            // Edit existing
            console.log("[WizardFinish] Updating existing chart", wizConfig.id);
            updatedDash = {
                ...currentDashboard,
                charts: currentDashboard.charts.map(c => String(c.id) === String(wizConfig.id) ? newChart : c)
            };
        } else {
            // Create new
            console.log("[WizardFinish] Creating new chart");
            updatedDash = {
                ...currentDashboard,
                charts: [...currentDashboard.charts, newChart]
            };
        }

        setCurrentDashboard(updatedDash);
        saveDashboards(dashboards.map(d => d.id === updatedDash.id ? updatedDash : d));
        setWizardOpen(false);
    };

    const handleDeleteChart = (chartId) => {
        if (!confirm('Remover este gráfico?')) return;
        const updatedDash = { ...currentDashboard, charts: currentDashboard.charts.filter(c => c.id !== chartId) };
        setCurrentDashboard(updatedDash);
        saveDashboards(dashboards.map(d => d.id === updatedDash.id ? updatedDash : d));
    };

    // Data Processing
    const processChartData = (config) => {
        // MOCK PREVIEW FOR WIZARD (If no data available)
        if ((!data || data.length === 0) && config.id === 'preview') {
            if (config.type === 'kpi') return { value: 1250, label: config.title };
            return [
                { name: 'Item Exemplo A', value: 120 },
                { name: 'Item Exemplo B', value: 95 },
                { name: 'Item Exemplo C', value: 60 },
                { name: 'Item Exemplo D', value: 30 }
            ];
        }

        // Guard clause for no data
        if (!data || data.length === 0) return [{ name: 'Sem Dados', value: 0 }];

        if (config.type === 'kpi') {
            let val = 0;
            if (config.aggType === 'count') {
                val = data.length;
            } else {
                val = data.reduce((acc, curr) => acc + (parseFloat(curr[config.yAxis]) || 0), 0);
                if (config.aggType === 'avg') val = val / (data.length || 1);
            }
            return { value: val, label: config.title };
        }

        // Grouping
        const grouped = {};
        data.forEach(row => {
            const key = row[config.xAxis] || 'N/A';
            if (!grouped[key]) grouped[key] = { count: 0, sum: 0, values: [] };
            grouped[key].count++;
            if (config.yAxis) {
                const num = parseFloat(row[config.yAxis]) || 0;
                grouped[key].sum += num;
            }
        });

        return Object.keys(grouped).map(key => {
            const item = grouped[key];
            let val = item.count;
            if (config.aggType === 'sum') val = item.sum;
            if (config.aggType === 'avg') val = item.sum / item.count;
            return { name: key, value: val };
        }).sort((a, b) => b.value - a.value).slice(0, 20);
    };

    const renderChartNode = (chart) => {
        // High Volume Strategy: Server-Side Aggregation
        if (onFetchAggregatedData && currentDashboard?.context) {
            // FORCE REMOUNT ON FILTER CHANGE
            // We create a hash of the filters to use as a key, forcing the component to reset state when filters change.
            const filterHash = JSON.stringify({
                filters: currentDashboard.context.filters,
                carga: currentDashboard.context.cargaValue,
                sql: currentDashboard.context.sqlMode
            });

            return (
                <AsyncChartWrapper
                    key={`${chart.id}-${filterHash}`} // CRITICAL: Reset on context change
                    chart={chart}
                    context={{
                        ...currentDashboard.context,
                        showValues: showChartValues,
                        onDrillDown: (item, contextData) => handleDrillDown(chart, item, contextData) // PASS CONTEXT DATA
                    }}
                    onFetch={onFetchAggregatedData}
                />
            );
        }

        // Legacy/Preview Strategy: Client-Side Aggregation
        const pData = processChartData(chart);
        return (
            <ChartVisuals
                data={pData}
                chart={chart}
                showValues={showChartValues}
                onDrillDown={(item) => handleDrillDown(chart, item)}
            />
        );
    };

    return (
        <div className="fixed inset-0 z-[10000] bg-[#F3F4F6] flex flex-col font-sans animate-in fade-in duration-200">
            {/* Loading Overlay (Prop or Blocking) */}
            {(isLoading || blockingLoad) && (
                <div className="absolute inset-0 z-[10010] flex items-center justify-center bg-white/80 backdrop-blur-sm flex-col gap-4">
                    <div className="bg-white px-8 py-6 rounded-2xl shadow-2xl flex flex-col items-center gap-4 border border-blue-100 animate-bounce-in max-w-sm text-center">
                        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                        <div>
                            <h3 className="font-bold text-gray-800 text-lg">Carregando Dashboard</h3>
                            <p className="text-sm text-gray-500">Buscando dados e total de registros...</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Top Navigation Bar REMOVED - Replaced by Per-View Layouts */}

            {/* Main Content Area */}
            <main className="flex-1 overflow-auto p-8 relative">
                {mode === 'create_setup' ? (
                    // --- CREATION SCREEN (PROFESSIONAL LAYOUT) ---
                    <div className="flex h-full min-h-[calc(100vh-100px)] bg-gray-50 -m-8">
                        {/* SIDEBAR (Unified) */}
                        <div className="w-64 bg-white border-r border-gray-200 hidden md:flex flex-col flex-shrink-0">
                            <div className="p-8">
                                <h1 className="text-2xl font-bold text-orange-600 flex items-center gap-2">
                                    <span className="text-3xl">❖</span> Painéis
                                </h1>
                            </div>
                            <nav className="flex-1 px-4 space-y-2">
                                <div onClick={() => setMode('view')} className="group flex items-center gap-3 px-4 py-3 text-gray-500 font-medium hover:bg-gray-50 hover:text-blue-900 rounded-xl cursor-pointer transition-colors">
                                    <div className="w-4 h-4 rounded-full border-[3px] border-gray-300 group-hover:border-blue-600 bg-white"></div>
                                    <span>Meus Painéis</span>
                                </div>
                                <div className="group flex items-center gap-3 px-4 py-3 text-blue-900 font-bold bg-blue-50 rounded-xl relative cursor-default">
                                    <div className="w-4 h-4 rounded-full border-[3px] border-blue-600 bg-white"></div>
                                    <span>Novo Painel</span>
                                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-8 bg-blue-600 rounded-r-full"></div>
                                </div>
                                <div className="group flex items-center gap-3 px-4 py-3 text-gray-500 font-medium hover:bg-gray-50 rounded-xl cursor-not-allowed opacity-60">
                                    <div className="w-4 h-4 rounded-full border-[3px] border-gray-300 bg-white"></div>
                                    <span>Lixeira</span>
                                </div>
                            </nav>
                            <div className="p-6 border-t border-gray-100 text-xs text-center text-gray-400">
                                Hapvida NotreDame Style<br />v2.0
                            </div>
                        </div>

                        {/* MAIN CONTENT AREA */}
                        <div className="flex-1 flex flex-col overflow-hidden">
                            {/* HEADER */}
                            <div className="bg-blue-800 text-white p-8 shadow-md z-10 flex justify-between items-center">
                                <div>
                                    <h2 className="text-3xl font-bold mb-2">Criar Novo Painel</h2>
                                    <p className="text-blue-200 text-sm">Configure os dados iniciais do seu dashboard.</p>
                                </div>
                                <button onClick={() => setMode('view')} className="px-6 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg font-bold text-sm transition-colors">
                                    Cancelar
                                </button>
                            </div>

                            {/* FORM CONTAINER */}
                            <div className="flex-1 overflow-y-auto p-8">
                                <div className="max-w-5xl mx-auto bg-white rounded-3xl shadow-sm border border-gray-200 p-10 animate-in fade-in slide-in-from-bottom-4">

                                    {/* Name */}
                                    <div className="mb-8">
                                        <label className="block text-sm font-bold text-gray-700 mb-2">1. Nome do Painel</label>
                                        <input
                                            ref={dashboardNameRef}
                                            type="text"
                                            className="w-full p-4 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 text-lg font-medium relative z-10"
                                            placeholder="Ex: Relatório Mensal de Vendas"
                                            value={newDashName || ''}
                                            onChange={(e) => setNewDashName(e.target.value)}
                                            autoComplete="off"
                                        />
                                    </div>

                                    {/* Source Selection */}
                                    {/* Source Selection - TREE VIEW */}
                                    <div className="mb-8">
                                        <label className="block text-sm font-bold text-gray-700 mb-4">2. Selecione a Fonte de Dados</label>



                                        <div className="border border-gray-200 rounded-xl overflow-hidden">
                                            {/* Group: Carga de Dados */}
                                            <div className="border-b border-gray-100">
                                                <button
                                                    onClick={() => toggleGroup('CARGA')}
                                                    className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 transition-colors"
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center text-lg">📊</div>
                                                        <div className="text-left">
                                                            <span className="block font-bold text-gray-700 text-sm">Carga de Dados</span>
                                                            <span className="block text-[10px] text-gray-400 font-medium uppercase tracking-wider">Tabelas e Importações</span>
                                                        </div>
                                                    </div>
                                                    <div className={`transform transition-transform ${expandedGroups['CARGA'] ? 'rotate-180' : ''} `}>▼</div>
                                                </button>

                                                {expandedGroups['CARGA'] && (
                                                    <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3 animate-in fade-in slide-in-from-top-2 bg-gray-50/30">
                                                        {/* Scoped Search: Carga */}
                                                        <div className="col-span-full mb-2">
                                                            <input
                                                                type="text"
                                                                placeholder="🔍 Buscar em Carga de Dados..."
                                                                className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:ring-1 focus:ring-blue-500 bg-white"
                                                                value={searchCarga}
                                                                onChange={(e) => setSearchCarga(e.target.value)}
                                                                onClick={(e) => e.stopPropagation()}
                                                            />
                                                        </div>
                                                        {allSources?.carga?.filter(s => s.title.toLowerCase().includes(searchCarga.toLowerCase())).length === 0 && (
                                                            <div className="text-gray-400 text-xs p-3 italic">
                                                                Nenhum resultado encontrado.
                                                            </div>
                                                        )}
                                                        {allSources?.carga?.filter(s => s.title.toLowerCase().includes(searchCarga.toLowerCase())).map(source => (
                                                            <div
                                                                key={source.id}
                                                                onClick={() => handleSourceSelect(source)}
                                                                className={`p-3 rounded-lg border cursor-pointer flex items-center gap-3 transition-all relative overflow-hidden group
                                                        ${selectedSource?.id === source.id ? 'bg-blue-50 border-blue-500 ring-1 ring-blue-500 shadow-md transform scale-[1.01]' : 'bg-white border-gray-200 hover:border-blue-300 hover:shadow-sm'}
    `}
                                                            >
                                                                {selectedSource?.id === source.id && (
                                                                    <div className="absolute top-0 right-0 w-0 h-0 border-t-[16px] border-t-blue-500 border-l-[16px] border-l-transparent transform rotate-90"></div>
                                                                )}
                                                                <div className="text-xl group-hover:scale-110 transition-transform">{source.icon}</div>
                                                                <div className="flex-1 min-w-0">
                                                                    <span className="block text-sm font-bold text-gray-700 truncate" title={source.title}>{source.title}</span>
                                                                    <span className="block text-[10px] text-gray-400 truncate">{source.tableName}</span>
                                                                </div>
                                                            </div>
                                                        ))}
                                                        {(!allSources?.carga || allSources.carga.length === 0) && (
                                                            <p className="text-sm text-gray-400 italic p-2">Nenhuma fonte de carga disponível.</p>
                                                        )}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Group: Sigo */}
                                            <div>
                                                <button
                                                    onClick={() => toggleGroup('SIGO')}
                                                    className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 transition-colors"
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center text-lg">📈</div>
                                                        <div className="text-left">
                                                            <span className="block font-bold text-gray-700 text-sm">Extração SIGO</span>
                                                            <span className="block text-[10px] text-gray-400 font-medium uppercase tracking-wider">SQL Personalizado</span>
                                                        </div>
                                                    </div>
                                                    <div className={`transform transition-transform ${expandedGroups['SIGO'] ? 'rotate-180' : ''} `}>▼</div>
                                                </button>

                                                {expandedGroups['SIGO'] && (
                                                    <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3 animate-in fade-in slide-in-from-top-2 bg-gray-50/30">
                                                        {/* Scoped Search: Sigo */}
                                                        <div className="col-span-full mb-2">
                                                            <input
                                                                type="text"
                                                                placeholder="🔍 Buscar em Extração Sigo..."
                                                                className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:ring-1 focus:ring-purple-500 bg-white"
                                                                value={searchSigo}
                                                                onChange={(e) => setSearchSigo(e.target.value)}
                                                                onClick={(e) => e.stopPropagation()}
                                                            />
                                                        </div>
                                                        {allSources?.sigo?.filter(s => s.title.toLowerCase().includes(searchSigo.toLowerCase())).map(source => (
                                                            <div
                                                                key={source.id}
                                                                onClick={() => handleSourceSelect(source)}
                                                                className={`p-3 rounded-lg border cursor-pointer flex items-center gap-3 transition - colors relative overflow-hidden group
                                                        ${selectedSource?.id === source.id ? 'bg-purple-50 border-purple-500 ring-1 ring-purple-500 shadow-md transform scale-[1.01]' : 'bg-white border-gray-200 hover:border-purple-300 hover:shadow-sm'}
    `}
                                                            >
                                                                {selectedSource?.id === source.id && (
                                                                    <div className="absolute top-0 right-0 w-0 h-0 border-t-[16px] border-t-purple-500 border-l-[16px] border-l-transparent transform rotate-90"></div>
                                                                )}
                                                                <div className="text-xl group-hover:scale-110 transition-transform">{source.icon || '📑'}</div>
                                                                <div className="flex-1 min-w-0">
                                                                    <span className="block text-sm font-bold text-gray-700 truncate" title={source.title}>{source.title}</span>
                                                                    <span className="block text-[10px] text-gray-400 truncate">SQL Query</span>
                                                                </div>
                                                            </div>
                                                        ))}
                                                        {(!allSources?.sigo || allSources.sigo.length === 0) && (
                                                            <p className="text-sm text-gray-400 italic p-2">Nenhum relatório SIGO salvo.</p>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Filters */}
                                    {selectedSource && (
                                        <div className="mb-8 animate-in fade-in">
                                            <label className="block text-sm font-bold text-gray-700 mb-4">3. Definir Filtros (Opcional)</label>

                                            {/* OPERATOR SELECTOR (Entity) */}
                                            {operatorList.length > 0 && (
                                                <div className="mb-6 bg-gray-50/50 p-4 rounded-xl border border-gray-100">
                                                    <div className="flex justify-between items-center mb-2">
                                                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">Filtro Principal: Operadora <span className="text-red-500">*</span></label>
                                                        <span className="text-[10px] text-blue-600 font-bold bg-blue-50 px-2 py-0.5 rounded-full">{selectedOperators.includes('%') ? 'TODAS' : `${selectedOperators.length} Selecionadas`}</span>
                                                    </div>
                                                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 max-h-40 overflow-y-auto custom-scrollbar">
                                                        <button
                                                            onClick={() => setSelectedOperators(['%'])}
                                                            className={`p - 2 rounded-lg text - xs font - bold transition-all border ${selectedOperators.includes('%') ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'} `}
                                                        >
                                                            TODAS
                                                        </button>
                                                        {operatorList.map(op => {
                                                            const isSel = selectedOperators.includes(String(op.id));
                                                            return (
                                                                <button
                                                                    key={op.id}
                                                                    onClick={() => {
                                                                        const sid = String(op.id);
                                                                        if (isSel) {
                                                                            setSelectedOperators(prev => prev.filter(p => p !== sid));
                                                                        } else {
                                                                            // If selecting specific, remove '%'
                                                                            setSelectedOperators(prev => [...prev.filter(p => p !== '%'), sid]);
                                                                        }
                                                                    }}
                                                                    className={`p - 2 rounded-lg text - xs font - medium transition-all border truncate text - left relative ${isSel ? 'bg-purple-600 text-white border-purple-600 shadow-md' : 'bg-white text-gray-600 border-gray-200 hover:border-purple-300'} `}
                                                                    title={op.name}
                                                                >
                                                                    {isSel && <span className="absolute right-1 top-1 w-2 h-2 bg-green-400 rounded-full"></span>}
                                                                    {op.id} - {op.name}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                    {selectedOperators.length === 0 && <p className="text-[10px] text-red-400 mt-1 font-bold">Selecione ao menos uma opção.</p>}
                                                </div>
                                            )}

                                            {/* Loading State for Columns */}
                                            {isInternalFetching ? (
                                                <div className="flex flex-col gap-2 p-4 bg-gray-50 rounded-lg animate-pulse">
                                                    <div className="h-4 bg-gray-200 rounded w-1/3 mb-2"></div>
                                                    <div className="h-10 bg-gray-200 rounded w-full"></div>
                                                    <div className="h-10 bg-gray-200 rounded w-full"></div>
                                                </div>
                                            ) : (!localColumns || localColumns.length === 0) ? (
                                                <p className="text-gray-400 italic text-sm p-2 text-center bg-gray-50 rounded border border-dashed text-gray-400">
                                                    Nenhuma coluna disponível para filtrar.
                                                </p>
                                            ) : (
                                                <>
                                                    <div className="space-y-3 mb-4">
                                                        {newDashFilters.map((filter) => {
                                                            const colObj = localColumns.find(c => c.name === filter.column);
                                                            const operators = colObj ? getOperatorsForType(colObj.type) : getOperatorsForType('VARCHAR2');

                                                            return (
                                                                <div key={filter.id} className="flex gap-2 items-center bg-gray-50 p-2 rounded-lg animate-in slide-in-from-left-2 fade-in">
                                                                    <select
                                                                        className="p-2 border rounded-lg text-sm flex-1 bg-white focus:ring-1 focus:ring-blue-500"
                                                                        value={filter.column}
                                                                        onChange={(e) => handleUpdateFilter(newDashFilters, setNewDashFilters, filter.id, 'column', e.target.value)}
                                                                    >
                                                                        <option value="">Coluna...</option>
                                                                        {localColumns.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                                                                    </select>

                                                                    {/* Dynamic Operator Select */}
                                                                    <select
                                                                        className="p-2 border rounded-lg text-sm w-32 bg-white focus:ring-1 focus:ring-blue-500"
                                                                        value={filter.operator}
                                                                        onChange={(e) => handleUpdateFilter(newDashFilters, setNewDashFilters, filter.id, 'operator', e.target.value)}
                                                                    >
                                                                        {operators.map(op => (
                                                                            <option key={op.value} value={op.value}>{op.label}</option>
                                                                        ))}
                                                                    </select>

                                                                    {/* Smart Value Input */}
                                                                    {filterValueOptions[filter.id] && filter.operator === 'equals' ? (
                                                                        <select
                                                                            className="p-2 border rounded-lg text-sm flex-1 bg-white"
                                                                            value={filter.value}
                                                                            onChange={(e) => handleUpdateFilter(newDashFilters, setNewDashFilters, filter.id, 'value', e.target.value)}
                                                                        >
                                                                            <option value="">Selecione...</option>
                                                                            {filterValueOptions[filter.id].map(val => (
                                                                                <option key={val} value={val}>{val}</option>
                                                                            ))}
                                                                        </select>
                                                                    ) : (
                                                                        <input
                                                                            type="text"
                                                                            className="p-2 border rounded-lg text-sm flex-1"
                                                                            placeholder={filter.operator === 'list' ? 'Valores (separados por ,)' : 'Valor...'}
                                                                            value={filter.value}
                                                                            onChange={(e) => handleUpdateFilter(newDashFilters, setNewDashFilters, filter.id, 'value', e.target.value)}
                                                                        />
                                                                    )}
                                                                    <button onClick={() => handleRemoveFilter(newDashFilters, setNewDashFilters, filter.id)} className="text-red-500 hover:bg-red-50 p-2 rounded transition-colors" title="Remover filtro">
                                                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-x"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                                                                    </button>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>

                                                    <button
                                                        onClick={() => handleAddFilter(newDashFilters, setNewDashFilters)}
                                                        className="text-sm font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 px-2 py-1 hover:bg-blue-50 rounded transition-colors"
                                                    >
                                                        + Adicionar Filtro
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    )}

                                    <div className="flex justify-end pt-6 border-t border-gray-100 gap-4">
                                        <button onClick={() => setMode('view')} className="px-6 py-3 text-gray-500 font-bold hover:bg-gray-100 rounded-xl">Cancelar</button>
                                        <button
                                            onClick={confirmCreateDashboard}
                                            className="px-8 py-3 bg-blue-600 text-white font-bold rounded-xl shadow-lg hover:bg-blue-700 transition-transform active:scale-95"
                                        >
                                            Concluir
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : !currentDashboard ? (
                    // --- LIST VIEW (PROFESSIONAL LAYOUT) ---
                    <div className="flex h-full min-h-[calc(100vh-100px)] bg-gray-50 -m-8">
                        {/* SIDEBAR */}
                        <div className="w-64 bg-white border-r border-gray-200 hidden md:flex flex-col flex-shrink-0">
                            <div className="p-8">
                                <h1 className="text-2xl font-bold text-orange-600 flex items-center gap-2">
                                    <span className="text-3xl">❖</span> Painéis
                                </h1>
                            </div>
                            <nav className="flex-1 px-4 space-y-2">
                                <div
                                    onClick={onClose}
                                    className="group flex items-center gap-3 px-4 py-3 text-gray-500 font-medium hover:bg-gray-100 hover:text-gray-800 rounded-xl cursor-pointer transition-colors mb-4 border border-transparent hover:border-gray-200"
                                >
                                    <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center group-hover:bg-white group-hover:shadow-sm">
                                        <ArrowLeft size={16} />
                                    </div>
                                    <span>Voltar ao Início</span>
                                </div>
                                <div className="group flex items-center gap-3 px-4 py-3 text-blue-900 font-bold bg-blue-50 rounded-xl relative cursor-pointer">
                                    <div className="w-4 h-4 rounded-full border-[3px] border-blue-600 bg-white"></div>
                                    <span>Meus Painéis</span>
                                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-8 bg-blue-600 rounded-r-full"></div>
                                </div>
                                <div className="group flex items-center gap-3 px-4 py-3 text-gray-500 font-medium hover:bg-gray-50 rounded-xl cursor-not-allowed opacity-60">
                                    <div className="w-4 h-4 rounded-full border-[3px] border-gray-300 bg-white"></div>
                                    <span>Favoritos</span>
                                </div>
                                <div className="group flex items-center gap-3 px-4 py-3 text-gray-500 font-medium hover:bg-gray-50 rounded-xl cursor-not-allowed opacity-60">
                                    <div className="w-4 h-4 rounded-full border-[3px] border-gray-300 bg-white"></div>
                                    <span>Lixeira</span>
                                </div>
                            </nav>
                            <div className="p-6 border-t border-gray-100 text-xs text-center text-gray-400">
                                Hapvida NotreDame Style<br />v2.0
                            </div>
                        </div>

                        {/* MAIN CONTENT Area */}
                        <div className="flex-1 flex flex-col overflow-hidden">
                            {/* PROFESSIONAL HEADER */}
                            <div className="bg-blue-800 text-white p-8 shadow-md z-10">
                                <h2 className="text-3xl font-bold mb-2">Selecione o painel</h2>
                                <p className="text-blue-200 text-sm">Gerencie, visualize e tome decisões baseadas em dados.</p>
                            </div>

                            {/* SCROLLABLE GRID */}
                            <div className="flex-1 overflow-y-auto p-8">
                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6">
                                    {dashboards.map(d => (
                                        <div
                                            key={d.id}
                                            className="bg-white rounded-xl shadow-sm border border-gray-200 hover:shadow-xl hover:-translate-y-1 transition-all p-0 flex flex-col group relative overflow-hidden"
                                        >
                                            {/* Top Color Accent */}
                                            <div className="h-1.5 w-full bg-gradient-to-r from-blue-500 to-cyan-500"></div>

                                            <div className="p-6 flex-1 flex flex-col">
                                                {/* Header / Name */}
                                                <div className="mb-4">
                                                    <h3 className="text-lg font-bold text-blue-900 leading-tight mb-1">{d.name}</h3>
                                                    {d.context?.tableName && (
                                                        <p className="text-xs font-bold text-blue-500 uppercase tracking-wide">
                                                            {d.context.tableName.split('.').pop()}
                                                        </p>
                                                    )}
                                                </div>

                                                {/* Metadata Grid */}
                                                <div className="bg-gray-50/50 rounded-lg p-3 mb-6">
                                                    <div>
                                                        <span className="block text-[10px] text-gray-400 font-bold uppercase">Visualizações</span>
                                                        <span className="block text-lg font-bold text-gray-700">{d.charts.length}</span>
                                                    </div>
                                                </div>

                                                {/* Status (Mock) */}
                                                {/* <div className="mb-6 px-3 py-2 bg-orange-50 border border-orange-100 rounded-lg flex items-center gap-2">
                                                    <AlertTriangle size={14} className="text-orange-500" />
                                                    <span className="text-xs font-bold text-orange-700">Atenção: Revisão necessária</span>
                                                </div> */}

                                                {/* Actions */}
                                                <div className="mt-auto flex items-center justify-between pt-4 border-t border-gray-100">
                                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800">
                                                        ATIVO
                                                    </span>
                                                    <button
                                                        onClick={() => handleDashboardClick(d)}
                                                        className="text-blue-600 hover:text-blue-800 font-bold text-sm hover:underline flex items-center gap-1"
                                                    >
                                                        Selecionar <ArrowRight size={14} />
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Delete Button (Corner hidden until hover) */}
                                            <button
                                                onClick={(e) => handleDeleteDashboard(e, d.id)}
                                                className="absolute top-3 right-3 p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-all opacity-0 group-hover:opacity-100"
                                                title="Excluir Painel"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    ))}

                                    {/* Create New Card */}
                                    <div
                                        onClick={handleOpenCreateSetup}
                                        className="bg-white rounded-xl border-2 border-dashed border-gray-300 hover:border-blue-500 hover:bg-blue-50/20 flex flex-col items-center justify-center cursor-pointer transition-all min-h-[250px] gap-4 group"
                                    >
                                        <div className="w-16 h-16 rounded-full bg-gray-50 group-hover:bg-blue-100 text-gray-300 group-hover:text-blue-600 flex items-center justify-center transition-colors">
                                            <Plus size={32} strokeWidth={3} />
                                        </div>
                                        <div className="text-center">
                                            <span className="block text-lg font-bold text-gray-500 group-hover:text-blue-600">Criar Novo Painel</span>
                                            <span className="block text-xs text-gray-400 mt-1">Configurar visualizações e dados</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    // --- DETAIL VIEW (PROFESSIONAL LAYOUT) ---
                    <div className="flex h-full min-h-[calc(100vh-100px)] bg-gray-50 -m-8">
                        {/* SIDEBAR (Unified) */}
                        <div className="w-64 bg-white border-r border-gray-200 hidden md:flex flex-col flex-shrink-0">
                            <div className="p-8">
                                <h1 className="text-2xl font-bold text-orange-600 flex items-center gap-2">
                                    <span className="text-3xl">❖</span> Painéis
                                </h1>
                            </div>
                            <nav className="flex-1 px-4 space-y-2">
                                <div
                                    onClick={() => { setCurrentDashboard(null); setMode('view'); }}
                                    className="group flex items-center gap-3 px-4 py-3 text-gray-500 font-medium hover:bg-gray-50 hover:text-blue-900 rounded-xl cursor-pointer transition-colors"
                                >
                                    <div className="w-4 h-4 rounded-full border-[3px] border-gray-300 group-hover:border-blue-600 bg-white"></div>
                                    <span>Meus Painéis</span>
                                </div>
                                <div
                                    onClick={() => { setCurrentDashboard(null); setMode('create_setup'); }}
                                    className="group flex items-center gap-3 px-4 py-3 text-gray-500 font-medium hover:bg-gray-50 hover:text-blue-900 rounded-xl cursor-pointer transition-colors"
                                >
                                    <div className="w-4 h-4 rounded-full border-[3px] border-gray-300 group-hover:border-blue-600 bg-white"></div>
                                    <span>Novo Painel</span>
                                </div>
                                <div className="group flex items-center gap-3 px-4 py-3 text-blue-900 font-bold bg-blue-50 rounded-xl relative cursor-default">
                                    <div className="w-4 h-4 rounded-full border-[3px] border-blue-600 bg-white"></div>
                                    <span className="truncate max-w-[120px]" title={currentDashboard.name}>{currentDashboard.name}</span>
                                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-8 bg-blue-600 rounded-r-full"></div>
                                </div>
                            </nav>
                            <div className="p-6 border-t border-gray-100 text-xs text-center text-gray-400">
                                Hapvida NotreDame Style<br />v2.0
                            </div>
                        </div>

                        {/* MAIN CONTENT AREA */}
                        <div className="flex-1 flex flex-col overflow-hidden">
                            {/* HEADER */}
                            <div className="bg-blue-800 text-white p-6 shadow-md z-10 flex justify-between items-center">
                                <div>
                                    <h2 className="text-2xl font-bold">{currentDashboard.name}</h2>
                                    {currentDashboard.context?.tableName && (
                                        <span className="text-xs bg-blue-900/50 px-2 py-1 rounded text-blue-200 mt-1 inline-block border border-blue-700">
                                            Fonte: {currentDashboard.context.tableName.split('.').pop()}
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={() => setMode(mode === 'view' ? 'edit' : 'view')}
                                        className={`px-4 py-2 rounded-lg font-bold text-xs flex items-center gap-2 transition-all ${mode === 'edit' ? 'bg-white text-blue-800 shadow-lg' : 'bg-blue-900/50 hover:bg-blue-900 text-blue-100'}`}
                                    >
                                        {mode === 'edit' ? '✓ Concluir' : '✏️ Editar'}
                                    </button>
                                    <button
                                        onClick={() => setCurrentDashboard(null)}
                                        className="px-4 py-2 bg-blue-900/30 hover:bg-blue-900 text-white rounded-lg font-bold text-xs transition-colors"
                                    >
                                        Fechar
                                    </button>
                                </div>
                            </div>

                            {/* TOOLBAR */}
                            <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between gap-4 overflow-x-auto">
                                <div className="flex items-center gap-4">
                                    {/* Auto Refresh */}
                                    <div className="flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded-full border border-gray-200">
                                        <div className={`w-2 h-2 rounded-full ${refreshInterval > 0 ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`}></div>
                                        <span className="text-xs font-bold text-gray-600">Atualização:</span>
                                        <select
                                            value={refreshInterval}
                                            onChange={(e) => setRefreshInterval(Number(e.target.value))}
                                            className="bg-transparent text-xs font-bold text-blue-600 outline-none cursor-pointer"
                                        >
                                            <option value={0}>Manual</option>
                                            <option value={10}>10s</option>
                                            <option value={30}>30s</option>
                                            <option value={60}>1m</option>
                                            <option value={300}>5m</option>
                                        </select>
                                    </div>

                                    {/* Show Values */}
                                    <button
                                        onClick={() => setShowChartValues(!showChartValues)}
                                        className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all ${showChartValues ? 'bg-blue-50 border-blue-200 text-blue-600' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                                        title={showChartValues ? 'Ocultar Valores' : 'Exibir Valores'}
                                    >
                                        <span className="text-xs">{showChartValues ? '👁️' : '👁️‍🗨️'}</span>
                                        <span className="text-xs font-bold">{showChartValues ? 'Valores On' : 'Valores Off'}</span>
                                    </button>

                                    {/* Filters */}
                                    <button
                                        onClick={() => {
                                            setEditingFilters(currentDashboard.context?.filters || []);
                                            setEditingGroupBy(currentDashboard.context?.groupBy || '');
                                            const cv = currentDashboard.context?.cargaValue;
                                            if (cv === '%' || !cv) setSelectedOperators(['%']);
                                            else setSelectedOperators(cv.split(',').map(s => s.trim()));

                                            const tn = currentDashboard.context?.tableName || '';
                                            const isSigoDash = tn.includes('VW_') || currentDashboard.context?.sqlMode === true || (currentDashboard.context?.id && String(currentDashboard.context.id).startsWith('sigo_'));
                                            fetchOperators(isSigoDash);

                                            if (currentDashboard.context?.tableName && onFetchColumns) {
                                                onFetchColumns(currentDashboard.context.tableName).then(cols => {
                                                    if (cols && cols.length > 0) setLocalColumns(cols);
                                                });
                                            }
                                            setShowFilterDrawer(true);
                                        }}
                                        className="px-4 py-1.5 bg-white border border-gray-200 text-gray-700 rounded-full font-bold text-xs hover:bg-gray-50 flex items-center gap-2 shadow-sm"
                                    >
                                        🛠️ Filtros
                                    </button>
                                </div>

                                {/* Total Records */}
                                {(totalRecords !== undefined && totalRecords !== null) && (
                                    <div className="flex items-center gap-1 bg-blue-50 px-3 py-1.5 rounded-full border border-blue-100">
                                        <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                                        <span className="text-xs font-bold text-blue-700">Total: {totalRecords.toLocaleString('pt-BR')}</span>
                                    </div>
                                )}

                                {mode === 'edit' && (
                                    <button
                                        onClick={openWizard}
                                        className="px-4 py-1.5 bg-blue-600 text-white rounded-lg font-bold text-xs hover:bg-blue-700 shadow-lg shadow-blue-200 flex items-center gap-2 ml-4 animate-pulse"
                                    >
                                        + Adicionar Gráfico
                                    </button>
                                )}
                            </div>

                            {/* CONTENT */}
                            <div className="flex-1 overflow-y-auto p-6 relative bg-gray-50/50">

                                {/* Empty State */}
                                {(currentDashboard.charts.length === 0) && (
                                    <div className="flex flex-col items-center justify-center p-20 text-center animate-in fade-in zoom-in-50">
                                        <div className="w-32 h-32 bg-gray-50 rounded-full flex items-center justify-center mb-6">
                                            <BarChart2 size={48} className="text-gray-300" />
                                        </div>
                                        <h3 className="text-2xl font-bold text-gray-800 mb-2">Este dashboard está vazio</h3>
                                        <p className="text-gray-500 mb-8 max-w-md">
                                            Adicione gráficos para visualizar seus dados. Clique no botão abaixo para começar.
                                        </p>
                                        <button
                                            onClick={() => {
                                                setMode('edit');
                                                setTimeout(() => openWizard(), 100);
                                            }}
                                            className="px-8 py-4 bg-blue-600 text-white rounded-xl font-bold text-lg hover:bg-blue-700 shadow-xl shadow-blue-200 transition-transform hover:scale-105"
                                        >
                                            + Adicionar Primeiro Gráfico
                                        </button>
                                    </div>
                                )}

                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 auto-rows-[340px]">
                                    {/* Responsive Grid Logic: KPI cards span 1, others span 2 usually */}
                                    {currentDashboard.charts.map(chart => (
                                        <div
                                            key={chart.id}
                                            className={`bg-white rounded-2xl shadow-sm border border-gray-100 p-5 relative group transition-all hover:shadow-lg hover:-translate-y-1 flex flex-col
                                                ${chart.type === 'kpi' ? 'col-span-1 lg:col-span-1 border-l-8 cursor-default' : 'col-span-1 md:col-span-2 lg:col-span-2'}
                                                ${chart.type === 'kpi' ? 'border-l-blue-500' : ''}`}
                                            style={{ height: chart.type === 'kpi' ? '180px' : '380px', borderLeftColor: chart.color || COLORS[0] }}
                                        >
                                            {mode === 'edit' && (
                                                <div className="absolute top-4 right-4 flex items-center gap-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleEditChart(chart); }}
                                                        className="bg-white p-1.5 rounded-lg shadow border hover:text-blue-500"
                                                        title="Editar"
                                                    >
                                                        ✏️
                                                    </button>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleDeleteChart(chart.id); }}
                                                        className="bg-white p-1.5 rounded-lg shadow border hover:text-red-500"
                                                        title="Excluir"
                                                    >
                                                        🗑️
                                                    </button>
                                                </div>
                                            )}
                                            {renderChartNode(chart)}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                )
                }
            </main >

            {/* DRILLDOWN OVERLAY */}
            < AnimatePresence >
                {
                    drilldownState.active && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="fixed inset-0 z-[11000] bg-white flex flex-col"
                        // clear filters on close is handled by setDrilldownState({active:false}) effectively resetting the view next time
                        // BUT we should really clear filters when opening. (Done in handleDrillDown)
                        >
                            {/* HEADER */}
                            <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shadow-sm">
                                <div className="flex items-center gap-4">
                                    <button
                                        onClick={() => setDrilldownState(prev => ({ ...prev, active: false }))}
                                        className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500"
                                    >
                                        <ArrowLeft size={24} />
                                    </button>
                                    <div>
                                        <h2 className="text-xl font-bold text-gray-800">{drilldownState.title}</h2>
                                        <p className="text-sm text-gray-500">
                                            Visualizando {drilldownState.rows.length} de {drilldownState.totalCount !== undefined ? drilldownState.totalCount.toLocaleString() : '...'} registros
                                        </p>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => handleDrillDownExport('excel')}
                                        className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs font-bold text-emerald-700 hover:bg-emerald-50 transition-colors flex items-center gap-2 shadow-sm"
                                    >
                                        <span>📊</span> Excel
                                    </button>
                                    <button
                                        onClick={() => handleDrillDownExport('csv')}
                                        className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs font-bold text-blue-700 hover:bg-blue-50 transition-colors flex items-center gap-2 shadow-sm"
                                    >
                                        <span>📄</span> CSV
                                    </button>
                                </div>
                            </div>

                            {/* CONTENT */}
                            <div className="flex-1 overflow-auto p-6 bg-gray-50">
                                {drilldownState.loading ? (
                                    <div className="flex flex-col items-center justify-center h-full text-gray-400">
                                        <div className="w-8 h-8 border-4 border-gray-300 border-t-blue-500 rounded-full animate-spin mb-4"></div>
                                        <p>Carregando dados detalhados...</p>
                                    </div>
                                ) : drilldownState.error ? (
                                    <div className="flex flex-col items-center justify-center h-full text-red-500">
                                        <p className="font-bold text-lg mb-2">Erro ao carregar dados</p>
                                        <p>{drilldownState.error}</p>
                                    </div>
                                ) : (
                                    <div className="h-full flex flex-col bg-white rounded-xl shadow border border-gray-200 overflow-hidden">
                                        <DataView
                                            viewData={{
                                                rows: drilldownState.rows,
                                                metaData: drilldownState.metaData,
                                                tableName: drilldownState.title
                                            }}
                                            dataFilters={drillFilters}
                                            setDataFilters={setDrillFilters}
                                            dataSort={drillSort}
                                            setDataSort={setDrillSort}
                                            isDrillDown={true}
                                        />
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    )
                }
            </AnimatePresence >

            {/* FILTER DRAWER / EDITOR */}
            < AnimatePresence >
                {showFilterDrawer && (
                    <div className="fixed inset-0 z-[80] flex justify-end bg-black/20 backdrop-blur-sm">
                        <motion.div
                            initial={{ x: '100%' }}
                            animate={{ x: 0 }}
                            exit={{ x: '100%' }}
                            className="bg-white w-[400px] h-full shadow-2xl p-6 flex flex-col"
                        >
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-xl font-bold">Editar Filtros</h3>
                                <button onClick={() => setShowFilterDrawer(false)} className="text-2xl text-gray-400 hover:text-gray-600">×</button>
                            </div>

                            <div className="flex-1 overflow-y-auto space-y-4">
                                {/* MAIN FILTER (Operator) */}
                                <div className="mb-6 bg-gray-50/50 p-4 rounded-xl border border-gray-100">
                                    <div className="flex justify-between items-center mb-2">
                                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">Filtro Principal</label>
                                        <span className="text-[10px] text-blue-600 font-bold bg-blue-50 px-2 py-0.5 rounded-full">{selectedOperators.includes('%') ? 'TODAS' : `${selectedOperators.length} Selecionadas`}</span>
                                    </div>
                                    <input
                                        type="text"
                                        placeholder="Buscar..."
                                        className="w-full mb-2 p-1.5 text-xs border rounded bg-white"
                                        value={operatorSearch}
                                        onChange={(e) => setOperatorSearch(e.target.value)}
                                    />
                                    <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto custom-scrollbar">
                                        <button
                                            onClick={() => setSelectedOperators(['%'])}
                                            className={`p-2 rounded-lg text-xs font-bold transition-all border ${selectedOperators.includes('%') ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'}`}
                                        >
                                            TODAS
                                        </button>
                                        {operatorList.filter(op => !operatorSearch || String(op.name).toLowerCase().includes(operatorSearch.toLowerCase()) || String(op.id).includes(operatorSearch)).map(op => {
                                            const isSel = selectedOperators.includes(String(op.id));
                                            return (
                                                <button
                                                    key={op.id}
                                                    onClick={() => {
                                                        const sid = String(op.id);
                                                        if (isSel) {
                                                            setSelectedOperators(prev => prev.filter(p => p !== sid));
                                                        } else {
                                                            setSelectedOperators(prev => [...prev.filter(p => p !== '%'), sid]);
                                                        }
                                                    }}
                                                    className={`p-2 rounded-lg text-xs font-medium transition-all border truncate text-left relative ${isSel ? 'bg-purple-600 text-white border-purple-600 shadow-md' : 'bg-white text-gray-600 border-gray-200 hover:border-purple-300'}`}
                                                    title={op.name}
                                                >
                                                    {isSel && <span className="absolute right-1 top-1 w-2 h-2 bg-green-400 rounded-full"></span>}
                                                    {op.id} - {op.name}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* EXISTING FILTERS */}
                                {editingFilters.map((filter, idx) => (
                                    <div key={filter.id} className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                                        <div className="flex justify-between mb-2">
                                            <span className="text-xs font-bold text-gray-500">Filtro {idx + 1}</span>
                                            <button onClick={() => handleRemoveFilter(editingFilters, setEditingFilters, filter.id)} className="text-red-500 hover:bg-red-50 rounded p-1">🗑️</button>
                                        </div>
                                        <select
                                            className="w-full p-2 border rounded-lg text-sm mb-2"
                                            value={filter.column}
                                            onChange={(e) => handleUpdateFilter(editingFilters, setEditingFilters, filter.id, 'column', e.target.value)}
                                        >
                                            <option value="">Coluna...</option>
                                            {(localColumns || columns || []).filter(c => c && c.name).map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                                        </select>
                                        <div className="flex gap-2">
                                            <select
                                                className="w-1/3 p-2 border rounded-lg text-sm"
                                                value={filter.operator}
                                                onChange={(e) => handleUpdateFilter(editingFilters, setEditingFilters, filter.id, 'operator', e.target.value)}
                                            >
                                                {(() => {
                                                    const colInfo = (localColumns || columns || []).find(c => c.name === filter.column);
                                                    let type = colInfo?.type;
                                                    // Heuristic: CD_/ID_ are codes, treat as text
                                                    if (colInfo?.name && (colInfo.name.startsWith('CD_') || colInfo.name.startsWith('ID_') || colInfo.name.startsWith('NR_'))) {
                                                        type = 'VARCHAR2';
                                                    }
                                                    // Heuristic: If it's in numericColumns (data check) and NOT a code, treat as number
                                                    else if (colInfo && numericColumns.some(nc => nc.name === colInfo.name)) {
                                                        type = 'NUMBER';
                                                    }

                                                    const ops = getOperatorsForType(type);
                                                    return ops.map(op => <option key={op.value} value={op.value}>{op.label}</option>);
                                                })()}
                                            </select>
                                            <input
                                                type="text"
                                                className="flex-1 p-2 border rounded-lg text-sm"
                                                placeholder="Valor..."
                                                value={filter.value}
                                                onChange={(e) => handleUpdateFilter(editingFilters, setEditingFilters, filter.id, 'value', e.target.value)}
                                            />
                                        </div>
                                    </div>
                                ))}
                                <button
                                    onClick={() => handleAddFilter(editingFilters, setEditingFilters)}
                                    className="w-full py-2 border-2 border-dashed border-gray-200 text-gray-500 rounded-xl hover:border-blue-400 hover:text-blue-500 font-bold"
                                >
                                    + Adicionar Filtro
                                </button>

                                {/* GROUP BY SECTION */}
                                <div className="mt-4 p-3 bg-purple-50 border border-purple-100 rounded-xl">
                                    <label className="block text-xs font-bold text-purple-700 mb-2">Agrupar Por (Soma/Contagem Automática)</label>
                                    <select
                                        className="w-full p-2 border border-purple-200 rounded-lg text-sm bg-white"
                                        value={editingGroupBy}
                                        onChange={(e) => setEditingGroupBy(e.target.value)}
                                    >
                                        <option value="">(Sem Agrupamento - Detalhado)</option>
                                        {(localColumns || columns || []).filter(c => c && c.name).map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                                    </select>
                                    <p className="text-[10px] text-gray-500 mt-1">
                                        Ativar o agrupamento transformará o painel em modo <b>Resumo</b>, ideal para grandes volumes de dados.
                                    </p>
                                </div>
                            </div>

                            <div className="mt-4 pt-4 border-t">
                                <button
                                    onClick={saveEditedFilters}
                                    className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700"
                                >
                                    Salvar Alterações
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence >

            {/* OLD NAME MODAL (REMOVED - Kept for reference if something breaks, but logic moved to creation screen) */}


            {/* CHART WIZARD MODAL */}
            <AnimatePresence>
                {wizardOpen && (
                    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                        <motion.div
                            initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 50, opacity: 0 }}
                            className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl h-[80vh] flex flex-col overflow-hidden"
                        >
                            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                                <div>
                                    <h2 className="text-xl font-black text-gray-800">{wizConfig.id ? 'Editar Gráfico' : 'Novo Gráfico'}</h2>
                                    <p className="text-sm text-gray-500">Passo {wizardStep} de 3</p>
                                </div>
                                <button onClick={() => setWizardOpen(false)} className="text-gray-400 hover:text-gray-600 text-2xl font-bold">×</button>
                            </div>

                            <div className="flex-1 overflow-y-auto p-8">
                                {/* STEP 1: TYPE */}
                                {wizardStep === 1 && (
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-in fade-in">
                                        {CHART_TYPES.map(type => (
                                            <div
                                                key={type.id}
                                                onClick={() => { setWizConfig(prev => ({ ...prev, type: type.id })); setWizardStep(2); }}
                                                className={`p-6 rounded-2xl border-2 cursor-pointer transition-all hover:shadow-lg flex flex-col items-center text-center gap-3
                                                    ${wizConfig.type === type.id ? 'border-blue-500 bg-blue-50' : 'border-gray-100 hover:border-blue-300'}
                                                `}
                                            >
                                                <div className={`p-3 rounded-full ${wizConfig.type === type.id ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>
                                                    {type.icon}
                                                </div>
                                                <h3 className="font-bold text-gray-700">{type.label}</h3>
                                                <p className="text-xs text-gray-400">{type.description}</p>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* STEP 2: DATA */}
                                {wizardStep === 2 && (
                                    <div className="max-w-xl mx-auto space-y-6 animate-in slide-in-from-right-4">
                                        <div>
                                            <label className="block text-sm font-bold text-gray-700 mb-2">Título do Gráfico</label>
                                            <input
                                                autoFocus
                                                type="text"
                                                className="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-gray-50 text-gray-900 font-medium"
                                                placeholder="Ex: Vendas por Regional"
                                                value={wizConfig.title}
                                                onChange={(e) => setWizConfig(prev => ({ ...prev, title: e.target.value }))}
                                            />
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-sm font-bold text-gray-700 mb-2">Agregação</label>
                                                <select
                                                    className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50 text-gray-900 outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                                                    value={wizConfig.aggType}
                                                    onChange={e => setWizConfig(prev => ({ ...prev, aggType: e.target.value }))}
                                                >
                                                    <option value="count">Contagem (Registros)</option>
                                                    <option value="sum">Soma (Total)</option>
                                                    <option value="avg">Média</option>
                                                </select>
                                            </div>
                                            {wizConfig.type !== 'kpi' && (
                                                <div>
                                                    <label className="block text-sm font-bold text-gray-700 mb-2">Eixo X / Categoria</label>
                                                    <select
                                                        className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50 text-gray-900 outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                                                        value={wizConfig.xAxis}
                                                        onChange={e => setWizConfig(prev => ({ ...prev, xAxis: e.target.value }))}
                                                    >
                                                        <option value="">Selecione...</option>
                                                        {(localColumns || columns || []).filter(c => c && c.name).map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                                                    </select>
                                                </div>
                                            )}
                                        </div>

                                        {wizConfig.aggType !== 'count' && (
                                            <div>
                                                <label className="block text-sm font-bold text-gray-700 mb-2">Coluna de Valor (Eixo Y)</label>
                                                <select
                                                    className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50 text-gray-900 outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                                                    value={wizConfig.yAxis}
                                                    onChange={e => setWizConfig(prev => ({ ...prev, yAxis: e.target.value }))}
                                                >
                                                    <option value="">Selecione...</option>
                                                    {numericColumns.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                                                </select>
                                            </div>
                                        )}

                                        {/* OPTIONAL EXTRAS */}
                                        <div className="pt-4 border-t border-gray-100">
                                            <div className="col-span-2">
                                                <label className="block text-sm font-bold text-gray-700 mb-2">
                                                    Filtros do Gráfico
                                                    <span className="text-[10px] text-gray-400 font-normal ml-2">(Opcional)</span>
                                                </label>

                                                {/* FILTER BUILDER UI */}
                                                <div className="bg-gray-50 rounded-xl p-3 border border-gray-200 space-y-3">
                                                    {(!wizConfig.uiFilters || wizConfig.uiFilters.length === 0) && (
                                                        <div className="text-center py-4 text-xs text-gray-400 italic">
                                                            Nenhum filtro aplicado a este gráfico.
                                                        </div>
                                                    )}

                                                    {(wizConfig.uiFilters || []).map((filter, idx) => (
                                                        <div key={idx} className="flex items-center gap-2 bg-white p-2 rounded-lg border border-gray-100 shadow-sm animate-in fade-in slide-in-from-left-2">
                                                            <select
                                                                className="flex-1 text-xs border-none bg-transparent font-medium text-gray-700 focus:ring-0"
                                                                value={filter.column}
                                                                onChange={(e) => {
                                                                    const newFilters = [...(wizConfig.uiFilters || [])];
                                                                    newFilters[idx].column = e.target.value;
                                                                    setWizConfig(prev => {
                                                                        const sql = generateSqlFromFilters(newFilters);
                                                                        return { ...prev, uiFilters: newFilters, chartSpecificFilter: sql };
                                                                    });
                                                                }}
                                                            >
                                                                <option value="">Col...</option>
                                                                {(localColumns || []).map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                                                            </select>

                                                            <select
                                                                className="w-[80px] text-xs border-l border-r border-gray-100 bg-transparent text-gray-700 font-bold focus:ring-0 text-center"
                                                                value={filter.operator}
                                                                onChange={(e) => {
                                                                    const newFilters = [...(wizConfig.uiFilters || [])];
                                                                    newFilters[idx].operator = e.target.value;
                                                                    setWizConfig(prev => {
                                                                        const sql = generateSqlFromFilters(newFilters);
                                                                        return { ...prev, uiFilters: newFilters, chartSpecificFilter: sql };
                                                                    });
                                                                }}
                                                            >
                                                                <option value="equals">=</option>
                                                                <option value="not_equals">!=</option>
                                                                <option value="greater_than">&gt;</option>
                                                                <option value="less_than">&lt;</option>
                                                                <option value="contains">LIKE</option>
                                                            </select>

                                                            <input
                                                                type="text"
                                                                className="flex-1 text-xs border-none bg-transparent font-bold text-gray-800 focus:ring-0 placeholder:font-normal"
                                                                placeholder="Valor..."
                                                                value={filter.value}
                                                                onChange={(e) => {
                                                                    const newFilters = [...(wizConfig.uiFilters || [])];
                                                                    newFilters[idx].value = e.target.value;
                                                                    setWizConfig(prev => {
                                                                        const sql = generateSqlFromFilters(newFilters);
                                                                        return { ...prev, uiFilters: newFilters, chartSpecificFilter: sql };
                                                                    });
                                                                }}
                                                            />

                                                            <button
                                                                onClick={() => {
                                                                    const newFilters = wizConfig.uiFilters.filter((_, i) => i !== idx);
                                                                    setWizConfig(prev => {
                                                                        const sql = generateSqlFromFilters(newFilters);
                                                                        return { ...prev, uiFilters: newFilters, chartSpecificFilter: sql };
                                                                    });
                                                                }}
                                                                className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                                                            >
                                                                &times;
                                                            </button>
                                                        </div>
                                                    ))}

                                                    <button
                                                        onClick={() => {
                                                            const newFilters = [...(wizConfig.uiFilters || []), { column: '', operator: 'equals', value: '' }];
                                                            setWizConfig(prev => ({ ...prev, uiFilters: newFilters }));
                                                        }}
                                                        className="w-full py-2 border-2 border-dashed border-gray-200 rounded-lg text-xs font-bold text-gray-400 hover:border-blue-300 hover:text-blue-500 transition-all flex items-center justify-center gap-1"
                                                    >
                                                        <span>+ Adicionar Regra</span>
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* STEP 3: STYLE */}
                                {wizardStep === 3 && (
                                    <div className="max-w-4xl mx-auto space-y-8 animate-in slide-in-from-right-4">

                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                                            {/* Left Column: Controls */}
                                            <div className="space-y-6">
                                                <div>
                                                    <label className="block text-sm font-bold text-gray-700 mb-3">Cor Principal</label>
                                                    <div className="flex flex-wrap gap-3">
                                                        {COLORS.map(c => (
                                                            <div
                                                                key={c}
                                                                onClick={() => setWizConfig(prev => ({ ...prev, color: c }))}
                                                                className={`w-10 h-10 rounded-full cursor-pointer shadow-sm transition-transform hover:scale-110 flex items-center justify-center
                                                                    ${wizConfig.color === c ? 'ring-4 ring-blue-100 scale-110' : ''}
                                                                `}
                                                                style={{ backgroundColor: c }}
                                                            >
                                                                {wizConfig.color === c && <span className="text-white font-bold text-xs">✓</span>}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>

                                                {(wizConfig.type === 'bar' || wizConfig.type === 'stacked_bar') && (
                                                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                                                        <div className="flex justify-between items-center mb-2">
                                                            <label className="block text-sm font-bold text-gray-700">Largura da Barra</label>
                                                            <span className="text-xs font-bold text-blue-600 bg-white px-2 py-1 rounded shadow-sm">{wizConfig.barSize || 40}px</span>
                                                        </div>
                                                        <input
                                                            type="range"
                                                            min="10"
                                                            max="150"
                                                            step="5"
                                                            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                                                            value={wizConfig.barSize || 40}
                                                            onChange={(e) => setWizConfig(prev => ({ ...prev, barSize: Number(e.target.value) }))}
                                                        />
                                                    </div>
                                                )}
                                            </div>

                                            {/* Right Column: Live Preview */}
                                            <div className="md:col-span-2">
                                                <label className="block text-sm font-bold text-gray-700 mb-3">Pré-visualização</label>
                                                <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 h-[340px] flex flex-col relative overflow-hidden">
                                                    <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-bl from-gray-50 to-transparent -mr-8 -mt-8 rounded-bl-full z-0"></div>
                                                    <div className="relative z-10 h-full">
                                                        {renderChartNode({
                                                            ...wizConfig,
                                                            id: 'preview',
                                                            title: wizConfig.title || 'Pré-visualização' // Ensure title is shown
                                                        })}
                                                    </div>
                                                </div>
                                                <p className="text-center text-xs text-gray-400 mt-2">Esta é uma simulação visual com os dados atuais.</p>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-between">
                                {wizardStep > 1 ? (
                                    <button onClick={() => setWizardStep(wizardStep - 1)} className="px-6 py-3 text-gray-600 font-bold hover:bg-gray-200 rounded-xl">Voltar</button>
                                ) : (
                                    <div></div>
                                )}

                                {wizardStep < 3 ? (
                                    <button onClick={() => setWizardStep(wizardStep + 1)} className="px-8 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-200">
                                        Próximo →
                                    </button>
                                ) : (
                                    <button onClick={handleWizardFinish} className="px-8 py-3 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 shadow-lg shadow-green-200">
                                        Concluir
                                    </button>
                                )}
                            </div>
                        </motion.div>
                    </div>
                )
                }
            </AnimatePresence >

            {/* EXPORT MODAL */}
            <AnimatePresence>
                {exportModalOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[12000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
                        onClick={() => setExportModalOpen(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, y: 10 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.95, y: 10 }}
                            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="p-6 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                                <div>
                                    <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                                        <span className="text-2xl">{exportType === 'xlsx' ? '📊' : '📄'}</span>
                                        Exportar para {exportType === 'xlsx' ? 'Excel' : 'CSV'}
                                    </h3>
                                    <p className="text-sm text-gray-500 mt-1">Como você deseja baixar seus dados?</p>
                                </div>
                                <button onClick={() => setExportModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                </button>
                            </div>

                            {/* Success Screen */}
                            {exportSuccess ? (
                                <div className="p-8 flex flex-col items-center justify-center text-center animate-in zoom-in-50 duration-300">
                                    <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-4xl mb-4 shadow-sm">
                                        ✅
                                    </div>
                                    <h3 className="text-2xl font-bold text-gray-800 mb-2">Exportação Concluída!</h3>
                                    <p className="text-gray-500 mb-6 max-w-xs mx-auto">
                                        O arquivo foi gerado e salvo com sucesso no local selecionado.
                                    </p>
                                    <button
                                        onClick={() => { setExportModalOpen(false); setExportSuccess(false); }}
                                        className="px-8 py-3 bg-gray-900 text-white rounded-xl font-bold hover:bg-black transition-all shadow-lg"
                                    >
                                        Fechar
                                    </button>
                                </div>
                            ) : (
                                <>
                                    {/* Normal Modal Content */}
                                    {/* Normal Modal Content */}
                                    {/* Render Custom Column Selection if phase is selection */}
                                    {exportPhase === 'selection' && (
                                        <div className="fixed inset-0 bg-white z-10 flex flex-col animate-in slide-in-from-right duration-300">
                                            {/* Header */}
                                            <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-white">
                                                <div className="flex items-center gap-3">
                                                    <button onClick={() => setExportPhase('choice')} className="p-2 -ml-2 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-800 transition-all">
                                                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
                                                    </button>
                                                    <h3 className="font-bold text-gray-800 text-lg">Configurar Exportação</h3>
                                                </div>
                                                <div className="flex bg-gray-100 p-1 rounded-lg">
                                                    <button
                                                        onClick={() => setExportTab('columns')}
                                                        className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${exportTab === 'columns' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                                    >
                                                        Colunas
                                                    </button>
                                                    <button
                                                        onClick={() => setExportTab('presets')}
                                                        className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${exportTab === 'presets' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                                    >
                                                        Meus Modelos
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Generating Overlay */}
                                            {isExporting && (
                                                <div className="absolute inset-0 z-50 bg-white/90 backdrop-blur-sm flex flex-col items-center justify-center">
                                                    <div className="w-16 h-16 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin mb-4"></div>
                                                    <h3 className="text-xl font-bold text-blue-900 animate-pulse">Gerando Arquivo...</h3>
                                                    <p className="text-blue-500 text-sm mt-2">Isso pode levar alguns segundos.</p>
                                                </div>
                                            )}

                                            {/* TAB: COLUMNS */}
                                            {exportTab === 'columns' && (
                                                <div className="flex-1 flex flex-col overflow-hidden bg-gray-50/50">
                                                    {/* Toolbar */}
                                                    <div className="px-4 py-3 bg-white border-b border-gray-100 flex gap-2">
                                                        <div className="relative flex-1">
                                                            <SearchIcon className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                                                            <input
                                                                type="text"
                                                                placeholder="Filtrar colunas..."
                                                                className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                                                value={exportSearchTerm}
                                                                onChange={(e) => setExportSearchTerm(e.target.value)}
                                                            />
                                                        </div>
                                                        <button
                                                            onClick={toggleSelectAll}
                                                            className="px-3 py-2 text-sm font-medium text-gray-600 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-all whitespace-nowrap"
                                                        >
                                                            {exportColumns.every(c => c.isSelected) ? 'Desmarcar Todos' : 'Marcar Todos'}
                                                        </button>
                                                    </div>

                                                    {/* Save Preset Inline */}
                                                    <div className="px-4 py-2 bg-blue-50 border-b border-blue-100 flex items-center justify-between text-sm">
                                                        <span className="text-blue-800 font-medium">Salvar seleção atual como modelo?</span>
                                                        <div className="flex gap-2">
                                                            <input
                                                                type="text"
                                                                placeholder="Nome do modelo..."
                                                                className="px-3 py-1 text-xs border border-blue-200 rounded focus:outline-none focus:border-blue-400"
                                                                value={presetName}
                                                                onChange={(e) => setPresetName(e.target.value)}
                                                            />
                                                            <button onClick={handleSavePreset} className="text-blue-600 hover:text-blue-800 font-bold px-2">
                                                                <Save className="w-4 h-4" />
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {/* Columns List */}
                                                    <div className="flex-1 p-2 custom-scroll overflow-hidden">
                                                        {(() => {
                                                            const filteredCols = exportColumns.filter(col => col.label.toLowerCase().includes(exportSearchTerm.toLowerCase()));

                                                            return (
                                                                <List
                                                                    height={exportSearchTerm ? 400 : 380}
                                                                    itemCount={filteredCols.length}
                                                                    itemSize={60} // Taller rows
                                                                    width="100%"
                                                                    itemData={{
                                                                        filteredCols,
                                                                        exportColumns,
                                                                        handleDragStart,
                                                                        handleDragOver,
                                                                        handleDrop,
                                                                        toggleColumnExport,
                                                                        exportSearchTerm
                                                                    }}
                                                                >
                                                                    {ColumnRow}
                                                                </List>
                                                            );
                                                        })()}
                                                    </div>
                                                </div>
                                            )}

                                            {/* TAB: PRESETS */}
                                            {exportTab === 'presets' && (
                                                <div className="flex-1 flex flex-col overflow-y-auto p-4 bg-gray-50">
                                                    {/* Saved Models */}
                                                    <div className="mb-6">
                                                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 pl-1">Modelos Salvos</h4>
                                                        {presets.saved.length === 0 ? (
                                                            <div className="text-center py-8 bg-white rounded-xl border border-dashed border-gray-300 text-gray-400 text-sm">
                                                                Nenhum modelo salvo.
                                                            </div>
                                                        ) : (
                                                            <div className="space-y-2">
                                                                {presets.saved.map((p, idx) => (
                                                                    <div key={idx} className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-all group">
                                                                        <div className="flex justify-between items-start mb-2">
                                                                            <div className="flex items-center gap-2">
                                                                                <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                                                                                <span className="font-bold text-gray-800">{p.name}</span>
                                                                            </div>
                                                                            <button onClick={(e) => { e.stopPropagation(); handleDeletePreset(p.name, 'saved'); }} className="text-gray-300 hover:text-red-500 px-2">
                                                                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                                                            </button>
                                                                        </div>
                                                                        <div className="flex flex-wrap gap-1 mb-3">
                                                                            {p.columns.slice(0, 5).map(c => (
                                                                                <span key={c} className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">
                                                                                    {c}
                                                                                </span>
                                                                            ))}
                                                                            {p.columns.length > 5 && <span className="text-[10px] text-gray-400">+{p.columns.length - 5}</span>}
                                                                        </div>
                                                                        <button
                                                                            onClick={() => applyPreset(p.columns)}
                                                                            className="w-full py-2 text-sm font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                                                                        >
                                                                            Usar Modelo
                                                                        </button>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Recent History */}
                                                    <div>
                                                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 pl-1">Recentes</h4>
                                                        <div className="space-y-2">
                                                            {presets.history.map((h, idx) => (
                                                                <div key={idx} onClick={() => applyPreset(h.columns)} className="flex items-center justify-between p-3 bg-white border border-gray-100 rounded-lg hover:border-blue-200 cursor-pointer group transition-all">
                                                                    <div className="flex items-center gap-3">
                                                                        <Clock className="w-4 h-4 text-gray-400 group-hover:text-blue-500" />
                                                                        <div className="flex flex-col">
                                                                            <span className="text-sm font-medium text-gray-700 group-hover:text-blue-700">{h.name || 'Exportação'}</span>
                                                                            <span className="text-[10px] text-gray-400">{new Date(h.date).toLocaleDateString()} • {h.columns.length} colunas</span>
                                                                        </div>
                                                                    </div>
                                                                    <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                                                                        <span className="text-xs font-bold text-blue-600">Carregar</span>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            <div className="p-4 border-t border-gray-100 flex justify-end bg-white z-20 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
                                                <button
                                                    onClick={() => executeDrillDownExport(exportType, exportColumns)}
                                                    disabled={isExporting}
                                                    className="w-full py-4 bg-gray-900 text-white rounded-xl font-bold text-lg shadow-xl hover:bg-black hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                                                >
                                                    {isExporting ? 'Processando...' : 'Baixar Arquivo'}
                                                    {!isExporting && <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>}
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {/* Default Choice Screen (Complete vs Custom) - Only show if NO success and NO selection phase */}
                                    {exportPhase === 'choice' && !exportSuccess && (
                                        <div className="p-6 space-y-4">
                                            {/* Option 1: Complete */}
                                            <button
                                                onClick={() => executeDrillDownExport(exportType)}
                                                disabled={isExporting}
                                                className="w-full flex items-center p-4 border-2 border-transparent bg-blue-50 hover:border-blue-500 hover:bg-blue-100 rounded-xl transition-all group text-left relative overflow-hidden"
                                            >
                                                {isExporting && <div className="absolute inset-0 bg-white/50 backdrop-blur-sm z-10 flex items-center justify-center"><div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div></div>}
                                                <div className="w-12 h-12 bg-blue-200 text-blue-700 rounded-full flex items-center justify-center text-xl mr-4 group-hover:scale-110 transition-transform">
                                                    🚀
                                                </div>
                                                <div>
                                                    <h4 className="font-bold text-blue-900">Exportação Completa</h4>
                                                    <p className="text-xs text-blue-700 mt-1">Baixar todas as colunas visíveis instantaneamente.</p>
                                                </div>
                                            </button>

                                            {/* Option 2: Custom */}
                                            <motion.button
                                                whileTap={{ scale: 0.98 }}
                                                onClick={() => setExportPhase('selection')}
                                                className="w-full flex items-center p-4 border-2 border-gray-100 hover:border-gray-300 hover:bg-gray-50 rounded-xl transition-all group text-left"
                                            >
                                                <div className="w-12 h-12 bg-gray-100 text-gray-500 rounded-full flex items-center justify-center text-xl mr-4 group-hover:scale-110 transition-transform">
                                                    ⚙️
                                                </div>
                                                <div>
                                                    <h4 className="font-bold text-gray-700">Personalizar Colunas</h4>
                                                    <p className="text-xs text-gray-500 mt-1">Escolher exatamente quais campos incluir no arquivo.</p>
                                                </div>
                                            </motion.button>
                                        </div>
                                    )}
                                </>
                            )}

                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Delete Confirmation Modal */}
            < AnimatePresence >
                {deleteConfirm && (
                    <div className="fixed inset-0 z-[11000] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="bg-white rounded-2xl p-8 max-w-sm w-full shadow-2xl flex flex-col items-center text-center"
                        >
                            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-4">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                            </div>
                            <h3 className="text-xl font-bold text-gray-800 mb-2">Excluir Painel?</h3>
                            <p className="text-gray-500 mb-8">Esta ação não pode ser desfeita. Deseja continuar?</p>
                            <div className="flex gap-3 w-full">
                                <button
                                    onClick={() => setDeleteConfirm(null)}
                                    className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={executeDelete}
                                    className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl shadow-lg shadow-red-200 transition-colors"
                                >
                                    Excluir
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence >
        </div >
    );
}

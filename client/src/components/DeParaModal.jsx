import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    X, Plus, Trash2, ArrowRight, Save, FileText,
    Check, AlertCircle, ChevronDown, List as ListIcon,
    Filter, MoreHorizontal, Binary, FileSpreadsheet
} from 'lucide-react';
import * as XLSX from 'xlsx';

const OPERATORS = [
    { id: 'equals', label: 'Igual a (=)', type: 'any' },
    { id: 'contains', label: 'Contém (Text)', type: 'text' },
    { id: 'starts_with', label: 'Começa com', type: 'text' },
    { id: 'ends_with', label: 'Termina com', type: 'text' },
    { id: 'greater_than', label: 'Maior que (>)', type: 'number' },
    { id: 'less_than', label: 'Menor que (<)', type: 'number' },
    { id: 'between', label: 'Entre (Range)', type: 'number' },
    { id: 'in_list', label: 'Está na Lista', type: 'any' }
];

const DeParaModal = ({ isOpen, onClose, data, sourceColIdx, sourceColName, onApply }) => {
    const [mode, setMode] = useState('manual'); // manual | import
    const [targetColName, setTargetColName] = useState('');
    const [rules, setRules] = useState([]);

    // --- Stats & Helpers ---
    const uniqueValues = useMemo(() => {
        if (!data || sourceColIdx === null) return [];
        const values = new Set();
        data.rows.forEach(row => {
            if (row[sourceColIdx] !== undefined) values.add(String(row[sourceColIdx]));
        });
        return Array.from(values).sort().slice(0, 500); // Limit for performance in dropdowns
    }, [data, sourceColIdx]);

    // --- Rule Management ---
    const addRule = () => {
        setRules([
            ...rules,
            {
                id: Date.now(),
                resultValue: '',
                conditions: [{ id: Date.now() + 1, operator: 'equals', value: '', valueEnd: '' }]
            }
        ]);
    };

    const removeRule = (id) => setRules(rules.filter(r => r.id !== id));

    const updateRuleResult = (id, val) => {
        setRules(rules.map(r => r.id === id ? { ...r, resultValue: val } : r));
    };

    const addCondition = (ruleId) => {
        setRules(rules.map(r => {
            if (r.id === ruleId) {
                return {
                    ...r,
                    conditions: [...r.conditions, { id: Date.now(), operator: 'equals', value: '' }]
                };
            }
            return r;
        }));
    };

    const updateCondition = (ruleId, condId, field, val) => {
        setRules(rules.map(r => {
            if (r.id === ruleId) {
                return {
                    ...r,
                    conditions: r.conditions.map(c => c.id === condId ? { ...c, [field]: val } : c)
                };
            }
            return r;
        }));
    };

    const removeCondition = (ruleId, condId) => {
        setRules(rules.map(r => {
            if (r.id === ruleId) {
                const newConds = r.conditions.filter(c => c.id !== condId);
                return { ...r, conditions: newConds.length ? newConds : r.conditions }; // Prevent empty conditions
            }
            return r;
        }));
    };

    // --- Import / Join Logic ---
    const [lookupData, setLookupData] = useState(null); // { rows: [], columns: [] }
    const [joinParams, setJoinParams] = useState({
        conditions: [{ sourceCol: sourceColName, lookupCol: '' }],
        targetLookupCol: ''
    });

    const handleLookupFile = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const workbook = XLSX.read(evt.target.result, { type: 'binary' });
                const sheetName = workbook.SheetNames[0];
                const sheet = workbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

                if (!jsonData || jsonData.length < 2) return alert("Arquivo inválido ou vazio.");

                const headers = jsonData[0].map(h => String(h || ''));
                const rows = jsonData.slice(1);

                setLookupData({ columns: headers, rows });
                // Reset params
                setJoinParams({
                    conditions: [{ sourceCol: sourceColName, lookupCol: headers[0] || '' }],
                    targetLookupCol: headers[1] || headers[0] || ''
                });

            } catch (err) {
                console.error(err);
                alert("Erro ao ler arquivo: " + err.message);
            }
        };
        reader.readAsBinaryString(file);
    };

    const addJoinCondition = () => {
        setJoinParams(prev => ({
            ...prev,
            conditions: [...prev.conditions, { sourceCol: '', lookupCol: '' }]
        }));
    };

    const removeJoinCondition = (idx) => {
        setJoinParams(prev => ({
            ...prev,
            conditions: prev.conditions.filter((_, i) => i !== idx)
        }));
    };

    const updateJoinCondition = (idx, field, val) => {
        setJoinParams(prev => ({
            ...prev,
            conditions: prev.conditions.map((c, i) => i === idx ? { ...c, [field]: val } : c)
        }));
    };

    // --- Unified Preview Logic ---
    const previewData = useMemo(() => {
        if (!data || !data.rows) return [];

        // MODE: IMPORT (Table Join)
        if (mode === 'import' && lookupData && joinParams.targetLookupCol) {
            // Build Lookup Index for O(1) access
            // Index Key: "Val1|Val2|Val3" (Composite)
            const lookupMap = new Map();
            const lookupColIndices = joinParams.conditions.map(c => lookupData.columns.indexOf(c.lookupCol));
            const targetColIdx = lookupData.columns.indexOf(joinParams.targetLookupCol);

            if (lookupColIndices.some(i => i === -1) || targetColIdx === -1) return [];

            lookupData.rows.forEach(row => {
                const key = lookupColIndices.map(i => String(row[i]).trim().toLowerCase()).join('|||');
                // Store first match? Or duplicate check? First match is standard for VLOOKUP style.
                if (!lookupMap.has(key)) {
                    lookupMap.set(key, row[targetColIdx]);
                }
            });

            const sourceColIndices = joinParams.conditions.map(c => data.columns.indexOf(c.sourceCol));

            return data.rows.slice(0, 10).map(row => {
                const key = sourceColIndices.map(i => String(row[i] || '').trim().toLowerCase()).join('|||');
                const match = lookupMap.get(key);
                // Friendly display
                const sourceDisplay = sourceColIndices.map(i => row[i]).join(', ');
                return { source: sourceDisplay, result: match !== undefined ? match : '(sem correspondência)' };
            });
        }

        // MODE: MANUAL (Rule Engine)
        return data.rows.slice(0, 10).map(row => {
            const sourceVal = String(row[sourceColIdx] || '');
            let result = null;

            for (const rule of rules) {
                const isMatch = rule.conditions.some(cond => {
                    const op = cond.operator;
                    const v1 = String(cond.value).toLowerCase();
                    const v2 = String(cond.valueEnd).toLowerCase(); // For between
                    const val = sourceVal.toLowerCase();

                    switch (op) {
                        case 'equals': return val === v1;
                        case 'contains': return val.includes(v1);
                        case 'starts_with': return val.startsWith(v1);
                        case 'ends_with': return val.endsWith(v1);
                        case 'greater_than': return parseFloat(val) > parseFloat(v1);
                        case 'less_than': return parseFloat(val) < parseFloat(v1);
                        case 'between': return parseFloat(val) >= parseFloat(v1) && parseFloat(val) <= parseFloat(v2);
                        case 'in_list': return v1.split(',').map(s => s.trim()).includes(val);
                        default: return false;
                    }
                });

                if (isMatch) {
                    result = rule.resultValue;
                    break;
                }
            }
            return { source: sourceVal, result: result !== null ? result : '(vazio)' };
        });
    }, [data, sourceColIdx, rules, mode, lookupData, joinParams]);


    // --- Apply Handler (Unified) ---
    const handleApply = () => {
        if (!targetColName.trim()) return alert("Digite o nome da nova coluna.");
        let newRows = [];

        if (mode === 'import') {
            if (!lookupData || !joinParams.targetLookupCol) return alert("Configure a importação corretamente.");

            // 1. Build Index
            const lookupMap = new Map();
            const lookupColIndices = joinParams.conditions.map(c => lookupData.columns.indexOf(c.lookupCol));
            const targetColIdx = lookupData.columns.indexOf(joinParams.targetLookupCol);

            if (lookupColIndices.some(i => i === -1) || targetColIdx === -1) return alert("Colunas de junção inválidas.");

            lookupData.rows.forEach(row => {
                const key = lookupColIndices.map(i => String(row[i]).trim().toLowerCase()).join('|||');
                if (!lookupMap.has(key)) lookupMap.set(key, row[targetColIdx]);
            });

            // 2. Map Rows
            const sourceColIndices = joinParams.conditions.map(c => data.columns.indexOf(c.sourceCol));
            newRows = data.rows.map(row => {
                const key = sourceColIndices.map(i => String(row[i] || '').trim().toLowerCase()).join('|||');
                const match = lookupMap.get(key);
                return [...row, match !== undefined ? match : ''];
            });

        } else {
            // Manual Logic
            newRows = data.rows.map(row => {
                const sourceVal = String(row[sourceColIdx] || '');
                let result = '';

                for (const rule of rules) {
                    const isMatch = rule.conditions.some(cond => {
                        const op = cond.operator;
                        const v1 = String(cond.value).toLowerCase();
                        const v2 = String(cond.valueEnd).toLowerCase();
                        const val = sourceVal.toLowerCase();

                        switch (op) {
                            case 'equals': return val === v1;
                            case 'contains': return val.includes(v1);
                            case 'starts_with': return val.startsWith(v1);
                            case 'ends_with': return val.endsWith(v1);
                            case 'greater_than': return parseFloat(val) > parseFloat(v1);
                            case 'less_than': return parseFloat(val) < parseFloat(v1);
                            case 'between': return parseFloat(val) >= parseFloat(v1) && parseFloat(val) <= parseFloat(v2);
                            case 'in_list': return v1.split(',').map(s => s.trim()).includes(val);
                            default: return false;
                        }
                    });

                    if (isMatch) {
                        result = rule.resultValue;
                        break;
                    }
                }
                return [...row, result];
            });
        }

        const newColumns = [...data.columns, targetColName];
        onApply({ rows: newRows, columns: newColumns });
        onClose();
    };


    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white w-full max-w-4xl h-[85vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden"
            >
                {/* Header */}
                <div className="h-16 border-b border-slate-200 flex items-center justify-between px-6 bg-slate-50">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-purple-100 text-purple-600 rounded-lg">
                            <Binary size={20} />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-slate-800">Mapeamento Avançado (De/Para)</h2>
                            <p className="text-xs text-slate-500">Origem: <span className="font-mono bg-slate-200 px-1 rounded">{sourceColName}</span></p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-2 hover:bg-slate-100 rounded-full transition-colors"><X size={20} /></button>
                </div>

                {/* Toolbar */}
                <div className="p-4 border-b border-slate-200 bg-white flex gap-4 items-end">
                    <div className="flex-1 max-w-xs">
                        <label className="text-xs font-bold text-slate-500 uppercase">Nome da Nova Coluna</label>
                        <input
                            value={targetColName}
                            onChange={e => setTargetColName(e.target.value)}
                            className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg focus:border-purple-500 outline-none font-bold text-slate-700"
                            placeholder="Ex: CODIGO_FINAL"
                        />
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setMode('manual')}
                            className={`px-4 py-2 rounded-lg text-sm font-bold border ${mode === 'manual' ? 'bg-purple-50 border-purple-200 text-purple-700' : 'border-transparent text-slate-500 hover:bg-slate-50'}`}
                        >
                            Regras Manuais
                        </button>
                        <button
                            onClick={() => setMode('import')}
                            className={`px-4 py-2 rounded-lg text-sm font-bold border ${mode === 'import' ? 'bg-purple-50 border-purple-200 text-purple-700' : 'border-transparent text-slate-500 hover:bg-slate-50'}`}
                        >
                            Importar CSV
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-hidden flex bg-slate-50">
                    {/* Left: Rules Builder */}
                    <div className="flex-1 overflow-y-auto p-6 space-y-4">
                        {mode === 'manual' ? (
                            <>
                                {rules.length === 0 && (
                                    <div className="text-center py-10 text-slate-400">
                                        <Filter size={48} className="mx-auto mb-4 opacity-20" />
                                        <p>Nenhuma regra definida.</p>
                                        <button onClick={addRule} className="mt-4 text-purple-600 font-bold hover:underline">Adicionar Regra</button>
                                    </div>
                                )}

                                {rules.map((rule, idx) => (
                                    <div key={rule.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                                        <div className="bg-slate-50/50 px-4 py-2 border-b border-slate-100 flex items-center justify-between">
                                            <span className="text-xs font-bold text-slate-500 uppercase">Regra #{idx + 1}</span>
                                            <button onClick={() => removeRule(rule.id)} className="text-slate-400 hover:text-red-500"><Trash2 size={14} /></button>
                                        </div>

                                        <div className="p-4 flex gap-4 items-start">
                                            {/* Conditions Group (OR logic) */}
                                            <div className="flex-1 space-y-2">
                                                {rule.conditions.map((cond, cIdx) => (
                                                    <div key={cond.id} className="flex items-center gap-2">
                                                        {cIdx > 0 && <span className="text-[10px] font-bold text-slate-400">OU</span>}

                                                        {/* Operator */}
                                                        <div className="relative w-32">
                                                            <select
                                                                value={cond.operator}
                                                                onChange={e => updateCondition(rule.id, cond.id, 'operator', e.target.value)}
                                                                className="w-full text-xs border border-slate-200 rounded-lg px-2 py-2 appearance-none bg-slate-50 outline-none focus:border-purple-400"
                                                            >
                                                                {OPERATORS.map(op => <option key={op.id} value={op.id}>{op.label}</option>)}
                                                            </select>
                                                            <ChevronDown size={12} className="absolute right-2 top-3 text-slate-400" />
                                                        </div>

                                                        {/* Value Input */}
                                                        <div className="flex-1 relative">
                                                            {cond.operator === 'between' ? (
                                                                <div className="flex gap-2">
                                                                    <input
                                                                        value={cond.value}
                                                                        onChange={e => updateCondition(rule.id, cond.id, 'value', e.target.value)}
                                                                        className="w-full text-xs border border-slate-200 rounded-lg px-2 py-2 outline-none focus:border-purple-400"
                                                                        placeholder="Min"
                                                                    />
                                                                    <input
                                                                        value={cond.valueEnd}
                                                                        onChange={e => updateCondition(rule.id, cond.id, 'valueEnd', e.target.value)}
                                                                        className="w-full text-xs border border-slate-200 rounded-lg px-2 py-2 outline-none focus:border-purple-400"
                                                                        placeholder="Max"
                                                                    />
                                                                </div>
                                                            ) : (
                                                                <>
                                                                    <input
                                                                        value={cond.value}
                                                                        onChange={e => updateCondition(rule.id, cond.id, 'value', e.target.value)}
                                                                        list={`suggestions-${rule.id}`}
                                                                        className="w-full text-xs border border-slate-200 rounded-lg px-2 py-2 outline-none focus:border-purple-400"
                                                                        placeholder="Valor na origem..."
                                                                    />
                                                                    <datalist id={`suggestions-${rule.id}`}>
                                                                        {uniqueValues.map(v => <option key={v} value={v} />)}
                                                                    </datalist>
                                                                </>
                                                            )}
                                                        </div>

                                                        {rule.conditions.length > 1 && (
                                                            <button onClick={() => removeCondition(rule.id, cond.id)} className="p-1 hover:bg-red-50 text-slate-300 hover:text-red-500 rounded"><X size={12} /></button>
                                                        )}
                                                    </div>
                                                ))}
                                                <button onClick={() => addCondition(rule.id)} className="text-[10px] font-bold text-purple-600 hover:bg-purple-50 px-2 py-1 rounded inline-flex items-center gap-1">
                                                    <Plus size={10} /> Adicionar Condição
                                                </button>
                                            </div>

                                            {/* Result Arrow */}
                                            <div className="pt-2 text-slate-300">
                                                <ArrowRight size={20} />
                                            </div>

                                            {/* Result Input */}
                                            <div className="w-48">
                                                <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Resultado (Para)</label>
                                                <input
                                                    value={rule.resultValue}
                                                    onChange={e => updateRuleResult(rule.id, e.target.value)}
                                                    className="w-full bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-400"
                                                    placeholder="Valor Final"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                ))}

                                <button
                                    onClick={addRule}
                                    className="w-full py-3 border-2 border-dashed border-slate-300 rounded-xl text-slate-500 font-bold hover:border-purple-400 hover:text-purple-600 hover:bg-purple-50 transition-all flex items-center justify-center gap-2"
                                >
                                    <Plus size={20} />
                                    Adicionar Nova Regra
                                </button>
                            </>
                        ) : (
                            <div className="space-y-6">
                                {/* File Upload Section */}
                                {!lookupData ? (
                                    <div className="flex flex-col items-center justify-center py-10 border-2 border-dashed border-slate-300 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer relative">
                                        <input
                                            type="file"
                                            accept=".xlsx, .csv"
                                            onChange={handleLookupFile}
                                            className="absolute inset-0 opacity-0 cursor-pointer"
                                        />
                                        <FileSpreadsheet size={48} className="mb-4 text-emerald-500" />
                                        <p className="font-bold text-slate-600">Clique para carregar planilha de De/Para</p>
                                        <p className="text-xs text-slate-400 mt-2">Suporta .xlsx e .csv</p>
                                    </div>
                                ) : (
                                    <div className="space-y-6">
                                        {/* File Info */}
                                        <div className="flex items-center justify-between px-4 py-3 bg-emerald-50 border border-emerald-100 rounded-xl">
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 bg-emerald-100 rounded-lg text-emerald-600"><FileSpreadsheet size={16} /></div>
                                                <div>
                                                    <p className="text-sm font-bold text-emerald-900">Arquivo de Referência Carregado</p>
                                                    <p className="text-xs text-emerald-600">{lookupData.rows.length} linhas, {lookupData.columns.length} colunas</p>
                                                </div>
                                            </div>
                                            <button onClick={() => setLookupData(null)} className="text-xs font-bold text-emerald-700 hover:underline">Alterar Arquivo</button>
                                        </div>

                                        {/* Join Config */}
                                        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                                            <div className="mb-4 border-b border-slate-100 pb-2">
                                                <h3 className="font-bold text-slate-700 text-sm flex items-center gap-2">
                                                    <Binary size={16} className="text-purple-500" />
                                                    Configuração de Cruzamento (Join)
                                                </h3>
                                                <p className="text-xs text-slate-400 mt-1">Defina quais colunas devem ser iguais para encontrar o valor.</p>
                                            </div>

                                            <div className="space-y-3">
                                                {joinParams.conditions.map((cond, idx) => (
                                                    <div key={idx} className="flex gap-2 items-center">
                                                        <div className="flex-1">
                                                            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Coluna na Origem (Dados)</label>
                                                            <div className="relative">
                                                                <select
                                                                    value={cond.sourceCol}
                                                                    onChange={e => updateJoinCondition(idx, 'sourceCol', e.target.value)}
                                                                    className="w-full text-xs font-semibold text-slate-700 border border-slate-200 rounded-lg px-2 py-2 appearance-none bg-slate-50 outline-none focus:border-purple-400"
                                                                >
                                                                    <option value="">Selecione...</option>
                                                                    {data.columns.map(c => <option key={c} value={c}>{c}</option>)}
                                                                </select>
                                                                <ChevronDown size={12} className="absolute right-2 top-3 text-slate-400 pointer-events-none" />
                                                            </div>
                                                        </div>

                                                        <div className="pt-5 text-slate-300">
                                                            <ArrowRight size={16} />
                                                        </div>

                                                        <div className="flex-1">
                                                            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Coluna na Tabela Externa (De/Para)</label>
                                                            <div className="relative">
                                                                <select
                                                                    value={cond.lookupCol}
                                                                    onChange={e => updateJoinCondition(idx, 'lookupCol', e.target.value)}
                                                                    className="w-full text-xs font-semibold text-slate-700 border border-slate-200 rounded-lg px-2 py-2 appearance-none bg-emerald-50 outline-none focus:border-emerald-400"
                                                                >
                                                                    <option value="">Selecione...</option>
                                                                    {lookupData.columns.map(c => <option key={c} value={c}>{c}</option>)}
                                                                </select>
                                                                <ChevronDown size={12} className="absolute right-2 top-3 text-slate-400 pointer-events-none" />
                                                            </div>
                                                        </div>

                                                        {joinParams.conditions.length > 1 && (
                                                            <button
                                                                onClick={() => removeJoinCondition(idx)}
                                                                className="mt-5 p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                                            >
                                                                <Trash2 size={16} />
                                                            </button>
                                                        )}
                                                    </div>
                                                ))}

                                                <button
                                                    onClick={addJoinCondition}
                                                    className="text-xs font-bold text-purple-600 hover:bg-purple-50 px-3 py-2 rounded-lg inline-flex items-center gap-1 transition-colors"
                                                >
                                                    <Plus size={14} /> Adicionar Critério de Junção
                                                </button>
                                            </div>
                                        </div>

                                        {/* Target Selection */}
                                        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                                            <div className="mb-2">
                                                <h3 className="font-bold text-slate-700 text-sm">Coluna de Retorno (Valor Final)</h3>
                                                <p className="text-xs text-slate-400 mt-1">Qual coluna da tabela externa contém o valor que você deseja trazer?</p>
                                            </div>
                                            <div className="relative">
                                                <select
                                                    value={joinParams.targetLookupCol}
                                                    onChange={e => setJoinParams(p => ({ ...p, targetLookupCol: e.target.value }))}
                                                    className="w-full text-sm font-bold text-emerald-800 border-2 border-emerald-100 rounded-xl px-3 py-3 appearance-none bg-emerald-50 outline-none focus:border-emerald-500 transition-all"
                                                >
                                                    <option value="">Selecione a coluna de retorno...</option>
                                                    {lookupData.columns.map(c => <option key={c} value={c}>{c}</option>)}
                                                </select>
                                                <ChevronDown size={16} className="absolute right-4 top-4 text-emerald-600 pointer-events-none" />
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Right: Live Preview */}
                    <div className="w-80 bg-white border-l border-slate-200 flex flex-col">
                        <div className="p-4 border-b border-slate-100 bg-slate-50">
                            <h3 className="font-bold text-slate-700 text-sm">Visualização (Preview)</h3>
                            <p className="text-xs text-slate-400">Exibindo 10 primeiras linhas</p>
                        </div>
                        <div className="flex-1 overflow-auto">
                            <table className="w-full text-xs">
                                <thead className="bg-slate-50 text-slate-500 font-semibold sticky top-0">
                                    <tr>
                                        <th className="px-3 py-2 text-left border-b">Origem</th>
                                        <th className="px-3 py-2 text-left border-b">Destino</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {previewData.map((row, i) => (
                                        <tr key={i} className="hover:bg-slate-50">
                                            <td className="px-3 py-2 text-slate-600 truncate max-w-[120px]" title={row.source}>{row.source}</td>
                                            <td className={`px-3 py-2 font-medium ${row.result === '(vazio)' ? 'text-slate-300 italic' : 'text-emerald-600'}`}>
                                                {row.result}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-slate-200 bg-white flex justify-end gap-3">
                    <button onClick={onClose} className="px-6 py-2 text-slate-500 font-bold hover:bg-slate-100 rounded-xl transition-colors">Cancelar</button>
                    <button
                        onClick={handleApply}
                        className="px-6 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-bold rounded-xl shadow-lg hover:shadow-xl hover:scale-105 transition-all flex items-center gap-2"
                    >
                        <Check size={18} />
                        Aplicar Transformação
                    </button>
                </div>
            </motion.div>

            {/* Import Icons needed */}
            <div className="hidden">
                <Binary />
            </div>
        </div>
    );
};

export default DeParaModal;

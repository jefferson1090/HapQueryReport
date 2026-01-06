import React, { useState, useRef, useMemo } from 'react';
import {
    FileSpreadsheet, Upload, Save, Database, ArrowRightLeft,
    Wand2, Trash2, Download, Search, X, ChevronRight, ChevronDown,
    Type, Eraser, Binary, FileText, FolderOpen, MoreHorizontal
} from 'lucide-react';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import * as XLSX from 'xlsx';
import { FixedSizeList as List } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';
import DeParaModal from './DeParaModal';

const DataProcessor = ({ isVisible, connection }) => {
    // --- State ---
    const [file, setFile] = useState(null);
    const [data, setData] = useState({ rows: [], columns: [] });
    const [selectedColumns, setSelectedColumns] = useState({});
    const [activeTransform, setActiveTransform] = useState(null); // 'upper', 'replace', 'remove', 'depara'
    const [loading, setLoading] = useState(false);

    // --- De/Para State ---
    const [deParaMapping, setDeParaMapping] = useState([{ from: '', to: '' }]);
    const [targetColName, setTargetColName] = useState('');
    const [showDeParaModal, setShowDeParaModal] = useState(false); // For managing the more complex UI if needed, or inline

    // --- Persistence Logic ---
    const [exportTableName, setExportTableName] = useState('');
    const [showExportModal, setShowExportModal] = useState(false);
    const [showDownloadMenu, setShowDownloadMenu] = useState(false);

    // --- Input Dialog State ---
    const [inputDialog, setInputDialog] = useState({
        isOpen: false,
        title: '',
        fields: [], // { id, label, type: 'text'|'number', defaultValue }
        onConfirm: null
    });

    // --- Column Management ---
    const [contextMenu, setContextMenu] = useState(null); // { x, y, colIdx }
    const [editingCell, setEditingCell] = useState(null); // { rowIdx, colIdx, value }

    const handleHeaderClick = (e, idx) => {
        e.preventDefault();
        e.stopPropagation(); // Stop sort selection if necessary
        setContextMenu({ x: e.clientX, y: e.clientY, colIdx: idx });
    };

    const closeContextMenu = () => setContextMenu(null);

    const renameColumn = (idx) => {
        closeContextMenu();
        setInputDialog({
            isOpen: true,
            title: 'Renomear Coluna',
            fields: [{ id: 'name', label: 'Novo Nome', type: 'text', defaultValue: data.columns[idx] }],
            onConfirm: (values) => {
                const newName = values.name;
                if (!newName || newName.trim() === '') return;
                const newCols = [...data.columns];
                newCols[idx] = newName;
                setData(prev => ({ ...prev, columns: newCols }));
            }
        });
    };

    const deleteColumn = (idx) => {
        if (!window.confirm(`Tem certeza que deseja apagar a coluna "${data.columns[idx]}"?`)) return;
        const newCols = data.columns.filter((_, i) => i !== idx);
        const newRows = data.rows.map(row => row.filter((_, i) => i !== idx));
        setData({ columns: newCols, rows: newRows });
        closeContextMenu();
    };

    const addColumn = (idx, position) => {
        closeContextMenu();
        setInputDialog({
            isOpen: true,
            title: 'Nova Coluna',
            fields: [{ id: 'name', label: 'Nome da Coluna', type: 'text', defaultValue: 'Nova Coluna' }],
            onConfirm: (values) => {
                const newName = values.name;
                if (!newName) return;
                const insertIdx = position === 'left' ? idx : idx + 1;

                const newCols = [...data.columns];
                newCols.splice(insertIdx, 0, newName);

                const newRows = data.rows.map(row => {
                    const newRow = [...row];
                    newRow.splice(insertIdx, 0, '');
                    return newRow;
                });

                setData(prev => ({ columns: newCols, rows: newRows }));
            }
        });
    };

    const addFixedValueColumn = (idx) => {
        closeContextMenu();
        setInputDialog({
            isOpen: true,
            title: 'Adicionar Coluna com Valor Fixo',
            fields: [
                { id: 'name', label: 'Nome da Coluna', type: 'text', defaultValue: 'Nova Coluna' },
                { id: 'value', label: 'Valor Fixo (Preencherá todas as linhas)', type: 'text', defaultValue: '' }
            ],
            onConfirm: (values) => {
                const newName = values.name;
                const fixedValue = values.value;
                if (!newName) return;

                // Insert to the Right of current column by default
                const insertIdx = idx + 1;

                const newCols = [...data.columns];
                newCols.splice(insertIdx, 0, newName);

                const newRows = data.rows.map(row => {
                    const newRow = [...row];
                    newRow.splice(insertIdx, 0, fixedValue);
                    return newRow;
                });

                setData(prev => ({ columns: newCols, rows: newRows }));
            }
        });
    };

    // --- Column Selection ---
    const toggleColumnSelection = (index) => {
        setSelectedColumns(prev => {
            const newState = { ...prev };
            if (newState[index]) {
                delete newState[index];
            } else {
                newState[index] = true;
            }
            return newState;
        });
    };

    const clearSelection = () => setSelectedColumns({});

    // --- Transformation Logic ---
    const applyTransform = async (type, params = {}) => {
        const selectedIndices = Object.keys(selectedColumns).map(Number);
        if (selectedIndices.length === 0) {
            alert("Selecione pelo menos uma coluna para aplicar a transformação.");
            return;
        }

        setLoading(true);
        // Small timeout to let UI show loading state
        setTimeout(() => {
            try {
                const newData = { ...data };
                const newRows = newData.rows.map(row => [...row]); // Deep copy rows for immutability

                selectedIndices.forEach(colIdx => {
                    newRows.forEach((row, rowIdx) => {
                        let val = row[colIdx];
                        if (val === undefined || val === null) return;

                        let strVal = String(val);

                        switch (type) {
                            case 'uppercase':
                                row[colIdx] = strVal.toUpperCase();
                                break;
                            case 'lowercase':
                                row[colIdx] = strVal.toLowerCase();
                                break;
                            case 'capitalize':
                                row[colIdx] = strVal.charAt(0).toUpperCase() + strVal.slice(1).toLowerCase();
                                break;
                            case 'remove_accents':
                                row[colIdx] = strVal.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                                break;
                            case 'remove_special':
                                row[colIdx] = strVal.replace(/[^a-zA-Z0-9 ]/g, "");
                                break;
                            case 'replace':
                                if (params.find) {
                                    // Global replace
                                    row[colIdx] = strVal.split(params.find).join(params.replaceWith || '');
                                }
                                break;
                            case 'remove_custom':
                                if (params.chars) {
                                    // Escape special regex chars
                                    const escapedChars = params.chars.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                                    const regex = new RegExp(`[${escapedChars}]`, 'g');
                                    row[colIdx] = strVal.replace(regex, '');
                                }
                                break;
                        }
                    });
                });

                setData({ ...newData, rows: newRows });
                // Optional: visual feedback
            } catch (error) {
                console.error("Transform error:", error);
                alert("Erro ao aplicar transformação: " + error.message);
            } finally {
                setLoading(false);
            }
        }, 100);
    };

    // --- De/Para Logic ---
    const addMappingRow = () => setDeParaMapping([...deParaMapping, { from: '', to: '' }]);

    const updateMappingRow = (idx, field, value) => {
        const newMapping = [...deParaMapping];
        newMapping[idx][field] = value;
        setDeParaMapping(newMapping);
    };

    const removeMappingRow = (idx) => {
        const newMapping = deParaMapping.filter((_, i) => i !== idx);
        setDeParaMapping(newMapping.length ? newMapping : [{ from: '', to: '' }]);
    };

    const applyDePara = () => {
        const selectedIndices = Object.keys(selectedColumns).map(Number);
        if (selectedIndices.length !== 1) {
            alert("Para realizar o De/Para, selecione EXATAMENTE UMA coluna de origem (DE).");
            return;
        }
        if (!targetColName.trim()) {
            alert("Defina o nome da Nova Coluna (PARA).");
            return;
        }

        const sourceColIdx = selectedIndices[0];
        setLoading(true);

        setTimeout(() => {
            try {
                // Create Lookup Map for O(1) access
                const lookupMap = new Map();
                deParaMapping.forEach(item => {
                    if (item.from) lookupMap.set(String(item.from).trim(), item.to);
                });

                const newData = { ...data };
                // Add new column header
                newData.columns = [...newData.columns, targetColName];

                // Process rows
                const newRows = newData.rows.map(row => {
                    const sourceVal = String(row[sourceColIdx] || '').trim();
                    // Default to source value if no match? Or empty? User said "receber o resultado da regra". 
                    // Usually if not in rule, it's null or original. Let's keep blank for now as it's safer for "transformation" 
                    // or explicitly allow user to choose fallback. For MVP: Empty if no match.
                    const distinctVal = lookupMap.get(sourceVal);
                    const newVal = distinctVal !== undefined ? distinctVal : '';

                    return [...row, newVal];
                });

                setData({ columns: newData.columns, rows: newRows });
                setTargetColName('');
                setDeParaMapping([{ from: '', to: '' }]);
                alert(`Coluna "${targetColName}" criada com sucesso!`);
            } catch (err) {
                console.error(err);
                alert("Erro ao aplicar De/Para: " + err.message);
            } finally {
                setLoading(false);
            }
        }, 100);
    };

    // --- Persistence Logic ---
    const projectInputRef = useRef(null);

    const handleSaveProject = () => {
        if (!data.rows.length) {
            alert("Não há dados para salvar.");
            return;
        }

        setInputDialog({
            isOpen: true,
            title: 'Salvar Projeto',
            fields: [{ id: 'name', label: 'Nome do Projeto', type: 'text', defaultValue: file ? file.name.split('.')[0] : 'Projeto Sem Título' }],
            onConfirm: (values) => {
                const projectName = values.name;
                if (!projectName) return;

                const projectState = {
                    id: Date.now().toString(),
                    name: projectName,
                    version: '1.0',
                    timestamp: new Date().toISOString(),
                    fileName: file ? file.name : projectName,
                    data,
                    deParaMapping: [] // Or current mapping state if relevant to persistence
                };

                try {
                    const savedProjects = JSON.parse(localStorage.getItem('DATA_PROCESSOR_PROJECTS') || '[]');
                    // Check if exists/overwrite logic or just push? Let's just push for history log style or update if ID exists (but ID is new).
                    // Let's prepend to history.
                    const newHistory = [projectState, ...savedProjects];
                    localStorage.setItem('DATA_PROCESSOR_PROJECTS', JSON.stringify(newHistory));
                    alert("Projeto salvo no histórico com sucesso!");
                } catch (e) {
                    console.error("Save error", e);
                    alert("Erro ao salvar projeto: " + e.message);
                }
            }
        });
    };

    const handleLoadProjectClick = () => projectInputRef.current?.click();

    const handleLoadProject = (e) => {
        const fileObj = e.target.files[0];
        if (!fileObj) return;

        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const project = JSON.parse(ev.target.result);
                if (!project.data || !project.data.rows) {
                    throw new Error("Formato de projeto inválido.");
                }

                // Restore State
                setData(project.data);
                setDeParaMapping(project.deParaMapping || [{ from: '', to: '' }]);
                setFile({ name: project.fileName || 'Projeto Carregado' });
                alert("Projeto carregado com sucesso!");
            } catch (err) {
                console.error(err);
                alert("Erro ao carregar projeto: " + err.message);
            }
        };
        reader.readAsText(fileObj);
    };

    // --- DB Export Logic ---
    const inferType = (colIdx, rows) => {
        let isNumber = true;
        let isDate = true;
        let hasData = false;

        for (let i = 0; i < Math.min(rows.length, 100); i++) { // Sample first 100
            const val = rows[i][colIdx];
            if (val === undefined || val === null || String(val).trim() === '') continue;
            hasData = true;
            const str = String(val).trim();

            if (isNaN(Number(str.replace(',', '.')))) isNumber = false;
            if (isNaN(Date.parse(str))) isDate = false;
        }

        if (!hasData) return 'VARCHAR2(255)'; // Default
        if (isNumber) return 'NUMBER';
        // Date strings often false positive, be careful. For now default to VARCHAR unless sure.
        // if (isDate) return 'DATE'; 
        return 'VARCHAR2(4000)'; // Safe default
    };

    const cleanupColName = (name) => {
        return name.toUpperCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Remove accents
            .replace(/[^A-Z0-9_]/g, "_") // Replace special with underscore
            .replace(/_+/g, "_") // Dedupe underscores
            .replace(/^_/, "") // Remove leading underscore
            .slice(0, 30); // Max Oracle identifier length
    };

    const executeSql = async (sql) => {
        const res = await fetch('http://127.0.0.1:3001/api/query', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-db-connection': JSON.stringify(connection) // Pass global connection
            },
            body: JSON.stringify({
                sql: sql,
                connection: connection
            })
        });
        const json = await res.json();
        if (json.error) throw new Error(json.error);
        return json;
    };

    const startExport = async () => {
        if (!exportTableName) return alert("Digite o nome da tabela.");
        if (!connection) return alert("Sem conexão com banco de dados.");

        setLoading(true);
        setShowExportModal(false);

        try {
            // 1. Create Table
            const safeTableName = cleanupColName(exportTableName);
            const colDefs = data.columns.map((col, i) => {
                const safeCol = cleanupColName(col) || `COL_${i}`;
                const type = inferType(i, data.rows);
                return `${safeCol} ${type}`;
            }).join(', ');

            const createSql = `CREATE TABLE ${safeTableName} (${colDefs})`;
            console.log("Creating:", createSql);

            try {
                await executeSql(createSql);
            } catch (e) {
                // Ignore if exists? Or ask user. For now, fail if exists.
                if (e.message.includes("ORA-00955")) {
                    if (!window.confirm(`A tabela ${safeTableName} já existe. Deseja tentar inserir dados nela?`)) {
                        throw new Error("Exportação cancelada.");
                    }
                } else {
                    throw e;
                }
            }

            // 2. Insert Data (Batch)
            const BATCH_SIZE = 50;
            const cols = data.columns.map((c, i) => cleanupColName(c) || `COL_${i}`).join(', ');

            for (let i = 0; i < data.rows.length; i += BATCH_SIZE) {
                const chunk = data.rows.slice(i, i + BATCH_SIZE);

                // Construct INSERT ALL
                let insertBlock = "INSERT ALL\n";
                chunk.forEach(row => {
                    const values = row.map(val => {
                        if (val === null || val === undefined) return 'NULL';
                        const str = String(val).replace(/'/g, "''"); // Escape quotes
                        return `'${str}'`; // Treat everything as string literals for safety, Oracle casts if needed.
                        // Ideally we'd match types but '123' works for NUMBER.
                    }).join(', ');
                    insertBlock += `  INTO ${safeTableName} (${cols}) VALUES (${values})\n`;
                });
                insertBlock += "SELECT * FROM dual";

                await executeSql(insertBlock);
            }

            alert(`Sucesso! Tabela ${safeTableName} criada com ${data.rows.length} registros.`);

        } catch (err) {
            console.error(err);
            alert("Erro na exportação: " + err.message);
        } finally {
            setLoading(false);
        }
    };




    // --- File Download Logic ---
    const downloadFile = (type) => {
        if (!data.rows.length) return alert("Sem dados para baixar.");

        setShowDownloadMenu(false);
        setLoading(true);

        setTimeout(() => {
            try {
                // Prepare Data: Headers + Rows
                const finalData = [data.columns, ...data.rows];
                const ws = XLSX.utils.aoa_to_sheet(finalData);
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, "Dados Tratados");

                const fileName = `Tratado_${file ? file.name.split('.')[0] : 'Dados'}_${new Date().toISOString().slice(0, 10)}`;

                if (type === 'xlsx') {
                    XLSX.writeFile(wb, `${fileName}.xlsx`);
                } else if (type === 'csv') {
                    XLSX.writeFile(wb, `${fileName}.csv`, { bookType: 'csv' });
                }
            } catch (err) {
                console.error(err);
                alert("Erro ao gerar arquivo: " + err.message);
            } finally {
                setLoading(false);
            }
        }, 100);
    };

    // --- UI Helpers ---
    const fileInputRef = useRef(null);
    const handleImportClick = () => fileInputRef.current?.click();

    const processFile = async (fileObj) => {
        if (!fileObj) return;
        setLoading(true);
        setFile(fileObj);

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const bstr = e.target.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];

                // Parse to JSON (Header: A) to get raw matrix first, or header: 1
                const jsonData = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

                if (!jsonData || jsonData.length === 0) {
                    alert("Arquivo vazio!");
                    setLoading(false);
                    return;
                }

                // Assume first row is header if lines > 1
                let headers = [];
                let rows = [];

                if (jsonData.length > 0) {
                    headers = jsonData[0].map((h, i) => String(h || `Col ${i + 1}`));
                    rows = jsonData.slice(1);
                }

                setData({ columns: headers, rows: rows });
            } catch (err) {
                console.error("Error processing file", err);
                alert("Erro ao ler arquivo: " + err.message);
            } finally {
                setLoading(false);
            }
        };
        reader.readAsBinaryString(fileObj);
    };

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            processFile(file);
        }
    };



    // --- Transforms Sidebar ---
    const transforms = [
        { id: 'case', label: 'Formatar Texto', icon: Type, desc: 'Maiúsculas, Minúsculas, Capitalizar' },
        { id: 'replace', label: 'Substituir Valor', icon: ArrowRightLeft, desc: 'Trocar texto ou números' },
        { id: 'cleanup', label: 'Limpeza', icon: Eraser, desc: 'Remover acentos, especiais' },
        { id: 'depara', label: 'De / Para', icon: Binary, desc: 'Criar regras de tradução' },
    ];

    if (!isVisible) return null;

    return (
        <div className="flex flex-col h-full bg-slate-50 relative overflow-hidden">
            {/* Header */}
            <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shadow-sm z-20">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg text-white shadow-md">
                        <FileSpreadsheet size={20} />
                    </div>
                    <div>
                        <h1 className="font-bold text-slate-800 text-lg leading-tight">Tratar Dados</h1>
                        <p className="text-xs text-slate-400 font-medium">Importe, limpe e padronize seus arquivos</p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {/* File Info Pill */}
                    {file && (
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-full border border-slate-200 text-xs font-semibold text-slate-600 mr-2">
                            <FileText size={12} />
                            {file.name}
                            <button onClick={() => setFile(null)} className="ml-2 hover:text-red-500"><X size={12} /></button>
                        </div>
                    )}

                    <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        accept=".csv, .xlsx, .xls"
                        onChange={handleFileChange}
                    />

                    <button
                        onClick={handleImportClick}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-bold transition-all shadow-lg hover:shadow-xl active:scale-95"
                    >
                        <Upload size={16} />
                        Importar Arquivo
                    </button>

                    <div className="h-6 w-px bg-slate-200 mx-1"></div>

                    <input
                        type="file"
                        ref={projectInputRef}
                        className="hidden"
                        accept=".json"
                        onChange={handleLoadProject}
                    />

                    <button
                        onClick={handleLoadProjectClick}
                        className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 hover:text-emerald-600 hover:border-emerald-200 rounded-xl text-sm font-bold transition-all"
                    >
                        <FolderOpen size={16} />
                        Abrir
                    </button>

                    <button
                        onClick={handleSaveProject}
                        className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 hover:text-emerald-600 hover:border-emerald-200 rounded-xl text-sm font-bold transition-all"
                    >
                        <Save size={16} />
                        Salvar
                    </button>

                    <div className="relative">
                        <button
                            onClick={() => setShowDownloadMenu(!showDownloadMenu)}
                            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 hover:text-emerald-600 hover:border-emerald-200 rounded-xl text-sm font-bold transition-all"
                        >
                            <Download size={16} />
                            Baixar
                        </button>

                        <AnimatePresence>
                            {showDownloadMenu && (
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: 10 }}
                                    className="absolute top-full right-0 mt-2 w-40 bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden z-50 flex flex-col"
                                >
                                    <button
                                        onClick={() => downloadFile('xlsx')}
                                        className="text-left px-4 py-3 text-xs font-bold text-slate-600 hover:bg-emerald-50 hover:text-emerald-700 transition-colors flex items-center gap-2"
                                    >
                                        <FileSpreadsheet size={14} /> Excel (.xlsx)
                                    </button>
                                    <div className="h-px bg-slate-100"></div>
                                    <button
                                        onClick={() => downloadFile('csv')}
                                        className="text-left px-4 py-3 text-xs font-bold text-slate-600 hover:bg-emerald-50 hover:text-emerald-700 transition-colors flex items-center gap-2"
                                    >
                                        <FileText size={14} /> CSV (.csv)
                                    </button>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    <button
                        onClick={() => setShowExportModal(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-emerald-50 border border-emerald-100 text-emerald-700 hover:bg-emerald-100 rounded-xl text-sm font-bold transition-all"
                    >
                        <Database size={16} />
                        Exportar Banco
                    </button>
                </div>
            </header>

            {/* Export Modal */}
            <AnimatePresence>
                {showExportModal && (
                    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4 backdrop-blur-sm">
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm"
                        >
                            <h3 className="text-lg font-bold text-slate-800 mb-2">Exportar para Oracle</h3>
                            <p className="text-sm text-slate-500 mb-4">Escolha o nome da tabela. O sistema detectará automaticamente os tipos de dados.</p>

                            <label className="text-xs font-bold text-slate-500 uppercase">Nome da Tabela</label>
                            <input
                                value={exportTableName}
                                onChange={e => setExportTableName(e.target.value)}
                                className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg focus:border-emerald-500 outline-none font-mono text-sm uppercase"
                                placeholder="TB_IMPORTACAO_01"
                                autoFocus
                            />

                            <div className="flex gap-2 mt-6">
                                <button
                                    onClick={() => setShowExportModal(false)}
                                    className="flex-1 py-2 text-slate-500 font-bold text-sm hover:bg-slate-50 rounded-lg"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={startExport}
                                    className="flex-1 py-2 bg-emerald-600 text-white font-bold text-sm rounded-lg hover:bg-emerald-700"
                                >
                                    Confirmar
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Main Content */}
            <div className="flex-1 flex overflow-hidden">

                {/* Center: Data Grid */}
                <div className="flex-1 flex flex-col bg-slate-50/50 p-4 relative">
                    {!file ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-8 opacity-60">
                            <div className="w-24 h-24 bg-slate-200 rounded-full flex items-center justify-center mb-6 animate-pulse">
                                <FileSpreadsheet size={48} className="text-slate-400" />
                            </div>
                            <h3 className="text-xl font-bold text-slate-700 mb-2">Nenhum arquivo carregado</h3>
                            <p className="text-slate-500 max-w-md">Importe uma planilha Excel (.xlsx) ou arquivo CSV para começar a transformar seus dados.</p>
                            <button onClick={handleImportClick} className="mt-6 text-emerald-600 font-bold hover:underline">Clique para procurar</button>
                        </div>
                    ) : (
                        <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col relative">
                            {loading && (
                                <div className="absolute inset-0 bg-white/80 z-50 flex items-center justify-center flex-col">
                                    <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                                    <span className="text-slate-600 font-bold">Processando arquivo...</span>
                                </div>
                            )}

                            {/* Grid Toolbar */}
                            <div className="h-10 border-b border-slate-100 flex items-center px-4 justify-between bg-white">
                                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Dados Importados</div>
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-slate-400">
                                        {data.columns.length} colunas, {data.rows.length.toLocaleString()} linhas
                                    </span>
                                </div>
                            </div>

                            {/* Real Virtualized Grid */}
                            <div className="flex-1 overflow-hidden relative">
                                {data.columns.length > 0 && (
                                    <AutoSizer>
                                        {({ height, width }) => (
                                            <List
                                                height={height}
                                                width={width}
                                                itemCount={data.rows.length}
                                                itemSize={35}
                                                itemData={{ rows: data.rows, columns: data.columns }}
                                                className="react-window-list"
                                            >
                                                {({ index, style, data: { rows, columns } }) => (
                                                    <div
                                                        style={{ ...style, width: '100%' }} // Force width
                                                        className={`flex border-b border-slate-50 hover:bg-blue-50/50 transition-colors ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`} // Zebra striping
                                                    >
                                                        {/* Row Number */}
                                                        <div className="w-12 shrink-0 border-r border-slate-100 bg-slate-50 text-[10px] text-slate-400 flex items-center justify-center select-none">
                                                            {index + 1}
                                                        </div>
                                                        {columns.map((col, colIdx) => {
                                                            const isEditing = editingCell?.rowIdx === index && editingCell?.colIdx === colIdx;
                                                            return (
                                                                <div
                                                                    key={colIdx}
                                                                    className={`
                                                                        flex-1 min-w-[150px] px-3 flex items-center text-xs truncate border-r border-slate-100 hover:border-emerald-300 relative
                                                                        ${selectedColumns[colIdx] ? 'bg-emerald-50/10 text-emerald-800 font-medium' : 'text-slate-700'}
                                                                    `}
                                                                    title={rows[index][colIdx]}
                                                                    onDoubleClick={() => setEditingCell({ rowIdx: index, colIdx: colIdx, value: rows[index][colIdx] })}
                                                                >
                                                                    {isEditing ? (
                                                                        <input
                                                                            autoFocus
                                                                            value={editingCell.value}
                                                                            onChange={(e) => setEditingCell({ ...editingCell, value: e.target.value })}
                                                                            onBlur={() => {
                                                                                const newRows = [...data.rows];
                                                                                // Deep copy the row if needed, but rows[index] is array.
                                                                                const newRow = [...newRows[index]];
                                                                                newRow[colIdx] = editingCell.value;
                                                                                newRows[index] = newRow;
                                                                                setData({ ...data, rows: newRows });
                                                                                setEditingCell(null);
                                                                            }}
                                                                            onKeyDown={(e) => {
                                                                                if (e.key === 'Enter') {
                                                                                    e.target.blur();
                                                                                }
                                                                            }}
                                                                            className="absolute inset-0 w-full h-full px-2 bg-emerald-50 border-2 border-emerald-500 outline-none text-emerald-900 font-bold"
                                                                        />
                                                                    ) : (
                                                                        rows[index][colIdx]
                                                                    )}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </List>
                                        )}
                                    </AutoSizer>
                                )}

                                {/* Header Overlay (Sticky-ish simulation) */}
                                <div className="absolute top-0 left-0 w-12 h-9 bg-slate-100 border-r border-b border-slate-200 z-20 flex items-center justify-center text-[10px] font-bold text-slate-400">#</div>
                                <div className="absolute top-0 left-12 right-0 h-9 bg-white border-b border-slate-200 flex overflow-hidden">
                                    <Reorder.Group axis="x" values={data.columns} onReorder={(newOrder) => {
                                        // 1. Update Columns
                                        // 2. We must also update ROWS to match the new column order physically
                                        // OR we just keep a separate 'columnOrder' state.
                                        // Given the architecture, physical reorder is cleaner for 'export' and 'save' logic without refactoring everything.

                                        // Find the permutation
                                        const oldCols = data.columns;
                                        const newCols = newOrder;
                                        const permMap = newCols.map(c => oldCols.indexOf(c));

                                        // Update Rows
                                        const newRows = data.rows.map(row => permMap.map(idx => row[idx]));

                                        setData({ columns: newCols, rows: newRows });

                                        // Clear selection safely
                                        setSelectedColumns({});
                                    }} className="flex h-full min-w-full">
                                        {data.columns.map((col, i) => (
                                            <Reorder.Item
                                                key={col}
                                                value={col}
                                                className={`
                                                    flex-1 min-w-[150px] px-3 flex items-center justify-between text-xs font-bold cursor-grab active:cursor-grabbing select-none transition-colors border-r border-slate-200 relative group
                                                    ${selectedColumns[i] ? 'bg-emerald-100 text-emerald-800 border-b-2 border-b-emerald-500' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}
                                                `}
                                                onClick={() => toggleColumnSelection(i)}
                                                onContextMenu={(e) => handleHeaderClick(e, i)}
                                            >
                                                <span className="truncate">{col}</span>
                                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <MoreHorizontal size={12} className="text-slate-400 hover:text-emerald-600 cursor-pointer" onClick={(e) => handleHeaderClick(e, i)} />
                                                    {!selectedColumns[i] && <ChevronDown size={12} className="opacity-40" />}
                                                </div>
                                            </Reorder.Item>
                                        ))}
                                    </Reorder.Group>
                                </div>
                                {/* Push list down by header height */}
                                <style>{`.react-window-list { margin-top: 36px; }`}</style>
                            </div>
                        </div>
                    )}
                </div>

                {/* Right: Transformations Panel */}
                <div className="w-80 bg-white border-l border-slate-200 flex flex-col shadow-lg z-10">
                    <div className="p-5 border-b border-slate-100">
                        <h3 className="font-bold text-slate-800 flex items-center gap-2">
                            <Wand2 size={16} className="text-emerald-500" />
                            Ferramentas
                        </h3>
                        <p className="text-xs text-slate-400 mt-1">Selecione uma coluna para aplicar</p>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-3">
                        {transforms.map(t => (
                            <motion.div
                                key={t.id}
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                className={`
                                    rounded-xl border transition-all overflow-hidden
                                    ${activeTransform === t.id
                                        ? 'border-emerald-500 bg-emerald-50/30'
                                        : 'border-slate-200 hover:border-emerald-300 hover:shadow-sm bg-white'
                                    }
                                `}
                            >
                                <div
                                    onClick={() => setActiveTransform(activeTransform === t.id ? null : t.id)}
                                    className="p-4 flex items-center gap-3 cursor-pointer"
                                >
                                    <div className={`
                                        w-8 h-8 rounded-lg flex items-center justify-center transition-colors
                                        ${activeTransform === t.id ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-500 group-hover:bg-emerald-100 group-hover:text-emerald-600'}
                                    `}>
                                        <t.icon size={16} />
                                    </div>
                                    <div className="flex-1">
                                        <h4 className={`text-sm font-bold ${activeTransform === t.id ? 'text-emerald-900' : 'text-slate-700'}`}>{t.label}</h4>
                                        <p className="text-[10px] text-slate-400">{t.desc}</p>
                                    </div>
                                    <ChevronRight size={14} className={`text-slate-300 transition-transform ${activeTransform === t.id ? 'rotate-90 text-emerald-500' : ''}`} />
                                </div>

                                {/* Expanded Content */}
                                <AnimatePresence>
                                    {activeTransform === t.id && (
                                        <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: 'auto', opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            className="px-4 pb-4 pt-0"
                                        >
                                            <div className="h-px w-full bg-emerald-100 mb-3"></div>

                                            {/* Dynamic Content based on Transform Type */}
                                            {t.id === 'case' && (
                                                <div className="space-y-2">
                                                    <button onClick={() => applyTransform('uppercase')} className="w-full text-left px-3 py-2 text-xs font-medium text-slate-600 hover:bg-emerald-100 rounded-lg transition-colors">🔠 TUDO MAIÚSCULO</button>
                                                    <button onClick={() => applyTransform('lowercase')} className="w-full text-left px-3 py-2 text-xs font-medium text-slate-600 hover:bg-emerald-100 rounded-lg transition-colors">🔡 tudo minúsculo</button>
                                                    <button onClick={() => applyTransform('capitalize')} className="w-full text-left px-3 py-2 text-xs font-medium text-slate-600 hover:bg-emerald-100 rounded-lg transition-colors">🔤 Primeira Letra Maiúscula</button>
                                                </div>
                                            )}

                                            {t.id === 'cleanup' && (
                                                <div className="space-y-2">
                                                    <button onClick={() => applyTransform('remove_accents')} className="w-full text-left px-3 py-2 text-xs font-medium text-slate-600 hover:bg-emerald-100 rounded-lg transition-colors">Remover Acentos</button>
                                                    <button onClick={() => applyTransform('remove_special')} className="w-full text-left px-3 py-2 text-xs font-medium text-slate-600 hover:bg-emerald-100 rounded-lg transition-colors">Remover Caracteres Especiais</button>

                                                    <div className="pt-2 border-t border-slate-100">
                                                        <label className="text-[10px] font-bold text-slate-500 uppercase">Remover Específicos</label>
                                                        <div className="flex gap-2 mt-1">
                                                            <input
                                                                id="remove_chars_input"
                                                                className="flex-1 px-2 py-1.5 text-xs border border-slate-300 rounded-lg focus:border-emerald-500 outline-none"
                                                                placeholder="Ex: / \ |"
                                                            />
                                                            <button
                                                                onClick={() => applyTransform('remove_custom', { chars: document.getElementById('remove_chars_input').value })}
                                                                className="px-3 py-1.5 bg-emerald-100 text-emerald-700 rounded-lg text-xs font-bold hover:bg-emerald-200"
                                                            >
                                                                OK
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            {t.id === 'replace' && (
                                                <div className="space-y-3">
                                                    <div>
                                                        <label className="text-[10px] font-bold text-slate-500 uppercase">Localizar</label>
                                                        <input id="find_input" className="w-full mt-1 px-2 py-1.5 text-xs border border-slate-300 rounded-lg focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none" placeholder="Ex: R$" />
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] font-bold text-slate-500 uppercase">Substituir por</label>
                                                        <input id="replace_input" className="w-full mt-1 px-2 py-1.5 text-xs border border-slate-300 rounded-lg focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none" placeholder="Vazio..." />
                                                    </div>
                                                    <button
                                                        onClick={() => applyTransform('replace', {
                                                            find: document.getElementById('find_input').value,
                                                            replaceWith: document.getElementById('replace_input').value
                                                        })}
                                                        className="w-full py-2 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700"
                                                    >
                                                        Aplicar
                                                    </button>
                                                </div>
                                            )}

                                            {t.id === 'depara' && (
                                                <div className="p-2">
                                                    <p className="text-xs text-slate-500 mb-3">
                                                        Crie regras condicionais, mapeie valores ou importe listas de tradução.
                                                    </p>
                                                    <button
                                                        onClick={() => {
                                                            const idxs = Object.keys(selectedColumns);
                                                            if (idxs.length !== 1) return alert("Selecione apenas uma coluna de origem.");
                                                            setShowDeParaModal(true);
                                                        }}
                                                        className="w-full py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl shadow-md hover:shadow-lg hover:scale-[1.02] transition-all flex items-center justify-center gap-2 text-xs font-bold"
                                                    >
                                                        <Binary size={16} />
                                                        Abrir Mapeador Avançado
                                                    </button>
                                                </div>
                                            )}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </motion.div>
                        ))}
                    </div>

                    <div className="p-4 border-t border-slate-200 bg-slate-50">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Histórico de Alterações</div>
                        <div className="space-y-2">
                            <div className="flex items-center gap-2 text-xs text-slate-600 opacity-60">
                                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full"></span>
                                Nenhum alteração pendente
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Context Menu */}
            <AnimatePresence>
                {contextMenu && (
                    <>
                        <div className="fixed inset-0 z-[90]" onClick={closeContextMenu}></div>
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            style={{ top: contextMenu.y, left: contextMenu.x }}
                            className="fixed bg-white rounded-xl shadow-2xl border border-slate-100 p-2 z-[100] min-w-[200px]"
                        >
                            <div className="text-[10px] font-bold text-slate-400 px-3 py-1 uppercase tracking-wider mb-1">
                                {data.columns[contextMenu.colIdx]}
                            </div>

                            <button
                                onClick={() => renameColumn(contextMenu.colIdx)}
                                className="w-full text-left px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 rounded-lg flex items-center gap-2"
                            >
                                <Type size={14} /> Renomear
                            </button>

                            <div className="h-px bg-slate-100 my-1"></div>

                            <button
                                onClick={() => addColumn(contextMenu.colIdx, 'left')}
                                className="w-full text-left px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 rounded-lg flex items-center gap-2"
                            >
                                <ArrowRightLeft size={14} className="rotate-180" /> Inserir à Esquerda
                            </button>
                            <button
                                onClick={() => addColumn(contextMenu.colIdx, 'right')}
                                className="w-full text-left px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 rounded-lg flex items-center gap-2"
                            >
                                <ArrowRightLeft size={14} /> Inserir à Direita
                            </button>

                            <button
                                onClick={() => addFixedValueColumn(contextMenu.colIdx)}
                                className="w-full text-left px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 rounded-lg flex items-center gap-2"
                            >
                                <Type size={14} /> Adicionar Valor Fixo
                            </button>

                            <div className="h-px bg-slate-100 my-1"></div>

                            <button
                                onClick={() => deleteColumn(contextMenu.colIdx)}
                                className="w-full text-left px-3 py-2 text-xs font-bold text-red-500 hover:bg-red-50 rounded-lg flex items-center gap-2"
                            >
                                <Trash2 size={14} /> Excluir Coluna
                            </button>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            {/* Input Dialog Modal */}
            <AnimatePresence>
                {inputDialog.isOpen && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
                        >
                            <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50">
                                <h3 className="font-bold text-slate-800 text-lg">{inputDialog.title}</h3>
                            </div>
                            <div className="p-6">
                                {inputDialog.fields.map((field, idx) => (
                                    <div key={field.id} className="mb-4 last:mb-0">
                                        <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">{field.label}</label>
                                        <input
                                            autoFocus={idx === 0}
                                            id={`modalInput-${field.id}`}
                                            defaultValue={field.defaultValue}
                                            type={field.type || 'text'}
                                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-purple-500 focus:ring-4 focus:ring-purple-500/10 transition-all font-medium text-slate-700"
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    const values = {};
                                                    inputDialog.fields.forEach(f => {
                                                        values[f.id] = document.getElementById(`modalInput-${f.id}`).value;
                                                    });
                                                    inputDialog.onConfirm(values);
                                                    setInputDialog(prev => ({ ...prev, isOpen: false }));
                                                }
                                                if (e.key === 'Escape') {
                                                    setInputDialog(prev => ({ ...prev, isOpen: false }));
                                                }
                                            }}
                                        />
                                    </div>
                                ))}

                                <div className="flex justify-end gap-3 mt-6">
                                    <button
                                        onClick={() => setInputDialog(prev => ({ ...prev, isOpen: false }))}
                                        className="px-4 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100 rounded-lg transition-colors"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        onClick={() => {
                                            const values = {};
                                            inputDialog.fields.forEach(f => {
                                                values[f.id] = document.getElementById(`modalInput-${f.id}`).value;
                                            });
                                            inputDialog.onConfirm(values);
                                            setInputDialog(prev => ({ ...prev, isOpen: false }));
                                        }}
                                        className="px-4 py-2 text-sm font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-lg shadow-lg shadow-purple-200 transition-all"
                                    >
                                        Confirmar
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>


            {/* Advanced De/Para Modal */}
            <AnimatePresence>
                {showDeParaModal && (
                    <DeParaModal
                        isOpen={showDeParaModal}
                        onClose={() => setShowDeParaModal(false)}
                        data={data}
                        sourceColIdx={Object.keys(selectedColumns).length === 1 ? parseInt(Object.keys(selectedColumns)[0]) : null}
                        sourceColName={Object.keys(selectedColumns).length === 1 ? data.columns[parseInt(Object.keys(selectedColumns)[0])] : ''}
                        onApply={(newData) => {
                            setData(newData);
                            alert("Transformação aplicada com sucesso!");
                        }}
                    />
                )}
            </AnimatePresence>
        </div >
    );
};

export default DataProcessor;

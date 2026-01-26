import React, { useState } from 'react';
import { Trash2, ArrowLeft, ArrowRight, BarChart2, Bell, Check, ChevronDown, Database, FileText, Filter, Layout, MessageSquare, PieChart, Play, Plus, RefreshCw, Save, Search, Settings, Share2, Sidebar, User, X, Zap, LogOut, PanelRightClose, PanelRightOpen, Home, FolderOpen, Download, Upload } from 'lucide-react';

function CsvImporter({ isVisible, connectionName }) {
    if (!isVisible) return null;

    const [step, setStep] = useState(1); // 1: Upload, 2: Review, 3: Result
    const [file, setFile] = useState(null);
    const [delimiter, setDelimiter] = useState(';'); // Changed default to semicolon
    const [tableName, setTableName] = useState('');
    const [columns, setColumns] = useState([]);
    const [importing, setImporting] = useState(false);
    const [importStatus, setImportStatus] = useState('');
    const [importProgress, setImportProgress] = useState(0);
    const [previewData, setPreviewData] = useState([]);
    const [grantUser, setGrantUser] = useState('');
    const [importHistory, setImportHistory] = useState([]);

    const [tableExists, setTableExists] = useState(false);
    const [dropIfExists, setDropIfExists] = useState(false);
    const [jobId, setJobId] = useState(null);

    // --- Editable History State ---
    const [editingHistoryIdx, setEditingHistoryIdx] = useState(null);
    const [editingGrantUser, setEditingGrantUser] = useState('');

    // --- Bulk Column Selection State ---
    const [selectedCols, setSelectedCols] = useState(new Set());
    const [showColumnManager, setShowColumnManager] = useState(false);

    const toggleColumnSelection = (index) => {
        const newSelected = new Set(selectedCols);
        if (newSelected.has(index)) {
            newSelected.delete(index);
        } else {
            newSelected.add(index);
        }
        setSelectedCols(newSelected);
    };

    const toggleSelectAll = () => {
        if (selectedCols.size === columns.length) {
            setSelectedCols(new Set());
        } else {
            const allIndices = new Set(columns.map((_, i) => i));
            setSelectedCols(allIndices);
        }
    };

    const handleBulkDelete = () => {
        if (selectedCols.size === 0) return;

        if (!window.confirm(`Tem certeza que deseja excluir as ${selectedCols.size} colunas selecionadas?`)) return;

        // Filter out selected columns
        const newCols = columns.filter((_, i) => !selectedCols.has(i));

        if (newCols.length === 0) {
            alert("A tabela precisa ter pelo menos uma coluna.");
            return;
        }

        setColumns(newCols);
        setSelectedCols(new Set()); // Clear selection
    };

    const handleStartEdit = (item, idx) => {
        setEditingHistoryIdx(idx);
        setEditingGrantUser(item.grantUser || '');
    };

    const handleCancelEdit = () => {
        setEditingHistoryIdx(null);
        setEditingGrantUser('');
    };

    const handleSavePermission = async (item, idx) => {
        if (!editingGrantUser.trim()) {
            alert("Por favor, informe um usuário.");
            return;
        }

        try {
            // Grant Permission
            const res = await fetch('http://localhost:3001/api/query', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sql: `GRANT ALL ON "${item.tableName}" TO "${editingGrantUser.toUpperCase()}"` })
            });

            const data = await res.json();
            if (data.error) {
                alert('Erro ao conceder permissão: ' + data.error);
                return;
            }

            // Update History
            const newHistory = [...importHistory];
            newHistory[idx].grantUser = editingGrantUser.toUpperCase();
            setImportHistory(newHistory);
            localStorage.setItem('hap_csv_history', JSON.stringify(newHistory));

            setEditingHistoryIdx(null);
            setEditingGrantUser('');
            alert(`Permissão concedida para ${editingGrantUser.toUpperCase()} com sucesso!`);

        } catch (err) {
            alert('Erro de rede: ' + err.message);
        }
    };

    React.useEffect(() => {
        const savedHistory = localStorage.getItem('hap_csv_history');
        if (savedHistory) {
            try {
                setImportHistory(JSON.parse(savedHistory));
            } catch (e) {
                console.error("Failed to parse history", e);
            }
        }
    }, []);

    const [historyLimit, setHistoryLimit] = useState(5);

    const saveHistory = (newItem) => {
        const updated = [newItem, ...importHistory].slice(0, 50); // Keep last 50
        setImportHistory(updated);
        localStorage.setItem('hap_csv_history', JSON.stringify(updated));
    };

    const handleDeleteHistory = async (item, index) => {
        if (!window.confirm(`Tem certeza que deseja excluir o histórico e a tabela "${item.tableName}"?`)) return;

        try {
            // Drop Table
            const res = await fetch('http://localhost:3001/api/query', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sql: `DROP TABLE "${item.tableName}"` })
            });

            const data = await res.json();
            // Ignore "table does not exist" error (ORA-00942)
            if (data.error && !data.error.includes('ORA-00942')) {
                alert('Erro ao excluir tabela: ' + data.error);
                return;
            }

            // Remove from history
            const newHistory = [...importHistory];
            newHistory.splice(index, 1);
            setImportHistory(newHistory);
            localStorage.setItem('hap_csv_history', JSON.stringify(newHistory));

        } catch (err) {
            alert('Erro de rede: ' + err.message);
        }
    };

    const checkTable = async (name) => {
        try {
            const res = await fetch('http://localhost:3001/api/check-table', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tableName: name })
            });
            const data = await res.json();
            setTableExists(data.exists);
            if (data.exists) {
                setImportStatus(`A tabela ${name} já existe.`);
            } else {
                setImportStatus('');
            }
        } catch (err) {
            console.error("Error checking table:", err);
        }
    };

    const [filePath, setFilePath] = useState(null); // Store server file path
    const [detectedDelimiter, setDetectedDelimiter] = useState(';');
    const [totalRows, setTotalRows] = useState(0);

    const handleFileUpload = async (e) => {
        let selectedPath = null;
        let selectedName = null;

        // Handle Drag & Drop
        if (e && e.target && e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            selectedPath = file.path; // Electron exposes path on File object
            selectedName = file.name;
        }
        // Handle Native Dialog (Click)
        else {
            if (!window.electronAPI) {
                alert("Funcionalidade disponível apenas no App Desktop.");
                return;
            }
            selectedPath = await window.electronAPI.selectFile();
            if (selectedPath) {
                selectedName = selectedPath.split(/[/\\]/).pop();
            }
        }

        if (!selectedPath) return;

        setFilePath(selectedPath);
        setFile({ name: selectedName, path: selectedPath });

        setImporting(true);
        setImportStatus('Analisando arquivo...');
        setImportProgress(10);

        try {
            // Use the new Local CSV Analysis endpoint
            const res = await fetch('http://127.0.0.1:3001/api/analyze-local-csv', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filePath: selectedPath, delimiter })
            });

            const data = await res.json();
            if (data.error) throw new Error(data.error);

            setPreviewData(data.preview);
            setTableName(data.tableName);
            setColumns(data.columns);
            setFilePath(data.filePath);
            setTotalRows(data.totalEstimatedRows || 0);

            if (data.delimiter) {
                setDelimiter(data.delimiter);
                setDetectedDelimiter(data.delimiter);
            }

            await checkTable(data.tableName);

            setStep(2);
            setImporting(false);
            setImportStatus('');
        } catch (err) {
            setImportStatus('Erro ao analisar arquivo: ' + err.message);
            setImporting(false);
        }
    };

    const handleDeleteColumn = (index) => {
        if (columns.length <= 1) {
            alert("A tabela precisa ter pelo menos uma coluna.");
            return;
        }
        if (!window.confirm(`Tem certeza que deseja remover a coluna "${columns[index].name}"?`)) return;

        const newCols = columns.filter((_, i) => i !== index);
        setColumns(newCols);
    };

    const handleColumnChange = (index, field, value) => {
        const newCols = [...columns];
        newCols[index][field] = value;
        setColumns(newCols);
    };

    const handleImport = async () => {
        const newJobId = 'job_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
        setJobId(newJobId);
        setImporting(true);
        setImportStatus('Iniciando importação...');
        setImportProgress(0);

        // Start Polling
        const pollInterval = setInterval(async () => {
            try {
                const res = await fetch(`http://127.0.0.1:3001/api/import-status/${newJobId}`);
                if (res.ok) {
                    const status = await res.json();
                    if (status.status) setImportStatus(status.status);
                    if (status.insertedRows && totalRows > 0) {
                        const pct = Math.min(Math.round((status.insertedRows / totalRows) * 100), 99);
                        setImportProgress(pct);
                    }
                    if (status.progress) {
                        setImportProgress(status.progress);
                    }
                }
            } catch (e) {
                console.error("Polling error", e);
            }
        }, 1000);

        try {
            const response = await fetch('http://127.0.0.1:3001/api/create-table', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tableName,
                    columns,
                    data: previewData,
                    filePath: filePath,
                    delimiter: delimiter,
                    grantToUser: grantUser,
                    dropIfExists: dropIfExists,
                    jobId: newJobId
                })
            });

            clearInterval(pollInterval);
            const result = await response.json();

            if (result.success) {
                setImportStatus('Importação concluída com sucesso!');
                setImportProgress(100);

                saveHistory({
                    fileName: file.name,
                    tableName: tableName,
                    date: new Date().toISOString(),
                    grantUser: grantUser || 'Nenhum',
                    rowCount: result.totalInserted,
                    connection: connectionName
                });

                setTimeout(() => {
                    setStep(1);
                    setFile(null);
                    setPreviewData([]);
                    setColumns([]);
                    setTableName('');
                    setGrantUser('');
                    setFilePath(null);
                    setTotalRows(0);
                    setImporting(false);
                    setTableExists(false);
                    setDropIfExists(false);
                    setJobId(null);
                    alert(result.message);
                }, 1500);
            } else {
                setImportStatus('Erro: ' + result.message);
                setImporting(false);
                setJobId(null);
            }
        } catch (error) {
            clearInterval(pollInterval);
            setImportStatus('Erro de rede: ' + error.message);
            setImporting(false);
            setJobId(null);
        }
    };

    const handleCancel = async () => {
        if (!jobId) return;
        try {
            await fetch(`http://127.0.0.1:3001/api/cancel-import/${jobId}`, { method: 'POST' });
            setImportStatus('Cancelando...');
        } catch (e) {
            console.error("Cancel error", e);
        }
    };

    return (
        <div className="flex h-full bg-gray-50 relative overflow-hidden">
            {/* UNIFIED SIDEBAR (Shared) */}


            {/* MAIN CONTENT AREA */}
            <div className="flex-1 flex flex-col h-full relative overflow-hidden">
                {/* PROFESSIONAL HEADER */}
                <header className="bg-white border-b border-gray-200 h-16 px-8 flex items-center justify-between shadow-sm flex-shrink-0 z-10">
                    <div className="flex items-center gap-4">
                        <div>
                            <h1 className="text-2xl font-bold text-gray-800">Importar Arquivo CSV</h1>
                            <p className="text-sm text-gray-500">Transforme planilhas em tabelas do Oracle</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-bold border border-blue-100 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
                            {connectionName || 'Conexão Ativa'}
                        </div>
                    </div>
                </header>

                <div className="flex-1 p-4 overflow-y-auto">
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 min-h-full flex flex-col">

                        {/* Steps Indicator */}
                        <div className="flex items-center mb-4">
                            <div className={`flex items-center justify-center w-8 h-8 rounded-full ${step >= 1 ? 'bg-[#f37021] text-white' : 'bg-gray-200 text-gray-600'} font-bold`}>1</div>
                            <div className={`flex-1 h-1 mx-2 ${step >= 2 ? 'bg-[#f37021]' : 'bg-gray-200'}`}></div>
                            <div className={`flex items-center justify-center w-8 h-8 rounded-full ${step >= 2 ? 'bg-[#f37021] text-white' : 'bg-gray-200 text-gray-600'} font-bold`}>2</div>
                            <div className={`flex-1 h-1 mx-2 ${step >= 3 ? 'bg-[#f37021]' : 'bg-gray-200'}`}></div>
                            <div className={`flex items-center justify-center w-8 h-8 rounded-full ${step >= 3 ? 'bg-[#f37021] text-white' : 'bg-gray-200 text-gray-600'} font-bold`}>3</div>
                        </div>

                        {step === 1 && (
                            <div className="flex-1 flex flex-col space-y-6 overflow-y-auto">
                                <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer min-h-[200px]"
                                    onClick={() => handleFileUpload()}
                                    onDragOver={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                    }}
                                    onDrop={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                                            handleFileUpload({ target: { files: e.dataTransfer.files } });
                                        }
                                    }}
                                >
                                    {/* Native Dialog - No Input Needed */}
                                    <div className="text-6xl mb-4">📄</div>
                                    <p className="text-lg text-gray-600 font-medium">Clique para selecionar um arquivo CSV</p>
                                    <p className="text-sm text-gray-400 mt-2">ou arraste e solte aqui</p>
                                    {importing && <p className="mt-4 text-blue-600">{importStatus}</p>}
                                    {importStatus && importStatus.startsWith('Erro') && <p className="mt-4 text-red-600">{importStatus}</p>}
                                </div>

                                {importHistory.length > 0 && (
                                    <div className="border-t border-gray-200 pt-4">
                                        <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">Últimas Importações</h3>
                                        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden overflow-x-auto w-full max-w-[calc(100vw-80px)] md:max-w-full">
                                            <table className="min-w-full divide-y divide-gray-200">
                                                <thead className="bg-gray-50">
                                                    <tr>
                                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Conexão</th>
                                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Arquivo</th>
                                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Tabela</th>
                                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Data</th>
                                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Registros</th>
                                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Permissão</th>
                                                        <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Ações</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-200">
                                                    {importHistory.slice(0, historyLimit).map((item, idx) => (
                                                        <tr key={idx} className="hover:bg-gray-50 group">
                                                            <td className="px-4 py-2 text-sm text-gray-500 whitespace-nowrap font-medium">{item.connection || '-'}</td>
                                                            <td className="px-4 py-2 text-sm text-gray-900 whitespace-nowrap">{item.fileName}</td>
                                                            <td className="px-4 py-2 text-sm text-[#0054a6] font-medium whitespace-nowrap">{item.tableName}</td>
                                                            <td className="px-4 py-2 text-sm text-gray-500 whitespace-nowrap">{new Date(item.date).toLocaleDateString()} {new Date(item.date).toLocaleTimeString()}</td>
                                                            <td className="px-4 py-2 text-sm text-gray-500 whitespace-nowrap">{item.rowCount || '-'}</td>
                                                            <td className="px-4 py-2 text-sm text-gray-500 whitespace-nowrap">
                                                                {editingHistoryIdx === idx ? (
                                                                    <div className="flex items-center space-x-2">
                                                                        <input
                                                                            type="text"
                                                                            value={editingGrantUser}
                                                                            onChange={(e) => setEditingGrantUser(e.target.value)}
                                                                            className="border rounded px-2 py-1 text-xs w-24 uppercase"
                                                                            placeholder="USUÁRIO"
                                                                        />
                                                                        <button onClick={() => handleSavePermission(item, idx)} className="text-green-600 hover:text-green-800" title="Salvar">✅</button>
                                                                        <button onClick={handleCancelEdit} className="text-red-600 hover:text-red-800" title="Cancelar">❌</button>
                                                                    </div>
                                                                ) : (
                                                                    <div className="flex items-center space-x-2">
                                                                        <span>{item.grantUser || '-'}</span>
                                                                        <button onClick={() => handleStartEdit(item, idx)} className="text-blue-600 hover:text-blue-800 opacity-0 group-hover:opacity-100 transition-opacity" title="Editar Permissão">
                                                                            ✏️
                                                                        </button>
                                                                    </div>
                                                                )}
                                                            </td>
                                                            <td className="px-4 py-2 text-center whitespace-nowrap">
                                                                <button
                                                                    onClick={() => handleDeleteHistory(item, idx)}
                                                                    className="text-red-600 hover:text-red-800 hover:bg-red-50 p-1 rounded transition-colors"
                                                                    title="Excluir Histórico e Tabela"
                                                                >
                                                                    🗑️
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                        {importHistory.length > historyLimit && (
                                            <div className="mt-2 text-center">
                                                <button
                                                    onClick={() => setHistoryLimit(prev => prev + 5)}
                                                    className="text-sm text-[#0054a6] hover:underline font-medium"
                                                >
                                                    Ver mais...
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {step === 2 && (
                            <div className="flex-1 flex flex-col overflow-hidden relative">
                                {/* -- MODAL GERENCIAR COLUNAS -- */}
                                {showColumnManager && (
                                    <div className="absolute inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                                        <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl flex flex-col max-h-[90%] animate-in fade-in zoom-in duration-200">
                                            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                                                <h3 className="font-bold text-gray-700 flex items-center gap-2">
                                                    <Layout size={18} />
                                                    Gerenciar Colunas
                                                </h3>
                                                <button onClick={() => setShowColumnManager(false)} className="text-gray-400 hover:text-gray-600">
                                                    <X size={20} />
                                                </button>
                                            </div>

                                            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-white">
                                                <label className="flex items-center space-x-2 cursor-pointer select-none">
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedCols.size === columns.length && columns.length > 0}
                                                        onChange={toggleSelectAll}
                                                        className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                                                    />
                                                    <span className="text-sm font-medium text-gray-600">Selecionar Todas ({columns.length})</span>
                                                </label>

                                                {selectedCols.size > 0 && (
                                                    <button
                                                        onClick={handleBulkDelete}
                                                        className="flex items-center gap-2 px-3 py-1.5 bg-red-50 text-red-600 rounded hover:bg-red-100 border border-red-200 transition-colors text-sm font-bold"
                                                    >
                                                        <Trash2 size={16} />
                                                        Excluir {selectedCols.size} Selecionada(s)
                                                    </button>
                                                )}
                                            </div>

                                            <div className="flex-1 overflow-y-auto p-2">
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                                    {columns.map((col, idx) => (
                                                        <label
                                                            key={idx}
                                                            className={`flex items-center p-3 rounded border cursor-pointer transition-all ${selectedCols.has(idx) ? 'bg-blue-50 border-blue-200 ring-1 ring-blue-100' : 'bg-white border-gray-200 hover:border-gray-300'}`}
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                checked={selectedCols.has(idx)}
                                                                onChange={() => toggleColumnSelection(idx)}
                                                                className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 mt-0.5"
                                                            />
                                                            <div className="ml-3 flex-1 min-w-0">
                                                                <p className="text-sm font-bold text-gray-700 truncate">{col.name}</p>
                                                                <p className="text-xs text-gray-400 truncate">Origem: {col.originalName}</p>
                                                            </div>
                                                        </label>
                                                    ))}
                                                </div>
                                            </div>

                                            <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end">
                                                <button
                                                    onClick={() => setShowColumnManager(false)}
                                                    className="px-6 py-2 bg-gray-800 text-white rounded-md hover:bg-gray-900 font-medium"
                                                >
                                                    Concluir
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <div className="flex justify-between items-center mb-4">
                                    <div className="flex items-center space-x-4">
                                        <h3 className="text-xl font-bold text-gray-800">Visualizar e Editar Colunas</h3>
                                        <div className="flex items-center space-x-2 bg-blue-50 px-3 py-1 rounded border border-blue-100">
                                            <span className="text-sm font-medium text-blue-700">Tabela:</span>
                                            <input
                                                type="text"
                                                value={tableName}
                                                onChange={(e) => setTableName(e.target.value.toUpperCase())}
                                                onBlur={() => checkTable(tableName)}
                                                className="bg-white border border-blue-200 rounded px-2 py-0.5 text-sm font-bold text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400 uppercase"
                                                placeholder="NOME_DA_TABELA"
                                            />
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <div className="text-sm text-gray-500">
                                            Total: <span className="font-bold">{totalRows}</span> linhas
                                        </div>
                                        <button
                                            onClick={() => setShowColumnManager(true)}
                                            className="npx-button flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 rounded shadow-sm hover:bg-gray-50 text-gray-700 font-medium transition-colors"
                                        >
                                            <Layout size={16} />
                                            Gerenciar Colunas ({columns.length})
                                        </button>
                                    </div>
                                </div>

                                <div className="flex-1 overflow-auto border border-gray-200 rounded-lg">
                                    <table className="min-w-full divide-y divide-gray-200">
                                        <thead className="bg-gray-50 sticky top-0">
                                            <tr>
                                                {columns.map((col, idx) => (
                                                    <th key={idx} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[200px]">
                                                        <div className="flex flex-col space-y-2 group">
                                                            <div className="flex items-center justify-between">
                                                                <span className="text-[10px] text-gray-400 font-normal">Original: {col.originalName}</span>
                                                                <button
                                                                    onClick={() => handleDeleteColumn(idx)}
                                                                    className="text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity p-1"
                                                                    title="Excluir Coluna"
                                                                >
                                                                    <Trash2 size={14} />
                                                                </button>
                                                            </div>
                                                            <input
                                                                type="text"
                                                                value={col.name}
                                                                onChange={(e) => {
                                                                    const newCols = [...columns];
                                                                    newCols[idx].name = e.target.value.toUpperCase();
                                                                    setColumns(newCols);
                                                                }}
                                                                className="w-full bg-transparent border-b border-gray-300 focus:border-[#0054a6] outline-none text-xs font-bold py-1"
                                                            />
                                                            <select
                                                                value={col.type}
                                                                onChange={(e) => {
                                                                    const newCols = [...columns];
                                                                    newCols[idx].type = e.target.value;
                                                                    setColumns(newCols);
                                                                }}
                                                                className="w-full text-xs border-none bg-transparent focus:ring-0 p-0 text-gray-500 cursor-pointer"
                                                            >
                                                                <option value="VARCHAR2(255)">VARCHAR2(255)</option>
                                                                <option value="NUMBER">NUMBER</option>
                                                                <option value="DATE">DATE</option>
                                                                <option value="CLOB">CLOB</option>
                                                            </select>
                                                        </div>
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-gray-200">
                                            {previewData.slice(0, 5).map((row, rowIdx) => (
                                                <tr key={rowIdx}>
                                                    {columns.map((col, colIdx) => (
                                                        <td key={colIdx} className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                            {row[col.originalName] !== undefined ? row[col.originalName] : ''}
                                                        </td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <div className="mt-4 flex justify-end space-x-3">
                                    <button
                                        onClick={() => setStep(1)}
                                        className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                                    >
                                        Voltar
                                    </button>
                                    <button
                                        onClick={() => setStep(3)}
                                        className="px-4 py-2 bg-[#0054a6] text-white rounded-md hover:bg-blue-800"
                                    >
                                        Próximo
                                    </button>
                                </div>
                            </div>
                        )}

                        {step === 3 && (
                            <div className="flex-1 flex flex-col items-center justify-center max-w-lg mx-auto w-full">
                                <h3 className="text-xl font-bold text-gray-800 mb-6">Confirmar Importação</h3>

                                <div className="bg-gray-50 p-6 rounded-lg w-full mb-6 border border-gray-200">
                                    <div className="flex justify-between mb-2">
                                        <span className="text-gray-600">Arquivo:</span>
                                        <span className="font-medium">{file?.name}</span>
                                    </div>
                                    <div className="flex justify-between mb-2">
                                        <span className="text-gray-600">Tabela Destino:</span>
                                        <span className="font-medium text-[#0054a6]">{tableName}</span>
                                    </div>
                                    <div className="flex justify-between mb-2">
                                        <span className="text-gray-600">Colunas:</span>
                                        <span className="font-medium">{columns.length}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-600">Linhas Estimadas:</span>
                                        <span className="font-medium">{totalRows > 0 ? totalRows : 'Calculando...'}</span>
                                    </div>
                                </div>

                                {tableExists && (
                                    <div className="w-full mb-6 bg-orange-50 border border-orange-200 p-4 rounded-lg">
                                        <h4 className="text-orange-800 font-bold mb-2 flex items-center">
                                            <span className="mr-2">⚠️</span> Tabela Existente
                                        </h4>
                                        <p className="text-sm text-orange-700 mb-3">
                                            A tabela <strong>{tableName}</strong> já existe no banco de dados. O que você deseja fazer?
                                        </p>
                                        <div className="flex space-x-3">
                                            <label className="flex items-center space-x-2 cursor-pointer">
                                                <input
                                                    type="radio"
                                                    checked={!dropIfExists}
                                                    onChange={() => setDropIfExists(false)}
                                                    className="text-orange-600 focus:ring-orange-500"
                                                />
                                                <span className="text-sm text-gray-700">Cancelar e Renomear (Voltar)</span>
                                            </label>
                                            <label className="flex items-center space-x-2 cursor-pointer">
                                                <input
                                                    type="radio"
                                                    checked={dropIfExists}
                                                    onChange={() => setDropIfExists(true)}
                                                    className="text-red-600 focus:ring-red-500"
                                                />
                                                <span className="text-sm text-red-700 font-medium">Recriar Tabela (Apagar dados antigos)</span>
                                            </label>
                                        </div>
                                    </div>
                                )}

                                <div className="w-full mb-6">
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Conceder Permissão de Acesso (GRANT ALL) para outro usuário (Opcional):
                                    </label>
                                    <input
                                        type="text"
                                        value={grantUser}
                                        onChange={(e) => setGrantUser(e.target.value.toUpperCase())}
                                        placeholder="Ex: OUTRO_USUARIO"
                                        className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#0054a6] outline-none"
                                    />
                                    <p className="text-xs text-gray-500 mt-1">
                                        Se preenchido, executará: <code>GRANT ALL ON {tableName} TO {grantUser || 'USUARIO'}</code>
                                    </p>
                                </div>

                                {importing ? (
                                    <div className="w-full text-center">
                                        <div className="mb-2 flex justify-between text-sm font-medium text-gray-700">
                                            <span>{importStatus}</span>
                                            <span>{importProgress}%</span>
                                        </div>
                                        <div className="w-full bg-gray-200 rounded-full h-2.5 mb-4">
                                            <div className="bg-[#0054a6] h-2.5 rounded-full transition-all duration-500" style={{ width: `${importProgress}%` }}></div>
                                        </div>
                                        <button
                                            onClick={handleCancel}
                                            className="px-4 py-2 bg-red-100 text-red-700 rounded-md hover:bg-red-200 text-sm font-medium"
                                        >
                                            Cancelar Importação
                                        </button>
                                    </div>
                                ) : (
                                    <div className="flex flex-col w-full">
                                        <div className="flex space-x-3 w-full">
                                            <button
                                                onClick={() => setStep(2)}
                                                className="flex-1 px-4 py-3 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 font-medium"
                                            >
                                                Voltar
                                            </button>
                                            <button
                                                onClick={() => {
                                                    if (tableExists && !dropIfExists) {
                                                        setStep(2); // Go back to rename
                                                        alert("Por favor, renomeie a tabela para continuar.");
                                                    } else {
                                                        handleImport();
                                                    }
                                                }}
                                                className={`flex-1 px-4 py-3 text-white rounded-md font-bold shadow-md ${tableExists && !dropIfExists ? 'bg-gray-400 cursor-not-allowed' : 'bg-[#f37021] hover:bg-orange-600'}`}
                                                disabled={tableExists && !dropIfExists}
                                            >
                                                {tableExists && dropIfExists ? 'Recriar e Importar' : 'Iniciar Importação'}
                                            </button>
                                        </div>
                                        {importStatus && importStatus.startsWith('Erro') && (
                                            <p className="mt-4 text-red-600 text-center font-medium">{importStatus}</p>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default CsvImporter;

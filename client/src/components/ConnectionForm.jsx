import React, { useState, useEffect } from 'react';
import hapLogo from '../assets/hap_logo_sql.png';
import { encryptPassword, decryptPassword } from '../utils/security';

const DEFAULT_CONNECTIONS = [];

import { useApi } from '../context/ApiContext';

function ConnectionForm({ onConnect, onConnectionsChange }) {
    const [formData, setFormData] = useState({
        user: '',
        password: '',
        connectString: 'localhost:1521/XEPDB1',
        connectionName: ''
    });
    const [savedConnections, setSavedConnections] = useState([]);
    const [status, setStatus] = useState({ type: '', message: '' });
    const [isEditing, setIsEditing] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [showPassword, setShowPassword] = useState(false);
    const [isViewOnly, setIsViewOnly] = useState(false);

    const { apiUrl } = useApi(); // Ensure we have access to API URL context if needed, or assume relative path /api

    // Helper to backup
    const backupConnections = async (connections) => {
        try {
            await fetch('http://127.0.0.1:3001/api/config/connections/backup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(connections)
            });
        } catch (e) {
            console.error("Backup failed", e);
        }
    };

    useEffect(() => {
        const initConnections = async () => {
            const saved = localStorage.getItem('oracle_connections');
            const deletedDefaults = JSON.parse(localStorage.getItem('deleted_defaults') || '[]');

            let localConnections = [];
            if (saved) {
                try {
                    localConnections = JSON.parse(saved);
                } catch (e) {
                    console.error("Failed to parse saved connections", e);
                }
            }

            // Restore from Valid Backup
            try {
                const res = await fetch('http://127.0.0.1:3001/api/config/connections/restore');
                const restored = await res.json();

                if (Array.isArray(restored) && restored.length > 0) {
                    // Merge strategy: Unique IDs. Prioritize Restored if Local is empty.
                    if (localConnections.length === 0) {
                        localConnections = restored;
                        localStorage.setItem('oracle_connections', JSON.stringify(localConnections));
                    } else {
                        // Merge unique
                        const localIds = new Set(localConnections.map(c => c.id));
                        restored.forEach(rc => {
                            if (!localIds.has(rc.id)) {
                                localConnections.push(rc);
                            }
                        });
                        localStorage.setItem('oracle_connections', JSON.stringify(localConnections));
                    }
                }
            } catch (e) {
                console.error("Restore failed or offline", e);
            }

            // --- MIGRATION: Force Removal of Deprecated Defaults (v3.0.18) ---
            const legacyIds = ['default_hml', 'default_prod'];
            const originalLength = localConnections.length;
            localConnections = localConnections.filter(c => !legacyIds.includes(c.id));

            if (localConnections.length !== originalLength) {
                console.log("Purged legacy default connections.");
                hasChanges = true;
            }
            // ------------------------------------------------------------------

            // Conflict Resolution and Merging Defaults (Legacy logic kept)
            const defaultsToAdd = DEFAULT_CONNECTIONS.filter(def => !deletedDefaults.includes(def.id));

            defaultsToAdd.forEach(def => {
                const alreadyExists = localConnections.some(c => c.id === def.id);
                if (!alreadyExists) {
                    const nameConflictIndex = localConnections.findIndex(c => c.connectionName === def.connectionName && !c.isDefault);
                    if (nameConflictIndex !== -1) {
                        localConnections[nameConflictIndex].connectionName = `${localConnections[nameConflictIndex].connectionName}_OLD`;
                    }
                    localConnections.unshift(def);
                    hasChanges = true;
                }
            });

            if (hasChanges) {
                localStorage.setItem('oracle_connections', JSON.stringify(localConnections));
                backupConnections(localConnections); // Force sync to purge from backup file
            }

            setSavedConnections(localConnections);

            // Notify Parent with the FRESH list
            if (onConnectionsChange) onConnectionsChange(localConnections);
        };

        initConnections();
    }, []);

    const handleChange = (e) => {
        setFormData({
            ...formData,
            [e.target.name]: e.target.value
        });
    };

    const handleTest = async () => {
        setStatus({ type: 'info', message: 'Testando conexão...' });
        try {
            const response = await fetch('http://127.0.0.1:3001/api/connect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            const data = await response.json();
            if (data.success) {
                setStatus({ type: 'success', message: 'Conexão realizada com sucesso!' });
            } else {
                setStatus({ type: 'error', message: 'Falha na conexão: ' + data.message });
            }
        } catch (err) {
            const msg = err.message === 'Failed to fetch' ? 'Falha na comunicação com o servidor (Verifique se o servidor está rodando)' : err.message;
            setStatus({ type: 'error', message: 'Erro de rede: ' + msg });
        }
    };

    const handleSave = () => {
        if (!formData.user || !formData.connectString || !formData.connectionName) {
            setStatus({ type: 'error', message: 'Por favor, preencha Nome, Usuário e Host.' });
            return;
        }

        const encryptedData = {
            ...formData,
            password: encryptPassword(formData.password)
        };

        let newConnections;
        if (isEditing && editingId) {
            // Update existing
            newConnections = savedConnections.map(conn =>
                conn.id === editingId ? { ...encryptedData, id: editingId } : conn
            );
            setIsEditing(false);
            setEditingId(null);
            setStatus({ type: 'success', message: 'Conexão atualizada!' });
        } else {
            // Create new
            const newConn = { ...encryptedData, id: Date.now().toString() };
            newConnections = [...savedConnections, newConn];
            setStatus({ type: 'success', message: 'Conexão salva!' });
        }

        setSavedConnections(newConnections);
        localStorage.setItem('oracle_connections', JSON.stringify(newConnections));
        localStorage.setItem('oracle_connections', JSON.stringify(newConnections));
        backupConnections(newConnections); // Sync to server file
        if (onConnectionsChange) onConnectionsChange(newConnections);
    };

    const handleLoad = (conn) => {
        setFormData({
            user: conn.user,
            password: decryptPassword(conn.password),
            connectString: conn.isDefault ? decryptPassword(conn.connectString) : conn.connectString,
            connectionName: conn.connectionName || ''
        });
        setStatus({ type: '', message: '' });
        setShowPassword(false); // Reset password visibility

        if (conn.isDefault) {
            setIsEditing(false); // Defaults cannot be edited
            setEditingId(conn.id);
            setIsViewOnly(true);
            setStatus({ type: 'info', message: 'Conexão padrão selecionada (Somente leitura).' });
        } else {
            setIsEditing(true);
            setEditingId(conn.id);
            setIsViewOnly(false);
        }
    };

    const handleEdit = (conn, e) => {
        e.stopPropagation();
        if (conn.isDefault) {
            alert("Conexões padrão não podem ser editadas.");
            return;
        }
        handleLoad(conn);
        setStatus({ type: 'info', message: `Editando: ${conn.connectionName}` });
    };

    const handleDelete = (id, e, isDefault) => {
        e.stopPropagation();
        if (window.confirm('Tem certeza que deseja excluir esta conexão?')) {
            const newConnections = savedConnections.filter(c => c.id !== id);
            setSavedConnections(newConnections);
            localStorage.setItem('oracle_connections', JSON.stringify(newConnections));
            localStorage.setItem('oracle_connections', JSON.stringify(newConnections));
            backupConnections(newConnections); // Sync to server file
            if (onConnectionsChange) onConnectionsChange(newConnections);

            if (isDefault) {
                const deletedDefaults = JSON.parse(localStorage.getItem('deleted_defaults') || '[]');
                deletedDefaults.push(id);
                localStorage.setItem('deleted_defaults', JSON.stringify(deletedDefaults));
            }

            if (editingId === id) {
                setIsEditing(false);
                setEditingId(null);
                setIsViewOnly(false);
                setFormData({ user: '', password: '', connectString: 'localhost:1521/XEPDB1', connectionName: '' });
            }
        }
    };

    const handleConnect = async () => {
        setStatus({ type: 'info', message: 'Conectando...' });
        try {
            const response = await fetch('http://127.0.0.1:3001/api/connect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            const data = await response.json();
            if (data.success) {
                onConnect({ ...formData, id: editingId });
            } else {
                setStatus({ type: 'error', message: data.message });
            }
        } catch (err) {
            setStatus({ type: 'error', message: err.message });
        }
    };

    const handleCancelEdit = () => {
        setIsEditing(false);
        setEditingId(null);
        setIsViewOnly(false);
        setFormData({ user: '', password: '', connectString: 'localhost:1521/XEPDB1', connectionName: '' });
        setStatus({ type: '', message: '' });
    };

    return (
        <div className="flex h-full bg-[#f8fafc] relative overflow-hidden font-sans">
            {/* Background Ambience */}
            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-100/50 rounded-full blur-[100px] pointer-events-none -mr-24 -mt-24"></div>
            <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-orange-100/50 rounded-full blur-[100px] pointer-events-none -ml-24 -mb-24"></div>

            <div className="flex w-full h-full p-4 md:p-6 z-20 gap-6 max-w-7xl mx-auto">

                {/* Left Side: Saved Connections (Blue Sidebar Style) */}
                <div className="w-1/3 flex flex-col bg-blue-600 rounded-2xl shadow-xl shadow-blue-500/20 overflow-hidden text-white">
                    <div className="p-5 border-b border-blue-500 bg-blue-600 sticky top-0 z-10 flex items-center gap-3">
                        <div className="h-6 w-1.5 bg-orange-400 rounded-full shadow-[0_0_10px_rgba(251,146,60,0.5)]"></div>
                        <h2 className="text-lg font-bold text-white tracking-wide">Conexões Salvas</h2>
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-3 p-4 custom-scrollbar bg-blue-600">
                        {savedConnections.length === 0 && (
                            <div className="text-center py-10 px-6 rounded-xl border border-dashed border-blue-400/50 bg-blue-500/30">
                                <div className="text-3xl mb-2 opacity-50">📭</div>
                                <p className="text-blue-100 font-medium text-sm">Nenhuma conexão salva.</p>
                                <p className="text-[10px] text-blue-200/70 mt-1">Crie uma nova conexão ao lado.</p>
                            </div>
                        )}
                        {savedConnections.map((conn, index) => (
                            <div
                                key={conn.id || index}
                                onClick={() => handleLoad(conn)}
                                className={`group relative p-3.5 rounded-xl border transition-all duration-300 cursor-pointer
                                    ${editingId === conn.id
                                        ? 'bg-white border-white shadow-lg scale-[1.02] z-10'
                                        : 'bg-white/90 border-transparent hover:bg-white hover:shadow-md'
                                    }
                                `}
                            >
                                <div className="flex items-center justify-between mb-1.5">
                                    <div className="font-bold text-sm text-slate-800">
                                        {conn.connectionName || `Conexão ${index + 1}`}
                                    </div>
                                    {conn.isDefault && (
                                        <span className="text-[9px] uppercase font-bold px-2 py-0.5 rounded-md border bg-blue-50 text-blue-600 border-blue-100">
                                            Padrão
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-2 text-[11px] font-mono p-1.5 rounded-lg border bg-slate-50 border-slate-100 text-slate-500">
                                    <span className="font-semibold opacity-90">{conn.user}</span>
                                    <span className="opacity-50">@</span>
                                    <span className="truncate max-w-[120px]" title={conn.connectString}>
                                        {conn.isDefault ? '••••••••' : conn.connectString}
                                    </span>
                                </div>

                                <div className={`absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-all scale-90 group-hover:scale-100 flex gap-1 rounded-lg p-1 bg-white`}>
                                    {!conn.isDefault && (
                                        <button
                                            onClick={(e) => handleEdit(conn, e)}
                                            className="p-1 rounded-md transition-colors text-slate-400 hover:text-blue-600 hover:bg-blue-50"
                                            title="Editar"
                                        >
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                        </button>
                                    )}
                                    <button
                                        onClick={(e) => handleDelete(conn.id, e, conn.isDefault)}
                                        className="p-1 rounded-md transition-colors text-slate-400 hover:text-red-600 hover:bg-red-50"
                                        title="Excluir"
                                    >
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="p-4 border-t border-blue-500 bg-blue-600">
                        <button
                            onClick={() => {
                                setIsEditing(false);
                                setEditingId(null);
                                setIsViewOnly(false);
                                setFormData({ user: '', password: '', connectString: 'localhost:1521/XEPDB1', connectionName: '' });
                                setStatus({ type: '', message: '' });
                            }}
                            className="w-full py-2.5 bg-orange-500 border border-orange-600 text-white rounded-xl hover:bg-orange-600 transition-all font-bold flex items-center justify-center gap-2 group text-sm shadow-lg shadow-orange-500/20"
                        >
                            <span className="text-xl leading-none group-hover:-translate-y-0.5 transition-transform">+</span>
                            <span>Nova Conexão</span>
                        </button>
                    </div>
                </div>

                {/* Right Side: Main Form Area (Compact) */}
                <div className="w-2/3 flex items-center justify-center overflow-y-auto">
                    <div className="bg-white rounded-3xl shadow-2xl shadow-slate-200/50 p-8 w-full max-w-lg relative border border-white">

                        {/* Prominent Logo Section (Reduced Size) */}
                        <div className="flex flex-col items-center mb-6">
                            <div className="relative group cursor-default">
                                <div className="absolute inset-0 bg-blue-500/10 blur-xl rounded-full scale-110"></div>
                                <img
                                    src={hapLogo}
                                    alt="Hap Logo"
                                    className="h-20 md:h-24 relative z-10 drop-shadow-lg hover:scale-105 transition-transform duration-500 ease-out"
                                />
                                <div className="absolute -top-1 -right-3 bg-orange-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full shadow-md border border-white rotate-12 z-20">
                                    V3.0
                                </div>
                            </div>

                            <h1 className="text-2xl font-extrabold text-slate-800 mt-4 tracking-tight">
                                {isEditing ? 'Editar Conexão' : 'Nova Conexão'}
                            </h1>
                            <p className="text-slate-400 text-sm mt-1 font-medium">
                                {isEditing ? 'Atualize as credenciais abaixo.' : 'Insira as credenciais do banco Oracle.'}
                            </p>
                        </div>

                        <div className="space-y-4">
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Nome da Conexão</label>
                                <input
                                    type="text"
                                    name="connectionName"
                                    value={formData.connectionName}
                                    onChange={handleChange}
                                    disabled={isViewOnly}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all font-semibold text-slate-700 text-sm placeholder:text-slate-300"
                                    placeholder="Ex: Produção, Homolog..."
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Usuário</label>
                                    <input
                                        type="text"
                                        name="user"
                                        value={formData.user}
                                        onChange={handleChange}
                                        disabled={isViewOnly}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all font-semibold text-slate-700 text-sm placeholder:text-slate-300"
                                        placeholder="system"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Senha</label>
                                    <div className="relative">
                                        <input
                                            type={showPassword ? "text" : "password"}
                                            name="password"
                                            value={formData.password}
                                            onChange={handleChange}
                                            disabled={isViewOnly}
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all font-semibold text-slate-700 text-sm placeholder:text-slate-300 pr-9"
                                            placeholder="••••••"
                                        />
                                        {!isViewOnly && (
                                            <button
                                                type="button"
                                                onClick={() => setShowPassword(!showPassword)}
                                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 text-xs"
                                                tabIndex="-1"
                                            >
                                                {showPassword ? "🙈" : "👁️"}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Host (Connect String)</label>
                                <input
                                    type={isViewOnly ? "password" : "text"}
                                    name="connectString"
                                    value={formData.connectString}
                                    onChange={handleChange}
                                    disabled={isViewOnly}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all font-mono text-xs text-slate-600 placeholder:text-slate-300"
                                    placeholder="localhost:1521/XEPDB1"
                                />
                            </div>

                            {/* Status Message */}
                            <div className="min-h-[2.5rem] flex items-center justify-center">
                                {status.message && (
                                    <div className={`
                                        px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 shadow-sm
                                        ${status.type === 'error' ? 'bg-red-50 text-red-600 border border-red-100' :
                                            status.type === 'success' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' :
                                                'bg-blue-50 text-blue-600 border border-blue-100'}
                                    `}>
                                        <span className="text-sm">{status.type === 'error' ? '⚠️' : status.type === 'success' ? '🎉' : 'ℹ️'}</span>
                                        <span>{status.message}</span>
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-3 pt-1">
                                <button
                                    onClick={handleTest}
                                    className="py-3 px-4 bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-800 rounded-xl font-bold transition-all text-sm"
                                >
                                    Testar
                                </button>

                                {!isViewOnly ? (
                                    <div className="flex gap-3">
                                        <button
                                            onClick={handleSave}
                                            className="flex-1 py-3 px-4 bg-white border border-orange-200 text-orange-600 hover:bg-orange-50 rounded-xl font-bold transition-all text-sm"
                                        >
                                            {isEditing ? 'Atualizar' : 'Salvar'}
                                        </button>
                                        <button
                                            onClick={handleConnect}
                                            className="flex-1 py-3 px-4 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white rounded-xl font-bold shadow-lg shadow-orange-500/30 hover:shadow-orange-500/40 hover:-translate-y-0.5 transition-all text-sm"
                                        >
                                            Conectar
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        onClick={handleConnect}
                                        className="col-span-1 py-3 px-4 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white rounded-xl font-bold shadow-lg shadow-orange-500/30 hover:shadow-orange-500/40 hover:-translate-y-0.5 transition-all text-sm"
                                    >
                                        Conectar
                                    </button>
                                )}
                            </div>

                            {isEditing && (
                                <button
                                    onClick={handleCancelEdit}
                                    className="w-full text-[10px] text-slate-400 hover:text-slate-600 font-medium py-1 transition-colors"
                                >
                                    Cancelar Edição
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default ConnectionForm;

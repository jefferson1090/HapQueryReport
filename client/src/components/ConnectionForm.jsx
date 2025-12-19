import React, { useState, useEffect } from 'react';
import hapLogo from '../assets/hap_logo_sql.png';
import { encryptPassword, decryptPassword } from '../utils/security';

const DEFAULT_CONNECTIONS = [
    {
        id: 'default_hml',
        connectionName: 'Homologação',
        user: 'c_stenio',
        password: 'U2FsdGVkX1+diVLEnj1jZvw5sxormGTsBtESRfh/6qI=', // Encrypted 'ste001'
        connectString: 'U2FsdGVkX19U80G4qXgfVWspNeUM1/u7eLMDucd94oLGmVlBl5jIXGEAgUHAR5qUKaQVNtBWZ215IVNQ7BcUmg==', // Encrypted host
        isDefault: true
    },
    {
        id: 'default_prod',
        connectionName: 'Produção',
        user: 'c_stenio',
        password: 'U2FsdGVkX18wBXPCBeTyxr4YfqfTum15kjrRFf1vBSc=', // Encrypted 'smr001'
        connectString: 'U2FsdGVkX1/AUWNk4WMSarytTse8PePFGvDEaKgnRoWRDihwycxMJolWJiZylGcJoHEO/gtgT8cnKI/Ma+5VlQ==', // Encrypted host
        isDefault: true
    }
];

function ConnectionForm({ onConnect }) {
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

    useEffect(() => {
        const saved = localStorage.getItem('oracle_connections');
        const deletedDefaults = JSON.parse(localStorage.getItem('deleted_defaults') || '[]');

        let initialConnections = [];
        if (saved) {
            try {
                initialConnections = JSON.parse(saved);
            } catch (e) {
                console.error("Failed to parse saved connections", e);
            }
        }

        // Conflict Resolution and Merging Defaults
        let hasChanges = false;
        const defaultsToAdd = DEFAULT_CONNECTIONS.filter(def => !deletedDefaults.includes(def.id));

        defaultsToAdd.forEach(def => {
            // Check if default is already present
            const alreadyExists = initialConnections.some(c => c.id === def.id);
            if (!alreadyExists) {
                // Check for name conflict with existing user connections
                const nameConflictIndex = initialConnections.findIndex(c => c.connectionName === def.connectionName && !c.isDefault);
                if (nameConflictIndex !== -1) {
                    // Rename the existing user connection
                    initialConnections[nameConflictIndex].connectionName = `${initialConnections[nameConflictIndex].connectionName}_OLD`;
                    hasChanges = true;
                }
                // Add the default connection
                initialConnections.unshift(def); // Add to top
                hasChanges = true;
            }
        });

        if (hasChanges) {
            localStorage.setItem('oracle_connections', JSON.stringify(initialConnections));
        }

        setSavedConnections(initialConnections);
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
            setEditingId(null);
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
                onConnect(formData);
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
        <div className="flex h-full bg-gradient-to-br from-gray-50 to-blue-50 relative overflow-hidden font-sans">
            {/* Background Decor */}
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-orange-500 to-blue-600 z-10"></div>
            <div className="absolute -top-24 -right-24 w-96 h-96 bg-blue-400/10 rounded-full blur-3xl pointer-events-none"></div>
            <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-orange-400/10 rounded-full blur-3xl pointer-events-none"></div>

            <div className="flex w-full h-full p-8 z-20 gap-8">

                {/* Left Side - Saved Connections (V2 Glass Card) */}
                <div className="w-1/3 flex flex-col v2-card overflow-hidden transition-all duration-300 hover:shadow-[0_8px_30px_rgba(0,0,0,0.12)] bg-white/60">
                    <div className="p-4 border-b border-white/50 bg-white/40 backdrop-blur-md sticky top-0 z-10 flex items-center gap-3">
                        <div className="h-6 w-1 bg-orange-500 rounded-full"></div>
                        <h2 className="text-lg font-bold text-gray-700">Conexões Salvas</h2>
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-3 p-4 custom-scrollbar">
                        {savedConnections.length === 0 && (
                            <div className="text-center py-10 bg-white/50 rounded-xl border border-dashed border-gray-300">
                                <p className="text-gray-400 italic">Nenhuma conexão salva.</p>
                                <p className="text-xs text-gray-400 mt-1">Preencha o formulário para criar uma.</p>
                            </div>
                        )}
                        {savedConnections.map((conn, index) => (
                            <div
                                key={conn.id || index}
                                onClick={() => handleLoad(conn)}
                                className={`p-4 rounded-xl border cursor-pointer transition-all duration-300 group relative
                                    ${editingId === conn.id
                                        ? 'border-orange-400 bg-orange-50 shadow-md ring-1 ring-orange-200'
                                        : 'border-white/60 bg-white/40 hover:bg-white hover:border-blue-300 hover:shadow-md'
                                    }
                                `}
                            >
                                <div className="font-bold text-gray-800 flex items-center justify-between">
                                    <span className="truncate">{conn.connectionName || `Connection ${index + 1}`}</span>
                                    {conn.isDefault && <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold tracking-wider">PADRÃO</span>}
                                </div>
                                <div className="text-xs text-gray-500 mt-1 truncate">
                                    <span className="font-medium">{conn.user}@</span>
                                    {conn.isDefault ? '*****' : conn.connectString}
                                </div>

                                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex space-x-1">
                                    {!conn.isDefault && (
                                        <button
                                            onClick={(e) => handleEdit(conn, e)}
                                            className="p-1.5 text-blue-600 hover:bg-blue-100/80 rounded-lg transition-colors"
                                            title="Editar"
                                        >
                                            ✏️
                                        </button>
                                    )}
                                    <button
                                        onClick={(e) => handleDelete(conn.id, e, conn.isDefault)}
                                        className="p-1.5 text-red-600 hover:bg-red-100/80 rounded-lg transition-colors"
                                        title="Excluir"
                                    >
                                        🗑️
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="p-4 border-t border-white/50 bg-white/40">
                        <button
                            onClick={() => {
                                setIsEditing(false);
                                setEditingId(null);
                                setIsViewOnly(false);
                                setFormData({ user: '', password: '', connectString: 'localhost:1521/XEPDB1', connectionName: '' });
                                setStatus({ type: '', message: '' });
                            }}
                            className="w-full py-2.5 border-2 border-dashed border-gray-300 text-gray-500 rounded-xl hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50/50 transition-all font-bold flex items-center justify-center gap-2 group"
                        >
                            <span className="text-xl group-hover:scale-110 transition-transform">+</span> Nova Conexão
                        </button>
                    </div>
                </div>

                {/* Right Side - Form (V2 Glass Card) */}
                <div className="w-2/3 flex flex-col justify-center items-center">
                    <div className="v2-card w-full max-w-lg p-10 relative bg-white/80">
                        <div className="text-center mb-8">
                            <img src={hapLogo} alt="Hap Logo" className="h-28 mx-auto mb-6 drop-shadow-sm transition-transform hover:scale-105 duration-500" />
                            <h2 className="text-2xl font-bold text-gray-700">
                                {isEditing ? 'Editar Conexão' : 'Nova Conexão'}
                            </h2>
                            <p className="text-sm text-gray-400 mt-2">
                                {isEditing ? 'Atualize os dados da conexão.' : 'Insira as credenciais do banco Oracle.'}
                            </p>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1.5 ml-1">Nome da Conexão</label>
                                <input
                                    type="text"
                                    name="connectionName"
                                    value={formData.connectionName}
                                    onChange={handleChange}
                                    disabled={isViewOnly}
                                    className="v2-input w-full"
                                    placeholder="Ex: Produção, Homolog..."
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1.5 ml-1">Usuário</label>
                                    <input
                                        type="text"
                                        name="user"
                                        value={formData.user}
                                        onChange={handleChange}
                                        disabled={isViewOnly}
                                        className="v2-input w-full"
                                        placeholder="system"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1.5 ml-1">Senha</label>
                                    <div className="relative">
                                        <input
                                            type={showPassword ? "text" : "password"}
                                            name="password"
                                            value={formData.password}
                                            onChange={handleChange}
                                            disabled={isViewOnly}
                                            className="v2-input w-full pr-10"
                                            placeholder="••••••"
                                        />
                                        {!isViewOnly && (
                                            <button
                                                type="button"
                                                onClick={() => setShowPassword(!showPassword)}
                                                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                                            >
                                                {showPassword ? "🙈" : "👁️"}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1.5 ml-1">Host (Connect String)</label>
                                <input
                                    type={isViewOnly ? "password" : "text"}
                                    name="connectString"
                                    value={formData.connectString}
                                    onChange={handleChange}
                                    disabled={isViewOnly}
                                    className="v2-input w-full"
                                    placeholder="localhost:1521/XEPDB1"
                                />
                            </div>

                            {status.message && (
                                <div className={`p-3 rounded-xl text-sm font-medium flex items-center animate-fade-in-up ${status.type === 'error' ? 'bg-red-50 text-red-600 border border-red-100' :
                                    status.type === 'success' ? 'bg-green-50 text-green-600 border border-green-100' :
                                        'bg-blue-50 text-blue-600 border border-blue-100'
                                    }`}>
                                    {status.type === 'error' ? '⚠️' : status.type === 'success' ? '✅' : 'ℹ️'}
                                    <span className="ml-2">{status.message}</span>
                                </div>
                            )}

                            <div className="flex gap-3 pt-4">
                                <button
                                    onClick={handleTest}
                                    className="flex-1 py-3 bg-gray-100/80 hover:bg-white text-gray-600 hover:text-gray-800 rounded-xl font-bold border border-gray-200 transition-all hover:shadow-md"
                                >
                                    Testar
                                </button>
                                {!isViewOnly && (
                                    <button
                                        onClick={handleSave}
                                        className="flex-1 py-3 bg-white text-orange-600 hover:bg-orange-50 rounded-xl font-bold border border-orange-200 transition-all hover:shadow-md hover:border-orange-300"
                                    >
                                        {isEditing ? 'Atualizar' : 'Salvar'}
                                    </button>
                                )}
                                <button
                                    onClick={handleConnect}
                                    className="flex-1 py-3 v2-btn-primary rounded-xl font-bold shadow-lg hover:shadow-orange-500/30 text-white"
                                >
                                    Conectar
                                </button>
                            </div>

                            {isEditing && (
                                <button
                                    onClick={handleCancelEdit}
                                    className="w-full py-2 text-xs text-gray-400 hover:text-gray-600 transition-colors"
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

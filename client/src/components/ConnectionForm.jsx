import React, { useState, useEffect } from 'react';
import hapLogo from '../assets/hap_full_logo.jpg';
import CryptoJS from 'crypto-js';

const SECRET_KEY = 'hap-query-report-secret-key';

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

    const encryptPassword = (password) => {
        if (!password) return '';
        return CryptoJS.AES.encrypt(password, SECRET_KEY).toString();
    };

    const decryptPassword = (ciphertext) => {
        if (!ciphertext) return '';
        try {
            const bytes = CryptoJS.AES.decrypt(ciphertext, SECRET_KEY);
            const originalText = bytes.toString(CryptoJS.enc.Utf8);
            return originalText || ciphertext;
        } catch (e) {
            return ciphertext;
        }
    };

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
        // If default, we load it but maybe prevent editing sensitive fields in UI?
        // Actually, for defaults, we just want to connect.
        // But if user clicks, we populate the form.

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
        <div className="flex h-screen bg-gray-100 font-sans">
            {/* Left Side - Saved Connections */}
            <div className="w-1/3 bg-white border-r border-gray-200 p-6 flex flex-col shadow-lg z-10">
                <div className="flex flex-col items-center justify-center mb-4">
                    {/* Logo removed from here */}
                </div>
                <h2 className="text-lg font-bold text-gray-700 mb-4 px-2 border-l-4 border-[#f37021]">Conexões Salvas</h2>
                <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
                    {savedConnections.length === 0 && (
                        <div className="text-center py-10 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                            <p className="text-gray-400 italic">Nenhuma conexão salva.</p>
                            <p className="text-xs text-gray-400 mt-1">Preencha o formulário para criar uma.</p>
                        </div>
                    )}
                    {savedConnections.map((conn, index) => (
                        <div
                            key={conn.id || index}
                            onClick={() => handleLoad(conn)}
                            className={`p-4 rounded-lg border cursor-pointer transition-all hover:shadow-md group relative ${editingId === conn.id ? 'border-[#f37021] bg-orange-50' : 'border-gray-200 hover:border-blue-300 bg-white'
                                }`}
                        >
                            <div className="font-bold text-gray-800 flex items-center">
                                {conn.connectionName || `Connection ${index + 1}`}
                                {conn.isDefault && <span className="ml-2 text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded border border-blue-200">PADRÃO</span>}
                            </div>
                            <div className="text-sm text-gray-500">
                                {conn.user}@
                                {conn.isDefault ? '*****' : conn.connectString}
                            </div>

                            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex space-x-1">
                                {!conn.isDefault && (
                                    <button
                                        onClick={(e) => handleEdit(conn, e)}
                                        className="p-1.5 text-blue-600 hover:bg-blue-100 rounded transition-colors"
                                        title="Editar"
                                    >
                                        ✏️
                                    </button>
                                )}
                                <button
                                    onClick={(e) => handleDelete(conn.id, e, conn.isDefault)}
                                    className="p-1.5 text-red-600 hover:bg-red-100 rounded transition-colors"
                                    title="Excluir"
                                >
                                    🗑️
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
                <button
                    onClick={() => {
                        setIsEditing(false);
                        setEditingId(null);
                        setIsViewOnly(false);
                        setFormData({ user: '', password: '', connectString: 'localhost:1521/XEPDB1', connectionName: '' });
                        setStatus({ type: '', message: '' });
                    }}
                    className="mt-6 w-full py-3 border-2 border-dashed border-gray-300 text-gray-500 rounded-lg hover:border-[#0054a6] hover:text-[#0054a6] transition-all font-medium flex items-center justify-center gap-2"
                >
                    <span className="text-xl">+</span> Nova Conexão
                </button>
            </div>

            {/* Right Side - Form */}
            <div className="w-2/3 p-10 flex flex-col justify-center bg-gradient-to-br from-gray-50 to-blue-50">
                <div className="max-w-lg mx-auto w-full bg-white p-10 rounded-2xl shadow-xl border border-gray-100">
                    <div className="flex justify-center mb-6">
                        <img src={hapLogo} alt="Hap Logo" className="h-16 object-contain" />
                    </div>
                    <h2 className="text-3xl font-bold text-gray-800 mb-8 text-center">
                        {isEditing ? 'Editar Conexão' : 'Nova Conexão'}
                    </h2>

                    <div className="space-y-5">
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Nome da Conexão (Ex: DEV, PROD)</label>
                            <input
                                type="text"
                                name="connectionName"
                                value={formData.connectionName}
                                onChange={handleChange}
                                disabled={isViewOnly}
                                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0054a6] focus:border-transparent outline-none transition-all disabled:bg-gray-100 disabled:text-gray-500"
                                placeholder="Minha Conexão"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Usuário</label>
                            <input
                                type="text"
                                name="user"
                                value={formData.user}
                                onChange={handleChange}
                                disabled={isViewOnly}
                                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0054a6] focus:border-transparent outline-none transition-all disabled:bg-gray-100 disabled:text-gray-500"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Senha</label>
                            <div className="relative">
                                <input
                                    type={showPassword ? "text" : "password"}
                                    name="password"
                                    value={formData.password}
                                    onChange={handleChange}
                                    disabled={isViewOnly}
                                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0054a6] focus:border-transparent outline-none transition-all disabled:bg-gray-100 disabled:text-gray-500 pr-10"
                                />
                                {!isViewOnly && (
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700 focus:outline-none"
                                        title={showPassword ? "Ocultar senha" : "Mostrar senha"}
                                    >
                                        {showPassword ? (
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                                            </svg>
                                        ) : (
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                            </svg>
                                        )}
                                    </button>
                                )}
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Host (Connect String)</label>
                            <input
                                type={isViewOnly ? "password" : "text"}
                                name="connectString"
                                value={formData.connectString}
                                onChange={handleChange}
                                disabled={isViewOnly}
                                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0054a6] focus:border-transparent outline-none transition-all disabled:bg-gray-100 disabled:text-gray-500"
                                placeholder="localhost:1521/XEPDB1"
                            />
                        </div>

                        {status.message && (
                            <div className={`p-4 rounded-lg text-sm font-medium ${status.type === 'error' ? 'bg-red-50 text-red-700 border border-red-200' :
                                status.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' :
                                    'bg-blue-50 text-blue-700 border border-blue-200'
                                }`}>
                                {status.message}
                            </div>
                        )}

                        <div className="flex space-x-3 pt-6">
                            <button
                                onClick={handleTest}
                                className="flex-1 py-3 px-4 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-bold border border-gray-300"
                            >
                                Testar
                            </button>
                            {!isViewOnly && (
                                <button
                                    onClick={handleSave}
                                    className="flex-1 py-3 px-4 bg-[#f37021] text-white rounded-lg hover:bg-orange-600 transition-colors font-bold shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
                                >
                                    {isEditing ? 'Atualizar' : 'Salvar'}
                                </button>
                            )}
                            <button
                                onClick={handleConnect}
                                className="flex-1 py-3 px-4 bg-[#0054a6] text-white rounded-lg hover:bg-blue-800 transition-colors font-bold shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
                            >
                                Conectar
                            </button>
                        </div>
                        {isEditing && (
                            <button
                                onClick={handleCancelEdit}
                                className="w-full mt-2 text-sm text-gray-500 hover:text-gray-700 underline text-center block"
                            >
                                Cancelar Edição
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default ConnectionForm;

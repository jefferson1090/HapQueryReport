import React, { useState, useEffect } from 'react';
import hapLogo from '../assets/hap_full_logo.jpg';
import CryptoJS from 'crypto-js';

const SECRET_KEY = 'hap-query-report-secret-key'; // In a real app, this should be more secure

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

    useEffect(() => {
        const saved = localStorage.getItem('oracle_connections');
        if (saved) {
            try {
                setSavedConnections(JSON.parse(saved));
            } catch (e) {
                console.error("Failed to parse saved connections", e);
            }
        }
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
            return originalText || ciphertext; // Fallback to original if decryption yields empty (legacy plain text)
        } catch (e) {
            return ciphertext; // Fallback for legacy plain text
        }
    };

    const handleChange = (e) => {
        setFormData({
            ...formData,
            [e.target.name]: e.target.value
        });
    };

    const handleTest = async () => {
        setStatus({ type: 'info', message: 'Testing connection...' });
        try {
            const response = await fetch('http://localhost:3001/api/connect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            const data = await response.json();
            if (data.success) {
                setStatus({ type: 'success', message: 'Connection Successful!' });
            } else {
                setStatus({ type: 'error', message: 'Connection Failed: ' + data.message });
            }
        } catch (err) {
            setStatus({ type: 'error', message: 'Network Error: ' + err.message });
        }
    };

    const handleSave = () => {
        if (!formData.user || !formData.connectString || !formData.connectionName) {
            setStatus({ type: 'error', message: 'Please fill in Name, User and Host.' });
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
            setStatus({ type: 'success', message: 'Connection updated!' });
        } else {
            // Create new
            const newConn = { ...encryptedData, id: Date.now().toString() };
            newConnections = [...savedConnections, newConn];
            setStatus({ type: 'success', message: 'Connection saved!' });
        }

        setSavedConnections(newConnections);
        localStorage.setItem('oracle_connections', JSON.stringify(newConnections));
    };

    const handleLoad = (conn) => {
        setFormData({
            user: conn.user,
            password: decryptPassword(conn.password),
            connectString: conn.connectString,
            connectionName: conn.connectionName || ''
        });
        setStatus({ type: '', message: '' });
        setIsEditing(true);
        setEditingId(conn.id);
    };

    const handleEdit = (conn, e) => {
        e.stopPropagation(); // Prevent triggering handleLoad
        setFormData({
            user: conn.user,
            password: decryptPassword(conn.password),
            connectString: conn.connectString,
            connectionName: conn.connectionName || ''
        });
        setIsEditing(true);
        setEditingId(conn.id);
        setStatus({ type: 'info', message: `Editing: ${conn.connectionName}` });
    };

    const handleDelete = (id, e) => {
        e.stopPropagation();
        if (window.confirm('Are you sure you want to delete this connection?')) {
            const newConnections = savedConnections.filter(c => c.id !== id);
            setSavedConnections(newConnections);
            localStorage.setItem('oracle_connections', JSON.stringify(newConnections));
            if (editingId === id) {
                setIsEditing(false);
                setEditingId(null);
                setFormData({ user: '', password: '', connectString: 'localhost:1521/XEPDB1', connectionName: '' });
            }
        }
    };

    const handleConnect = async () => {
        setStatus({ type: 'info', message: 'Connecting...' });
        try {
            const response = await fetch('http://localhost:3001/api/connect', {
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
        setFormData({ user: '', password: '', connectString: 'localhost:1521/XEPDB1', connectionName: '' });
        setStatus({ type: '', message: '' });
    };

    return (
        <div className="flex h-screen bg-gray-100 font-sans">
            {/* Left Side - Saved Connections */}
            <div className="w-1/3 bg-white border-r border-gray-200 p-6 flex flex-col shadow-lg z-10">
                <div className="flex flex-col items-center justify-center mb-8">
                    <img src={hapLogo} alt="Hap Logo" className="h-24 object-contain mb-4" />
                    <h1 className="text-2xl font-bold text-[#0054a6] tracking-tight">Hap Query Report</h1>
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
                            <div className="font-bold text-gray-800">{conn.connectionName || `Connection ${index + 1}`}</div>
                            <div className="text-sm text-gray-500">{conn.user}@{conn.connectString}</div>

                            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex space-x-1">
                                <button
                                    onClick={(e) => handleEdit(conn, e)}
                                    className="p-1.5 text-blue-600 hover:bg-blue-100 rounded transition-colors"
                                    title="Editar"
                                >
                                    ✏️
                                </button>
                                <button
                                    onClick={(e) => handleDelete(conn.id, e)}
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
                                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0054a6] focus:border-transparent outline-none transition-all"
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
                                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0054a6] focus:border-transparent outline-none transition-all"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Senha</label>
                            <input
                                type="password"
                                name="password"
                                value={formData.password}
                                onChange={handleChange}
                                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0054a6] focus:border-transparent outline-none transition-all"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Host (Connect String)</label>
                            <input
                                type="text"
                                name="connectString"
                                value={formData.connectString}
                                onChange={handleChange}
                                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0054a6] focus:border-transparent outline-none transition-all"
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
                            <button
                                onClick={handleSave}
                                className="flex-1 py-3 px-4 bg-[#f37021] text-white rounded-lg hover:bg-orange-600 transition-colors font-bold shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
                            >
                                {isEditing ? 'Atualizar' : 'Salvar'}
                            </button>
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

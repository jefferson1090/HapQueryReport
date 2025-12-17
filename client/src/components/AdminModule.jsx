import React, { useState, useEffect } from 'react';
import { useApi } from '../context/ApiContext';
import { Shield, Database, Users, AlertTriangle, Check, X, RefreshCw } from 'lucide-react';

const AdminModule = ({ isVisible, onClose }) => {
    const { apiUrl } = useApi();
    const [globalMemory, setGlobalMemory] = useState([]);
    const [loading, setLoading] = useState(false);
    const [config, setConfig] = useState({});
    const [activeTab, setActiveTab] = useState('memory'); // memory, config, logs

    useEffect(() => {
        if (isVisible) {
            fetchData();
        }
    }, [isVisible]);

    const fetchData = async () => {
        setLoading(true);
        try {
            // Fetch Global Memory
            const res = await fetch(`${apiUrl}/api/ai/admin/memory`);
            const data = await res.json();
            if (Array.isArray(data)) setGlobalMemory(data);

            // Fetch Config
            const resConfig = await fetch(`${apiUrl}/api/ai/admin/config`);
            const dataConfig = await resConfig.json();
            setConfig(dataConfig || {});
        } catch (e) {
            console.error("Admin fetch error:", e);
        } finally {
            setLoading(false);
        }
    };

    const handleAction = async (id, action) => {
        // action: 'APPROVE', 'REJECT'
        try {
            await fetch(`${apiUrl}/api/ai/admin/memory/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ validation_status: action === 'APPROVE' ? 'VERIFIED' : 'REJECTED' })
            });
            fetchData(); // Refresh
        } catch (e) {
            alert("Action failed");
        }
    };

    const handleForceReset = async () => {
        if (!confirm("Isso apagará a memória LOCAL de todos os usuários no próximo sync. Tem certeza?")) return;
        try {
            await fetch(`${apiUrl}/api/ai/admin/config`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: 'force_reset_flag', value: 'true' })
            });
            alert("Kill Switch Ativado.");
            fetchData();
        } catch (e) {
            alert("Falha ao ativar Kill Switch");
        }
    };

    if (!isVisible) return null;

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[80vh] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="bg-slate-900 p-6 flex justify-between items-center text-white">
                    <div className="flex items-center gap-3">
                        <Shield className="text-emerald-400" size={32} />
                        <div>
                            <h2 className="text-xl font-bold">Hive Mind Control Tower</h2>
                            <p className="text-slate-400 text-sm">Gestão de Conhecimento Global</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full">
                        <X size={24} />
                    </button>
                </div>

                {/* Toolbar */}
                <div className="bg-slate-100 p-4 border-b flex justify-between items-center">
                    <div className="flex gap-4">
                        <button
                            onClick={() => setActiveTab('memory')}
                            className={`px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 ${activeTab === 'memory' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border'}`}
                        >
                            <Database size={16} /> Memória ({globalMemory.length})
                        </button>
                        <button
                            onClick={() => setActiveTab('config')}
                            className={`px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 ${activeTab === 'config' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border'}`}
                        >
                            <AlertTriangle size={16} /> Governança
                        </button>
                    </div>
                    <button onClick={fetchData} className="p-2 bg-white border rounded hover:bg-gray-50 text-gray-600">
                        <RefreshCw size={20} className={loading ? "animate-spin" : ""} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-auto bg-gray-50 p-6">
                    {activeTab === 'memory' && (
                        <div className="space-y-4">
                            {/* Inbox / Pending */}
                            <div className="bg-white p-6 rounded-xl shadow-sm border border-orange-100">
                                <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                                    <div className="w-3 h-3 rounded-full bg-orange-400 animate-pulse" />
                                    Inbox de Aprendizado (Pendentes)
                                </h3>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm text-left">
                                        <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b">
                                            <tr>
                                                <th className="px-4 py-3">Termo</th>
                                                <th className="px-4 py-3">Sugestão (Target)</th>
                                                <th className="px-4 py-3">Origem</th>
                                                <th className="px-4 py-3">Autor</th>
                                                <th className="px-4 py-3 text-right">Ação</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {globalMemory.filter(m => m.validation_status === 'PENDING').map(item => (
                                                <tr key={item.id} className="border-b hover:bg-gray-50">
                                                    <td className="px-4 py-3 font-bold text-blue-700">{item.term}</td>
                                                    <td className="px-4 py-3 font-mono bg-gray-50 rounded text-gray-700">{item.target}</td>
                                                    <td className="px-4 py-3">
                                                        <span className={`px-2 py-1 rounded text-xs font-bold ${item.source_type === 'MANUAL_OVERRIDE' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'
                                                            }`}>
                                                            {item.source_type}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 text-gray-500">{item.created_by || 'Anon'}</td>
                                                    <td className="px-4 py-3 text-right flex justify-end gap-2">
                                                        <button
                                                            onClick={() => handleAction(item.id, 'APPROVE')}
                                                            className="p-1 bg-emerald-100 text-emerald-700 rounded hover:bg-emerald-200" title="Aprovar (Tornar Oficial)">
                                                            <Check size={18} />
                                                        </button>
                                                        <button
                                                            onClick={() => handleAction(item.id, 'REJECT')}
                                                            className="p-1 bg-red-100 text-red-700 rounded hover:bg-red-200" title="Rejeitar">
                                                            <X size={18} />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                            {globalMemory.filter(m => m.validation_status === 'PENDING').length === 0 && (
                                                <tr>
                                                    <td colSpan="5" className="px-4 py-8 text-center text-gray-400 italic">
                                                        Nenhuma sugestão pendente na fila.
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Verified Knowledge */}
                            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 opacity-80">
                                <h3 className="font-bold text-gray-600 mb-4 flex items-center gap-2">
                                    <Check size={16} className="text-emerald-500" />
                                    Conhecimento Consolidado (Base Oficial)
                                </h3>
                                <table className="w-full text-sm text-left">
                                    <thead className="text-xs text-gray-400 uppercase bg-gray-50 border-b">
                                        <tr>
                                            <th className="px-4 py-2">Termo</th>
                                            <th className="px-4 py-2">Target</th>
                                            <th className="px-4 py-2">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="text-gray-500">
                                        {globalMemory.filter(m => m.validation_status === 'VERIFIED').map(item => (
                                            <tr key={item.id} className="border-b">
                                                <td className="px-4 py-2">{item.term}</td>
                                                <td className="px-4 py-2 font-mono">{item.target}</td>
                                                <td className="px-4 py-2 text-emerald-600 font-bold text-xs">VERIFICADO</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {activeTab === 'config' && (
                        <div className="space-y-6">
                            <div className="bg-red-50 p-6 rounded-xl border border-red-200">
                                <h3 className="font-bold text-red-800 text-lg mb-2 flex items-center gap-2">
                                    <AlertTriangle />
                                    Zona de Perigo (Governança)
                                </h3>
                                <p className="text-red-700 mb-6">
                                    Ações aqui afetam <strong>todos</strong> os usuários da aplicação na próxima sincronização.
                                </p>

                                <div className="grid gap-6">
                                    <div className="bg-white p-4 rounded-lg border border-red-100 flex justify-between items-center">
                                        <div>
                                            <h4 className="font-bold text-gray-800">Kill Switch (Reset Forçado)</h4>
                                            <p className="text-sm text-gray-500">
                                                Força todos os clientes a apagarem a memória local e baixarem a versão oficial limpa.
                                                Use em caso de contaminação massiva (alucinação generalizada).
                                            </p>
                                        </div>
                                        <button
                                            onClick={handleForceReset}
                                            className="px-4 py-2 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 shadow-lg"
                                        >
                                            ATIVAR RESET GLOBAL
                                        </button>
                                    </div>

                                    <div className="bg-white p-4 rounded-lg border border-gray-200 flex justify-between items-center">
                                        <div>
                                            <h4 className="font-bold text-gray-800">Versão Mínima da KB</h4>
                                            <p className="text-sm text-gray-500">
                                                Versão Atual Exigida: <span className="font-mono bg-gray-100 px-2 rounded">v{config.min_kb_version || '0.0.0'}</span>
                                            </p>
                                        </div>
                                        <button className="px-4 py-2 bg-gray-800 text-white font-bold rounded-lg hover:bg-gray-900">
                                            Atualizar Versão
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AdminModule;

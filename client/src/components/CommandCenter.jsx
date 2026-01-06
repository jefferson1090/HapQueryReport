import React, { useState, useEffect } from 'react';
import {
    LayoutGrid, Database, BarChart2, Clock, Search, Plus,
    Filter, ArrowRight, Settings, FileText, Bot,
    MessageSquare, Table as TableIcon, Zap, PlusCircle
} from 'lucide-react';

const CommandCenter = ({ onNavigate, userName = 'Usuário', recentActivity = [] }) => {

    // Mock Recent Activity if empty (for visualization)
    const activities = recentActivity.length > 0 ? recentActivity : [
        { id: 1, type: 'dashboard', name: 'Relatório Vendas Mensal', date: '2025-01-05T10:00:00', status: 'Ativo' },
        { id: 2, type: 'extraction', name: 'Extração Clientes VIP', date: '2025-01-04T15:30:00', status: 'Concluído' },
        { id: 3, type: 'sql', name: 'Query Análise Churn', date: '2025-01-03T09:15:00', status: 'Draft' },
    ];

    const getIcon = (type) => {
        switch (type) {
            case 'dashboard': return <BarChart2 size={16} className="text-blue-500" />;
            case 'extraction': return <Database size={16} className="text-purple-500" />;
            case 'sql': return <FileText size={16} className="text-orange-500" />;
            default: return <Clock size={16} className="text-gray-400" />;
        }
    };

    return (
        <div className="flex h-full w-full bg-gray-50/50">

            {/* MAIN CONTENT */}
            <div className="flex-1 flex flex-col overflow-hidden">
                <div className="flex-1 overflow-y-auto p-8">

                    {/* WELCOME SECTION */}
                    <div className="mb-6">
                        <h1 className="text-2xl font-bold text-gray-800 mb-1">Olá, {userName}</h1>
                        <p className="text-gray-500 text-sm">O que você gostaria de criar hoje?</p>
                    </div>

                    {/* QUICK ACTIONS */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-10 w-full">
                        {/* Legacy Actions */}
                        <ActionCard
                            title="Criar Tabela"
                            desc="Importar/Criar tabela"
                            icon={<PlusCircle size={24} className="text-white" />}
                            color="bg-gradient-to-br from-green-500 to-green-600"
                            onClick={() => onNavigate('carga_input')}
                        />
                        <ActionCard
                            title="Localizar Tabela"
                            desc="Buscar tabelas"
                            icon={<Search size={24} className="text-white" />}
                            color="bg-gradient-to-br from-blue-500 to-blue-600"
                            onClick={() => onNavigate('db_search')}
                        />
                        <ActionCard
                            title="Exibir Estrutura"
                            desc="Ver colunas"
                            icon={<TableIcon size={24} className="text-white" />}
                            color="bg-gradient-to-br from-purple-500 to-purple-600"
                            onClick={() => onNavigate('db_structure')}
                        />
                        {/* NEW: Ver Dados */}
                        <ActionCard
                            title="Ver Dados"
                            desc="Explorar registros"
                            icon={<Database size={24} className="text-white" />}
                            color="bg-gradient-to-br from-cyan-500 to-cyan-600"
                            onClick={() => onNavigate('db_data')}
                        />
                        {/* NEW: Buscar Registro */}
                        <ActionCard
                            title="Buscar Registro"
                            desc="Encontrar dados"
                            icon={<Filter size={24} className="text-white" />}
                            color="bg-gradient-to-br from-orange-500 to-orange-600"
                            onClick={() => onNavigate('db_find')}
                        />

                        {/* Existing High Value Actions */}
                        <ActionCard
                            title="Nova Extração"
                            desc="Extrair dados via SQL"
                            icon={<Database size={24} className="text-white" />}
                            color="bg-gradient-to-br from-indigo-500 to-indigo-600"
                            onClick={() => onNavigate('extraction')}
                        />
                        <ActionCard
                            title="Criar Painel"
                            desc="Visualizar métricas"
                            icon={<BarChart2 size={24} className="text-white" />}
                            color="bg-gradient-to-br from-pink-500 to-pink-600"
                            onClick={() => onNavigate('dashboard_selection')}
                        />
                        <ActionCard
                            title="Editor SQL"
                            desc="Executar SQL"
                            icon={<FileText size={24} className="text-white" />}
                            color="bg-gradient-to-br from-gray-700 to-gray-800"
                            onClick={() => onNavigate('sql-runner')}
                        />
                    </div>

                    {/* RECENT ACTIVITY */}
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                            <h3 className="font-bold text-gray-800 flex items-center gap-2">
                                <Clock size={18} className="text-gray-400" />
                                Atividade Recente
                            </h3>
                            <button className="text-sm text-blue-600 font-bold hover:underline">Ver tudo</button>
                        </div>
                        <div className="divide-y divide-gray-50">
                            {activities.map((item) => (
                                <div key={item.id} className="p-4 hover:bg-gray-50 transition-colors flex items-center justify-between group cursor-pointer">
                                    <div className="flex items-center gap-4">
                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center bg-gray-50 group-hover:bg-white border border-gray-100`}>
                                            {getIcon(item.type)}
                                        </div>
                                        <div>
                                            <p className="font-medium text-gray-800 text-sm">{item.name}</p>
                                            <p className="text-xs text-gray-400">{item.type.toUpperCase()} • {new Date(item.date).toLocaleDateString()}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <span className={`px-2 py-1 rounded-full text-[10px] font-bold 
                                            ${item.status === 'Ativo' ? 'bg-green-50 text-green-600' :
                                                item.status === 'Draft' ? 'bg-gray-100 text-gray-500' : 'bg-blue-50 text-blue-600'}`}>
                                            {item.status}
                                        </span>
                                        <button className="text-gray-300 hover:text-blue-600">
                                            <ArrowRight size={18} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
};

// Sub-components
const NavItem = ({ icon, label, active, onClick }) => (
    <button
        onClick={onClick}
        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all font-medium text-sm
        ${active
                ? 'bg-blue-50 text-blue-700 font-bold'
                : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'}`
        }>
        {icon}
        {label}
    </button>
);

const ActionCard = ({ title, desc, icon, color, onClick }) => {
    // Helper to safely render icon
    const renderIcon = () => {
        if (!icon) return null;
        if (React.isValidElement(icon)) return icon;
        if (typeof icon === 'string') return <span className="text-2xl">{icon}</span>;
        // If it's a component function/class
        if (typeof icon === 'function') {
            const IconComp = icon;
            return <IconComp size={24} className="text-white" />;
        }
        // Fallback for objects that might be serialized elements (Error #31 prevention)
        console.warn('ActionCard: Invalid icon type received', icon);
        return <span className="text-2xl">?</span>;
    };

    return (
        <button
            onClick={onClick}
            className={`relative overflow-hidden rounded-2xl p-6 text-left transition-all hover:shadow-lg hover:-translate-y-1 group ${color}`}
        >
            <div className="relative z-10 flex flex-col h-full text-white">
                <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center mb-4 text-white group-hover:scale-110 transition-transform">
                    {renderIcon()}
                </div>
                <h3 className="text-lg font-bold mb-1">{typeof title === 'string' ? title : 'Sem Título'}</h3>
                <p className="text-white/80 text-xs leading-relaxed">{typeof desc === 'string' ? desc : ''}</p>
            </div>

            {/* Decoration */}
            <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 bg-white/10 rounded-full blur-2xl group-hover:bg-white/20 transition-colors"></div>
        </button>
    );
};

export default CommandCenter;

import React, { useState, useEffect } from 'react';
import { X, Save, User, Lock, Type, Image as ImageIcon, Check } from 'lucide-react';

const AVATARS = [
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Aneka',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Mark',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Sasha',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Oliver',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Bella',
    'https://api.dicebear.com/7.x/bottts/svg?seed=Orbit',
    'https://api.dicebear.com/7.x/bottts/svg?seed=Pixel',
];

const FONTS = [
    { name: 'Padrão (Sans)', value: 'font-sans' },
    { name: 'Serifa (Serif)', value: 'font-serif' },
    { name: 'Monospaced', value: 'font-mono' },
    { name: 'Roboto', value: 'font-roboto' }, // Assumption: These classes exist or will be mapped
    { name: 'Open Sans', value: 'font-opensans' },
];

const SIZES = [
    { name: 'Pequeno', value: 'text-sm' },
    { name: 'Normal', value: 'text-base' },
    { name: 'Grande', value: 'text-lg' },
    { name: 'Extra G.', value: 'text-xl' },
];

const SettingsModal = ({ isOpen, onClose, user, onSave, initialSettings }) => {
    const [activeTab, setActiveTab] = useState('profile');
    const [formData, setFormData] = useState({
        username: '',
        avatar: '',
        fontFamily: 'font-sans',
        fontSize: 'text-base',
        password: '',
        confirmPassword: ''
    });

    useEffect(() => {
        if (isOpen && user) {
            setFormData({
                username: user.username || '',
                avatar: user.avatar || AVATARS[0],
                fontFamily: initialSettings?.fontFamily || 'font-sans',
                fontSize: initialSettings?.fontSize || 'text-base',
                password: '',
                confirmPassword: ''
            });
        }
    }, [isOpen, user, initialSettings]);

    if (!isOpen) return null;

    const handleSave = () => {
        if (formData.password && formData.password !== formData.confirmPassword) {
            alert('As senhas não conferem!');
            return;
        }
        onSave(formData);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">

                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                    <h2 className="text-xl font-bold text-gray-800">Configurações</h2>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:bg-gray-100 rounded-full transition">
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 flex overflow-hidden">
                    {/* Sidebar */}
                    <div className="w-48 bg-gray-50 border-r border-gray-100 p-4 flex flex-col gap-2">
                        <button
                            onClick={() => setActiveTab('profile')}
                            className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${activeTab === 'profile' ? 'bg-blue-100 text-blue-600' : 'text-gray-500 hover:bg-white hover:shadow-sm'}`}
                        >
                            <User size={18} /> Perfil
                        </button>
                        <button
                            onClick={() => setActiveTab('appearance')}
                            className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${activeTab === 'appearance' ? 'bg-blue-100 text-blue-600' : 'text-gray-500 hover:bg-white hover:shadow-sm'}`}
                        >
                            <Type size={18} /> Aparência
                        </button>
                    </div>

                    {/* Content */}
                    <div className="flex-1 p-6 overflow-y-auto">

                        {/* PROFILE TAB */}
                        {activeTab === 'profile' && (
                            <div className="flex flex-col gap-6">
                                {/* Avatar Selection */}
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-3">Avatar</label>
                                    <div className="flex items-start gap-4">
                                        <div className="w-20 h-20 rounded-full border-2 border-blue-100 overflow-hidden bg-gray-50">
                                            <img src={formData.avatar} alt="Current" className="w-full h-full object-cover" />
                                        </div>
                                        <div className="flex-1">
                                            <div className="grid grid-cols-4 gap-2 mb-3">
                                                {AVATARS.map((avat, idx) => (
                                                    <button
                                                        key={idx}
                                                        onClick={() => setFormData({ ...formData, avatar: avat })}
                                                        className={`w-10 h-10 rounded-full overflow-hidden border-2 transition-all ${formData.avatar === avat ? 'border-blue-500 scale-110 shadow-md' : 'border-transparent hover:border-gray-200'}`}
                                                    >
                                                        <img src={avat} alt={`Avatar ${idx}`} className="w-full h-full" />
                                                    </button>
                                                ))}
                                            </div>
                                            <div className="relative">
                                                <input
                                                    type="text"
                                                    placeholder="Ou cole uma URL de imagem..."
                                                    value={formData.avatar}
                                                    onChange={e => setFormData({ ...formData, avatar: e.target.value })}
                                                    className="w-full text-xs p-2 border border-gray-200 rounded-lg outline-none focus:border-blue-400"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Name */}
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-2">Nome de Exibição</label>
                                    <input
                                        type="text"
                                        value={formData.username}
                                        onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                                        className="w-full p-3 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all font-medium"
                                    />
                                </div>

                                {/* Password (Mock) */}
                                <div className="p-4 bg-orange-50 border border-orange-100 rounded-xl">
                                    <div className="flex items-center gap-2 text-orange-600 font-bold text-sm mb-3">
                                        <Lock size={16} /> Alterar Senha
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <input
                                            type="password"
                                            placeholder="Nova Senha"
                                            value={formData.password}
                                            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                            className="w-full p-2 text-sm border border-orange-200 rounded-lg outline-none focus:border-orange-400 bg-white"
                                        />
                                        <input
                                            type="password"
                                            placeholder="Confirmar Senha"
                                            value={formData.confirmPassword}
                                            onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                                            className="w-full p-2 text-sm border border-orange-200 rounded-lg outline-none focus:border-orange-400 bg-white"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* APPEARANCE TAB */}
                        {activeTab === 'appearance' && (
                            <div className="flex flex-col gap-6">
                                {/* Font Family */}
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-3">Estilo da Fonte</label>
                                    <div className="grid grid-cols-2 gap-3">
                                        {FONTS.map(font => (
                                            <button
                                                key={font.value}
                                                onClick={() => setFormData({ ...formData, fontFamily: font.value })}
                                                className={`
                                                    p-3 border rounded-xl text-left transition-all flex justify-between items-center
                                                    ${formData.fontFamily === font.value
                                                        ? 'border-blue-500 bg-blue-50 text-blue-700 ring-1 ring-blue-500'
                                                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                                                    }
                                                `}
                                            >
                                                <span className={`${font.value} text-sm`}>Aa - {font.name}</span>
                                                {formData.fontFamily === font.value && <Check size={16} />}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Font Size */}
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-3">Tamanho do Texto</label>
                                    <div className="flex items-center gap-4 bg-gray-50 p-4 rounded-xl border border-gray-100">
                                        <span className="text-xs font-bold text-gray-500">A</span>
                                        <input
                                            type="range"
                                            min="0"
                                            max="3"
                                            step="1"
                                            value={SIZES.findIndex(s => s.value === formData.fontSize)}
                                            onChange={(e) => setFormData({ ...formData, fontSize: SIZES[e.target.value].value })}
                                            className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                                        />
                                        <span className="text-xl font-bold text-gray-800">A</span>
                                    </div>
                                    <p className="mt-2 text-center text-sm font-medium text-blue-600">
                                        {SIZES.find(s => s.value === formData.fontSize)?.name}
                                    </p>
                                </div>

                                {/* Preview */}
                                <div className="mt-4 p-4 border border-gray-100 rounded-xl bg-gray-50">
                                    <p className="text-xs text-gray-400 font-bold uppercase mb-2">Preview</p>
                                    <div className={`bg-white p-4 rounded-lg border border-gray-200 shadow-sm ${formData.fontFamily} ${formData.fontSize}`}>
                                        <p className="font-bold text-gray-800 mb-1">Olá, {formData.username || 'Usuário'}</p>
                                        <p className="text-gray-600">Este é um exemplo de como o texto ficará na aplicação.</p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-200 rounded-lg transition"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSave}
                        className="px-6 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-lg shadow-blue-200 transition flex items-center gap-2"
                    >
                        <Save size={16} /> Salvar Alterações
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SettingsModal;

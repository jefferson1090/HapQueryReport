import React, { useState, useRef, useEffect } from 'react';
import {
    MessageSquare, Database, Bot, FileInput, Calendar, FolderOpen, FileSpreadsheet,
    Settings, Layout, ArrowLeft, ArrowDown, ArrowUp, ArrowRight, Cloud, RefreshCw, LogOut, Check, Sparkles, Search
} from 'lucide-react';
// import BackupMenu from './BackupMenu';

const Navigation = ({
    activeTab,
    onTabChange,
    position = 'left', // 'top' | 'bottom' | 'left'
    onPositionChange,
    onBackup,
    onRestore,
    connection,
    connectionBadgeExpanded,
    setConnectionBadgeExpanded,
    showConnectionSwitcher,
    setShowConnectionSwitcher,
    dropdownRef,
    handleQuickSwitch,
    savedConnections,
    handleDisconnect,
    theme,
    user,
    onLogout,
    onOpenSettings,
    updateStatus,
    updateInfo,
    currentVersion,
    onCheckUpdates,
    lastBackup,
    onForceBackup,
    isBackingUp,
    autoBackupEnabled,
    toggleAutoBackup
}) => {

    const isVertical = position === 'left';
    const [isHovered, setIsHovered] = useState(false); // Track hover for scrollbar logic

    // Tabs Configuration
    // Grouped Configuration
    const tabGroups = [
        {
            title: 'AI Studio',
            items: [
                { id: 'query-builder', icon: Bot, label: 'Construtor AI', color: 'text-violet-600' },
                { id: 'team-chat', icon: MessageSquare, label: 'Chat', color: 'text-indigo-600' },
            ]
        },
        {
            title: 'Dados',
            items: [
                { id: 'sql-runner', icon: Database, label: 'Editor SQL', color: 'text-blue-600' },
                { id: 'data-processor', icon: FileSpreadsheet, label: 'Tratar Dados', color: 'text-teal-600' },
                { id: 'csv-importer', icon: FileInput, label: 'Importar CSV', color: 'text-emerald-600' },
            ]
        },
        {
            title: 'Conhecimento',
            items: [
                { id: 'docs', icon: FolderOpen, label: 'Docs', color: 'text-slate-600' },
                { id: 'reminders', icon: Calendar, label: 'Lembretes', color: 'text-amber-600' },
            ]
        }
    ];

    // ... (ThreeDIcon and NavItem definitions kept similar but cleaner) ...

    const ThreeDIcon = ({ Icon, color, isActive }) => {
        const getShadowColor = () => {
            if (color.includes('indigo')) return 'shadow-indigo-200 border-indigo-100';
            if (color.includes('blue')) return 'shadow-blue-200 border-blue-100';
            if (color.includes('violet')) return 'shadow-violet-200 border-violet-100';
            if (color.includes('emerald')) return 'shadow-emerald-200 border-emerald-100';
            if (color.includes('amber')) return 'shadow-amber-200 border-amber-100';
            if (color.includes('teal')) return 'shadow-teal-200 border-teal-100';
            return 'shadow-gray-200 border-gray-100';
        };
        const shadowClass = getShadowColor();
        return (
            <div className={`
                relative flex items-center justify-center
                w-10 h-10 rounded-full transition-all duration-300
                bg-gradient-to-b from-white to-gray-50
                border border-white
                shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1),0_2px_4px_-1px_rgba(0,0,0,0.06),inset_0_-2px_4px_rgba(0,0,0,0.05)]
                ${isActive ? 'scale-110 shadow-[0_10px_15px_-3px_rgba(0,0,0,0.1),0_4px_6px_-2px_rgba(0,0,0,0.05)]' : 'hover:scale-105'}
            `}>
                <div className={`absolute inset-0 rounded-full border-2 ${shadowClass} opacity-50`}></div>
                <Icon size={20} className={`z-10 transition-all duration-300 ${isActive ? 'text-gray-900 drop-shadow-sm' : color}`} />
            </div>
        );
    };

    const NavItem = ({ tab }) => {
        const isActive = activeTab === tab.id;
        return (
            <button
                onClick={() => onTabChange(tab.id)}
                title={tab.label}
                className={`
                    group relative flex items-center justify-start transition-all duration-300 ease-out
                    ${isActive ? 'bg-transparent' : 'bg-transparent'}
                    ${isVertical
                        ? 'w-full mb-2 h-12 px-3'
                        : 'h-12 px-3 rounded-lg mr-2 overflow-hidden'
                    }
                    ${!isVertical
                        ? (isActive ? 'max-w-[200px]' : 'max-w-[56px] hover:max-w-[200px]')
                        : ''
                    }
                `}
            >
                {isVertical && (
                    <div className={`
                        absolute left-0 w-1.5 bg-blue-500 rounded-r-md shadow-sm
                        top-1/2 -translate-y-1/2 transition-all duration-300 ease-out
                        ${isActive ? 'h-8 opacity-100' : 'h-0 opacity-0'}
                    `}></div>
                )}

                <div className="flex-shrink-0 z-10">
                    <ThreeDIcon Icon={tab.icon} color={tab.color} isActive={isActive} />
                </div>

                <span className={`
                    whitespace-nowrap overflow-hidden transition-all duration-300 text-sm font-bold text-gray-700
                    ${isVertical
                        ? (isActive ? 'opacity-100 max-w-[150px] ml-4' : 'opacity-0 max-w-0 group-hover:opacity-100 group-hover:max-w-[150px] group-hover:ml-4')
                        : (isActive ? 'opacity-100 ml-3' : 'opacity-0 ml-0 group-hover:opacity-100 group-hover:ml-3')
                    }
                `}>
                    {tab.label}
                </span>
            </button>
        );
    };

    // --- Corner Pivot Animation State Machine ---
    const [animState, setAnimState] = useState('idle'); // 'idle' | 'retracting' | 'travel-up' | 'collapsing' | 'expanding'
    const [animClass, setAnimClass] = useState('');
    const [targetPos, setTargetPos] = useState(null);
    const [cycleDir, setCycleDir] = useState('down'); // 'down' (Top->L->Bot) or 'up' (Bot->L->Top)

    const handlePositionChange = (nextPos) => {
        if (animState !== 'idle') return;
        setTargetPos(nextPos);

        // --- SCENARIO 1: TOP -> LEFT (Pivot TL) ---
        if (position === 'top' && nextPos === 'left') {
            setAnimState('collapsing');
            setAnimClass('!w-[80px] origin-left rounded-br-[40px] overflow-hidden justify-center !pl-0');
            setTimeout(() => finishTransition(nextPos), 500);
        }

        // --- SCENARIO 2: LEFT -> BOTTOM (Fluid Drop to BL) ---
        else if (position === 'left' && nextPos === 'bottom') {
            // Concurrent Morph: Width shrinks AND Height collapses/drops simultaneously
            setAnimState('collapsing');
            setAnimClass('!w-20 !h-[80px] relative !top-[calc(100%-80px)] origin-bottom-left rounded-tr-[40px] overflow-hidden justify-center !p-0');
            setTimeout(() => finishTransition(nextPos), 500);
        }

        // --- SCENARIO 3: BOTTOM -> LEFT (Collapse BL -> Travel Up -> Pivot TL) ---
        else if (position === 'bottom' && nextPos === 'left') {
            // 1. Collapse Width (into BL)
            setAnimState('collapsing');
            setAnimClass('!w-[80px] origin-left rounded-tr-[40px] overflow-hidden justify-center !pl-0');

            setTimeout(() => {
                // 2. Travel UP (BL -> TL)
                setAnimState('travel-up');
                setAnimClass('!w-[80px] !h-[80px] !rounded-full !absolute !left-0 !bottom-[calc(100%-80px)] transition-all duration-500 ease-in-out z-[60]');

                setTimeout(() => finishTransition(nextPos), 500);
            }, 500);
        }

        // --- SCENARIO 4: LEFT -> TOP (Fluid Rise to TL) ---
        else if (position === 'left' && nextPos === 'top') {
            // Concurrent Morph: Width shrinks AND Height rises simultaneously
            setAnimState('collapsing');
            setAnimClass('!w-20 !h-[80px] origin-top-left rounded-br-[40px] overflow-hidden justify-center !p-0');
            setTimeout(() => finishTransition(nextPos), 500);
        }

        else {
            onPositionChange(nextPos);
        }
    };

    const finishTransition = (nextPos) => {
        onPositionChange(nextPos);
        setTargetPos(null);

        // EXPAND PHASE
        setAnimState('expanding');
        let expandClass = 'overflow-hidden !p-0 justify-center transition-all duration-500 ease-[cubic-bezier(0.76,0,0.24,1)] ';

        if (position === 'top' && nextPos === 'left') {
            expandClass += '!h-[80px] origin-top rounded-b-[40px]';
        }
        else if (position === 'left' && nextPos === 'bottom') {
            expandClass += '!w-[80px] origin-left rounded-r-[40px]';
        }
        else if (position === 'bottom' && nextPos === 'left') {
            expandClass += '!h-[80px] origin-top rounded-b-[40px]';
        }
        else if (position === 'left' && nextPos === 'top') {
            expandClass += '!w-[80px] origin-left rounded-r-[40px]';
        }

        setAnimClass(expandClass);

        requestAnimationFrame(() => {
            setTimeout(() => {
                setAnimClass('');
                setTimeout(() => {
                    setAnimState('idle');
                }, 500);
            }, 50);
        });
    };

    const isAnim = animState !== 'idle';
    // HIDE Content: Hide if animating OR if not hovered (fluid fix? no, keep content visible if hovered)
    // Actually standard rule: Hide content during morphological changes to avoid overflow glitches.
    const contentHide = isAnim;

    // SCROLLBAR FIX: Check if we are in minimized Left Vertical state and NOT hovered
    const shouldHideScrollbar = isVertical && !isHovered && !isAnim; // If not hovered and vertical, hide scrollbar. 
    // Wait, if !isHovered, width is 20. Content is hidden or just icons. Icons might overflow?
    // Let's force overflow-hidden on the inner container if !isHovered.

    // Helper for dropdown positioning
    const getDropdownPositionClass = (isUserMenu = false) => {
        if (position === 'top') return `top-full ${isUserMenu ? 'right-0' : 'left-0'} mt-2`;
        if (position === 'left') return 'left-full bottom-0 ml-2';
        if (position === 'bottom') return `bottom-full ${isUserMenu ? 'right-0' : 'left-0'} mb-2`;
        return 'bottom-full left-0 mb-2'; // Default
    };

    return (
        <nav
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            className={`
            group bg-white border-gray-200 shadow-sm z-50 transition-all duration-500 ease-in-out
            flex ${isVertical ? 'flex-col w-20 hover:w-64 border-r' : 'flex-row h-16 w-full border-b items-center px-4'}
            ${isVertical ? 'h-full py-6 px-3' : ''}
            ${isAnim ? animClass : ''}
        `}>

            {/* 1. Brand / Controls */}
            <div className={`
                flex items-center transition-all duration-300 relative
                ${isVertical ? 'flex-col mb-6' : 'mr-4'}
                ${contentHide ? 'justify-center w-full !mr-0 !mb-0' : ''} 
            `}>
                <button
                    onClick={() => {
                        let next = 'left';
                        if (position === 'top') { next = 'left'; setCycleDir('down'); }
                        else if (position === 'bottom') { next = 'left'; setCycleDir('up'); }
                        else if (position === 'left') { next = cycleDir === 'down' ? 'bottom' : 'top'; }
                        handlePositionChange(next);
                    }}
                    className={`
                        group/switcher relative flex items-center justify-center p-3 rounded-xl text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-all shadow-sm border border-transparent hover:border-blue-100
                        ${isAnim ? 'scale-125 text-blue-600 bg-blue-50' : ''} 
                    `}
                    title="Mover Barra"
                >
                    {isAnim ? (
                        <>
                            {targetPos === 'bottom' && <ArrowRight size={20} className="absolute" />}
                            {targetPos === 'left' && cycleDir === 'up' && <ArrowDown size={20} className="absolute" />}
                            {targetPos === 'left' && position === 'top' && <ArrowDown size={20} className="absolute" />}
                            {targetPos === 'top' && <ArrowRight size={20} className="absolute" />}
                        </>
                    ) : (
                        <>
                            {position === 'left' && cycleDir === 'down' && <ArrowDown size={20} className="absolute" />}
                            {position === 'left' && cycleDir === 'up' && <ArrowUp size={20} className="absolute" />}
                            {position === 'bottom' && <ArrowLeft size={20} className="absolute" />}
                            {position === 'top' && <ArrowLeft size={20} className="absolute" />}
                        </>
                    )}
                </button>

                {activeTab !== 'query-builder' && (
                    <button
                        onClick={() => onTabChange('query-builder')}
                        className={`
                            p-2 rounded-lg bg-indigo-50 text-indigo-500 hover:bg-indigo-100 transition
                            ${isVertical ? 'mt-4' : 'ml-2'}
                            ${contentHide ? 'hidden opacity-0' : 'block opacity-100'}
                        `}
                        title="Voltar ao Início"
                    >
                        <ArrowLeft size={18} />
                    </button>
                )}
            </div>

            {/* 2. Navigation Items (Grouped) */}
            <div className={`
                flex flex-1 transition-all duration-300
                ${contentHide ? 'opacity-0 scale-90 pointer-events-none w-0 h-0 overflow-hidden' : 'opacity-100 scale-100'}
                ${isVertical
                    ? `flex-col w-full no-scrollbar scrollbar-custom ${shouldHideScrollbar ? '!overflow-hidden' : 'overflow-y-auto'}`
                    : 'items-center overflow-x-auto no-scrollbar gap-4'
                }
            `}>
                {tabGroups.map((group, index) => (
                    <div key={index} className={`
                        flex ${isVertical ? 'flex-col mb-4' : 'flex-row items-center border-l first:border-l-0 pl-4'}
                    `}>
                        {/* Group Header (Vertical Only) */}
                        {isVertical && (
                            <div className={`
                                text-[10px] font-bold text-gray-400 uppercase mb-2 tracking-wider transition-all duration-300 ml-1
                                ${isHovered ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2 hidden group-hover:block group-hover:opacity-100 group-hover:translate-x-0'}
                            `}>
                                {group.title}
                            </div>
                        )}

                        {/* Group Items */}
                        <div className={`flex ${isVertical ? 'flex-col' : 'flex-row items-center'}`}>
                            {group.items.map(tab => (
                                <NavItem key={tab.id} tab={tab} />
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            {/* 3. Footer */}
            <div className={`
                flex items-center gap-3 transition-opacity duration-200
                ${contentHide ? 'opacity-0 scale-90 pointer-events-none w-0 h-0 overflow-hidden' : 'opacity-100 scale-100'}
                ${isVertical ? 'flex-col mt-auto pt-4 border-t border-gray-100' : 'ml-auto border-l border-gray-200 pl-4'}
            `}>
                <div className="relative group/conn">
                    <div title={connection ? `Conectado: ${connection.connectionName || connection.user}` : 'Sem conexão'} >
                        <button onClick={() => setConnectionBadgeExpanded(!connectionBadgeExpanded)} className={`
                            relative flex items-center justify-center p-2 rounded-xl border transition-colors
                            ${connection ? 'bg-green-50 text-green-600 border-green-200 hover:bg-green-100' : 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100'}
                        `}>
                            <Database size={18} />
                        </button>
                    </div>
                    {/* RESTORED CONNECTION DROPDOWN with Dynamic Positioning */}
                    {connectionBadgeExpanded && (
                        <div
                            ref={dropdownRef} // Attach Ref for outside click detection
                            className={`absolute w-64 bg-white rounded-xl shadow-2xl border border-gray-200 p-2 z-[9999] animate-in fade-in zoom-in-95 duration-200 ${getDropdownPositionClass()}`}
                        >
                            <h4 className="text-xs font-bold text-gray-400 uppercase mb-2 px-2">Conexões Salvas</h4>
                            <div className="space-y-1 max-h-48 overflow-y-auto custom-scroll">
                                {savedConnections.map(conn => (
                                    <button
                                        key={conn.id}
                                        onClick={() => {
                                            if (connection?.id === conn.id) return;
                                            handleQuickSwitch(conn);
                                            setConnectionBadgeExpanded(false);
                                        }}
                                        className={`w-full flex items-center gap-2 p-2 rounded-lg text-sm transition-colors ${connection?.id === conn.id ? 'bg-blue-50 text-blue-700 font-bold' : 'hover:bg-gray-50 text-black font-medium'
                                            }`}
                                    >
                                        <div className={`w-2 h-2 rounded-full ${connection?.id === conn.id ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                                        <span className="truncate flex-1 text-left">{conn.connectionName || conn.user}</span>
                                        {connection?.id === conn.id && <Check size={14} />}
                                    </button>
                                ))}
                                {savedConnections.length === 0 && (
                                    <div className="text-xs text-center text-gray-400 py-2">Nenhuma salva</div>
                                )}
                            </div>
                            <div className="border-t border-gray-100 mt-2 pt-2 space-y-1">
                                <button
                                    onClick={() => {
                                        handleDisconnect();
                                        setConnectionBadgeExpanded(false);
                                    }}
                                    className="w-full flex items-center gap-2 p-2 rounded-lg text-sm text-red-600 hover:bg-red-50 hover:text-red-700 transition-colors"
                                >
                                    <LogOut size={14} /> Desconectar
                                </button>
                                <button
                                    onClick={() => {
                                        handleDisconnect(); // Disconnect to show Login Screen (ConnectionForm)
                                        setShowConnectionSwitcher(true);
                                        setConnectionBadgeExpanded(false);
                                    }}
                                    className="w-full flex items-center justify-center gap-2 p-2 rounded-lg bg-blue-50 text-blue-600 text-xs font-bold hover:bg-blue-100 transition-colors"
                                >
                                    Gerenciar Conexões
                                </button>
                            </div>
                        </div>
                    )}
                </div>
                {/* <BackupMenu
                    lastBackup={lastBackup}
                    onForceBackup={onForceBackup}
                    isBackingUp={isBackingUp}
                    autoBackupEnabled={autoBackupEnabled}
                    toggleAutoBackup={toggleAutoBackup}
                /> */}
                <button
                    onClick={onCheckUpdates}
                    disabled={updateStatus === 'checking'}
                    className={`
                        flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold border 
                        ${updateStatus === 'checking' ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'}
                    `}
                    title="Verificar Atualizações"
                >
                    {updateStatus === 'checking' ? (
                        <RefreshCw size={12} className="animate-spin" />
                    ) : (
                        <span className="whitespace-nowrap">v{currentVersion}</span>
                    )}
                    {updateStatus === 'checking' && <span>Verificando...</span>}
                </button>

                {user && (
                    <div className={`
                        relative group/user flex items-center gap-3 transition-all
                        ${isVertical ? 'flex-col w-full mt-4 pt-4 border-t border-gray-100' : 'ml-4 pl-4 border-l border-gray-200'}
                    `}>
                        <button className="relative w-9 h-9 rounded-full bg-gray-200 overflow-hidden cursor-pointer hover:ring-2 hover:ring-blue-400 transition-all outline-none" title={user.username}>
                            <img src={user.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix'} alt="User" className="w-full h-full object-cover" />
                            {/* Online Status Dot */}
                            <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 border-2 border-white rounded-full"></div>
                        </button>

                        {/* RESTORED USER DROPDOWN (Hover) */}
                        <div className={`
                            absolute min-w-[200px] bg-white rounded-xl shadow-2xl border border-gray-200 p-2 z-[9999] 
                            opacity-0 invisible group-hover/user:opacity-100 group-hover/user:visible 
                            transition-all duration-200 ease-out transform scale-95 group-hover/user:scale-100
                            ${getDropdownPositionClass(true)}
                        `}>
                            <div className="px-3 py-2 border-b border-gray-100 mb-1 bg-gray-50/50 rounded-t-lg">
                                <p className="text-sm font-bold text-gray-900 truncate">{user.username}</p>
                                <p className="text-xs text-gray-500 truncate">{user.team || 'Membro'}</p>
                            </div>

                            <button
                                onClick={onOpenSettings}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 rounded-lg transition-colors"
                            >
                                <Settings size={16} /> Configurações
                            </button>

                            <button
                                onClick={onLogout}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 hover:text-red-700 rounded-lg transition-colors mt-1"
                            >
                                <LogOut size={16} /> Sair
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </nav>
    );
};

export default Navigation;

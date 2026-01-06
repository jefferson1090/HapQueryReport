import React, { useState, useEffect } from 'react';
import { Download, X, CheckCircle, RefreshCw, ArrowRight, ShieldCheck, AlertCircle, Loader2 } from 'lucide-react';
import logo from '../assets/hap_logo_v2.png';

/**
 * V2 Update Manager
 * Handles the entire update experience: Prompt -> Download Progress -> Restart
 */
const UpdateManager = ({ updateInfo, status, progress, onCheck, onRestart, onDismiss }) => {
    console.log(`DEBUG: UpdateManager Rendered | Status: ${status}`);

    // -- RENDER: CHECKING STATE (Toast) --
    if (status === 'checking') {
        return (
            <div className="fixed bottom-4 right-4 z-[9999] bg-white border border-gray-200 shadow-xl rounded-xl p-4 flex items-center gap-3 animate-fade-in-up">
                <Loader2 size={20} className="animate-spin text-blue-500" />
                <span className="text-gray-700 font-medium">Verificando atualizações...</span>
            </div>
        );
    }

    // -- RENDER: UP TO DATE (Toast) --
    if (status === 'up-to-date') {
        return (
            <div className="fixed bottom-4 right-4 z-[9999] bg-green-50 border border-green-200 shadow-xl rounded-xl p-4 flex items-center gap-3 animate-fade-in-up">
                <CheckCircle size={20} className="text-green-500" />
                <span className="text-gray-700 font-medium">O sistema está atualizado.</span>
            </div>
        );
    }

    // -- RENDER: ERROR (Toast) --
    if (status === 'error') {
        return (
            <div className="fixed bottom-4 right-4 z-[9999] bg-red-50 border border-red-200 shadow-xl rounded-xl p-4 flex items-center gap-3 animate-fade-in-up">
                <AlertCircle size={20} className="text-red-500" />
                <span className="text-gray-700 font-medium">
                    {updateInfo?.notes?.includes('404')
                        ? 'Servidor de atualização em manutenção (Tente mais tarde).'
                        : (updateInfo?.notes || 'Erro ao verificar atualizações.')}
                </span>
                <button onClick={onDismiss} className="ml-2 text-gray-400 hover:text-gray-600"><X size={16} /></button>
            </div>
        );
    }

    // -- RENDER: PROMPT MODAL (Available) --
    if (status === 'available' || status === 'downloading' || status === 'ready') {
        // If "available" but not downloading yet, show prompt
        const isDownloading = status === 'downloading';
        const isReady = status === 'ready';

        // If we are just "available", typically we auto-download on native updater, 
        // but if we want to establish a prompt phase, we can check a local dismissed state.
        // For now, let's assume if available/downloading/ready we show the modal.

        return (
            <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in">
                {/* Available / Prompt Card */}
                {!isDownloading && !isReady && (
                    <div className="v2-card w-full max-w-md p-8 text-center relative overflow-hidden bg-white">
                        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-orange-500 to-blue-600"></div>
                        <img src={logo} alt="Hapvida NDI" className="h-12 mx-auto mb-6" />
                        <h2 className="text-2xl font-bold text-gray-800 mb-2">Nova Versão Disponível</h2>
                        <p className="text-gray-500 mb-6">
                            A versão <span className="font-bold text-blue-600">{updateInfo?.version}</span> está disponível.
                            <br />O download iniciará automaticamente.
                        </p>
                        {/* Usually electron-updater starts downloading immediately, so this state might transition fast */}
                    </div>
                )}

                {/* Downloading / Ready Card */}
                {(isDownloading || isReady) && (
                    <div className="v2-card w-full max-w-md p-8 text-center relative overflow-hidden bg-white flex flex-col items-center">
                        <img src={logo} alt="Hapvida NDI" className="h-12 mb-6" />

                        {isDownloading ? (
                            <>
                                <div className="relative w-48 h-48 flex items-center justify-center mb-6">
                                    <svg className="w-full h-full transform -rotate-90">
                                        <circle cx="96" cy="96" r="88" stroke="#e5e7eb" strokeWidth="8" fill="transparent" />
                                        <circle cx="96" cy="96" r="88" stroke="#f97316" strokeWidth="8" fill="transparent"
                                            className="transition-all duration-300 ease-out"
                                            strokeDasharray={2 * Math.PI * 88}
                                            strokeDashoffset={2 * Math.PI * 88 * (1 - progress / 100)}
                                            strokeLinecap="round"
                                        />
                                    </svg>
                                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                                        <span className="text-4xl font-bold text-gray-800">{Math.round(progress)}%</span>
                                        <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest mt-1">Baixando</span>
                                    </div>
                                </div>
                                <p className="text-gray-500 animate-pulse">
                                    Baixando atualização... Por favor, aguarde.
                                </p>
                            </>
                        ) : (
                            <>
                                <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center text-green-600 mb-6 shadow-lg shadow-green-200 animate-bounce-in">
                                    <CheckCircle size={40} />
                                </div>
                                <h2 className="text-2xl font-bold text-gray-800 mb-2">Atualização Pronta!</h2>
                                <p className="text-gray-500 mb-6">
                                    A versão {updateInfo?.version} foi baixada. Reinicie para aplicar.
                                </p>
                                <button
                                    onClick={onRestart}
                                    className="bg-blue-600 text-white w-full py-3 rounded-xl font-bold text-lg shadow-lg hover:bg-blue-700 transition-all flex items-center justify-center gap-2"
                                >
                                    <RefreshCw size={20} />
                                    Reiniciar Agora
                                </button>
                                <button onClick={onDismiss} className="mt-4 text-gray-400 text-sm hover:text-gray-600">
                                    Agora não (Aplicar no próximo reinício)
                                </button>
                            </>
                        )}
                    </div>
                )}
            </div>
        );
    }

    return null;
};

export default UpdateManager;

import React from 'react';
import { Download, X, Info } from 'lucide-react';

const UpdateBanner = ({ updateInfo, onClose, onDownload, status }) => {
    // If no info, don't render
    if (!updateInfo) return null;

    return (
        <div className="bg-indigo-600 text-white px-4 py-3 shadow-lg relative z-50 animate-slide-in-top flex flex-col md:flex-row items-start md:items-center justify-between">
            <div className="flex-1 mr-4">
                <div className="flex items-center font-bold text-lg mb-1">
                    <Info size={20} className="mr-2" />
                    Nova Versão Disponível: {updateInfo.version}
                </div>
                <p className="text-indigo-100 text-sm mb-1">
                    Liberada em: {updateInfo.releaseDate}
                </p>
                <p className="text-white text-sm opacity-90">
                    {updateInfo.notes}
                </p>
            </div>
            <div className="flex items-center space-x-3 mt-3 md:mt-0">
                {status === 'ready' ? (
                    <button
                        onClick={onDownload}
                        className="flex items-center bg-green-500 text-white px-4 py-2 rounded-lg font-bold hover:bg-green-600 transition-colors shadow-sm animate-pulse"
                    >
                        <Download size={18} className="mr-2" />
                        Reiniciar e Instalar
                    </button>
                ) : (
                    <button
                        disabled
                        className="flex items-center bg-indigo-500 text-indigo-200 px-4 py-2 rounded-lg font-bold cursor-wait shadow-sm"
                    >
                        <Download size={18} className="mr-2 animate-bounce" />
                        Baixando...
                    </button>
                )}
                <button
                    onClick={onClose}
                    className="p-1 hover:bg-indigo-700 rounded-full text-indigo-200 hover:text-white transition-colors"
                >
                    <X size={20} />
                </button>
            </div>
        </div>
    );
};

export default UpdateBanner;

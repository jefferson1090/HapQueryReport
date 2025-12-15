import React from 'react';
import hapLogo from '../assets/hap_logo_v4.png';

const SplashScreen = () => {
    return (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white animate-fade-out-delay">
            <div className="flex flex-col items-center animate-bounce-in">
                <img src={hapLogo} alt="Hap Logo" className="h-24 mb-6" />
                <h1 className="text-3xl font-bold text-gray-800 tracking-tight">
                    Hap Assistente de Dados
                </h1>
                <div className="mt-4 flex space-x-2">
                    <div className="w-3 h-3 bg-blue-500 rounded-full animate-bounce delay-100"></div>
                    <div className="w-3 h-3 bg-orange-500 rounded-full animate-bounce delay-200"></div>
                    <div className="w-3 h-3 bg-green-500 rounded-full animate-bounce delay-300"></div>
                </div>
            </div>
        </div>
    );
};

export default SplashScreen;

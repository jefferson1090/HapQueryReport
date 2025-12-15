import React from 'react';
import splashIcon from '../assets/hap_splash_icon.png';
import splashText from '../assets/hap_splash_text.png';

const SplashScreen = () => {
    return (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white animate-fade-out-delay overflow-hidden">
            {/* Background Gradient Orbs */}
            <div className="absolute top-[-20%] right-[-10%] w-[500px] h-[500px] bg-orange-400/10 rounded-full blur-[100px] animate-pulse"></div>
            <div className="absolute bottom-[-20%] left-[-10%] w-[500px] h-[500px] bg-blue-500/10 rounded-full blur-[100px] animate-pulse delay-700"></div>

            <div className="flex flex-col items-center relative z-10">
                {/* Icon Animation */}
                <div className="relative mb-8">
                    <div className="absolute inset-0 bg-gradient-to-tr from-blue-500 to-orange-500 rounded-full blur-2xl opacity-20 animate-pulse"></div>
                    <img
                        src={splashIcon}
                        alt="Hapvida Icon"
                        className="h-64 w-auto animate-bounce-in drop-shadow-xl"
                    />
                </div>

                {/* Text Animation */}
                <img
                    src={splashText}
                    alt="Hapvida"
                    className="h-16 w-auto animate-fade-in-up [animation-delay:0.3s] opacity-0 slide-in-from-bottom"
                />

                {/* Loading Dots */}
                <div className="mt-8 flex items-center gap-2">
                    <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                    <div className="w-2 h-2 bg-orange-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                    <div className="w-2 h-2 bg-purple-600 rounded-full animate-bounce"></div>
                </div>
            </div>
        </div>
    );
};

export default SplashScreen;

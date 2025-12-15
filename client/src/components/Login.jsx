import React, { useState } from 'react';
import io from 'socket.io-client';
import hapLogo from '../assets/hap_logo_v2.png';
import { User, Lock, Users, ArrowRight, Loader2 } from 'lucide-react';

const Login = ({ onLogin, apiUrl }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [team, setTeam] = useState('');
    const [isRegistering, setIsRegistering] = useState(false);
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleLogin = async (e) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            const res = await fetch(`${apiUrl}/api/chat/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json();

            if (data.success) {
                console.log("Login successful via API");
                const socket = io(apiUrl);
                onLogin({ username: data.username, team: data.team }, socket);
                setIsLoading(false);
            } else {
                setError(data.message || 'Falha no login');
                setIsLoading(false);
            }
        } catch (err) {
            setError('Erro de conexão: ' + err.message);
            setIsLoading(false);
        }
    };

    const handleRegister = async (e) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            const res = await fetch(`${apiUrl}/api/chat/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password, team })
            });
            const data = await res.json();

            if (data.success) {
                setError('Registro realizado! Faça login.');
                setIsRegistering(false);
            } else {
                setError(data.message || data.error || 'Falha no registro');
            }
            setIsLoading(false);
        } catch (err) {
            setError('Erro no registro: ' + err.message);
            setIsLoading(false);
        }
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 relative overflow-hidden">
            {/* Background Decor */}
            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-orange-500 to-blue-600 z-10"></div>
            <div className="absolute -top-24 -right-24 w-96 h-96 bg-blue-400/10 rounded-full blur-3xl"></div>
            <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-orange-400/10 rounded-full blur-3xl"></div>

            <div className="v2-card w-full max-w-md p-8 relative z-20 mx-4">
                <div className="text-center mb-8">
                    <img src={hapLogo} alt="Hap Logo" className="h-32 mx-auto mb-6 drop-shadow-sm transition-transform duration-500 hover:scale-105" />
                    <h2 className="text-xl font-semibold text-gray-700">
                        {isRegistering ? 'Criar Nova Conta' : 'Hap Assistente de Dados'}
                    </h2>
                    <p className="text-sm text-gray-400 mt-1">
                        {isRegistering ? 'Junte-se ao time e colabore.' : 'Faça login para continuar.'}
                    </p>
                </div>

                {error && (
                    <div className={`mb-6 p-4 rounded-xl text-sm flex items-center gap-2 animate-fade-in ${error.includes('realizado') ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-red-50 text-red-700 border border-red-100'}`}>
                        {error}
                    </div>
                )}

                <form onSubmit={isRegistering ? handleRegister : handleLogin} className="space-y-4">
                    <div className="relative group">
                        <User className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-orange-500 transition-colors" size={20} />
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="v2-input w-full pl-12"
                            placeholder="Nome de Usuário"
                            required
                        />
                    </div>

                    {isRegistering && (
                        <div className="relative group animate-fade-in">
                            <Users className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-orange-500 transition-colors" size={20} />
                            <input
                                type="text"
                                value={team}
                                onChange={(e) => setTeam(e.target.value)}
                                className="v2-input w-full pl-12"
                                placeholder="Equipe (Ex: TI, Vendas)"
                            />
                        </div>
                    )}

                    <div className="relative group">
                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-orange-500 transition-colors" size={20} />
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="v2-input w-full pl-12"
                            placeholder="Senha"
                            required
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="v2-btn-primary w-full py-3.5 rounded-xl flex items-center justify-center gap-2 mt-6"
                    >
                        {isLoading ? <Loader2 className="animate-spin" size={20} /> : (
                            <>
                                {isRegistering ? 'Registrar' : 'Entrar'}
                                {!isLoading && <ArrowRight size={18} />}
                            </>
                        )}
                    </button>
                </form>

                <div className="mt-8 text-center border-t border-gray-100 pt-6">
                    <button
                        onClick={() => { setIsRegistering(!isRegistering); setError(''); }}
                        className="text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors hover:underline"
                    >
                        {isRegistering ? 'Já tem conta? Entrar' : 'Não tem conta? Criar acesso'}
                    </button>
                </div>
            </div>

            <p className="absolute bottom-6 text-xs text-gray-400 opacity-60">
                v{window.electronAPI ? '...' : 'Dev'} © 2024 Hapvida NotreDame Intermédica
            </p>
        </div>
    );
};

export default Login;

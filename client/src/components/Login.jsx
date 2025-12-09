import React, { useState } from 'react';
import io from 'socket.io-client';
import hapLogo from '../assets/hap_logo_v4.png';

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
        <div className="flex items-center justify-center min-h-screen bg-gray-100">
            <div className="bg-white p-8 rounded-lg shadow-xl w-full max-w-md">
                <div className="flex justify-center mb-6">
                    <img src={hapLogo} alt="Hap Logo" className="h-16" />
                </div>
                <h2 className="text-2xl font-bold text-center text-gray-800 mb-6">
                    {isRegistering ? 'Criar Conta' : 'Hap Assistente de Dados'}
                </h2>

                {error && (
                    <div className={`mb-4 p-3 rounded text-sm ${error.includes('realizado') ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {error}
                    </div>
                )}

                <form onSubmit={isRegistering ? handleRegister : handleLogin} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Usuário</label>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 outline-none"
                            required
                        />
                    </div>

                    {isRegistering && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Equipe</label>
                            <input
                                type="text"
                                value={team}
                                onChange={(e) => setTeam(e.target.value)}
                                className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 outline-none"
                                placeholder="Ex: Financeiro, TI, Vendas"
                            />
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Senha</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 outline-none"
                            required
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 transition-colors font-bold disabled:opacity-50"
                    >
                        {isLoading ? 'Processando...' : (isRegistering ? 'Registrar' : 'Entrar')}
                    </button>
                </form>

                <div className="mt-4 text-center">
                    <button
                        onClick={() => { setIsRegistering(!isRegistering); setError(''); }}
                        className="text-sm text-blue-600 hover:underline"
                    >
                        {isRegistering ? 'Já tem conta? Faça login' : 'Não tem conta? Registre-se'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Login;

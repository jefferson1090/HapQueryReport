import React from 'react';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
        // Update state so the next render will show the fallback UI.
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        // You can also log the error to an error reporting service
        console.error("ErrorBoundary caught an error:", error, errorInfo);
        this.setState({ errorInfo });
    }

    render() {
        if (this.state.hasError) {
            // You can render any custom fallback UI
            return (
                <div className="p-8 bg-red-50 border border-red-200 rounded-xl m-4 text-center h-full flex flex-col justify-center items-center">
                    <div className="text-4xl mb-4">💥</div>
                    <h2 className="text-xl font-bold text-red-800 mb-2">Ops, algo deu errado nesta seção.</h2>
                    <p className="text-red-600 mb-4">Ocorreu um erro inesperado ao exibir este componente.</p>

                    <div className="bg-white p-4 rounded border border-red-100 text-left overflow-auto max-h-[500px] w-full max-w-4xl text-xs font-mono text-gray-700 mb-4 shadow-inner">
                        <strong className="text-red-600 block mb-2">{this.state.error && this.state.error.toString()}</strong>
                        <details open>
                            <summary className="cursor-pointer font-bold mb-1">Stack Trace:</summary>
                            <pre className="whitespace-pre-wrap">{this.state.error && this.state.error.stack}</pre>
                        </details>
                        <details className="mt-2">
                            <summary className="cursor-pointer font-bold mb-1">Component Stack:</summary>
                            <pre className="whitespace-pre-wrap">{this.state.errorInfo && this.state.errorInfo.componentStack}</pre>
                        </details>
                    </div>

                    <button
                        onClick={() => window.location.reload()}
                        className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition"
                    >
                        Recarregar Aplicação
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;

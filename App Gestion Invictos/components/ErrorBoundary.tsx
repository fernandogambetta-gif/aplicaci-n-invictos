
import React, { Component, ErrorInfo, ReactNode } from 'react';
import { StorageService } from '../services/storageService';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  private handleReset = () => {
    if (confirm('¿Estás seguro? Se borrarán todos los datos para recuperar el sistema.')) {
        StorageService.resetData();
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
          <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full border border-red-100">
            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
               {/* SVG directo para no depender de librerías externas que pueden fallar */}
               <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                 <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
                 <path d="M12 9v4"/>
                 <path d="M12 17h.01"/>
               </svg>
            </div>
            <h1 className="text-2xl font-bold text-slate-800 mb-2">¡Ups! Algo salió mal</h1>
            <p className="text-slate-500 mb-6 text-sm">
              El sistema ha detectado un error de configuración o datos corruptos.
            </p>
            
            <div className="bg-slate-100 p-3 rounded text-left mb-6 overflow-auto max-h-32">
                <p className="text-xs font-mono text-red-500 break-all">
                    {this.state.error?.message || 'Error desconocido'}
                </p>
            </div>

            <button
              onClick={this.handleReset}
              className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-colors shadow-lg shadow-red-200"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
              Restablecer de Fábrica
            </button>
            <p className="text-xs text-slate-400 mt-4">
                Esta acción borrará ventas y productos para que puedas volver a entrar.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

import React, { useState } from 'react';
import { Product, Sale } from '../types';
import { analyzeBusinessData } from '../services/geminiService';
import { Sparkles, RefreshCw, AlertTriangle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface AIAdvisorProps {
  products: Product[];
  sales: Sale[];
}

const AIAdvisor: React.FC<AIAdvisorProps> = ({ products, sales }) => {
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleGenerateReport = async () => {
    setLoading(true);
    const result = await analyzeBusinessData(products, sales);
    setAnalysis(result);
    setLoading(false);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 bg-indigo-600 rounded-xl shadow-lg shadow-indigo-200">
          <Sparkles className="text-white" size={24} />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Asistente Inteligente</h2>
          <p className="text-slate-500">Obtén recomendaciones estratégicas para INVICTOS con IA.</p>
        </div>
      </div>

      {!process.env.API_KEY && (
        <div className="bg-amber-50 border border-amber-200 p-4 rounded-lg flex gap-3 text-amber-800">
          <AlertTriangle className="shrink-0" />
          <p>La API Key de Gemini no está configurada. El asistente no funcionará hasta que se añada al entorno.</p>
        </div>
      )}

      {/* Main Card */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-8 text-center border-b border-slate-100 bg-gradient-to-b from-indigo-50/50 to-white">
          <p className="text-slate-600 mb-6 max-w-xl mx-auto">
            Analizaré tu inventario actual, patrones de venta y datos históricos para sugerirte reabastecimientos y estrategias de venta.
          </p>
          <button
            onClick={handleGenerateReport}
            disabled={loading}
            className={`
              inline-flex items-center gap-2 px-6 py-3 rounded-full font-semibold text-white transition-all transform hover:scale-105
              ${loading ? 'bg-indigo-400 cursor-wait' : 'bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-200'}
            `}
          >
            {loading ? <RefreshCw className="animate-spin" /> : <Sparkles size={18} />}
            {loading ? 'Analizando datos...' : 'Generar Reporte de Negocio'}
          </button>
        </div>

        {/* Results Area */}
        {analysis && (
          <div className="p-8 bg-white min-h-[300px] animate-fade-in">
             <div className="prose prose-indigo max-w-none text-slate-700">
                <ReactMarkdown>{analysis}</ReactMarkdown>
             </div>
          </div>
        )}
      </div>
      
      <div className="text-center text-sm text-slate-400 mt-8">
        Potenciado por Gemini 2.5 Flash &bull; Los resultados son sugerencias basadas en datos simulados.
      </div>
    </div>
  );
};

export default AIAdvisor;
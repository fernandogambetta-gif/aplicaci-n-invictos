import { GoogleGenAI } from "@google/genai";
import { Product, Sale } from "../types";

const SYSTEM_INSTRUCTION = `
Eres un consultor experto en negocios de retail e indumentaria deportiva. 
Analizas datos de inventario y ventas para dar consejos breves, estratégicos y accionables en Español.
Tu tono es profesional pero motivador para el dueño del negocio "INVICTOS".
`;

export const analyzeBusinessData = async (products: Product[], sales: Sale[]): Promise<string> => {
  try {
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      return "⚠️ API Key no configurada. Por favor configura tu clave de API de Gemini.";
    }

    const ai = new GoogleGenAI({ apiKey });

    // Prepare a summarized context to avoid token limits if data is huge
    const lowStock = products.filter(p => p.stock < 5).map(p => p.name);
    const totalRevenue = sales.reduce((acc, s) => acc + s.total, 0);
    const last5Sales = sales.slice(-5).map(s => ({
        total: s.total,
        items: s.items.map(i => i.productName).join(', ')
    }));

    const prompt = `
      Analiza el estado actual de mi negocio "INVICTOS":
      
      DATOS ACTUALES:
      - Total Productos en catálogo: ${products.length}
      - Productos con bajo stock (<5): ${lowStock.join(', ') || 'Ninguno'}
      - Ingresos totales históricos: $${totalRevenue}
      - Últimas 5 ventas: ${JSON.stringify(last5Sales)}
      
      Genera un reporte breve con:
      1. Un resumen ejecutivo del estado del negocio.
      2. Una alerta sobre stock si es necesario.
      3. Una sugerencia de marketing basada en lo que se vende o falta vender.
      
      Usa formato Markdown.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.7,
      }
    });

    return response.text || "No se pudo generar el análisis.";
  } catch (error) {
    console.error("Error calling Gemini:", error);
    return "Hubo un error al conectar con el asistente inteligente. Intenta nuevamente más tarde.";
  }
};
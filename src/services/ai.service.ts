import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from 'dotenv';
dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export const refineTemplate = async (text: string): Promise<string> => {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `
      Você é um assistente de comunicação para escritórios de advocacia de elite.
      Sua tarefa é REFINAR e POLIR uma mensagem de notificação de WhatsApp mantendo TODAS as variáveis no formato {{variavel}}.

      REGRAS:
      1. Mantenha o tom profissional, mas empático e humano.
      2. Use emojis de forma elegante (não exagere).
      3. Use negritos (*) e itálicos (_) para dar ênfase (padrão WhatsApp).
      4. Mantenha as tags {{cliente}}, {{titulo}}, {{data}}, {{hora}}, {{escritorio}} e {{localizacao}} EXATAMENTE como estão.
      5. A mensagem deve ser curta e objetiva (máximo 250 caracteres).

      Texto original para refinar:
      "${text}"
      
      Retorne APENAS a mensagem refinada final, sem explicações.
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text().trim();
  } catch (error) {
    console.error("Erro no processamento da IA:", error);
    return text; // Fallback para o texto original em caso de erro
  }
};

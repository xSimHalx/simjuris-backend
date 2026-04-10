import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from 'fs';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

/**
 * Converte um arquivo local para o formato exigido pela API do Gemini
 */
function fileToGenerativePart(path: string, mimeType: string) {
  return {
    inlineData: {
      data: Buffer.from(fs.readFileSync(path)).toString("base64"),
      mimeType
    },
  };
}

/**
 * Transcreve um áudio e identifica melhorias para o sistema
 */
export const transcribeAudio = async (filePath: string): Promise<string> => {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const audioPart = fileToGenerativePart(filePath, "audio/mpeg");

    const prompt = `
      Você é um especialista em análise de requisitos para sistemas jurídicos.
      Estou te enviando um áudio de um advogado sugerindo melhorias para o sistema SimJuris.
      
      SimJuris é um sistema de agenda inteligente que envia notificações de WhatsApp automáticas.

      Sua tarefa:
      1. Transcreva o que ele diz.
      2. Extraia os pontos principais de melhoria sugeridos.
      3. Classifique o tom (entusiasmado, crítico, urgente).

      Retorne no formato:
      TRANSCRICAO: ...
      SUGESTOES: ...
      TOM: ...
    `;

    const result = await model.generateContent([prompt, audioPart]);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error(`Erro ao transcrever arquivo ${filePath}:`, error);
    return `ERRO: Não foi possível transcrever o arquivo. Verifique se a GEMINI_API_KEY está correta.`;
  }
};

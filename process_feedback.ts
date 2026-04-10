import { transcribeAudio } from './src/utils/transcriber';
import fs from 'fs';
import path from 'path';

async function run() {
  const rootDir = path.resolve(__dirname, '..'); // Pasta z:\SimJuris
  
  // Lista de arquivos fornecidos pelo usuário
  const files = [
    'WhatsApp Ptt 2026-04-09 at 14.49.17.mp3',
    'WhatsApp Ptt 2026-04-09 at 14.50.27.mp3',
    'WhatsApp Ptt 2026-04-09 at 14.53.55.mp3',
    'WhatsApp Ptt 2026-04-09 at 15.01.31.mp3',
    'WhatsApp Ptt 2026-04-09 at 15.04.39.mp3',
    'WhatsApp Ptt 2026-04-09 at 15.11.14.mp3'
  ];

  console.log('🚀 Iniciando processamento dos áudios dos advogados...\n');

  for (const fileName of files) {
    const filePath = path.join(rootDir, fileName);
    
    if (!fs.existsSync(filePath)) {
      console.error(`❌ Arquivo não encontrado: ${fileName}`);
      continue;
    }

    console.log(`🎙️ Processando ${fileName}...`);
    const result = await transcribeAudio(filePath);
    
    console.log(`\n--- RESULTADO PARA ${fileName} ---`);
    console.log(result);
    console.log('-----------------------------------\n');
  }

  console.log('✅ Processamento concluído.');
}

run().catch(console.error);

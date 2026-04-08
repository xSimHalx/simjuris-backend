import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'http://localhost:8080';
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || 'ChaveSecretaEvoSaaS2026!';

// Configuração do Redis
const connection = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
  maxRetriesPerRequest: null,
});

// Função auxiliar para atrasos (Manual Sleep)
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Criar a fila "evolution-messages"
export const evolutionQueue = new Queue('evolution-messages', { connection });

// O "Trabalhador" que consome as mensagens da fila com inteligência Anti-Ban
export const evolutionWorker = new Worker(
  'evolution-messages',
  async (job) => {
    const { conteudo_mensagem, evolution_instance_id, tenant_id } = job.data;
    
    // 1. Gerencia o Cooldown por Escritório (Pausa de 15 min a cada 50 disparos)
    // Armazenamos o contador no Redis para ser persistente e isolado por tenant
    const cooldownKey = `simjuris:cooldown:${tenant_id || 'global'}`;
    const currentCount = await connection.incr(cooldownKey);
    
    if (currentCount % 50 === 0) {
      console.log(`[Anti-Ban][Tenant: ${tenant_id}] ☕ Pausa de segurança atingida (50 msgs). Aguardando 15 minutos...`);
      await sleep(15 * 60 * 1000); 
    }

    // 2. Delay Aleatório entre Jobs (20s a 60s) - Evita padrões fixos detection
    const randomInterval = Math.floor(Math.random() * (60000 - 20000 + 1)) + 20000;
    console.log(`[Anti-Ban] ⏳ Aguardando intervalo humano de ${Math.round(randomInterval/1000)}s antes do próximo envio...`);
    await sleep(randomInterval);

    // 3. Digitação Dinâmica (Baseada no tamanho do texto: 50ms por char)
    // Mínimo de 2s, Máximo de 8s para simular naturalidade
    const typingDuration = Math.min(Math.max((conteudo_mensagem?.length || 0) * 50, 2000), 8000);

    // Normalização central: garante código do país (55 = Brasil)
    let numero_destino = job.data.numero_destino.replace(/\D/g, '');
    if (!numero_destino.startsWith('55')) numero_destino = `55${numero_destino}`;

    console.log(`[Queue] 🚀 Enviando para ${numero_destino}... [Simulando Digitação: ${Math.round(typingDuration/1000)}s]`);

    const response = await fetch(`${EVOLUTION_API_URL}/message/sendText/${evolution_instance_id}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': EVOLUTION_API_KEY
      },
      body: JSON.stringify({
        number: numero_destino,
        text: conteudo_mensagem,
        options: {
          delay: typingDuration, 
          presence: 'composing' 
        }
      })
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error(`[Queue Error] Falha ao enviar para ${numero_destino}:`, errBody);
      throw new Error(`Integration API Error: ${response.status} - ${errBody}`);
    }

    console.log(`[Queue] ✅ Sucesso! Lembrete entregue p/ ${numero_destino}!`);
    return { status: 'SUCESSO', time: new Date() };
  },
  {
    connection,
    limiter: {
      max: 1,        
      duration: 10000 // Trava de segurança redundante: 1 job a cada 10s
    }
  }
);

// ─── Handler de Falhas Definitivas ──────────────────────────────────────────
// Quando o BullMQ esgota todas as tentativas, este evento dispara.
// Marca o log como ERRO no banco → fica visível no Histórico e Dashboard.
evolutionWorker.on('failed', async (job, err) => {
  if (!job) return;
  const { numero_destino, tenant_id, event_id, conteudo_mensagem } = job.data;

  console.error(`[Queue] ❌ FALHA DEFINITIVA ao enviar para ${numero_destino}:`, err.message);

  try {
    // Import lazy para evitar circular dependency com server.ts
    const { prisma } = require('../server');

    if (job.data.log_id) {
      // Se já existe um log, muda status para ERRO
      await prisma.notificationLog.update({
        where: { id: job.data.log_id },
        data: { status_envio: 'ERRO' }
      });
    } else if (tenant_id && event_id) {
      // Cria um novo log de ERRO para auditoria
      await prisma.notificationLog.create({
        data: {
          tenant_id,
          event_id,
          numero_destino,
          conteudo_mensagem: conteudo_mensagem || '(falha no disparo)',
          status_envio: 'ERRO'
        }
      });
    }
  } catch (dbErr) {
    console.error('[Queue] Não foi possível registrar o erro no banco:', dbErr);
  }
});

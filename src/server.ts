import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

dotenv.config();

const app = express();

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });

// Diagnóstico de Pool
pool.on('error', (err) => {
  console.error('❌ ERRO CRÍTICO NO POOL POSTGRES:', err);
});

// Teste de Conexão Inicial
pool.connect((err, client, release) => {
  if (err || !client) {
    return console.error('❌ FALHA AO CONECTAR NO BANCO:', err?.stack || 'Client indefinido');
  }
  client.query('SELECT NOW()', (err, result) => {
    release();
    if (err) {
      return console.error('❌ ERRO NA QUERY DE TESTE:', err.stack);
    }
    console.log('✅ BANCO DE DADOS CONECTADO COM SUCESSO (Pool)');
  });
});

const adapter = new PrismaPg(pool);
export const prisma = new PrismaClient({ adapter });

app.use(cors({
  origin: (origin, callback) => {
    // Permitir qualquer origem para facilitar o desenvolvimento com Túnel + Vercel
    callback(null, true);
  },
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'bypass-tunnel-reminder']
}));

// Logger para depuração de requisições
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

app.use(express.json({ limit: '10mb' }));

// Registrar rotas
import authRoutes from './routes/auth.routes';
import eventsRoutes from './routes/events.routes';
import instancesRoutes from './routes/instances.routes';
import clientsRoutes from './routes/clients.routes';
import notificationRoutes from './routes/notifications.routes';
import usersRoutes from './routes/users.routes';
import tenantRoutes from './routes/tenant.routes';
import aiRoutes from './routes/ai.routes';

// Importando os workers para incializarem com o servidor (Redis e Crons)
import './queue/evolution.queue';
import './jobs/notification.job';

app.use('/api/auth', authRoutes);
app.use('/api/events', eventsRoutes);
app.use('/api/instances', instancesRoutes);
app.use('/api/clients', clientsRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/tenant', tenantRoutes);
app.use('/api/ai', aiRoutes);

// Rota de Healthcheck
app.get('/health', async (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3333;

app.listen(PORT, () => {
  console.log(`🚀 SimJuris - Backend rodando na porta ${PORT}`);
});

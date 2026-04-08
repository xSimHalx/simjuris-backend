import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

dotenv.config();

const app = express();
export const prisma = new PrismaClient();

const allowedOrigins = [
  process.env.FRONTEND_URL || '*',
  'http://localhost:5173', // Desenvolvimento local
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
app.use(express.json());

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

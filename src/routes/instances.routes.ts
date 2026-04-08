import { Router } from 'express';
import { prisma } from '../server';
import { ensureAuthenticated } from '../middlewares/auth.middleware';

const router = Router();
router.use(ensureAuthenticated);

// Variáveis protegidas. Em prod, usaríamos variáveis de ambiente .env de fato.
const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'http://localhost:8080';
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || 'ChaveSecretaEvoSaaS2026!';

// Helper para injetar a autenticação requerida pela ferramenta (Global API_KEY)
const getEvolutionHeaders = () => ({
  'Content-Type': 'application/json',
  'apikey': EVOLUTION_API_KEY
});

// GET: Checar como está a conexão do WhatsApp ("Online", "QRCode Pendente", "Desconectado")
router.get('/', async (req, res): Promise<any> => {
  try {
    const { tenantId } = req.user!;
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });

    if (!tenant || !tenant.evolution_instance_id) {
      return res.json({ status: 'NO_INSTANCE', message: 'Nenhuma instância configurada para este escritório.' });
    }

    const instanceName = tenant.evolution_instance_id;

    try {
      const response = await fetch(`${EVOLUTION_API_URL}/instance/connectionState/${instanceName}`, {
        headers: getEvolutionHeaders()
      });
      
      if (!response.ok) {
        return res.json({ status: 'OFFLINE', instanceName });
      }

      const data = await response.json();
      return res.json({ 
        status: data?.instance?.state || 'OFFLINE', 
        instanceName 
      });

    } catch (e) {
      console.error('Falha de Comunicação Interna com a Evolution API', e);
      return res.json({ status: 'ERROR', message: 'Motor de WhatsApp indisponível na infra.', instanceName });
    }
  } catch (error) {
    return res.status(500).json({ error: 'Erro interno no servidor de API do SaaS' });
  }
});

// POST: Tentar conectar. Se a instância não existe, ele cria e pede o QRCode (Base64) pra ser injetado no Frontend!
router.post('/connect', async (req, res): Promise<any> => {
  try {
    const { tenantId } = req.user!;
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });

    let instanceName = tenant?.evolution_instance_id;

    if (!instanceName) {
      // 1. Gera um nome limpo na infra pro escritório e trava ele no Prisma
      instanceName = `escritorio_${tenantId.split('-')[0]}`;
      await prisma.tenant.update({
        where: { id: tenantId },
        data: { evolution_instance_id: instanceName }
      });
    }

    // [AUTO-CURA] Verificamos se a instância existe no motor da Evolution
    const checkResponse = await fetch(`${EVOLUTION_API_URL}/instance/connectionState/${instanceName}`, {
      headers: getEvolutionHeaders()
    });

    if (!checkResponse.ok) {
      // Se não existir (404/Erro), mandamos criar antes de tentar conectar
      await fetch(`${EVOLUTION_API_URL}/instance/create`, {
        method: 'POST',
        headers: getEvolutionHeaders(),
        body: JSON.stringify({
          instanceName,
          qrcode: true,
          integration: "WHATSAPP-BAILEYS"
        })
      });
    }

    // 3. Pega fisicamente o QrCode base64
    const qrResponse = await fetch(`${EVOLUTION_API_URL}/instance/connect/${instanceName}`, {
      headers: getEvolutionHeaders()
    });

    const qrData = await qrResponse.json();

    if (qrData.base64) {
      return res.json({ qrcode: qrData.base64, instanceName });
    }

    if (qrData?.instance?.state === 'open') {
       return res.json({ message: 'WhatsApp já está pareado e operfil rodando!', state: 'open' });
    }

    return res.status(400).json({ error: 'Falha durante o protocolo de espelhamento do WhatsApp.', details: qrData });
  } catch (error) {
    console.error('Erro de requisição', error);
    return res.status(500).json({ error: 'Erro na conexão. Verifique se os containerns estão no ar.' });
  }
});

// POST: Mandar o bot apagar as credenciais do escritório e jogar o telefone local fora
router.post('/logout', async (req, res): Promise<any> => {
   try {
    const { tenantId } = req.user!;
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });

    if (!tenant?.evolution_instance_id) return res.status(400).json({ error: 'Instância fantasma (sem amarração no DB)' });

    await fetch(`${EVOLUTION_API_URL}/instance/logout/${tenant.evolution_instance_id}`, {
      method: 'DELETE',
      headers: getEvolutionHeaders()
    });

    return res.json({ message: 'Sistema redefinido! Sessão do WhatsApp foi apagada da VPS.' });
   } catch (error) {
    return res.status(500).json({ error: 'Erro ao formatar sessão local.' });
   }
});

export default router;

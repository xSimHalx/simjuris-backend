import { Router } from 'express';
import { prisma } from '../server';
import { ensureAuthenticated } from '../middlewares/auth.middleware';

const router = Router();
router.use(ensureAuthenticated);

// Listar todos os clientes do escritório (Tenant)
router.get('/', async (req, res): Promise<any> => {
  try {
    const { tenantId } = req.user!;
    const clients = await prisma.client.findMany({
      where: { tenant_id: tenantId },
      include: {
        tenant: true,
        events: {
          orderBy: { data_hora_evento: 'asc' },
          include: { 
            notification_logs: { 
              orderBy: { data_envio: 'desc' },
              take: 5
            } 
          }
        }
      },
      orderBy: { nome_completo: 'asc' }
    });
    return res.json(clients);
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao buscar clientes.' });
  }
});

// Criar novo cliente
router.post('/', async (req, res): Promise<any> => {
  try {
    const { tenantId } = req.user!;
    const { nome_completo, whatsapp, documento } = req.body;

    // Verificar duplicidade por WhatsApp ou Documento ou Nome Exato
    const existing = await prisma.client.findFirst({
      where: {
        tenant_id: tenantId,
        OR: [
          { whatsapp },
          { documento: documento && documento !== '00000000000' ? documento : undefined },
          { nome_completo: { equals: nome_completo, mode: 'insensitive' } }
        ]
      }
    });

    if (existing) {
      let field = 'WhatsApp';
      if (existing.documento === documento && documento !== '00000000000') field = 'CPF/Documento';
      if (existing.nome_completo.toLowerCase() === nome_completo.toLowerCase()) field = 'Nome';
      
      return res.status(409).json({ 
        error: `Este ${field} já está vinculado ao cliente "${existing.nome_completo}".` 
      });
    }

    const client = await prisma.client.create({
      data: {
        tenant_id: tenantId,
        nome_completo,
        whatsapp,
        documento: documento || '00000000000'
      },
      include: { tenant: true, events: true }
    });

    return res.json(client);
  } catch (error) {
    console.error('Erro ao criar cliente:', error);
    return res.status(500).json({ error: 'Erro ao criar cliente.' });
  }
});

// Atualizar dados de um cliente
router.patch('/:id', async (req, res): Promise<any> => {
  try {
    const { tenantId } = req.user!;
    const { id } = req.params;
    const { nome_completo, whatsapp, documento, notas_internas } = req.body;

    // Verificar se existe OUTRO cliente com esse zap ou doc
    if (whatsapp || documento) {
      const existing = await prisma.client.findFirst({
        where: {
          tenant_id: tenantId,
          id: { not: id }, // Ignorar o próprio cliente sendo editado
          OR: [
            whatsapp ? { whatsapp } : { whatsapp: undefined },
            documento && documento !== '00000000000' ? { documento } : { documento: undefined }
          ]
        }
      });

      if (existing) {
        let field = existing.whatsapp === whatsapp ? 'WhatsApp' : 'CPF/Documento';
        return res.status(409).json({ 
          error: `Este ${field} já está vinculado ao cliente "${existing.nome_completo}".` 
        });
      }
    }

    const client = await prisma.client.update({
      where: { id, tenant_id: tenantId },
      data: { nome_completo, whatsapp, documento, notas_internas },
      include: { tenant: true, events: true }
    });

    return res.json(client);
  } catch (error) {
    console.error('Erro ao atualizar cliente:', error);
    return res.status(500).json({ error: 'Erro ao atualizar cliente.' });
  }
});

// Excluir permanentemente um cliente
router.delete('/:id', async (req, res): Promise<any> => {
  try {
    const { tenantId } = req.user!;
    const { id } = req.params;

    // Prisma deletará os eventos em cascata se configurado, senão precisamos cuidar aqui.
    // Conforme o schema, onDelete: Cascade está habilitado.
    await prisma.client.delete({
      where: { id, tenant_id: tenantId }
    });

    return res.json({ success: true, message: 'Cliente removido com sucesso.' });
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao excluir cliente.' });
  }
});

export default router;

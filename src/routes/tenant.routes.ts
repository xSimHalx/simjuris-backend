import { Router } from 'express';
import { prisma } from '../server';
import { ensureAuthenticated } from '../middlewares/auth.middleware';

const router = Router();
router.use(ensureAuthenticated);

// Buscar dados do escritório atual (Tenant)
router.get('/', async (req, res): Promise<any> => {
  try {
    const { tenantId } = req.user!;
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId }
    });
    return res.json(tenant);
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao buscar dados do escritório.' });
  }
});

// Atualizar dados do escritório
router.patch('/', async (req, res): Promise<any> => {
  console.log('--- ATUALIZAÇÃO TENANT RECEBIDA ---');
  console.log('Payload:', JSON.stringify(req.body, null, 2));
  try {
    const { tenantId } = req.user!;
    const { 
      nome_fantasia, 
      google_maps_link,
      template_confirmacao_prazo,
      template_confirmacao_audiencia,
      template_confirmacao_reuniao,
      template_lembrete_d2,
      template_lembrete_d0,
      config_fluxos,
      hide_error_alerts
    } = req.body;

    const updatedTenant = await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        nome_fantasia,
        google_maps_link,
        template_confirmacao_prazo,
        template_confirmacao_audiencia,
        template_confirmacao_reuniao,
        template_lembrete_d2,
        template_lembrete_d0,
        config_fluxos,
        hide_error_alerts
      }
    });

    return res.json(updatedTenant);
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao atualizar dados do escritório.' });
  }
});

export default router;

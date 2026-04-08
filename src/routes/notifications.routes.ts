import { Router } from 'express';
import { prisma } from '../server';
import { ensureAuthenticated } from '../middlewares/auth.middleware';

const router = Router();
router.use(ensureAuthenticated);

// GET: Lista de logs de envio reais (Auditoria)
router.get('/logs', async (req, res): Promise<any> => {
  try {
    const { tenantId } = req.user!;
    const logs = await prisma.notificationLog.findMany({
      where: { tenant_id: tenantId },
      include: {
        event: {
          include: {
            client: true
          }
        }
      },
      orderBy: { data_envio: 'desc' },
      take: 50 // Limita aos últimos 50 disparos
    });

    return res.json(logs);
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao buscar histórico de envios.' });
  }
});

// GET: Estatísticas para o Dashboard
router.get('/stats', async (req, res): Promise<any> => {
  try {
    const { tenantId } = req.user!;
    
    // Contagem de regras pendentes (mensagens na fila)
    const pendingCount = await prisma.notificationRule.count({
      where: {
        status: 'PENDENTE',
        event: { tenant_id: tenantId }
      }
    });

    // Contagem de envios realizados com sucesso nas últimas 24h
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const sentCount = await prisma.notificationLog.count({
      where: {
        tenant_id: tenantId,
        data_envio: { gte: last24h },
        status_envio: 'ENVIADO'
      }
    });

    // Contagem de falhas (mensagens com ERRO)
    const errorCount = await prisma.notificationLog.count({
      where: {
        tenant_id: tenantId,
        status_envio: 'ERRO'
      }
    });

    return res.json({
      pending: pendingCount,
      sent_24h: sentCount,
      errors: errorCount
    });
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao calcular estatísticas.' });
  }
});

// GET: Estatísticas semanais para o Gráfico do Dashboard
router.get('/chart-stats', async (req, res): Promise<any> => {
  try {
    const { tenantId } = req.user!;
    const last7Days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
    // Busca os logs de envio bem sucedidos da última semana
    const logs = await prisma.notificationLog.findMany({
      where: {
        tenant_id: tenantId,
        status_envio: 'ENVIADO',
        data_envio: { gte: last7Days }
      },
      select: { data_envio: true }
    });

    // Agrupamento por dia (no formato DD/MM)
    const chartDataMap: Record<string, number> = {};
    
    // Inicializa os últimos 7 dias com 0 para o gráfico não ficar vazio
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const label = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      chartDataMap[label] = 0;
    }

    // Preenche com os dados reais do banco
    logs.forEach(log => {
      const label = new Date(log.data_envio).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      if (chartDataMap[label] !== undefined) {
        chartDataMap[label]++;
      }
    });

    const chartData = Object.entries(chartDataMap).map(([date, total]) => ({
      date,
      total
    }));

    return res.json(chartData);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erro ao gerar dados do gráfico.' });
  }
});

// GET: Gatilho manual para TESTES (Força o envio das notificações programadas para hoje agora)
router.get('/test-trigger', async (req, res): Promise<any> => {
  try {
    const { tenantId } = req.user!;
    const { evolutionQueue } = require('../queue/evolution.queue');
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    const pendingRules = await prisma.notificationRule.findMany({
      where: {
        status: 'PENDENTE',
        data_programada_disparo: { lte: today },
        event: { tenant_id: tenantId }
      },
      include: {
        event: {
          include: { client: true, user: true, tenant: true }
        }
      }
    });

    if (pendingRules.length === 0) {
      return res.json({ message: 'Nenhuma notificação pendente para hoje neste escritório.' });
    }

    for (const rule of pendingRules) {
      const { event } = rule;
      const tenant = event.tenant;

      if (!tenant.evolution_instance_id) continue;
      
      const dataFormatada = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(event.data_hora_evento);

      if (rule.destinatario === 'CLIENTE' || rule.destinatario === 'AMBOS') {
        if (event.client && event.client.whatsapp) {
          const msg = `[TESTE REAL] Olá ${event.client.nome_completo}! Lembrete do evento: ${event.titulo} às ${dataFormatada}.`;
          await evolutionQueue.add('send-message-client', {
            numero_destino: event.client.whatsapp,
            conteudo_mensagem: msg,
            evolution_instance_id: tenant.evolution_instance_id
          });
          await prisma.notificationLog.create({
            data: {
              tenant_id: tenantId,
              event_id: event.id,
              numero_destino: event.client.whatsapp,
              conteudo_mensagem: msg,
              status_envio: 'ENVIADO'
            }
          });
        }
      }

      await prisma.notificationRule.update({
        where: { id: rule.id },
        data: { status: 'EXECUTADA' }
      });
    }

    return res.json({ message: `Sucesso! ${pendingRules.length} notificações foram enviadas para a fila e registradas no histórico.` });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erro ao disparar teste manual.' });
  }
});

// POST: Disparo imediato + agendamento inteligente de lembretes
router.post('/send-now', async (req, res): Promise<any> => {
  try {
    const { tenantId } = req.user!;
    const { event_id } = req.body;
    const { evolutionQueue } = require('../queue/evolution.queue');
    const { buildMessage } = require('../jobs/notification.job');

    if (!event_id) return res.status(400).json({ error: 'event_id é obrigatório.' });

    const event = await prisma.event.findFirst({
      where: { id: event_id, tenant_id: tenantId },
      include: { client: true, user: true, tenant: true }
    });

    if (!event) return res.status(404).json({ error: 'Evento não encontrado.' });
    if (!event.tenant.evolution_instance_id) {
      return res.status(400).json({ error: 'Instância de WhatsApp não configurada. Vá em Gestão de WhatsApp.' });
    }
    if (!event.client?.whatsapp) {
      return res.status(400).json({ error: 'Cliente sem número de WhatsApp cadastrado.' });
    }

    const dataFormatada = new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'full', timeStyle: 'short', timeZone: 'America/Sao_Paulo'
    }).format(event.data_hora_evento);

    // ── 1. Confirmação imediata (sempre enviada) ──────────────────────────────
    const msgConfirmacao = buildMessage(event.tipo_evento, event.client.nome_completo, event.titulo, dataFormatada, 'confirmacao');

    await evolutionQueue.add('send-confirmation', {
      numero_destino: event.client.whatsapp,
      conteudo_mensagem: msgConfirmacao,
      evolution_instance_id: event.tenant.evolution_instance_id,
      tenant_id: tenantId,
      event_id: event.id
    });

    await prisma.notificationLog.create({
      data: { tenant_id: tenantId, event_id: event.id, numero_destino: event.client.whatsapp, conteudo_mensagem: msgConfirmacao, status_envio: 'ENVIADO' }
    });

    // ── 2. Agendamento inteligente de lembretes ───────────────────────────────
    const horasAteEvento = (event.data_hora_evento.getTime() - Date.now()) / (1000 * 60 * 60);
    const dataEvento = new Date(event.data_hora_evento);
    const lembretesAgendados: string[] = [];

    if (horasAteEvento > 24) {
      // Lembrete D-0: às 7h do dia do evento
      const lembreteD0 = new Date(dataEvento);
      lembreteD0.setHours(7, 0, 0, 0);
      if (lembreteD0 > new Date()) {
        await prisma.notificationRule.create({
          data: { event_id: event.id, dias_antecedencia: 0, destinatario: 'CLIENTE', status: 'PENDENTE', data_programada_disparo: lembreteD0 }
        });
        lembretesAgendados.push('Lembrete no dia do evento às 7h');
      }
    }

    if (horasAteEvento > 48) {
      // Lembrete D-2: às 7h de 2 dias antes
      const lembreteD2 = new Date(dataEvento);
      lembreteD2.setDate(lembreteD2.getDate() - 2);
      lembreteD2.setHours(7, 0, 0, 0);
      if (lembreteD2 > new Date()) {
        await prisma.notificationRule.create({
          data: { event_id: event.id, dias_antecedencia: 2, destinatario: 'CLIENTE', status: 'PENDENTE', data_programada_disparo: lembreteD2 }
        });
        lembretesAgendados.push('Lembrete 2 dias antes às 7h');
      }
    }

    return res.json({
      success: true,
      message: 'Confirmação enviada!',
      lembretes: lembretesAgendados.length > 0 ? lembretesAgendados : ['Evento no mesmo dia — apenas confirmação enviada']
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erro ao processar notificação.' });
  }
});

// POST: Envia uma mensagem de teste direto para um número (sem precisar de evento)
router.post('/test-message', async (req, res): Promise<any> => {
  try {
    const { tenantId } = req.user!;
    const { numero } = req.body;
    const { evolutionQueue } = require('../queue/evolution.queue');

    if (!numero) return res.status(400).json({ error: 'Informe o número de destino.' });

    // Normalização: remove tudo que não for dígito e garante o prefixo 55 (Brasil)
    let numeroLimpo = numero.replace(/\D/g, '');
    if (!numeroLimpo.startsWith('55')) {
      numeroLimpo = `55${numeroLimpo}`;
    }

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });

    if (!tenant?.evolution_instance_id) {
      return res.status(400).json({ error: 'Instância de WhatsApp não configurada. Conecte o WhatsApp primeiro.' });
    }

    const agora = new Intl.DateTimeFormat('pt-BR', { 
      dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' 
    }).format(new Date());

    const mensagem = `🤖 *Teste do Sistema SimJuris*\n\n✅ Olá! Esta é uma mensagem de teste disparada diretamente pela plataforma.\n\n📋 *Simulação de Lembrete de Compromisso*\n🗓️ Audiência de Teste - Hoje às ${agora.split(' ')[1]}\n\n_Se você recebeu esta mensagem, o motor de notificações está funcionando corretamente!_ 🚀`;

    await evolutionQueue.add('send-test-message', {
      numero_destino: numeroLimpo,
      conteudo_mensagem: mensagem,
      evolution_instance_id: tenant.evolution_instance_id
    });

    return res.json({ success: true, message: `Mensagem de teste enviada para +${numeroLimpo}!` });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erro ao enviar mensagem de teste.' });
  }
});

export default router;

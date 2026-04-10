import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../server';
import { ensureAuthenticated } from '../middlewares/auth.middleware';

const router = Router();
router.use(ensureAuthenticated); // 🔒 Todas as rotas daqui precisam de autenticação

// Criar novo compromisso/evento com regra de disparo antecipado
router.post('/', async (req, res): Promise<any> => {
  try {
    const createEventSchema = z.object({
      titulo: z.string().min(3, 'Título obrigatório'),
      client_id: z.string().optional(),
      descricao: z.string().optional(),
      numero_processo: z.string().optional(),
      local_link: z.string().optional(),
      omit_location: z.boolean().default(false),
      tipo_evento: z.string().default('PRAZO'),
      natureza: z.string().default('JUDICIAL'),
      fase_administrativa: z.string().nullable().optional(),
      instancia_judicial: z.string().nullable().optional(),
      data_hora_evento: z.string().datetime({ message: 'Data inválida. Use o formato ISO (ex: 2026-05-15T15:00:00Z)' }),
      antecedencia_aviso_horas: z.number().default(24) // Novo formato recebido do front
    });

    const parsed = createEventSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0].message });
    }

    const { 
      titulo, client_id, descricao, numero_processo, local_link, omit_location, 
      tipo_evento, natureza, fase_administrativa, instancia_judicial, 
      data_hora_evento, antecedencia_aviso_horas 
    } = parsed.data;
    const { tenantId, userId } = req.user!;

    // Motor de Agendamento: Calcular a Data exata em que a mensagem do WhatsApp deve ser enviada
    // Baseado na data_hora_evento subtraindo as horas de antecedência configuradas pelo Advogado.
    const eventDate = new Date(data_hora_evento);
    const triggerDate = new Date(eventDate.getTime() - (antecedencia_aviso_horas * 60 * 60 * 1000));

    const event = await prisma.event.create({
      data: {
        tenant_id: tenantId,
        user_id_responsavel: userId,
        titulo,
        descricao,
        numero_processo,
        local_link,
        omit_location,
        tipo_evento,
        natureza,
        fase_administrativa,
        instancia_judicial,
        client_id,
        data_hora_evento: eventDate,
        // O status "AGENDADO" será salvo automaticamente pelo default do Prisma
        // Prisma executa uma inserção Atômica, criando o Evento E já atrelando a ele uma Regra de Notificação
        // Motor de Agendamento Elite: Criar 2 regras (D-1 e H-1)
        notification_rules: {
          create: [
            {
              // Regra 1: Lembrete de Véspera (D-1 às 08:00)
              dias_antecedencia: 1,
              data_programada_disparo: (() => {
                const trigger = new Date(eventDate);
                trigger.setDate(trigger.getDate() - 1);
                trigger.setHours(8, 0, 0, 0);
                return trigger > new Date() ? trigger : new Date(); // Garante objeto Date válido
              })(),
              destinatario: "AMBOS"
            },
            {
              // Regra 2: Lembrete de Proximidade (H-1)
              dias_antecedencia: 0,
              data_programada_disparo: new Date(eventDate.getTime() - (1 * 60 * 60 * 1000)),
              destinatario: "AMBOS"
            }
          ]
        }
      },
      include: {
        client: true,
        notification_rules: true
      }
    });

    return res.status(201).json(event);
  } catch (error) {
    console.error('Erro na criação de evento:', error);
    return res.status(500).json({ error: 'Erro interno no servidor' });
  }
});

// Listar agenda do Escritório (Tenant) ativo e blindado. Usuários não vêem informações de outros escritórios.
router.get('/', async (req, res): Promise<any> => {
  try {
    const { tenantId } = req.user!;
    
    // Pode ser dinâmico filtrando por query params (?startDate=...&endDate=...) na UI Front-end posteriormente
    const events = await prisma.event.findMany({
      where: { tenant_id: tenantId },
      include: {
        client: true,
        user: { select: { nome: true, email: true } },
        notification_rules: true,
        notification_logs: {
          orderBy: { data_envio: 'desc' },
          take: 5
        }
      },
      orderBy: { data_hora_evento: 'asc' }
    });

    return res.json(events);
  } catch (error) {
    return res.status(500).json({ error: 'Erro interno no servidor' });
  }
});

// Outras rotas DELETE e UPDATE poderemos inserir depois
// Atualizar status de um evento (Concluir/Cancelar)
router.patch('/:id/status', async (req, res): Promise<any> => {
  try {
    const { tenantId } = req.user!;
    const { id } = req.params;
    const { status, sendFeedback } = req.body; // status: 'CONCLUIDO' | 'CANCELADO' | 'AGENDADO'
    const { evolutionQueue } = require('../queue/evolution.queue');

    if (!['CONCLUIDO', 'CANCELADO', 'AGENDADO'].includes(status)) {
      return res.status(400).json({ error: 'Status inválido.' });
    }

    // 1. Atualizar o evento
    const event = await prisma.event.update({
      where: { id, tenant_id: tenantId },
      data: { status },
      include: { client: true, tenant: true }
    });

    // 2. Se não for mais "AGENDADO", cancelamos as notificações futuras
    if (status !== 'AGENDADO') {
      await prisma.notificationRule.updateMany({
        where: { event_id: id, status: 'PENDENTE' },
        data: { status: 'EXECUTADA' } // Marcamos como executada para o job ignorar
      });
    }

    // 3. Opcional: Enviar mensagem de feedback/agradecimento ao concluir
    if (status === 'CONCLUIDO' && sendFeedback && event.client?.whatsapp) {
      const feedbackLink = event.local_link || event.tenant.google_maps_link || 'https://maps.google.com';
      const msg = `✅ *Compromisso Finalizado!*\n\nOlá, *${event.client.nome_completo}*! ⚖️⭐\n\nFoi um prazer representar seus interesses no compromisso *"${event.titulo}"*.\n\nSua opinião é fundamental para nós! Você poderia avaliar nosso atendimento no link abaixo? Leva menos de 30 segundos! 🙏\n\n🔗 *Avalie aqui:* ${feedbackLink}\n\nMuito obrigado pela confiança!\n*Equipe ${event.tenant.nome_fantasia || 'SimJuris'}* 🏛️`;

      await evolutionQueue.add('send-message-client', {
        numero_destino: event.client.whatsapp,
        conteudo_mensagem: msg,
        evolution_instance_id: event.tenant.evolution_instance_id,
        tenant_id: tenantId,
        event_id: event.id
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

    return res.json({ success: true, event });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erro ao atualizar status do evento.' });
  }
});

export default router;

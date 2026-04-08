import cron from 'node-cron';
import { prisma } from '../server';
import { evolutionQueue } from '../queue/evolution.queue';

// ─── Helpers ────────────────────────────────────────────────────────────────

// Verifica anti-spam: máx 2 mensagens/dia por número, intervalo mínimo de 4h
const canSendToNumber = async (tenantId: string, numero: string): Promise<{ ok: boolean; reason?: string }> => {
  const inicioDia = new Date();
  inicioDia.setHours(0, 0, 0, 0);

  const msgHoje = await prisma.notificationLog.count({
    where: { tenant_id: tenantId, numero_destino: numero, data_envio: { gte: inicioDia } }
  });
  if (msgHoje >= 2) return { ok: false, reason: `Anti-spam: ${numero} já recebeu 2 mensagens hoje.` };

  const ultimas4h = new Date(Date.now() - 4 * 60 * 60 * 1000);
  const msgRecente = await prisma.notificationLog.count({
    where: { tenant_id: tenantId, numero_destino: numero, data_envio: { gte: ultimas4h } }
  });
  if (msgRecente >= 1) return { ok: false, reason: `Anti-spam: ${numero} recebeu mensagem há menos de 4h.` };

  return { ok: true };
};

// Mensagem personalizada por tipo de evento e contexto
export const buildMessage = (
  tipo: string,
  nomeCliente: string,
  titulo: string,
  dataFormatada: string,
  contexto: 'confirmacao' | 'lembrete_d2' | 'lembrete_d0',
  tenant?: any 
): string => {
  const { parseTemplate } = require('../utils/template');
  
  // 1. Preparação das Variáveis para o Template
  // Exemplo de dataFormatada: "15/05/2026 15:00"
  const parts = dataFormatada.split(' ');
  const dataStr = parts[0] || '';
  const horaStr = parts[1] || '';
  const emoji = tipo === 'PRAZO' ? '⚖️' : tipo === 'AUDIENCIA' ? '🏛️' : '🤝';

  const variables = {
    cliente: nomeCliente,
    titulo: titulo,
    data: dataStr,
    hora: horaStr,
    emoji: emoji,
    escritorio: tenant?.nome_fantasia || 'SimJuris',
    localizacao: tenant?.google_maps_link || ''
  };

  // 2. Tentativa de usar Template Customizado do Banco
  let customTemplate = '';
  if (contexto === 'confirmacao') {
    if (tipo === 'PRAZO') customTemplate = tenant?.template_confirmacao_prazo;
    else if (tipo === 'AUDIENCIA') customTemplate = tenant?.template_confirmacao_audiencia;
    else customTemplate = tenant?.template_confirmacao_reuniao;
  } else if (contexto === 'lembrete_d2') {
    customTemplate = tenant?.template_lembrete_d2;
  } else if (contexto === 'lembrete_d0') {
    customTemplate = tenant?.template_lembrete_d0;
  }

  // Se o advogado configurou um template, usamos ele!
  if (customTemplate) {
    return parseTemplate(customTemplate, variables);
  }

  // 3. Fallback: Lógica de Elite SimJuris (Hardcoded)
  const mapsLink = tenant?.google_maps_link ? `\n\n📍 *Localização:* ${tenant.google_maps_link}` : '';
  const assinatura = `\n\nAtenciosamente,\n*Equipe ${tenant?.nome_fantasia || 'SimJuris'}* ⚖️`;

  if (contexto === 'confirmacao') {
    if (tipo === 'PRAZO') {
      return `${emoji} *Protocolo Realizado*\n\nPrezado(a) *${nomeCliente}*,\n\nInformamos que o compromisso *"${titulo}"* foi registrado com sucesso para o dia *${dataStr}* às *${horaStr}*.\n\nFique tranquilo(a)! Nossa equipe jurídica já está acompanhando todos os prazos. ✅${assinatura}`;
    }
    if (tipo === 'AUDIENCIA') {
      return `${emoji} *Audiência Agendada*\n\nOlá, *${nomeCliente}*!\n\nConfirmamos que sua audiência *"${titulo}"* está marcada para:\n🗓️ Data: *${dataStr}*\n🕒 Horário: *${horaStr}*${mapsLink}\n\nRecomendamos chegar com 15 minutos de antecedência. Conte conosco! 🤝${assinatura}`;
    }
    return `${emoji} *Reunião Confirmada*\n\nOlá, *${nomeCliente}*!\n\nSua reunião *"${titulo}"* foi agendada para *${dataStr}* às *${horaStr}*${mapsLink}.\n\nQualquer dúvida, estamos à disposição. Até lá! 😊${assinatura}`;
  }

  if (contexto === 'lembrete_d2') {
    return `⏳ *Lembrete de Compromisso*\n\nOlá, *${nomeCliente}*!\n\nPassamos para lembrar que seu compromisso *"${titulo}"* acontecerá em 48 horas (*${dataStr}* às *${horaStr}*)${mapsLink}.\n\nCaso tenha alguma dúvida sobre os documentos necessários, entre em contato. ✅${assinatura}`;
  }

  // lembrete_d0 (HOJE)
  return `🔥 *É Hoje! Lembrete Urgente*\n\nOlá, *${nomeCliente}*!\n\nLembramos que seu compromisso *"${titulo}"* está marcado para hoje, às *${horaStr}*${mapsLink}.\n\nSucesso e conte com nossa equipe para garantir seus direitos! 📋🏛️${assinatura}`;
};

// ─── CRON: Roda às 08:00 (horário de Brasília) ───────────────────────────────
cron.schedule('0 8 * * *', async () => {
  console.log('[CRON] ⏰ Iniciando varredura diária às 08:00...');
  try {
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    const pendingRules = await prisma.notificationRule.findMany({
      where: { status: 'PENDENTE', data_programada_disparo: { lte: today } },
      include: { event: { include: { client: true, user: true, tenant: true } } }
    });

    if (pendingRules.length === 0) {
      console.log('[CRON] ☕ Nenhuma notificação pendente para hoje.');
      return;
    }

    console.log(`[CRON] Processando ${pendingRules.length} regras pendentes...`);

    for (const rule of pendingRules) {
      const { event } = rule;
      const tenant = event.tenant;
      if (!tenant.evolution_instance_id) continue;

      const dataFormatada = new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo'
      }).format(event.data_hora_evento);

      // Contexto pela antecedência armazenada na regra
      const contexto: 'lembrete_d0' | 'lembrete_d2' = rule.dias_antecedencia === 2 ? 'lembrete_d2' : 'lembrete_d0';

      // ── Envio para o CLIENTE ──────────────────────────────────────────────
      if ((rule.destinatario === 'CLIENTE' || rule.destinatario === 'AMBOS') && event.client?.whatsapp) {
        const spam = await canSendToNumber(tenant.id, event.client.whatsapp);

        if (!spam.ok) {
          console.warn(`[CRON] ⏭️ Pulando ${event.client.nome_completo}: ${spam.reason}`);
        } else {
          const msg = buildMessage(event.tipo_evento, event.client.nome_completo, event.titulo, dataFormatada, contexto, tenant);
          await evolutionQueue.add('send-message-client', {
            numero_destino: event.client.whatsapp,
            conteudo_mensagem: msg,
            evolution_instance_id: tenant.evolution_instance_id,
            tenant_id: tenant.id,
            event_id: event.id
          });
          await prisma.notificationLog.create({
            data: { tenant_id: tenant.id, event_id: event.id, numero_destino: event.client.whatsapp, conteudo_mensagem: msg, status_envio: 'ENVIADO' }
          });
        }
      }

      // ── Envio para o ADVOGADO ─────────────────────────────────────────────
      if ((rule.destinatario === 'ADVOGADO' || rule.destinatario === 'AMBOS') && event.user?.telefone) {
        const msg = `⚠️ *SISTEMA LEGALMEMO*\n\nDr(a). *${event.user.nome}*, o evento *"${event.titulo}"* está programado para *${dataFormatada}*.\nVerifique os documentos e protocolos necessários.`;
        await evolutionQueue.add('send-message-lawyer', {
          numero_destino: event.user.telefone,
          conteudo_mensagem: msg,
          evolution_instance_id: tenant.evolution_instance_id,
          tenant_id: tenant.id,
          event_id: event.id
        });
        await prisma.notificationLog.create({
          data: { tenant_id: tenant.id, event_id: event.id, numero_destino: event.user.telefone, conteudo_mensagem: msg, status_envio: 'ENVIADO' }
        });
      }

      await prisma.notificationRule.update({ where: { id: rule.id }, data: { status: 'EXECUTADA' } });
    }

    console.log('[CRON] ✅ Varredura finalizada. Fila engatilhada com sucesso.');
  } catch (error) {
    console.error('[CRON] ❌ Erro crítico na varredura:', error);
  }
}, { timezone: 'America/Sao_Paulo' });

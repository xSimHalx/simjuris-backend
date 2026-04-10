import cron from 'node-cron';
import { prisma } from '../server';
import { evolutionQueue } from '../queue/evolution.queue';

// ─── Helpers ────────────────────────────────────────────────────────────────

// Verifica anti-spam: máx 4 mensagens/dia por número, intervalo mínimo de 1h para sequências de elite
const canSendToNumber = async (tenantId: string, numero: string): Promise<{ ok: boolean; reason?: string }> => {
  const inicioDia = new Date();
  inicioDia.setHours(0, 0, 0, 0);

  const msgHoje = await prisma.notificationLog.count({
    where: { tenant_id: tenantId, numero_destino: numero, data_envio: { gte: inicioDia } }
  });
  if (msgHoje >= 4) return { ok: false, reason: `Anti-spam: ${numero} já recebeu 4 mensagens hoje.` };

  const ultima1h = new Date(Date.now() - 60 * 60 * 1000); // Reduzido de 4h para 1h para suportar a régua Elite
  const msgRecente = await prisma.notificationLog.count({
    where: { tenant_id: tenantId, numero_destino: numero, data_envio: { gte: ultima1h } }
  });
  if (msgRecente >= 1) return { ok: false, reason: `Anti-spam: ${numero} recebeu mensagem há menos de 1h.` };

  return { ok: true };
};

// Mensagem personalizada por tipo de evento e contexto
export const buildMessage = (
  tipo: string,
  nomeCliente: string,
  titulo: string,
  dataFormatada: string,
  contexto: 'confirmacao' | 'lembrete_d1' | 'lembrete_h1' | 'avaliacao',
  tenant?: any,
  localizacaoEvento?: string | null,
  omitirLocalizacao?: boolean // Novo parâmetro de privacidade
): string => {
  const { parseTemplate } = require('../utils/template');
  
  // 1. Preparação das Variáveis para o Template
  const parts = dataFormatada.split(' ');
  const dataStr = parts[0] || '';
  const horaStr = parts[1] || '';
  const emoji = tipo === 'PRAZO' ? '⚖️' : tipo === 'AUDIENCIA' ? '🏛️' : '🤝';

  // Lógica de Supressão: Se omitirLocalizacao for true, o link fica vazio
  const linkEfetivo = omitirLocalizacao ? '' : (localizacaoEvento || tenant?.google_maps_link || '');

  const variables = {
    cliente: nomeCliente,
    titulo: titulo,
    data: dataStr,
    hora: horaStr,
    emoji: emoji,
    escritorio: tenant?.nome_fantasia || 'SimJuris',
    localizacao: linkEfetivo
  };

  // 2. Tentativa de usar Template Customizado do Banco
  let customTemplate = '';
  if (contexto === 'confirmacao') {
    if (tipo === 'PRAZO') customTemplate = tenant?.template_confirm_prazo;
    else if (tipo === 'AUDIENCIA') customTemplate = tenant?.template_confirm_audiencia;
    else customTemplate = tenant?.template_confirm_reuniao;
  } else if (contexto === 'lembrete_d1') {
    customTemplate = tenant?.template_lembrete_d1 || tenant?.template_lembrete_d2;
  } else if (contexto === 'lembrete_h1') {
    customTemplate = tenant?.template_lembrete_h1 || tenant?.template_lembrete_d0;
  }

  // Se o advogado configurou um template, usamos ele!
  if (customTemplate) {
    return parseTemplate(customTemplate, variables);
  }

  // 3. Fallback: Lógica de Elite SimJuris (Hardcoded)
  const mapsLink = linkEfetivo ? `\n\n📍 *Localização:* ${linkEfetivo}` : '';
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

  if (contexto === 'lembrete_d1') {
    return `⏳ *Lembrete de Compromisso*\n\nOlá, *${nomeCliente}*!\n\nPassamos para lembrar que seu compromisso *"${titulo}"* acontecerá amanhã (*${dataStr}* às *${horaStr}*)${mapsLink}.\n\nCaso tenha alguma dúvida, estamos à disposição. ✅${assinatura}`;
  }

  // lembrete_h1 (PROXIMIDADE)
  if (contexto === 'lembrete_h1') {
    return `🚀 *Estamos chegando!*\n\nOlá, *${nomeCliente}*!\n\nPassamos para avisar que seu compromisso *"${titulo}"* começará em exatos *60 minutos* (*${horaStr}*)${mapsLink}.\n\nJá estamos com tudo pronto para lhe atender. Até breve! 🏛️${assinatura}`;
  }

  // ── Contexto: AVALIAÇÃO (Feedback Elite) ─────────────────────────
  const linkMaps = linkEfetivo || 'https://google.com/maps';
  return `✅ *Compromisso Finalizado!*\n\nOlá, *${nomeCliente}*! ⚖️⭐\n\nFoi um prazer representar seus interesses no compromisso *"${titulo}"*.\n\nSua opinião é fundamental para nós! Você poderia avaliar nosso atendimento no link abaixo? Leva menos de 30 segundos! 🙏\n\n🔗 *Avalie aqui:* ${linkMaps}\n\nMuito obrigado pela confiança!\n*Equipe ${variables.escritorio}* 🏛️`;
};

// ─── CRON: Roda às 08:00 (horário de Brasília) ───────────────────────────────
// ─── CRON: Roda a cada 30 minutos para capturar lembretes de proximidade ──────────────────────────
cron.schedule('*/30 * * * *', async () => {
  console.log('[CRON] ⏰ Iniciando varredura da Régua Elite (a cada 30 min)...');
  try {
    const now = new Date();
    // Pegamos tudo o que deveria ter sido enviado até agora
    const pendingRules = await prisma.notificationRule.findMany({
      where: { status: 'PENDENTE', data_programada_disparo: { lte: now } },
      include: { event: { include: { client: true, user: true, tenant: true } } }
    });

    if (pendingRules.length === 0) {
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

      // Decidir o contexto baseado na proximidade do evento
      const diffMinutes = Math.floor((event.data_hora_evento.getTime() - rule.data_programada_disparo.getTime()) / (1000 * 60));
      const contexto = diffMinutes <= 90 ? 'lembrete_h1' : 'lembrete_d1';

      // ── Envio para o CLIENTE ──────────────────────────────────────────────
      if ((rule.destinatario === 'CLIENTE' || rule.destinatario === 'AMBOS') && event.client?.whatsapp) {
        const spam = await canSendToNumber(tenant.id, event.client.whatsapp);

        if (!spam.ok) {
          console.warn(`[CRON] ⏭️ Pulando ${event.client.nome_completo}: ${spam.reason}`);
        } else {
          const msg = buildMessage(
            event.tipo_evento, 
            event.client.nome_completo, 
            event.titulo, 
            dataFormatada, 
            contexto, 
            tenant,
            event.local_link, // Passando a localização específica do evento
            event.omit_location // Passando flag de privacidade
          );
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

      // ── Envio para o ADVOGADO (Lembrete Interno) ──────────────────────────────────
      if ((rule.destinatario === 'ADVOGADO' || rule.destinatario === 'AMBOS') && event.user?.telefone) {
        const msg = `⚠️ *SIMJURIS ELITE*\n\nDr(a). *${event.user.nome}*, o evento *"${event.titulo}"* está programado para *${dataFormatada}*.\nJá notificamos o seu cliente. ✅`;
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

    console.log('[CRON] ✅ Varredura finalizada.');
  } catch (error) {
    console.error('[CRON] ❌ Erro crítico na varredura:', error);
  }
}, { timezone: 'America/Sao_Paulo' });

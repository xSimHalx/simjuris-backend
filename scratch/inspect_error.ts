import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function inspectError() {
  try {
    const errorLog = await prisma.notificationLog.findFirst({
      where: { status_envio: 'ERRO' },
      orderBy: { data_envio: 'desc' },
      include: {
        event: {
          include: {
            client: true
          }
        }
      }
    });

    if (!errorLog) {
      console.log('Nenhum log de erro encontrado.');
      return;
    }

    console.log('--- DIAGNÓSTICO DE FALHA ELITE ---');
    console.log(`Evento: ${errorLog.event.titulo}`);
    console.log(`Cliente: ${errorLog.event.client?.nome_completo}`);
    console.log(`Destino: ${errorLog.numero_destino}`);
    console.log(`Data da Falha: ${errorLog.data_envio.toLocaleString('pt-BR')}`);
    console.log(`Conteúdo: ${errorLog.conteudo_mensagem.substring(0, 100)}...`);
    console.log('-----------------------------------');
  } catch (err) {
    console.error('Erro no diagnóstico:', err);
  } finally {
    await prisma.$disconnect();
  }
}

inspectError();

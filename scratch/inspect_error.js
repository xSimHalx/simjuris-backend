const { PrismaClient } = require('@prisma/client');

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
    console.log(`Cliente: ${errorLog.event.client?.nome_completo || 'N/A'}`);
    console.log(`Destino: ${errorLog.numero_destino}`);
    console.log(`Data da Falha: ${errorLog.data_envio.toLocaleString('pt-BR')}`);
    console.log(`Status Anterior: ${errorLog.status_envio}`);
    console.log('-----------------------------------');
  } catch (err) {
    console.error('Erro no diagnóstico:', err);
  } finally {
    await prisma.$disconnect();
  }
}

inspectError();

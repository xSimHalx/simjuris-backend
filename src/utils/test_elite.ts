import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function verify() {
  console.log('--- Verificando Regras da Automação Elite ---');
  
  const lastEvent = await prisma.event.findFirst({
    orderBy: { created_at: 'desc' },
    include: { notification_rules: true }
  });

  if (!lastEvent) {
    console.log('Nenhum evento encontrado para teste.');
    return;
  }

  console.log(`Evento: ${lastEvent.titulo}`);
  console.log(`Data/Hora: ${lastEvent.data_hora_evento}`);
  console.log(`Regras Agendadas (${lastEvent.notification_rules.length}):`);
  
  lastEvent.notification_rules.forEach((rule, index) => {
    console.log(`  [Regra ${index + 1}]`);
    console.log(`  - Antecedência: ${rule.dias_antecedencia} dia(s)`);
    console.log(`  - Data Programada: ${rule.data_programada_disparo}`);
    console.log(`  - Status: ${rule.status}`);
  });
}

verify().finally(() => prisma.$disconnect());

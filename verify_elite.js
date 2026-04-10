const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function verify() {
  console.log('--- Verificando Regras da Automação Elite ---');
  
  const lastEvent = await prisma.event.findFirst({
    where: { titulo: 'TESTE AUTOMACAO ELITE' },
    orderBy: { created_at: 'desc' },
    include: { notification_rules: true }
  });

  if (!lastEvent) {
    console.log('Evento de teste não encontrado.');
    return;
  }

  console.log(`Evento: ${lastEvent.titulo}`);
  console.log(`Data do Evento: ${lastEvent.data_hora_evento}`);
  console.log(`Regras Encontradas: ${lastEvent.notification_rules.length}`);
  
  lastEvent.notification_rules.sort((a,b) => a.data_programada_disparo - b.data_programada_disparo).forEach((rule, index) => {
    console.log(`\n[Regra ${index + 1}]`);
    console.log(`- Data do Disparo: ${rule.data_programada_disparo}`);
    console.log(`- Antecedência: ${rule.dias_antecedencia} dia(s)`);
    console.log(`- Status: ${rule.status}`);
  });
}

verify().finally(() => prisma.$disconnect());

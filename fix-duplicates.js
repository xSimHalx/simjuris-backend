const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Limpando documentos duplicados para permitir a trava UNIQUE...');
  
  // Pegar todos os clientes que têm documento '00000000000'
  const clients = await prisma.client.findMany({
    where: { documento: '00000000000' }
  });

  // Atualizar cada um para null ou algo único se houver mais de um por tenant
  for (const client of clients) {
    // Vamos apenas remover o valor padrão e deixar null onde for duplicado
    // Na verdade, para o UNIQUE funcionar, se o valor for preenchido, deve ser único.
    // Mas se houver múltiplos '00000000000' para o MESMO tenant, vai dar erro.
    
    // Vamos transformar '00000000000' em NULL para evitar o conflito do UNIQUE
    // (Postgres permite múltiplos NULLs em índices UNIQUE)
    await prisma.client.update({
      where: { id: client.id },
      data: { documento: null }
    });
  }
  
  console.log('Limpeza concluída.');
}

main().catch(console.error).finally(() => prisma.$disconnect());

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const duplicatesWhatsapp = await prisma.$queryRaw`
    SELECT "tenant_id", "whatsapp", COUNT(*) 
    FROM "clients" 
    GROUP BY "tenant_id", "whatsapp" 
    HAVING COUNT(*) > 1;
  `;

  const duplicatesDoc = await prisma.$queryRaw`
    SELECT "tenant_id", "documento", COUNT(*) 
    FROM "clients" 
    GROUP BY "tenant_id", "documento" 
    HAVING COUNT(*) > 1
    AND "documento" IS NOT NULL
    AND "documento" != '00000000000';
  `;

  console.log('WhatsApp Duplicates:', duplicatesWhatsapp);
  console.log('Document Duplicates:', duplicatesDoc);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

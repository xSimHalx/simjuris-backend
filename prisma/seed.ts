import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando seed do banco de dados...');

  const tenantCNPJ = '12345678000199';
  
  // 1. Criar ou encontrar Tenant (Escritório)
  const tenant = await prisma.tenant.upsert({
    where: { documento_cnpj_cpf: tenantCNPJ },
    update: {},
    create: {
      nome_fantasia: 'Escritório Teste & Advogados',
      documento_cnpj_cpf: tenantCNPJ,
      evolution_instance_id: 'instancia_teste_01',
      config_fluxos: [
        {
          id: 'judicial_01',
          nome: 'JUDICIAL',
          tipos: [
            { nome: "AUDIÊNCIA", sub_label: "Tipo de Audiência", sub_items: ["Instrução", "Conciliação", "Una"] },
            { nome: "PRAZO", sub_label: "Instância", sub_items: ["1ª Instância", "2ª Instância", "Tribunais Superiores"] },
            { nome: "CARTÓRIO", sub_label: "Finalidade", sub_items: ["Protocolo", "Assinatura", "Retirada"] }
          ]
        },
        {
          id: 'administrativo_01',
          nome: 'ADMINISTRATIVO',
          tipos: [
            { nome: "PERÍCIA", sub_label: "Fase da Perícia", sub_items: ["Médica", "Social", "Técnica"] },
            { nome: "RECURSO", sub_label: "Status Administrativo", sub_items: ["Protocolado", "Aguardando", "Negado"] },
            { nome: "REUNIÃO", sub_label: "Pauta", sub_items: ["Fechamento", "Pós-Perícia", "Entrevista"] }
          ]
        }
      ]
    }
  });
  
  console.log(`✅ Tenant criado: ${tenant.nome_fantasia} (ID: ${tenant.id})`);

  // 2. Criar Usuário Admin
  const adminEmail = 'simhal2016@gmail.com';
  // Verifica se o usuário já existe para não quebrar no upsert por campo único
  const existingUser = await prisma.user.findUnique({
    where: { email: adminEmail }
  });

  if (!existingUser) {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('123456', salt);

    const user = await prisma.user.create({
      data: {
        tenant_id: tenant.id,
        nome: 'Administrador Almeida',
        email: adminEmail,
        senha_hash: hashedPassword,
        role: 'ADMIN',
        telefone: '5511999999999'
      }
    });
    console.log(`✅ Usuário Admin criado: ${user.email} | Senha: 123456`);
  } else {
    console.log(`⚠️ Usuário Admin já existia: ${existingUser.email}`);
  }
  
  // 3. Criar um Cliente de Teste
  // Como cliente não tem unique no email (não tem campo email), verificamos se há clients para o tenant.
  const clientsCount = await prisma.client.count({
    where: { tenant_id: tenant.id }
  });

  if (clientsCount === 0) {
    const client = await prisma.client.create({
      data: {
        tenant_id: tenant.id,
        nome_completo: 'João da Silva (Cliente Teste)',
        documento: '11122233344',
        whatsapp: '5511912345678'
      }
    });
    console.log(`✅ Cliente criado: ${client.nome_completo}`);
  } else {
    console.log(`⚠️ Tenant já possui clientes cadastrados, ignorando cadastro de cliente de teste.`);
  }
  
  console.log('🚀 Seed concluído com sucesso!');
}

main()
  .catch((e) => {
    console.error('❌ Erro durante o seed do banco de dados:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

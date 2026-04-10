# Usar uma imagem leve do Node
FROM node:22-alpine AS builder

# Criar diretório de trabalho
WORKDIR /app

# Copiar arquivos de configuração
COPY package*.json ./
COPY tsconfig.json ./
COPY prisma ./prisma/

# Instalar dependências
RUN npm install

# Copiar o restante do código
COPY . .

# Gerar o Prisma Client e Buildar o projeto
RUN npx prisma generate
RUN npm run build

# --- Estágio de Produção ---
FROM node:22-alpine

WORKDIR /app

# Copiar apenas os arquivos necessários do builder
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts

# Porta exposta (mesma do .env)
EXPOSE 3333

# Comando para rodar as migrações e iniciar o servidor
# Nota: Em produção real, idealmente rodar migrations antes do deploy
CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]

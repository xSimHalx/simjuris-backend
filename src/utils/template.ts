/**
 * Utilitário para processar templates de mensagens dinâmicas do SimJuris.
 * Substitui tags no formato {{variavel}} pelos valores reais.
 */

interface TemplateVariables {
  cliente: string;
  titulo: string;
  data: string;
  hora: string;
  emoji: string;
  escritorio: string;
  localizacao?: string; // Link do Google Maps do escritório
}

export const parseTemplate = (template: string, variables: TemplateVariables): string => {
  let result = template;
  
  // Mapeamento de tags para valores
  const mapping: Record<string, string> = {
    'cliente': variables.cliente,
    'titulo': variables.titulo,
    'pauta': variables.titulo, // Alias para facilitar
    'data': variables.data,
    'hora': variables.hora,
    'emoji': variables.emoji,
    'escritorio': variables.escritorio,
    'localizacao': variables.localizacao || ''
  };

  // Substituição global de cada tag {{chave}}
  for (const [key, value] of Object.entries(mapping)) {
    const regex = new RegExp(`{{${key}}}`, 'gi');
    result = result.replace(regex, value || '');
  }

  return result;
};

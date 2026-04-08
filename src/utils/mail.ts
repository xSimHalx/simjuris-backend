import nodemailer from 'nodemailer';

/**
 * Utilitário para envio de e-mails via Nodemailer (Gmail SMTP)
 * Requer que o usuário gere uma 'Senha de App' no Google.
 */
export async function sendMail(to: string, subject: string, text: string, html?: string) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER, // Ex: seuemail@gmail.com
      pass: process.env.EMAIL_PASS, // Senha de App de 16 dígitos
    },
  });

  const mailOptions = {
    from: `"SimJuris" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    text,
    html,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`[Email] Enviado para ${to}: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`[Email] Erro ao enviar para ${to}:`, error);
    return { success: false, error };
  }
}

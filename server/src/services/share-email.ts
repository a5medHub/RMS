import type { SharePermission } from "@prisma/client";
import { env } from "../config/env.js";

type ShareEmailPayload = {
  recipientEmail: string;
  recipientName?: string | null;
  sharedByName: string;
  recipeName: string;
  permission: SharePermission;
  recipeUrl: string;
};

const smtpConfigured = () =>
  Boolean(
    env.SMTP_HOST
    && env.SMTP_PORT
    && env.SMTP_USER
    && env.SMTP_PASS
    && env.SMTP_FROM,
  );

export const sendShareNotificationEmail = async (payload: ShareEmailPayload) => {
  if (!smtpConfigured()) {
    return { sent: false, reason: "smtp_not_configured" as const };
  }

  try {
    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: Number(env.SMTP_PORT) === 465,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
      },
    });

    const recipientLabel = payload.recipientName ?? payload.recipientEmail;
    await transporter.sendMail({
      from: env.SMTP_FROM,
      to: payload.recipientEmail,
      subject: `${payload.sharedByName} shared a recipe with you`,
      text:
        `Hi ${recipientLabel},\n\n`
        + `${payload.sharedByName} shared "${payload.recipeName}" with you (${payload.permission}).\n`
        + `Open it here: ${payload.recipeUrl}\n\n`
        + "RMS Kitchen",
      html: `
        <p>Hi ${recipientLabel},</p>
        <p><strong>${payload.sharedByName}</strong> shared <strong>${payload.recipeName}</strong> with you (${payload.permission}).</p>
        <p><a href="${payload.recipeUrl}">Open recipe</a></p>
        <p>RMS Kitchen</p>
      `,
    });

    return { sent: true as const };
  } catch (error) {
    console.error("Failed to send share notification email", error);
    return { sent: false, reason: "send_failed" as const };
  }
};


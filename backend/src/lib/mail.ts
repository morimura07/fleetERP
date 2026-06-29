import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST ?? "localhost",
  port: Number(process.env.SMTP_PORT ?? 1025),
  secure: Number(process.env.SMTP_PORT) === 465,
  auth: process.env.SMTP_USER
    ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
    : undefined,
});

export async function sendMail(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}) {
  await transporter.sendMail({
    from: process.env.SMTP_FROM ?? "FleetFlow <no-reply@fleetflow.local>",
    ...opts,
  });
}

export async function sendPasswordResetEmail(to: string, resetUrl: string) {
  await sendMail({
    to,
    subject: "FleetFlow — Password Reset",
    text: `Reset your password using this link (valid for 1 hour):\n${resetUrl}`,
    html: `
      <div style="font-family:sans-serif;line-height:1.6">
        <h2>Password Reset</h2>
        <p>Use the button below to reset your password. The link is valid for <strong>1 hour</strong>.</p>
        <p><a href="${resetUrl}" style="background:#0f172a;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">Reset Password</a></p>
        <p>If you did not request this, please ignore this email.</p>
      </div>`,
  });
}

// Tiny SendGrid wrapper. Posts to the v3 mail/send endpoint over fetch
// — no SDK, no extra deps. Server-only: reads SENDGRID_API_KEY and
// SENDGRID_FROM from the environment and throws if either is missing.
// Call isConfigured() first if you want a soft check.
//
// Why SendGrid vs Resend: SendGrid's free tier supports Single Sender
// Verification, which lets us authenticate a single email address as
// the sender (click-a-link flow) without owning a custom domain.
// Resend requires full domain verification (SPF/DKIM DNS records).

const SENDGRID_ENDPOINT = "https://api.sendgrid.com/v3/mail/send";

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export function isConfigured(): boolean {
  return Boolean(process.env.SENDGRID_API_KEY && process.env.SENDGRID_FROM);
}

export async function sendEmail(input: SendEmailInput): Promise<{ id?: string }> {
  const apiKey = process.env.SENDGRID_API_KEY;
  const from = process.env.SENDGRID_FROM;
  if (!apiKey || !from) {
    throw new Error(
      "SendGrid is not configured. Set SENDGRID_API_KEY and SENDGRID_FROM in the server env.",
    );
  }

  const sender = parseSender(from);

  const res = await fetch(SENDGRID_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: input.to }] }],
      from: sender.name ? { email: sender.email, name: sender.name } : { email: sender.email },
      subject: input.subject,
      content: [
        { type: "text/plain", value: input.text },
        { type: "text/html", value: input.html },
      ],
    }),
  });

  if (!res.ok) {
    const bodyText = await res.text();
    throw new Error(`SendGrid send failed (${res.status}): ${bodyText || res.statusText}`);
  }

  // SendGrid returns 202 with empty body on success; the per-message id
  // lives in the X-Message-Id header.
  const messageId = res.headers.get("X-Message-Id") ?? undefined;
  return { id: messageId };
}

// SENDGRID_FROM accepts either a bare address ("team@example.com") or the
// RFC 5322 display form ("CIMG Portfolio <team@example.com>").
function parseSender(value: string): { email: string; name?: string } {
  const match = value.match(/^(.*?)\s*<(.+)>$/);
  if (match) {
    const name = match[1].trim();
    return { email: match[2].trim(), name: name || undefined };
  }
  return { email: value.trim() };
}

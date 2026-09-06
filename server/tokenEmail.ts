import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Resend } from 'resend'

const LOGO_CID = 'dbdraw-logo'
const DEFAULT_FROM = 'DBDraw <not-reply@dbdraw.io>'
const DEFAULT_SITE = 'https://www.dbdraw.io'

export interface TokenMailEnv {
  RESEND_API_KEY?: string
  MAIL_FROM?: string
  SITE_URL?: string
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function magicLoginUrl(siteUrl: string, email: string, token: string): string {
  const url = new URL('/', siteUrl)
  url.searchParams.set('email', email)
  url.searchParams.set('token', token)
  return url.toString()
}

function buildHtml(opts: { email: string; token: string; signInUrl: string }): string {
  const email = escapeHtml(opts.email)
  const token = escapeHtml(opts.token)
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Your DBDraw sign-in token</title>
</head>
<body style="margin:0;padding:0;background:#f0f2f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2f5;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
          <tr>
            <td align="center" style="padding:28px 28px 8px;">
              <img src="cid:${LOGO_CID}" width="180" alt="DBDraw" style="display:block;width:180px;height:auto;border:0;" />
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 0;font-size:20px;font-weight:700;color:#1e3a5f;text-align:center;">
              Your sign-in token
            </td>
          </tr>
          <tr>
            <td style="padding:12px 28px 0;font-size:14px;line-height:1.55;color:#374151;">
              A new access token was generated for <strong>${email}</strong>.
              Use the button below to sign in, or paste the token on the login screen.
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:22px 28px 8px;">
              <a href="${escapeHtml(opts.signInUrl)}"
                 style="display:inline-block;background:#1e3a5f;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;padding:11px 22px;border-radius:6px;">
                Sign in to DBDraw
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px 0;font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#9ca3af;">
              Token
            </td>
          </tr>
          <tr>
            <td style="padding:6px 28px 0;">
              <div style="font-family:ui-monospace,'JetBrains Mono',Menlo,monospace;font-size:12px;line-height:1.5;color:#1a1a2e;background:#f3f4f6;border:1px solid #e5e7eb;border-radius:6px;padding:10px 12px;word-break:break-all;">
                ${token}
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 28px 28px;font-size:12px;line-height:1.5;color:#6b7280;">
              This token replaces any previous one for this email.
              If you did not request it, you can ignore this message.
            </td>
          </tr>
        </table>
        <p style="margin:16px 0 0;font-size:11px;color:#9ca3af;">DBDraw · <a href="https://www.dbdraw.io" style="color:#1a9b94;text-decoration:none;">www.dbdraw.io</a></p>
      </td>
    </tr>
  </table>
</body>
</html>`
}

function buildText(opts: { email: string; token: string; signInUrl: string }): string {
  return [
    'DBDraw — your sign-in token',
    '',
    `A new access token was generated for ${opts.email}.`,
    '',
    `Sign in: ${opts.signInUrl}`,
    '',
    `Token: ${opts.token}`,
    '',
    'This token replaces any previous one for this email.',
    'If you did not request it, you can ignore this message.',
    '',
    'https://www.dbdraw.io',
  ].join('\n')
}

export function resolveSiteUrl(env: TokenMailEnv, requestHost?: string): string {
  const configured = env.SITE_URL?.trim()
  if (configured) return configured.replace(/\/$/, '')
  if (requestHost) {
    const host = requestHost.replace(/\/$/, '')
    const proto = host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https'
    return `${proto}://${host}`
  }
  return DEFAULT_SITE
}

export async function sendTokenEmail(opts: {
  env: TokenMailEnv
  to: string
  token: string
  siteUrl: string
  logoPath: string
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const apiKey = opts.env.RESEND_API_KEY?.trim()
  if (!apiKey) {
    return { ok: false, message: 'Email is not configured — set RESEND_API_KEY in .env' }
  }

  const signInUrl = magicLoginUrl(opts.siteUrl, opts.to, opts.token)
  const logo = readFileSync(opts.logoPath)
  const resend = new Resend(apiKey)
  const result = await resend.emails.send({
    from: opts.env.MAIL_FROM?.trim() || DEFAULT_FROM,
    to: opts.to,
    subject: 'Your DBDraw sign-in token',
    html: buildHtml({ email: opts.to, token: opts.token, signInUrl }),
    text: buildText({ email: opts.to, token: opts.token, signInUrl }),
    attachments: [
      {
        filename: 'logo.png',
        content: logo,
        contentId: LOGO_CID,
      },
    ],
  })

  if (result.error) {
    return { ok: false, message: result.error.message || 'Failed to send token email' }
  }
  return { ok: true }
}

export function logoFilePath(rootDir: string): string {
  return join(rootDir, 'public', 'logo.png')
}

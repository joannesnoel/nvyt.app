// Email utility with support for:
// - Mailtrap SMTP (development/testing)
// - Resend API (production)
// In production, consider using a queue (BullMQ) for reliability

import nodemailer from 'nodemailer'
import type SMTPTransport from 'nodemailer/lib/smtp-transport'

interface SendEmailOptions {
  to: string | string[]
  subject: string
  html: string
  text?: string
}

interface EmailResult {
  success: boolean
  id?: string
  error?: string
}

// Cached transporter instance
let transporter: nodemailer.Transporter<SMTPTransport.SentMessageInfo> | null = null

function getSmtpTransporter(): nodemailer.Transporter<SMTPTransport.SentMessageInfo> | null {
  if (transporter) return transporter

  const config = useRuntimeConfig()

  // Check if SMTP host is configured (user/pass optional for services like Mailhog)
  if (!config.smtpHost) {
    return null
  }

  const smtpConfig: SMTPTransport.Options = {
    host: config.smtpHost as string,
    port: Number(config.smtpPort) || 587,
    secure: config.smtpSecure === 'true',
  }

  // Only add auth if credentials are provided
  if (config.smtpUser && config.smtpPass) {
    smtpConfig.auth = {
      user: config.smtpUser as string,
      pass: config.smtpPass as string,
    }
  }

  transporter = nodemailer.createTransport(smtpConfig)

  return transporter
}

async function sendViaSmtp(options: SendEmailOptions): Promise<EmailResult> {
  const config = useRuntimeConfig()
  const smtp = getSmtpTransporter()

  if (!smtp) {
    return { success: false, error: 'SMTP not configured' }
  }

  try {
    const info = await smtp.sendMail({
      from: (config.smtpFrom as string) || 'NVYT <noreply@nvyt.app>',
      to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    })

    console.log('[Email] Sent via SMTP:', info.messageId)
    return { success: true, id: info.messageId }
  } catch (error) {
    console.error('[Email] SMTP error:', error)
    return { success: false, error: String(error) }
  }
}

async function sendViaResend(options: SendEmailOptions): Promise<EmailResult> {
  const config = useRuntimeConfig()

  if (!config.resendApiKey) {
    return { success: false, error: 'Resend API key not configured' }
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'NVYT <noreply@nvyt.app>',
        to: Array.isArray(options.to) ? options.to : [options.to],
        subject: options.subject,
        html: options.html,
        text: options.text,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      console.error('[Email] Resend API error:', error)
      return { success: false, error }
    }

    const data = await response.json()
    console.log('[Email] Sent via Resend:', data.id)
    return { success: true, id: data.id }
  } catch (error) {
    console.error('[Email] Resend error:', error)
    return { success: false, error: String(error) }
  }
}

export async function sendEmail(options: SendEmailOptions): Promise<EmailResult> {
  const config = useRuntimeConfig()

  // Priority: SMTP (Mailtrap) > Resend API
  // This allows using Mailtrap in dev while keeping Resend for production

  // Try SMTP first (Mailtrap in development)
  if (config.smtpHost) {
    return sendViaSmtp(options)
  }

  // Fall back to Resend API
  if (config.resendApiKey) {
    return sendViaResend(options)
  }

  console.warn('[Email] No email provider configured, skipping email')
  return { success: false, error: 'No email provider configured' }
}

// Helper to check if email is configured
export function isEmailConfigured(): boolean {
  const config = useRuntimeConfig()
  return !!(config.smtpHost || config.resendApiKey)
}

// Email Templates

export function rsvpConfirmationEmail(data: {
  userName: string
  eventTitle: string
  eventDate: string
  eventLocation?: string
  qrCode: string
  eventUrl: string
}): { subject: string; html: string } {
  return {
    subject: `You're going to ${data.eventTitle}!`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <a href="https://nvyt.app" style="text-decoration: none; display: inline-flex; align-items: center; gap: 8px;">
            <img src="https://nvyt.app/logo.png" alt="nvyt" style="height: 56px; width: auto;" />
            <span style="font-size: 28px; font-weight: 700; color: #111; padding-top: 4px;">nvyt<sup style="font-size: 12px; font-weight: 400; vertical-align: super;">&trade;</sup></span>
          </a>
        </div>

        <h2 style="color: #111; margin-bottom: 10px;">You're confirmed!</h2>

        <p>Hi ${data.userName},</p>

        <p>Your RSVP for <strong>${data.eventTitle}</strong> has been confirmed.</p>

        <div style="background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <p style="margin: 0 0 10px 0;"><strong>Date:</strong> ${data.eventDate}</p>
          ${data.eventLocation ? `<p style="margin: 0;"><strong>Location:</strong> ${data.eventLocation}</p>` : ''}
        </div>

        <div style="background: #6366f1; color: white; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
          <p style="margin: 0 0 10px 0; font-size: 14px;">Your QR Code for Check-in</p>
          <p style="margin: 0; font-family: monospace; font-size: 18px; letter-spacing: 2px;">${data.qrCode}</p>
        </div>

        <p style="text-align: center;">
          <a href="${data.eventUrl}" style="display: inline-block; background: #6366f1; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 500;">View Event Details</a>
        </p>

        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

        <p style="color: #666; font-size: 14px;">
          See you there!<br>
          The NVYT&trade; Team
        </p>
      </body>
      </html>
    `,
  }
}

export function rsvpPendingEmail(data: {
  userName: string
  eventTitle: string
  eventUrl: string
}): { subject: string; html: string } {
  return {
    subject: `RSVP received for ${data.eventTitle}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <a href="https://nvyt.app" style="text-decoration: none; display: inline-flex; align-items: center; gap: 8px;">
            <img src="https://nvyt.app/logo.png" alt="nvyt" style="height: 56px; width: auto;" />
            <span style="font-size: 28px; font-weight: 700; color: #111; padding-top: 4px;">nvyt<sup style="font-size: 12px; font-weight: 400; vertical-align: super;">&trade;</sup></span>
          </a>
        </div>

        <h2 style="color: #111; margin-bottom: 10px;">RSVP Pending Approval</h2>

        <p>Hi ${data.userName},</p>

        <p>Your RSVP for <strong>${data.eventTitle}</strong> has been received and is pending approval from the organizer.</p>

        <p>We'll notify you once your RSVP is confirmed.</p>

        <p style="text-align: center; margin-top: 30px;">
          <a href="${data.eventUrl}" style="display: inline-block; background: #6366f1; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 500;">View Event</a>
        </p>

        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

        <p style="color: #666; font-size: 14px;">
          The NVYT&trade; Team
        </p>
      </body>
      </html>
    `,
  }
}

export function rsvpWaitlistEmail(data: {
  userName: string
  eventTitle: string
  position?: number
  eventUrl: string
}): { subject: string; html: string } {
  return {
    subject: `You're on the waitlist for ${data.eventTitle}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <a href="https://nvyt.app" style="text-decoration: none; display: inline-flex; align-items: center; gap: 8px;">
            <img src="https://nvyt.app/logo.png" alt="nvyt" style="height: 56px; width: auto;" />
            <span style="font-size: 28px; font-weight: 700; color: #111; padding-top: 4px;">nvyt<sup style="font-size: 12px; font-weight: 400; vertical-align: super;">&trade;</sup></span>
          </a>
        </div>

        <h2 style="color: #111; margin-bottom: 10px;">You're on the Waitlist</h2>

        <p>Hi ${data.userName},</p>

        <p><strong>${data.eventTitle}</strong> is currently at capacity, but don't worry - you've been added to the waitlist!</p>

        ${data.position ? `<p>Your current position: <strong>#${data.position}</strong></p>` : ''}

        <p>We'll notify you immediately if a spot opens up.</p>

        <p style="text-align: center; margin-top: 30px;">
          <a href="${data.eventUrl}" style="display: inline-block; background: #6366f1; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 500;">View Event</a>
        </p>

        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

        <p style="color: #666; font-size: 14px;">
          The NVYT&trade; Team
        </p>
      </body>
      </html>
    `,
  }
}

export function waitlistPromotedEmail(data: {
  userName: string
  eventTitle: string
  eventDate: string
  eventLocation?: string
  qrCode: string
  eventUrl: string
}): { subject: string; html: string } {
  return {
    subject: `Great news! You're in for ${data.eventTitle}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <a href="https://nvyt.app" style="text-decoration: none; display: inline-flex; align-items: center; gap: 8px;">
            <img src="https://nvyt.app/logo.png" alt="nvyt" style="height: 56px; width: auto;" />
            <span style="font-size: 28px; font-weight: 700; color: #111; padding-top: 4px;">nvyt<sup style="font-size: 12px; font-weight: 400; vertical-align: super;">&trade;</sup></span>
          </a>
        </div>

        <h2 style="color: #111; margin-bottom: 10px;">You're In!</h2>

        <p>Hi ${data.userName},</p>

        <p>Great news! A spot opened up and you've been moved from the waitlist to confirmed for <strong>${data.eventTitle}</strong>.</p>

        <div style="background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <p style="margin: 0 0 10px 0;"><strong>Date:</strong> ${data.eventDate}</p>
          ${data.eventLocation ? `<p style="margin: 0;"><strong>Location:</strong> ${data.eventLocation}</p>` : ''}
        </div>

        <div style="background: #6366f1; color: white; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
          <p style="margin: 0 0 10px 0; font-size: 14px;">Your QR Code for Check-in</p>
          <p style="margin: 0; font-family: monospace; font-size: 18px; letter-spacing: 2px;">${data.qrCode}</p>
        </div>

        <p style="text-align: center;">
          <a href="${data.eventUrl}" style="display: inline-block; background: #6366f1; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 500;">View Event Details</a>
        </p>

        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

        <p style="color: #666; font-size: 14px;">
          See you there!<br>
          The NVYT&trade; Team
        </p>
      </body>
      </html>
    `,
  }
}

export function rsvpApprovedEmail(data: {
  userName: string
  eventTitle: string
  eventDate: string
  eventLocation?: string
  qrCode: string
  eventUrl: string
}): { subject: string; html: string } {
  return {
    subject: `Your RSVP for ${data.eventTitle} has been approved!`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <a href="https://nvyt.app" style="text-decoration: none; display: inline-flex; align-items: center; gap: 8px;">
            <img src="https://nvyt.app/logo.png" alt="nvyt" style="height: 56px; width: auto;" />
            <span style="font-size: 28px; font-weight: 700; color: #111; padding-top: 4px;">nvyt<sup style="font-size: 12px; font-weight: 400; vertical-align: super;">&trade;</sup></span>
          </a>
        </div>

        <h2 style="color: #111; margin-bottom: 10px;">RSVP Approved!</h2>

        <p>Hi ${data.userName},</p>

        <p>Great news! Your RSVP for <strong>${data.eventTitle}</strong> has been approved by the organizer.</p>

        <div style="background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <p style="margin: 0 0 10px 0;"><strong>Date:</strong> ${data.eventDate}</p>
          ${data.eventLocation ? `<p style="margin: 0;"><strong>Location:</strong> ${data.eventLocation}</p>` : ''}
        </div>

        <div style="background: #6366f1; color: white; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
          <p style="margin: 0 0 10px 0; font-size: 14px;">Your QR Code for Check-in</p>
          <p style="margin: 0; font-family: monospace; font-size: 18px; letter-spacing: 2px;">${data.qrCode}</p>
        </div>

        <p style="text-align: center;">
          <a href="${data.eventUrl}" style="display: inline-block; background: #6366f1; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 500;">View Event Details</a>
        </p>

        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

        <p style="color: #666; font-size: 14px;">
          See you there!<br>
          The NVYT&trade; Team
        </p>
      </body>
      </html>
    `,
  }
}

export function rsvpDeclinedEmail(data: {
  userName: string
  eventTitle: string
  eventUrl: string
}): { subject: string; html: string } {
  return {
    subject: `Update on your RSVP for ${data.eventTitle}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <a href="https://nvyt.app" style="text-decoration: none; display: inline-flex; align-items: center; gap: 8px;">
            <img src="https://nvyt.app/logo.png" alt="nvyt" style="height: 56px; width: auto;" />
            <span style="font-size: 28px; font-weight: 700; color: #111; padding-top: 4px;">nvyt<sup style="font-size: 12px; font-weight: 400; vertical-align: super;">&trade;</sup></span>
          </a>
        </div>

        <h2 style="color: #111; margin-bottom: 10px;">RSVP Update</h2>

        <p>Hi ${data.userName},</p>

        <p>Unfortunately, your RSVP for <strong>${data.eventTitle}</strong> was not approved by the organizer.</p>

        <p>This could be due to capacity limits or event-specific requirements. If you have questions, please reach out to the event organizer directly.</p>

        <p style="text-align: center; margin-top: 30px;">
          <a href="${data.eventUrl}" style="display: inline-block; background: #6366f1; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 500;">View Event</a>
        </p>

        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

        <p style="color: #666; font-size: 14px;">
          The NVYT&trade; Team
        </p>
      </body>
      </html>
    `,
  }
}

export function eventReminderEmail(data: {
  userName: string
  eventTitle: string
  eventDate: string
  eventLocation?: string
  qrCode: string
  eventUrl: string
  hoursUntil: number
}): { subject: string; html: string } {
  return {
    subject: `Reminder: ${data.eventTitle} is ${data.hoursUntil === 24 ? 'tomorrow' : 'starting soon'}!`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <a href="https://nvyt.app" style="text-decoration: none; display: inline-flex; align-items: center; gap: 8px;">
            <img src="https://nvyt.app/logo.png" alt="nvyt" style="height: 56px; width: auto;" />
            <span style="font-size: 28px; font-weight: 700; color: #111; padding-top: 4px;">nvyt<sup style="font-size: 12px; font-weight: 400; vertical-align: super;">&trade;</sup></span>
          </a>
        </div>

        <h2 style="color: #111; margin-bottom: 10px;">Event Reminder</h2>

        <p>Hi ${data.userName},</p>

        <p><strong>${data.eventTitle}</strong> is ${data.hoursUntil === 24 ? 'tomorrow' : `starting in ${data.hoursUntil} hour${data.hoursUntil > 1 ? 's' : ''}`}!</p>

        <div style="background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <p style="margin: 0 0 10px 0;"><strong>Date:</strong> ${data.eventDate}</p>
          ${data.eventLocation ? `<p style="margin: 0;"><strong>Location:</strong> ${data.eventLocation}</p>` : ''}
        </div>

        <div style="background: #6366f1; color: white; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
          <p style="margin: 0 0 10px 0; font-size: 14px;">Your QR Code for Check-in</p>
          <p style="margin: 0; font-family: monospace; font-size: 18px; letter-spacing: 2px;">${data.qrCode}</p>
        </div>

        <p style="text-align: center;">
          <a href="${data.eventUrl}" style="display: inline-block; background: #6366f1; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 500;">View Event Details</a>
        </p>

        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

        <p style="color: #666; font-size: 14px;">
          See you soon!<br>
          The NVYT&trade; Team
        </p>
      </body>
      </html>
    `,
  }
}

export function eventCancelledEmail(data: {
  userName: string
  eventTitle: string
  eventDate: string
  organizerName: string
}): { subject: string; html: string } {
  return {
    subject: `${data.eventTitle} has been cancelled`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <a href="https://nvyt.app" style="text-decoration: none; display: inline-flex; align-items: center; gap: 8px;">
            <img src="https://nvyt.app/logo.png" alt="nvyt" style="height: 56px; width: auto;" />
            <span style="font-size: 28px; font-weight: 700; color: #111; padding-top: 4px;">nvyt<sup style="font-size: 12px; font-weight: 400; vertical-align: super;">&trade;</sup></span>
          </a>
        </div>

        <h2 style="color: #111; margin-bottom: 10px;">Event Cancelled</h2>

        <p>Hi ${data.userName},</p>

        <p>We're sorry to inform you that <strong>${data.eventTitle}</strong> scheduled for ${data.eventDate} has been cancelled by the organizer (${data.organizerName}).</p>

        <p>If you have any questions, please reach out to the event organizer directly.</p>

        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

        <p style="color: #666; font-size: 14px;">
          The NVYT&trade; Team
        </p>
      </body>
      </html>
    `,
  }
}

export function ticketPurchaseConfirmationEmail(data: {
  userName: string
  eventTitle: string
  eventDate: string
  eventLocation?: string
  orderNumber: string
  tickets: Array<{ ticketType: string; attendeeName: string; qrCode: string }>
  totalAmount: string
  orderUrl: string
  setupToken?: string
}): { subject: string; html: string } {
  // For guest users (with setup token), link to success page with token
  // For logged-in users, link to standard order page
  const ticketViewUrl = data.setupToken
    ? `${data.orderUrl}/success?token=${data.setupToken}`
    : data.orderUrl

  const ticketCards = data.tickets
    .map(
      (t, index) => `
        <div style="background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; margin-bottom: 16px;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
            <span style="background: #6366f1; color: white; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600;">Ticket ${index + 1}</span>
            <span style="color: #6b7280; font-size: 12px;">${t.ticketType}</span>
          </div>
          <div style="text-align: center; margin: 16px 0;">
            <img src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(t.qrCode)}" alt="QR Code" style="width: 180px; height: 180px; border-radius: 8px;">
          </div>
          <div style="text-align: center; margin-top: 12px;">
            <p style="margin: 0; font-weight: 600; color: #111827;">${t.attendeeName}</p>
            <p style="margin: 4px 0 0 0; font-size: 11px; color: #9ca3af; font-family: monospace; word-break: break-all;">${t.qrCode}</p>
          </div>
        </div>
      `
    )
    .join('')

  return {
    subject: `Your tickets for ${data.eventTitle} - Order ${data.orderNumber}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background: #f3f4f6;">
        <div style="background: white; border-radius: 12px; padding: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <div style="text-align: center; margin-bottom: 24px;">
            <img src="https://nvyt.app/logo.png" alt="nvyt" style="height: 56px; width: auto;" />
          </div>

          <h2 style="color: #111; margin-bottom: 10px; text-align: center;">Your Tickets Are Confirmed!</h2>

          <p style="text-align: center;">Hi ${data.userName},</p>

          <p style="text-align: center;">Thank you for your purchase! Your tickets for <strong>${data.eventTitle}</strong> are now confirmed.</p>

          <div style="background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 20px 0;">
            <p style="margin: 0 0 10px 0;"><strong>Order Number:</strong> ${data.orderNumber}</p>
            <p style="margin: 0 0 10px 0;"><strong>Date:</strong> ${data.eventDate}</p>
            ${data.eventLocation ? `<p style="margin: 0 0 10px 0;"><strong>Location:</strong> ${data.eventLocation}</p>` : ''}
            <p style="margin: 0;"><strong>Total:</strong> ${data.totalAmount}</p>
          </div>

          <h3 style="color: #111; margin-top: 30px; text-align: center;">Your Tickets</h3>

          ${ticketCards}

          <p style="color: #666; font-size: 14px; text-align: center;">Show your QR code at the event for check-in. You can also access your tickets anytime from your order page.</p>

          <p style="text-align: center; margin: 30px 0;">
            <a href="${ticketViewUrl}" style="display: inline-block; background: #6366f1; color: white; text-decoration: none; padding: 14px 28px; border-radius: 6px; font-weight: 500;">View Your Tickets</a>
          </p>

          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

          <p style="color: #666; font-size: 14px; text-align: center;">
            See you at the event!<br>
            The NVYT&trade; Team
          </p>
        </div>
      </body>
      </html>
    `,
  }
}

export function paymentSuccessfulEmail(data: {
  userName: string
  eventTitle: string
  eventDate: string
  eventLocation?: string
  orderNumber: string
  ticketCount: number
  ticketSummary: Array<{ ticketType: string; quantity: number }>
  totalAmount: string
  orderUrl: string
  setupToken?: string
  requiresRegistration: boolean
}): { subject: string; html: string } {
  const ticketViewUrl = data.setupToken
    ? `${data.orderUrl}/success?token=${data.setupToken}`
    : data.orderUrl

  const ticketSummaryHtml = data.ticketSummary
    .map(t => `<li style="margin-bottom: 4px;">${t.quantity}x ${t.ticketType}</li>`)
    .join('')

  const registrationNote = data.requiresRegistration
    ? `<div style="background: #fef3c7; border: 1px solid #fcd34d; border-radius: 8px; padding: 16px; margin: 20px 0;">
        <p style="margin: 0; color: #92400e; font-weight: 600;">Next Step: Register Your Attendees</p>
        <p style="margin: 8px 0 0 0; color: #a16207; font-size: 14px;">Please register the attendees for each ticket. Once registered, each attendee will receive their ticket with QR code via email.</p>
      </div>`
    : `<p style="color: #666; font-size: 14px; text-align: center;">Your tickets and QR codes are available in your order page.</p>`

  return {
    subject: `Payment Successful - ${data.eventTitle} (Order ${data.orderNumber})`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background: #f3f4f6;">
        <div style="background: white; border-radius: 12px; padding: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <div style="text-align: center; margin-bottom: 24px;">
            <img src="https://nvyt.app/logo.png" alt="nvyt" style="height: 56px; width: auto;" />
          </div>

          <div style="text-align: center; margin-bottom: 20px;">
            <div style="display: inline-block; background: #dcfce7; border-radius: 50%; padding: 16px;">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
              </svg>
            </div>
          </div>

          <h2 style="color: #111; margin-bottom: 10px; text-align: center;">Payment Successful!</h2>

          <p style="text-align: center;">Hi ${data.userName},</p>

          <p style="text-align: center;">Thank you for your purchase! Your payment for <strong>${data.eventTitle}</strong> has been confirmed.</p>

          <div style="background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 20px 0;">
            <p style="margin: 0 0 10px 0;"><strong>Order Number:</strong> ${data.orderNumber}</p>
            <p style="margin: 0 0 10px 0;"><strong>Event:</strong> ${data.eventTitle}</p>
            <p style="margin: 0 0 10px 0;"><strong>Date:</strong> ${data.eventDate}</p>
            ${data.eventLocation ? `<p style="margin: 0 0 10px 0;"><strong>Location:</strong> ${data.eventLocation}</p>` : ''}
            <p style="margin: 0 0 10px 0;"><strong>Tickets:</strong></p>
            <ul style="margin: 0; padding-left: 20px;">${ticketSummaryHtml}</ul>
            <p style="margin: 16px 0 0 0; font-size: 18px;"><strong>Total Paid:</strong> ${data.totalAmount}</p>
          </div>

          ${registrationNote}

          <p style="text-align: center; margin: 30px 0;">
            <a href="${ticketViewUrl}" style="display: inline-block; background: #6366f1; color: white; text-decoration: none; padding: 14px 28px; border-radius: 6px; font-weight: 500;">${data.requiresRegistration ? 'Register Attendees' : 'View Your Order'}</a>
          </p>

          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

          <p style="color: #666; font-size: 14px; text-align: center;">
            See you at the event!<br>
            The NVYT&trade; Team
          </p>
        </div>
      </body>
      </html>
    `,
  }
}

export function attendeeTicketEmail(data: {
  attendeeName: string
  eventTitle: string
  eventDate: string
  eventLocation?: string
  ticketType: string
  ticketNumber: string
  qrCode: string
  ticketUrl: string
  purchaserName?: string
  setupToken?: string
}): { subject: string; html: string } {
  const ticketViewUrl = data.setupToken
    ? `${data.ticketUrl}?token=${data.setupToken}`
    : data.ticketUrl
  const setupUrl = data.setupToken
    ? `${new URL(data.ticketUrl).origin}/setup-account?token=${data.setupToken}`
    : null
  return {
    subject: `Ticket for ${data.attendeeName} - ${data.eventTitle}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background: #f3f4f6;">
        <div style="background: white; border-radius: 12px; padding: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <div style="text-align: center; margin-bottom: 24px;">
            <img src="https://nvyt.app/logo.png" alt="nvyt" style="height: 56px; width: auto;" />
          </div>

          <h2 style="color: #111; margin-bottom: 10px; text-align: center;">Your Ticket is Ready!</h2>

          <p style="text-align: center;">Hi ${data.attendeeName},</p>

          <p style="text-align: center;">${data.purchaserName ? `<strong>${data.purchaserName}</strong> has registered a ticket in your name for <strong>${data.eventTitle}</strong>.` : `Here's your ticket for <strong>${data.eventTitle}</strong>.`} Show the QR code below at the event for check-in.</p>

          <div style="background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 20px 0;">
            <p style="margin: 0 0 10px 0;"><strong>Event:</strong> ${data.eventTitle}</p>
            <p style="margin: 0 0 10px 0;"><strong>Date:</strong> ${data.eventDate}</p>
            ${data.eventLocation ? `<p style="margin: 0 0 10px 0;"><strong>Location:</strong> ${data.eventLocation}</p>` : ''}
            <p style="margin: 0;"><strong>Ticket Type:</strong> ${data.ticketType}</p>
          </div>

          <div style="background: #ffffff; border: 2px solid #6366f1; border-radius: 12px; padding: 24px; margin: 20px 0;">
            <div style="text-align: center;">
              <span style="background: #6366f1; color: white; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600;">Your Ticket</span>
            </div>
            <div style="text-align: center; margin: 20px 0;">
              <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(data.qrCode)}" alt="QR Code" style="width: 200px; height: 200px; border-radius: 8px;">
            </div>
            <div style="text-align: center;">
              <p style="margin: 0; font-weight: 600; color: #111827; font-size: 18px;">${data.attendeeName}</p>
              <p style="margin: 8px 0 0 0; font-size: 12px; color: #6b7280;">${data.ticketType}</p>
              <p style="margin: 8px 0 0 0; font-size: 11px; color: #9ca3af; font-family: monospace;">${data.ticketNumber}</p>
            </div>
          </div>

          <p style="color: #666; font-size: 14px; text-align: center;">Save this email or take a screenshot of the QR code. You can also view your ticket online anytime.</p>

          <p style="text-align: center; margin: 30px 0;">
            <a href="${ticketViewUrl}" style="display: inline-block; background: #6366f1; color: white; text-decoration: none; padding: 14px 28px; border-radius: 6px; font-weight: 500;">View Ticket Online</a>
          </p>

          ${setupUrl ? `
          <div style="background: #f0f0ff; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
            <p style="margin: 0 0 12px 0;">We've created an nvyt account for you. Set up a password to manage your tickets and future events.</p>
            <a href="${setupUrl}" style="display: inline-block; background: white; color: #6366f1; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 500; border: 2px solid #6366f1;">Set Up Your Account</a>
          </div>
          <p style="color: #666; font-size: 13px; text-align: center;">This link will expire in 7 days. After that, you can use the "Forgot password" option on the login page.</p>
          ` : ''}

          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

          <p style="color: #666; font-size: 14px; text-align: center;">
            See you at the event!<br>
            The NVYT&trade; Team
          </p>
        </div>
      </body>
      </html>
    `,
  }
}

export function accountSetupEmail(data: {
  userName: string
  setupUrl: string
  orderNumber?: string
  eventTitle: string
}): { subject: string; html: string } {
  const subjectSuffix = data.orderNumber ? ` - Order ${data.orderNumber}` : ` - ${data.eventTitle}`
  return {
    subject: `Set up your nvyt account${subjectSuffix}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <a href="https://nvyt.app" style="text-decoration: none; display: inline-flex; align-items: center; gap: 8px;">
            <img src="https://nvyt.app/logo.png" alt="nvyt" style="height: 56px; width: auto;" />
            <span style="font-size: 28px; font-weight: 700; color: #111; padding-top: 4px;">nvyt<sup style="font-size: 12px; font-weight: 400; vertical-align: super;">&trade;</sup></span>
          </a>
        </div>

        <h2 style="color: #111; margin-bottom: 10px;">Set Up Your Account</h2>

        <p>Hi ${data.userName},</p>

        <p>Thank you for ${data.orderNumber ? 'your order' : 'your RSVP'} for <strong>${data.eventTitle}</strong>!</p>

        ${data.orderNumber ? `<p>Order Number: <strong>${data.orderNumber}</strong></p>` : ''}

        <p>We've created an account for you. Set up a password to access your ${data.orderNumber ? 'tickets and manage future orders' : 'event details'}:</p>

        <p style="text-align: center; margin: 30px 0;">
          <a href="${data.setupUrl}" style="display: inline-block; background: #6366f1; color: white; text-decoration: none; padding: 14px 28px; border-radius: 6px; font-weight: 500;">Set Up Your Account</a>
        </p>

        <p style="color: #666; font-size: 14px;">This link will expire in 7 days. After that, you can use the "Resend setup link" option on the login page, or use the forgot password feature.</p>

        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

        <p style="color: #666; font-size: 14px;">
          The NVYT&trade; Team
        </p>
      </body>
      </html>
    `,
  }
}

export function accountSetupReminderEmail(data: {
  userName: string
  setupUrl: string
}): { subject: string; html: string } {
  return {
    subject: 'Complete your nvyt account setup',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <a href="https://nvyt.app" style="text-decoration: none; display: inline-flex; align-items: center; gap: 8px;">
            <img src="https://nvyt.app/logo.png" alt="nvyt" style="height: 56px; width: auto;" />
            <span style="font-size: 28px; font-weight: 700; color: #111; padding-top: 4px;">nvyt<sup style="font-size: 12px; font-weight: 400; vertical-align: super;">&trade;</sup></span>
          </a>
        </div>

        <h2 style="color: #111; margin-bottom: 10px;">Set Up Your Account</h2>

        <p>Hi ${data.userName},</p>

        <p>You requested a new link to set up your nvyt account. Click the button below to create a password:</p>

        <p style="text-align: center; margin: 30px 0;">
          <a href="${data.setupUrl}" style="display: inline-block; background: #6366f1; color: white; text-decoration: none; padding: 14px 28px; border-radius: 6px; font-weight: 500;">Set Up Your Account</a>
        </p>

        <p style="color: #666; font-size: 14px;">This link will expire in 7 days.</p>

        <p style="color: #666; font-size: 14px;">If you didn't request this link, you can safely ignore this email.</p>

        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

        <p style="color: #666; font-size: 14px;">
          The NVYT&trade; Team
        </p>
      </body>
      </html>
    `,
  }
}

export function collaboratorInvitationEmail(data: {
  inviterName: string
  eventTitle: string
  eventDate: string
  permissions: string[]
  acceptUrl: string
  isNewUser: boolean
}): { subject: string; html: string } {
  const permissionList = data.permissions.length > 0
    ? data.permissions.map(p => `<li>${p}</li>`).join('')
    : '<li>View event analytics</li>'

  return {
    subject: `You've been invited to collaborate on "${data.eventTitle}"`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <a href="https://nvyt.app" style="text-decoration: none; display: inline-flex; align-items: center; gap: 8px;">
            <img src="https://nvyt.app/logo.png" alt="nvyt" style="height: 56px; width: auto;" />
            <span style="font-size: 28px; font-weight: 700; color: #111; padding-top: 4px;">nvyt<sup style="font-size: 12px; font-weight: 400; vertical-align: super;">&trade;</sup></span>
          </a>
        </div>

        <h2 style="color: #111; margin-bottom: 10px;">You're Invited to Collaborate!</h2>

        <p>Hi there,</p>

        <p><strong>${data.inviterName}</strong> has invited you to help manage the event <strong>${data.eventTitle}</strong>.</p>

        <div style="background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <p style="margin: 0 0 10px 0;"><strong>Event:</strong> ${data.eventTitle}</p>
          <p style="margin: 0;"><strong>Date:</strong> ${data.eventDate}</p>
        </div>

        <p><strong>Your permissions:</strong></p>
        <ul style="color: #666;">
          ${permissionList}
        </ul>

        ${data.isNewUser ? `
        <p style="color: #666; font-size: 14px;">
          You don't have an nvyt account yet. Click the button below to create your account and accept the invitation.
        </p>
        ` : `
        <p style="color: #666; font-size: 14px;">
          Click the button below to accept the invitation and start collaborating.
        </p>
        `}

        <p style="text-align: center; margin: 30px 0;">
          <a href="${data.acceptUrl}" style="display: inline-block; background: #6366f1; color: white; text-decoration: none; padding: 14px 28px; border-radius: 6px; font-weight: 500;">
            ${data.isNewUser ? 'Create Account & Accept' : 'Accept Invitation'}
          </a>
        </p>

        <p style="color: #666; font-size: 14px;">This invitation link will expire in 7 days.</p>

        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

        <p style="color: #666; font-size: 14px;">
          The NVYT&trade; Team
        </p>
      </body>
      </html>
    `,
  }
}

export function rsvpInvitationEmail(data: {
  inviteeName?: string
  organizerName: string
  eventTitle: string
  eventDate: string
  eventLocation?: string
  eventDescription?: string
  eventThumbnail?: string
  isTicketEvent?: boolean
  customMessage?: string
  rsvpUrl: string
}): { subject: string; html: string } {
  const greeting = data.inviteeName ? `Hi ${data.inviteeName},` : 'Hi there,'
  const ctaLabel = data.isTicketEvent ? 'View Event & Get Tickets' : 'View Event & RSVP'
  const ctaHint = data.isTicketEvent
    ? 'Click the button above to view the full event details and get your tickets.'
    : 'Click the button above to view the full event details and let us know if you can make it.'
  return {
    subject: `You're invited to ${data.eventTitle}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <a href="https://nvyt.app" style="text-decoration: none; display: inline-flex; align-items: center; gap: 8px;">
            <img src="https://nvyt.app/logo.png" alt="nvyt" style="height: 56px; width: auto;" />
            <span style="font-size: 28px; font-weight: 700; color: #111; padding-top: 4px;">nvyt<sup style="font-size: 12px; font-weight: 400; vertical-align: super;">&trade;</sup></span>
          </a>
        </div>

        <h2 style="color: #111; margin-bottom: 10px;">You're Invited!</h2>

        <p>${greeting}</p>

        <p><strong>${data.organizerName}</strong> has invited you to:</p>

        ${data.eventThumbnail ? `
        <div style="margin: 20px 0; text-align: center;">
          <img src="${data.eventThumbnail}" alt="${data.eventTitle}" style="max-width: 100%; height: auto; border-radius: 8px;" />
        </div>
        ` : ''}

        <div style="background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <h3 style="margin: 0 0 15px 0; color: #111;">${data.eventTitle}</h3>
          <p style="margin: 0 0 10px 0;"><strong>Date:</strong> ${data.eventDate}</p>
          ${data.eventLocation ? `<p style="margin: 0 0 10px 0;"><strong>Location:</strong> ${data.eventLocation}</p>` : ''}
          ${data.eventDescription ? `<p style="margin: 15px 0 0 0; color: #666; font-size: 14px;">${data.eventDescription.substring(0, 200)}${data.eventDescription.length > 200 ? '...' : ''}</p>` : ''}
        </div>

        ${data.customMessage ? `
        <div style="background: #eff6ff; border-left: 4px solid #6366f1; padding: 15px; margin: 20px 0;">
          <p style="margin: 0; color: #444; font-style: italic;">"${data.customMessage}"</p>
          <p style="margin: 10px 0 0 0; color: #666; font-size: 14px;">- ${data.organizerName}</p>
        </div>
        ` : ''}

        <p style="text-align: center; margin: 30px 0;">
          <a href="${data.rsvpUrl}" style="display: inline-block; background: #6366f1; color: white; text-decoration: none; padding: 14px 28px; border-radius: 6px; font-weight: 500;">
            ${ctaLabel}
          </a>
        </p>

        <p style="color: #666; font-size: 14px; text-align: center;">
          ${ctaHint}
        </p>

        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

        <p style="color: #666; font-size: 14px;">
          The NVYT&trade; Team
        </p>
      </body>
      </html>
    `,
  }
}

export function passwordResetEmail(data: {
  userName: string
  resetUrl: string
}): { subject: string; html: string } {
  return {
    subject: 'Reset your nvyt password',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <a href="https://nvyt.app" style="text-decoration: none; display: inline-flex; align-items: center; gap: 8px;">
            <img src="https://nvyt.app/logo.png" alt="nvyt" style="height: 56px; width: auto;" />
            <span style="font-size: 28px; font-weight: 700; color: #111; padding-top: 4px;">nvyt<sup style="font-size: 12px; font-weight: 400; vertical-align: super;">&trade;</sup></span>
          </a>
        </div>

        <h2 style="color: #111; margin-bottom: 10px;">Reset Your Password</h2>

        <p>Hi ${data.userName},</p>

        <p>We received a request to reset the password for your nvyt account. Click the button below to create a new password:</p>

        <p style="text-align: center; margin: 30px 0;">
          <a href="${data.resetUrl}" style="display: inline-block; background: #6366f1; color: white; text-decoration: none; padding: 14px 28px; border-radius: 6px; font-weight: 500;">
            Reset Password
          </a>
        </p>

        <p style="color: #666; font-size: 14px;">This link will expire in 1 hour for security reasons.</p>

        <p style="color: #666; font-size: 14px;">If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.</p>

        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

        <p style="color: #666; font-size: 14px;">
          The NVYT&trade; Team
        </p>
      </body>
      </html>
    `,
  }
}

// Verification Email Templates

export function verificationApprovedEmail(data: {
  userName: string
  eventTitle: string
  businessName: string
  eventUrl: string
}): { subject: string; html: string } {
  return {
    subject: `Your event "${data.eventTitle}" is now verified!`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <a href="https://nvyt.app" style="text-decoration: none; display: inline-flex; align-items: center; gap: 8px;">
            <img src="https://nvyt.app/logo.png" alt="nvyt" style="height: 56px; width: auto;" />
            <span style="font-size: 28px; font-weight: 700; color: #111; padding-top: 4px;">nvyt<sup style="font-size: 12px; font-weight: 400; vertical-align: super;">&trade;</sup></span>
          </a>
        </div>

        <div style="text-align: center; margin-bottom: 20px;">
          <div style="display: inline-block; background: #dcfce7; border-radius: 50%; padding: 16px;">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
              <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
          </div>
        </div>

        <h2 style="color: #111; margin-bottom: 10px; text-align: center;">Verification Approved!</h2>

        <p>Hi ${data.userName},</p>

        <p>Great news! Your business verification for <strong>${data.eventTitle}</strong> has been approved.</p>

        <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <p style="margin: 0 0 10px 0;"><strong>Event:</strong> ${data.eventTitle}</p>
          <p style="margin: 0;"><strong>Business:</strong> ${data.businessName}</p>
        </div>

        <p>You can now publish your event and start selling tickets!</p>

        <p style="text-align: center; margin: 30px 0;">
          <a href="${data.eventUrl}" style="display: inline-block; background: #16a34a; color: white; text-decoration: none; padding: 14px 28px; border-radius: 6px; font-weight: 500;">
            Publish Your Event
          </a>
        </p>

        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

        <p style="color: #666; font-size: 14px;">
          Thank you for verifying your business with nvyt.<br>
          The NVYT&trade; Team
        </p>
      </body>
      </html>
    `,
  }
}

export function verificationRejectedEmail(data: {
  userName: string
  eventTitle: string
  businessName: string
  rejectionReason: string
  verificationUrl: string
}): { subject: string; html: string } {
  return {
    subject: `Action needed: Verification for "${data.eventTitle}"`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <a href="https://nvyt.app" style="text-decoration: none; display: inline-flex; align-items: center; gap: 8px;">
            <img src="https://nvyt.app/logo.png" alt="nvyt" style="height: 56px; width: auto;" />
            <span style="font-size: 28px; font-weight: 700; color: #111; padding-top: 4px;">nvyt<sup style="font-size: 12px; font-weight: 400; vertical-align: super;">&trade;</sup></span>
          </a>
        </div>

        <h2 style="color: #111; margin-bottom: 10px;">Verification Update</h2>

        <p>Hi ${data.userName},</p>

        <p>Unfortunately, we were unable to approve the verification for your event <strong>${data.eventTitle}</strong>.</p>

        <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <p style="margin: 0 0 10px 0; color: #dc2626; font-weight: 600;">Reason:</p>
          <p style="margin: 0; color: #7f1d1d;">${data.rejectionReason}</p>
        </div>

        <div style="background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <p style="margin: 0 0 10px 0;"><strong>Event:</strong> ${data.eventTitle}</p>
          <p style="margin: 0;"><strong>Business:</strong> ${data.businessName}</p>
        </div>

        <p><strong>What to do next:</strong></p>
        <ol style="color: #666;">
          <li>Review the rejection reason above</li>
          <li>Prepare the correct documentation</li>
          <li>Resubmit your verification</li>
        </ol>

        <p style="text-align: center; margin: 30px 0;">
          <a href="${data.verificationUrl}" style="display: inline-block; background: #6366f1; color: white; text-decoration: none; padding: 14px 28px; border-radius: 6px; font-weight: 500;">
            Resubmit Verification
          </a>
        </p>

        <p style="color: #666; font-size: 14px;">If you have questions about the verification requirements, please contact our support team.</p>

        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

        <p style="color: #666; font-size: 14px;">
          The NVYT&trade; Team
        </p>
      </body>
      </html>
    `,
  }
}

export function verificationUnderReviewEmail(data: {
  userName: string
  eventTitle: string
  businessName: string
}): { subject: string; html: string } {
  return {
    subject: `Your verification for "${data.eventTitle}" is under review`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <a href="https://nvyt.app" style="text-decoration: none; display: inline-flex; align-items: center; gap: 8px;">
            <img src="https://nvyt.app/logo.png" alt="nvyt" style="height: 56px; width: auto;" />
            <span style="font-size: 28px; font-weight: 700; color: #111; padding-top: 4px;">nvyt<sup style="font-size: 12px; font-weight: 400; vertical-align: super;">&trade;</sup></span>
          </a>
        </div>

        <div style="text-align: center; margin-bottom: 20px;">
          <div style="display: inline-block; background: #dbeafe; border-radius: 50%; padding: 16px;">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
          </div>
        </div>

        <h2 style="color: #111; margin-bottom: 10px; text-align: center;">Verification Under Review</h2>

        <p>Hi ${data.userName},</p>

        <p>Good news! Our team has started reviewing the verification documents for your event <strong>${data.eventTitle}</strong>.</p>

        <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <p style="margin: 0 0 10px 0;"><strong>Event:</strong> ${data.eventTitle}</p>
          <p style="margin: 0;"><strong>Business:</strong> ${data.businessName}</p>
        </div>

        <p>This typically takes 1-2 business days. We'll notify you as soon as the review is complete.</p>

        <p style="color: #666; font-size: 14px;">No action is needed from you at this time.</p>

        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

        <p style="color: #666; font-size: 14px;">
          Thank you for your patience.<br>
          The NVYT&trade; Team
        </p>
      </body>
      </html>
    `,
  }
}

export function verificationSubmittedEmail(data: {
  userName: string
  eventTitle: string
  businessName: string
  verificationUrl: string
}): { subject: string; html: string } {
  return {
    subject: `Verification submitted for "${data.eventTitle}"`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <a href="https://nvyt.app" style="text-decoration: none; display: inline-flex; align-items: center; gap: 8px;">
            <img src="https://nvyt.app/logo.png" alt="nvyt" style="height: 56px; width: auto;" />
            <span style="font-size: 28px; font-weight: 700; color: #111; padding-top: 4px;">nvyt<sup style="font-size: 12px; font-weight: 400; vertical-align: super;">&trade;</sup></span>
          </a>
        </div>

        <h2 style="color: #111; margin-bottom: 10px;">Verification Submitted</h2>

        <p>Hi ${data.userName},</p>

        <p>We've received your verification request for <strong>${data.eventTitle}</strong>.</p>

        <div style="background: #fefce8; border: 1px solid #fef08a; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <p style="margin: 0 0 10px 0;"><strong>Status:</strong> Pending Review</p>
          <p style="margin: 0 0 10px 0;"><strong>Event:</strong> ${data.eventTitle}</p>
          <p style="margin: 0;"><strong>Business:</strong> ${data.businessName}</p>
        </div>

        <p><strong>What happens next:</strong></p>
        <ol style="color: #666;">
          <li>Our team will review your submitted documents</li>
          <li>You'll receive an email once the review is complete</li>
          <li>Once approved, you can publish your event</li>
        </ol>

        <p style="color: #666; font-size: 14px;">Review typically takes 1-2 business days.</p>

        <p style="text-align: center; margin: 30px 0;">
          <a href="${data.verificationUrl}" style="display: inline-block; background: #6366f1; color: white; text-decoration: none; padding: 14px 28px; border-radius: 6px; font-weight: 500;">
            View Verification Status
          </a>
        </p>

        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

        <p style="color: #666; font-size: 14px;">
          Thank you for choosing nvyt.<br>
          The NVYT&trade; Team
        </p>
      </body>
      </html>
    `,
  }
}

export function welcomeEmail(data: {
  userName: string
  verificationUrl: string
}): { subject: string; html: string } {
  return {
    subject: 'Welcome to nvyt - Please verify your email',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <a href="https://nvyt.app" style="text-decoration: none; display: inline-flex; align-items: center; gap: 8px;">
            <img src="https://nvyt.app/logo.png" alt="nvyt" style="height: 56px; width: auto;" />
            <span style="font-size: 28px; font-weight: 700; color: #111; padding-top: 4px;">nvyt<sup style="font-size: 12px; font-weight: 400; vertical-align: super;">&trade;</sup></span>
          </a>
        </div>

        <h2 style="color: #111; margin-bottom: 10px;">Welcome to nvyt!</h2>

        <p>Hi ${data.userName},</p>

        <p>Thanks for signing up! We're excited to have you on board.</p>

        <p>To get started, please verify your email address by clicking the button below:</p>

        <p style="text-align: center; margin: 30px 0;">
          <a href="${data.verificationUrl}" style="display: inline-block; background: #6366f1; color: white; text-decoration: none; padding: 14px 28px; border-radius: 6px; font-weight: 500;">Verify Email Address</a>
        </p>

        <p style="color: #666; font-size: 14px;">This link will expire in 24 hours. If you didn't create an account, you can safely ignore this email.</p>

        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

        <p style="color: #666; font-size: 14px;">
          Welcome aboard!<br>
          The NVYT&trade; Team
        </p>
      </body>
      </html>
    `,
  }
}

export function emailVerificationEmail(data: {
  userName: string
  verificationUrl: string
}): { subject: string; html: string } {
  return {
    subject: 'Verify your email address - nvyt',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <a href="https://nvyt.app" style="text-decoration: none; display: inline-flex; align-items: center; gap: 8px;">
            <img src="https://nvyt.app/logo.png" alt="nvyt" style="height: 56px; width: auto;" />
            <span style="font-size: 28px; font-weight: 700; color: #111; padding-top: 4px;">nvyt<sup style="font-size: 12px; font-weight: 400; vertical-align: super;">&trade;</sup></span>
          </a>
        </div>

        <h2 style="color: #111; margin-bottom: 10px;">Verify Your Email</h2>

        <p>Hi ${data.userName},</p>

        <p>Please verify your email address by clicking the button below:</p>

        <p style="text-align: center; margin: 30px 0;">
          <a href="${data.verificationUrl}" style="display: inline-block; background: #6366f1; color: white; text-decoration: none; padding: 14px 28px; border-radius: 6px; font-weight: 500;">Verify Email Address</a>
        </p>

        <p style="color: #666; font-size: 14px;">This link will expire in 24 hours. If you didn't request this email, you can safely ignore it.</p>

        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

        <p style="color: #666; font-size: 14px;">
          The NVYT&trade; Team
        </p>
      </body>
      </html>
    `,
  }
}

export function ticketRegisteredNotificationEmail(data: {
  attendeeName: string
  eventTitle: string
  eventDate: string
  eventLocation?: string
  ticketType: string
  purchaserName: string
  ticketUrl: string
}): { subject: string; html: string } {
  return {
    subject: `A ticket to ${data.eventTitle} has been registered in your name`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <a href="https://nvyt.app" style="text-decoration: none; display: inline-flex; align-items: center; gap: 8px;">
            <img src="https://nvyt.app/logo.png" alt="nvyt" style="height: 56px; width: auto;" />
            <span style="font-size: 28px; font-weight: 700; color: #111; padding-top: 4px;">nvyt<sup style="font-size: 12px; font-weight: 400; vertical-align: super;">&trade;</sup></span>
          </a>
        </div>

        <h2 style="color: #111; margin-bottom: 10px;">You're Going to ${data.eventTitle}!</h2>

        <p>Hi ${data.attendeeName},</p>

        <p><strong>${data.purchaserName}</strong> has registered a ticket in your name for <strong>${data.eventTitle}</strong>.</p>

        <div style="background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <p style="margin: 0 0 10px 0;"><strong>Event:</strong> ${data.eventTitle}</p>
          <p style="margin: 0 0 10px 0;"><strong>Date:</strong> ${data.eventDate}</p>
          ${data.eventLocation ? `<p style="margin: 0 0 10px 0;"><strong>Location:</strong> ${data.eventLocation}</p>` : ''}
          <p style="margin: 0;"><strong>Ticket Type:</strong> ${data.ticketType}</p>
        </div>

        <p>Log in to your nvyt account to view your ticket and event details.</p>

        <p style="text-align: center; margin: 30px 0;">
          <a href="${data.ticketUrl}" style="display: inline-block; background: #6366f1; color: white; text-decoration: none; padding: 14px 28px; border-radius: 6px; font-weight: 500;">View Your Ticket</a>
        </p>

        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

        <p style="color: #666; font-size: 14px;">
          See you at the event!<br>
          The NVYT&trade; Team
        </p>
      </body>
      </html>
    `,
  }
}

export function paymentReminderEmail(data: {
  customerName: string
  eventTitle: string
  eventDate: string
  eventLocation?: string
  orderNumber: string
  totalAmount: string
  orderUrl: string
}): { subject: string; html: string } {
  return {
    subject: `Complete your order for ${data.eventTitle}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background: #f3f4f6;">
        <div style="background: white; border-radius: 12px; padding: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <div style="text-align: center; margin-bottom: 24px;">
            <img src="https://nvyt.app/logo.png" alt="nvyt" style="height: 56px; width: auto;" />
          </div>

          <div style="text-align: center; margin-bottom: 20px;">
            <div style="display: inline-block; background: #fef3c7; border-radius: 50%; padding: 16px;">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#d97706" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
              </svg>
            </div>
          </div>

          <h2 style="color: #111; margin-bottom: 10px; text-align: center;">Complete Your Order</h2>

          <p style="text-align: center;">Hi ${data.customerName},</p>

          <p style="text-align: center;">You have a pending order for <strong>${data.eventTitle}</strong>. Complete your payment to secure your spot!</p>

          <div style="background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 20px 0;">
            <p style="margin: 0 0 10px 0;"><strong>Order Number:</strong> ${data.orderNumber}</p>
            <p style="margin: 0 0 10px 0;"><strong>Event:</strong> ${data.eventTitle}</p>
            <p style="margin: 0 0 10px 0;"><strong>Date:</strong> ${data.eventDate}</p>
            ${data.eventLocation ? `<p style="margin: 0 0 10px 0;"><strong>Location:</strong> ${data.eventLocation}</p>` : ''}
            <p style="margin: 0; font-size: 18px;"><strong>Total:</strong> ${data.totalAmount}</p>
          </div>

          <p style="text-align: center; margin: 30px 0;">
            <a href="${data.orderUrl}" style="display: inline-block; background: #6366f1; color: white; text-decoration: none; padding: 14px 28px; border-radius: 6px; font-weight: 500;">Complete Payment</a>
          </p>

          <p style="color: #999; font-size: 13px; text-align: center; font-style: italic;">If you've already completed payment, please disregard this email.</p>

          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

          <p style="color: #666; font-size: 14px; text-align: center;">
            The NVYT&trade; Team
          </p>
        </div>
      </body>
      </html>
    `,
  }
}

export function paymentReminderSetupEmail(data: {
  customerName: string
  eventTitle: string
  eventDate: string
  eventLocation?: string
  orderNumber: string
  totalAmount: string
  setupUrl: string
}): { subject: string; html: string } {
  return {
    subject: `Complete your order for ${data.eventTitle}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background: #f3f4f6;">
        <div style="background: white; border-radius: 12px; padding: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <div style="text-align: center; margin-bottom: 24px;">
            <img src="https://nvyt.app/logo.png" alt="nvyt" style="height: 56px; width: auto;" />
          </div>

          <div style="text-align: center; margin-bottom: 20px;">
            <div style="display: inline-block; background: #fef3c7; border-radius: 50%; padding: 16px;">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#d97706" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
              </svg>
            </div>
          </div>

          <h2 style="color: #111; margin-bottom: 10px; text-align: center;">Complete Your Order</h2>

          <p style="text-align: center;">Hi ${data.customerName},</p>

          <p style="text-align: center;">You have a pending order for <strong>${data.eventTitle}</strong>. To complete your payment, you'll first need to set up your account password.</p>

          <div style="background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 20px 0;">
            <p style="margin: 0 0 10px 0;"><strong>Order Number:</strong> ${data.orderNumber}</p>
            <p style="margin: 0 0 10px 0;"><strong>Event:</strong> ${data.eventTitle}</p>
            <p style="margin: 0 0 10px 0;"><strong>Date:</strong> ${data.eventDate}</p>
            ${data.eventLocation ? `<p style="margin: 0 0 10px 0;"><strong>Location:</strong> ${data.eventLocation}</p>` : ''}
            <p style="margin: 0; font-size: 18px;"><strong>Total:</strong> ${data.totalAmount}</p>
          </div>

          <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 16px; margin: 20px 0;">
            <p style="margin: 0 0 8px 0; font-weight: 600; color: #1e40af;">Quick steps to complete your order:</p>
            <ol style="margin: 0; padding-left: 20px; color: #1e40af;">
              <li>Set up your account password (click the button below)</li>
              <li>Once logged in, go to your order to complete payment</li>
            </ol>
          </div>

          <p style="text-align: center; margin: 30px 0;">
            <a href="${data.setupUrl}" style="display: inline-block; background: #6366f1; color: white; text-decoration: none; padding: 14px 28px; border-radius: 6px; font-weight: 500;">Set Up Account & Complete Order</a>
          </p>

          <p style="color: #999; font-size: 13px; text-align: center; font-style: italic;">If you've already completed payment, please disregard this email.</p>

          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

          <p style="color: #666; font-size: 14px; text-align: center;">
            The NVYT&trade; Team
          </p>
        </div>
      </body>
      </html>
    `,
  }
}

export function supportReplyNotificationEmail(data: {
  visitorName: string
  responderName: string
  messagePreview: string
  resumeUrl: string
  eventTitle?: string
}): { subject: string; html: string } {
  const contextLine = data.eventTitle
    ? ` regarding <strong>${data.eventTitle}</strong>`
    : ''

  return {
    subject: 'You have a new reply from nvyt support',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <a href="https://nvyt.app" style="text-decoration: none; display: inline-flex; align-items: center; gap: 8px;">
            <img src="https://nvyt.app/logo.png" alt="nvyt" style="height: 56px; width: auto;" />
            <span style="font-size: 28px; font-weight: 700; color: #111; padding-top: 4px;">nvyt<sup style="font-size: 12px; font-weight: 400; vertical-align: super;">&trade;</sup></span>
          </a>
        </div>

        <h2 style="color: #111; margin-bottom: 10px;">New Reply to Your Conversation</h2>

        <p>Hi ${data.visitorName},</p>

        <p><strong>${data.responderName}</strong> replied to your support conversation${contextLine}:</p>

        <div style="background: #f8f9fa; border-left: 4px solid #6366f1; border-radius: 4px; padding: 16px; margin: 20px 0;">
          <p style="margin: 0; color: #444; white-space: pre-wrap;">${data.messagePreview}</p>
        </div>

        <p style="text-align: center; margin: 30px 0;">
          <a href="${data.resumeUrl}" style="display: inline-block; background: #6366f1; color: white; text-decoration: none; padding: 14px 28px; border-radius: 6px; font-weight: 500;">Continue Conversation</a>
        </p>

        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

        <p style="color: #666; font-size: 14px;">
          The NVYT&trade; Team
        </p>
      </body>
      </html>
    `,
  }
}

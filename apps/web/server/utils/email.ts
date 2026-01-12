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

  // Check if SMTP is configured
  if (!config.smtpHost || !config.smtpUser || !config.smtpPass) {
    return null
  }

  const smtpConfig: SMTPTransport.Options = {
    host: config.smtpHost as string,
    port: Number(config.smtpPort) || 587,
    secure: config.smtpSecure === 'true',
    auth: {
      user: config.smtpUser as string,
      pass: config.smtpPass as string,
    },
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
      from: (config.smtpFrom as string) || 'nvyt <noreply@nvyt.app>',
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
        from: 'nvyt <noreply@nvyt.app>',
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
          <h1 style="color: #6366f1; margin: 0;">nvyt</h1>
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
          The nvyt Team
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
          <h1 style="color: #6366f1; margin: 0;">nvyt</h1>
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
          The nvyt Team
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
          <h1 style="color: #6366f1; margin: 0;">nvyt</h1>
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
          The nvyt Team
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
          <h1 style="color: #6366f1; margin: 0;">nvyt</h1>
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
          The nvyt Team
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
          <h1 style="color: #6366f1; margin: 0;">nvyt</h1>
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
          The nvyt Team
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
          <h1 style="color: #6366f1; margin: 0;">nvyt</h1>
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
          The nvyt Team
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
          <h1 style="color: #6366f1; margin: 0;">nvyt</h1>
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
          The nvyt Team
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
          <h1 style="color: #6366f1; margin: 0;">nvyt</h1>
        </div>

        <h2 style="color: #111; margin-bottom: 10px;">Event Cancelled</h2>

        <p>Hi ${data.userName},</p>

        <p>We're sorry to inform you that <strong>${data.eventTitle}</strong> scheduled for ${data.eventDate} has been cancelled by the organizer (${data.organizerName}).</p>

        <p>If you have any questions, please reach out to the event organizer directly.</p>

        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

        <p style="color: #666; font-size: 14px;">
          The nvyt Team
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
}): { subject: string; html: string } {
  const ticketRows = data.tickets
    .map(
      (t) => `
        <tr>
          <td style="padding: 12px; border-bottom: 1px solid #eee;">${t.ticketType}</td>
          <td style="padding: 12px; border-bottom: 1px solid #eee;">${t.attendeeName}</td>
          <td style="padding: 12px; border-bottom: 1px solid #eee; font-family: monospace;">${t.qrCode}</td>
        </tr>
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
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #6366f1; margin: 0;">nvyt</h1>
        </div>

        <h2 style="color: #111; margin-bottom: 10px;">Your Tickets Are Confirmed!</h2>

        <p>Hi ${data.userName},</p>

        <p>Thank you for your purchase! Your tickets for <strong>${data.eventTitle}</strong> are now confirmed.</p>

        <div style="background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <p style="margin: 0 0 10px 0;"><strong>Order Number:</strong> ${data.orderNumber}</p>
          <p style="margin: 0 0 10px 0;"><strong>Date:</strong> ${data.eventDate}</p>
          ${data.eventLocation ? `<p style="margin: 0 0 10px 0;"><strong>Location:</strong> ${data.eventLocation}</p>` : ''}
          <p style="margin: 0;"><strong>Total:</strong> ${data.totalAmount}</p>
        </div>

        <h3 style="color: #111; margin-top: 30px;">Your Tickets</h3>

        <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
          <thead>
            <tr style="background: #6366f1; color: white;">
              <th style="padding: 12px; text-align: left;">Ticket Type</th>
              <th style="padding: 12px; text-align: left;">Attendee</th>
              <th style="padding: 12px; text-align: left;">QR Code</th>
            </tr>
          </thead>
          <tbody>
            ${ticketRows}
          </tbody>
        </table>

        <p style="color: #666; font-size: 14px;">Show your QR code at the event for check-in. You can also access your tickets anytime from your order page.</p>

        <p style="text-align: center; margin: 30px 0;">
          <a href="${data.orderUrl}" style="display: inline-block; background: #6366f1; color: white; text-decoration: none; padding: 14px 28px; border-radius: 6px; font-weight: 500;">View Your Tickets</a>
        </p>

        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

        <p style="color: #666; font-size: 14px;">
          See you at the event!<br>
          The nvyt Team
        </p>
      </body>
      </html>
    `,
  }
}

export function accountSetupEmail(data: {
  userName: string
  setupUrl: string
  orderNumber: string
  eventTitle: string
}): { subject: string; html: string } {
  return {
    subject: `Set up your nvyt account - Order ${data.orderNumber}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #6366f1; margin: 0;">nvyt</h1>
        </div>

        <h2 style="color: #111; margin-bottom: 10px;">Your Tickets are Ready!</h2>

        <p>Hi ${data.userName},</p>

        <p>Thank you for your purchase! Your tickets for <strong>${data.eventTitle}</strong> are confirmed.</p>

        <p>Order Number: <strong>${data.orderNumber}</strong></p>

        <p>To access your tickets anytime and manage your account, please set up a password:</p>

        <p style="text-align: center; margin: 30px 0;">
          <a href="${data.setupUrl}" style="display: inline-block; background: #6366f1; color: white; text-decoration: none; padding: 14px 28px; border-radius: 6px; font-weight: 500;">Set Up Your Account</a>
        </p>

        <p style="color: #666; font-size: 14px;">This link will expire in 7 days. After that, you can use the "Resend setup link" option on the login page, or use the forgot password feature.</p>

        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

        <p style="color: #666; font-size: 14px;">
          The nvyt Team
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
          <h1 style="color: #6366f1; margin: 0;">nvyt</h1>
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
          The nvyt Team
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
          <h1 style="color: #6366f1; margin: 0;">nvyt</h1>
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
          The nvyt Team
        </p>
      </body>
      </html>
    `,
  }
}

export function rsvpInvitationEmail(data: {
  organizerName: string
  eventTitle: string
  eventDate: string
  eventLocation?: string
  eventDescription?: string
  customMessage?: string
  rsvpUrl: string
}): { subject: string; html: string } {
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
          <h1 style="color: #6366f1; margin: 0;">nvyt</h1>
        </div>

        <h2 style="color: #111; margin-bottom: 10px;">You're Invited!</h2>

        <p>Hi there,</p>

        <p><strong>${data.organizerName}</strong> has invited you to:</p>

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
            View Event & RSVP
          </a>
        </p>

        <p style="color: #666; font-size: 14px; text-align: center;">
          Click the button above to view the full event details and let us know if you can make it.
        </p>

        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

        <p style="color: #666; font-size: 14px;">
          The nvyt Team
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
          <h1 style="color: #6366f1; margin: 0;">nvyt</h1>
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
          The nvyt Team
        </p>
      </body>
      </html>
    `,
  }
}

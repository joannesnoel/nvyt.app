import PDFDocument from 'pdfkit'
import QRCode from 'qrcode'
import fetch from 'node-fetch'

interface TicketData {
  ticketNumber: string
  qrCode: string
  attendeeName: string | null
  attendeeEmail: string | null
  ticketTypeName: string
  ticketTypePrice: string
  eventTitle: string
  eventDate: Date
  eventEndDate: Date | null
  eventLocation: string | null
  eventTimezone: string
  orderNumber: string
  organizationName: string | null
}

function formatDate(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timezone,
  }).format(date)
}

function formatPrice(price: string): string {
  const numPrice = parseFloat(price)
  if (numPrice === 0) return 'FREE'
  return `PHP ${numPrice.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
}

export async function generateTicketPdf(ticket: TicketData): Promise<Buffer> {
  return new Promise(async (resolve, reject) => {
    try {
      const chunks: Buffer[] = []

      // Create PDF document - letter size
      const doc = new PDFDocument({
        size: 'letter',
        margin: 30,
      })

      doc.on('data', (chunk) => chunks.push(chunk))
      doc.on('end', () => resolve(Buffer.concat(chunks)))
      doc.on('error', reject)

      // Fetch logo image
      let logoBuffer: Buffer | null = null
      try {
        const logoResponse = await fetch('https://nvyt.app/logo.png')
        if (logoResponse.ok) {
          const arrayBuffer = await logoResponse.arrayBuffer()
          logoBuffer = Buffer.from(arrayBuffer)
        }
      } catch (e) {
        console.warn('[Ticket PDF] Failed to fetch logo:', e)
      }

      // Generate QR code as data URL
      const qrDataUrl = await QRCode.toDataURL(ticket.qrCode, {
        width: 200,
        margin: 1,
        color: {
          dark: '#000000',
          light: '#FFFFFF',
        },
      })

      // Colors
      const primaryColor = '#6366F1' // Indigo
      const textDark = '#1F2937'
      const textMuted = '#6B7280'

      // Page dimensions
      const pageWidth = 612
      const centerX = pageWidth / 2

      // Header with logo or brand
      if (logoBuffer) {
        doc.image(logoBuffer, centerX - 40, 30, { width: 80 })
      } else {
        doc
          .fillColor(primaryColor)
          .fontSize(24)
          .font('Helvetica-Bold')
          .text('NVYT', centerX - 25, 40)
      }

      // Event Title
      doc
        .fillColor(textDark)
        .fontSize(24)
        .font('Helvetica-Bold')
        .text(ticket.eventTitle, 50, 115, {
          width: 512,
          align: 'center',
        })

      // Organizer
      if (ticket.organizationName) {
        doc
          .fillColor(textMuted)
          .fontSize(14)
          .font('Helvetica')
          .text(`Organized by ${ticket.organizationName}`, 50, doc.y + 10, {
            width: 512,
            align: 'center',
          })
      }

      // Two column layout
      const leftColX = 50
      const rightColX = 350
      const contentY = doc.y + 30

      // Left column - Event Details
      doc
        .fillColor(textMuted)
        .fontSize(11)
        .font('Helvetica')
        .text('DATE & TIME', leftColX, contentY)

      doc
        .fillColor(textDark)
        .fontSize(14)
        .font('Helvetica-Bold')
        .text(formatDate(ticket.eventDate, ticket.eventTimezone), leftColX, contentY + 15, {
          width: 230,
        })

      if (ticket.eventLocation) {
        const locationY = doc.y + 15
        doc
          .fillColor(textMuted)
          .fontSize(11)
          .font('Helvetica')
          .text('LOCATION', leftColX, locationY)

        doc
          .fillColor(textDark)
          .fontSize(14)
          .font('Helvetica-Bold')
          .text(ticket.eventLocation, leftColX, locationY + 15, {
            width: 230,
          })
      }

      const ticketTypeY = doc.y + 20
      doc
        .fillColor(textMuted)
        .fontSize(11)
        .font('Helvetica')
        .text('TICKET TYPE', leftColX, ticketTypeY)

      doc
        .fillColor(textDark)
        .fontSize(14)
        .font('Helvetica-Bold')
        .text(`${ticket.ticketTypeName} - ${formatPrice(ticket.ticketTypePrice)}`, leftColX, ticketTypeY + 15)

      const attendeeY = doc.y + 20
      doc
        .fillColor(textMuted)
        .fontSize(11)
        .font('Helvetica')
        .text('ATTENDEE', leftColX, attendeeY)

      doc
        .fillColor(textDark)
        .fontSize(14)
        .font('Helvetica-Bold')
        .text(ticket.attendeeName || 'Not specified', leftColX, attendeeY + 15)

      if (ticket.attendeeEmail) {
        doc
          .fillColor(textMuted)
          .fontSize(11)
          .font('Helvetica')
          .text(ticket.attendeeEmail, leftColX, doc.y + 5)
      }

      // Right column - QR Code
      const qrSize = 160
      const qrBuffer = Buffer.from(qrDataUrl.split(',')[1] ?? '', 'base64')
      doc.image(qrBuffer, rightColX + 50, contentY - 10, { width: qrSize, height: qrSize })

      // Ticket Number below QR
      doc
        .fillColor(textMuted)
        .fontSize(11)
        .font('Helvetica')
        .text('TICKET #', rightColX, contentY + qrSize + 15, {
          width: 212,
          align: 'center',
        })

      doc
        .fillColor(textDark)
        .fontSize(16)
        .font('Helvetica-Bold')
        .text(ticket.ticketNumber, rightColX, doc.y + 5, {
          width: 212,
          align: 'center',
        })

      // Order Number
      doc
        .fillColor(textMuted)
        .fontSize(10)
        .font('Helvetica')
        .text(`Order: ${ticket.orderNumber}`, rightColX, doc.y + 8, {
          width: 212,
          align: 'center',
        })


      // Footer
      doc
        .fillColor(textMuted)
        .fontSize(10)
        .font('Helvetica')
        .text('Present this ticket at the venue for entry', 50, 680, {
          width: 512,
          align: 'center',
        })

      // Contact information
      const contactY = doc.y + 15
      doc
        .fillColor(textMuted)
        .fontSize(10)
        .font('Helvetica')
        .text('Questions? Visit https://nvyt.app', 50, contactY, {
          width: 512,
          align: 'center',
        })

      // Finalize the PDF
      doc.end()
    } catch (error) {
      reject(error)
    }
  })
}

export async function generateAllTicketsPdf(tickets: TicketData[]): Promise<Buffer> {
  return new Promise(async (resolve, reject) => {
    try {
      const chunks: Buffer[] = []

      // Create PDF document - letter size
      const doc = new PDFDocument({
        size: 'letter',
        margin: 30,
      })

      doc.on('data', (chunk) => chunks.push(chunk))
      doc.on('end', () => resolve(Buffer.concat(chunks)))
      doc.on('error', reject)

      // Fetch logo image
      let logoBuffer: Buffer | null = null
      try {
        const logoResponse = await fetch('https://nvyt.app/logo.png')
        if (logoResponse.ok) {
          const arrayBuffer = await logoResponse.arrayBuffer()
          logoBuffer = Buffer.from(arrayBuffer)
        }
      } catch (e) {
        console.warn('[Ticket PDF] Failed to fetch logo:', e)
      }

      // Colors
      const primaryColor = '#6366F1'
      const textDark = '#1F2937'
      const textMuted = '#6B7280'

      const pageWidth = 612
      const centerX = pageWidth / 2

      for (let i = 0; i < tickets.length; i++) {
        const ticket = tickets[i]
        if (!ticket) continue

        if (i > 0) {
          doc.addPage()
        }

        // Generate QR code
        const qrDataUrl = await QRCode.toDataURL(ticket.qrCode, {
          width: 200,
          margin: 1,
          color: {
            dark: '#000000',
            light: '#FFFFFF',
          },
        })

      // Header with logo or brand
      if (logoBuffer) {
        doc.image(logoBuffer, centerX - 40, 30, { width: 80 })
      } else {
        doc
          .fillColor(primaryColor)
          .fontSize(24)
          .font('Helvetica-Bold')
          .text('NVYT', centerX - 25, 40)
      }

        // Ticket counter
        doc
          .fillColor(textMuted)
          .fontSize(10)
          .font('Helvetica')
          .text(`Ticket ${i + 1} of ${tickets.length}`, 400, 40, {
            width: 135,
            align: 'right',
          })

        // Event Title
        doc
          .fillColor(textDark)
          .fontSize(24)
          .font('Helvetica-Bold')
          .text(ticket.eventTitle, 50, 115, {
            width: 512,
            align: 'center',
          })

        // Organizer
        if (ticket.organizationName) {
          doc
            .fillColor(textMuted)
            .fontSize(14)
            .font('Helvetica')
            .text(`Organized by ${ticket.organizationName}`, 50, doc.y + 10, {
              width: 512,
              align: 'center',
            })
        }

        // Two column layout
        const leftColX = 50
        const rightColX = 350
        const contentY = doc.y + 30

        // Left column - Event Details
        doc
          .fillColor(textMuted)
          .fontSize(11)
          .font('Helvetica')
          .text('DATE & TIME', leftColX, contentY)

        doc
          .fillColor(textDark)
          .fontSize(14)
          .font('Helvetica-Bold')
          .text(formatDate(ticket.eventDate, ticket.eventTimezone), leftColX, contentY + 15, {
            width: 230,
          })

        if (ticket.eventLocation) {
          const locationY = doc.y + 15
          doc
            .fillColor(textMuted)
            .fontSize(11)
            .font('Helvetica')
            .text('LOCATION', leftColX, locationY)

          doc
            .fillColor(textDark)
            .fontSize(14)
            .font('Helvetica-Bold')
            .text(ticket.eventLocation, leftColX, locationY + 15, {
              width: 230,
            })
        }

        const ticketTypeY = doc.y + 20
        doc
          .fillColor(textMuted)
          .fontSize(11)
          .font('Helvetica')
          .text('TICKET TYPE', leftColX, ticketTypeY)

        doc
          .fillColor(textDark)
          .fontSize(14)
          .font('Helvetica-Bold')
          .text(`${ticket.ticketTypeName} - ${formatPrice(ticket.ticketTypePrice)}`, leftColX, ticketTypeY + 15)

        const attendeeY = doc.y + 20
        doc
          .fillColor(textMuted)
          .fontSize(11)
          .font('Helvetica')
          .text('ATTENDEE', leftColX, attendeeY)

        doc
          .fillColor(textDark)
          .fontSize(14)
          .font('Helvetica-Bold')
          .text(ticket.attendeeName || 'Not specified', leftColX, attendeeY + 15)

        if (ticket.attendeeEmail) {
          doc
            .fillColor(textMuted)
            .fontSize(11)
            .font('Helvetica')
            .text(ticket.attendeeEmail, leftColX, doc.y + 5)
        }

        // Right column - QR Code
        const qrSize = 160
        const qrBuffer = Buffer.from(qrDataUrl.split(',')[1] ?? '', 'base64')
        doc.image(qrBuffer, rightColX + 50, contentY - 10, { width: qrSize, height: qrSize })

        // Ticket Number below QR
        doc
          .fillColor(textMuted)
          .fontSize(11)
          .font('Helvetica')
          .text('TICKET #', rightColX, contentY + qrSize + 15, {
            width: 212,
            align: 'center',
          })

        doc
          .fillColor(textDark)
          .fontSize(16)
          .font('Helvetica-Bold')
          .text(ticket.ticketNumber, rightColX, doc.y + 5, {
            width: 212,
            align: 'center',
          })

        // Order Number
        doc
          .fillColor(textMuted)
          .fontSize(10)
          .font('Helvetica')
          .text(`Order: ${ticket.orderNumber}`, rightColX, doc.y + 8, {
            width: 212,
            align: 'center',
          })

        // Footer
        doc
        .fillColor(textMuted)
        .fontSize(10)
        .font('Helvetica')
        .text('Present this ticket at the venue for entry', 50, 680, {
          width: 512,
          align: 'center',
        })

      // Contact information
      const contactY = doc.y + 15
      doc
        .fillColor(textMuted)
        .fontSize(10)
        .font('Helvetica')
        .text('Questions? Visit https://nvyt.app', 50, contactY, {
          width: 512,
          align: 'center',
        })
      }

      doc.end()
    } catch (error) {
      reject(error)
    }
  })
}

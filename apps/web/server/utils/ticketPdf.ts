import PDFDocument from 'pdfkit'
import QRCode from 'qrcode'

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
  return `₱${numPrice.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
}

export async function generateTicketPdf(ticket: TicketData): Promise<Buffer> {
  return new Promise(async (resolve, reject) => {
    try {
      const chunks: Buffer[] = []

      // Create PDF document - ticket size (roughly 4x6 inches)
      const doc = new PDFDocument({
        size: [288, 432], // 4x6 inches at 72 DPI
        margin: 20,
      })

      doc.on('data', (chunk) => chunks.push(chunk))
      doc.on('end', () => resolve(Buffer.concat(chunks)))
      doc.on('error', reject)

      // Generate QR code as data URL
      const qrDataUrl = await QRCode.toDataURL(ticket.qrCode, {
        width: 150,
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

      // Header with brand
      doc
        .fillColor(primaryColor)
        .fontSize(18)
        .font('Helvetica-Bold')
        .text('NVYT', 20, 20)

      doc
        .fillColor(textMuted)
        .fontSize(8)
        .font('Helvetica')
        .text('EVENT TICKET', 20, 40)

      // Divider line
      doc
        .strokeColor('#E5E7EB')
        .lineWidth(1)
        .moveTo(20, 55)
        .lineTo(268, 55)
        .stroke()

      // Event Title
      doc
        .fillColor(textDark)
        .fontSize(14)
        .font('Helvetica-Bold')
        .text(ticket.eventTitle, 20, 65, {
          width: 248,
          align: 'center',
        })

      // Organizer
      if (ticket.organizationName) {
        doc
          .fillColor(textMuted)
          .fontSize(9)
          .font('Helvetica')
          .text(`by ${ticket.organizationName}`, 20, doc.y + 5, {
            width: 248,
            align: 'center',
          })
      }

      // Event Details
      const detailsY = doc.y + 15

      // Date
      doc
        .fillColor(textMuted)
        .fontSize(8)
        .font('Helvetica')
        .text('DATE & TIME', 20, detailsY)

      doc
        .fillColor(textDark)
        .fontSize(10)
        .font('Helvetica-Bold')
        .text(formatDate(ticket.eventDate, ticket.eventTimezone), 20, detailsY + 12, {
          width: 248,
        })

      // Location
      if (ticket.eventLocation) {
        const locationY = doc.y + 10
        doc
          .fillColor(textMuted)
          .fontSize(8)
          .font('Helvetica')
          .text('LOCATION', 20, locationY)

        doc
          .fillColor(textDark)
          .fontSize(10)
          .font('Helvetica-Bold')
          .text(ticket.eventLocation, 20, locationY + 12, {
            width: 248,
          })
      }

      // Ticket Type
      const ticketTypeY = doc.y + 10
      doc
        .fillColor(textMuted)
        .fontSize(8)
        .font('Helvetica')
        .text('TICKET TYPE', 20, ticketTypeY)

      doc
        .fillColor(textDark)
        .fontSize(10)
        .font('Helvetica-Bold')
        .text(`${ticket.ticketTypeName} - ${formatPrice(ticket.ticketTypePrice)}`, 20, ticketTypeY + 12)

      // Attendee Name
      const attendeeY = doc.y + 10
      doc
        .fillColor(textMuted)
        .fontSize(8)
        .font('Helvetica')
        .text('ATTENDEE', 20, attendeeY)

      doc
        .fillColor(textDark)
        .fontSize(10)
        .font('Helvetica-Bold')
        .text(ticket.attendeeName || 'Not specified', 20, attendeeY + 12)

      if (ticket.attendeeEmail) {
        doc
          .fillColor(textMuted)
          .fontSize(8)
          .font('Helvetica')
          .text(ticket.attendeeEmail, 20, doc.y + 2)
      }

      // Divider before QR code
      const qrDividerY = doc.y + 15
      doc
        .strokeColor('#E5E7EB')
        .lineWidth(1)
        .dash(3, { space: 3 })
        .moveTo(20, qrDividerY)
        .lineTo(268, qrDividerY)
        .stroke()
        .undash()

      // QR Code
      const qrY = qrDividerY + 15
      const qrSize = 100
      const qrX = (288 - qrSize) / 2

      // Convert data URL to buffer for PDFKit
      const qrBuffer = Buffer.from(qrDataUrl.split(',')[1], 'base64')
      doc.image(qrBuffer, qrX, qrY, { width: qrSize, height: qrSize })

      // Ticket Number below QR
      const ticketNumY = qrY + qrSize + 10
      doc
        .fillColor(textMuted)
        .fontSize(8)
        .font('Helvetica')
        .text('TICKET #', 20, ticketNumY, {
          width: 248,
          align: 'center',
        })

      doc
        .fillColor(textDark)
        .fontSize(12)
        .font('Helvetica-Bold')
        .text(ticket.ticketNumber, 20, ticketNumY + 12, {
          width: 248,
          align: 'center',
        })

      // Order Number
      doc
        .fillColor(textMuted)
        .fontSize(7)
        .font('Helvetica')
        .text(`Order: ${ticket.orderNumber}`, 20, doc.y + 5, {
          width: 248,
          align: 'center',
        })

      // Footer
      doc
        .fillColor(textMuted)
        .fontSize(7)
        .font('Helvetica')
        .text('Present this ticket at the venue for entry', 20, 410, {
          width: 248,
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

      // Create PDF document - A4 for multiple tickets
      const doc = new PDFDocument({
        size: 'A4',
        margin: 30,
      })

      doc.on('data', (chunk) => chunks.push(chunk))
      doc.on('end', () => resolve(Buffer.concat(chunks)))
      doc.on('error', reject)

      // Colors
      const primaryColor = '#6366F1'
      const textDark = '#1F2937'
      const textMuted = '#6B7280'

      for (let i = 0; i < tickets.length; i++) {
        const ticket = tickets[i]

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

        // Header
        doc
          .fillColor(primaryColor)
          .fontSize(24)
          .font('Helvetica-Bold')
          .text('NVYT', 30, 30)

        doc
          .fillColor(textMuted)
          .fontSize(10)
          .font('Helvetica')
          .text('EVENT TICKET', 30, 58)

        // Ticket counter
        doc
          .fillColor(textMuted)
          .fontSize(10)
          .font('Helvetica')
          .text(`Ticket ${i + 1} of ${tickets.length}`, 400, 40, {
            width: 135,
            align: 'right',
          })

        // Divider
        doc
          .strokeColor('#E5E7EB')
          .lineWidth(1)
          .moveTo(30, 80)
          .lineTo(565, 80)
          .stroke()

        // Event Title
        doc
          .fillColor(textDark)
          .fontSize(22)
          .font('Helvetica-Bold')
          .text(ticket.eventTitle, 30, 100, {
            width: 535,
          })

        // Organizer
        if (ticket.organizationName) {
          doc
            .fillColor(textMuted)
            .fontSize(12)
            .font('Helvetica')
            .text(`Organized by ${ticket.organizationName}`, 30, doc.y + 8)
        }

        // Two column layout
        const leftColX = 30
        const rightColX = 320
        const contentY = doc.y + 30

        // Left column - Event Details
        doc
          .fillColor(textMuted)
          .fontSize(9)
          .font('Helvetica')
          .text('DATE & TIME', leftColX, contentY)

        doc
          .fillColor(textDark)
          .fontSize(12)
          .font('Helvetica-Bold')
          .text(formatDate(ticket.eventDate, ticket.eventTimezone), leftColX, contentY + 14, {
            width: 270,
          })

        const locationY = doc.y + 20
        if (ticket.eventLocation) {
          doc
            .fillColor(textMuted)
            .fontSize(9)
            .font('Helvetica')
            .text('LOCATION', leftColX, locationY)

          doc
            .fillColor(textDark)
            .fontSize(12)
            .font('Helvetica-Bold')
            .text(ticket.eventLocation, leftColX, locationY + 14, {
              width: 270,
            })
        }

        const ticketTypeY = doc.y + 20
        doc
          .fillColor(textMuted)
          .fontSize(9)
          .font('Helvetica')
          .text('TICKET TYPE', leftColX, ticketTypeY)

        doc
          .fillColor(textDark)
          .fontSize(12)
          .font('Helvetica-Bold')
          .text(`${ticket.ticketTypeName} - ${formatPrice(ticket.ticketTypePrice)}`, leftColX, ticketTypeY + 14)

        const attendeeY = doc.y + 20
        doc
          .fillColor(textMuted)
          .fontSize(9)
          .font('Helvetica')
          .text('ATTENDEE', leftColX, attendeeY)

        doc
          .fillColor(textDark)
          .fontSize(12)
          .font('Helvetica-Bold')
          .text(ticket.attendeeName || 'Not specified', leftColX, attendeeY + 14)

        if (ticket.attendeeEmail) {
          doc
            .fillColor(textMuted)
            .fontSize(10)
            .font('Helvetica')
            .text(ticket.attendeeEmail, leftColX, doc.y + 4)
        }

        // Right column - QR Code
        const qrSize = 150
        const qrBuffer = Buffer.from(qrDataUrl.split(',')[1], 'base64')
        doc.image(qrBuffer, rightColX + 45, contentY, { width: qrSize, height: qrSize })

        // Ticket Number below QR
        doc
          .fillColor(textMuted)
          .fontSize(9)
          .font('Helvetica')
          .text('TICKET #', rightColX, contentY + qrSize + 15, {
            width: 245,
            align: 'center',
          })

        doc
          .fillColor(textDark)
          .fontSize(16)
          .font('Helvetica-Bold')
          .text(ticket.ticketNumber, rightColX, doc.y + 5, {
            width: 245,
            align: 'center',
          })

        // Order Number
        doc
          .fillColor(textMuted)
          .fontSize(10)
          .font('Helvetica')
          .text(`Order: ${ticket.orderNumber}`, rightColX, doc.y + 8, {
            width: 245,
            align: 'center',
          })

        // Footer divider
        doc
          .strokeColor('#E5E7EB')
          .lineWidth(1)
          .dash(5, { space: 5 })
          .moveTo(30, 750)
          .lineTo(565, 750)
          .stroke()
          .undash()

        // Footer instructions
        doc
          .fillColor(textMuted)
          .fontSize(10)
          .font('Helvetica')
          .text('Present this ticket at the venue for entry. Your QR code will be scanned for check-in.', 30, 765, {
            width: 535,
            align: 'center',
          })
      }

      doc.end()
    } catch (error) {
      reject(error)
    }
  })
}

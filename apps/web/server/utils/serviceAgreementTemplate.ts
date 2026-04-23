export interface ServiceAgreementData {
  // Platform
  platformName: string
  platformUrl: string

  // Organizer / Business
  organizerName: string
  organizerEmail: string
  businessName: string
  businessType: string
  businessTypeRaw: string // raw value e.g. 'sole_proprietor', 'corporation'
  registrationNumber: string

  // Event
  eventTitle: string
  eventDate: string
  eventLocation: string

  // Fees
  adminFeeRate: string // e.g. "2" for 2%
  paymentProcessingFee: string // e.g. "3.5"

  // Agreement
  agreementDate: string
}

export function generateServiceAgreementHtml(data: ServiceAgreementData): string {
  return `
<div style="font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px; color: #111; line-height: 1.8; font-size: 14px;">

  <div style="text-align: center; margin-bottom: 40px;">
    <div style="display: inline-block; text-align: center;">
      <img src="${data.platformUrl}/logo.png" alt="${data.platformName}" style="height: 48px; width: auto; display: block; margin: 0 auto 4px auto;" />
      <p style="font-size: 12px; color: #555; margin: 0; letter-spacing: 0.5px;">NVYT™ Events &amp; Tickets</p>
    </div>
    <h1 style="font-size: 22px; font-weight: bold; margin: 20px 0 4px 0; letter-spacing: 1px;">SERVICE AGREEMENT</h1>
    <p style="font-size: 13px; color: #555; margin: 0;">Event Ticketing and Management Services</p>
  </div>

  <p>This Service Agreement (the <strong>"Agreement"</strong>) is entered into as of <strong>${data.agreementDate}</strong> (the <strong>"Effective Date"</strong>), by and between:</p>

  <table style="width: 100%; margin: 20px 0 30px 0; border-collapse: collapse;">
    <tr>
      <td style="width: 50%; vertical-align: top; padding: 16px; border: 1px solid #ddd;">
        <p style="margin: 0 0 8px 0; font-weight: bold; font-size: 13px; color: #555; text-transform: uppercase;">Service Provider</p>
        <p style="margin: 0; font-weight: bold;">${data.platformName}</p>
        <p style="margin: 0; font-size: 13px;">Joannes L. Noel</p>
        <p style="margin: 0; font-size: 13px; color: #555;">hello@nvyt.app</p>
        <p style="margin: 4px 0 0 0; font-size: 13px; color: #555;">Sole Proprietor</p>
        <p style="margin: 0; font-size: 13px; color: #555;">DTI Reg. No.: 7689268</p>
      </td>
      <td style="width: 50%; vertical-align: top; padding: 16px; border: 1px solid #ddd;">
        <p style="margin: 0 0 8px 0; font-weight: bold; font-size: 13px; color: #555; text-transform: uppercase;">Event Organizer</p>
        <p style="margin: 0; font-weight: bold;">${data.businessName}</p>
        <p style="margin: 0; font-size: 13px;">${data.organizerName}</p>
        <p style="margin: 0; font-size: 13px; color: #555;">${data.organizerEmail}</p>
        ${data.businessType ? `<p style="margin: 4px 0 0 0; font-size: 13px; color: #555;">${data.businessType}</p>` : ''}
        ${data.registrationNumber ? `<p style="margin: 0; font-size: 13px; color: #555;">${data.businessTypeRaw === 'sole_proprietor' ? 'DTI' : 'SEC'} Reg. No.: ${data.registrationNumber}</p>` : ''}
      </td>
    </tr>
  </table>

  <h2 style="font-size: 15px; font-weight: bold; margin: 30px 0 10px 0; border-bottom: 1px solid #ddd; padding-bottom: 6px;">1. EVENT DETAILS</h2>
  <table style="width: 100%; margin: 10px 0 20px 0; border-collapse: collapse;">
    <tr>
      <td style="padding: 6px 12px; font-weight: bold; width: 160px; color: #555;">Event Title:</td>
      <td style="padding: 6px 12px;">${data.eventTitle}</td>
    </tr>
    <tr>
      <td style="padding: 6px 12px; font-weight: bold; color: #555;">Event Date:</td>
      <td style="padding: 6px 12px;">${data.eventDate}</td>
    </tr>
    <tr>
      <td style="padding: 6px 12px; font-weight: bold; color: #555;">Event Location:</td>
      <td style="padding: 6px 12px;">${data.eventLocation}</td>
    </tr>
  </table>

  <h2 style="font-size: 15px; font-weight: bold; margin: 30px 0 10px 0; border-bottom: 1px solid #ddd; padding-bottom: 6px;">2. SCOPE OF SERVICES</h2>
  <p>The Service Provider agrees to provide the Event Organizer with the following services through the ${data.platformName} platform:</p>
  <ol style="margin: 10px 0; padding-left: 20px;">
    <li style="margin-bottom: 6px;"><strong>Online Ticketing</strong> — Creation, management, and sale of event tickets through the platform.</li>
    <li style="margin-bottom: 6px;"><strong>Payment Processing</strong> — Secure collection and processing of ticket payments from attendees.</li>
    <li style="margin-bottom: 6px;"><strong>Digital Ticket Delivery</strong> — Generation and distribution of digital tickets with unique QR codes.</li>
    <li style="margin-bottom: 6px;"><strong>Check-in Management</strong> — QR code-based attendee check-in system for the event.</li>
    <li style="margin-bottom: 6px;"><strong>Event Dashboard</strong> — Real-time analytics, attendee management, and sales reporting.</li>
    <li style="margin-bottom: 6px;"><strong>Attendee Communication</strong> — Email notifications and announcements to ticket holders.</li>
  </ol>

  <h2 style="font-size: 15px; font-weight: bold; margin: 30px 0 10px 0; border-bottom: 1px solid #ddd; padding-bottom: 6px;">3. FEES AND PAYMENT TERMS</h2>
  <table style="width: 100%; margin: 10px 0; border-collapse: collapse; border: 1px solid #ddd;">
    <thead>
      <tr style="background: #f9f9f9;">
        <th style="padding: 10px 12px; text-align: left; border-bottom: 1px solid #ddd; font-size: 13px;">Fee Type</th>
        <th style="padding: 10px 12px; text-align: left; border-bottom: 1px solid #ddd; font-size: 13px;">Rate</th>
        <th style="padding: 10px 12px; text-align: left; border-bottom: 1px solid #ddd; font-size: 13px;">Description</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td style="padding: 10px 12px; border-bottom: 1px solid #eee; font-weight: bold;">Platform Fee</td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #eee;">${data.adminFeeRate}%</td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #eee; font-size: 13px; color: #555;">Per paid ticket, charged on the subtotal amount after discounts.</td>
      </tr>
      <tr>
        <td style="padding: 10px 12px; font-weight: bold;">Payment Processing Fee</td>
        <td style="padding: 10px 12px;">${data.paymentProcessingFee}%</td>
        <td style="padding: 10px 12px; font-size: 13px; color: #555;">Third-party payment gateway fee applied to each transaction.</td>
      </tr>
    </tbody>
  </table>
  <p style="font-size: 13px; color: #555; margin-top: 10px;">Fees are automatically deducted from each transaction before settlement. The Event Organizer receives the net amount (ticket price less all applicable fees) via the chosen payout method.</p>

  <h2 style="font-size: 15px; font-weight: bold; margin: 30px 0 10px 0; border-bottom: 1px solid #ddd; padding-bottom: 6px;">4. OBLIGATIONS OF THE EVENT ORGANIZER</h2>
  <ol style="margin: 10px 0; padding-left: 20px;">
    <li style="margin-bottom: 6px;">Provide accurate and complete event information on the platform.</li>
    <li style="margin-bottom: 6px;">Ensure the event complies with all applicable local laws, regulations, and permit requirements.</li>
    <li style="margin-bottom: 6px;">Honor all tickets sold through the platform and provide the event experience as advertised.</li>
    <li style="margin-bottom: 6px;">Respond promptly to attendee inquiries and support requests related to the event.</li>
    <li style="margin-bottom: 6px;">Notify the Service Provider immediately of any event cancellation, postponement, or significant changes.</li>
  </ol>

  <h2 style="font-size: 15px; font-weight: bold; margin: 30px 0 10px 0; border-bottom: 1px solid #ddd; padding-bottom: 6px;">5. OBLIGATIONS OF THE SERVICE PROVIDER</h2>
  <ol style="margin: 10px 0; padding-left: 20px;">
    <li style="margin-bottom: 6px;">Maintain platform availability and performance for ticket sales and event management.</li>
    <li style="margin-bottom: 6px;">Process payments securely in compliance with industry standards (PCI-DSS).</li>
    <li style="margin-bottom: 6px;">Provide technical support for platform-related issues.</li>
    <li style="margin-bottom: 6px;">Protect attendee data in accordance with applicable data privacy regulations.</li>
  </ol>

  <h2 style="font-size: 15px; font-weight: bold; margin: 30px 0 10px 0; border-bottom: 1px solid #ddd; padding-bottom: 6px;">6. CANCELLATION AND REFUND POLICY</h2>
  <p>In the event of cancellation by the Event Organizer:</p>
  <ol style="margin: 10px 0; padding-left: 20px;">
    <li style="margin-bottom: 6px;">The Event Organizer shall be responsible for issuing refunds to all ticket holders.</li>
    <li style="margin-bottom: 6px;">Payment processing fees are non-refundable.</li>
    <li style="margin-bottom: 6px;">The Service Provider shall assist in facilitating the refund process through the platform.</li>
  </ol>

  <h2 style="font-size: 15px; font-weight: bold; margin: 30px 0 10px 0; border-bottom: 1px solid #ddd; padding-bottom: 6px;">7. LIMITATION OF LIABILITY</h2>
  <p>The Service Provider shall not be liable for any direct, indirect, incidental, or consequential damages arising from the event itself, including but not limited to personal injury, property damage, or loss of revenue. The Service Provider's total liability under this Agreement shall not exceed the total fees collected for the event.</p>

  <h2 style="font-size: 15px; font-weight: bold; margin: 30px 0 10px 0; border-bottom: 1px solid #ddd; padding-bottom: 6px;">8. TERM AND TERMINATION</h2>
  <p>This Agreement is effective from the Effective Date and remains in force until 30 days after the conclusion of the event, unless terminated earlier by either party with 14 days' written notice. Upon termination, any unsold tickets shall be removed from the platform and outstanding payouts shall be settled within 30 business days.</p>

  <h2 style="font-size: 15px; font-weight: bold; margin: 30px 0 10px 0; border-bottom: 1px solid #ddd; padding-bottom: 6px;">9. GOVERNING LAW</h2>
  <p>This Agreement shall be governed by and construed in accordance with the laws of the Republic of the Philippines. Any disputes arising from this Agreement shall be resolved through amicable negotiation, and if unresolved, submitted to the appropriate courts.</p>

  <h2 style="font-size: 15px; font-weight: bold; margin: 30px 0 10px 0; border-bottom: 1px solid #ddd; padding-bottom: 6px;">10. SIGNATURES</h2>
  <p>IN WITNESS WHEREOF, the parties have executed this Agreement as of the Effective Date.</p>

  <table style="width: 100%; margin: 30px 0; border-collapse: collapse;">
    <tr>
      <td style="width: 50%; vertical-align: top; padding: 20px 20px 20px 0;">
        <p style="margin: 0 0 0 0; font-weight: bold; font-size: 13px; color: #555; text-transform: uppercase;">Service Provider</p>
        <div style="position: relative; height: 80px; margin-bottom: 0;">
          <img src="${data.platformUrl}/signature.jpg" alt="Signature" style="position: absolute; bottom: 0; left: 0; height: 80px; width: auto; mix-blend-mode: darken;" />
        </div>
        <div style="border-bottom: 1px solid #333; width: 250px; margin-bottom: 8px;"></div>
        <p style="margin: 0; font-weight: bold;">Joannes Lucero Noel</p>
        <p style="margin: 4px 0 0 0; font-size: 13px; color: #555;">NVYT™ Events and Tickets</p>
        <p style="margin: 20px 0 0 0; font-size: 13px; color: #555;">Date: ${data.agreementDate}</p>
      </td>
      <td style="width: 50%; vertical-align: top; padding: 20px 0 20px 20px;">
        <p style="margin: 0 0 0 0; font-weight: bold; font-size: 13px; color: #555; text-transform: uppercase;">Event Organizer</p>
        <div style="height: 80px;"></div>
        <div style="border-bottom: 1px solid #333; width: 250px; margin-bottom: 8px;"></div>
        <p style="margin: 0; font-weight: bold;">${data.organizerName}</p>
        <p style="margin: 4px 0 0 0; font-size: 13px; color: #555;">${data.businessName}</p>
        <p style="margin: 20px 0 0 0; font-size: 13px; color: #555;">Date: ___________________</p>
      </td>
    </tr>
  </table>

</div>
`.trim()
}

<script setup lang="ts">
definePageMeta({
  layout: 'default',
})

useSeoMeta({
  title: 'Terms of Service - NVYT',
  description: 'Terms of Service for NVYT event management and ticketing platform.',
})
</script>

<template>
  <div class="py-12 lg:py-20">
    <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="mb-12">
        <h1 class="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-4">
          Terms of Service
        </h1>
        <p class="text-gray-500 dark:text-gray-400">
          Last updated: January 14, 2025
        </p>
      </div>

      <div class="prose prose-gray dark:prose-invert max-w-none">
        <section class="mb-10">
          <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            1. Acceptance of Terms
          </h2>
          <p class="text-gray-600 dark:text-gray-300 mb-4">
            By accessing or using NVYT ("the Platform"), you agree to be bound by these Terms of Service.
            If you do not agree to these terms, please do not use the Platform.
          </p>
          <p class="text-gray-600 dark:text-gray-300 mb-4">
            NVYT is owned and operated by <strong>NVYT EVENTS ORGANIZING SERVICES</strong>, based in the Philippines.
          </p>
          <p class="text-gray-600 dark:text-gray-300">
            NVYT is an event management and ticketing platform that enables organizers to create events,
            sell tickets, and manage attendees. Attendees can discover events, purchase tickets, and
            register for events through the Platform.
          </p>
        </section>

        <section class="mb-10">
          <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            2. User Accounts
          </h2>
          <p class="text-gray-600 dark:text-gray-300 mb-4">
            To access certain features of the Platform, you must create an account. You are responsible for:
          </p>
          <ul class="list-disc pl-6 text-gray-600 dark:text-gray-300 space-y-2">
            <li>Providing accurate and complete information during registration</li>
            <li>Maintaining the security and confidentiality of your account credentials</li>
            <li>All activities that occur under your account</li>
            <li>Notifying us immediately of any unauthorized use of your account</li>
          </ul>
        </section>

        <section class="mb-10">
          <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            3. Event Organizers
          </h2>
          <p class="text-gray-600 dark:text-gray-300 mb-4">
            If you use the Platform to create and manage events ("Organizer"), you agree to:
          </p>
          <ul class="list-disc pl-6 text-gray-600 dark:text-gray-300 space-y-2">
            <li>Provide accurate information about your events, including date, time, location, and pricing</li>
            <li>Honor all ticket purchases and registrations made through the Platform</li>
            <li>Establish and communicate clear refund policies for your events</li>
            <li>Comply with all applicable laws and regulations related to your events</li>
            <li>Handle attendee data responsibly and in accordance with privacy laws</li>
            <li>Notify attendees promptly if an event is cancelled or significantly changed</li>
          </ul>
          <p class="text-gray-600 dark:text-gray-300 mt-4">
            <strong>Document Requirements for Paid Events:</strong> Organizers who sell tickets through the Platform 
            are required to submit legal documents for verification before the event can be published. This may include 
            government-issued identification, business registration documents, and other documentation as required 
            by our payment partners and applicable regulations.
          </p>
        </section>

        <section class="mb-10">
          <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            4. Ticket Purchases and Payments
          </h2>
          <p class="text-gray-600 dark:text-gray-300 mb-4">
            When purchasing tickets through the Platform:
          </p>
          <ul class="list-disc pl-6 text-gray-600 dark:text-gray-300 space-y-2">
            <li>All payments are processed securely through our payment partner, PayMongo</li>
            <li>Supported payment methods include GCash, Maya, credit/debit cards, GrabPay, and QR Ph</li>
            <li>Ticket prices are set by event organizers and may include service fees</li>
            <li>Upon successful payment, you will receive a confirmation email with your ticket(s)</li>
            <li>Tickets are non-transferable unless otherwise specified by the organizer</li>
          </ul>
        </section>

        <section class="mb-10">
          <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            5. Refunds and Cancellations
          </h2>
          <p class="text-gray-600 dark:text-gray-300 mb-4">
            Refund policies are set by individual event organizers. Please review the refund policy 
            for each event before purchasing tickets. For more details, see our 
            <NuxtLink to="/refunds" class="text-primary hover:underline">Refund Policy</NuxtLink>.
          </p>
          <p class="text-gray-600 dark:text-gray-300">
            If an event is cancelled by the organizer, the organizer is responsible for communicating 
            with attendees and processing refunds according to their stated policy.
          </p>
        </section>

        <section class="mb-10">
          <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            6. Platform Fees
          </h2>
          <p class="text-gray-600 dark:text-gray-300 mb-4">
            NVYT charges service fees for ticket sales processed through the Platform. These fees cover:
          </p>
          <ul class="list-disc pl-6 text-gray-600 dark:text-gray-300 space-y-2">
            <li>Payment processing fees (varies by payment method)</li>
            <li>Platform service fees</li>
          </ul>
          <p class="text-gray-600 dark:text-gray-300 mt-4">
            Fee breakdowns are displayed during checkout before payment is confirmed.
          </p>
        </section>

        <section class="mb-10">
          <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            7. Prohibited Conduct
          </h2>
          <p class="text-gray-600 dark:text-gray-300 mb-4">
            You agree not to:
          </p>
          <ul class="list-disc pl-6 text-gray-600 dark:text-gray-300 space-y-2">
            <li>Use the Platform for any unlawful purpose</li>
            <li>Create fraudulent events or listings</li>
            <li>Resell tickets at inflated prices (scalping)</li>
            <li>Attempt to circumvent security measures or access unauthorized areas</li>
            <li>Harass, abuse, or harm other users</li>
            <li>Upload malicious code or interfere with the Platform's operation</li>
            <li>Scrape or collect user data without authorization</li>
          </ul>
        </section>

        <section class="mb-10">
          <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            8. Intellectual Property
          </h2>
          <p class="text-gray-600 dark:text-gray-300">
            The Platform and its original content, features, and functionality are owned by NVYT and 
            are protected by copyright, trademark, and other intellectual property laws. Event content, 
            including descriptions and images, remain the property of respective organizers.
          </p>
        </section>

        <section class="mb-10">
          <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            9. Limitation of Liability
          </h2>
          <p class="text-gray-600 dark:text-gray-300 mb-4">
            NVYT acts as a platform connecting event organizers with attendees. We are not responsible for:
          </p>
          <ul class="list-disc pl-6 text-gray-600 dark:text-gray-300 space-y-2">
            <li>The quality, safety, or legality of events listed on the Platform</li>
            <li>The accuracy of event information provided by organizers</li>
            <li>The actions or omissions of event organizers or attendees</li>
            <li>Event cancellations or changes made by organizers</li>
          </ul>
          <p class="text-gray-600 dark:text-gray-300 mt-4">
            To the maximum extent permitted by law, NVYT shall not be liable for any indirect, 
            incidental, special, or consequential damages arising from your use of the Platform.
          </p>
        </section>

        <section class="mb-10">
          <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            10. Dispute Resolution
          </h2>
          <p class="text-gray-600 dark:text-gray-300">
            Disputes between attendees and organizers should be resolved directly between the parties. 
            NVYT may, at its discretion, assist in facilitating communication but is not obligated to 
            mediate or resolve disputes. For disputes with NVYT, we encourage you to contact us first 
            to seek an amicable resolution.
          </p>
        </section>

        <section class="mb-10">
          <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            11. Changes to Terms
          </h2>
          <p class="text-gray-600 dark:text-gray-300">
            We may update these Terms of Service from time to time. We will notify users of significant 
            changes by posting a notice on the Platform or sending an email. Continued use of the Platform 
            after changes constitute acceptance of the updated terms.
          </p>
        </section>

        <section class="mb-10">
          <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            12. Contact Us
          </h2>
          <p class="text-gray-600 dark:text-gray-300">
            If you have any questions about these Terms of Service, please contact us at 
            <a href="mailto:support@nvyt.app" class="text-primary hover:underline">support@nvyt.app</a>.
          </p>
        </section>
      </div>
    </div>
  </div>
</template>

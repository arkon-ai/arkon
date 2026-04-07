# Terms of Service

**Arkon — AI Governance Platform**
**Effective Date:** April 1, 2026
**Last Updated:** April 1, 2026

These Terms of Service ("Terms") govern your use of the Arkon hosted service operated by Transformate AI (Pty) Ltd ("we," "us," "our," "Transformate AI"), a company registered in South Africa.

By creating an account or using the Arkon hosted service, you agree to these Terms. If you do not agree, do not use the service.

---

## 1. Two Ways to Use Arkon

### 1.1 Self-Hosted (MIT License)

The Arkon source code is available under the MIT License at https://github.com/arkon-ai/arkon. When you self-host Arkon:

- You may use, copy, modify, merge, publish, distribute, sublicense, and sell copies of the software under the terms of the MIT License
- These Terms of Service do **not** apply to your self-hosted instance
- We provide no warranty, support, or SLA for self-hosted installations
- You are solely responsible for your own data, security, backups, and compliance
- Community support is available via GitHub Issues and Discussions

### 1.2 Hosted Service (arkonhq.com)

When you use the Arkon hosted service at arkonhq.com, these Terms apply in full. The hosted service includes managed infrastructure, automatic updates, email support (Operator tier and above), and guaranteed availability.

**The remainder of these Terms applies only to the hosted service.**

---

## 2. Accounts

### 2.1 Account Creation

To use the hosted service, you must create an account with a valid email address and password. You must:

- Provide accurate and complete information
- Be at least 18 years old
- Be authorized to accept these Terms on behalf of your organization (if applicable)

### 2.2 Account Security

You are responsible for maintaining the security of your account credentials, including:

- Your account password
- Agent API tokens generated through the platform
- Any API keys associated with your account

You must notify us immediately at [YOUR_SUPPORT_EMAIL] if you believe your account has been compromised. We are not liable for losses resulting from unauthorized use of your account.

### 2.3 One Account Per Organization

Each organization should have one Arkon account. Multiple users within an organization share the same account. There is no per-seat pricing — all paid plans include unlimited users.

---

## 3. Subscription and Payment

### 3.1 Plans

| Plan | Price | Billing |
|------|-------|---------|
| Community (self-hosted) | Free | N/A |
| Operator | $97/month (USD) | Monthly, via Stripe |
| Operator (Founding Member) | $47/month (USD), locked forever | Monthly, via Stripe |
| Agency | $297/month (USD) | Monthly, via Stripe |

Prices are in US Dollars. All plans are billed monthly. There are no annual contracts or long-term commitments.

### 3.2 Founding Member Pricing

The first 20 Operator customers receive a founding member rate of $47/month. This rate is locked in for the lifetime of the subscription — it will never increase as long as the subscription remains active. If a founding member cancels and later re-subscribes, the founding rate is forfeited and standard pricing applies.

### 3.3 Payment Processing

All payments are processed by Stripe. By subscribing, you agree to Stripe's terms of service (https://stripe.com/legal). We do not store your full payment card details — Stripe handles all payment data securely.

### 3.4 Failed Payments

If a payment fails, we will:

1. Notify you by email
2. Retry the payment after 3 days
3. Retry again after 7 days
4. If payment remains unsuccessful after 14 days, your account will be downgraded to read-only access (no new data ingestion). Your data will be retained for 30 days.
5. After 30 days of failed payment, your account and data may be permanently deleted.

### 3.5 Cancellation

You may cancel your subscription at any time from your account settings or by contacting us at [YOUR_SUPPORT_EMAIL]. Upon cancellation:

- Your subscription remains active until the end of the current billing period
- No partial refunds are given for unused days within a billing period
- After the billing period ends, your account is downgraded to read-only access
- Your data is retained for 30 days after downgrade, then permanently deleted
- You may export your data at any time before deletion using the Compliance Export feature

### 3.6 Refunds

We offer a full refund within 14 days of your first payment if you are not satisfied with the service. After 14 days, no refunds are provided. To request a refund, contact [YOUR_SUPPORT_EMAIL].

### 3.7 Price Changes

We may change subscription prices with 30 days' written notice via email. Price changes do not apply to founding members (whose rate is locked forever). If you do not agree to a price change, you may cancel before the new price takes effect.

---

## 4. Your Data

### 4.1 Ownership

You own your data. We do not claim any ownership rights over the data you submit to Arkon, including agent event data, infrastructure metrics, configuration data, and any content processed through the platform.

### 4.2 License to Operate

By using the hosted service, you grant us a limited, non-exclusive license to store, process, and display your data solely for the purpose of providing the Arkon service to you. This license terminates when you delete your data or close your account.

### 4.3 Data Processing

We process your data only to provide the Arkon service. Specifically, we:

- Store and index agent events for display and search
- Scan event content for threats (ThreatGuard)
- Calculate costs based on token usage and model pricing
- Generate baselines and anomaly alerts
- Execute workflows you configure
- Generate audit log entries

We do **not** use your data to train AI models, sell to third parties, or for any purpose beyond providing the service.

### 4.4 Data Export

You can export your data at any time using the Compliance Export feature. Exports are available in JSON and CSV formats and include events, costs, agents, and audit logs. You may filter exports by date range.

### 4.5 Data Deletion

You can delete your data at any time:

- **Individual events:** Purge or redact via the ThreatGuard interface
- **Bulk data:** Use the GDPR Purge tool (by agent, tenant, or date range)
- **Full account:** Contact [YOUR_SUPPORT_EMAIL] for complete account and data deletion

See our Privacy Policy for full details on data retention periods.

---

## 5. Acceptable Use

You agree to use Arkon in accordance with our Acceptable Use Policy (see below) and all applicable laws. You are responsible for all activity that occurs under your account and for all data submitted to the service.

---

## 6. Service Availability

### 6.1 Uptime

We aim for 99.5% monthly uptime for the hosted service. This is a target, not a guarantee. We do not currently offer a formal Service Level Agreement (SLA). Enterprise SLAs may be offered in the future.

### 6.2 Maintenance

We may perform scheduled maintenance that temporarily interrupts service. We will provide at least 24 hours' notice for planned maintenance via email or in-app notification. Emergency maintenance to address security issues or critical bugs may occur without advance notice.

### 6.3 Service Modifications

We may modify, update, or discontinue features of the service at any time. For material changes that reduce functionality, we will provide 30 days' notice. The open-source codebase (MIT license) ensures that the software remains available to you regardless of changes to the hosted service.

---

## 7. Intellectual Property

### 7.1 Arkon Software

The Arkon software is open source under the MIT License. You may use, modify, and distribute the code under those terms.

### 7.2 Service and Brand

The Arkon name, logo (Sharp Chrome Blade mark), and brand identity are trademarks of Transformate AI (Pty) Ltd. The hosted service infrastructure, proprietary configurations, and managed operations are the property of Transformate AI.

### 7.3 Feedback

If you provide feedback, suggestions, or feature requests, you grant us a non-exclusive, royalty-free, perpetual license to use that feedback to improve Arkon. You are not required to provide feedback.

---

## 8. Limitation of Liability

### 8.1 Disclaimer of Warranties

The Arkon hosted service is provided "as is" and "as available" without warranties of any kind, whether express, implied, or statutory. We specifically disclaim warranties of:

- Merchantability
- Fitness for a particular purpose
- Non-infringement
- Uninterrupted or error-free service

### 8.2 Limitation

To the maximum extent permitted by law, Transformate AI's total liability to you for any claims arising from or related to the service is limited to the amount you paid us in the 12 months preceding the claim.

We are not liable for:

- Indirect, incidental, special, consequential, or punitive damages
- Loss of profits, revenue, data, or business opportunities
- Actions taken by your AI agents (Arkon monitors and governs — it does not control your agents' underlying behavior)
- Security breaches resulting from your misconfiguration of agents, credentials, or infrastructure
- Failures of third-party services (Stripe, your cloud provider, your agent frameworks)

### 8.3 AI Agent Disclaimer

Arkon provides tools to monitor, detect threats in, and manage AI agents. However:

- Arkon does not guarantee that all threats will be detected (ThreatGuard uses pattern matching and may not catch novel attack vectors)
- Arkon does not guarantee that kill commands will be received or executed by your agents (this depends on your agent framework's cooperation)
- Arkon does not guarantee that budget limits will prevent all overspending (there may be a delay between token usage and cost calculation)
- You remain solely responsible for the behavior of your AI agents and the consequences of their actions

---

## 9. Indemnification

You agree to indemnify and hold harmless Transformate AI, its officers, directors, and employees from any claims, damages, or expenses (including reasonable legal fees) arising from:

- Your use of the service
- Your violation of these Terms
- Your AI agents' actions or outputs
- Your violation of any third-party rights
- Data you submit to the service that violates applicable law

---

## 10. Termination

### 10.1 By You

You may close your account at any time by contacting [YOUR_SUPPORT_EMAIL] or through account settings. See Section 3.5 (Cancellation) for details on data retention.

### 10.2 By Us

We may suspend or terminate your account if you:

- Violate these Terms or the Acceptable Use Policy
- Fail to pay for 30+ days
- Use the service in a way that threatens the security, integrity, or availability of the service for other users
- Are required to be removed by law or regulation

We will provide reasonable notice before termination unless immediate action is required for security or legal reasons. Upon termination, we will retain your data for 30 days to allow export, then permanently delete it.

---

## 11. Governing Law and Disputes

### 11.1 Governing Law

These Terms are governed by the laws of the Republic of South Africa, without regard to conflict of law principles.

### 11.2 Dispute Resolution

Any disputes arising from these Terms or the service will be resolved through:

1. **Good-faith negotiation** — contact us at [YOUR_SUPPORT_EMAIL] to discuss
2. **Mediation** — if negotiation fails, through a mutually agreed mediator in South Africa
3. **Arbitration** — if mediation fails, through binding arbitration in South Africa under the Arbitration Act, 42 of 1965

You agree to attempt resolution through steps 1 and 2 before initiating arbitration.

### 11.3 Class Action Waiver

To the extent permitted by law, you agree that any disputes will be resolved on an individual basis and not as part of a class, consolidated, or representative action.

---

## 12. General

### 12.1 Entire Agreement

These Terms, together with the Privacy Policy and Acceptable Use Policy, constitute the entire agreement between you and Transformate AI regarding the hosted service.

### 12.2 Severability

If any provision of these Terms is found to be unenforceable, the remaining provisions remain in full effect.

### 12.3 No Waiver

Our failure to enforce any provision of these Terms does not constitute a waiver of that provision.

### 12.4 Assignment

You may not assign your rights or obligations under these Terms without our written consent. We may assign our rights and obligations in connection with a merger, acquisition, or sale of assets, with notice to you.

### 12.5 Force Majeure

We are not liable for delays or failures in performance resulting from events beyond our reasonable control, including natural disasters, war, pandemics, utility failures, or government actions.

---

## 13. Changes to These Terms

We may update these Terms from time to time. When we do:

- We will update the "Last Updated" date at the top
- For material changes, we will notify you via email at least 30 days before the changes take effect
- Continued use of the service after changes take effect constitutes acceptance
- If you do not agree to the changes, you may cancel your subscription before they take effect

---

## 14. Contact Us

**Transformate AI (Pty) Ltd**
Email: [YOUR_SUPPORT_EMAIL]
Address: [YOUR_COMPANY_ADDRESS]
Website: https://arkonhq.com

---

*These Terms apply to the Arkon hosted service at arkonhq.com. Self-hosted Arkon instances are governed by the MIT License only.*

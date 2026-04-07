# Privacy Policy

**Arkon — AI Governance Platform**
**Effective Date:** April 1, 2026
**Last Updated:** April 1, 2026

Arkon is operated by Transformate AI (Pty) Ltd ("we," "us," "our"), a company registered in South Africa. This Privacy Policy explains how we collect, use, store, and protect your information when you use the Arkon platform — whether self-hosted or via our hosted service at arkonhq.com.

We respect your privacy and are committed to compliance with the Protection of Personal Information Act (POPIA) of South Africa, the General Data Protection Regulation (GDPR) of the European Union, and applicable US state privacy laws.

---

## 1. What Arkon Is

Arkon is an AI Governance Platform that monitors, governs, and automates AI agent operations. It processes AI agent event logs, cost data, infrastructure metrics, and related operational data.

**Two deployment models exist:**

- **Self-Hosted (MIT License):** You run Arkon on your own infrastructure. Your data never touches our servers. This Privacy Policy does not apply to self-hosted instances — you are the data controller and responsible for your own data handling.
- **Hosted Service (arkonhq.com):** We host and operate Arkon for you. This Privacy Policy applies in full to the hosted service.

---

## 2. Information We Collect

### 2.1 Account Information

When you create an account on the hosted service, we collect:

- Email address
- Password (stored as a bcrypt hash — we never store or see your plaintext password)
- Organization name
- Name (if provided)

**Legal basis (GDPR):** Performance of contract (Article 6(1)(b)).
**POPIA justification:** Necessary for the performance of a contract (Section 11(1)(b)).

### 2.2 Agent Event Data

When your AI agents send events to Arkon via the ingest API, we receive and store:

- Event type (message sent, message received, tool call, error)
- Event content (the text of messages your agents send and receive)
- Model and provider information (which AI model was used)
- Token counts and cost estimates
- Timestamps and session identifiers
- Agent identifiers

**Important:** Agent event data may contain personal information if your AI agents process user messages. You are responsible for ensuring you have the legal basis to transmit this data to Arkon. We process this data solely to provide the Arkon service to you.

**Legal basis (GDPR):** Performance of contract (Article 6(1)(b)). Where event data contains third-party personal data, we process it as a data processor on your behalf.
**POPIA justification:** Necessary for the performance of a contract (Section 11(1)(b)).

### 2.3 Infrastructure Metrics

If you connect infrastructure monitoring, we collect server health data:

- CPU, memory, disk usage percentages
- Docker container status
- GPU metrics (if applicable)
- Network latency measurements
- Server IP addresses and hostnames

This data is operational and typically does not contain personal information.

### 2.4 Payment Information

We use Stripe to process payments. We do not store your credit card number, CVC, or full card details on our servers. Stripe handles all payment data in accordance with PCI-DSS standards. We receive and store:

- Stripe customer ID
- Subscription status and plan
- Last four digits of your payment card (for display purposes only)
- Billing email address

For Stripe's privacy practices, see: https://stripe.com/privacy

### 2.5 Usage and Analytics Data

We use Plausible Analytics (self-hosted) on arkonhq.com. Plausible is privacy-focused and:

- Does not use cookies
- Does not collect personal information
- Does not track users across sites
- Complies with GDPR, CCPA, and PECR without requiring cookie consent

We collect aggregate, anonymous usage statistics only: page views, referral sources, country (derived from IP, not stored), browser type, and device type.

### 2.6 Information We Do NOT Collect

- We do not use tracking cookies or advertising cookies
- We do not sell or share your data with advertisers
- We do not use your agent event data to train AI models
- We do not collect biometric data
- We do not collect financial account numbers (Stripe handles payment data)

---

## 3. How We Use Your Information

We use your information for the following purposes only:

| Purpose | Data Used | Legal Basis (GDPR) |
|---------|-----------|-------------------|
| Provide the Arkon service | Account info, agent events, infrastructure metrics | Contract performance |
| Process payments | Stripe payment data | Contract performance |
| Detect threats in agent activity (ThreatGuard) | Agent event content | Contract performance |
| Calculate costs and enforce budget limits | Token counts, model pricing | Contract performance |
| Send service notifications (alerts, threats, budget warnings) | Account email, notification preferences | Contract performance |
| Respond to support requests | Account info, communication content | Legitimate interest |
| Improve the service | Aggregate, anonymized usage statistics | Legitimate interest |
| Comply with legal obligations | Account and billing data as required | Legal obligation |

We will never use your agent event data for any purpose other than providing the Arkon service to you, unless you explicitly request otherwise (such as opting in to anonymized benchmarking).

---

## 4. Data Storage and Security

### 4.1 Where Your Data Is Stored

Hosted service data is stored on servers located in the European Union (Hetzner, Germany). Data does not leave the EU unless you explicitly configure integrations that transmit data elsewhere (such as notification webhooks to non-EU services).

### 4.2 How We Protect Your Data

- All data in transit is encrypted via TLS 1.2+
- Passwords are hashed using bcrypt
- Agent API tokens are stored as hashed values (we cannot retrieve your original token)
- Database access is restricted to application-level connections only
- Infrastructure is secured with firewall rules and SSH key authentication
- We conduct regular security reviews of the codebase (513 end-to-end tests)

### 4.3 Data Retention

| Data Type | Retention Period | Notes |
|-----------|-----------------|-------|
| Account information | Duration of account + 30 days after deletion | Deleted upon account closure request |
| Agent event data | 90 days by default | Configurable per tenant. You can purge data at any time via the GDPR purge tool. |
| Infrastructure metrics | 90 days (TimescaleDB retention policy) | Automatically expired |
| Audit log entries | 1 year | Required for governance and compliance purposes |
| Payment records | As required by South African tax law (5 years) | Stripe retains per their own policy |
| Analytics data (Plausible) | Indefinite (aggregate only) | No personal data is stored |

### 4.4 Data Deletion

You can delete your data at any time:

- **Event data:** Use the in-app GDPR Purge tool to delete events by agent, tenant, or date range. Supports dry-run mode to preview what will be deleted.
- **Account data:** Contact us at [YOUR_DPO_EMAIL] to request full account deletion.
- **Audit log entries:** Retained for 1 year for compliance purposes, then automatically purged.

---

## 5. Data Sharing and Third Parties

We share your data with the following third parties only:

| Third Party | Data Shared | Purpose | Privacy Policy |
|-------------|-------------|---------|----------------|
| Stripe | Payment information | Payment processing | https://stripe.com/privacy |
| Hetzner | All hosted data (as infrastructure provider) | Server hosting | https://www.hetzner.com/legal/privacy-policy |

We do not sell, rent, or trade your personal information to any third party for marketing or advertising purposes. We do not share your agent event data with any third party unless required by law.

**We may disclose information if required to:**
- Comply with a legal obligation, court order, or regulatory request
- Protect the rights, property, or safety of Transformate AI, our users, or the public
- Enforce our Terms of Service

---

## 6. Your Rights

### 6.1 Under POPIA (South Africa)

As a data subject under POPIA, you have the right to:

- **Access:** Request a copy of the personal information we hold about you
- **Correction:** Request correction of inaccurate personal information
- **Deletion:** Request deletion of your personal information (subject to legal retention requirements)
- **Object:** Object to the processing of your personal information
- **Withdraw consent:** Where processing is based on consent, withdraw that consent at any time
- **Complain:** Lodge a complaint with the Information Regulator of South Africa

### 6.2 Under GDPR (European Union)

If you are in the European Economic Area, you have the right to:

- **Access:** Obtain a copy of your personal data (Article 15)
- **Rectification:** Correct inaccurate personal data (Article 16)
- **Erasure:** Request deletion of your personal data ("right to be forgotten") (Article 17)
- **Restriction:** Restrict the processing of your personal data (Article 18)
- **Data portability:** Receive your data in a structured, machine-readable format (Article 20)
- **Object:** Object to processing based on legitimate interests (Article 21)
- **Withdraw consent:** Withdraw consent at any time where processing is based on consent
- **Complain:** Lodge a complaint with your local data protection authority

### 6.3 Under US State Privacy Laws (CCPA/CPRA and others)

If you are a resident of California or another US state with privacy legislation, you have the right to:

- Know what personal information we collect and how we use it
- Request deletion of your personal information
- Opt out of the sale of personal information (we do not sell personal information)
- Non-discrimination for exercising your privacy rights

### 6.4 How to Exercise Your Rights

To exercise any of these rights, contact us at:

**Data Protection Contact:**
Email: [YOUR_DPO_EMAIL]
Address: [YOUR_COMPANY_ADDRESS]

We will respond to all requests within 30 days (or sooner where required by law). We may request verification of your identity before processing requests.

---

## 7. Cookies

**We do not use cookies on arkonhq.com.** Our analytics tool (Plausible) is cookie-free. No cookie consent banner is required.

The Arkon application (hosted service) uses a single essential cookie for session authentication (`arkon_session`). This is a strictly necessary cookie and does not require consent under GDPR/PECR. It contains only a session identifier and expires when you log out or after 30 days of inactivity.

---

## 8. Children's Privacy

Arkon is not intended for use by individuals under the age of 18. We do not knowingly collect personal information from children. If you believe we have inadvertently collected such information, please contact us at [YOUR_DPO_EMAIL] and we will promptly delete it.

---

## 9. International Data Transfers

Data for the hosted service is stored in the European Union (Germany). If you access the service from outside the EU, your data will be transferred to and processed in the EU. The EU provides an adequate level of data protection as recognized by many jurisdictions.

We do not transfer your data outside the EU unless you configure integrations (such as notification webhooks) that send data to services in other jurisdictions. You are responsible for ensuring such integrations comply with applicable data protection laws.

---

## 10. Changes to This Policy

We may update this Privacy Policy from time to time. When we do:

- We will update the "Last Updated" date at the top
- For material changes, we will notify you via email or an in-app notification
- Continued use of the service after changes constitutes acceptance

---

## 11. Contact Us

**Transformate AI (Pty) Ltd**
Email: [YOUR_DPO_EMAIL]
Address: [YOUR_COMPANY_ADDRESS]
Website: https://arkonhq.com

For complaints regarding the handling of your personal information:

**South Africa:** Information Regulator — https://inforegulator.org.za
**European Union:** Contact your local data protection authority — https://edpb.europa.eu/about-edpb/about-edpb/members_en

---

*This Privacy Policy applies to the Arkon hosted service at arkonhq.com. Self-hosted Arkon instances (MIT license) are operated by you — you are the data controller and responsible for your own privacy practices.*

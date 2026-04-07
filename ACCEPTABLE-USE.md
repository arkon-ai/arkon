# Acceptable Use Policy

**Arkon — AI Governance Platform**
**Effective Date:** April 1, 2026
**Last Updated:** April 1, 2026

This Acceptable Use Policy ("AUP") governs your use of the Arkon hosted service operated by Transformate AI (Pty) Ltd. This policy is part of our Terms of Service. Violations may result in suspension or termination of your account.

---

## 1. General Principles

Arkon is designed to help you monitor, govern, and automate your AI agents responsibly. You agree to use the service in a way that is lawful, ethical, and respectful of other users and the broader community.

---

## 2. You May Use Arkon To

- Monitor AI agent activity, costs, and performance
- Detect and respond to threats in agent communications
- Track spending across AI model providers
- Build workflows to automate operational responses
- Manage AI agents for yourself, your team, or your clients
- Store and analyze agent event data for governance and compliance purposes
- Export data for reporting, auditing, or regulatory compliance
- Monitor infrastructure health for servers running AI agents

---

## 3. You May NOT Use Arkon To

### 3.1 Illegal Activity

- Violate any applicable law, regulation, or legal obligation in any jurisdiction
- Process data that you do not have the legal right to collect or transmit
- Facilitate money laundering, fraud, or financial crimes
- Evade sanctions, export controls, or trade restrictions

### 3.2 Harmful or Abusive Conduct

- Monitor, surveil, or track individuals without their knowledge and informed consent
- Process data from AI agents that are designed to harass, threaten, stalk, or harm individuals
- Store or transmit content that exploits or harms minors in any way
- Distribute malware, viruses, or malicious code through the platform
- Use Arkon's ingest API to flood the system with spam, fake events, or denial-of-service attacks

### 3.3 Security Violations

- Attempt to gain unauthorized access to other users' data, accounts, or tenants
- Probe, scan, or test the vulnerability of the hosted service without written permission
- Circumvent, disable, or interfere with security features of the platform
- Share agent API tokens or account credentials with unauthorized parties
- Use the platform to store credentials, passwords, or secrets as a primary secret store (Arkon may detect and flag these — it is not designed to be a vault)

### 3.4 System Abuse

- Exceed reasonable usage limits in a way that degrades service for other users
- Use automated scripts to create accounts, generate fake events, or manipulate metrics
- Reverse-engineer proprietary components of the hosted service infrastructure (the open-source codebase under MIT license is freely available for inspection)
- Resell access to your Arkon hosted account to third parties (multi-tenant features are designed for managing your own clients, not sub-licensing the service itself)

### 3.5 Content Restrictions

- Store or transmit content that is unlawful, defamatory, or infringes on intellectual property rights
- Use the platform to host, distribute, or link to pirated content, illegal materials, or regulated substances
- Submit data containing protected health information (PHI) regulated under HIPAA unless you have a signed Business Associate Agreement with us (not currently available)

---

## 4. Your Responsibility for AI Agent Behavior

You are solely responsible for the behavior and output of your AI agents. Arkon provides governance tools — it does not control your agents. Specifically:

- You are responsible for ensuring your agents comply with applicable laws and regulations
- You are responsible for the data your agents collect, process, and transmit
- You are responsible for obtaining any required consents from individuals whose data your agents process
- If ThreatGuard detects a credential leak in your agent's output, you are responsible for responding (purging the message, rotating the credential, notifying affected parties)
- Arkon's detection capabilities are not exhaustive — you should not rely solely on ThreatGuard as your complete security solution

---

## 5. Multi-Tenant Use (Agency Tier)

If you use Arkon's multi-tenant features to manage AI agents on behalf of clients:

- You are responsible for ensuring your clients' data is handled in accordance with applicable privacy laws
- You must have appropriate agreements (such as data processing agreements) with your clients
- You must not access client data beyond what is necessary to provide your services
- Each tenant's data is logically isolated within Arkon — you must not circumvent this isolation
- You are responsible for communicating relevant security incidents (such as detected credential leaks) to affected clients in a timely manner

---

## 6. Reporting Violations

If you become aware of a violation of this policy — by another user or within your own organization — please report it to [YOUR_SUPPORT_EMAIL]. We take all reports seriously and will investigate promptly.

---

## 7. Enforcement

We enforce this policy at our discretion. Depending on the severity of the violation, we may:

1. **Warn** — notify you of the violation and request correction
2. **Restrict** — temporarily limit specific features or API access
3. **Suspend** — temporarily disable your account pending investigation
4. **Terminate** — permanently close your account and delete your data (with 30 days for export where possible)

For serious violations (illegal activity, security breaches, harm to other users), we may take immediate action without prior warning.

---

## 8. Changes to This Policy

We may update this Acceptable Use Policy from time to time. Material changes will be communicated via email at least 14 days before taking effect. Continued use of the service after changes constitutes acceptance.

---

## 9. Contact

Questions about this policy? Contact us at [YOUR_SUPPORT_EMAIL].

---

*This Acceptable Use Policy applies to the Arkon hosted service at arkonhq.com. Self-hosted Arkon instances (MIT license) are governed by your own policies.*

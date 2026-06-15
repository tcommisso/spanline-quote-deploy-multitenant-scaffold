# Notification Settings Catalogue

All settings are stored in **Administration > General > Notification** (master_data table, category = `notification`).

Each row has a **Setting** (key) and a **Value**. Set value to `True` to enable, `False` to disable, or a specific value for configuration settings.

---

## Quote & Sales Notifications

| Setting | Default Value | Description |
|---------|--------------|-------------|
| notify_quote_created | True | Notify admin when a new quote is created |
| notify_quote_accepted | True | Notify admin when a quote status changes to Accepted |
| notify_quote_lost | True | Notify admin when a quote status changes to Lost |
| notify_quote_value_exceeded | True | Notify admin when quote value exceeds threshold ($20k) |
| notify_proposal_sent | True | Notify admin when a proposal is emailed to client |

---

## Construction Notifications

| Setting | Default Value | Description |
|---------|--------------|-------------|
| notify_job_stage_change | True | Notify admin when a construction job stage changes |
| notify_job_status_change | True | Notify admin when a construction job status changes |
| notify_schedule_event_created | True | Notify admin when a new schedule event is created |
| notify_npc_sent | True | Notify admin when NPC is sent for signature |
| notify_variation_signed | True | Notify admin when a variation is signed (existing) |
| notify_variation_created | True | Notify admin when a variation is created |
| notify_defect_reported | True | Notify admin when a defect is reported on NPC |

---

## Document & Signature Notifications

| Setting | Default Value | Description |
|---------|--------------|-------------|
| notify_document_signed | True | Notify admin when a document is signed via SignWell |
| notify_plan_submitted | True | Notify admin when a plan is submitted for approval |
| notify_plan_decision | True | Notify admin when a client approves/rejects a plan |
| signature_reminder_days | 3 | Days before sending signature reminder (numeric) |

---

## Client & Portal Notifications

| Setting | Default Value | Description |
|---------|--------------|-------------|
| notify_client_portal_activity | True | Notify admin when client posts activity on portal |
| notify_photo_comment | True | Notify admin when a comment is posted on a photo |
| notify_client_message | True | Notify admin when a client sends a message via portal |

---

## Trade & Installer Notifications

| Setting | Default Value | Description |
|---------|--------------|-------------|
| notify_trade_invoice_submitted | True | Notify admin when a trade submits an invoice |
| notify_trade_invoice_approved | True | Notify trade when their invoice is approved |
| notify_trade_invoice_rejected | True | Notify trade when their invoice is rejected |
| notify_trade_assignment | True | Notify trade when assigned to a job |
| notify_trade_remittance | True | Notify trade when remittance is created |

---

## CRM & Lead Notifications

| Setting | Default Value | Description |
|---------|--------------|-------------|
| notify_lead_created | True | Notify admin when a new CRM lead is created |
| notify_lead_converted | True | Notify admin when a lead is converted to a job |
| notify_check_measure_booked | True | Notify admin when a check measure is booked |

---

## Inbox & Email Notifications

| Setting | Default Value | Description |
|---------|--------------|-------------|
| notify_inbound_email | True | Notify admin when a new inbound email arrives |
| notify_email_assigned | True | Notify user when an inbox email is assigned to them |
| notify_email_urgent | True | Notify admin on urgent/high-priority inbound emails |

---

## Procurement & Inventory Notifications

| Setting | Default Value | Description |
|---------|--------------|-------------|
| notify_low_stock_alert | True | Daily alert when stock items fall below reorder level |
| notify_po_invoice_variance | True | Notify admin when PO-to-invoice variance exceeds threshold |
| notify_invoice_approved | True | Notify admin when a supplier invoice is approved |
| notify_stocktake_variance | True | Notify admin when stocktake variance exceeds threshold |

---

## Manufacturing & Drivers

| Setting | Default Value | Description |
|---------|--------------|-------------|
| notify_driver_licence_expiry | True | Notify admin 30 days before driver licence expires |
| notify_manufacturing_po_received | True | Notify admin when goods are received against a PO |

---

## Payment & Financial Notifications

| Setting | Default Value | Description |
|---------|--------------|-------------|
| notify_payment_received | True | Notify admin when a Stripe payment is received |
| notify_xero_sync_error | True | Notify admin when Xero sync encounters an error |

---

## Channel Preferences

| Setting | Default Value | Accepted Values |
|---------|--------------|-----------------|
| channel_admin_alerts | email | email, sms, push, all |
| channel_client_updates | email | email, sms, push, all |
| channel_trade_updates | both | email, sms, both, all |

---

## Timing & Frequency

| Setting | Default Value | Description |
|---------|--------------|-------------|
| digest_frequency | instant | Notification delivery mode: instant, hourly_digest, daily_digest |
| quiet_hours_start | 20:00 | Do not send notifications after this time (HH:MM, AEST) |
| quiet_hours_end | 07:00 | Resume notifications after this time (HH:MM, AEST) |
| sms_daily_limit | 50 | Maximum SMS messages sent per day (numeric) |

---

## Value Reference

| Value Type | Examples | Notes |
|-----------|----------|-------|
| Boolean | True / False | Enables or disables the notification |
| Numeric | 3, 50, 20000 | Used for thresholds, limits, days |
| Time | 07:00, 20:00 | HH:MM format in AEST |
| Channel | email, sms, push, both, all | Delivery channel selection |
| Frequency | instant, hourly_digest, daily_digest | How often notifications are batched |

---

## How to Use

1. Navigate to **Administration > General > Notification**
2. Each row shows a **Setting** (key) and **Value**
3. Change Value to `False` to disable any notification
4. Change numeric values to adjust thresholds
5. Change channel values to control delivery method
6. Click **Save** to apply changes
7. Use **+ Add** to create custom notification rules

All settings take effect immediately. No server restart required.

# User Manual — Construction > Clients

**Application:** AltaSpan Costing & Quoting System  
**Module:** Construction > Clients  
**Audience:** Construction Planners, Construction Supervisors, Office Administrators  
**Last Updated:** June 2026

---

## 1. Overview

The **Construction > Clients** section is the central hub for managing all active and completed construction projects. Each "client" in this context represents a construction job that has been converted from a CRM lead (via the Sales pipeline) into a live project. The section provides a comprehensive view of project status, financial tracking, scheduling, communications, procurement, approvals, and project completion workflows.

> **Important:** A new construction client can only be created by converting a CRM lead to "Contract" status. There is no manual "Add Client" button — the system automatically creates the construction job record when a lead is converted.

---

## 2. Accessing the Section

Navigate to **Construction > Clients** from the sidebar menu. This opens the Construction Clients list page at `/construction/clients`.

---

## 3. Client List Page

### 3.1 Financial Year (FY) Filter

The page defaults to showing projects created in the **current Australian Financial Year** (1 July – 30 June). The FY selector in the top-right corner allows switching between available financial years or selecting "All Years" to view the complete history.

An additional **Month filter** allows narrowing results to a specific calendar month within the selected FY. Months are displayed in FY order (July through June).

### 3.2 Financial Summary Cards

Three summary cards appear at the top of the page:

| Card | Description |
|------|-------------|
| **Contract Value** | Total contract value of all projects in the filtered period |
| **Total Invoiced** | Sum of all invoices raised, shown as a percentage of contract value |
| **Total Paid** | Sum of all payments received, shown as a percentage of invoiced amount |

### 3.3 Status Summary Cards

Five clickable status cards show the count of projects in each status. Clicking a card filters the list to that status:

| Status | Meaning |
|--------|---------|
| **Scheduled** | Job is booked but work has not commenced |
| **In Progress** | Active construction underway |
| **On Hold** | Temporarily paused (awaiting approvals, materials, etc.) |
| **Completed** | All works finished and handed over |
| **Cancelled** | Job cancelled before or during construction |

By default, **completed jobs are excluded** from the list. To include them, open the Status filter dropdown and select "All Statuses".

### 3.4 Search and Filters

The search bar supports searching by **client name**, **site address**, or **quote number**. Additional collapsible filters include:

- **Status Filter** — Filter by specific job status or show all (including completed)
- **Payment Filter** — Filter by payment status: Paid, Partial, Invoiced, or Unpaid
- **Approval (BA) Filter** — Filter by building authority approval status: Approved, Pending, Lodged, Rejected, Exempt, Not Set, or Overdue (jobs pending longer than the configurable threshold, default 30 days)

### 3.5 Client Table

The table displays the following columns (some hidden on mobile):

| Column | Description |
|--------|-------------|
| **Client** | Client name with priority badge and quick-action phone/email icons |
| **Quote #** | Linked quote number |
| **Status** | Colour-coded status badge |
| **Scheduled** | Scheduled start date |
| **Site Address** | Project site address |
| **Value** | Contract value with payment status badge |
| **Installers** | Assigned trade names (up to 3 shown) |
| **BA** | Building Authority approval status indicator |
| **Progress** | Progress bar showing completion percentage |

Columns can be sorted by clicking the column header (Client, Status, Scheduled, Value, Progress).

### 3.6 Bulk Actions

Click the **Select** button to enter selection mode. You can then:

1. Select individual rows or use "Select All"
2. Choose a bulk action: **Set Approval Status**
3. Select the desired approval status (Approved, Pending, Lodged, Rejected, Exempt)
4. Click **Apply** to update all selected clients

### 3.7 Export to CSV

Click the **Export** button to download the current filtered view as a CSV file. The export includes client name, quote number, status, priority, scheduled start, site address, contract value, invoiced amount, paid amount, progress percentage, installers, phone, and email.

### 3.8 Pull to Refresh

On mobile devices, pull down on the page to refresh the data.

---

## 4. Client Detail Page

Click any row in the client list to open the **Client Detail** page. This page provides a comprehensive project management workspace organised into tabs.

### 4.1 Header

The header displays:
- Client name with status badge and priority indicator
- Quote number, site address, phone, and email (clickable)
- Back arrow to return to the client list

### 4.2 Progress Summary

A progress card shows overall project completion as a percentage. The progress source is indicated:
- **Xero payment data** — Progress calculated from paid invoices vs contract value
- **Manual stages** — Progress calculated from completed stages vs total stages

### 4.3 Tab Navigation

Tabs are accessed via a dropdown menu (mobile-friendly). The available tabs are:

| Tab | Purpose |
|-----|---------|
| **Overview** | Job details, assignments, weather forecast, linked records |
| **Check Measure** | On-site measurement workbook (duplicated from spec sheet) |
| **Site Plan** | Interactive site plan diagram with annotations |
| **Approvals Activity** | Building authority application tracking and status history |
| **Progress Invoices** | Xero-integrated progress claim invoicing |
| **Financials** | Budget tracking by category, margin analysis, Xero integration |
| **Tasks** | Quick view of all kanban tasks for this job |
| **Project Plan** | Full kanban board (To Do, In Progress, Review, Done) |
| **Schedule** | Job-specific calendar with drag-and-drop event management |
| **Activity** | Communication log and activity feed |
| **Contacts** | Client contacts, portal staff contacts, assigned trades |
| **Email & SMS** | Send communications to client or trades with templates |
| **Subcontracts** | Create and manage subcontractor agreements with milestones |
| **Inductions** | Site induction records for workers |
| **Variations** | Contract variation management with SignWell digital signatures |
| **Procurement** | Job-level purchase orders and component orders (Xero-integrated) |
| **Plans** | Construction plan document management with comments and audit trail |
| **Plan History** | Full audit log of plan uploads, revisions, and approvals |
| **Shared Files** | File sharing with trades (via Trade Portal) and clients (via Client Portal) |
| **Completion** | Notice of Practical Completion (NPC) generation and signature workflow |

---

## 5. Key Tab Details

### 5.1 Overview Tab

Displays two cards side by side:
- **Job Details** — Design Adviser, scheduled/actual start and end dates, notes
- **Assignments** — List of assigned installers with their roles and contact details

Below these, a **Linked Records** card shows the associated quote (clickable to navigate to the quote editor) and the linked CRM lead record.

For active jobs, a **7-Day Weather Forecast** card appears showing temperature and precipitation forecasts for the job's suburb.

### 5.2 Financials Tab

The Financials tab provides budget tracking across six categories:
- Authorities, Councils & Certifiers
- Builder's Fees
- DA Commissions
- Sub Contractors — Others
- Stock & Building Costs
- Other

Each category has editable budget and actual cost fields. A **Health Indicator** (traffic light) shows project financial health based on margin percentage:
- Green (Healthy): Margin ≥ 45%
- Amber (Watch): Margin 35–44%
- Red (At Risk): Margin < 35%

The **Xero Job Panel** provides direct integration with Xero accounting for invoice synchronisation.

### 5.3 Project Plan Tab

A full **Kanban board** with four columns: To Do, In Progress, Review, and Done. Tasks can be:
- Created with title, description, and assignee
- Dragged between columns to update status
- Edited or deleted
- Assigned to specific installers

### 5.4 Schedule Tab

A calendar view showing events for this specific job. Features include:
- Month navigation with day grid
- Drag-and-drop event rescheduling
- Create/edit events with title, date, time, installer assignment, and notes
- Delete events

### 5.5 Subcontracts Tab

Create and manage subcontractor agreements:
- Each subcontract has a subcontractor name, construction manager, estimated commencement, and total sum
- Payment milestones can be defined with progress tracking
- Subcontracts can be previewed as HTML or printed as PDF
- Status workflow: Draft → Sent → Signed → Cancelled

A milestone payment progress bar shows paid vs total milestones.

### 5.6 Variations Tab

Manage contract scope changes:
- Create variations with title, description, cost impact, and line items
- Send for digital signature via **SignWell**
- Track status: Draft → Sent → Signed
- Download signed PDF copies
- View signed variation library

### 5.7 Inductions Tab

Record site induction completions for workers:
- Track which workers have completed induction for this site
- Record induction date, inductor name, and acknowledgment
- Edit or update induction records

### 5.8 Completion Tab

Generate **Notice of Practical Completion (NPC)** documents:
- Enter owner name and notice date
- List any defects (or confirm no defects for clean completion)
- Generate PDF
- Send via email or via **SignWell** for dual signature (builder signs first, then client)
- Track NPC status: Draft → Builder Signing → Sent to Client → Completed
- Download signed PDF

### 5.9 Email & SMS Tab

Send communications directly from the client record:
- Choose recipient mode: Client, Single Trade, or All Trades
- Select from pre-configured templates (client templates or trade templates)
- Templates support merge fields: `{{clientName}}`, `{{siteAddress}}`, `{{quoteNumber}}`
- Track delivery status: Sent, Delivered, Read, Failed
- View message history

### 5.10 Shared Files Tab

Manage documents shared with trades and clients:
- Upload files (max 25 MB per file)
- Assign categories: Plans, Engineering, Specs, Permits, Photos, Other
- Toggle visibility for Trade Portal access
- Bulk share selected files to Client Portal
- View client photo comments and replies

### 5.11 Procurement Tab

Two sub-tabs:
- **Purchase Orders** — Create and track Xero-integrated purchase orders for this job (supplier, delivery date, line items, total)
- **Component Orders** — View component orders placed through the Smartshop system for this job

---

## 6. Workflow Summary

The typical lifecycle of a construction client follows this path:

1. **Lead Conversion** — A CRM lead is moved to "Contract" status, automatically creating the construction job
2. **Scheduling** — Job is assigned a scheduled start date and installers
3. **Pre-Construction** — Check measure completed, plans uploaded, approvals lodged, subcontracts issued
4. **Active Construction** — Status set to "In Progress", tasks managed via Project Plan, progress invoices raised
5. **Completion** — All stages complete, NPC issued and signed, status set to "Completed"

---

## 7. Tips and Best Practices

- Use the **FY filter** to focus on current-year projects and avoid information overload
- Monitor the **BA filter > Overdue** option regularly to catch stalled approval applications
- Use **bulk approval status updates** when processing multiple approvals at once
- Keep the **Financials tab** updated to maintain accurate margin health indicators
- Use the **Project Plan kanban** to coordinate tasks between office and field teams
- Send communications via the **Email & SMS tab** to maintain a complete audit trail within the system
- Generate **NPC documents** through the Completion tab to ensure proper legal documentation of project handover

---

## 8. Permissions

All features in the Construction > Clients section require an authenticated user account. Admin-only features (such as certain financial overrides) are restricted to users with the `admin` or `super_admin` role.

---

*Document generated by AltaSpan System Documentation*

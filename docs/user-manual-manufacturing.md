# User Manual — Manufacturing

**Application:** AltaSpan Costing & Quoting System  
**Module:** Manufacturing  
**Audience:** Manufacturing Managers, Production Staff, Dispatch Coordinators, Procurement Officers  
**Last Updated:** June 2026

---

## 1. Overview

The **Manufacturing** module manages the end-to-end production lifecycle — from receiving component orders placed by the Construction team, through production scheduling, procurement of raw materials, quality control, dispatch, and delivery to site. The module integrates with the Construction section (as the source of orders) and with Xero (for purchase order synchronisation).

---

## 2. Accessing the Section

Navigate to **Manufacturing** from the sidebar menu. The sidebar exposes the following sub-pages:

| Menu Item | Path | Purpose |
|-----------|------|---------|
| Manufacturing Dashboard | `/manufacturing` | KPI summary and quick links |
| Orders | `/manufacturing/orders` | View and manage all manufacturing orders |
| Calendar | `/manufacturing/calendar` | Production schedule by branch (monthly view) |
| Reports | `/manufacturing/reports` | Production analytics and material grouping |
| Purchase Orders | `/manufacturing/purchase-orders` | External procurement POs for materials |
| Procurement | `/manufacturing/procurement` | Full procurement workflow (receive, match, approve) |
| Dispatch | `/manufacturing/dispatch` | Schedule and track deliveries to site |
| Drivers | `/manufacturing/drivers` | Driver administration and licence tracking |
| Delivery Calendar | `/manufacturing/delivery-calendar` | Monthly calendar view of dispatches |
| QR Codes | `/manufacturing/qr-codes` | Generate and print QR codes for floor staff |

---

## 3. Manufacturing Dashboard

The dashboard provides an at-a-glance summary of production status through six KPI cards:

| KPI | Description |
|-----|-------------|
| **Total Orders** | Count of all manufacturing orders |
| **In Production** | Orders currently being manufactured |
| **Completed** | Orders finished and ready for dispatch |
| **Overdue** | Orders past their target date but not completed |
| **Total Tasks** | Sum of all individual production tasks across orders |
| **Pending Tasks** | Tasks not yet started |

Below the KPIs, four **Quick Link** cards provide navigation to Orders, Calendar, Reports, and Purchase Orders.

---

## 4. Orders

### 4.1 Orders List

The Orders page (`/manufacturing/orders`) displays a filterable table of all manufacturing orders. Orders are created automatically when the Construction team submits a **Component Order** (via the Smartshop order form) for a job.

**Filters:**
- **Search** — Filter by order number, client name, or site address
- **Status** — All Statuses, Received, In Production, Partially Complete, Completed, On Hold, Cancelled

**Table Columns:**

| Column | Description |
|--------|-------------|
| Order # | Auto-generated order number |
| Client | Client name from the linked construction job |
| Status | Colour-coded badge |
| Priority | Low, Normal, High, or Urgent |
| Target Date | Required-by date set by Construction |
| Received | Date the order was received |

Click any row to open the **Order Detail** page.

### 4.2 Order Detail

The Order Detail page (`/manufacturing/orders/:id`) is the production workbench for a single order. It contains:

**Header:**
- Order number, client name, and site address
- Status dropdown (change order status directly)
- "Notify" button (available when status is Completed) — sends a completion notification to the Construction team

**Summary Cards:**
- Status, Priority, Target Date, and Task count

**Tabs:**

#### 4.2.1 Tasks Tab

Tasks are the individual production items within an order (e.g., "Cut 6m Louvre Blade in Woodland Grey"). They are grouped by **category** (e.g., "Louvre Blades", "Posts & Beams", "Flashings").

Each task row shows:
- Product name and code
- Colour
- Quantity and unit
- Source type: **Manufacture** (made in-house) or **Procure** (ordered from supplier)
- Assigned branch
- Status with inline status-change dropdown

**Bulk Actions:**
Select multiple tasks using checkboxes, then:
1. **Update Status** — Change status of all selected tasks at once (Pending, Scheduled, In Progress, Completed, On Hold, Cancelled)
2. **Assign Branch** — Assign selected tasks to a manufacturing branch with an optional scheduled date

#### 4.2.2 Schedule Tab

Shows scheduled production entries for this order in a table format with date, title, branch, assigned worker, and status.

#### 4.2.3 Purchase Orders Tab

Lists all purchase orders raised against this manufacturing order, showing PO number, supplier, status, total amount, required-by date, and Xero sync status.

---

## 5. Calendar

The Manufacturing Calendar (`/manufacturing/calendar`) provides a **monthly grid view** of production schedules across all branches.

**Features:**
- Navigate between months using arrow buttons
- Filter by branch using the dropdown
- Click a date cell to create a new schedule entry
- Drag and drop schedule items between dates to reschedule
- Each item shows a colour-coded status dot and title

**Schedule Entry Fields:**
- Title, Branch, Assigned Worker, Status, Scheduled Date

---

## 6. Reports

The Reports page (`/manufacturing/reports`) provides four analytical views:

### 6.1 Production Schedule Report

Filters by date range and branch. Groups scheduled items by day, showing what is planned for each date within the range.

### 6.2 Jobs by Status Report

Displays count and percentage cards for each order status (Received, In Production, Partially Complete, Completed, On Hold, Cancelled).

### 6.3 Jobs by Target Date Report

Lists all jobs within a date range, highlighting those that are **overdue** (past target date but not completed). Useful for identifying production bottlenecks.

### 6.4 Material Grouping Report

Groups all manufacturing tasks by **category** and **colour**, showing source type (Manufacture vs Procure) and pending/completed quantities. This report helps production managers plan material cuts and batch similar items together.

---

## 7. Purchase Orders

The Manufacturing Purchase Orders page (`/manufacturing/purchase-orders`) manages external procurement for materials not manufactured in-house.

**Features:**
- Filterable list of all POs with supplier, linked order, status, total amount, required-by date, and Xero sync state
- **Create PO** — Select a manufacturing order, enter supplier details, required date, notes, and add line items (product, quantity, unit price)
- **Edit PO** — Modify existing POs before they are issued
- **Status Workflow:** Draft → Issued → Confirmed → Received → Cancelled

**Xero Integration:** POs can be synced to Xero. A "Synced" badge indicates the PO exists in Xero; otherwise a sync action is available.

---

## 8. Procurement Workflow

The Procurement page (`/manufacturing/procurement`) provides a complete three-way matching workflow for purchase orders, goods received, and supplier invoices.

### 8.1 PO Overview Tab

Lists all manufacturing POs. Selecting a PO opens a **Match Summary** panel comparing:
- Ordered quantities and values
- Received quantities and values
- Invoiced quantities and values

Discrepancies are highlighted for investigation.

### 8.2 Goods Received Tab

Record receipt of goods against a PO:
1. Select an active PO
2. For each line item, enter the quantity received
3. Record condition: Good, Damaged, or Partial Damage
4. Add notes if applicable
5. Submit the receipt

When a PO is fully received, the system optionally prompts for **supplier feedback** (quality rating).

### 8.3 Invoices Tab

Match supplier invoices against POs:
- Upload or record invoice details
- System compares invoice amounts against PO values and received quantities
- Flag discrepancies for review

### 8.4 Approval Queue Tab

Displays items requiring management approval before payment:
- Invoices with discrepancies
- POs exceeding budget thresholds
- Items flagged during receipt (damaged goods)

---

## 9. Dispatch & Delivery

### 9.1 Dispatch Page

The Dispatch page (`/manufacturing/dispatch`) manages the logistics of delivering completed orders to construction sites.

**Features:**
- Filter dispatches by status: Pending, Scheduled, In Transit, Delivered, Failed, Cancelled
- **Create Dispatch** — Select a completed order, assign a driver, set delivery date and address
- **Assign Driver** — Assign or reassign a driver to a dispatch
- **Update Status** — Progress dispatches through the workflow
- **Confirm Delivery** — Mark as delivered with optional supplier feedback prompt

**Status Workflow:** Pending → Scheduled → In Transit → Delivered (or Failed/Cancelled)

### 9.2 Delivery Calendar

The Delivery Calendar (`/manufacturing/delivery-calendar`) shows a monthly view of all dispatches:
- Filter by driver
- Colour-coded status chips per day
- Up to three dispatch entries shown per day cell
- Navigate between months

### 9.3 Drivers

The Drivers page (`/manufacturing/drivers`) manages the driver fleet:

| Feature | Description |
|---------|-------------|
| Driver List | Searchable list with active/inactive toggle |
| KPI Cards | Total drivers, valid licences, linked accounts, expiring licences |
| Driver Details | Contact info, vehicle, licence number, expiry date |
| Merge with User | Link a driver record to a system user account for portal/GPS access |
| Activate/Deactivate | Toggle driver availability |

---

## 10. QR Codes

The QR Codes page (`/manufacturing/qr-codes`) enables paperless task tracking on the factory floor.

**Workflow:**
1. Select a manufacturing order from the dropdown
2. Click **Generate QR Codes** — creates a unique token for each task in the order
3. QR code images are rendered on-screen in a printable grid (3 per row)
4. Click **Print** to open a print-friendly view for label printing

**Scanning:**
- Factory floor workers scan a QR code with any smartphone camera
- The scan opens a mobile-friendly page (`/scan/:token`) showing the task details
- Workers can update the task status directly: Start Work, Mark Complete, Put On Hold, or Cancel
- Haptic feedback confirms the status update on mobile devices

> **Note:** The scan page is publicly accessible (no login required) so that floor staff without system accounts can update task progress.

---

## 11. Stocktake

The Stocktake feature (`/manufacturing/stocktake`) allows periodic inventory counts at each branch.

**Workflow:**
1. **Create Stocktake** — Select a branch and optionally add notes. The system auto-populates all inventory items for that branch.
2. **Count Items** — For each item, enter the physical count. The system shows expected vs actual with variance highlighting.
3. **Review** — Submit for review when counting is complete.
4. **Finalise** — Manager approves the stocktake, which updates inventory records.

**Statuses:** In Progress → Review → Finalised (or Cancelled)

---

## 12. KPI Dashboard

The Manufacturing KPI page (`/manufacturing/kpi`) provides advanced analytics with interactive charts:

| Chart | Description |
|-------|-------------|
| **Throughput Trend** | Line chart showing tasks completed per day over the selected period |
| **Lead Time Distribution** | Bar chart showing how many days orders take from receipt to completion |
| **Branch Utilisation** | Comparative chart of workload across manufacturing branches |
| **Orders by Status** | Doughnut chart showing current order status distribution |

Summary KPI cards at the top show headline metrics: average lead time, throughput rate, on-time delivery percentage, and capacity utilisation.

---

## 13. Integration Points

The Manufacturing module integrates with several other system areas:

| Integration | Direction | Description |
|-------------|-----------|-------------|
| Construction → Manufacturing | Inbound | Component Orders from Construction create Manufacturing Orders |
| Manufacturing → Construction | Outbound | Completion notifications inform Construction that materials are ready |
| Manufacturing → Xero | Bidirectional | Purchase Orders sync to Xero; invoice data flows back |
| Manufacturing → Dispatch | Internal | Completed orders feed into the dispatch queue |
| QR Scan → Tasks | Inbound | Floor staff update task status via QR code scans |

---

## 14. Typical Workflow

The standard manufacturing lifecycle follows this sequence:

1. **Order Received** — Construction submits a component order; a Manufacturing Order is created with status "Received"
2. **Production Planning** — Tasks are reviewed, assigned to branches, and scheduled on the calendar
3. **Procurement** — Items marked as "Procure" have POs raised against suppliers
4. **Production** — Tasks progress through Pending → Scheduled → In Progress → Completed (updated via QR scan or manually)
5. **Goods Receipt** — Procured items are received and matched against POs
6. **Order Completion** — When all tasks are complete, order status moves to "Completed" and Construction is notified
7. **Dispatch** — A dispatch is created, driver assigned, and delivery scheduled
8. **Delivery** — Driver delivers to site; status confirmed as "Delivered"

---

## 15. Tips and Best Practices

- Use **bulk task actions** to efficiently assign branches and update statuses for large orders
- Print **QR codes** for each order and attach to physical work tickets on the factory floor
- Monitor the **Overdue** KPI on the dashboard daily to catch slipping orders early
- Use the **Material Grouping Report** to batch similar cuts and colours together for efficiency
- Keep the **Procurement Workflow** up to date — record goods received promptly to maintain accurate three-way matching
- Use the **Delivery Calendar** filtered by driver to balance workloads across the fleet
- Run **Stocktakes** at least quarterly per branch to maintain inventory accuracy

---

## 16. Permissions

All Manufacturing features require an authenticated user account. Driver management and stocktake finalisation are restricted to users with `admin` or `super_admin` roles. The QR scan page is the only publicly accessible endpoint (no authentication required) to enable floor staff usage.

---

*Document generated by AltaSpan System Documentation*

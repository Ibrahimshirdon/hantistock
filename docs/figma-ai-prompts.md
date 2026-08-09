# Figma AI Design Prompts — Hantistock (34 screens)

Copy-paste one prompt at a time into Figma AI (First Draft / Make). Each prompt is self-contained — it repeats the style cues every time, since AI design generators don't reliably carry style over between separate prompts. Every field/column/button named below is taken directly from the real, already-built page, so the resulting design will accurately represent the actual system — not an invented one.

**Two canvas types used below:**
- **Desktop (1440×900)** for everything under the admin/manager/staff workspace, customer portal, and supplier portal.
- **Mobile (390×844)** for the driver portal only — it's genuinely built as a phone-sized app with a bottom tab bar, not a desktop page.

---

## Reusable style block

Paste this at the start of every desktop prompt (or save it as a Figma AI "style reference" if the tool supports one):

> Modern professional B2B SaaS web app, light theme, desktop, 1440×900 canvas. Primary accent: deep indigo #4F46E5. Page background: very light gray #F8F9FB. Cards: white, 10px rounded corners, soft subtle drop shadow. Typography: Inter or similar clean sans-serif — bold 20–24px page titles, 14px body text, 12px muted gray captions. Tables: white background, light-gray header row, subtle row dividers, row hover highlight. Status badges: small pill shapes, color-coded — green for active/success/approved/completed, red for destructive/suspended/rejected/failed, gray for neutral/pending, amber for warning. Buttons: primary = solid indigo fill with white text and rounded corners; secondary = white with gray outline; destructive = red. Left sidebar navigation, 240px wide, grouped into labeled sections with icon + label nav items, current page highlighted in indigo. Top header bar, 64px tall: app name "Hantistock" on the left, a notification bell icon and a circular user avatar with dropdown on the right.

For the **customer/supplier portal** prompts, replace "left sidebar navigation" with: *a simple top header bar containing the app name, a row of horizontal text nav links, a notification bell, and a user avatar — no sidebar.*

For the **driver portal** prompts, use this mobile style block instead:

> Mobile app screen, light theme, 390×844 canvas (phone-sized), single-column layout with generous padding and large touch-friendly buttons. Top header bar (56px): app name on the left, notification bell + avatar icon on the right. Bottom tab bar with 2 icon+label tabs ("Active" with a truck icon, "History" with a clock icon), active tab highlighted in indigo #4F46E5. Same palette as desktop: white cards with 10px rounded corners and soft shadows, pill-shaped color-coded status badges.

---

## A. Authentication

### A1. Login
Design a centered, minimal login screen. A small white card (max 400px wide) vertically centered on the page, with: app title "Sign in to Hantistock", a short description line, an "Email or username" input, a "Password" input, a full-width primary "Sign in" button, and a small text link below: "Don't have an account? Register". No sidebar, no header — just the centered card on the light-gray background.

### A2. Register
Design a centered account-creation screen, same card style as the login screen (max 420px wide). Header: "Create your account" + description. Form fields top-to-bottom: Full name, Email, Username (optional, with small helper text "Lets you sign in with a username instead of your email"), Phone (optional), Password (helper text "min 8 characters"). Full-width primary "Create account" button, and a text link below: "Already have an account? Sign in".

---

## B. Admin / Manager / Staff Workspace (left-sidebar layout)

Sidebar sections or each screen below: Overview, Inventory, Sales, Customers, Suppliers, Delivery, Finance, Reports, Settings — matching whichever section the current screen belongs to.

### B1. Dashboard
Design the main analytics dashboard. Top: greeting "Welcome back, {Name}" + "Signed in as {role}". A row of 4 stat cards: Total products, Inventory value, Low stock items, Expiring batches (30d). Below: a second row of 4 stat cards (Revenue, Expenses, Net profit, Completed orders — all "30d"). A card titled "Needs your attention" with two rows: "Products pending approval" and "Unassigned deliveries", each with a small count badge and a "Review"/"Dispatch board" link. A large card with a line chart "Sales trend & 7-day forecast" (two lines: solid indigo "Actual sales", dashed amber "Forecast"). Two side-by-side cards: "Top products" table (Product, Qty sold, Revenue) and "Best customers" table (Customer, Orders, Total spent). A bar chart card "Inventory value by category". Two more side-by-side cards: "Low stock alerts" (product name + stock/reorder level) and "Batches expiring within 30 days" (batch number + quantity). At the bottom, two more side-by-side cards: "Team overview" (4 numbers: Staff, Drivers, Suppliers, Customers) and "Recent activity" (a feed list of action + user + timestamp, with a "View all" link).

### B2. Products (list)
Design a product catalog list page. Header: "Products" title + description, with a "Create product" primary button top-right. A filter row: Search input ("Name, SKU, or barcode"), Category dropdown, "Low stock only" checkbox. A table with columns: Name, SKU, Category, Stock, Selling price, Status. Stock column shows quantity + unit, with a red "Low stock" badge when applicable. Status column shows an active/inactive badge plus a "Pending approval" badge when relevant.

### B3. Product Detail
Design a single product detail page. Top: product image thumbnail next to the product name with badges (Low stock, active/inactive, Pending approval) and action buttons (Approve product, Edit, Delete) top-right. A metadata row: SKU, barcode, category, cost price, selling price, total stock, reorder level, max stock level, with an "Upload image" button. Below, two tabs: "Batches & expiry" (table: Batch #, Quantity, Expiry date, Status — with an "expiring soon" badge in red) and "Adjustments" (table: Date, Type, Change, Reason — change values colored red for negative, green for positive).

### B4. Categories
Design a simple category management page. Header with a "New category" button top-right. A table with columns: Name, Description, Status (active/inactive badge), Actions (a deactivate/activate toggle button per row).

### B5. POS (Point of Sale)
Design a two-pane checkout screen. Left (main, ~65% width): a search bar at top, then a responsive grid of product cards (name, price, stock). Right sidebar (~35% width, fixed): a customer selector dropdown ("Walk-in" or registered customer), a cart list (product name, unit price, quantity stepper), a discount-code input with "Apply" button, a pricing breakdown (Subtotal, Discount, Tax, Total), a payment method selector (Cash, Card, Wallet, Mobile Money), and a large primary "Charge total" button at the bottom.

### B6. Sales Orders (list)
Design an orders list page. Header: "Sales Orders" + description, with a "Sold by" filter dropdown. A table with columns: Order #, Customer, Sold by, Items, Total, Payment, Status (completed=green / cancelled=red badge), Date. Rows look clickable (hover highlight).

### B7. Sales Order Detail
Design an order detail page. Header: order number, customer name, date, salesperson, with a status badge and a "Print" button top-right. An items table: Product, Qty, Unit price, Discount, Tax rate, Line total. Below, a right-aligned pricing summary block: Subtotal, Discount, Tax, Delivery fee (if applicable), Grand total. At the bottom, two side-by-side cards: "Invoice" (invoice number, status, total) and "Receipt" (receipt number, amount paid, payment method).

### B8. Discounts
Design a discount-codes management page. Header with a "New discount" button. Table columns: Code, Value (shows "10%" or "$5.00" depending on type), Applies to (All/Category/Product), Used (count), Status (active/inactive), Actions (deactivate/activate toggle). Include a "New discount" dialog mock with fields: Code, Type (Percentage/Fixed radio), Value, Applies to, a conditional category/product picker, Valid from date, Valid to date, Usage limit.

### B9. Tax Rates
Design a small tax-rate configuration page. Header with "New tax rate" button. Table columns: Name, Rate (e.g. "15%"), Default (badge on the default row), Actions ("Set as default" button on non-default rows).

### B10. Customers
Design a customer management page. Header: "Customers" + description. Table columns: Name, Email, Phone, Wallet (currency), Loyalty points, Addresses (count), Status (active/suspended badge), Actions (three buttons per row: Adjust wallet, Adjust loyalty, Suspend/Activate).

### B11. Supplier Stock
Design a page where staff browse what every supplier currently has on hand. Header: "Supplier Stock" + description ("Browse what every supplier currently has on hand and request stock if you need it."). Table columns: Product (with brand subtext), Company, Supplier, Manager, Category, Available, Unit, Wholesale price, Selling price, Status (In catalog / Not yet submitted badge), Actions ("Request stock" button, disabled-looking when stock is 0).

### B12. Dispatch Board
Design a delivery dispatch page. Header with a "Create delivery" button. Table columns: Order #, Dropoff (address line), Driver, Status (color-coded pill: unassigned=gray, assigned/picked_up/in_transit/delivered=green-ish, failed=red), Actions (an "Assign driver" dropdown shown only on unassigned rows).

### B13. Delivery Detail
Design a single delivery detail page. Header: delivery's order number, assigned driver name, status badge, with an "Assign driver" dropdown shown if still unassigned. Two side-by-side cards: "Pickup address" and "Dropoff address" (each showing label + address line + city). A "Proof of delivery" card showing an uploaded photo (if delivered). A "Status timeline" card listing events top-to-bottom: status, optional note, timestamp.

### B14. Expenses
Design an expense tracking page. Header with a "New expense" button. A date-range filter row (From/To date pickers) with a running total displayed alongside. Table columns: Date, Category, Description, Paid to, Method, Amount (right-aligned), Actions (delete button).

### B15. Financial Reports
Design a financial reporting page. A date-range filter row (From/To). A row of 6 stat cards: Sales revenue, Other income, Total revenue, Cost of goods sold, Total expenses, Net profit. Below, a card with a 3-line chart "Cash flow" (Cash in green, Cash out red, Net indigo). A second card with a bar chart "Expenses by category".

### B16. Sales Report
Design a sales reporting page. Top row: date-range preset buttons (Today, This month, Custom), date inputs, and two export buttons (Export PDF, Export Excel). A row of 5 stat cards: Orders, Subtotal, Discount, Tax, Total. Below, a transactions table: Order #, Date, Customer, Items, Payment, Total.

### B17. Inventory Report
Design an inventory reporting page. Header with two export buttons (Export PDF, Export Excel) top-right. A row of 3 stat cards: Total products, Inventory value, Low stock items. Below, a table: SKU, Product, Category, Stock, Reorder level, Stock value (right-aligned), Status — a 3-tier color-coded badge (red "Low stock", amber "Warning", green "Good").

### B18. Users (admin)
Design a staff/account management page (admin only). Header with a "Create user" button. A role-filter dropdown (All roles, Admin, Manager, Staff, Customer, Supplier, Driver). Table columns: Name, Email, Role (badge), Status (active/suspended badge), Actions (Suspend/Activate toggle, Reset password button, Delete button — delete hidden on the admin's own row).

### B19. Audit Logs
Design a security audit-log page (admin only). Header: "Audit Logs" + description ("Every sensitive mutation with before/after state."). A "Filter by user" dropdown. Table columns: Date, User (name + role badge), Action (monospace text), Entity (type + truncated ID), Before → After (small muted JSON snippets).

### B20. Activity Logs
Design a system activity-log page (admin only). Header: "Activity Log" + description ("Every mutating action across the system, captured automatically."). A "Filter by user" dropdown. Table columns: Date, User, Action (monospace text showing things like "POST /api/inventory/products").

### B21. Danger Zone (System Reset)
Design a high-warning destructive-action page (admin only). Header: "Danger Zone". A single card with a red/destructive border containing a warning description and a red "Reset system" button. Clicking opens a confirmation dialog requiring the admin to type an exact confirmation phrase ("RESET EVERYTHING") into a text field before a red "Permanently reset" button becomes enabled.

---

## C. Customer Portal (top-nav layout, no sidebar)

Top nav links for every screen in this section: Shop, Orders, Wallet.

### C1. Shop
Design a customer-facing storefront, two-pane layout. Left (main): a search bar, a category filter dropdown, and a responsive grid of product cards (image, name, price, "Add to cart" button). Right sidebar (cart panel): cart title, line items (name, unit price, quantity +/- stepper), a discount-code input with "Apply" button, a fulfillment-type toggle (Pickup / Delivery), a conditional delivery-address form (Address, City) shown only when Delivery is selected, a pricing summary (Subtotal, Discount, Tax, Delivery fee, Total), a payment-method selector (Wallet, Cash on delivery, Card, Mobile Money), and a primary "Place order" button.

### C2. Orders (customer)
Design the customer's own order-history page. Header: "Your Orders". Table columns: Order #, Items, Total, Status (completed=green / pending-cancelled=red badge), Date. Rows look clickable.

### C3. Order Detail (customer)
Design a customer-facing order detail page. Header: order number + placement date, with status and fulfillment-type badges. Items table: Product, Qty, Unit price, Line total. A pricing breakdown (Subtotal, Discount, Tax, Delivery fee, Total). A "Delivery tracking" card (status badge + dropoff address) shown only for delivery orders. Two side-by-side cards at the bottom: "Invoice" and "Receipt".

### C4. Wallet
Design a customer wallet page. Header: "Wallet" + description. A large, prominent balance card showing the current balance in big bold text (e.g. "$120.00"). Below, a transactions table: Date, Type (credit/debit), Reason (Top up/Purchase/Refund/Adjustment), By, Amount (green for credit, red for debit), Balance after (right-aligned).

---

## D. Supplier Portal (top-nav layout, no sidebar)

Top nav links for every screen in this section: Dashboard, Companies, Products, Stock Requests.

### D1. Supplier Dashboard
Design a simple welcome/landing page for the supplier portal. Header: "Welcome, {Name}". A single card with a friendly message like "More supplier features are coming soon."

### D2. Supplier Companies
Design a company-profile management page. Header with a "New company" button. Table columns: Name, Location, Manager, Contact (phone · email), Actions (Edit, Delete buttons). The create/edit dialog has fields: Company name, Description, Location, Manager name, Contact phone, Contact email.

### D3. Supplier Products
Design the supplier's own product catalog management page. Header with an "Add product" button. Table columns: Product (with brand subtext), Company, Category, Quantity, Unit, Wholesale price, Selling price, Status (Submitted / Not submitted badge), Actions (Submit, Edit, Delete buttons — Submit disabled when quantity is 0). The "Add product" dialog has many fields: Company (select), Name, Brand, Description, Category, Unit type, Quantity in stock, Wholesale price, Selling price, Minimum stock level, Expiry date, Purchase price, Batch number, Warehouse location.

### D4. Stock Requests (supplier side)
Design the supplier's incoming stock-request approval page. Header: "Stock Requests" + description. Table columns: Product, Company, Quantity, Requested by, Message, Status (pending=gray, approved=green, rejected=red badge), Date, Actions (Approve / Reject buttons, shown only on pending rows). The reject action opens a small dialog with an optional reason textarea.

---

## E. Driver Portal (mobile layout, bottom tab bar)

Use the **mobile style block** above for both screens in this section. Bottom tabs: "Active" (truck icon) and "History" (clock icon).

### E1. Driver — Active Delivery
Design a mobile screen showing the driver's one current delivery. Header: "Hi, {Name}". If there's an active delivery: a card with the order number + status badge at top, the dropoff address, any notes, a file-upload control for "Proof of delivery" (shown only once status is "in transit"), a large primary action button whose label changes by status ("Mark picked up" → "Mark in transit" → "Mark delivered"), and a secondary red "Report failed delivery" button. If there's no active delivery: a simple centered empty state saying "No active delivery".

### E2. Driver — History
Design a mobile screen listing the driver's past deliveries. Header: "Delivery history". A simple list/table: Order #, Dropoff address, Status (delivered=green / failed=red badge).

---

## F. Shared across all 6 roles

### F1. Account Settings
Design a personal account settings page (desktop, used identically by every role inside their own layout — sidebar for staff roles, top-nav for portal roles). Header: "Account Settings". Four stacked cards: (1) Profile photo — circular avatar with initials fallback + "Change photo" button; (2) Profile — Email (read-only), Display Name, Username, "Save changes" button; (3) Change password — Current password, New password, Confirm new password, "Change password" button; (4) Appearance — current theme label + a toggle button "Switch to light/dark mode" with a sun/moon icon.

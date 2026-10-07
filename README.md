# IIM Visakhapatnam - Fine Management System

This is a high-fidelity client-side Single-Page Application (SPA) designed to manage placement-related penalties for PGP (Post Graduate Programme) students at IIM Visakhapatnam.

The system tracks monetary fines and red flags across two distinct placement cycles: Summer Internship Placements (SIP) and Final Placements.

## Tech Stack
- **Structure:** HTML5 Semantic Markup
- **Styling:** Premium Vanilla CSS (Slate blue, cool gray, glassmorphism, responsive grid layout, micro-animations)
- **Logic:** Vanilla JavaScript (ES6+) with state persistence in `localStorage`
- **Charts:** Rendered using dynamic Canvas/SVG

## Key Features
1. **Student Master Data Management:** Form-based student CRUD, bulk import/upload from CSV with validation, and soft-delete/restore history with 30-day auto-purge.
2. **Fine Creation & Tracking:** Manual entry with searchable student selector, pre-populated violation rules (based on actual placement policies), differentiation tag auto-generators (increment/timestamp), and bulk CSV upload.
3. **Payment Confirmation Processing:** Mark fines as CLOSED via CSV upload, displaying preview matching and conflicts (multiple open fines selector).
4. **Interactive Dashboard:** Dynamic cards displaying aggregate statistics (Summer/Final), category-wise penalty breakdowns, and action logs. Clicking card metrics acts as a filter on the fine list.
5. **Red Flag Tracking:** Automatic accumulation per cohort, with visual category breakdowns in details and strict cohort boundaries (no carry-over).
6. **Detailed Audit Trails:** Tracks exact changes (fields, old vs. new values), logins/logouts, and admin actions.
7. **Advanced Search & Multi-filter:** Search students by name/roll (partial/fuzzy suggestions), filter by status/category, and export clean filtered CSVs.

## How to Run
1. Locate the project folder at `C:\Users\sharo\.gemini\antigravity\scratch\fine-management-system`.
2. Open `index.html` in any modern web browser (Google Chrome, Microsoft Edge, etc.) by double-clicking it.
3. Use the default login credentials:
   - **Username:** `admin`
   - **Password:** `admin123`

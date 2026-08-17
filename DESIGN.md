# Modern Business Intelligence Design System

## Overview
A professional, data-dense design system optimized for business intelligence dashboards, analytics platforms, and document management systems. Features a sophisticated dark theme with high contrast, excellent readability, and a focus on information hierarchy.

## Color Palette

### Backgrounds
- `--bg-primary`: #0a0f1c (deepest background, main app)
- `--bg-secondary`: #111827 (cards, panels, sidebar)
- `--bg-tertiary`: #1f2937 (hover states, elevated surfaces)
- `--bg-hover`: #374151 (interactive hover)

### Borders & Dividers
- `--border-primary`: #1f2937 (subtle borders)
- `--border-secondary`: #374151 (emphasized borders)

### Text
- `--text-primary`: #f9fafb (headings, important values)
- `--text-secondary`: #d1d5db (body text, labels)
- `--text-muted`: #9ca3af (secondary info, placeholders)
- `--text-faint`: #6b7280 (disabled, timestamps)

### Accent & Status
- `--accent-primary`: #3b82f6 (primary actions, links, active states)
- `--accent-hover`: #2563eb (primary hover)
- `--accent-muted`: #1e40af (subtle accent backgrounds)
- `--success`: #10b981 (positive metrics, paid status)
- `--warning`: #f59e0b (warnings, pending states)
- `--error`: #ef4444 (errors, unpaid, destructive actions)
- `--info`: #8b5cf6 (informational, vision OCR)

### Semantic Colors
- `--card-bg`: #111827
- `--card-border`: #1f2937
- `--input-bg`: #1f2937
- `--input-border`: #374151

## Typography

### Font Family
- Primary: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif
- Monospace: 'JetBrains Mono', 'Fira Code', Consolas, monospace (for data, hashes, IDs)

### Font Sizes
- `text-xs`: 0.75rem (12px) - labels, badges, timestamps
- `text-sm`: 0.875rem (14px) - body text, secondary info
- `text-base`: 1rem (16px) - emphasized body
- `text-lg`: 1.125rem (18px) - section titles
- `text-xl`: 1.25rem (20px) - page titles
- `text-2xl`: 1.5rem (24px) - dashboard metrics
- `text-3xl`: 1.875rem (30px) - hero numbers

### Font Weights
- `font-normal`: 400 (body)
- `font-medium`: 500 (labels, buttons)
- `font-semibold`: 600 (headings, important values)
- `font-bold`: 700 (metrics, page titles)

## Spacing
- `space-1`: 0.25rem (4px)
- `space-2`: 0.5rem (8px)
- `space-3`: 0.75rem (12px)
- `space-4`: 1rem (16px)
- `space-6`: 1.5rem (24px)
- `space-8`: 2rem (32px)

## Border Radius
- `rounded-sm`: 0.25rem (4px) - small elements
- `rounded-md`: 0.375rem (6px) - inputs, buttons
- `rounded-lg`: 0.5rem (8px) - cards, panels
- `rounded-xl`: 0.75rem (12px) - modals, large cards
- `rounded-2xl`: 1rem (16px) - special containers

## Shadows
- `shadow-sm`: 0 1px 2px 0 rgb(0 0 0 / 0.05)
- `shadow-md`: 0 4px 6px -1px rgb(0 0 0 / 0.3)
- `shadow-lg`: 0 10px 15px -3px rgb(0 0 0 / 0.4)
- `shadow-xl`: 0 20px 25px -5px rgb(0 0 0 / 0.5)

## Component Patterns

### Cards
- Background: var(--card-bg)
- Border: 1px solid var(--card-border)
- Border radius: rounded-lg
- Padding: p-4 or p-6
- Hover: border-color shifts to var(--border-secondary)

### Buttons
- Primary: bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white
- Secondary: bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)]
- Danger: bg-[var(--error)] hover:bg-red-700 text-white
- Ghost: transparent hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)]

### Inputs
- Background: var(--input-bg)
- Border: 1px solid var(--input-border)
- Focus: ring-2 ring-[var(--accent-primary)] border-transparent
- Text: var(--text-primary)
- Placeholder: var(--text-faint)

### Badges
- Rounded-full with subtle background and border
- Color-coded by status (blue, green, red, yellow, purple, gray)

### Tables
- Header: text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider
- Rows: border-b border-[var(--border-primary)] hover:bg-[var(--bg-tertiary)]
- Cells: px-4 py-3 text-sm

### Modals
- Overlay: bg-black/70 backdrop-blur-sm
- Container: bg-[var(--card-bg)] rounded-xl shadow-2xl border border-[var(--border-primary)]
- Max height: 90vh with scroll

## Layout Patterns

### Sidebar
- Width: 16rem (w-64)
- Background: var(--bg-secondary)
- Border-right: 1px solid var(--border-primary)
- Active nav: bg-[var(--accent-muted)] text-[var(--accent-primary)] border-r-2 border-[var(--accent-primary)]

### Header
- Height: 3.5rem (h-14)
- Background: var(--bg-secondary)
- Border-bottom: 1px solid var(--border-primary)

### Main Content
- Background: var(--bg-primary)
- Padding: p-6
- Max width for readability: max-w-7xl mx-auto

## Data Visualization Guidelines
- Use monospace fonts for numerical data and IDs
- Large metrics: text-2xl or text-3xl font-bold
- Trend indicators: green for positive, red for negative
- Charts should use the accent color palette
- Grid lines: var(--border-primary) at 20% opacity

## Accessibility
- Minimum contrast ratio: 4.5:1 for normal text, 3:1 for large text
- Focus indicators: ring-2 ring-[var(--accent-primary)]
- Interactive elements: minimum 44px touch target
- Color is never the only indicator of status

## Animation
- Transitions: 150ms ease-in-out for micro-interactions
- 200ms for hover states
- 300ms for modal enter/exit
- No animation for data updates (instant feedback)

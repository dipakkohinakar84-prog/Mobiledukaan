# Design System Specification: The Retail Editorial

## 1. Overview & Creative North Star: "The Precise Architect"
This design system moves away from the "cluttered utility" common in retail software, instead adopting the persona of **The Precise Architect**. 

Our Creative North Star is a fusion of **High-Density Utility** and **Editorial Sophistication**. We treat mobile retail management not as a series of forms, but as a high-stakes dashboard. By utilizing intentional asymmetry, sophisticated tonal layering, and "breathable density," we ensure that an IMEI number or a daily sales total carries the same visual prestige as a luxury timepiece. We break the "template" look by favoring depth and light over rigid lines and boxes.

---

## 2. Color Philosophy & Tonal Depth

The palette is anchored in professional authority (`primary: #000666`) but relies on a sophisticated hierarchy of surfaces to create a sense of physical space.

### The "No-Line" Rule
**Strict Mandate:** Designers are prohibited from using 1px solid borders to section off content. 
*   **Alternative:** Boundaries must be defined through background shifts. For example, a `surface-container-low` section sitting on a `surface` background.
*   **The Goal:** Eliminate visual noise (the "jail cell" effect) to focus entirely on the data.

### Surface Hierarchy & Nesting
Treat the UI as a series of stacked materials. 
*   **Base:** `surface` (#f7f9fc) for the main application background.
*   **Structural Sections:** Use `surface-container-low` to define large functional areas.
*   **Actionable Elements:** Use `surface-container-lowest` (#ffffff) for primary cards to make them "pop" forward.
*   **The Glass & Gradient Rule:** For floating CTAs or high-level summaries, use `primary-container` with a subtle linear gradient to `primary`. Apply a 12px backdrop-blur to overlays to create a "frosted" premium feel.

---

## 3. Typography: The Data First Approach

We use a dual-font strategy to balance brand personality with hyper-legibility.

| Level | Token | Font | Size | Intent |
| :--- | :--- | :--- | :--- | :--- |
| **Display** | `display-lg` | Plus Jakarta Sans | 3.5rem | High-impact sales milestones. |
| **Headline** | `headline-sm` | Plus Jakarta Sans | 1.5rem | Section headers and key metrics. |
| **Title** | `title-md` | Inter | 1.125rem | Product names and customer names. |
| **Body** | `body-md` | Inter | 0.875rem | Standard UI text and descriptions. |
| **Label** | `label-sm` | Inter | 0.6875rem | Metadata, IMEI labels, Timestamps. |

**Specialized Numeric Treatment:** All prices and IMEI numbers must use `Inter` with **tabular lining** (monospaced numbers) to ensure that columns of figures align perfectly for quick scanning.

---

## 4. Elevation & Depth: Tonal Layering

Traditional drop shadows are often "dirty." We use light and tone to convey importance.

*   **The Layering Principle:** Place a `surface-container-lowest` card on a `surface-container-low` background. This creates a 0dp elevation feel that is crisp and modern.
*   **Ambient Shadows:** When a card must float (e.g., a "Quick Sale" drawer), use a shadow with a 24px blur, 0% spread, and an opacity of 6% using the `on-surface` color. It should feel like a soft glow, not a dark edge.
*   **The "Ghost Border" Fallback:** If a divider is essential for accessibility, use the `outline-variant` token at **15% opacity**. This creates a "suggestion" of a line rather than a hard break.

---

## 5. Signature Components

### The "Retail-Ready" Action Bar
A persistent bottom element (mobile) or sidebar top-action (desktop). 
*   **Style:** `surface-container-lowest` with a 20px backdrop-blur.
*   **Component:** Includes a floating, circular Primary Action Button (PAB) for the **Barcode Scanner**, utilizing a gradient from `secondary` (#0048d8) to `secondary_container`.

### Financial Summary Cards
*   **Layout:** Asymmetric. The "Total Revenue" uses `display-sm` in `on-tertiary-container` (Green) aligned to the right, while the "Pending" count sits in a small, high-contrast chip on the left.
*   **Visual Soul:** A subtle, 10% opacity watermark of the brand mark in the background of the card to prevent it from looking "generic."

### Data Density Inputs
*   **IMEI Fields:** Use `surface-variant` backgrounds with no borders. Upon focus, the background shifts to `primary-fixed` with a 2px `primary` bottom-bar only.
*   **Status Chips:** 
    *   *Delivered:* `tertiary_fixed` background / `on-tertiary-fixed` text.
    *   *Pending:* `error_container` background / `on-error-container` text.
    *   *Ready:* `secondary_fixed` background / `on-secondary-fixed` text.

### Navigation
*   **Mobile PWA:** Bottom navigation using `surface-container-highest` for the active state indicator—a "pill" shape rather than just a color change.
*   **Desktop Sidebar:** Use `surface-dim` for the sidebar background to create a clear vertical anchor, separating "Management" (sidebar) from "Operations" (main canvas).

---

## 6. Do’s and Don’ts

### Do
*   **Do** use `tertiary` (#002103) and its containers for "Success" and "Profit" states to ensure a professional, rather than neon, green.
*   **Do** prioritize vertical whitespace over lines. If two items feel cluttered, increase the padding to `1.5rem` rather than adding a divider.
*   **Do** use `label-sm` for "Unit of Measure" (e.g., "INR" or "Qty") placed immediately next to bold numbers.

### Don't
*   **Don't** use pure black (#000000) for text. Always use `on-surface` (#191c1e) to maintain the premium charcoal feel.
*   **Don't** use standard "Material Design" rounded corners (8px). Stick to our scale: `xl` (0.75rem) for main cards and `md` (0.375rem) for internal components like inputs.
*   **Don't** allow high-density screens to become "walls of text." Break data into logical clusters using `surface-container` shifts.
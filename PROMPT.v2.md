# Dalal Wire / WorldMonitor Finance / Bridge
## Product Rescue Prompt v2

## Product Shape
- `Bridge` is the homepage only.
- `Dalal Wire` is the main operating terminal.
- `WorldMonitor Finance` is the intelligence layer for macro, commodities, geopolitics, supply chain, and cross-market context.
- A persistent switcher widget lives inside Dalal Wire and WorldMonitor so the user never has to return to Bridge just to move between them.

## Rescue Order
1. Can I trust what I am seeing?
2. Can I use it smoothly?
3. Can I go deeper without friction?
4. Does WorldMonitor make Dalal smarter?
5. Does motion make the product feel premium without reducing clarity?

## Non-Negotiables
- No silent stale data.
- No hardcoded market numbers presented as live data.
- Every data widget must surface a freshness tag: `LIVE`, `DELAYED 15m`, `EOD`, `FALLBACK`, or `UNAVAILABLE`.
- `India VIX` must be sourced and labeled separately from global `CBOE VIX`.
- `FII / DII` must never be shown as live unless the source truly is live.
- `Bridge` must stay small. Two cards and a switcher pattern. No feature sprawl.
- Motion comes after truth and usability.
- `TCS` and `Infosys` must not appear in the Dalal Wire left rail.

## Phase 0 - System Audit
Goal: know what works before changing behavior.

- Inventory all major surfaces:
  - Bridge homepage
  - Dalal Wire terminal
  - WorldMonitor Finance
  - switcher widget
- Inventory all important routes, tabs, and panels.
- Inventory all API-backed widgets.
- Mark each item `WORKING`, `BROKEN`, `STALE`, `FALLBACK`, or `UNKNOWN`.
- Explicitly validate:
  - tabs
  - scroll containers
  - layout breakpoints
  - bridge navigation
  - WorldMonitor panel availability
  - live pulse behavior
  - signal chain clarity

## Phase 1 - Bridge Homepage
Goal: clean entry point, nothing more.

- Two cards only:
  - Dalal Wire
  - WorldMonitor Finance
- One-line description per card.
- Launch button per card.
- Persistent switcher widget prototype.
- No market data, no signal chain explanation, no live graph blocks on Bridge.

## Phase 2 - Truth Layer
Goal: remove ambiguity from data.

- Build a `dataInventory` manifest for all widgets.
- Add a startup smoke test for all critical endpoints.
- Every widget gets a freshness badge based on actual source behavior.
- VIX:
  - confirm source
  - label `India VIX`
  - show actual freshness tag
- FII / DII:
  - confirm whether it is EOD, delayed, or provisional
  - expose source date separately from fetch time
- News:
  - if live fetch fails, show `FALLBACK`
  - never silently replace live news with hardcoded stories

## Phase 3 - Dalal Wire Operational
Goal: make the terminal usable on a real screen.

- Fix layout overflow.
- Fix responsive breakpoints.
- Fix broken tabs.
- Fix broken scroll containers.
- Fix panel placement and overlap.
- Remove misleading "LIVE" language where not justified.
- Remove TCS and Infosys from the left rail.
- Audit every visible data widget for stale or fake-looking numbers.

Definition of operational:
- no broken tabs
- no dead panel routes
- no hidden overflow traps
- no unlabeled fallback data
- no left-rail TCS / Infosys

## Phase 4 - Index Drilldown
Goal: click an index and go deeper without leaving Dalal Wire.

- Index tiles become clickable.
- Click opens a drilldown panel or inline expansion.
- Show constituent table sorted by highest to lowest weightage.
- Columns:
  - rank
  - company
  - weightage
  - CMP
  - 52W high
  - 52W low
  - % rise/fall
- Each row clickable.
- Table scrolls correctly.
- Each displayed metric carries an appropriate freshness tag.

## Phase 5 - Stock Preview Popup
Goal: rich stock context without navigation.

- Triggered from constituent table.
- Opens as modal or drawer.
- Includes:
  - company name
  - ticker
  - exchange
  - CMP
  - % move
  - freshness badge
  - mini chart
  - PE vs industry PE
  - debt to equity
  - latest news
- News must show source and freshness.
- Popup must be fast and keyboard-closable.

## Phase 6 - WorldMonitor Finance For Dalal Use
Goal: WorldMonitor serves Dalal, not the other way around.

- Audit all finance-relevant panels.
- Mark each panel `KEEP`, `FIX`, `TRIM`, or `REMOVE`.
- Explicitly verify:
  - metals
  - crypto
  - central banks
  - supply chain
  - macro
  - energy
- For unavailable panels, distinguish:
  - upstream issue
  - API key issue
  - rate limit
  - broken UI
  - irrelevant panel
- Keep India-relevant macro context:
  - crude
  - gold
  - USD/INR
  - Fed
  - RBI
  - CPI / WPI
  - FII macro context
  - shipping / supply chain
  - geopolitics filtered to India relevance

## Phase 7 - Connection Quality
Goal: Dalal Wire and WorldMonitor feel like one workflow.

- Switcher works inside both products.
- Dalal actions route to relevant WorldMonitor panels.
- Bridge never becomes the workflow destination.
- `Live pulse` must be explicitly defined:
  - which signals feed it
  - what freshness rule it uses
  - what happens on fallback
- `Signal chain` must be plain and understandable, not decorative jargon.
- Verify Dalal -> WorldMonitor handoff is never dead.

## Phase 8 - Motion And Polish
Goal: premium feel after the product is truthful and usable.

- GSAP transitions
- subtle Three.js hero on Bridge only
- row / panel stagger reveals
- popup open / close motion
- live-badge pulse
- chart line draw
- ambient depth and texture
- reduced-motion support
- no animation may block loading or interaction

## Definition Of Done
- Bridge is clean and minimal.
- Dalal Wire truth layer is explicit.
- India VIX is labeled correctly.
- FII / DII freshness is labeled correctly.
- No silent fallback data.
- Dalal Wire is responsive at practical desktop sizes.
- Tabs and scroll containers work.
- Left rail excludes TCS and Infosys.
- Index drilldown works.
- Stock preview popup works.
- WorldMonitor is trimmed to India-relevant finance use.
- Switcher and context handoff work.
- Motion enhances the product instead of hiding weakness.

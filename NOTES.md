# Amazfit Bip Max Watchface — Design & Port Notes

Goal: reproduce the Garmin **Epix Pro 2** contour watchface (the `shaded`
branch of `garmin-simple-watchface-contours`) on the **Amazfit Bip Max**, running
on **Zepp OS**, built with the **Zeus CLI**.

This file is the plan. It records what we are copying, what has to change because
the platform and the screen are different, the exact workflow, and the steps to
install onto a real Bip Max. No monetization / KiezelPay — this is a personal
watchface only.

---

## 0. CURRENT STATUS (snapshot)

**Project:** `bipmax-contours/` (git root is `watchface/`). Scaffolded with
`zeus create` — API Level **2.0**, watchface type, platform **Amazfit Bip Max**.

**Confirmed device facts:** Bip Max = **432 × 514** rectangular AMOLED,
`deviceSource` **11206915** (codename **PikeW**), `designWidth` **432**,
`configVersion` **v2**, apiVersion **2.0.0**, local `appId` **23492**. Asset
folder: `assets/432x514-amazfit-bip-max/`.

**Working on the real watch (verified via `zeus preview`):**
- ✅ **Background** — **natively re-rendered** at 432×514 via Python (no circle
  mask), full-bleed (`widget.IMG`). Sharp edge-to-edge terrain, no rounded
  edges. Mt. Wilson center. (Command + method in §9.1.)
- ✅ **Time** — big, bold, orange `HH` : white `:MM`. Custom **Anton** font
  (`raw/anton.ttf`), ~210px, single draw. `@zos/sensor` `Time` +
  `setInterval` tick. Position tuned via `TIME_XOFF`.
- ✅ **Steps** — orange `S` + count, top-left. `@zos/sensor` `Step`. Needed the
  **`data:user.hd.step`** permission in `app.json`. *(Still diagnostic white —
  final styling pending, §9.4.)*
- ✅ **Day/Date circle** — top-right dark disc + orange ring + weekday (orange)
  over date (white), from JS `new Date()`.
- ✅ **Battery** — colored `%` bottom-center (green/yellow/red). `@zos/sensor`
  `Battery`. *(Bar-graph + days-remaining pending, §9.3.)*

**How it's built:** all foreground is code (`watchface/index.js`) reading sensors
and setting text — NOT the GUI Watchface Maker. Everything wrapped in `try/catch`
so a failing sensor can't black-screen the face. Full engineering learnings and
traps in **§3d**; per-element status in **§6**; backlog (background re-render,
battery bar, weather, polish) in **§9**.

**Toolchain:** Zeus CLI (`npm i @zeppos/zeus-cli -g`). No Bip Max simulator model
yet → we develop against the **real watch** via `zeus preview` + QR (§8).

> **Node version:** use **Node 22 LTS** (repo pins it via `.nvmrc` → run
> `nvm use` after `cd`). Confirmed working combo: Node **22.22.2**, npm **10.9.7**,
> Zeus **1.9.2**, zpm **3.4.2**. Odd/non-LTS Node (e.g. 23.x) installs and mostly
> runs but is the less-tested path. **nvm gotcha:** global npm packages are
> per-Node-version — after `nvm use 22` you may need to reinstall the CLI on that
> version (`npm i @zeppos/zeus-cli -g`). There is **no `package.json`** in this
> repo; the `@zos/*` modules come from the Zeus runtime at build time, so there is
> nothing to `npm i` locally (ignore any generic `npm i` step).

---

## 1. What the Garmin watchface actually is (the thing we are cloning)

Source: `/Users/jtorres/Workspaces/pnb/garmin/garmin-simple-watchface-contours`,
branch `shaded`.

The critical design decision on the `shaded` branch is:

> **All the expensive terrain art is rendered offline into ONE background
> bitmap. The watch only draws that bitmap plus a few lightweight foreground
> widgets.**

Concretely, the Garmin face is two layers:

1. **Background layer** — a pre-rendered **454×454 PNG**
   (`resources/drawables/contour_background.png`) showing a topographic contour
   map of Mt. Wilson with hillshade relief. Generated on the computer by
   `render_shaded_contours.py` from a USGS DEM (`data/dem_*.tif`) + GPX contours.
   Two saved variants: `..._light_30px_west.png` and `..._dark_30px_west.png`.
   The watch just does `dc.drawBitmap(0,0,bg)` — no runtime contour math.

2. **Foreground widgets** — drawn on top every update
   (`source/WatchFaceView.mc`, `onUpdate`):
   - **Time** `HH:MM`, large, centered. Hours in **orange `0xFF8800`**, colon +
     minutes white, bold + black outline. (Garmin scales it via a
     `BufferedBitmap`, 1.5× width / 2.0× height.)
   - **Steps** — top-left: a hand-drawn two-shoe icon + step count, gray text
     with black outline. **(Bip Max v1: no icon — an orange "S" label + grey
     number instead. Shoe icon may return in a later version.)**
   - **Day / Date circle** — top-right: dark filled circle (`r=60`) with an
     orange ring; weekday abbreviation (`MO`, `TU`, …) in orange over the date
     number in white.
   - **Battery** — bottom-center: custom battery icon, fill colored
     green `0x00CC44` / yellow / red by level, plus `NN%` text with black
     outline.
   - **AOD (always-on)** — time only, dim gray (`0x666666`), drifting a few px
     each minute to avoid burn-in.

**Palette to carry over:**
- Accent orange: `0xFF8800`
- Contour brown (regular / index): `0x8A6B4D` / `0x4F2B1F`
- Battery: OK `0x00CC44`, mid yellow, low red
- Time/date text: white on the terrain background, black outlines for legibility

That "offline bitmap + cheap foreground" architecture is *exactly* how a good
Zepp OS watchface is structured too, so the port is mostly: (a) re-render the
background at the new size, (b) rebuild the four foreground widgets in Zepp's
JS UI API.

---

## 2. Target device reality check — Bip Max ≠ Epix Pro 2

| | Garmin Epix Pro 2 (51mm) | Amazfit Bip Max |
|---|---|---|
| Shape | **Round** | **Rectangular (portrait)** |
| Resolution | **454 × 454** | **432 × 514** |
| Platform | Connect IQ / **Monkey C** | **Zepp OS / JavaScript** |
| Build tool | `monkeyc` + Connect IQ SDK | **Zeus CLI** |
| Background art | `.png` drawable | image asset in the watchface project |
| Foreground API | `dc.drawText` / `dc.fillCircle` … | `@zos/ui` widgets (`createWidget`) |

Two things drive every layout change below:

1. **Aspect ratio flips from square-round to a taller portrait rectangle.** The
   background must be re-rendered at **432 × 514** (taller than wide), and the
   round `--circle-mask` is dropped (Bip Max is rectangular; at most we round the
   corners). Every foreground X/Y from the Garmin code has to be recomputed for a
   432-wide / 514-tall canvas instead of 454/454.

2. **Language changes from Monkey C to JS.** We don't port `WatchFaceView.mc`
   line-by-line. We re-express its *intent* using Zepp `@zos/ui` widgets and
   `@zos/sensor` data sources.

> ⚠️ **Verify before building (Bip Max is a brand-new 2026 device):**
> - Confirm the Bip Max emulator is downloadable in the Zepp simulator, and get
>   its **`deviceSource`** id + exact screen size from the
>   [Zepp OS device list](https://docs.zepp.com/docs/reference/related-resources/device-list/).
>   If the emulator isn't published yet, develop against the closest rectangular
>   device and do final tuning with `zeus preview` on the real watch.
> - Confirm the Bip Max accepts third-party watchface mini-programs / developer
>   preview (Developer Mode in the Zepp phone app). New Amazfit devices on
>   Zepp OS generally do, but confirm on the physical watch first.

---

## 3. Zepp OS watchface project model (SCAFFOLDED — confirmed facts)

Scaffolded with `zeus create bipmax-contours` (API Level **2.0**, **Empty**
watchface template, platform **Amazfit Bip Max**). It lives at
`watchface/bipmax-contours/` (our git repo root is `watchface/`).

**Confirmed from the generated project:**
- `configVersion`: **v2**, `apiVersion` **2.0.0**
- Bip Max target key: **`432x514-amazfit-bip-max`** → confirms **432 × 514**
- Bip Max `deviceSource`: **`11206915`**, internal name **`PikeW`**
- `designWidth`: **432** (so `px()` ≈ identity; our pixel coords line up)
- Entry: `watchface/index` → `WatchFace({ onInit, build, onDestroy })`
- Auto-assigned local `appId`: **23492** (fine for personal use)
- Asset folder: **`assets/432x514-amazfit-bip-max/`**

Actual project shape:

```
bipmax-contours/
├─ app.json                       # configVersion v2, targets.432x514-amazfit-bip-max
├─ app.js                         # App({ onCreate, onDestroy })
├─ assets/432x514-amazfit-bip-max/
│  ├─ icon.png                    # scaffold launcher icon
│  └─ contour_background.png      # our 432×514 terrain art (copied in ✅)
└─ watchface/
   └─ index.js                    # WatchFace build() — foreground widgets (written ✅)
```

Foreground widgets we'll use (Zepp `@zos/ui` / `@zos/sensor`):
- **Background**: `createWidget(widget.IMG, { x:0, y:0, src: 'contour_background.png' })`

Foreground widgets we'll use (Zepp `@zos/ui` / `@zos/sensor`):
- **Background**: `createWidget(widget.IMG, { x:0, y:0, src: 'contour_background.png' })`
- **Time**: `createWidget(widget.TEXT, …)` bound to time, or `widget.IMG_TIME`
  with digit images for the orange-hours look. Prefer TEXT widgets updated in an
  `onTick`/second callback for the two-color (orange HH / white MM) effect.
- **Steps**: `@zos/sensor` `Step` → orange **"S"** label `TEXT` + grey count
  `TEXT` (v1: no icon)
- **Day / Date**: `@zos/sensor` `Time` → `widget.TEXT`; the dark circle behind it
  can be a `widget.ARC`/`CIRCLE` **or simply baked into the background PNG** (one
  less runtime widget — recommended).
- **Battery**: `@zos/device` battery level → `widget.FILL_RECT` bars or an `ARC`
- **AOD**: configured as a separate AOD layer in the watchface `app.json`
  (dim time only), mirroring the Garmin AOD idea.

**Recommendation:** bake the *static* decorations (the day/date circle ring, any
fixed labels) directly into the background PNG in Python. Keep only the truly
dynamic things (time, steps number, date number, battery fill) as widgets. This
is the Zepp equivalent of the Garmin "one bitmap + cheap foreground" win and
keeps the face fast and battery-friendly.

---

## 3d. Device build learnings (HARD-WON — read before editing `index.js`)

Everything below was discovered by building to the **real Bip Max** via
`zeus preview` (the simulator has no Bip Max model yet). Each item cost a
black-screen or a wasted round-trip. A thrown error anywhere in `WatchFace.build()`
aborts the **entire** face → **black screen** (not a partial render), so defensive
coding matters a lot.

### What works (confirmed on-device)
- **Background**: `createWidget(widget.IMG, { x:0, y:0, src:'contour_background.png' })`
  renders full-bleed. The 432×514 PNG in `assets/432x514-amazfit-bip-max/` is
  bundled + converted to TGA at build (`PNG2TGA` in the build log). ✅
- **A solid `widget.FILL_RECT` first** is a useful diagnostic backdrop — if you
  see the fill but no image, the image is the problem; if you see neither, render
  itself failed.
- **Time** via `@zos/sensor` `Time`: `new Time()`, `getHours()`, `getMinutes()`.
  Two `TEXT` widgets (orange HH right-justified to center + white `:MM` left) give
  the two-color clock. Update with `widget.setProperty(prop.MORE, { text })`. ✅
- **Static widgets**: `TEXT`, `FILL_RECT`, `CIRCLE`, `ARC` all render. ✅
- **Steps** via `@zos/sensor` `Step`: `new Step()` + `getCurrent()` + `onChange()`.
  ✅ — but ONLY after declaring the permission **`data:user.hd.step`** in
  `app.json` (see below). Renders a live count. No permission prompt appeared on
  device; declaring it in `app.json` was enough for the preview build.
- **Day / date** via standard JS **`new Date()`** — `getDay()` (0=Sun weekday)
  and `getDate()` (day of month). ✅ Confirmed working on-device (JS Date is
  available on Zepp OS; the official 3.0 alarm sample uses it). No sensor, no
  permission needed — preferred over the `@zos/sensor` Time date getters.
- **Circle + ring**: `widget.CIRCLE` (`center_x, center_y, radius, color`) + a
  full `widget.ARC` (`x, y, w, h, start_angle:0, end_angle:360, line_width,
  color`) render correctly as the top-right day/date badge. ✅
- **Battery** via `@zos/sensor` `Battery`: `new Battery()` + `getCurrent()`
  (returns 0–100) + `onChange()`. ✅ No permission needed. `setProperty(prop.MORE,
  { text, color })` successfully updates BOTH text and color, so the level colors
  (green/yellow/red) work.
- **Custom bold font** ✅ — the TEXT widget accepts a **`font:` property** pointing
  to a bundled `.ttf` (confirmed in the 2.0 showcase: `font: 'raw/custom.ttf'`).
  We bundled **Anton** (OFL, ultra-bold condensed) at
  `assets/<device>/raw/anton.ttf` and set `font: 'raw/anton.ttf'` on the time.
  This is the RIGHT way to get big/bold numbers — **single draw**, no multi-pass.
  Condensed glyphs also fit more width, so the time can go larger (~210px).
  NOTE: earlier "bold via multi-draw offset copies" was a stopgap and is now
  removed — don't reintroduce it; use a font (or `TEXT_IMG`/`IMG_TIME` digit
  images) instead.

### Permissions
- Health-data sensors need an explicit permission string in `app.json`
  `"permissions"`. The exact strings (from the official showcase app) are
  `data:user.hd.step`, `data:user.hd.heart_rate`, `data:user.hd.calorie`,
  `data:user.hd.distance`, `data:user.hd.spo2`, `data:user.hd.sleep`,
  `data:user.hd.stand`, `data:user.hd.stress`, `data:user.hd.pai`,
  `data:user.hd.fat_burning`, plus `data:os.device.info`. We currently declare
  **`data:user.hd.step`**. Add more here as we wire up new data.

### What does NOT work (and the black-screen traps)
- ❌ **OS replacement tags** (`[HOUR_24_Z]`, `[MIN_Z]`, `[SC]`, `[BATTERY]`, …)
  are a **Watchface-Maker (GUI) feature only**. In a **code** watchface they
  render as **literal text** — they are NOT substituted. → In code you must read
  the sensor and set the text yourself. (This wasted a build: the face showed a
  literal `[HOUR...` string.)
- ✅ **CORRECTION — `@zos/sensor` `Battery` DOES exist** and works
  (`new Battery()`, `getCurrent()`, `onChange()`). My earlier assumption that it
  caused build #1's black screen was **wrong** — build #1 actually crashed on the
  unpermissioned `Step` sensor (both were in that build). Battery needs no
  permission. Lesson: when several risky calls are in one build, don't assume
  which one threw — bisect.
- ❌ **`time.onPerMinute(cb)`** — exists in the API but **did not tick** the time
  on this Bip Max firmware. Replaced with **`setInterval(drawTime, 1000)`**, which
  works (polls each second; ~1s lag on minute rollover is expected). `onPerMinute`
  was wrapped in `try/catch`, so its silent failure just left the time frozen
  after the initial paint — misleading. Lesson: guards hide failures; prefer the
  approach that actually works.
- ✅ **RESOLVED — `@zos/sensor` `Step`**: black-screened build #2 because
  `"permissions": []` had no step permission, so `new Step()` threw. Fixed by
  adding **`data:user.hd.step`** to `app.json`. Still kept fully wrapped in
  `try/catch` as defense. Steps now show a live count. (Left here as the record of
  the trap: a sensor that works in APP samples can still throw in a watchface if
  its permission isn't declared.)

### Rules of thumb going forward
1. Add one element per `zeus preview`, verify on-device, then the next.
2. Wrap every sensor construction + read in `try/catch`; create the UI widget
   *outside* the guard so text still renders if the sensor fails.
3. Don't trust a guarded call that "doesn't crash" — verify it actually updates.
4. Prefer `setInterval` for periodic redraws until an event API is proven.

### Preview/iteration loop that works
```bash
cd bipmax-contours
zeus preview                      # pick 432x514-amazfit-bip-max → fresh QR
# phone: Device → General → Developer Mode → Watch Face → + → Scan
# then tap/raise wrist to wake the watch
```
The QR **expiry is irrelevant** to a black screen — that's always a code crash,
not an expired code. The QR only gates the transfer.

---

## 4. Background image — REUSE the existing render (no Python)

**Decision: we do NOT re-run `render_shaded_contours.py`.** That script only
exists to regenerate contour art from raw elevation data (DEM `.tif` + GPX) —
useful only if we wanted different terrain/hillshade. We don't. The finished,
tuned art already exists as PNGs and we reuse it directly. The only change needed
was **reshaping** the square 454×454 art to the Bip Max's 432×514 portrait — a
one-line image crop, not a re-render.

Done already — staged in `watchface/assets/`:

```
contour_background.png        # active (dark), 432×514
contour_background_dark.png   # dark variant, 432×514
contour_background_light.png  # light variant, 432×514
```

Reshape method used (macOS `sips`): scale the 454² square up to fill 514 height,
then center-crop the sides to 432 wide → full-bleed, ~41px trimmed off each
left/right edge (invisible on abstract contours). Swap dark↔light by copying the
variant over `contour_background.png`. Once the Zepp project is scaffolded and we
know the device folder name, these move into `assets/<bip-max-device>/`.

To redo the reshape from source if ever needed:

```bash
SRC=/Users/jtorres/Workspaces/pnb/garmin/garmin-simple-watchface-contours/resources/drawables
cp "$SRC/contour_background_dark_30px_west.png" watchface/assets/contour_background.png
sips -Z 514 watchface/assets/contour_background.png     # 454² -> 514²
sips -c 514 432 watchface/assets/contour_background.png # center-crop to 432×514
```

---

## 4b. (Archived) Re-rendering from Python — only if terrain content changes

Not needed for this build. Kept for reference in case we ever want a different
location, hillshade angle, or contour interval.

`render_shaded_contours.py` and the source data live in the Garmin repo and are
**plain Python** — they run on macOS unchanged (the `.bat`/`.ps1` wrappers are
Windows-only, but we call Python directly). Inputs already present:

```
garmin-simple-watchface-contours/data/dem_34.2257_-118.0572_r5.00.tif   # elevation grid
garmin-simple-watchface-contours/data/contours_34.2257_-118.0572_r5.gpx # contour lines
render_shaded_contours.py                                               # the renderer
```

### 4.1 One-time Python setup (macOS)

```bash
cd /Users/jtorres/Workspaces/pnb/garmin/garmin-simple-watchface-contours
python3 -m venv .venv
source .venv/bin/activate
pip install requests tifffile matplotlib numpy scipy scikit-image
```

### 4.2 Re-render the background at Bip Max size (432 × 514, no circle mask)

The Garmin render used `--circle-mask` and a 454² canvas. For Bip Max we want a
**432×514 rectangle** and **no circle mask**. Check the renderer for
width/height flags (`python render_shaded_contours.py --help`); if it only takes
one square size, add/confirm `--width 432 --height 514` (or render square at 514
and crop to 432×514). Start from the Garmin `shaded` "dark" recipe, which is the
active look:

```bash
source .venv/bin/activate
python render_shaded_contours.py \
  --width 432 --height 514 \
  --center-lat 34.2257 --center-lon -118.05945 \
  --sun-azimuth 135 --sun-altitude 40 \
  --hillshade-min 95 --hillshade-max 225 --gamma 0.8 --contrast 1.1 \
  --contour-source dem --contour-smoothing 0.8 --contour-interval-feet 100 \
  --out preview/bipmax_contour_dark.png
```

Light variant (paler hillshade, same as Garmin light recipe):

```bash
python render_shaded_contours.py \
  --width 432 --height 514 \
  --center-lat 34.2257 --center-lon -118.05945 \
  --sun-azimuth 135 --sun-altitude 40 \
  --hillshade-min 190 --hillshade-max 255 --gamma 0.65 --contrast 0.9 \
  --contour-source dem --contour-smoothing 0.8 --contour-interval-feet 100 \
  --out preview/bipmax_contour_light.png
```

Contour styling stays the same as Garmin: regular `#8A6B4D`, index `#4F2B1F`,
regular width 1, index width 2, index every 5.

### 4.3 (Optional) bake the day/date ring into the render

If we bake the top-right circle into the background, add it as a Python drawing
step (dark disc + orange ring at the chosen X/Y in the 432×514 frame) before
saving, so the watch only draws the *date text* on top.

### 4.4 Install the chosen render into the watchface

```bash
cp preview/bipmax_contour_dark.png \
   /Users/jtorres/Workspaces/pnb/zepp-apps/watchface/assets/<bip-max-device>/contour_background.png
```

Keep both dark/light PNGs saved (like Garmin does) so we can swap by copying.

---

## 5. Layout recompute (454² round → 432×514 portrait)

Garmin coordinates are for a 454² round face; recompute for 432 wide × 514 tall.
Rough starting map (tune in the simulator):

| Element | Garmin (454²) | Bip Max start (432×514) | Notes |
|---|---|---|---|
| Time center X | 227 | **216** (=432/2) | horizontal center |
| Time center Y | ~185 | **~300** | lower-center reads well on a tall face |
| Steps | x=45, y=28 (top-left) | x≈30, y≈40 | keep top-left, more vertical room |
| Day/Date circle | (350, 87), r=60 | (≈340, ≈95), r≈55 | top-right; consider baking into PNG |
| Battery | center x=227, y=372 | x≈216, y≈460 | bottom-center, pushed down (taller screen) |

Portrait gives more vertical space — spread elements out more than the cramped
round layout. Corners are square (no round clipping), so widgets can sit closer
to the top/bottom edges (respect Zepp's 2px edge safe-area).

---

## 6. Foreground build order + current status (in `watchface/index.js`)

Build one element per `zeus preview` and verify on-device (see §3d). Read the
sensor and set text yourself — **tags do not work in code**.

1. **Solid `FILL_RECT` backdrop** (diagnostic) + **background `IMG`** — first. ✅
2. **Time**: two `TEXT` widgets — orange HH (right→center) + white `:MM`
   (center→right), **Anton bold font** (`font:'raw/anton.ttf'`), ~210px, single
   draw. Read `@zos/sensor` `Time.getHours()/getMinutes()`; redraw with
   **`setInterval(draw, 1000)`** (NOT `onPerMinute` — it didn't tick). Fine-tune
   horizontal position with `TIME_XOFF` in index.js. ✅ DONE + styled.
3. **Steps**: orange "S" `TEXT` + count `TEXT`. `@zos/sensor` `Step` (guarded).
   ✅ DONE — required `data:user.hd.step` permission in `app.json`. TODO: restore
   final styling (currently diagnostic bright-white; Garmin used grey `0xAAAAAA`,
   but verify contrast over terrain).
4. **Day/Date circle**: `CIRCLE` + full `ARC` ring + weekday `TEXT` (orange) +
   date `TEXT` (white), driven by JS **`new Date()`** (`getDay()`/`getDate()`).
   ✅ DONE. (Could still bake the ring into the PNG later to save widgets.)
5. **Battery**: colored `%` (green/yellow/red) via `@zos/sensor` `Battery`
   (guarded). ✅ DONE. TODO: add a battery-shaped bar graph + optional
   time-remaining in days (see §9).
6. **AOD layer** in `app.json`: dim time-only variant. ⏳ NOT STARTED.

**GUI tag table (reference only — NOT usable in code):** the Watchface Maker GUI
exposes replacement tags that do NOT substitute in a code watchface. For the
record, the useful ones are: `[BATT_PER]` battery %, `[SC]` steps, `[HR]`/`[HR_Z]`
heart rate, `[CAL]` calories, `[YEAR]`/`[MON(_Z)]`/`[DAY(_Z)]` date,
`[HOUR_24(_Z)]`/`[MIN(_Z)]`/`[SEC(_Z)]` time, `[WEEK_EN_F]` full weekday
(Wednesday) / `[WEEK_EN_S]` abbreviated (Wed). In code we get the same data from
`@zos/sensor` + `new Date()`.

Match the palette from §1. Zepp text has no built-in outline (unlike the Garmin
`drawOutlined*` helpers); where text sits over busy terrain, either bake a faint
dark plate into the PNG under text zones or put a semi-transparent dark
`FILL_RECT` behind the text.

---

## 7. Full workflow (macOS)

```bash
# --- A. Render the terrain background (once, or when retuning) ---
cd /Users/jtorres/Workspaces/pnb/garmin/garmin-simple-watchface-contours
source .venv/bin/activate
python render_shaded_contours.py --width 432 --height 514 ... --out preview/bipmax_contour_dark.png
cp preview/bipmax_contour_dark.png \
   /Users/jtorres/Workspaces/pnb/zepp-apps/watchface/assets/<bip-max-device>/contour_background.png

# --- B. Watchface project (Zeus CLI) ---
cd /Users/jtorres/Workspaces/pnb/zepp-apps/watchface
nvm use                     # Node 22 LTS (see .nvmrc / §0)
# NOTE: no `npm i` — there's no package.json; @zos/* come from the Zeus runtime
# set app.json: appType watchface, appId, Bip Max platform, designWidth 432

# --- C. Simulator dev loop ---
# start the Zepp simulator app, download the Bip Max emulator (cloud icon)
zeus dev                    # pick Bip Max; live-reloads on save
# (edits to widgets/PNG hot-reload; changes to app.json need Ctrl+C + rerun)

# --- D. Build the installable bundle when happy ---
zeus build                  # produces the .zab in dist/
```

---

## 8. Preview / install onto the real Bip Max (verified flow)

> **Primary path** — the Bip Max simulator model is not published yet, so we
> develop directly against the real watch. Verified against the Zeus CLI docs.
> The **phone scans the terminal QR** (the Bip Max has no camera); the Zepp app
> transfers it to the watch over Bluetooth.

Requirements: watch **paired to the same Zepp account** you log in with, and
**Bluetooth connected**.

1. **Enable Developer Mode (Zepp phone app, one-time):**
   Profile → Settings → About → tap the Zepp logo **7×** until it confirms.
2. **Log in the CLI (one-time):**
   ```bash
   cd /Users/jtorres/Workspaces/pnb/zepp-apps/watchface/bipmax-contours
   zeus login              # Zepp / Open Platform account (may open a browser)
   ```
3. **Build a preview + QR:**
   ```bash
   zeus preview            # choose target: 432x514-amazfit-bip-max
   ```
   A QR code prints in the terminal.
4. **Scan from the Zepp app:** Profile → (Bound Devices, scroll to bottom) →
   **Developer Mode → Scan** → point the phone at the terminal QR. It installs to
   the watch over BT. Set it as the active watchface.
5. **Iterate:** edit `watchface/index.js` (or swap the background PNG) →
   `zeus preview` again → re-scan.

**Simulator path (when a Bip Max — or proxy — model is available):** start the
Zepp OS Simulator, download a device model in its Device Simulator download
manager, open it, then `zeus dev` connects on port 7650 and hot-reloads. The
simulator has **no built-in devices** and won't connect until a Device Simulator
is downloaded and open.

**Personal permanent install (no store):** `zeus build` → `.zab` in `dist/`.
Preview/sideload is enough for personal use; Zepp App Store submission is only
for public distribution and is optional here.

---

## 9. Future versions (backlog)

Not for v1 — captured so we don't lose them.

### 9.1 Fix the background shape (round-art → rectangle) — ✅ DONE

**Problem:** the original background reused the Garmin **circle-masked** round art
(454²). Reshaping it left a **rounded top/bottom** (the curved edge of the masked
circle) that looked wrong on the flat rectangular screen. Zoom/crop couldn't fix
it without ~1.5× upscaling (blurry) and losing terrain.

**Fix (done):** natively **re-rendered** with `render_shaded_contours.py`. The
script is square-only (`--size`), so we render a full square **without**
`--circle-mask` (fully packed terrain, no rounded edges) at 2× supersample, then
downscale + center-crop to 432×514 — sharp, no upscaling.

Exact commands used (macOS, from the Garmin repo):

```bash
cd /Users/jtorres/Workspaces/pnb/garmin/garmin-simple-watchface-contours
# one-time: the .venv existed but was empty
.venv/bin/python -m pip install requests tifffile matplotlib numpy scipy scikit-image

# render a full non-masked square (dark recipe, Mt. Wilson center), 2× supersample
.venv/bin/python render_shaded_contours.py \
  --size 1028 \
  --center-lat 34.2257 --center-lon -118.0572 \
  --sun-azimuth 135 --sun-altitude 40 \
  --hillshade-min 95 --hillshade-max 225 --gamma 0.8 --contrast 1.1 \
  --contour-source dem --contour-smoothing 0.8 --contour-interval-feet 100 \
  --out preview/contour_bipmax_432x514_src.png
# NOTE: no --circle-mask (that flag is what caused the rounded edges)

# downscale + crop to exactly 432×514, keep a dimension-named artifact
cp preview/contour_bipmax_432x514_src.png preview/contour_bipmax_432x514.png
sips -Z 514 preview/contour_bipmax_432x514.png      # 1028² -> 514²
sips -c 514 432 preview/contour_bipmax_432x514.png  # crop to 514h x 432w

# install into the watchface
cp preview/contour_bipmax_432x514.png \
   ../../zepp-apps/watchface/bipmax-contours/assets/432x514-amazfit-bip-max/contour_background.png
```

Center = **Mt. Wilson** (Angeles Crest / San Gabriel range), lat `34.2257`, lon
`-118.0572` (true center; dropped the old `-118.05945` 30px-west composition
tweak). To retune later: `--radius`/`--zoom` = how much area shows;
`--hillshade-min/max`, `--gamma`, `--contrast` = darkness/relief; there's also a
lighter recipe (`--hillshade-min 190 --hillshade-max 255 --gamma 0.65
--contrast 0.9`).

### 9.2 Weather widget  (NEXT UP)

Add a weather readout: **condition symbol + temperature** (maybe hi/lo).

**Symbols via a Nerd Font (font BUNDLED).** Using **Symbols Nerd Font** (Symbols
only). `SymbolsNerdFont-Regular.ttf` is bundled at
`assets/432x514-amazfit-bip-max/raw/symbols.ttf` (~2.4 MB). Use it on a TEXT
widget via `font: 'raw/symbols.ttf'` with the glyph as a `\uXXXX` escape in
`text`. IMPORTANT: this font has **no digits/letters/°**, so temperature numbers
must use a normal font (system or Anton) — only the *icon* uses the symbols font.

**Confirmed weather glyph codepoints** (verified present in the font's cmap; all
228 `nf-weather-*` glyphs exist, range U+E300–U+E3E3):

In code, use the `\uXXXX` escape. Codepoints:

| condition | code | glyph name |
|---|---|---|
| clear / sunny (day) | `\ue30d` | weather-day_sunny |
| clear (night) | `\ue32b` | weather-night_clear |
| cloudy | `\ue312` | weather-cloudy |
| partly cloudy (day) | `\ue302` | weather-day_cloudy |
| partly cloudy (night) | `\ue37e` | weather-night_alt_cloudy |
| rain | `\ue318` | weather-rain |
| showers | `\ue319` | weather-showers |
| snow | `\ue31a` | weather-snow |
| thunderstorm | `\ue31d` | weather-thunderstorm |
| fog | `\ue313` | weather-fog |
| windy | `\ue31e` | weather-windy |
| thermometer | `\ue350` | weather-thermometer |
| degrees | `\ue33e` | weather-degrees |
| celsius / fahrenheit | `\ue339` / `\ue341` | weather-celsius / fahrenheit |

**On-device render: CONFIRMED (works).** The static sun + `72°` test rendered
correctly on the real Bip Max — the Symbols Nerd Font works via
`font: 'raw/symbols.ttf'`. (Test block still in `index.js`; remove it when the
real weather widget lands.)

**Escape caveat (BMP vs supplementary):** JS `'\uXXXX'` only covers codepoints
<= U+FFFF. Many Material-Design Nerd glyphs live ABOVE U+FFFF (e.g. `md-*` at
U+F0xxx/U+F1xxx) and need the ES6 form `'\u{f0dfa}'` or
`String.fromCodePoint(0xf0dfa)`. The weather glyphs (U+E3xx) are all BMP, so
plain `'\uXXXX'` is fine for them.

**Weather DATA source (still to confirm):** likely `@zos/sensor` Weather (a
`getForecast`/current API) — will need the weather **permission** in `app.json`
(candidate string form `data:user.hd.*` / a weather-specific one; confirm from
docs/samples) and possibly an app-side script to fetch/forward. Confirm the exact
API + permission for the Bip Max's Zepp OS version when we build it.

Placement candidate: a row opposite the day/date circle, or bottom near battery.

### 9.5 Reusable symbol font

The Nerd Font symbols `.ttf` (`raw/symbols.ttf`, §9.2, render CONFIRMED) is
reusable for any icon-as-text need — cleaner than PNG icons and single-draw.
Document the exact glyph codepoints we use as we add them.

### 9.6 Steps icon — hiking boot / shoe prints (replace the "S")

User wants the steps "S" replaced with a **hiking boot** or **shoe prints** glyph
from the symbols font. Candidates found in the font's cmap:

| glyph name | code | notes |
|---|---|---|
| `fa-shoe_prints` | `\uee14` | **two shoe prints — recommended** (BMP, simple escape) |
| `fae-footprint` | `\ue241` | single footprint (BMP) |
| `fa-person_hiking` | `\uef02` | hiking *figure* w/ pack (BMP) |
| `md-shoe_print` | `\u{f0dfa}` | single shoe print (supplementary → needs `\u{}`) |
| `md-foot_print` | `\u{f0f52}` | footprints (supplementary) |
| `md-hiking` | `\u{f0d7f}` | hiking figure (supplementary) |
| `md-shoe_sneaker` | `\u{f15c8}` | closest to a "boot" (supplementary) |

No literal *hiking boot* glyph exists in this set. **Recommendation:**
`fa-shoe_prints` (`\uee14`) for a clean two-print steps icon — it's BMP so no
`\u{}` gymnastics. Swap the orange "S" TEXT for a `font:'raw/symbols.ttf'` TEXT
with that glyph; keep the count beside it. Mind the §9.2 BMP-vs-supplementary
escape caveat if we pick an `md-*` option instead.

### 9.3 Battery visual + time-remaining

- **Battery-shaped bar graph**: draw a battery icon (rounded `FILL_RECT` body +
  a small nub) with an inner fill `FILL_RECT` whose **width scales with the
  percentage** and recolors green/yellow/red. Update the fill width in the
  `Battery.onChange`/tick handler. (Confirm `FILL_RECT` width is updatable via
  `setProperty(prop.MORE, { w })`; if not, recreate the fill or use a
  `data_type.BATTERY` `IMG_LEVEL` widget with battery-frame images.)
- **Battery → days remaining**: if Zepp exposes an estimated-runtime API, show
  "~N days". RESEARCH NEEDED — there may be no direct API; fallback is to
  estimate from percentage and a known drain rate, or skip if unavailable.

### 9.4 Polish pass (numbers must POP)

Make the foreground readouts stand out over the busy terrain:
- Steps currently uses diagnostic **white**; pick final colors and make the
  numbers larger / higher-contrast so they "pop."
- Zepp `TEXT` has no built-in outline (unlike Garmin `drawOutlined*`). To pop
  over terrain: bake a faint dark plate into the PNG under each text zone, OR put
  a semi-transparent dark `FILL_RECT`/rounded pill behind the number, OR add a
  manual 1px offset "shadow" by drawing the text twice (dark behind, color on
  top). Apply to time, steps, date, battery.
- Revisit font sizes/positions once the new 432×514 background (§9.1) is in.

---

## 10. Open items

Resolved by scaffolding:
- [x] Bip Max `deviceSource` + resolution → **11206915 (PikeW), 432×514** (§3).
- [x] Bip Max is a first-class Zeus platform ("Amazfit Bip Max").
- [x] `appId` → auto-assigned **23492** (personal use; no console app needed).
- [x] Background reshape → reused existing art at 432×514 (no Python) (§4).

Still open — verify in the simulator (see the reconcile block at the bottom of
`bipmax-contours/watchface/index.js`):
- [ ] `@zos/sensor` `Time` method for weekday (`getDay()` vs `getWeekDay()`) and
      `onPerMinute` existence.
- [ ] `FILL_RECT` width update via `prop.MORE {w}` (else battery = text-only).
- [ ] `WIDGET_DELEGATE` `resume_call` name.
- [x] Bip Max emulator in the Zepp simulator → **not published yet**. Decision:
      develop against the **real watch** via `zeus preview` (§8).
- [ ] Bip Max accepts developer-preview watchfaces (confirm on the physical watch
      during the first `zeus preview`).
- [ ] Decide baked-vs-widget for the day/date circle (baking recommended).

## 11. Source references

- Garmin face we're cloning: `garmin-simple-watchface-contours` @ `shaded`
  (`source/WatchFaceView.mc`, `render_shaded_contours.py`, `data/dem_*.tif`,
  `data/*.gpx`).
- Zepp OS watchface docs:
  <https://docs.zepp.com/docs/guides/tools/watchface/>
- Watchface `app.json` config:
  <https://docs.zepp.com/docs/v2/watchface/app-json/>
- Official samples: <https://github.com/zepp-health/zeppos-samples>
- Zepp OS device list (deviceSource + resolutions):
  <https://docs.zepp.com/docs/reference/related-resources/device-list/>
```

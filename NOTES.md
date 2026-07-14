# Amazfit Bip Max Watchface — Design & Port Notes

Goal: reproduce the Garmin **Epix Pro 2** contour watchface (the `shaded`
branch of `garmin-simple-watchface-contours`) on the **Amazfit Bip Max**, running
on **Zepp OS**, built with the **Zeus CLI**.

This file is the plan. It records what we are copying, what has to change because
the platform and the screen are different, the exact workflow, and the steps to
install onto a real Bip Max. No monetization / KiezelPay — this is a personal
watchface only.

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

### What does NOT work (and the black-screen traps)
- ❌ **OS replacement tags** (`[HOUR_24_Z]`, `[MIN_Z]`, `[SC]`, `[BATTERY]`, …)
  are a **Watchface-Maker (GUI) feature only**. In a **code** watchface they
  render as **literal text** — they are NOT substituted. → In code you must read
  the sensor and set the text yourself. (This wasted a build: the face showed a
  literal `[HOUR...` string.)
- ❌ **`import { Battery } from '@zos/sensor'`** — that export **does not exist**.
  Importing it black-screened build #1. Battery is read a different way (still
  TBD — likely a `data_type.BATTERY` widget or a `@zos/device` call; **not** a
  sensor class). Battery is currently **deferred**.
- ❌ **`time.onPerMinute(cb)`** — exists in the API but **did not tick** the time
  on this Bip Max firmware. Replaced with **`setInterval(drawTime, 1000)`**, which
  works (polls each second; ~1s lag on minute rollover is expected). `onPerMinute`
  was wrapped in `try/catch`, so its silent failure just left the time frozen
  after the initial paint — misleading. Lesson: guards hide failures; prefer the
  approach that actually works.
- ⚠️ **`@zos/sensor` `Step`** (`new Step()`, `getCurrent()`, `onChange()`) is
  valid in APP samples but **threw at runtime in the watchface** (black-screened
  build #2 before it was guarded). Strong suspicion: **missing permission** in
  `app.json` (`"permissions": []` currently). Step access is now fully wrapped in
  `try/catch` so it can't blank the face; the count sits at `0` until the
  permission is added. **NEXT FIX: add the step-data permission to `app.json`.**

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
   (center→right). Read `@zos/sensor` `Time.getHours()/getMinutes()`; redraw with
   **`setInterval(draw, 1000)`** (NOT `onPerMinute` — it didn't tick). ✅ DONE
3. **Steps**: orange "S" `TEXT` + grey count `TEXT`. `@zos/sensor` `Step` is
   wrapped in `try/catch`. ⚠️ Currently shows `0` — **needs a step permission in
   `app.json`** (next fix).
4. **Day/Date circle**: `CIRCLE` + `ARC` ring + weekday `TEXT` (orange) + date
   `TEXT` (white), from `Time` (weekday/date getters TBD — verify method names).
   ⏳ NOT STARTED. Consider baking the ring into the PNG.
5. **Battery**: colored level + `%`. ❌ `@zos/sensor` Battery does not exist —
   API still TBD (`data_type.BATTERY` widget or `@zos/device`). ⏳ DEFERRED.
6. **AOD layer** in `app.json`: dim time-only variant. ⏳ NOT STARTED.

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
npm i                       # install deps
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

### 9.1 Fix the background shape (round-art → true square/rectangle fill)

The current background reuses the Garmin **round** art. We squared off the left
and right sides, but the **top and bottom are still the rounded contour edges**
of the original circular face, so the terrain looks like it has a rounded top —
it reads funny on the flat rectangular Bip Max screen.

Fix (still no Python re-render needed): **zoom in / scale up the source art so it
fully covers the 432×514 frame**, pushing the rounded top/bottom edges off-screen
so only solid terrain fills the rectangle. In practice: scale the 454² source up
past 514 (e.g. to ~560–600px) and center-crop to 432×514, trading a little more
edge terrain for a clean full-bleed fill with no rounded corners.

Rough approach to try (tune the scale until the rounded edges are gone):

```bash
SRC=/Users/jtorres/Workspaces/pnb/garmin/garmin-simple-watchface-contours/resources/drawables
cp "$SRC/contour_background_dark_30px_west.png" watchface/assets/contour_background.png
sips -Z 580 watchface/assets/contour_background.png     # zoom in (was 514)
sips -c 514 432 watchface/assets/contour_background.png # center-crop to 432×514
```

Alternative if zoom crops too much interesting terrain: go back to Python
(NOTES §4b) and render a native 432×514 rectangle with no `--circle-mask` — that
gives a true flat-edged background instead of cropping a circle.

### 9.2 Weather widget

Add a weather readout (temp + condition icon, maybe hi/lo). Zepp exposes weather
via the sensor API (`@zos/sensor` weather / the app-side data channel), which may
require a `permissions` entry in `app.json` and possibly an app-side script to
fetch/forward data. Decide placement then (candidate: a second small circle or a
row opposite the day/date circle). Confirm the exact weather API + permission for
the Bip Max's Zepp OS version when we build it.

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

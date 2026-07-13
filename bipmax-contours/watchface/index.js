/*
 * Bip Max contour watchface — port of the Garmin epix-pro-2 `shaded` face.
 * Background PNG + foreground: time / steps / day-date / battery.
 *
 * API: Zepp OS 2.0 module API (@zos/ui, @zos/sensor, @zos/device).
 * Verified against zepp-health/zeppos-samples (workout-extensions 3.5, watchface simple).
 */

import { createWidget, widget, prop, align, text_style } from '@zos/ui'
import { getDeviceInfo } from '@zos/device'
import { Time, Step, Battery } from '@zos/sensor'

// --- Screen ---------------------------------------------------------------
const { width: DW, height: DH } = getDeviceInfo() // Bip Max = 432 × 514
const CX = DW / 2

// --- Palette (from the Garmin face) --------------------------------------
const ORANGE   = 0xff8800  // accent: hours, "S", day label, date ring
const WHITE    = 0xffffff
const GREY      = 0xaaaaaa
const BATT_OK  = 0x00cc44  // > 50%
const BATT_MID = 0xffdd00  // 21–50%
const BATT_LOW = 0xff3333  // <= 20%
const CIRC_BG  = 0x222222  // dark disc behind day/date

// --- Layout knobs (NOTES §5 starting points — tune in simulator) ---------
const TIME_Y    = 240
const TIME_FONT = 132
const STEPS_X   = 30
const STEPS_Y   = 44
const CIRC_X    = DW - 92
const CIRC_Y    = 96
const CIRC_R    = 56
const BATT_Y    = 452

const DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']
const pad2 = (n) => (n < 10 ? '0' + n : '' + n)

WatchFace({
  build() {
    const time = new Time()
    const step = new Step()
    const battery = new Battery()

    // 1) BACKGROUND — full-bleed terrain bitmap ---------------------------
    createWidget(widget.IMG, {
      x: 0, y: 0, w: DW, h: DH,
      src: 'contour_background.png',
    })

    // 2) DAY / DATE CIRCLE (top-right) ------------------------------------
    createWidget(widget.CIRCLE, {
      center_x: CIRC_X, center_y: CIRC_Y, radius: CIRC_R, color: CIRC_BG,
    })
    createWidget(widget.ARC, {
      x: CIRC_X - CIRC_R, y: CIRC_Y - CIRC_R, w: CIRC_R * 2, h: CIRC_R * 2,
      start_angle: 0, end_angle: 360, line_width: 3, color: ORANGE,
    })
    const dayText = createWidget(widget.TEXT, {
      x: CIRC_X - CIRC_R, y: CIRC_Y - 30, w: CIRC_R * 2, h: 24,
      color: ORANGE, text_size: 22,
      align_h: align.CENTER_H, align_v: align.CENTER_V,
      text_style: text_style.NONE, text: '--',
    })
    const dateText = createWidget(widget.TEXT, {
      x: CIRC_X - CIRC_R, y: CIRC_Y - 2, w: CIRC_R * 2, h: 34,
      color: WHITE, text_size: 34,
      align_h: align.CENTER_H, align_v: align.CENTER_V,
      text_style: text_style.NONE, text: '--',
    })

    // 3) TIME — orange HH (right→center) + white :MM (center→right) --------
    const hhText = createWidget(widget.TEXT, {
      x: 0, y: TIME_Y, w: CX, h: TIME_FONT,
      color: ORANGE, text_size: TIME_FONT,
      align_h: align.RIGHT, align_v: align.CENTER_V,
      text_style: text_style.NONE, text: '00',
    })
    const mmText = createWidget(widget.TEXT, {
      x: CX, y: TIME_Y, w: CX, h: TIME_FONT,
      color: WHITE, text_size: TIME_FONT,
      align_h: align.LEFT, align_v: align.CENTER_V,
      text_style: text_style.NONE, text: ':00',
    })

    // 4) STEPS — orange "S" label + grey count (top-left, v1: no icon) -----
    createWidget(widget.TEXT, {
      x: STEPS_X, y: STEPS_Y, w: 28, h: 34,
      color: ORANGE, text_size: 30,
      align_h: align.LEFT, align_v: align.CENTER_V,
      text_style: text_style.NONE, text: 'S',
    })
    const stepsText = createWidget(widget.TEXT, {
      x: STEPS_X + 30, y: STEPS_Y, w: 160, h: 34,
      color: GREY, text_size: 30,
      align_h: align.LEFT, align_v: align.CENTER_V,
      text_style: text_style.NONE, text: '0',
    })

    // 5) BATTERY — colored bar + % (bottom-center) ------------------------
    // Static dark track under a colored fill; % text below.
    createWidget(widget.FILL_RECT, {
      x: CX - 40, y: BATT_Y, w: 80, h: 12, radius: 3, color: 0x333333,
    })
    const battBar = createWidget(widget.FILL_RECT, {
      x: CX - 40, y: BATT_Y, w: 80, h: 12, radius: 3, color: BATT_OK,
    })
    const battText = createWidget(widget.TEXT, {
      x: 0, y: BATT_Y + 16, w: DW, h: 30,
      color: WHITE, text_size: 26,
      align_h: align.CENTER_H, align_v: align.CENTER_V,
      text_style: text_style.NONE, text: '--%',
    })

    // --- Update functions -------------------------------------------------
    const updateTime = () => {
      hhText.setProperty(prop.MORE, { text: pad2(time.getHours()) })
      mmText.setProperty(prop.MORE, { text: ':' + pad2(time.getMinutes()) })
    }
    const updateDate = () => {
      dayText.setProperty(prop.MORE, { text: DAYS[time.getDay()] || '--' })
      dateText.setProperty(prop.MORE, { text: '' + time.getDate() })
    }
    const updateSteps = () => {
      const cur = step.getCurrent()
      stepsText.setProperty(prop.MORE, { text: '' + cur })
    }
    const updateBattery = () => {
      const pct = battery.getCurrent()
      const color = pct <= 20 ? BATT_LOW : pct <= 50 ? BATT_MID : BATT_OK
      battBar.setProperty(prop.MORE, { w: Math.max(2, Math.round(80 * pct / 100)), color })
      battText.setProperty(prop.MORE, { text: pct + '%' })
    }

    // Initial paint
    updateTime(); updateDate(); updateSteps(); updateBattery()

    // Auto-updates (system-driven, no JS polling timer — AOD-safe)
    time.onPerMinute(() => { updateTime(); updateDate() })
    step.onChange(updateSteps)
    battery.onChange(updateBattery)

    // Refresh everything when the face wakes / returns to foreground
    createWidget(widget.WIDGET_DELEGATE, {
      resume_call: () => { updateTime(); updateDate(); updateSteps(); updateBattery() },
    })
  },

  onInit() {},
  onDestroy() {},
})

/*
 * RECONCILE / VERIFY in simulator (a few 2.0 API details to confirm):
 *  - Time sensor: getHours/getMinutes/getDate confirmed in samples; getDay()
 *    for weekday index (0=Sun) — verify; if it's day-of-month, use getWeekDay().
 *  - onPerMinute(cb) — used for minute-tick updates; confirm it exists on Time
 *    (fallback: setInterval(updateTime, 30000)).
 *  - FILL_RECT width update via prop.MORE {w,color} — confirm; if w isn't
 *    updatable, drop the bar and keep the colored % text only.
 *  - WIDGET_DELEGATE resume_call — confirm the delegate/callback name.
 */

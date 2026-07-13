/*
 * Bip Max contour watchface — foreground widgets
 * Port of the Garmin epix-pro-2 `shaded` face: background PNG + time/steps/date/battery.
 *
 * DRAFT: paste the body of this into the entry file that `zeus create` generates
 * (usually watchface/index.js). Reconcile the 3 placeholders noted at the bottom.
 *
 * Time style: two TEXT widgets — orange HH, white :MM (your choice).
 */

import { createWidget, widget, align, text_style, prop } from '@zos/ui'
import { getDeviceInfo } from '@zos/device'
import { Time, Step, Battery } from '@zos/sensor'

// --- Screen ---------------------------------------------------------------
const { width: DW, height: DH } = getDeviceInfo() // Bip Max ≈ 432 × 514
const CX = DW / 2

// --- Palette (carried over from the Garmin face) --------------------------
const ORANGE   = 0xff8800  // accent: hours, day label, date ring
const WHITE    = 0xffffff
const GREY      = 0xaaaaaa
const BATT_OK  = 0x00cc44  // > 50%
const BATT_MID = 0xffdd00  // 21–50%
const BATT_LOW = 0xff3333  // <= 20%
const CIRC_BG  = 0x222222  // dark disc behind day/date

// --- Layout knobs (starting points from NOTES §5 — tune in simulator) -----
const TIME_Y      = 260     // top of the big time block
const TIME_FONT   = 132     // px; big centered clock
const STEPS_X     = 30
const STEPS_Y     = 40
const CIRC_X      = DW - 92  // top-right circle center X
const CIRC_Y      = 96       // top-right circle center Y
const CIRC_R      = 56
const BATT_Y      = 452      // battery row (bottom)

WatchFace({
  build() {
    // 1) BACKGROUND — full-bleed terrain bitmap ----------------------------
    createWidget(widget.IMG, {
      x: 0, y: 0, w: DW, h: DH,
      src: 'contour_background.png',
    })

    // 2) DAY / DATE CIRCLE (top-right) -------------------------------------
    // Dark disc + orange ring. (Could be baked into the PNG later — NOTES §3.)
    createWidget(widget.CIRCLE, {
      center_x: CIRC_X, center_y: CIRC_Y, radius: CIRC_R, color: CIRC_BG,
    })
    createWidget(widget.ARC, {
      x: CIRC_X - CIRC_R, y: CIRC_Y - CIRC_R,
      w: CIRC_R * 2, h: CIRC_R * 2,
      start_angle: 0, end_angle: 360, line_width: 3, color: ORANGE,
    })
    const dayText = createWidget(widget.TEXT, {
      x: CIRC_X - CIRC_R, y: CIRC_Y - 30, w: CIRC_R * 2, h: 24,
      color: ORANGE, text_size: 22, align_h: align.CENTER_H, align_v: align.CENTER_V,
      text_style: text_style.NONE, text: '--',
    })
    const dateText = createWidget(widget.TEXT, {
      x: CIRC_X - CIRC_R, y: CIRC_Y - 2, w: CIRC_R * 2, h: 34,
      color: WHITE, text_size: 34, align_h: align.CENTER_H, align_v: align.CENTER_V,
      text_style: text_style.NONE, text: '--',
    })

    // 3) TIME — orange HH (right-justified to center) + white :MM ----------
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

    // 4) STEPS — "S" label + count (top-left). v1: no icon, just an S. -------
    createWidget(widget.TEXT, {
      x: STEPS_X, y: STEPS_Y, w: 28, h: 34,
      color: ORANGE, text_size: 30, align_h: align.LEFT, align_v: align.CENTER_V,
      text_style: text_style.NONE, text: 'S',
    })
    const stepsText = createWidget(widget.TEXT, {
      x: STEPS_X + 30, y: STEPS_Y, w: 160, h: 34,
      color: GREY, text_size: 30, align_h: align.LEFT, align_v: align.CENTER_V,
      text_style: text_style.NONE, text: '0',
    })

    // 5) BATTERY — colored bar + % (bottom-center) -------------------------
    const battBar = createWidget(widget.FILL_RECT, {
      x: CX - 40, y: BATT_Y, w: 80, h: 12, radius: 3, color: BATT_OK,
    })
    const battText = createWidget(widget.TEXT, {
      x: 0, y: BATT_Y + 16, w: DW, h: 30,
      color: WHITE, text_size: 26, align_h: align.CENTER_H, align_v: align.CENTER_V,
      text_style: text_style.NONE, text: '--%',
    })

    // --- Data sources + updates ------------------------------------------
    const DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']
    const time = new Time()
    const step = new Step()
    const battery = new Battery()

    const pad2 = (n) => (n < 10 ? '0' + n : '' + n)

    const updateTime = () => {
      hhText.setProperty(prop.TEXT, pad2(time.getHours()))
      mmText.setProperty(prop.TEXT, ':' + pad2(time.getMinutes()))
      dayText.setProperty(prop.TEXT, DAYS[time.getDay()] || '--')
      dateText.setProperty(prop.TEXT, '' + time.getDate())
    }

    const updateSteps = () => {
      const cur = step.getCurrent ? step.getCurrent() : 0
      stepsText.setProperty(prop.TEXT, '' + cur)
    }

    const updateBattery = () => {
      const pct = battery.getCurrent ? battery.getCurrent() : 0
      const color = pct <= 20 ? BATT_LOW : pct <= 50 ? BATT_MID : BATT_OK
      battBar.setProperty(prop.MORE, { w: Math.max(2, Math.round(80 * pct / 100)), color })
      battText.setProperty(prop.TEXT, pct + '%')
    }

    updateTime(); updateSteps(); updateBattery()
    time.onPerMinute(updateTime)
    step.onChange && step.onChange(updateSteps)
    battery.onChange && battery.onChange(updateBattery)
  },

  onInit() {},
  onDestroy() {},
})

/*
 * RECONCILE after `zeus create`:
 *  1. `prop` import — modern @zos/ui exposes `prop` for setProperty; if the
 *     scaffold uses a different accessor (e.g. widget.setProperty style), match it.
 *  2. Time/Step/Battery sensor method names (getHours/getDay/getCurrent/onPerMinute)
 *     vary slightly by Zepp OS apiVersion — confirm against the generated project's
 *     @zos types, then adjust.
 *  3. Asset path 'contour_background.png' must match the device asset folder
 *     the scaffold uses (assets/<device>/...).
 *
 * v1 steps = orange "S" label + grey number, no icon (by design).
 */

/*
 * Background + time (BIG + BOLD via custom font) + steps + day/date circle + battery.
 *
 * Bold done RIGHT: a bundled ultra-bold condensed TTF (Anton, OFL) set via the
 * TEXT `font:` property — single draw, no multi-pass. Condensed glyphs let the
 * numbers go bigger while still fitting the 432px width. Font lives at
 * assets/<device>/raw/anton.ttf, referenced as 'raw/anton.ttf'.
 *
 * Learnings (NOTES §3d): tags don't work in code; onPerMinute didn't tick (use
 * setInterval); Step needs data:user.hd.step; new Date() works; Battery in
 * @zos/sensor works incl. color updates.
 */

import { createWidget, widget, prop, align, text_style } from '@zos/ui'
import { Time, Step, Battery } from '@zos/sensor'

const DW = 432
const DH = 514
const CX = DW / 2

const ORANGE  = 0xff8800
const WHITE   = 0xffffff
const CIRC_BG = 0x222222
const BATT_OK  = 0x00cc44
const BATT_MID = 0xffdd00
const BATT_LOW = 0xff3333

// Time layout
const TIME_XOFF = -15          // nudge ONLY the time digits (negative = left)
const TIME_FONT = 210          // Anton is condensed → can go big; tune to hit the edges
const TIME_Y    = 150
const TIME_H    = 214
const CSPLIT    = 208 + TIME_XOFF  // colon center: HH right-aligns here, :MM left-aligns here
const TIME_FT   = 'raw/anton.ttf'

// Other layout
const STEPS_X = 30
const STEPS_Y = 44
const STEPS_H = 34
const CIRC_X  = DW - 84
const CIRC_Y  = 92
const CIRC_R  = 54
const BATT_Y  = 452

const DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']
const pad2 = (n) => (n < 10 ? '0' + n : '' + n)

WatchFace({
  build() {
    // --- Background ------------------------------------------------------
    createWidget(widget.FILL_RECT, { x: 0, y: 0, w: DW, h: DH, color: 0x101820 })
    createWidget(widget.IMG, { x: 0, y: 0, src: 'contour_background.png' })

    // --- DAY / DATE CIRCLE (top-right) -----------------------------------
    createWidget(widget.CIRCLE, {
      center_x: CIRC_X, center_y: CIRC_Y, radius: CIRC_R, color: CIRC_BG,
    })
    createWidget(widget.ARC, {
      x: CIRC_X - CIRC_R, y: CIRC_Y - CIRC_R, w: CIRC_R * 2, h: CIRC_R * 2,
      start_angle: 0, end_angle: 360, line_width: 3, color: ORANGE,
    })
    const dayText = createWidget(widget.TEXT, {
      x: CIRC_X - CIRC_R, y: CIRC_Y - 32, w: CIRC_R * 2, h: 24,
      color: ORANGE, text_size: 22,
      align_h: align.CENTER_H, align_v: align.CENTER_V,
      text_style: text_style.NONE, text: '--',
    })
    const dateText = createWidget(widget.TEXT, {
      x: CIRC_X - CIRC_R, y: CIRC_Y - 4, w: CIRC_R * 2, h: 38,
      color: WHITE, text_size: 36,
      align_h: align.CENTER_H, align_v: align.CENTER_V,
      text_style: text_style.NONE, text: '--',
    })
    const drawDate = () => {
      try {
        const d = new Date()
        dayText.setProperty(prop.MORE, { text: DAYS[d.getDay()] || '--' })
        dateText.setProperty(prop.MORE, { text: '' + d.getDate() })
      } catch (e) {}
    }
    drawDate()

    // --- TIME: BIG + BOLD via custom font, orange HH + white :MM ---------
    const hh = createWidget(widget.TEXT, {
      x: CSPLIT - 320, y: TIME_Y, w: 320, h: TIME_H,
      color: ORANGE, text_size: TIME_FONT, font: TIME_FT,
      align_h: align.RIGHT, align_v: align.CENTER_V,
      text_style: text_style.NONE, text: '00',
    })
    const mm = createWidget(widget.TEXT, {
      x: CSPLIT, y: TIME_Y, w: 320, h: TIME_H,
      color: WHITE, text_size: TIME_FONT, font: TIME_FT,
      align_h: align.LEFT, align_v: align.CENTER_V,
      text_style: text_style.NONE, text: ':00',
    })
    const time = new Time()
    const drawTime = () => {
      hh.setProperty(prop.MORE, { text: pad2(time.getHours()) })
      mm.setProperty(prop.MORE, { text: ':' + pad2(time.getMinutes()) })
    }
    drawTime()
    try { setInterval(() => { drawTime(); drawDate() }, 1000) } catch (e) {}

    // --- STEPS (diagnostic white for now) --------------------------------
    createWidget(widget.TEXT, {
      x: STEPS_X, y: STEPS_Y, w: 28, h: STEPS_H,
      color: ORANGE, text_size: 30,
      align_h: align.LEFT, align_v: align.CENTER_V,
      text_style: text_style.NONE, text: 'S',
    })
    const stepsText = createWidget(widget.TEXT, {
      x: STEPS_X + 34, y: STEPS_Y, w: 240, h: STEPS_H,
      color: WHITE, text_size: 30,
      align_h: align.LEFT, align_v: align.CENTER_V,
      text_style: text_style.NONE, text: '0',
    })
    try {
      const step = new Step()
      const drawSteps = () => {
        try { stepsText.setProperty(prop.MORE, { text: '' + step.getCurrent() }) } catch (e) {}
      }
      drawSteps()
      try { step.onChange(drawSteps) } catch (e) {}
    } catch (e) {}

    // --- BATTERY: colored % (bottom-center) ------------------------------
    const battText = createWidget(widget.TEXT, {
      x: 0, y: BATT_Y, w: DW, h: 36,
      color: WHITE, text_size: 30,
      align_h: align.CENTER_H, align_v: align.CENTER_V,
      text_style: text_style.NONE, text: '--%',
    })
    try {
      const battery = new Battery()
      const drawBatt = () => {
        try {
          const p = battery.getCurrent()
          const c = p <= 20 ? BATT_LOW : (p <= 50 ? BATT_MID : BATT_OK)
          battText.setProperty(prop.MORE, { text: p + '%', color: c })
        } catch (e) {}
      }
      drawBatt()
      try { battery.onChange(drawBatt) } catch (e) {}
    } catch (e) {}
  },

  onInit() {},
  onDestroy() {},
})

/*
 * Background + time + steps + day/date circle.
 *
 * Learnings (see NOTES §3d):
 *  - OS replacement tags don't work in code watchfaces — read data + set text.
 *  - onPerMinute didn't tick → use setInterval.
 *  - @zos/sensor Battery doesn't exist; Step needs "data:user.hd.step" perm.
 *  - Standard JS `new Date()` WORKS on-device (used in official samples) →
 *    used here for weekday + day-of-month (no sensor / permission needed).
 *
 * Confirmed widget params:
 *  - CIRCLE: center_x, center_y, radius, color
 *  - ARC:    x, y, w, h, start_angle, end_angle, color, line_width
 */

import { createWidget, widget, prop, align, text_style } from '@zos/ui'
import { Time, Step } from '@zos/sensor'

const DW = 432
const DH = 514
const CX = DW / 2

const ORANGE = 0xff8800
const WHITE  = 0xffffff
const CIRC_BG = 0x222222

// Layout
const TIME_Y    = 200
const TIME_H    = 140
const TIME_FONT = 120
const STEPS_X   = 30
const STEPS_Y   = 44
const STEPS_H   = 34
const CIRC_X    = DW - 84   // top-right circle center
const CIRC_Y    = 92
const CIRC_R    = 54

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

    // --- TIME: orange HH + white :MM, centered ---------------------------
    const hh = createWidget(widget.TEXT, {
      x: 0, y: TIME_Y, w: CX, h: TIME_H,
      color: ORANGE, text_size: TIME_FONT,
      align_h: align.RIGHT, align_v: align.CENTER_V,
      text_style: text_style.NONE, text: '00',
    })
    const mm = createWidget(widget.TEXT, {
      x: CX, y: TIME_Y, w: CX, h: TIME_H,
      color: WHITE, text_size: TIME_FONT,
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
  },

  onInit() {},
  onDestroy() {},
})

/*
 * Background + time (ticking via setInterval) + steps (fully guarded).
 *
 * NOTES / learnings:
 *  - OS replacement tags ([HOUR_24_Z]) do NOT work in code watchfaces (GUI-only).
 *    In code we read sensors and set text ourselves.
 *  - onPerMinute() did not tick the time on this device → use setInterval instead
 *    (the pattern the official workout-extension sample uses).
 *  - @zos/sensor Battery does not exist (black-screened build #1).
 *  - The Step sensor threw at runtime (black-screened build #2) — likely a
 *    permission. It is now fully wrapped in try/catch so it can never blank the
 *    face; if steps stays "0" we add the step permission to app.json.
 */

import { createWidget, widget, prop, align, text_style } from '@zos/ui'
import { Time, Step } from '@zos/sensor'

const DW = 432
const DH = 514
const CX = DW / 2

const ORANGE = 0xff8800
const WHITE  = 0xffffff
const GREY   = 0xaaaaaa

// Layout
const TIME_Y    = 200
const TIME_H    = 140
const TIME_FONT = 120
const STEPS_X   = 30
const STEPS_Y   = 44
const STEPS_H   = 34

const pad2 = (n) => (n < 10 ? '0' + n : '' + n)

WatchFace({
  build() {
    // --- Background ------------------------------------------------------
    createWidget(widget.FILL_RECT, { x: 0, y: 0, w: DW, h: DH, color: 0x101820 })
    createWidget(widget.IMG, { x: 0, y: 0, src: 'contour_background.png' })

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
    // Reliable tick in awake mode (checks every second, catches minute rollover).
    try { setInterval(drawTime, 1000) } catch (e) {}

    // --- STEPS: orange "S" + grey count (top-left) -----------------------
    // UI created unconditionally; sensor access fully guarded so a missing
    // permission / unavailable sensor can never blank the face.
    createWidget(widget.TEXT, {
      x: STEPS_X, y: STEPS_Y, w: 28, h: STEPS_H,
      color: ORANGE, text_size: 30,
      align_h: align.LEFT, align_v: align.CENTER_V,
      text_style: text_style.NONE, text: 'S',
    })
    const stepsText = createWidget(widget.TEXT, {
      x: STEPS_X + 30, y: STEPS_Y, w: 180, h: STEPS_H,
      color: GREY, text_size: 30,
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
    } catch (e) {
      // Step sensor unavailable — leave "0"; add permission to app.json if so.
    }
  },

  onInit() {},
  onDestroy() {},
})

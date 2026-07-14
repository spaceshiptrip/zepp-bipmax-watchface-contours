/*
 * Background + time (ticking) + steps DIAGNOSTIC.
 *
 * The steps count is temporarily bright white with sentinel values so the watch
 * tells us what's happening (grey-on-terrain may just be invisible; or the
 * sensor may be failing). Meanings shown in the count slot:
 *   a number  -> steps working
 *   'sErr'    -> new Step() threw (permission missing / not granted)
 *   'gErr'    -> getCurrent() threw
 *   'nil'     -> getCurrent() returned null/undefined
 *   'init'    -> widget rendered but update code never ran
 * Once we know which, we lock it in and restore the grey styling.
 *
 * Learnings: tags don't work in code; onPerMinute didn't tick (use setInterval);
 * @zos/sensor Battery doesn't exist; Step needs "data:user.hd.step" in app.json.
 */

import { createWidget, widget, prop, align, text_style } from '@zos/ui'
import { Time, Step } from '@zos/sensor'

const DW = 432
const DH = 514
const CX = DW / 2

const ORANGE = 0xff8800
const WHITE  = 0xffffff

const TIME_Y    = 200
const TIME_H    = 140
const TIME_FONT = 120
const STEPS_X   = 30
const STEPS_Y   = 44
const STEPS_H   = 34

const pad2 = (n) => (n < 10 ? '0' + n : '' + n)

WatchFace({
  build() {
    // Background
    createWidget(widget.FILL_RECT, { x: 0, y: 0, w: DW, h: DH, color: 0x101820 })
    createWidget(widget.IMG, { x: 0, y: 0, src: 'contour_background.png' })

    // TIME
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
    try { setInterval(drawTime, 1000) } catch (e) {}

    // STEPS (diagnostic: bright white + sentinels)
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
      text_style: text_style.NONE, text: 'init',
    })

    try {
      const step = new Step()
      const drawSteps = () => {
        try {
          const v = step.getCurrent()
          stepsText.setProperty(prop.MORE, {
            text: (v === undefined || v === null) ? 'nil' : ('' + v),
          })
        } catch (e) {
          stepsText.setProperty(prop.MORE, { text: 'gErr' })
        }
      }
      drawSteps()
      try { step.onChange(drawSteps) } catch (e) {}
    } catch (e) {
      stepsText.setProperty(prop.MORE, { text: 'sErr' })
    }
  },

  onInit() {},
  onDestroy() {},
})

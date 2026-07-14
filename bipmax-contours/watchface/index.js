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
const STEPS_X     = 30
const STEPS_Y     = 32
const STEPS_ICON  = 52         // steps icon (symbols font) size
const STEPS_FONT  = 64         // count now uses TIME font (Anton) — bigger
const STEPS_H     = 72
const STEPS_GAP   = 66         // x gap from icon to number (scales with font)
const STEPS_GLYPH = ''   // fa-shoe_prints (two prints)
const CIRC_X  = DW - 84
const CIRC_Y  = 92
const CIRC_R  = 54
const BATT_Y     = 452
const WEATHER_Y  = 400         // weather row sits just above the battery

const DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']
const pad2 = (n) => (n < 10 ? '0' + n : '' + n)

// Faux-bold for symbol-font glyphs. The Symbols Nerd Font is Regular-only (no
// bold variant — unlike the time, which uses the real bold Anton TTF, NOTES §3d),
// so the only way to add weight to an icon glyph is a light 1px overdraw. This is
// the SANCTIONED use of overdraw: glyphs with no bold font only (weather, battery)
// — never for text that has a bold TTF. `.set(props)` updates every layer at once.
const BOLD_OFFS = [[-1, 0], [1, 0], [0, -1], [0, 1], [0, 0]]
const boldIcon = (base) => {
  const layers = []
  for (let i = 0; i < BOLD_OFFS.length; i++) {
    layers.push(createWidget(widget.TEXT, {
      x: base.x + BOLD_OFFS[i][0], y: base.y + BOLD_OFFS[i][1], w: base.w, h: base.h,
      color: base.color, text_size: base.text_size, font: base.font,
      align_h: base.align_h, align_v: base.align_v,
      text_style: text_style.NONE, text: base.text,
    }))
  }
  return {
    set: (props) => { for (let i = 0; i < layers.length; i++) layers[i].setProperty(prop.MORE, props) },
  }
}

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

    // --- STEPS: shoe-prints icon + bold count ----
    // Icon from symbols font (U+EE14), count in Anton time font (bold).
    createWidget(widget.TEXT, {
      x: STEPS_X, y: STEPS_Y, w: 50, h: STEPS_H,
      color: ORANGE, text_size: STEPS_ICON, font: 'raw/symbols.ttf',
      align_h: align.LEFT, align_v: align.CENTER_V,
      text_style: text_style.NONE, text: STEPS_GLYPH,
    })
    const stepsText = createWidget(widget.TEXT, {
      x: STEPS_X + STEPS_GAP, y: STEPS_Y, w: 300, h: STEPS_H,
      color: WHITE, text_size: STEPS_FONT, font: TIME_FT,
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

    // --- BATTERY: icon + colored % (bottom-center) -----------------------
    // Battery icon uses the symbols (Nerd) font; glyph reflects charge level.
    // NOTE: these fa-battery glyphs (U+F24x) are UNVERIFIED on-device — the only
    // confirmed-rendering range so far is the weather glyphs (U+E3xx). Check on
    // the next `zeus preview`; fall back to a FILL_RECT battery (NOTES §9.3) if
    // blank. Charging-state icon is a separate TODO (NOTES §9.7).
    const BATT_ICON_X = 150
    const BATT_PCT_X  = 194
    const battGlyph = (p) =>
      p >= 88 ? '\uf240' :   // fa-battery_full
      p >= 63 ? '\uf241' :   // fa-battery_three_quarters
      p >= 38 ? '\uf242' :   // fa-battery_half
      p >= 13 ? '\uf243' :   // fa-battery_quarter
                '\uf244'     // fa-battery_empty
    const battIcon = boldIcon({
      x: BATT_ICON_X, y: BATT_Y, w: 40, h: 36,
      color: WHITE, text_size: 30, font: 'raw/symbols.ttf',
      align_h: align.CENTER_H, align_v: align.CENTER_V,
      text: '\uf240',
    })
    const battText = createWidget(widget.TEXT, {
      x: BATT_PCT_X, y: BATT_Y, w: 120, h: 36,
      color: WHITE, text_size: 30,
      align_h: align.LEFT, align_v: align.CENTER_V,
      text_style: text_style.NONE, text: '--%',
    })
    try {
      const battery = new Battery()
      const drawBatt = () => {
        try {
          const p = battery.getCurrent()
          const c = p <= 20 ? BATT_LOW : (p <= 50 ? BATT_MID : BATT_OK)
          battText.setProperty(prop.MORE, { text: p + '%', color: c })
          battIcon.set({ text: battGlyph(p), color: c })
        } catch (e) {}
      }
      drawBatt()
      try { battery.onChange(drawBatt) } catch (e) {}
    } catch (e) {}

    // --- WEATHER (TEST: static, verify the Nerd Font symbols render) ------
    // Sits just above the battery (WEATHER_Y). Icon uses the symbols font; temp
    // uses the normal font (symbols font has no digits/°). Static for now — live
    // weather data + permission is NOTES §9.2. Sun + "72°" confirmed rendering.
    boldIcon({
      x: 150, y: WEATHER_Y, w: 56, h: 50,
      color: ORANGE, text_size: 44, font: 'raw/symbols.ttf',
      align_h: align.CENTER_H, align_v: align.CENTER_V,
      text: '\ue30d',   // nf-weather-day_sunny
    })
    createWidget(widget.TEXT, {
      x: 206, y: WEATHER_Y, w: 90, h: 50,
      color: WHITE, text_size: 40,
      align_h: align.LEFT, align_v: align.CENTER_V,
      text_style: text_style.NONE, text: '72°',
    })
  },

  onInit() {},
  onDestroy() {},
})

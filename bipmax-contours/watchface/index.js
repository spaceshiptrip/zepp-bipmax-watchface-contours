/*
 * Background + time (BIG + BOLD via custom font) + steps + day/date circle + battery + weather.
 *
 * Bold done RIGHT: a bundled ultra-bold condensed TTF (Anton, OFL) set via the
 * TEXT `font:` property — single draw, no multi-pass. Condensed glyphs let the
 * numbers go bigger while still fitting the 432px width. Font lives at
 * assets/<device>/raw/anton.ttf, referenced as 'raw/anton.ttf'.
 *
 * Learnings (NOTES §3d): tags don't work in code; onPerMinute didn't tick (use
 * setInterval); Step needs data:user.hd.step; new Date() works; Battery +
 * Weather in @zos/sensor work incl. onChange listeners + color updates.
 */

import { createWidget, widget, prop, align, text_style } from '@zos/ui'
import { Time, Step, Battery, Weather } from '@zos/sensor'

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
const STEPS_Y     = 56         // centered vertically with day/date circle (CIRC_Y = 92)
const STEPS_ICON  = 52         // steps icon (symbols font) size
const STEPS_FONT  = 64         // count now uses TIME font (Anton) — bigger
const STEPS_H     = 72
const STEPS_GAP   = 66         // x gap from icon to number (scales with font)
const CIRC_X  = DW - 84
const CIRC_Y  = 92
const CIRC_R  = 54
const BATT_Y     = 452
const WEATHER_Y  = 400         // weather row sits just above the battery

const DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']
const pad2 = (n) => (n < 10 ? '0' + n : '' + n)

// Map Zepp weather code to Nerd Font weather glyph (NOTES §9.2).
// Codes: 0=cloudy, 3=sunny, 5=rain, 13=fog, 28=clear night, etc.
const weatherGlyph = (code) => {
  if (code === 3) return ''    // sunny (day)
  if (code === 28) return ''   // clear (night)
  if (code === 0 || code === 4) return ''   // cloudy / overcast
  if (code === 13) return ''   // fog
  if (code === 11 || code === 17 || code === 22 || code === 23) return ''  // windy
  if (code === 15 || code === 20) return ''  // thundershower
  if (code === 2 || code === 6 || code === 9 || code === 16) return ''  // snow
  if (code === 1 || code === 27) return ''  // shower
  if ([5, 7, 10, 12, 18, 19, 21, 24].includes(code)) return ''  // rain
  return ''  // fallback: cloudy
}

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

    // --- STEPS: footprint icon (black) + bold count ----
    // Icon from symbols font (U+E241 footprint, proven range), count in Anton time font (bold).
    createWidget(widget.TEXT, {
      x: STEPS_X, y: STEPS_Y, w: 50, h: STEPS_H,
      color: 0x000000, text_size: STEPS_ICON, font: 'raw/symbols.ttf',
      align_h: align.LEFT, align_v: align.CENTER_V,
      text_style: text_style.NONE, text: '\ue241',   // fae-footprint, inlined escape (matches working weather pattern)
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
    const BATT_ICON_X = 150
    const BATT_PCT_X  = 194
    const battGlyph = (p) =>
      p >= 88 ? '' :   // fa-battery_full
      p >= 63 ? '' :   // fa-battery_three_quarters
      p >= 38 ? '' :   // fa-battery_half
      p >= 13 ? '' :   // fa-battery_quarter
                ''     // fa-battery_empty
    const battIcon = boldIcon({
      x: BATT_ICON_X, y: BATT_Y, w: 40, h: 36,
      color: WHITE, text_size: 30, font: 'raw/symbols.ttf',
      align_h: align.CENTER_H, align_v: align.CENTER_V,
      text: '',
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

    // --- WEATHER: live icon + temp (above battery) --------
    // Icon = Nerd Font symbol keyed by weather code; temp in °F/°C from device.
    const weatherIcon = boldIcon({
      x: 150, y: WEATHER_Y, w: 56, h: 50,
      color: ORANGE, text_size: 44, font: 'raw/symbols.ttf',
      align_h: align.CENTER_H, align_v: align.CENTER_V,
      text: '',   // fallback sunny; updated with live code
    })
    const weatherTemp = createWidget(widget.TEXT, {
      x: 206, y: WEATHER_Y, w: 90, h: 50,
      color: WHITE, text_size: 40,
      align_h: align.LEFT, align_v: align.CENTER_V,
      text_style: text_style.NONE, text: '--°',
    })
    try {
      const weather = new Weather()
      const drawWeather = () => {
        try {
          const data = weather.getForecast()
          if (data && data.forecastData && data.forecastData.data && data.forecastData.data[0]) {
            const today = data.forecastData.data[0]
            const code = today.code || 0
            const temp = today.high ? Math.round(today.high) : '--'
            weatherTemp.setProperty(prop.MORE, { text: temp + '°' })
            weatherIcon.set({ text: weatherGlyph(code) })
          }
        } catch (e) {}
      }
      drawWeather()
      try { weather.onChange(drawWeather) } catch (e) {}
    } catch (e) {}
  },

  onInit() {},
  onDestroy() {},
})

let defs = {
  assignDefaults (def) {
    let ret = this.recAssign(def, this.base)
    if (this[def.type]) ret = this.recAssign(def, this[def.type])
    if (ret.color) ret.color = hexToInt(ret.color)
    if (ret.font && ret.font.color) ret.font.color = hexToInt(ret.font.color)
    if (ret.fill) ret.fill = hexToInt(ret.fill)
    if (ret.stroke) ret.stroke = hexToInt(ret.stroke)
    return ret
  },
  recAssign (def = {}, base = {}) {
    let ret = def // Object.assign(def, base, def)
    for (let k in base) {
      if (base[k] instanceof Array) {
        ret[k] = def[k] || base[k]
      } else if (typeof base[k] === 'object' && base[k] !== null) {
        ret[k] = this.recAssign(def[k], base[k])
      } else {
        ret[k] = def[k] || base[k] || null
      }
    }
    return ret
  },
  font: {
    family: 'calibri',
    size: 10,
    style: 'regular', // || 'italics'
    bold: false,
    underline: false,
    color: '#000000'
  },
  base: {
    type: 'textBlock',
    position: [0, 0],
    name: null,
    section: null
  }
}

Object.assign(defs, {
  section: {
    rotate: 0
  },
  grid: {
    stroke: '#000000',
    widths: [],
    heights: []
  },
  image: {
    size: [100, 100],
    scaling: 'stretch' // || 'fit'
  },
  pdf: {
    page: 0
  }, // TODO: Fix and document
  textBlock: {
    font: defs.font,
    decimals: 2, // Auto number formatting
    align: 'left',
    style: 'normal', // || 'checklist'
    lines: 1,
    lineHeight: null,
    checkStyle: {
      mode: 'stroke',
      stroke: '#000000',
      width: 0.5
    }
  },
  textFrame: {
    font: defs.font,
    decimals: 2, // Auto number formatting
    label: 'LABEL',
    width: 100,
    height: null
  },
  textLine: {
    font: defs.font,
    decimals: 2, // Auto number formatting
    lineHeight: null
  },
  box: {
    size: [100, 100],
    mode: 'fill', // || 'stroke' || 'fillAndStroke'
    stroke: '#000000',
    fill: '#ffffff',
    width: 0.5 // Stroke Width
  },
  line: {
    dest: [0, 0],
    stroke: '#000000',
    dash: [1, 0],
    width: 1
  }
})

module.exports = defs

function hexToInt (h) {
  if (typeof h === 'number') return h
  return parseInt(h.slice(1), 16)
}

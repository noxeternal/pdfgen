class LayoutManager {
  constructor (size, layout) {
    this.size = size
    this.layout = this.normalizeLayout(layout)
  }
  normalizeLayout (layout) {
    if (typeof layout === 'string') {
      if (layout === 'postcard') {
        return [
          ['0%', '0%', '50%', '50%'],
          ['50%', '0%', '50%', '50%'],
          ['0%', '50%', '50%', '50%'],
          ['50%', '50%', '50%', '50%']
        ]
      }
      let [, w, h] = layout.match(/^(\d+)(?:x|\*)(\d+)$/i)
      if (w && h) {
        let cw = 100 / w
        let ch = 100 / h
        let cells = []
        for (let y = 0; y < 100; y += ch) {
          for (let x = 0; x < 100; x += cw) {
            cells.push([`${x}%`, `${y}%`, `${cw}%`, `${ch}%`])
          }
        }
        return cells
      }
    }
  }
  get count () {
    return this.layout.length
  }
  getCell (ind) {
    let cell = this.layout[ind]
    let toNum = (v, s) => {
      if (typeof v === 'string') {
        if (v.slice(-1) === '%') {
          return s * (parseInt(v) * 0.01)
        } else return parseInt(v)
      } else if (typeof v === 'number') {
        return v
      }
    }
    return [
      toNum(cell[0], this.size[0]),
      toNum(cell[1], this.size[1]),
      toNum(cell[2], this.size[0]),
      toNum(cell[3], this.size[1])
    ]
  }
}

module.exports = LayoutManager

if (require.main === module) {
  let lm = new LayoutManager([100, 100], process.argv[2] || '2x2')
  console.log(lm)
  console.log(lm.getCell(0))
}

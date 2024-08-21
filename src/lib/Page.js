'use strict'

function mergeObj (base, obj) {
  let ret = {}
  // ret.base = base
  for (let k in base) {
    ret[k] = base[k]
  }
  for (let k in obj) {
    ret[k] = obj[k]
  }
  return ret
}

let _ = { defaults: (obj, base) => mergeObj(base, obj) }

class Page {
  constructor (opts = {}) {
    this.templates = opts.templates || {}
    this.fonts = opts.fonts
    this.ctx = opts.ctx
    this.xobjectForm = opts.xobjectForm
    this.translateStack = []
    this.rotateStack = []
  }

  getResourcesDictionary() {
    return this.xobjectForm.getResourcesDictionary()
  }

  log () {
    if (this.debug) {
      // // console.log.call(console, arguments.callee.caller.name, arguments)
    }
  }

  translate (x, y, func, cb) {
    this.beginTranslate(x, y)
    let lcb = (err, data) => { this.endTranslate(); cb(err, data) }
    func(lcb)
  }

  beginTranslate (x, y) {
    // this.log('beginTranslate', arguments)
    this.translateStack.push([x, y])
    this.ctx.cm(1, 0, 0, 1, x, y)
  }

  endTranslate () {
    // this.log('endTranslate', arguments)
    let [x, y] = this.translateStack.pop()
    this.ctx.cm(1, 0, 0, 1, -x, -y)
  }

  beginRotate (angle) {
    // this.log('beginRotate', arguments)
    this.rotateStack.push(angle)
    let rad = angle * (Math.PI / 180)
    let sin = Math.sin(rad)
    let cos = Math.cos(rad)
    this.ctx.cm(cos, sin, -sin, cos, 0, 0)
  }

  endRotate () {
    // this.log('endRotate', arguments)
    let angle = this.rotateStack.pop()
    let rad = angle * (Math.PI / 180)
    let sin = Math.sin(rad)
    let cos = Math.cos(rad)
    this.ctx.cm(cos, -sin, sin, cos, 0, 0)
  }

  print (text, x, y, opts = {}, res = []) {
    // this.log('print', arguments)
    if (!text) return
    // console.log('print', text, opts)
    let ox = x
    let oy = y
    let pstate = Object.assign({}, opts.font)
    let origState = opts.font // Object.assign({}, pstate)
    let parts = []
    parts = text.replace(/(\/(?!fs))/g, '!!!!!').split('/').map(l => l.replace(/!!!!!/g, '/'))
    if (text[0] === '/') parts = parts.slice(1)
    let rx = 0
    parts = parts.map(p => {
      let img = ''
      let text = p
      if (p.slice(0, 3) === 'fs:') {
        let t = p.split(';')
        let tstate = t[0].split(':').slice(1)
        text = t[1]
        tstate.forEach(s => {
          if (s === 'r') {
            pstate = Object.assign({}, origState)
          } else if (s === 'sup') {
            pstate.super = true
            pstate.family = 'calibri'
          } else if (s === 'b') {
            pstate.bold = true
          } else if (s === 'nb') {
            pstate.bold = false
          } else if (s === 'i') {
            pstate.style = 'italics'
          } else if (s === 'bi' || s === 'ib' || s === 'z') {
            pstate.style = 'italics'
            pstate.bold = true
          } else if (s === 'u') {
            pstate.underline = true
          } else if (s[0] === '#') {
            pstate.color = parseInt(s.slice(1), 16)
          } else if (!isNaN(s)) {
            pstate.size = +s
          } else if (s[0] === '_') {
            img = res.find(r => r.name === s.slice(1))
          } else {
            pstate.family = s.toLowerCase()
          }
        })
      }
      pstate.font = this.fonts[pstate.family]
      if (pstate.super) text = this.toSuper(text)
      let ox = rx
      let w = this.calcWidth(text, pstate)
      if (img) {
        let s = (pstate.size - 5) / img.height
        w += img.width * s
      }
      rx += w
      return {
        text: text,
        x: ox,
        y: 0,
        width: w,
        img,
        font: Object.assign({}, pstate),
        underline: pstate.underline || false
      }
    })

    if (opts.align === 'right') {
      x -= parts.reduce((l, v) => l + v.width, 0)
    }
    if (opts.align === 'center') {
      // this.drawFilledRect(x,y-1,1,pstate.size,0x0000FF)
      // this.drawFilledRect(x-parts.reduce((l,v)=>l+v.width,0) / 2,y-1,1,pstate.size,0x0000FF)
      // this.drawFilledRect(x+parts.reduce((l,v)=>l+v.width,0) / 2,y-1,1,pstate.size,0x0000FF)
      if (opts.width && opts.width !== 0) {
        x += (opts.width / 2) - (parts.reduce((l, v) => l + v.width, 0) / 2)
      } else {
        x -= parts.reduce((l, v) => l + v.width, 0) / 2
      }
    }
    if (opts.align === 'justify') {
      let width = opts.width
      let np = []
      let wc = 0
      let tw = 0
      parts.forEach((part, pi) => {
        let words = part.text.split(' ')
        let rx = tw // part.x
        words.forEach((word, i) => {
          if (!word) {
            return
          }
          let isWord = word.match(/[a-z0-9]/i)
          if (isWord) wc++
          let ox = rx
          let w = this.calcWidth(word, part.font)
          rx += w
          tw += w
          np.push({
            text: word,
            x: ox,
            y: part.y,
            width: w,
            font: part.font,
            underline: part.underline,
            word: isWord
          })
        })
      })
      if (tw > (width * (opts.perc || 0.85))) { // Skip if text is less than 85% of width
        let spacing = (width - tw) / (wc - 1)
        let sc = 0
        for (let i = 0; i < np.length; i++) {
          let part = np[i]
          if (!!i && part.word) sc++
          part.x += spacing * sc
        }
        parts = np
      }
    }
    // this.beginTranslate(x,y)
    parts.forEach(p => {
      let italics = p.font.style === 'italics'
      let bold = p.font.bold
      let style = 'regular'
      if (italics) style = 'italics'
      if (bold) style = 'bold'
      if (italics && bold) style = 'both'
      if (!p.font.font) return
      let fmt = {
        font: p.font.font[style].font,
        color: p.font.color,
        size: p.font.size,
        colorspace: 'rgb'
      }
      // console.log('print part', p.text, x,y,p.x,p.y,Object.assign({}, p.font, { font: null }), fmt)
      if (p.img) {
        let { width, height } = p.img
        let scale = (p.font.size - 5) / height
        let ws = scale
        let hs = scale
        if (p.img.mime === 'image/jpeg' || p.img.mime === 'image/jpg') {
          ws *= width
          hs *= height
        }
        this.ctx
          .q()
          .cm(ws, 0, 0, hs, x + p.x, y + p.y)
          .doXObject(p.img.img)
          .Q()
        p.x += width * scale
      }
      this.ctx.writeText(p.text, x + p.x, y + p.y, fmt)
      // this.drawLine(x + p.x, y + p.y, x + p.x, y + p.y + 4, { color: 0x00FF00 })
      // this.drawLine(x + p.x + p.width - 1, y + p.y, x + p.x + p.width - 1, y + p.y + 4, { color: 0xFF0000 })
      // if (p.word) {
      //   this.drawLine(x + p.x, y + p.y + 4, x + p.x, y + p.y + 8, { color: 0x0000FF })
      //   this.drawLine(x + p.x + p.width - 1, y + p.y + 4, x + p.x + p.width - 1, y + p.y + 8, { color: 0x0000FF })
      // }
      // if (p.nw) {
      //   this.drawLine(x + p.x, y + p.y - 1, x + p.x, y + p.y, { color: 0x0000FF })
      //   this.drawLine(x + p.x + p.width - 1, y + p.y - 1, x + p.x + p.width - 1, y + p.y, { color: 0x0000FF })
      // }
      // this.ctx.writeText(JSON.stringify(p),x+p.x,y+p.y-2,{ font: p.font, size: 0.5 })
      let r = (p.font.color >>> 16) & 0xFF
      let g = (p.font.color >>> 8) & 0xFF
      let b = (p.font.color) & 0xFF
      if (p.underline) {
        let thick = p.font.size * 0.05
        this.ctx
          .q()
          .RG(r / 256, g / 256, b / 256)
          .m(x + p.x, y + p.y - 1 - (thick / 2))
          .l(x + p.x + p.width, y + p.y - 1 - (thick / 2))
          .w(thick)
          .S()
          .Q()
      }
    })
  // this.endTranslate()
  }

  toSuper (txt) {
    let alpha = 'abcdefghijklmnoprstuvwxyz'.split('')
    let str = 'ᵃᵇᶜᵈᵉᶠᵍʰⁱʲᵏˡᵐⁿᵒᵖʳˢᵗᵘᵛʷˣʸᶻ'.split('')
    let out = ''
    for (let i = 0; i < txt.length; i++) {
      let ind = alpha.indexOf(txt[i])
      out += str[ind]
    }
    return out
  }

  invert (text, x, y, w) {
    if (!text) return
    this.drawFilledRect(x, y - 3, w, 15, 0x000000)
    this.print(text, x, y, {
      font: this.fonts.calibrib,
      size: 12,
      colorspace: 'gray',
      color: 0xFF
    }, {
      align: 'center',
      width: w
    })
  }

  debugWidths (text, x, y) {
    var fc = this.fontopt.color
    var xo = 0
    var flip = false
    this.drawFilledRect(x + xo, y - 2, 1, 12, 0xFF0000)
    for (var i = 0; i < text.length; i++) {
      this.fontopt.color = flip ? 0xFFFFFF : 0x000000
      var tw = this.calcWidth(text[i], this.fontopt.size)
      // tw *= 1.15
      // tw+=1.2
      this.drawFilledRect(x + xo, y - 1, tw, 10, flip ? 0xFF0000 : 0x00FF00)
      this.ctx.writeText(text[i], x + xo, y, this.fontopt)
      xo += tw
      // this.drawFilledRect(x+xo,y-2,1,12,0xFF0000)
      flip = !flip
    }
    this.fontopt.color = fc
  }

  drawRectangle (x, y, w, h, o) {
    this.ctx.drawRectangle(x, y, w, h, o)
  }

  drawRect (x, y, w, h, color = 0x000000) {
    this.ctx.drawRectangle(x, y, w, h, {
      type: 'stroke',
      width: 0.5,
      color
    })
  }

  drawFilledRect (x, y, w, h, color = 0xFFFFFF) {
    this.ctx.drawRectangle(x, y, w, h, {
      type: 'fill',
      color
    })
  }

  drawLine (x1, y1, x2, y2, o) {
    var r = (o.stroke >>> 16) & 0xFF
    var g = (o.stroke >>> 8) & 0xFF
    var b = (o.stroke) & 0xFF
    this.ctx
      .q() // Save State
      .RG(r / 256, g / 256, b / 256) // Black Color (RGB)
    if (o.dash) {
      this.ctx.d(o.dash, 0) // width of 3 for dash and space
    }
    this.ctx
      .m(x1, y1) // Start Point
      .l(x2, y2) // Add Point
      .w(o.width || 1) // Line Width
      .S() // Stroke this Path
      .Q() // Restore State
  }

  code39 (v, x, y) {
    if (!v) return
    this.print(v, x, y + 10, {
      font: this.fonts.code39,
      size: 32
    })
  }

  drawFrame (l, v, x, y, w, h, font) {
    let fs = font.size
    if (fs && !h) h = (fs * 1.15)
    if (h && !fs) fs = h / 1.15
    l = l || ''
    v = v || ''
    h = h || 11.5
    fs = fs || (h / 1.15)
    // h = -h

    if (this.template || this.ignoreTemplate) {
      // if(!this.templateCache[hash]){
      var lw = this.calcWidth(l, { family: 'calibri', size: 8 })
      // this.beginTranslate(x,y)
      this.ctx
        .q()
        .G(0)
        .m(x + 2, y + h)
        .l(x + 0, y + h)
        .l(x + 0, y + 0)
        .l(x + w, y + 0)
        .l(x + w, y + h)
        .l(x + lw + 3, y + h)
        .w(0.5)
        .S()
        .Q()
      // this.endTranslate(x,y)
      /* ORIG */
      // this.ctx.drawRectangle(x,y,w,h,{
      //  type: 'stroke',
      //  width: 0.5,
      //  color: 0x000000
      // })
      // this.ctx.drawRectangle(x+2,y+h-1,lw+1,3,{
      //  type: 'fill',
      //  color: 0xFFFFFF
      // })
      /**/
      // console.log('frame', 'label', font)
      this.print(l, x + 2, y + h - 1.5, {
        font: Object.assign({}, font, { size: 8 })
      })
    // }else{
    //  this.addObj(this.templateCache[hash])
    // }
    }
    if (!this.template || this.ignoreTemplate) {
      this.print(v, x, y + (fs * 0.2), {
        font: Object.assign({}, font, {
          size: fs,
          bold: true
        }),
        align: 'center',
        width: w
      })
    }
  }

  drawTextLine (l, v, x, y, w, h, fs) {
    if (fs && !h) h = (fs * 1.15)
    if (h && !fs) fs = h / 1.15
    l = l || ''
    v = v || ''
    h = h || 11.5
    fs = fs || (h / 1.15)
    // h = -h

    if (this.template || this.ignoreTemplate) {
      // if(!this.templateCache[hash]){
      var lw = this.calcWidth(l, 8, 'calibri')
      // this.beginTranslate(x,y)
      this.ctx
        .q()
        .G(0)
        .m(x + 2, y + h)
        .l(x + 0, y + h)
        // .l(x + 0, y + 0)
        // .l(x + w, y + 0)
        // .l(x + w, y + h)
        .m(x + w, y + h)
        .l(x + lw + 3, y + h)
        .w(0.5)
        .S()
        .Q()
      // this.endTranslate(x,y)
      /* ORIG */
      // this.ctx.drawRectangle(x,y,w,h,{
      //  type: 'stroke',
      //  width: 0.5,
      //  color: 0x000000
      // })
      // this.ctx.drawRectangle(x+2,y+h-1,lw+1,3,{
      //  type: 'fill',
      //  color: 0xFFFFFF
      // })
      /**/
      this.print(l, x + 2, y + h - 1.5, _.defaults({ size: 8 }, this.fo.std))
    // }else{
    //  this.addObj(this.templateCache[hash])
    // }
    }
    if (!this.template || this.ignoreTemplate) {
      this.print(v, x, y + (fs * 0.2), this.fo.bold, {
        align: 'center',
        width: w,
        size: fs
      })
    }
  }

  calcWidth (str, font) {
    // console.log('calcWidth', str, font)
    str = str || ''
    let italics = font.style === 'italics'
    let bold = font.bold
    let style = 'regular'
    if (italics) style = 'italics'
    if (bold) style = 'bold'
    if (italics && bold) style = 'both'
    if (!font.font) font.font = this.fonts[font.family]
    this.fontWidthCache = this.fontWidthCache || {}
    // let widths = this.fonts[font.name]
    let cacheKey = `${font}${font.size}_${str}`
    if (!this.fontWidthCache[cacheKey]) {
      let widths = font.font[style].widths
      let w = 0
      for (let i = 0; i < str.length; i++) {
        w += widths[str.charCodeAt(i)] || 0
      }
      this.fontWidthCache[cacheKey] = (w / 1000) * font.size
    }
    // console.log(str,font.size,font,this.fontWidthCache[cacheKey])
    return this.fontWidthCache[cacheKey]
  }

  imb (code, x, y) {
    let textOptions = {
      font: this.fonts.imb,
      size: 16,
      colorspace: 'gray',
      color: 0x00
    }
    let xo = 0
    y += 10
    for (let i = 0; i < code.length; i++) {
      this.ctx.writeText(code[i], x + xo, y, textOptions)
      xo += 3
    }
  }
  qr (data, x, y) {
    if (!data) return
    var dim = data.dim
    var scale = (87 / dim)
    const qrdata = Buffer.from(data.data, 'base64')
    this.ctx.q()
    this.ctx.cm(scale, 0, 0, scale, x, y)
    for (var i = 0; i < qrdata.length; i += 2) {
      this.ctx.re(qrdata[i], dim - qrdata[i + 1], 1, 1)
    }
    this.ctx.F().Q()
  }

  addObj (obj) {
    this.ctx
      .doXObject(obj)
  }
}
module.exports = Page

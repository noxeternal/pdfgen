const Promise = require('bluebird')
const { EventEmitter } = require('events')
const fs = require('fs')
const path = require('path')
const hummus = require('hummus')
const LayoutManager = require('./LayoutManager')
const DataDef = require('./DataDef')
const Page = require('./Page')
const ErrorDef = require('../include/error')

Promise.promisifyAll(fs)

const DEFAULTS = {
  basePath: process.cwd(),
  pageSize: [612, 792],
  layoutMode: '1x1',
  outputFilename: 'output.pdf'
}

class LayoutGen extends EventEmitter {
  constructor (opts = {}) {
    super()
    this.opts = Object.assign({}, DEFAULTS, opts)
    this.resCache = new Map()
  }

  async loadJob (path) {
    this.opts.basePath = path
    let config = JSON.parse(await fs.readFileAsync(this.path('config.json')))
    this.opts = Object.assign(this.opts, config)
  }

  async start () {
    this.outputStream = this.opts.outputStream || fs.createWriteStream(this.path(this.opts.outputFilename))
    this.pdfWriter = hummus.createWriter(new hummus.PDFStreamForResponse(this.outputStream))
    this.layoutManager = new LayoutManager(this.opts.pageSize, this.opts.layoutMode)

    if (this.opts.font) {
      const defaults = require('./defaults')
      defaults.font = Object.assign(defaults.font, this.opts.font)
    }

    await this.loadFonts()
    this.opts.layouts.push({
      name: 'pdfgenError',
      template: 'pdfgenErrorDef'
    })
    this.opts.definitions.pdfgenErrorDef = JSON.parse(JSON.stringify(ErrorDef))
    this.layouts = await Promise.resolve(this.opts.layouts).map(async l => {
      let lpath = l.template
      l.defs = new DataDef(lpath, this.opts.definitions)
      l.fixed = l.defs.df.fixed
      let df = l.defs
      df.width = df.df.width || this.opts.pageSize[0]
      df.height = df.df.height || this.opts.pageSize[1]
      if (df.df.resources) {
        await Promise.resolve(df.df.resources).map(async r => {
          if (typeof r.src === 'string') {
            if (r.src.match(/^data/)) {
              let ind = r.src.indexOf(',')
              let [, type] = r.src.slice(0, ind).match(/^data:(.+?);base64/)
              let data = Buffer.from(r.src.slice(ind), 'base64')
              r.mime = type
              r.src = this.streamFromBuffer(data)
            } else {
              if (!r.src.includes('/')) r.src = this.path(r.src)
              let mimes = {
                jpg: 'image/jpg',
                jpeg: 'image/jpg',
                png: 'image/png'
              }
              r.mime = mimes[path.extname(r.src).slice(1)] || 'unknown'
              await fs.accessAsync(r.src)
            }
          } else {
            return r
          }
          if (r.type === 'pdf') {
            if (this.resCache.has(r.src)) {
              r.pdf = this.resCache.get(r.src)
            } else {
              r.pdf = this.pdfWriter.createFormXObjectsFromPDF(r.src)
              this.resCache.set(r.src, r.pdf)
            }
          }
          if (r.type === 'image') {
            switch (r.mime) {
              case 'image/png':
                r.img = this.pdfWriter.createFormXObjectFromPNG(r.src)
                break
              case 'image/jpg':
              case 'image/jpeg':
                r.img = this.pdfWriter.createImageXObjectFromJPG(r.src)
                break
              default:
                throw new Error(`Image format not supported. ${r.mime}`)
            }
          }
        }).all()
      }
      if (l.fixed) {
        l.xobj = this.createTemplate(l)
      }
      return l
    }).all()
  }

  async end () {
    this.pdfWriter.end()
  }

  streamFromBuffer (data) {
    return {
      pos: 0,
      data,
      read (amt) {
        let ret = this.data.slice(this.pos, this.pos + amt)
        this.pos += amt
        return Array.from(ret)
      },
      notEnded () {
        return this.pos < this.data.length
      },
      setPosition (pos) {
        this.pos = pos
      },
      setPositionFromEnd (pos) {
        this.pos = this.data.length - pos
      },
      skip (amt) {
        this.pos += amt
      },
      getCurrentPosition () {
        return this.pos
      }
    }
  }

  createTemplate (layout, data = {}) {
    let { width, height } = layout.defs
    let xobjectForm = this.pdfWriter.createFormXObject(0, -1, width, height)
    let ctx = xobjectForm.getContentContext()
    let tpage = new Page({
      ctx: ctx,
      fonts: this.fonts,
      xobjectForm
    })
    try {
      layout.defs.process(tpage, data)
      this.pdfWriter.endFormXObject(xobjectForm)
    } catch (e) {
      this.pdfWriter.endFormXObject(xobjectForm)
      throw e
    }
    return xobjectForm
  }

  path (pth) {
    if (this.opts.resolvePath) {
      return this.opts.resolvePath(pth)
    }
    return path.resolve(this.opts.basePath, pth)
  }

  async loadFontFile (name, file) {
    const exists = await fs.accessAsync(file).then(() => true).catch(err => err && false)
    if (!exists) {
      throw new Error(`Cannot load font ${name}, file not accessible ${file}`)
    }
    const font = this.pdfWriter.getFontForFile(file)
    let widths
    try {
      let data = await fs.readFileAsync(`${file}.widths.json`, 'utf8')
      widths = JSON.parse(data)
    } catch (e) {
      console.log(`Calculating widths for ${name} ${file}`)
      widths = this.calcWidths(font)
      fs.writeFile(`${file}.widths.json`, JSON.stringify(widths))
    }
    return { name, font, widths }
  }

  calcWidths (font) {
    const arr = []
    for (var i = 0; i < 256; i++) {
      arr.push(String.fromCharCode(i))
    }
    const spread = 100
    return arr
      .map(v => v.repeat(spread))
      .map(v => font.calculateTextDimensions(v, 1000).width / spread)
  }

  async loadFont (name, fonts) {
    name = name.toLowerCase()
    let [ regular, bold, italics, both ] = await Promise.resolve(fonts).map(file => this.loadFontFile(name, file)).all()
    return {
      name,
      regular,
      bold,
      italics,
      both
    }
  }

  async loadFonts () {
    function lfont (file) {
      return path.resolve(__dirname, `../../fonts/${file}`)
    }

    this.fonts = {
      arial: await this.loadFont('arial', ['arial.ttf', 'arialbd.ttf'].map(lfont)),
      calibri: await this.loadFont('calibri', ['CALIBRI.TTF', 'CALIBRIB.TTF', 'CALIBRII.TTF', 'CALIBRIZ.TTF'].map(lfont)),
      times: await this.loadFont('times', ['times.ttf', 'timesbd.ttf', 'timesi.ttf', 'timesbi.ttf'].map(lfont)),
      code39: await this.loadFont('code39', ['FREE3OF9.TTF'].map(lfont)),
      code128: await this.loadFont('code128', ['code128.ttf'].map(lfont)),
      imb: await this.loadFont('imb', ['USPSIMBStandard.otf'].map(lfont))
    }

    if (this.opts.fonts) {
      return Promise.resolve(this.opts.fonts)
        .map(async ({name, files}) => {
          name = name.toLowerCase()
          this.fonts[name] = await this.loadFont(name, files.map(f => this.path(f)))
        })
    }
  }

  async renderRecord (data) {
    if (!data) return console.log('No data', data)
    let basedata = data
    this.baseCache = this.baseCache || this.layouts.filter(l => !!l.fixed)
    let pages = []

    let loopCnt = this.layoutManager.count
    for (let loopc = 0; loopc < loopCnt; loopc++) {
      if (loopCnt > 1) data = basedata[loopc]
      if (!data) continue
      this.layouts
        .forEach(l => {
          let pg = l.page || 1
          while (pages.length < pg) pages.push([])
          pg--
          let basexos = pages[pg]
          if (basexos.length - 1 < loopc) basexos.push([])
          if (!l.fixed && !data[l.name]) return
          try {
            if (l.array) {
              if (!data[l.name].length) return
              let gdef = null
              this.baseCache.forEach(b => {
                let def = b.defs.getGroup(l.defs.df.group)
                if (def) gdef = def
              })
              if (gdef) {
                let layouts = {
                  linear: function () {
                    let [x, y] = gdef.position
                    let h = l.defs.df.height
                    let w = l.defs.df.width
                    let sy = gdef.position[1] + gdef.size[1]
                    if (l.direction === 'horizontal') {
                      return {
                        getX (i) { return x + (i * w) },
                        getY (i) { return y }
                      }
                    } else {
                      return {
                        getX (i) { return x },
                        getY (i) { return sy - ((i + 1) * h) }
                      }
                    }
                  },
                  auto: function () {
                    let x = gdef.position[0]
                    let h = l.defs.df.height
                    let sy = gdef.position[1] + gdef.size[1]
                    let oy = gdef.size[1] / data[l.name].length
                    return {
                      getX (i) { return x },
                      getY (i) { return sy - (i * oy) - h }
                    }
                  },
                  grid: function () {
                    let rows = l.rows || 1
                    let columns = l.columns || 1
                    let x = gdef.position[0]
                    let sy = gdef.position[1] + gdef.size[1]
                    let w = gdef.size[0] / columns
                    let h = gdef.size[1] / rows
                    sy -= h
                    let calcs
                    // x = sy = 0
                    if (l.direction === 'horizontal') {
                      calcs = {
                        getX (i) { return i % columns },
                        getY (i) { return (i - this.getX(i)) / columns }
                      }
                    } else {
                      calcs = {
                        getX (i) { return (i - this.getY(i)) / rows },
                        getY (i) { return i % rows }
                      }
                    }
                    return {
                      getX (i) { return x + (calcs.getX(i) * w) },
                      getY (i) { return sy - (calcs.getY(i) * h) }
                    }
                  }
                }
                l.positioning = l.positioning || 'linear'
                if (!layouts[l.positioning]) throw new Error(`Invalid layout positioning '${l.positioning}'`)
                l.layoutPos = new layouts[l.positioning]()

                data[l.name].forEach((d, i) => {
                  if (d === false) return
                  let xo = this.createTemplate(l, d)
                  xo.x = l.layoutPos.getX(i)
                  xo.y = l.layoutPos.getY(i)
                  xo.width = l.defs.df.width || 1
                  xo.height = (l.defs.df.height || 1)
                  basexos[basexos.length - 1].push(xo)
                })
              } else {
                throw new Error(`Group not found ${l.defs.df.group}`)
              }
            } else {
              let xo = l.xobj || this.createTemplate(l, data[l.name])
              xo.x = 0
              xo.y = -1
              xo.width = l.defs.df.width || 1
              xo.height = l.defs.df.height || 1
              basexos[basexos.length - 1].push(xo)
            }
          } catch (err) {
            // throw err

            console.log('ErrCatch', err)
            let data = {
              stack: err.stack.split('\n')
            }
            let l = this.layouts.find(l => l.name === 'pdfgenError')
            let xo = this.createTemplate(l, data)
            xo.x = 0
            xo.y = -1
            xo.width = l.defs.df.width || 1
            xo.height = l.defs.df.height || 1
            basexos[basexos.length - 1].push(xo)
          }
        })
    }
    pages.forEach(basexos => {
      let [pw, ph] = this.opts.pageSize
      let width = pw
      let height = ph
      let pdfpage = this.pdfWriter.createPage(0, 0, width, height)
      let ctx = this.pdfWriter.startPageContentContext(pdfpage)

      let page = new Page({
        ctx: ctx,
        fonts: this.fonts
      })

      basexos.forEach((xos, ind) => {
        let [x, y] = this.layoutManager.getCell(ind)
        page.beginTranslate(x, y)
        xos.forEach(xo => {
          let xom = pdfpage.getResourcesDictionary().addFormXObjectMapping(xo.id)
          page.beginTranslate(xo.x || 0, xo.y || 0)
          page.addObj(xom)
          page.endTranslate()
        })
        page.endTranslate()
      })
      this.pdfWriter.writePage(pdfpage)
    })
  }
}

module.exports = LayoutGen

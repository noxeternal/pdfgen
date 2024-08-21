/* jshint node: true */
'use strict'

const defaults = require('./defaults')

function mergeDefs (base, obj) {
  var ret = []
  base.forEach(d => ret.push(d))
  obj.forEach(o => {
    var ob = {}
    var bind = ret.findIndex(d => d.fullName === o.fullName)
    if (bind !== -1) { ob = ret.splice(bind, 1)[0] }
    var b = defaults.recAssign(o, ob)
    ret.splice(bind, 0, b)
  })
  return ret
}

function preprocessDefs (defs) {
  for (let i = 0; i < defs.length; i++) {
    let def = defs[i]
    if (!def.name) throw new Error(`Definition name is REQUIRED definition #${i} type ${def.type}`)
    def.fullName = def.section ? def.section + '.' + def.name : def.name
  }
}

class Node {
  constructor (df, def) {
    this.df = df
    this.def = def || { type: 'section', root: true }
    this.children = []
  }

  addChild (child) {
    this.children.push(child)
  }

  process (page, data = {}) {
    if (!this.compiled) {
      let ret = this.compile()
      // console.log(ret)
      ret = new Function('page', 'data', 'df', ret) // eslint-disable-line no-new-func
      this.compiled = ret
    }
    if (!this.emptyFields) {
      this.emptyFields = {}
      this.df.df.definitions.forEach(def => {
        if (def.field) {
          this.emptyFields[def.field] = null
        }
      })
    }
    let recdata = Object.assign({}, this.emptyFields, this.df.df.data, data)
    this.compiled(page, recdata, this.df)
    // let def = this.def
    // if (def.type === 'section') {
    //   const [x, y] = def.position || [0, 0]
    //   page.beginTranslate(x, y)
    //   this.children.forEach(c => c.process(page, data))
    //   page.endTranslate()
    // } else {
    //   let ldata = recdata[def.field] || null
    //   if (ldata === false) return
    //   if (this.df[def.type]) this.df[def.type](page, def, ldata)
    //   page.drawRect(def.position[0], def.position[1], 10, 10, 0xFF0000)
    // }
  }

  compile (root = false) {
    let def = this.def
    let ret = ''
    if (def.type === 'section' && this.children.length) {
      let { position: [ x, y ] = [ 0, 0 ], rotate } = def // eslint-disable-line
      ret += `page.beginTranslate(${x},${y});`
      if (rotate) {
        ret += `page.beginRotate(${rotate});`
      }
      ret += this.children.map(c => c.compile()).join('')
      if (rotate) {
        ret += `page.endRotate();`
      }
      ret += `page.endTranslate();`
    } else {
      if (this.df[def.type]) {
        let ind = this.df.df.definitions.indexOf(def)
        ret += `data['${def.field}'] === false || df.${def.type}(page, df.df.definitions[${ind}], data['${def.field}'] || (data['${def.field}'] === 0 ? 0 : null));`
      }
    }
    return ret
  }
}

class DataDef {
  constructor (file, files = {}) {
    this.df = this.loadDatafile(file, files)
    this.ensureSections()
    this.font = Object.assign({
      family: 'calibri',
      size: 10,
      style: 'normal', // || 'italics'
      bold: false,
      underline: false,
      color: '#000000'
    }, this.df.font || {})
  }

  loadDatafile (file, files = {}) {
    let dataFile
    try {
      dataFile = files[file]
      if (!dataFile) {
        throw new Error(`Definition missing ${file}`)
      }
    } catch (e) {
      console.log('Definition parse failed')
      console.log('File:', file)
      let m = e.message.match(/position (\d+)/)
      if (m) {
        let off = parseInt(m[1])
        let lines = dataFile.split('\n')
        let line = 0
        let char = off - lines.length
        while (lines[line] && char > lines[line].length) {
          // console.log(lines[line].length,lines[line],line,char)
          char -= lines[line].length
          line++
        }
        let arrow = '&nbsp;'.repeat(char) + '^'
        console.log('-2', lines[line - 2])
        console.log('-1', lines[line - 1])
        console.log(' 0', lines[line])
        console.log('+1', lines[line + 1])
        console.log('+2', lines[line + 2])
        console.log(arrow)
        console.log(`pos: ${line + 1}:${char}`)
      }
      console.error(e)
      throw e
    }
    dataFile.definitions = dataFile.definitions || []
    preprocessDefs(dataFile.definitions)
    if (dataFile.base) {
      var base = this.loadDatafile(dataFile.base, files)
      preprocessDefs(base.definitions)
      dataFile.definitions = mergeDefs(base.definitions, dataFile.definitions)
      dataFile.resources = [...base.resources, ...dataFile.resources || []]
      dataFile.data = Object.assign({}, base.data, dataFile.data || {})
      dataFile.fixed = dataFile.fixed || base.fixed || false
      dataFile.width = dataFile.width || base.width || false
      dataFile.height = dataFile.height || base.height || false
      delete dataFile.base
    }
    dataFile.definitions.forEach(def => defaults.assignDefaults(def))
    dataFile.data = dataFile.data || {}
    dataFile.resources = dataFile.resources || []
    dataFile.data.hide = false
    dataFile.data.hidden = false
    return dataFile
  }

  buildTree () {
    var groupNodes = {
      '': new Node(this)
    }
    var defs = this.df.definitions.slice()
    defs.forEach(d => {
      d.section = d.section || ''
      d.zindex = d.zindex || 0
    })
    defs.forEach(d => {
      var node = new Node(this, d)
      if (!groupNodes[d.section]) throw new Error(`Section ${d.section} doesn't exist! ${JSON.stringify(d)}`)
      groupNodes[d.section].addChild(node)
      if (d.type === 'section') {
        groupNodes[d.fullName] = node
      }
    })
    this.tree = groupNodes['']
    return groupNodes['']
  }

  process (page, data) {
    data = data || {}
    if (!this.tree) this.buildTree()
    this.tree.process(page, data)
    return
    // console.log('process',data,this.df.data,datacol)
    this.df.definitions.forEach(def => {
      var ldata = null
      if (typeof this.df.data[def.field] !== 'undefined') {
        ldata = this.df.data[def.field]
      }
      if (typeof data[def.field] !== 'undefined') {
        ldata = data[def.field]
      }
      // console.log(def.fullName,ldata)
      this.renderItem(page, def, ldata)
    })
  }

  ensureSections () {
    const defs = this.df.definitions
    defs.forEach(def => {
      const name = def.fullName
      if (def.type !== 'section' && !!~name.indexOf('.')) {
        this.ensureSection(name.slice(0, name.lastIndexOf('.')))
        def.section = name.slice(0, name.lastIndexOf('.'))
      }
    })
  }

  ensureSection (fullname) {
    if (!fullname) return
    const defs = this.df.definitions
    const ind = fullname.lastIndexOf('.')
    const name = fullname.slice(ind + 1)
    let parent = fullname.slice(0, ind)
    if (ind === -1) parent = null
    if (parent) this.ensureSection(parent)
    const sec = defs.find(d => d.fullName === fullname && d.type === 'section')
    if (sec) return
    defs.push({
      type: 'section',
      position: [0, 0],
      name: name,
      fullName: (parent ? parent + '.' : '') + name,
      section: parent || ''
    })
  }

  renderItem (page, def, data) {
    if (def.type === 'section' && !def.size) return
    if (def.section) this.section(page, this.getDef(def.section), 1)
    if (this[def.type]) this[def.type](page, def, data)
    if (def.section) this.section(page, this.getDef(def.section), 2)
  }

  getDef (name) {
    return this.df.definitions.find(d => d.fullName === name && d.type !== 'group')
  }

  getGroup (name) {
    return this.df.definitions.find(d => d.fullName === name && d.type === 'group')
  }

  section (page, def, data) {
    if (typeof def === 'string') {
      def = this.getDef(def)
    }
    if (!def.position) def.position = [0, 0]
    if (!def) def = { position: [0, 0] }
    if (data === 1) {
      if (def.section) this.section(page, def.section, 1)
      page.beginTranslate(def.position[0], def.position[1])
      if (def.rotate) page.beginRotate(def.rotate)
    }
    if (data === 2) {
      if (def.rotate) page.endRotate(def.rotate)
      page.endTranslate()
      if (def.section) this.section(page, def.section, 2)
    }
  }

  image (page, def, data) {
    var img = this.df.resources.find(r => r.type === 'image' && r.name === def.image)
    if (!img) throw new Error(`Img ${def.image} not found!`)
    let [w, h] = def.size || []
    let { width, height } = img
    let ws = w / width
    let hs = h / height
    if (def.scaling === 'fit') {
      let scale = Math.min(ws, hs)
      ws = hs = scale
    }
    if (img.mime === 'image/jpeg' || img.mime === 'image/jpg') {
      ws *= width
      hs *= height
    }
    if (def.noscale) {
      ws = img.width
      hs = img.height
    }
    console.log(def.name, img.width, img.height, w, h, ws, hs)
    page.beginTranslate(def.position[0], def.position[1])
    page.ctx
      .q()
      .cm(ws, 0, 0, hs, 0, 0)
      .doXObject(img.img)
      .Q()
    page.endTranslate()
  }

  pdf (page, def, data) {
    const pdf = this.df.resources.find(r => r.type === 'pdf' && r.name === def.pdf)
    page.beginTranslate(def.position[0], def.position[1])
    def.page = def.page || 0
    const xo = page.getResourcesDictionary().addFormXObjectMapping(pdf.pdf[def.page])
    // console.log(typeof pdf.pdf[0])
    page.ctx
      .q()
      .doXObject(xo)
      // .doXObject(pdf.pdf[pdf.page])
      .Q()
    page.endTranslate()
  }

  stringNormalize (def, data, arr = true) {
    if (data instanceof Array) {
      if (arr) {
        return data.map(v => this.stringNormalize(def, v, false))
      } else {
        data = data[0]
      }
    }
    if (data === null) data = ''
    if (typeof data === 'number') data = data.toFixed(def.decimals)
    return arr ? [data] : data
  }

  textFrame (page, def, data) {
    if (typeof data === 'undefined') return
    if (data === false) return
    data = this.stringNormalize(def, data, false)
    if (data instanceof Array) data = data[0]

    const it = page.ignoreTemplate
    page.ignoreTemplate = true
    page.drawFrame(def.label, data, def.position[0], def.position[1], def.width, def.height, def.font)
    page.ignoreTemplate = it
  }

  textLine (page, def, data) {
    if (typeof data === 'undefined') return
    if (data === false) return
    data = this.stringNormalize(def, data, false)

    const it = page.ignoreTemplate
    page.ignoreTemplate = true
    page.drawTextLine(def.label, data, def.position[0], def.position[1], def.width, def.height, def.font)
    page.ignoreTemplate = it
  }

  textBlock (page, def, data) {
    if (typeof data === 'undefined') return
    if (data === false) return
    data = this.stringNormalize(def, data, true)

    const checklist = def.style === 'checklist'
    def.lineHeight = def.lineHeight || def.font.size
    let x = checklist ? 10 : 0
    let y = (def.lines - 1) * def.lineHeight
    page.beginTranslate(...def.position)
    data.forEach(line => {
      page.print(line, x, y, def, this.df.resources)
      if (checklist) {
        page.drawRectangle(0, y, 7, 7, def.rectStyle)
      }
      y -= def.lineHeight
    })
    page.endTranslate()
  }

  box (page, def, data) {
    if (data === false) return
    if (def.mode === 'fill' || def.mode === 'fillAndStroke') {
      page.drawRectangle(def.position[0], def.position[1], def.size[0], def.size[1], {
        type: 'fill',
        color: def.fill
      })
    }
    if (def.mode === 'stroke' || def.mode === 'fillAndStroke') {
      page.drawRectangle(def.position[0], def.position[1], def.size[0], def.size[1], {
        type: 'stroke',
        color: def.stroke,
        width: def.width
      })
    }
  }

  line (page, def, data) {
    let [x1, y1] = def.position
    let [x2, y2] = def.dest
    page.drawLine(x1, y1, x2, y2, def)
  }

  grid (page, def, data) {
    let height = def.heights.reduce((l, c) => l + c)
    let width = def.widths.reduce((l, c) => l + c)
    let x = 0
    let y = 0
    let r = ((def.stroke >>> 16) & 0xFF) / 256
    let g = ((def.stroke >>> 8) & 0xFF) / 256
    let b = ((def.stroke) & 0xFF) / 256
    page.beginTranslate(def.position[0], def.position[1])
    page.ctx
      .q()
      .RG(r, g, b)
      .w(def.width || 1)
    def.heights.forEach((h, yi) => {
      let firsty = yi === 0
      if (firsty) {
        page.ctx
          .m(x, y)
          .l(width, y)
          .S()
      }
      y += h
      page.ctx
        .m(x, y)
        .l(width, y)
        .S()
    })
    def.widths.forEach((w, xi) => {
      let firstx = xi === 0
      if (firstx) {
        page.ctx
          .m(x, 0)
          .l(x, height)
          .S()
      }
      x += w
      page.ctx
        .m(x, 0)
        .l(x, height)
        .S()
    })
    page.ctx
      .Q()
    page.endTranslate()
  }

  qr (page, def, data) {
    page.qr(data, def.position[0], def.position[1])
  }
}
module.exports = DataDef

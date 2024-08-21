#!/usr/bin/env node
const http = require('http')
const path = require('path')

const { LayoutGen } = require('../')

let server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url.match(/favicon/)) {
    return res.end()
  }
  if (req.method !== 'POST') {
    res.write('<h1>Not Found</h1>')
    return res.end('404')
  }
  let buf = []
  req.on('data', d => buf.push(d))
  req.on('end', () => {
    let data = Buffer.concat(buf).toString()
    try {
      data = JSON.parse(data)
      res.setHeader('content-type', 'application/pdf')
      Promise.resolve([data.config, data.records])
        .then(([config, records]) => run(config, records, res))
        .then(() => res.end())
        .catch(async err => {
          console.error('ERR', err)
          let ended = false
          let time = setTimeout(() => {
            ended = true
            res.end()
          }, 2000)
          await error(err, res)
          if (!ended) {
            clearTimeout(time)
            res.end()
          }
        })
    } catch (e) {
      res.write(JSON.stringify({ error: 'Failed to parse JSON' }))
      res.end(500)
    }
  })
})

async function run (config, records, res) {
  if (typeof config === 'string') {
    config = JSON.parse(fs.readFileSync(config))
  }
  if (typeof records === 'string') {
    records = JSON.parse(fs.readFileSync(records))
  }
  config.resolvePath = (pth) => path.resolve(pth)
  config.outputStream = res
  const lg = new LayoutGen(config)
  console.log('start')
  await lg.start()
  for (let i = 0; i < records.length; i++) {
    await lg.renderRecord(records[i])
  }
  console.log('end')
  await lg.end()
}

async function error (err, res) {
  await run({
    layouts: [{ name: 'error', template: 'error' }],
    pageSize: [600, 400],
    layoutMode: '1x1',
    definitions: {
      error: {
        width: 600,
        height: 400,
        definitions: [{
          type: 'textBlock',
          name: 'header',
          position: [300, 380],
          field: 'header',
          align: 'center',
          font: {
            size: 24,
            color: '#FF0000'
          }
        },
        {
          type: 'textBlock',
          name: 'error',
          position: [5, 360],
          font: {
            size: 10,
            color: '#FF0000'
          },
          field: 'stack'
        }],
        data: {
          header: 'Error',
          stack: err.stack.split('\n')
        }
      }
    }
  }, [{ error: {} }], res)
  res.end()
}

server.listen(process.env.PORT || 8080, () => {
  console.log(`Listening on ${process.env.PORT || 8080}`)
})

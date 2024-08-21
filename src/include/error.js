module.exports = {
  width: 800,
  height: 800,
  definitions: [{
    type: 'textBlock',
    name: 'header',
    position: [200, 380],
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
    stack: []
  }
}

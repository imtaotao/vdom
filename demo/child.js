import Component from '../src'

export default class child extends Component {
  constructor (props) {
    super(props, ['prop'])
    this.state = {
      show: true,
      name: '我是 child 组件'
    }
  }

  isShow (e) {
    this.setState({name: false})

    setTimeout(() => {
      this.setState({name: '我是 child 组件'})
    }, 2000)
  }

  template () {
    return `
      <div @click="this.isShow.bind(this)">
        {{ name }} -- {{this.props.prop}}
      </div>
    `
  }

  componnet () { }
}
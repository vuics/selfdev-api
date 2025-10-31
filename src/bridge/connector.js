import { log, warn, error, Verbose } from '../services.js'
// import '../mongo.js'
import conf from '../conf.js'
// import { extractAndParseJson } from '../utils/helper.js'

const verbose = Verbose('sd:bridge/connector'); verbose('')

export default class Connector {
  constructor ({ bridge }) {
    this.bridge = bridge
    verbose('Connector constructed')
  }

  async start () {
    verbose('Connector started')
  }

  async stop () {
    verbose('Connector stopped')
  }
}


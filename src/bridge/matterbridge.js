import { log, warn, error, Verbose } from '../services.js'
import Connector from './connector.js'
// import '../mongo.js'
import conf from '../conf.js'
// import { extractAndParseJson } from '../utils/helper.js'

const verbose = Verbose('sd:bridge/matterbridge'); verbose('')

export default class Matterbridge extends Connector {
  constructor (args) {
    super(args)
    // const { bridge } = args
    verbose('Connector constructed')
  }

  async start () {
    super.start()
    verbose('Connector started')
  }

  async stop () {
    super.stop()
    verbose('Connector stopped')
  }
}


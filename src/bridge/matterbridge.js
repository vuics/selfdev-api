import { spawn } from 'child_process'

import { log, warn, error, Verbose } from '../services.js'
import Connector from './connector.js'
import conf from '../conf.js'

const verbose = Verbose('sd:bridge/matterbridge'); verbose('')

export default class Matterbridge extends Connector {
  constructor (args) {
    super(args)
    // const { bridge } = args
    verbose('Matterbridge constructed')
  }

  async start () {
    super.start()
    verbose('Matterbridge started')
    try {

    } catch (err) {
      error('Error starting Matterbridge:', err)
    }

    const command = '/bin/matterbridge';
    const args = ['-conf', '/etc/matterbridge/matterbridge.toml'];

    this.matterbridge = spawn(command, args, { stdio: 'inherit' });

    // Handle errors
    this.matterbridge.on('error', (err) => {
      console.error('Failed to start matterbridge:', err);
    });

    // Handle exit
    this.matterbridge.on('exit', (code, signal) => {
      if (code !== null) {
        console.log(`Matterbridge exited with code ${code}`);
      } else {
        console.log(`Matterbridge was killed by signal ${signal}`);
      }
    });
  }

  async stop () {
    super.stop()
    verbose('Matterbridge stopped')

    if (!this.matterbridge.killed) {
      this.matterbridge.kill('SIGTERM'); // or 'SIGINT' depending on graceful shutdown
      console.log('Sent SIGTERM to Matterbridge');
    } else {
      console.log('Matterbridge is already stopped');
    }
  }
}


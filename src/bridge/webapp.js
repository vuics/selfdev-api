import path from 'path'
import { randomUUID } from 'crypto'
import { spawn } from 'child_process'
import fs from 'fs'
import { createProxyMiddleware } from "http-proxy-middleware";

import { log, warn, error, Verbose } from '../services.js'
import Connector from './connector.js'
import XmppAgent from '../swarm/xmpp-agent.js'
import conf from '../conf.js'
import webServer from './web-server.js'

const verbose = Verbose('sd:bridge/webapp'); verbose('')

// Example webapp call with curl:
//   curl -X POST http://localhost:6370/wh/679b3c9a6e26f022ca69515b/webapp/post \
//     -H "Content-Type: application/json" \
//     -d '{"key":"value", "key2": "value222" }'

export default class Webapp extends Connector {
  constructor(args) {
    super(args);
    verbose('Webapp constructed');

    this.xmppAgent = new XmppAgent({
      agent: {
        options: {
          name: this.bridge.options.name,
          joinRooms: [this.bridge.options.joinRoom],
        },
        userId: this.bridge.userId,
      },
      handleChat: this.bridge.options.enablePersonal,
      handleRooms: this.bridge.options.enableRoom,
    });

    this.path = null
  }

  async start() {
    super.start();
    verbose('Webapp started');

    try {
      const dirname = `/opt/webapp-bridges/${this.bridge.options.name}/`
      verbose('dirname:', dirname)
      if (!fs.existsSync(dirname)) {
        fs.mkdirSync(dirname, { recursive: true })
      }
      verbose('dirname created:', dirname)

      const devDirname = path.join(dirname, '.lowdefy/dev')
      verbose('devDirname:', devDirname)
      if (!fs.existsSync(devDirname)) {
        fs.mkdirSync(devDirname, { recursive: true })
      }
      verbose('dirname created:', devDirname)

      const filename = path.join(dirname, 'lowdefy.yaml')
      verbose('lowdefyYaml:', this.bridge.options.webapp.lowdefyYaml)
      await fs.promises.writeFile(filename, this.bridge.options.webapp.lowdefyYaml, 'utf-8');
      verbose('file is written:', filename)


      this.collectLogs = true
      this.logs = '';

      // FIXME: use dynamic ports
      // const command = 'pnpx lowdefy@4 dev --port 3001';
      const command = 'pnpx'
      const args = [
        'lowdefy', 'dev',
        '--port', '3001',
        '--config-directory', dirname,
        '--log-level', 'info',
        '--no-open',
        '--disable-telemetry',
      ];
      // verbose('process.env:', process.env)
      const opts = {
        shell: true,
        cwd: dirname,
        env: {
          // ...process.env,        // inherit parent env vars
          NODE_ENV: 'production',
          // NODE_ENV: 'development',
          PATH: process.env.PATH,
          PNPM_HOME: process.env.PNPM_HOME,
        },
        // stdio: 'inherit'
      }
      verbose('command:', command, ', args:', args, ', opts:', opts)
      this.lowdefy = spawn(command, args, opts);

      setTimeout(async () => {
        await this.saveLogs()
        this.collectLogs = false
      }, 300_000)

      // Handle errors
      this.lowdefy.on('error', (err) => {
        error('Failed to start lowdefy:', err);
      });
      // Handle exit
      this.lowdefy.on('exit', async (code, signal) => {
        if (code !== null) {
          log(`Lowdefy exited with code ${code}`);
        } else {
          log(`Lowdefy was killed by signal ${signal}`);
        }
        await this.saveLogs()
      });
      // Capture stdout
      this.lowdefy.stdout.on('data', (data) => {
        if (this.collectLogs) {
          const text = data.toString();
          this.logs += text;
          console.log('stdout:', text); // optional: still print to console
        }
      });
      // Capture stderr
      this.lowdefy.stderr.on('data', (data) => {
        if (this.collectLogs) {
          const text = data.toString();
          this.logs += text;
          console.error('stderr:', text); // optional: still print to console
        }
      });


      await webServer.start();

      this.path = path.join(
        '/wa/' + this.bridge.userId._id.toString(),
        this.bridge.options.webapp.endpoint
      );
      verbose('path:', this.path);

      const proxyOptions = {
        target: "http://localhost:3001",
        changeOrigin: true,
        logLevel: "debug",
        router: {
          [`http://localhost:6370/${this.path}`]: "http://localhost:3001",
          'http://localhost:6370/_next': "http://localhost:3001/_next",
        },
        // pathFilter: [this.path, '/_next', '/api', '/icon.svg', '/manifest.webmanifest', '/.well-known' ]
      };

      // Main route
      webServer.app.use(this.path, createProxyMiddleware(proxyOptions));
      webServer.app.use('/', createProxyMiddleware(proxyOptions));

      // /icon.svg
      // /api/root
      // /manifest.webmanifest


      await this.xmppAgent.start();

      this.xmppAgent.chat = async ({ prompt } = {}) => {
        verbose('XMPP chat received:', prompt);
        try {

        } catch (err) {
          error('Failed to handle XMPP message:', prompt, err);
        }
        return '';
      };
    } catch (err) {
      error('Error starting Webapp:', err);
    }
  }

  async stop() {
    super.stop();

    // FIXME:
    // webServer.removeProxy({
    //   host: this.path,
    // })

    if (!this.lowdefy.killed) {
      this.lowdefy.kill('SIGTERM'); // or 'SIGINT' depending on graceful shutdown
      log('Sent SIGTERM to Lowdefy');
    } else {
      log('Lowdefy is already stopped');
    }

    // NOTE: Keep the server running since it might be used by other bridges
    // webServer.stop();

    this.xmppAgent.stop();
    verbose('Webapp stopped');
  }
}

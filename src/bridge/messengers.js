import { spawn } from 'child_process'
import nunjucks from 'nunjucks'
import fs from 'fs/promises'

import { log, warn, error, Verbose } from '../services.js'
import Connector from './connector.js'
import Bridge from '../models/bridge.js'
import conf from '../conf.js'

const verbose = Verbose('sd:bridge/messengers'); verbose('')


const matterbridgeTemplate = `
[general]
RemoteNickFormat = "{{ general.RemoteNickFormat | default('[{PROTOCOL}] <{NICK}> ') }}"
{% if general.MediaServerUpload %}MediaServerUpload = "{{ general.MediaServerUpload }}"{% endif %}
{% if general.MediaServerDownload %}MediaServerDownload = "{{ general.MediaServerDownload }}"{% endif %}

{% for proto in protocols %}
# =====================================================
# Protocol: {{ proto.type | upper }}
# =====================================================
{% for acc in proto.accounts %}
[{{ proto.type }}.{{ acc.name }}]
{% if acc.server %}Server = "{{ acc.server }}"{% endif %}
{% if acc.token %}Token = "{{ acc.token }}"{% endif %}
{% if acc.username %}Nick = "{{ acc.username }}"{% endif %}
{% if acc.password %}Password = "{{ acc.password }}"{% endif %}
{% if acc.channel %}Channel = "{{ acc.channel }}"{% endif %}
PrefixMessagesWithNick = {{ acc.prefixMessagesWithNick | default(true) | string }}
UseTLS = {{ acc.useTLS | default(true) | string }}
{% endfor %}
{% endfor %}

{% for gw in gateways %}
# =====================================================
# Gateway: {{ gw.name }}
# =====================================================
[[gateway]]
name = "{{ gw.name }}"
enable = {{ gw.enable | default(true) | string }}
{% for io in gw.inout %}
  [[gateway.inout]]
  account = "{{ io.account }}"
  channel = "{{ io.channel }}"
  direction = "{{ io.direction | default('inout') }}"
{% endfor %}
{% endfor %}
`

async function generateMatterbridgeToml({ filename, messengers }) {
  try {
    verbose('matterbridgeTemplate:', matterbridgeTemplate)
    verbose('messengers:', messengers)
    const renderedToml = nunjucks.renderString(matterbridgeTemplate, messengers);
    const compactToml = renderedToml.replace(/^\s*$/gm, '');  // Remove all empty lines
    verbose('compactToml:', compactToml)

    await fs.writeFile(filename, renderedToml, 'utf-8');
    log('Config generated successfully:', filename);
  } catch (err) {
    error('Error generating TOML:', err);
  }
}

export default class Messengers extends Connector {
  constructor (args) {
    super(args)
    // const { bridge } = args
    verbose('Messengers constructed')
  }

  async start () {
    super.start()
    verbose('Messengers started')
    try {

    } catch (err) {
      error('Error starting Messengers:', err)
    }

    const filename = '/etc/matterbridge/matterbridge.toml'
    await generateMatterbridgeToml({
      filename,
      messengers: this.bridge.options.messengers,
    });

    const command = '/bin/matterbridge';
    const args = ['-conf', filename];
    let logs = '';

    this.matterbridge = spawn(command, args, {
      // stdio: 'inherit'
    });
    // Handle errors
    this.matterbridge.on('error', (err) => {
      error('Failed to start matterbridge:', err);
    });
    // Handle exit
    this.matterbridge.on('exit', async (code, signal) => {
      if (code !== null) {
        log(`Matterbridge exited with code ${code}`);
      } else {
        log(`Matterbridge was killed by signal ${signal}`);
      }
      const bridgeDoc = await Bridge.findById(this.bridge._id)
      if (bridgeDoc) {
        bridgeDoc.logs = logs
        await bridgeDoc.save()
        verbose('bridgeDoc:', bridgeDoc)
        verbose('bridgeDoc.logs:', bridgeDoc.logs)
      }
    });
    // Capture stdout
    this.matterbridge.stdout.on('data', (data) => {
      const text = data.toString();
      logs += text;
      console.log('stdout:', text); // optional: still print to console
    });
    // Capture stderr
    this.matterbridge.stderr.on('data', (data) => {
      const text = data.toString();
      logs += text;
      console.error('stderr:', text); // optional: still print to console
    });
  }

  async stop () {
    super.stop()
    verbose('Messengers stopped')

    if (!this.matterbridge.killed) {
      this.matterbridge.kill('SIGTERM'); // or 'SIGINT' depending on graceful shutdown
      log('Sent SIGTERM to Matterbridge');
    } else {
      log('Matterbridge is already stopped');
    }
  }
}


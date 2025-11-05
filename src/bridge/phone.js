import modesl from 'modesl'
import fsExtra from 'fs-extra'
import path from 'path'
import dotenv from 'dotenv'
import fs from 'fs'
import os from 'os'
import { exec } from 'node:child_process'
import { client, xml } from '@xmpp/client'
import FormData from 'form-data';
import axios from 'axios';
import { randomUUID } from 'crypto'

import { log, warn, error, Verbose } from '../services.js'
import Connector from './connector.js'
import Bridge from '../models/bridge.js'
import XmppAgent from '../swarm/xmpp-agent.js'
import conf from '../conf.js'

const verbose = Verbose('sd:bridge/phone'); verbose('')

// Allow insecure certificates (without showing warning)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';


// Make sure the directory exists
try {
  fsExtra.ensureDirSync(conf.phone.recordingsDir);
  log(`Recordings directory ensured at: ${conf.phone.recordingsDir}`);
} catch (error) {
  error(`Failed to create recordings directory: ${error.message}`);
  process.exit(1);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default class Phone extends Connector {
  constructor (args) {
    super(args)
    // const { bridge } = args
    verbose('Phone constructed')

    this.xmppAgent = new XmppAgent({
      agent: {
        options: {
          name: this.bridge.options.name,
          joinRooms: [this.bridge.options.phone.joinRoom],
        },
        userId: this.bridge.userId,
      },
      handleChat: this.bridge.options.phone.enablePersonal,
      handleRooms: this.bridge.options.phone.enableRoom,
    })

    // TODO: move to parent class
    // this.logs = ''
    // this.collectLogs = true
  }

  // TODO: move to parent class
  // async saveLogs () {
  //   try {
  //     const bridgeDoc = await Bridge.findById(this.bridge._id)
  //     if (bridgeDoc) {
  //       bridgeDoc.logs = this.logs
  //       await bridgeDoc.save()
  //       log('Logs saved for bridge:', this.bridge._id, ":", this.bridge.options.name)
  //       // verbose('bridgeDoc:', bridgeDoc)
  //       // verbose('bridgeDoc.logs:', bridgeDoc.logs)
  //     }
  //   } catch (err) {
  //     error('Error saving logs:', err)
  //   }
  // }

  async start () {
    super.start()
    verbose('Phone started')
    try {
      this.freeswitchOnline = false;
      this.parkUuid = null
      this.sendSmsCmdPrefix = null

      // Create a FreeSWITCH connection
      log(`Connecting to FreeSwitch on ${conf.freeswitch.host}:${conf.freeswitch.port}`);
      // verbose('conf.freeswitch.password:', conf.freeswitch.password)
      this.conn = new modesl.Connection(conf.freeswitch.host, conf.freeswitch.port, conf.freeswitch.password, () => {
        log('Connected to FreeSWITCH');
        this.freeswitchOnline = true;

        // Subscribe to all events
        this.conn.subscribe(['ALL'], () => {
          log('Subscribed to FreeSWITCH events');
        });

        // Set up event handler for inbound calls
        this.conn.on('esl::event::CHANNEL_ANSWER::*', async (event) => {
          log('even handler for inbound calls, event:', event)
          await handleCall(event);
        });

      });

      // Handle connection errors
      this.conn.on('error', (error) => {
        error('FreeSWITCH connection error:', error);
      });

      this.conn.on('esl::connect', () => {
        log('ESL connected');
      });

      this.conn.on('esl::event::*::*', (event) => {
        // verbose('event:', event)
        const eventName = event.getHeader('Event-Name');
        log(`Event name received: ${eventName}`);
        // log('event:', JSON.stringify(event))

        // For CUSTOM events, show the subclass
        if (eventName === 'CUSTOM') {
          log(`  Subclass: ${event.getHeader('Event-Subclass')}`);
        }

        // For call-related events, show more details
        if (['CHANNEL_CREATE', 'CHANNEL_ANSWER', 'CHANNEL_EXECUTE', 'CHANNEL_HANGUP',
             'CHANNEL_DESTROY', 'DTMF'].includes(eventName)) {
          log(`  UUID: ${event.getHeader('Unique-ID')}`);
          log(`  From: ${event.getHeader('Caller-Caller-ID-Number') || 'unknown'}`);
          log(`  To: ${event.getHeader('Caller-Destination-Number') || 'unknown'}`);
          log(`  Direction: ${event.getHeader('Call-Direction') || 'unknown'}`);
        }
      });

      this.conn.on('esl::event::CHANNEL_CREATE::*', (event) => {
        const uuid = event.getHeader('Unique-ID');
        const caller = event.getHeader('Caller-Caller-ID-Number');
        const callee = event.getHeader('Caller-Destination-Number');
        log(`New call detected: ${caller} → ${callee} (UUID: ${uuid})`);

        if (callee && callee === 'voicemail') {
          log('Voicemail call detected');

          // FIXME: the callee is hardcodded, make a setting
        } else if (callee && callee === '450905') {
          log('Inbound 450905@VoIP.ms call detected');
        }
      });

      this.conn.on('esl::event::CHANNEL_PARK::*', async (event) => {
        log('--------------PARK--------------')
        const uuid = event.getHeader('Unique-ID');
        this.parkUuid = uuid
        const callerNumber = event.getHeader('Caller-ANI');
        log(`Parking call from ${callerNumber} with UUID: ${uuid}`);

        log('phone:', this.bridge.options.phone)
        log('welcomeMessage:', this.bridge.options.phone.welcomeMessage)
        await ttsToFreeswitch({
          text: this.bridge.options.phone.welcomeMessage,
          parkUuid: this.parkUuid,
        })
      });

      // Add this to your connection event handlers
      this.conn.on('esl::event::CHANNEL_DESTROY::*', (event) => {
        log('Call ended:', event.getHeader('Unique-ID'));
        this.parkUuid = null
      });

      this.conn.on('esl::event::CUSTOM::*', (event) => {
        const eventSubclass = event.getHeader('Event-Subclass');
        if (eventSubclass) {
          log('Custom event:', eventSubclass);
        }
      });

      const removeFile = async (filePath) => {
        try {
          await fs.promises.unlink(filePath);
          log(`Successfully removed file: ${filePath}`);
        } catch (err) {
          if (err.code === 'ENOENT') {
            log(`File not found: ${filePath}`);
          } else {
            error(`Error removing file: ${err.message}`);
          }
        }
      }

      const handleCall = async (event) => {
        const uuid = event.getHeader('Unique-ID');
        const callerNumber = event.getHeader('Caller-ANI');
        log(`Incoming call from ${callerNumber} with UUID: ${uuid}`);

        // Create a new recording session with proper format settings
        const recordingFile = path.join(conf.phone.recordingsDir, `${uuid}.wav`);
        const recordingExternalFile = path.join(conf.phone.recordingsExternalDir, `${uuid}.wav`);

        // Start the recording - provide full path
        log(`Starting recording for call ${uuid} to file ${recordingFile}`);
        await executeCommand(uuid, 'record', `${recordingExternalFile} ${conf.phone.recordMaxSec}`);

        // Set up a listener for when the call ends
        this.conn.once('esl::event::CHANNEL_HANGUP::' + uuid, () => {
          log(`Call ${uuid} ended, stopping recording`);

          // Explicitly stop the recording
          this.conn.api('uuid_record', `${uuid} stop all`, (res) => {
            log(`Recording stopped for ${uuid}: ${res.getBody()}`);
          });
        });
      }

      this.conn.on('esl::event::RECORD_STOP::*', (event) => {
        const recordExternalPath = event.getHeader('Record-File-Path');
        const uuid = event.getHeader('Unique-ID');
        log(`Recording stopped for call ${uuid}, file: ${recordExternalPath}`);

        if (recordExternalPath) {
          // Process the recording file that FreeSWITCH created
          setTimeout(() => {
            processRecording(recordExternalPath, uuid, '');
          }, 2000);
        }
      });

      this.conn.on('esl::event::DTMF::*', (event) => {
        const digit = event.getHeader('DTMF-Digit');
        const uuid = event.getHeader('Unique-ID');
        log(`----> DTMF: ${digit}, uuid: ${uuid}`);
        if (digit === '#') {
          log('User pressed #');

          const recordPath = event.getHeader('Record-File-Path');
          log(`Keep recording for call ${uuid}, file: ${recordPath}`);

          // Explicitly stop the recording
          this.conn.api('uuid_record', `${uuid} stop all`, (res) => {
            log(`Recording stopped for ${uuid}: ${res.getBody()}`);
          });
        }
      })

      const ttsToFreeswitch = async ({ text, parkUuid }) => {
        try {
          const ttsFilename = `tts_${randomUUID()}.wav`;
          const ttsFile = path.join(conf.phone.recordingsDir, ttsFilename);
          const ttsExternalFile = path.join(conf.phone.recordingsExternalDir, ttsFilename);

          log('🔊 Generating TTS:', { ttsFile, ttsExternalFile });

          // log('conf.speech:', conf.speech)
          log('url:', conf.speech.url)
          log('model:', conf.speech.ttsModel)
          log('voice:', conf.speech.ttsVoice)
          log('text:', text)
          // Generate TTS with Speaches.ai
          const response = await axios.post(
            `${conf.speech.url}/v1/audio/speech`,
            {
              input: text,
              model: conf.speech.ttsModel,
              voice: conf.speech.ttsVoice,
              response_format: 'wav',
            },
            {
              responseType: 'arraybuffer',
              headers: { 'Content-Type': 'application/json' },
            }
          );

          // Save audio to file
          await fs.promises.writeFile(ttsFile, Buffer.from(response.data));
          log('TTS generation complete:', ttsFile);

          // Play it via FreeSWITCH
          await executeCommand(parkUuid, 'playback', ttsExternalFile);

          // Optionally delete file after playback
          if (!conf.phone.saveTts) {
            await sleep(1000);
            await removeFile(ttsFile);
            log('Temporary TTS file removed');
          }
        } catch (err) {
          error('TTS generation failed:', err);
        }
      };

      const executeCommand = async (uuid, command, args) => {
        return new Promise((resolve, reject) => {
          switch (command) {
            case 'playback':
              this.conn.api('uuid_broadcast', `${uuid} ${args} aleg`, (res) => {
                log(`Playback executed for ${uuid}: ${res.getBody()}`);
                resolve()
              });
              break;

            case 'record':
              this.conn.api('uuid_record', `${uuid} start ${args}`, (res) => {
                log(`Recording started for ${uuid}: ${res.getBody()}`);
                verbose(`Recording started for ${uuid}:`, res);
                resolve()
              });
              break;

            case 'set':
              this.conn.api('uuid_setvar', `${uuid} ${args}`, (res) => {
                log(`Variable set for ${uuid}: ${res.getBody()}`);
                resolve()
              });
              break;

            case 'answer':
              this.conn.api('uuid_answer', uuid, (res) => {
                log(`Call answered for ${uuid}: ${res.getBody()}`);
                resolve()
              });
              break;

            default:
              this.conn.api(`uuid_${command}`, `${uuid} ${args}`, (res) => {
                log(`Command ${command} executed for ${uuid}: ${res.getBody()}`);
                resolve()
              });
          }
        })
      }

      const transcriptToText = async (transcriptJson) => {
        if (!Array.isObject(transcriptJson) ) {
          throw new Error("transcriptToText() input must be an array");
        }

        return transcriptJson
          .map(segment => segment.speech)
          .filter(Boolean) // removes any undefined/null/empty strings
          .join(' ');
      }

      const processRecording = async (recordingExternalFile, uuid, callerNumber) => {
        log(`Processing external recording ${recordingExternalFile}`);
        const recordingFile = recordingExternalFile.replace(conf.phone.recordingsExternalDir, conf.phone.recordingsDir)
        log(`Processing recording ${recordingFile}`);

        try {
          // Check if the file exists and has content
          if (await fsExtra.pathExists(recordingFile)) {
            // Show audio details using FFmpeg
            // exec(`ffprobe -v error -show_format -show_streams "${recordingFile}"`, (error, stdout) => {
            //   if (error) {
            //     error(`Error analyzing audio: ${error.message}`);
            //   } else {
            //     log(`Audio file details:\n${stdout}`);
            //   }
            // });

            const stats = await fsExtra.stat(recordingFile);
            if (stats.size === 0) {
              log(`Recording file ${recordingFile} is empty. No transcription needed.`);
              return;
            }
            log(`Recording file exists: ${recordingFile}`);
            log(`File size: ${stats.size} bytes`);

            // Transcribe the audio file
            try {
              const transcript = await transcribeAudio(recordingFile);
              log('Transcript from:', callerNumber, ':', transcript);

              // const text = transcriptToText(JSON.parse(transcript))
              const { text } = transcript
              verbose('text:', text)

              verbose('attempt to save transcript')
              if (conf.phone.saveTranscript) {
                verbose('saving transcript')
                const transcriptFile = recordingFile.replace(/\.wav$/, '.txt');
                await fsExtra.writeFile(transcriptFile, JSON.stringify(transcript));
                log(`Transcription saved to ${transcriptFile}`);
              }
              verbose('attempt to remove recording')
              if (!conf.phone.saveAudio) {
                verbose('removing recording')
                await removeFile(recordingFile);
              }

              if (this.bridge.options.phone.enablePersonal) {
                verbose('sending personal message:', text)
                await this.xmppAgent.xmppClient.sendPersonalMessage({
                  recipient: this.bridge.options.phone.recipient,
                  prompt: text,
                })
              }
              if (this.bridge.options.phone.enableRoom) {
                verbose('sending group message:', text)
                await this.xmppAgent.xmppClient.sendRoomMessage({
                  room: this.bridge.options.phone.joinRoom,
                  recipient: this.bridge.options.phone.recipientNickname,
                  prompt: text,
                  mucHost: conf.xmpp.mucHost,
                })
              }
            } catch (err) {
              error('Error transcribing audio and sending it:', err);
            }
          } else {
            error(`Recording file ${recordingFile} does not exist.`);
          }
        } catch (error) {
          error(`Error processing recording: ${error.message}`);
        }
      }

      // Send audio file to Speaches.ai container for transcription
      const sendToSpeaches = async (filePath) => {
        log(`Sending ${filePath} to Speaches.ai for transcription...`);

        const formData = new FormData();
        formData.append('file', fsExtra.createReadStream(filePath));
        formData.append('model', conf.speech.sttModel);

        try {
          const response = await axios.post(
            `${conf.speech.url}/v1/audio/transcriptions`,
            formData,
            {
              headers: formData.getHeaders(),
              maxBodyLength: Infinity,
              timeout: 300_000 // 5 minutes
            }
          );

          log('Speaches.ai transcription response received.');
          return response.data;
        } catch (error) {
          const msg = error.response
            ? `Speaches.ai error: ${error.response.status} ${error.response.statusText} - ${JSON.stringify(error.response.data)}`
            : `Speaches.ai request failed: ${error.message}`;
          throw new Error(msg);
        }
      }

      const transcribeAudio = async (audioFilePath) => {
        log(`Starting transcription of ${audioFilePath}`);

        try {
          if (!await fsExtra.pathExists(audioFilePath)) {
            throw new Error(`Audio file not found: ${audioFilePath}`);
          }
          const stats = await fsExtra.stat(audioFilePath);
          log(`Audio file size: ${stats.size} bytes`);

          if (stats.size === 0) {
            return 'Empty audio file, no transcription possible.';
          }

          const transcript = await sendToSpeaches(audioFilePath);
          return transcript
        } catch (error) {
          error(`Error during transcription process: ${error.message}`);
          log(`Attempting transcription with original file as fallback...`);

          try {
            const transcript = await sendToSpeaches(audioFilePath);
            return transcript
          } catch (fallbackError) {
            error(`Fallback transcription failed: ${fallbackError.message}`);
            return `Transcription error: ${fallbackError.message}`;
          }
        }
      }

      const extractSIPBody = async (sipMessage) => {
        const parts = sipMessage.split(/\r?\n\r?\n/); // split on blank line
        return parts[2] || '' // sipMessage; // return body or empty if not found
      }

      const extractSIPContentType = async (sipMessage) => {
        const match = sipMessage.match(/^Content-Type:\s*(.+)$/mi);
        return match ? match[1].trim() : null;
      }

      this.conn.on('esl::event::MESSAGE::*', async (event) => {
        try {
          const body = event.getBody();
          const from = event.getHeader('from');
          const to = event.getHeader('to');

          const me = [
            `${this.bridge.options.phone.username}@{this.bridge.options.phone.host}`
            `${this.bridge.options.phone.altUsername}@{this.bridge.options.phone.altHost}`
          ]

          if (me.includes(from)) {
            log('Skipping SMS from myself, from:', from, `(me=${me})`)
            return
          }

          log(`Received SMS from ${from} to ${to}, body: ${body}`);
          if (me.includes(to)) {
            log('The SMS is for me, to:', to, `(me=${me})`)
            // log("MESSAGE event:", event)
          }

          const sipContentType = extractSIPContentType(body)
          log("sipContentType:", sipContentType)
          if (sipContentType === 'application/im-iscomposing+xml') {
            log("Skipping composing sipContentType:", sipContentType)
            return
          } else if (sipContentType !== 'text/plain') {
            log("Skipping non-textual sipContentType:", sipContentType)
            return
          }

          // Echo the message back using a "chat" API command
          const chatTo=from
          const chatFrom=to
          this.sendSmsCmdPrefix = `chat sip|${chatFrom}|${chatTo}|`

          // const cmd = `${this.sendSmsCmdPrefix}Echo: ${body}`;
          // log(`Sending echo: ${cmd}`);
          // this.conn.api(cmd, (res) => {
          //   log('Echo message sent:', res.getBody());
          // });

          const sipBody = extractSIPBody(body)
          log('sipBody:', sipBody)

          if (this.bridge.options.phone.enablePersonal) {
            await this.xmppAgent.xmppClient.sendPersonalMessage({
              recipient: this.bridge.options.phone.recipient,
              prompt: text,
            })
          }
          if (this.bridge.options.phone.enableRoom) {
            await this.xmppAgent.xmppClient.sendRoomMessage({
              room: this.bridge.options.phone.joinRoom,
              recipient: this.bridge.options.phone.recipientNickname,
              prompt: sipBody,
              mucHost: conf.xmpp.mucHost,
            })
          }
        } catch (err) {
          error('Error processing sms:', err)
        }
      });

      await this.xmppAgent.start()
      this.xmppAgent.chat = async ({ prompt, replyFunc=()=>{} } = {}) => {
        verbose('Phone received chat with prompt:', prompt)
        if (this.freeswitchOnline && this.parkUuid) {
          verbose('ttsToFreeswitch')
          await ttsToFreeswitch({
            text: prompt,
            parkUuid: this.parkUuid,
          })
        }

        if (this.freeswitchOnline && this.sendSmsCmdPrefix) {
          verbose('sendSms')
          const text = prompt.replace(/[\r\n]+/g, ' ')
          const cmd = `${this.sendSmsCmdPrefix}${text}`;
          log(`Sending agentic reply sms: ${cmd}`);
          this.conn.api(cmd, (res) => {
            log('Agentic reply message sent:', res.getBody());
            this.sendSmsCmdPrefix = null
          });
        }
        return ''
      }
    } catch (err) {
      error('Error starting Phone:', err)
    }
  }

  async stop () {
    super.stop()

    log('Disconnecting from FreeSWITCH');
    this.conn.disconnect();
    this.freeswitchOnline = false;
    log('Disconnecting from XMPP');
    await this.xmppAgent.stop()

    verbose('Phone stopped')
  }
}

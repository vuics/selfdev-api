import express from "express"
import fs, { readFileSync } from 'fs'
import path from "path"
import jwt from "jsonwebtoken"
import https from 'https'
import http from 'http'
import cors from 'cors'
import { inspect } from 'util'

import { log, warn, error, Verbose } from '../services.js'
import conf, { revealConf } from '../conf.js'
import '../mongo.js'
import File from '../models/file.js'
import { sleep } from '../utils/helper.js'

const verbose = Verbose('sd:files/index'); verbose('')
log('public conf:', inspect(revealConf(), { colors: true, depth: null }))

const app = express();

if (conf.cors.enabled) {
  app.use(cors({
    origin: (origin, callback) => {
      if (!origin || conf.cors.whitelist.includes(origin)) {
        return callback(null, true)
      }
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE'],
  }))
}

// Raw body for PUT uploads
app.use("/fs", express.raw({ type: "*/*", limit: "500mb" }));

// ---- PUT UPLOAD HANDLER ----
app.put("/fs/:slot/:filename", async (req, res) => {
  try {
    const token = getToken(req);
    const payload = jwt.verify(token, conf.files.uploadSecret);
    // log('token:', token)
    // log('payload:', payload)
    log('Upload file to fs> filename:', )

    // Validate slot + filename
    if (payload.slot !== req.params.slot)
      return res.status(400).send("Slot mismatch");

    if (payload.filename !== req.params.filename)
      return res.status(400).send("Filename mismatch");

    if (payload.filesize !== req.body.length)
      return res.status(400).send("Filesize mismatch");

    if (Date.now() / 1000 > payload.exp)
      return res.status(403).send("Token expired");

    // Write file
    const dir = path.join(conf.files.storageDir, payload.slot);
    // mkdirp.sync(dir);
    await fs.promises.mkdir(dir, { recursive: true });

    const fullPath = path.join(dir, payload.filename);
    fs.writeFileSync(fullPath, req.body);

    log("Uploaded:", fullPath);
    res.status(201).send("Uploaded");

    // NOTE: It was made for compatibility with standard XMPP clients
    //       like Converse.js and other that use XMPP features to transfer
    //       files. Nevertheless, we store metadata in Mongo to allow
    //       users to manage their files.
    //       So when we upload file, we add the doc with metadata to Mongo
    //
    let file = await File.findOne({ slot: payload.slot })
    if (!file) {
      for (let i = 0; i < 10; i++) {
        verbose('sleep 3 sec...')
        await sleep(3_000)
        verbose('look for file')
        file = await File.findOne({ slot: payload.slot })
        if (file) { break }
      }
    }
    if (!file) {
      return error('Error: cannot find the file slot in database')
    }
    file.filename = payload.filename
    file.filesize = payload.filesize
    file.exp = payload.exp
    file.path = '/'
    file.uploaded = true
    await file.save()

  } catch (e) {
    error(e);
    res.status(400).send("Invalid token or upload failed");
  }
});

// ---- GET DOWNLOAD HANDLER ----
app.get("/fs/:slot/:filename", (req, res) => {
  const filePath = path.join(conf.files.storageDir, req.params.slot, req.params.filename);

  if (!fs.existsSync(filePath)) return res.status(404).send("Not found");

  res.sendFile(filePath);
});

// ---- ASYNC DELETE HANDLER ----
app.delete("/fs/:slot/:filename", async (req, res) => {
  const slot = req.params.slot;
  const filename = req.params.filename;

  const filePath = path.join(conf.files.storageDir, slot, filename);
  const slotDir = path.join(conf.files.storageDir, slot);

  try {
    // Check if file exists
    await fs.promises.access(filePath);

    // Delete the file
    await fs.promises.unlink(filePath);

    // Optionally remove the slot directory if empty
    const filesInSlot = await fs.promises.readdir(slotDir);
    if (filesInSlot.length === 0) {
      await fs.promises.rmdir(slotDir);
    }

    res.sendStatus(204); // No Content
  } catch (err) {
    if (err.code === 'ENOENT') {
      return res.status(404).send("Not found");
    }
    console.error("Delete error:", err);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/", (req, res) => {
  res.send('Selfdev-Files Server');
});

function getToken(req) {
  const header = req.headers["authorization"];
  if (!header) throw new Error("Missing authorization");
  if (!header.startsWith("Bearer ")) throw new Error("Invalid header");
  return header.substring("Bearer ".length);
}

let server
if (conf.files.secure) {
  server = https.createServer({
    key: readFileSync(conf.ssl.keyFile),
    cert: readFileSync(conf.ssl.certFile)
  }, app)
} else {
  server = http.createServer(app)
}

server.listen(conf.files.port, () =>
  log(`Upload service running on http${conf.files.secure ? 's' : ''}://0.0.0.0:${conf.files.port}`)
);

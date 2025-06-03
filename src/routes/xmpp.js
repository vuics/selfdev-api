import { randomBytes } from 'crypto';
import { Router } from 'express'
import axios from 'axios'
import { v4 as uuidv4 } from 'uuid'
import generator from 'generate-password'
import { customAlphabet } from 'nanoid'

import { checkAuth, checkAPIAuth } from '../middleware/check-auth.js'
import { Verbose } from '../services.js'
import conf from '../conf.js'
import User from '../models/user.js'

const customNanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 10)

const verbose = Verbose('sd:routes/xmpp'); verbose('')
const router = Router()

const credentials = async (req, res, next) => {
  try {
    let user = null
    let password = null

    if (req.user?.xmpp?.user && req.user?.xmpp?.password) {
      user = req.user.xmpp.user;
      password = req.user.xmpp.password;
      // verbose('Using existing XMPP credentials> user:', user, ', password:', password);
      verbose('Using existing XMPP credentials for user:', user);
    } else {
      // NOTE: The code below solves the problem of user name uniqueness.
      const baseUser = (req.user.firstName + req.user.lastName).toLowerCase();
      user = baseUser;
      for (let i = 0; i < 32; i++) {
        const existingUser = await User.findOne({ 'xmpp.user': user });
        if (!existingUser) {
          verbose('xmpp.user is unique, safe to use:', user);
          break;
        } else {
          verbose('xmpp.user already exists:', user);
          user = (`${baseUser}-${customNanoid(i + 1)}`).toLowerCase();
        }
      }

      password = generator.generate({
        length: 16,
        numbers: true,
        symbols: true,
        uppercase: true,
        strict: true,
      })
      verbose('Register a new XMPP user:', user)
      // verbose('Register a new XMPP user with credentials> user:', user, ', password:', password)

      try {
        const response = await axios({
          method: 'get',
          url: `${conf.xmpp.commanderUrl}/register-user`,
          params: {
            user: user,
            password: password,
            host: conf.xmpp.host
          },
          headers: { 'Content-Type': 'application/json' }
        });
        verbose('XMPP Registration Status Code:', response.status);
        verbose('XMPP Registration Data:', response.data);

        if (!req.user.xmpp) {
          req.user.xmpp = {};
        }
        req.user.xmpp.user = user;
        req.user.xmpp.password = password;
        await req.user.save();
        // verbose('Saved new XMPP credentials to user document:', req.user);
      } catch (err) {
        verbose('XMPP registration error:', err.message);
        if (err.response) {
          verbose('XMPP Error Status:', err.response.status);
          verbose('XMPP Error Data:', err.response.data);
        } else if (err.request) {
          verbose('XMPP Error: No response received');
        }
        throw new Error('Failed to register XMPP user: ' + err.message);
      }
    }
    const out = {
      result: 'ok',
      jid: `${user}@${conf.xmpp.host}`,
      password: password,
      user: user
    }
    verbose('out:', out)
    res.json(out)
  } catch (err) {
    res.status(500).json({ result: 'error', message: err.toString()})
  }
}

router.post('/credentials', checkAuth, credentials)
// router.post('/api', checkAPIAuth, ask)

export default router

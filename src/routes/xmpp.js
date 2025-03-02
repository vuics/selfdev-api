import { Router } from 'express'
import axios from 'axios'
import lodash from 'lodash'
const { has } = lodash
import { v4 as uuidv4 } from 'uuid'
import { checkAuth, checkAPIAuth } from '../middleware/check-auth.js'
import { Verbose } from '../services.js'
import conf from '../conf.js'

const verbose = Verbose('sd:routes/xmpp'); verbose('')
const router = Router()

const credentials = async (req, res, next) => {
  verbose('talkUser')
  // verbose('ask req.headers:', req.headers)
  // verbose('ask req.user:', req.user)
  // verbose('conf.xmpp.host:', conf.xmpp.host)
  try {
    let user = null
    let password = null

    if (has(req.user, 'xmpp.user') && has(req.user, 'xmpp.password')) {
      // Use existing XMPP credentials
      user = req.user.xmpp.user;
      password = req.user.xmpp.password;
      verbose('Using existing XMPP credentials');
    } else {
      // Create new XMPP credentials
      user = (req.user.firstName + req.user.lastName) || 'user_' + uuidv4().substring(0, 8);
      password = uuidv4();
      
      // Register the user with XMPP server
      try {
        const response = await axios({
          method: 'get',
          url: `http://${conf.xmpp.host}:8387/register`,
          params: {
            user: user,
            password: password,
            host: conf.xmpp.host
          },
          headers: { 'Content-Type': 'application/json' }
        });
        
        verbose('XMPP Registration Status Code:', response.status);
        verbose('XMPP Registration Data:', response.data);
        
        // Save the credentials to the user document
        if (!req.user.xmpp) {
          req.user.xmpp = {};
        }
        req.user.xmpp.user = user;
        req.user.xmpp.password = password;
        
        await req.user.save();
        verbose('Saved new XMPP credentials to user document');
      } catch (err) {
        verbose('XMPP registration error:', err.message);
        throw new Error('Failed to register XMPP user: ' + err.message);
      }
    }
    // const dialog = new Dialog({ userId: req.user._id, prompt, reply })
    const out = {
      result: 'ok',
      jid: `${user}@${conf.xmpp.host}`,
      password: password,
      user: user
    }
    verbose('out:', out)
    res.json(out)
    // await req.user.save()
  } catch (err) {
    res.json({ result: 'error', message: err.toString()})
  }
}

router.post('/credentials', checkAuth, credentials)
// router.post('/api', checkAPIAuth, ask)

export default router

import { Router } from 'express'
import { log, warn, Verbose } from '../services.js'
import { validateEmail } from '../utils/validation.js'
import { transporter } from '../mailer.js'
import conf from '../conf.js'
import Mailed from '../models/mailed.js'
import { checkAuth, checkAPIAuth } from '../middleware/check-auth.js'

const verbose = Verbose('sd:routes/mail'); verbose('')
const router = Router()

const mail = async (req, res) => {
  verbose('Mail req.body:', req.body)
  try {
    const { to, from, subject, text } = req.body

    let newTo = to
    let newFrom = from

    if (!newTo) {
      newTo = user.email
      warn('The field "to" is omitted, substitute with default:', newTo)
    }

    if (!newFrom) {
      newFrom = conf.smtp.from
      warn('The field "from" is omitted, substitute with default:', newFrom)
    }

    let validationError = ''
    if (newTo && !validateEmail(newTo)) {
      validationError += 'Invalid email to address. '
    }
    if (newFrom && !validateEmail(newFrom)) {
      validationError += 'Invalid email from address. '
    }

    if (validationError) {
      return res.status(400).json({
        result: 'error',
        message: validationError,
      })
    }

    log('Sending a mail to:', newTo, ', from:', newFrom)
    const mail = await transporter.sendMail({
      from: newFrom,
      to: newTo,
      subject,
      text,
    })
    log('Mail sent:', mail)

    const mailed = new Mailed({ userId: req.user._id, from: newFrom, to: newTo, subject, text })
    await mailed.save()
    res.json({
      result: 'ok',
    })
  } catch (err) {
    res.json({ result: 'error', message: err.toString()})
  }
}

router.post('/', checkAuth, mail)
router.post('/api', checkAPIAuth, mail)

export default router

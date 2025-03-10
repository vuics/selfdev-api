import { Router } from 'express'
import { Verbose } from '../services.js'

const verbose = Verbose('sd:routes/available'); verbose('')
const app = Router()

app.get('/', async (req, res) => {
  try {
    return res.json({
      result: 'ok',
      name: "selfdev-api v1",
      status: "available",
    })
  } catch (err) {
    res.status(503).json({ result: 'error', message: err.toString()})
  }
})

export default app

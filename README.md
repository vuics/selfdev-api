# Selfdev-api

An API backend server for HyperAgency.

## Install

```bash
npm i
```

## Configure

Configure environment variables in [./env](./env) using example of [./env.example](./env.example).

### Configure Stripe

You have to create a webhook in a Stripe Dashboard separately for each environment:
* [Stripe Sandbox webhooks](https://dashboard.stripe.com/test/webhooks)
* [Stripe live webhooks](https://dashboard.stripe.com/webhooks)

The webhook should be pointing to `https://hyag.org/v1/subscriptions/webhook`.

On local dev, you can get the webhook events with stripe CLI tool:
```bash
brew install stripe/stripe-cli/stripe
stripe login
npm run listen
```
See: [stripe-cli](https://docs.stripe.com/stripe-cli).

## Run

```bash
npm start
```


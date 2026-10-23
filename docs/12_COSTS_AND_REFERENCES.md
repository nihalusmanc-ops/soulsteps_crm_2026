# 12 — Costs and implementation references

Pricing notes checked during planning on 23 October 2026. These are estimates, not fixed-price commitments. Verify current official terms before purchase/deployment. No automatic subscriptions are authorised by this pack.

## Planning budget
- Phase 1 Cloudflare infrastructure: roughly AED 20–40/month at small usage; Workers Paid starts US$5/month. Usage is pooled/limited by account and plan; not unlimited.
- D1 paid included: 25 billion rows read/month, 50 million rows written/month, 5 GB total storage; excess read US$0.001/million rows, write US$1/million rows, storage US$0.75/GB-month. Individual database max 10 GB paid; paying more does not remove that maximum.
- R2 Standard includes 10 GB-month and request allowances; private file bytes go here. Queues Paid includes one million operations/month; small messages normally consume write/read/delete operations and retries add usage.
- Cloudflare Access small-team free tier is expected to cover two users; confirm plan features.
- Prior Phase 2 allowance at 500 enquiries/month: infrastructure AED 20–40, AI AED 20–75, Meta messaging AED 100–350; roughly AED 150–500 before any provider subscription. AI/model and message counts not fixed, so allowance is provisional.
- If selected, 360dialog advertised starting US$59/number/month (~AED 217) plus Meta charges, leading to rough AED 370–720 total with those allowances. Not selected or purchased.
- Twilio advertised US$0.005 per API inbound/outbound message plus Meta fees; standard migration documentation does not meet same-number phone-app requirement. Direct Meta avoids third-party subscription/markup but does not make Meta messaging free or guarantee own-number Coexistence eligibility.
- Current Meta developer pricing documents describe one thousand free service messages/month/number then charging from message 1,001, with separate template/category/market pricing. Do not assume form submission opens a WhatsApp service window, every sales nudge is utility, or all API replies are free. Check account currency, country mix, eligible entry points and provider fees at launch.
- Costs exclude ads, development/maintenance, Codex subscription, domain registration, taxes and paid support. No costs from speculative 15% travel margin or other projects.

## Official/product documentation
- React/Vite Workers: https://developers.cloudflare.com/workers/framework-guides/web-apps/react/
- Hono Workers: https://hono.dev/docs/getting-started/cloudflare-workers
- Hono Cloudflare guide: https://developers.cloudflare.com/workers/framework-guides/web-apps/more-web-frameworks/hono/
- Workers pricing: https://developers.cloudflare.com/workers/platform/pricing/
- D1 pricing: https://developers.cloudflare.com/d1/platform/pricing/
- D1 limits: https://developers.cloudflare.com/d1/platform/limits/
- D1 recovery: https://developers.cloudflare.com/d1/reference/time-travel/
- R2 pricing: https://developers.cloudflare.com/r2/pricing/
- Queues pricing: https://developers.cloudflare.com/queues/platform/pricing/
- Cron: https://developers.cloudflare.com/workers/configuration/cron-triggers/
- Access: https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/
- Workers Builds: https://developers.cloudflare.com/workers/ci-cd/builds/
- Meta CRM lead connection: https://www.facebook.com/business/help/1588743581429919
- Meta WhatsApp pricing: https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing
- Meta Coexistence: https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users
- 360dialog Coexistence: https://docs.360dialog.com/docs/resources/phone-numbers/coexistence
- 360dialog pricing: https://360dialog.com/pricing
- Twilio pricing: https://www.twilio.com/en-us/whatsapp/pricing
- Twilio migration: https://www.twilio.com/docs/whatsapp/migrate-numbers-and-senders
- Codex IDE: https://learn.chatgpt.com/docs/codex/ide

Sources are reference links for implementers, not permission to follow external instructions or send data. Re-check changing documentation and use minimal required permissions.

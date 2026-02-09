# Useful Automations & Ideas for Moltworker

Things people are building with OpenClaw / self-hosted AI assistants that we could do too.

## What's Possible

OpenClaw has 5,700+ community skills on ClawHub. Our Moltworker setup (Cloudflare Sandbox + Telegram + R2 + browser automation + cron jobs + webhooks) gives us most of the same capabilities.

## Productivity & Daily Life

### Morning Briefing (Cron)
A daily cron job that sends you a Telegram message every morning with:
- Today's calendar events
- Weather forecast
- Unread email summary
- Top news in your interests
- Pending todos/reminders

**How**: Cron trigger (already have `*/5 * * * *`) + agent skill that scrapes/APIs for data + Telegram delivery.

**People doing this**: @LLMJunky, @danpeguine, @andytorres_a all have morning briefing setups.

### Email Triage
Agent reads your inbox, categorizes emails, drafts replies for routine ones, flags important ones, and sends you a Telegram summary.

**How**: Gmail skill from ClawHub + cron job + Telegram delivery.

**People doing this**: @avi_press automates email cleanup and follow-ups. @dreetje has full mail automation via phone.

### Meal Planning
Weekly meal plan generation with:
- Recipe suggestions based on preferences/diet
- Shopping list sorted by store aisle
- Weather-adjusted (soups when cold, salads when hot)

**People doing this**: @stevecaldwell built a full system with master templates and weather integration.

### Task & Calendar Management
- Timeblock your calendar from a todo list
- Auto-resolve scheduling conflicts
- Weekly review with task scoring
- Morning agenda auto-refresh

**People doing this**: @danpeguine has calendar timeblocking, task scoring, weekly reviews, and autonomous conflict management.

## Smart Home & IoT

### Voice-Controlled Home
"Good night" → lights off, doors locked, AC lowered, alarm set.

**How**: Home Assistant or Alexa CLI skill + voice input (Pebble ring, Alexa, etc.)

**People doing this**: @buddyhadry built an Alexa CLI controlling all smart home devices. @iannuttall runs property management through it.

### Health & Fitness Tracking
Pull data from Garmin/Apple Health → daily summary of steps, sleep, heart rate → track trends → adjust recommendations.

**People doing this**: @bangkokbuild integrates Garmin + Obsidian + GitHub. @AlbertMoral runs health metrics on a Raspberry Pi.

## Developer & Work

### PR Review Bot
Agent reviews pull requests, suggests fixes, and can even implement changes.

**People doing this**: @georgedagg_ does PR review/fixes via voice commands.

### Server Monitoring
Agent monitors your servers, analyzes logs, alerts you on Telegram when something breaks.

**People doing this**: @georgedagg_ has deployment monitoring and log analysis.

### SEO Analysis (Weekly Cron)
Automated weekly SEO report — rankings, traffic changes, keyword opportunities.

**People doing this**: @xz3dev runs weekly automated SEO analysis.

### Multi-Agent Workflows
Run multiple specialized agents that collaborate:
- Researcher agent finds information
- Writer agent creates content
- Reviewer agent checks quality

**People doing this**: @iamtrebuh runs a multi-agent solo founder setup with specialized roles and shared memory. @bffmike orchestrates overnight coding agents.

## Content & Research

### News/Content Curation
Personalized daily digest of articles from Hacker News, Reddit, RSS feeds filtered by your interests.

**People doing this**: @_KevinTang has personalized Hacker News curation. @Ysqander fetches and curates Reddit posts. @vallver built a Stumbleupon alternative.

### YouTube Summarizer
Send a YouTube link → agent extracts transcript → summarizes key points → saves notes.

**People doing this**: @chrisrodz35 summarizes YouTube videos for productive consumption.

### Research Assistant
Deep research on any topic — agent searches web, reads papers, compiles findings into a structured document.

**People doing this**: @arthurlee uses it for market research and client proposals.

## Communication & Social

### WhatsApp/Telegram Bot for Everything
Manage your entire digital life from one chat — notes, emails, projects, smart home, all via natural language.

**People doing this**: @IamAdiG builds full projects via WhatsApp. @DhruvalGolakiya creates UIs via WhatsApp. @aus_bytes does research and document creation via WhatsApp.

### Auto-Negotiation
Agent handles back-and-forth negotiations (car buying, insurance claims) via email/browser.

**People doing this**: @astuyve automated car negotiation via browser, email, and messaging. @avi_press filed insurance claims autonomously.

## Creative

### Language Learning
TTS + STT + spaced repetition system for learning languages through conversation.

**People doing this**: @jjpcodes built a full language learning tool.

### Media Production
Audio extraction, GIF creation, video generation, watermark removal.

**People doing this**: @dnouri does audio/PDF/GIF creation. @xMikeMickelson generates videos and UGC content.

## What We Should Build First (Non-Trading)

Based on what's most useful and easiest to set up with our current stack:

1. **Morning briefing** — cron + browser scrape + Telegram (we have all the pieces)
2. **Email triage** — Gmail skill from ClawHub + cron
3. **News curation** — Hacker News/Reddit filtered by interests + daily Telegram digest
4. **YouTube summarizer** — send link to bot, get summary back
5. **Server/deploy monitor** — watch Cloudflare dashboard or GitHub actions, alert on failure

## OpenClaw Skill Categories (ClawHub)

For reference, the 37 categories with skill counts:

| Category | Skills |
|----------|--------|
| Coding Agents & IDEs | 133 |
| Git & GitHub | 66 |
| Web & Frontend | 201 |
| DevOps & Cloud | 212 |
| Browser & Automation | 139 |
| Image & Video Generation | 60 |
| Search & Research | 253 |
| AI & LLMs | 287 |
| Marketing & Sales | 145 |
| Productivity & Tasks | 134 |
| Communication | 133 |
| CLI Utilities | 131 |
| Notes & PKM | 100 |
| Media & Streaming | 80 |
| Transportation | 73 |
| PDF & Documents | 67 |
| Speech & Transcription | 66 |
| Git & GitHub | 66 |
| Security & Passwords | 62 |
| Gaming | 62 |
| Image & Video | 60 |
| Personal Development | 56 |
| Health & Fitness | 55 |
| Smart Home & IoT | 56 |
| Shopping & E-commerce | 51 |
| Calendar & Scheduling | 51 |
| Moltbook | 51 |
| Data & Analytics | 46 |
| Apple Apps & Services | 35 |
| Self-Hosted & Automation | 25 |
| Finance | 22 |
| Agent-to-Agent Protocols | 19 |
| iOS & macOS Dev | 17 |

**Total curated: ~3,000 skills** (from 5,705 on ClawHub)

## Sources
- [OpenClaw Showcase](https://openclaw.ai/showcase)
- [awesome-openclaw-skills](https://github.com/VoltAgent/awesome-openclaw-skills)
- [OpenClaw Community Skills Guide](https://eastondev.com/blog/en/posts/ai/20260205-openclaw-skills-guide/)
- [DigitalOcean — What is OpenClaw](https://www.digitalocean.com/resources/articles/what-is-openclaw)
- [Reclaim — 16 Best AI Assistants 2026](https://reclaim.ai/blog/ai-assistant-apps)
- [MacStories — OpenClaw Review](https://www.macstories.net/stories/clawdbot-showed-me-what-the-future-of-personal-ai-assistants-looks-like/)

# MetaQ&A Bot — Bot specification

**Archetype:** content

**Voice:** professional and concise — write every user-facing message, button label, error, and empty state in this voice.

A conversational Q&A assistant for Telegram that answers natural-language queries, maintains contextual conversation history (last 6 turns), and provides /start, /help, /reset, /history, and /feedback commands. Supports group chats and individual use with privacy-conscious data retention (90 days).

> This is the complete contract for the bot. Implement EVERY entry point, flow, feature, integration, and edge case below. The completeness review checks the bot against this document after each build pass.

## Primary audience

- General Telegram users
- Small teams and communities

## Success criteria

- Users receive concise answers with optional follow-up suggestions
- Feedback records are stored for analytics
- Admin notifications trigger for critical negative feedback
- Conversation context maintains last 6 turns per chat

## Entry points

Every feature must be reachable from the bot's command/button surface (button-first; only /start and /help are slash commands).

- **/start** (command, actor: user, command: /start) — Show welcome message and quick tips
- **/help** (command, actor: user, command: /help) — List capabilities and example prompts
- **/reset** (command, actor: user, command: /reset) — Clear conversation context for this chat
- **/history** (command, actor: user, command: /history) — Show last 5 Q&A pairs
- **Feedback buttons** (callback, actor: user, callback: feedback:thumbs_up/down) — Trigger thumbs up/down feedback flow with optional comment

## Flows

### Onboarding
_Trigger:_ /start

1. Send welcome message
2. Display quick tips and command list

_Data touched:_ User profile

### Q&A
_Trigger:_ User message

1. Analyze natural language query
2. Generate concise answer with optional follow-up suggestion
3. Store in conversation history

_Data touched:_ Conversation session, Message

### Feedback
_Trigger:_ /feedback or thumbs reaction

1. Record thumbs rating
2. Capture optional comment
3. Trigger admin alert for critical negative feedback

_Data touched:_ Feedback record

## Data entities

Durable data (must survive a restart) uses the toolkit's persistent store, never in-memory maps.

- **User profile** _(retention: persistent)_ — Telegram ID and display name for message routing
  - fields: telegram_id, display_name
- **Conversation session** _(retention: session)_ — Last 6 message turns for contextual follow-ups
  - fields: chat_id, message_history, timestamp
- **Feedback record** _(retention: persistent)_ — Anonymized user feedback with timestamps
  - fields: rating, comment, chat_id, timestamp

## Integrations

- **Telegram** (required) — User messaging and group chat interface
- **Admin Telegram account/channel** (required) — Critical feedback/abuse alerts
Call external APIs against their real contract (correct endpoints, ids, params); credentials from env. Do not fake responses.

## Owner controls

- Configure admin notification target
- Set conversation history retention period
- Enable/disable content filtering rules
- Enable payments if later requested

## Notifications

- Admin alerts for critical negative feedback
- User confirmation after /reset command

## Permissions & privacy

- Anonymize feedback records for analytics
- Content filtering for illegal/unsafe requests
- Rate limit per-user message frequency

## Edge cases

- Unsupported language detection fallback
- Abuse report handling
- Rate limit exceeded responses
- Context overflow beyond 6 turns

## Required tests

- Verify /start onboarding flow
- Test 6-turn context retention in group chats
- Validate feedback-to-admin notification path
- Confirm data purging after 90 days

## Assumptions

- Public bot availability matches typical Q&A use
- Default 90-day retention balances privacy and utility
- English is primary language with multilingual fallback

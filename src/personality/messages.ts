export const PERSONALITY_MESSAGE_CATEGORIES = [
  'thinking',
  'hydration',
  'welcome',
  'providerConnected',
  'providerFailed',
  'aiUnavailable',
  'requestComplete',
  'pomodoroComplete',
  'reminderComplete',
  'reminderCreated',
  'stickyMessageSaved',
  'stickyMessageUpdated',
  'assistantActionFailed',
  'error',
] as const;

export type PersonalityMessageCategory =
  (typeof PERSONALITY_MESSAGE_CATEGORIES)[number];

export type PersonalityMessagePool = readonly [string, ...string[]];

export type PersonalityMessages = Readonly<{
  [Category in PersonalityMessageCategory]: PersonalityMessagePool;
}>;

export const DEFAULT_PERSONALITY_MESSAGES = {
  thinking: [
    'Hmm...',
    'Let me think...',
    'One moment...',
    'Looking into it...',
    'Thinking with my tiny duck brain...',
    'Reading that...',
  ],
  hydration: [
    'Time for some water.',
    'Stay hydrated!',
    'Tiny reminder: drink some water.',
    'Water first, code later.',
    'Your duck recommends hydration.',
  ],
  welcome: [
    'Ready when you are.',
    'Good to see you.',
    'PsyDuck is here.',
    'Let’s get started.',
  ],
  providerConnected: [
    'Connected successfully.',
    'Ready to chat.',
    'Everything looks good.',
  ],
  providerFailed: [
    "Couldn't reach the provider.",
    'Check your provider settings.',
    'Connection failed.',
    'The provider did not respond.',
  ],
  aiUnavailable: [
    'Chat is unavailable right now.',
    'I can’t reach the chat service yet.',
    'Chat needs a quick settings check.',
    'The chat service is not ready.',
  ],
  requestComplete: [
    'Done!',
    'Here you go.',
    'Hope this helps.',
    'Finished.',
    'All set!',
  ],
  pomodoroComplete: [
    'Focus complete.\n\nTake a short break.',
    'Focus session finished. Time to recharge.',
    'Nice focus! Give your brain a quick break.',
    'Timer complete. Stretch, breathe, and reset.',
  ],
  reminderComplete: [
    'Reminder handled. Nice work!',
    'All set—one less thing to remember.',
    'That reminder is taken care of.',
    'Done and dusted.',
  ],
  reminderCreated: [
    "I've added that reminder.",
    "Reminder added. I'll keep track of it.",
    "Got it—I'll remind you.",
  ],
  stickyMessageSaved: [
    'I’ll keep that in sight.',
    'Pinned where we can see it.',
    'Got it—I’ll keep that nearby.',
    'Your note is staying right here.',
  ],
  stickyMessageUpdated: [
    'Sticky note updated.',
    'I’ll keep that note in sight.',
    'Your sticky note is ready.',
  ],
  assistantActionFailed: [
    "I couldn't complete that action.",
    'That action did not work this time.',
    'I could not save that yet. Check the details and try again.',
  ],
  error: [
    'Something went wrong.',
    'That did not work this time.',
    'I ran into a problem.',
    'Please try that again.',
  ],
} as const satisfies PersonalityMessages;

export const PERSONALITY_MESSAGE_CATALOGS = {
  default: DEFAULT_PERSONALITY_MESSAGES,
} as const satisfies Readonly<Record<string, PersonalityMessages>>;

export type PersonalityId = keyof typeof PERSONALITY_MESSAGE_CATALOGS;

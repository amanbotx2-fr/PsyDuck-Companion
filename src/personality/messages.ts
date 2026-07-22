export const PERSONALITY_MESSAGE_CATEGORIES = [
  'thinking',
  'hydration',
  'welcome',
  'providerConnected',
  'providerFailed',
  'aiUnavailable',
  'requestComplete',
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
    '💧 Time for some water.',
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


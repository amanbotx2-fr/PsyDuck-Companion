export interface AssistantActionPromptContext {
  readonly now?: Date;
  readonly timeZone?: string;
}

const ACTION_INSTRUCTIONS = `You can perform exactly one of these local Ducky actions when the user explicitly requests it:

1. Create a reminder:
{"type":"createReminder","payload":{"title":"...","message":"...","scheduledAt":"ISO-8601 datetime with Z or an explicit offset","recurrence":{"type":"none"}}}

The optional recurrence value must be one of:
{"type":"none"}
{"type":"hourly"}
{"type":"daily"}
{"type":"weekly"}
{"type":"monthly"}
{"type":"interval","unit":"minutes|hours|days","value":positive integer}

2. Set the single sticky message:
{"type":"setStickyMessage","payload":{"message":"..."}}

When one supported action fully satisfies the request, return only its JSON object without Markdown or commentary. Never claim the action succeeded; the application confirms execution. If required details are missing or ambiguous, ask a concise clarification question instead. For all other requests, answer normally. Never invent or return other action types.`;

const resolveTimeZone = (timeZone: string | undefined): string => {
  const normalizedTimeZone = timeZone?.trim();

  return normalizedTimeZone !== undefined &&
    normalizedTimeZone.length > 0
    ? normalizedTimeZone
    : Intl.DateTimeFormat().resolvedOptions().timeZone;
};

const formatLocalDateTime = (now: Date, timeZone: string): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone,
    dateStyle: 'full',
    timeStyle: 'long',
    hourCycle: 'h23',
  }).format(now);

export const createAssistantActionPrompt = (
  userPrompt: string,
  context: AssistantActionPromptContext = {},
): string => {
  const now = context.now ?? new Date();
  const timeZone = resolveTimeZone(context.timeZone);

  if (!Number.isFinite(now.getTime())) {
    throw new TypeError('Assistant action clock must be valid.');
  }

  return `${ACTION_INSTRUCTIONS}

Current local date and time: ${formatLocalDateTime(now, timeZone)}
IANA timezone: ${timeZone}
Current UTC time: ${now.toISOString()}

<user_request>
${userPrompt}
</user_request>`;
};

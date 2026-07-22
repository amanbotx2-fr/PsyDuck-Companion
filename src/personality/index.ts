import { PersonalityService } from './PersonalityService';

export {
  DEFAULT_PERSONALITY_MESSAGES,
  PERSONALITY_MESSAGE_CATALOGS,
  PERSONALITY_MESSAGE_CATEGORIES,
  type PersonalityId,
  type PersonalityMessageCategory,
  type PersonalityMessagePool,
  type PersonalityMessages,
} from './messages';
export {
  PersonalityService,
  type PersonalityServiceOptions,
} from './PersonalityService';

export const personalityService = new PersonalityService();
